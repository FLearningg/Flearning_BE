const User = require("../models/userModel");
const Token = require("../models/tokenModel");
const InstructorApplication = require("../models/instructorApplicationModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const emailTemplates = require("../utils/emailTemplates");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Internal function to generate tokens
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN }
  );
  const refreshToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN }
  );
  return { accessToken, refreshToken };
};

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, skipEmailVerification } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      userName:
        email.split("@")[0] + "_" + crypto.randomBytes(4).toString("hex"),
    });

    // Only send verification email if not skipped (for instructor registration flow)
    if (!skipEmailVerification) {
      const verificationToken = crypto.randomBytes(32).toString("hex");
      await new Token({ userId: newUser._id, token: verificationToken }).save();
      const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
      const htmlMessage = emailTemplates.studentVerificationEmail(newUser.firstName, verificationUrl);
      await sendEmail(newUser.email, "Email Verification - F-Learning", htmlMessage);
    }

    res.status(201).json({
      message:
        "Registration successful. Please check your email to verify your account.",
      userId: newUser._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Verify user's email
 * @route   GET /api/auth/verify-email/:token
 * @access  Public
 */
exports.verifyEmail = async (req, res) => {
  try {
    const receivedToken = req.params.token;
    console.log("Backend received token from URL:", receivedToken);

    const tokenDocument = await Token.findOne({ token: receivedToken });
    console.log(
      "Token search result in DB (Token.findOne):",
      tokenDocument
    );

    if (!tokenDocument) {
      return res
        .status(400)
        .send(
          "Invalid or expired link (token not found in DB)."
        );
    }

    const user = await User.findById(tokenDocument.userId);
    if (!user) {
      return res.status(400).send("User not found.");
    }

    if (user.status === "verified") {
      await tokenDocument.deleteOne();
      return res.status(200).send("This account has already been verified.");
    }

    user.status = "verified";
    await user.save();
    await tokenDocument.deleteOne();

    res.status(200).send("Email verified successfully.");
  } catch (error) {
    console.error("Error in verifyEmail function:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Login or Register with Google
 * @route   POST /api/auth/google
 * @access  Public
 */
exports.googleLogin = async (req, res) => {
  const { tokenId } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: tokenId,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { email_verified, name, email, picture } = ticket.getPayload();

    if (!email_verified) {
      return res
        .status(400)
        .json({ message: "Google email is not verified." });
    }

    let user = await User.findOne({ email });

    if (user) {
      if (user.status === "banned") {
        return res.status(403).json({
          message:
            "Your account has been banned. Please contact an administrator.",
          errorCode: "ACCOUNT_BANNED",
        });
      }
    } else {
      user = new User({
        firstName: name.split(" ")[0],
        lastName: name.split(" ").slice(1).join(" "),
        userName:
          email.split("@")[0] + "_" + crypto.randomBytes(4).toString("hex"),
        email,
        password: null,
        userImage: picture,
        status: "verified",
      });
      await user.save();
    }

    const { accessToken, refreshToken } = generateTokens(user);
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userObject = user.toObject();
    delete userObject.password;

    res.status(200).json({ accessToken, user: userObject });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Google authentication error.", error: error.message });
  }
};

/**
 * @desc    Login user with email and password
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password || "");
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Invalid email or password." });
    }

    switch (user.status) {
      case "verified":
        break;

      case "unverified":
        return res.status(403).json({
          message: "Please verify your email before logging in.",
          errorCode: "ACCOUNT_NOT_VERIFIED",
        });

      case "banned":
        return res.status(403).json({
          message:
            "Your account has been banned. Please contact an administrator.",
          errorCode: "ACCOUNT_BANNED",
        });

      default:
        return res
          .status(500)
          .json({ message: "Unknown account status." });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userObject = user.toObject();
    delete userObject.password;

    res.status(200).json({ accessToken, user: userObject });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Reset password using token (for web)
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
exports.resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const token = await Token.findOne({ token: req.params.token });
    if (!token)
      return res
        .status(400)
        .json({ message: "Invalid or expired token." });

    const user = await User.findById(token.userId);
    if (!user)
      return res.status(400).json({ message: "User not found." });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    await token.deleteOne();

    res.status(200).json({ message: "Password has been reset successfully." });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh-token
 * @access  Private (via httpOnly cookie)
 */
exports.refreshToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken)
    return res.status(401).json({ message: "Access denied. No refresh token provided." });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user)
      return res.status(401).json({ message: "User does not exist." });

    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN }
    );
    res.status(200).json({ accessToken });
  } catch (error) {
    return res.status(403).json({ message: "Invalid refresh token." });
  }
};

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
exports.logout = (req, res) => {
  res.cookie("refreshToken", "", { httpOnly: true, expires: new Date(0) });
  res.status(200).json({ message: "Logged out successfully." });
};

/**
 * @desc    Resend verification email
 * @route   POST /api/auth/resend-verification
 * @access  Public
 */
exports.resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Please provide an email." });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        message:
          "If this email is registered, a new verification link has been sent.",
      });
    }

    if (user.status === "verified") {
      return res
        .status(400)
        .json({ message: "This account is already verified." });
    }

    await Token.findOneAndDelete({ userId: user._id });

    const verificationToken = crypto.randomBytes(32).toString("hex");
    await new Token({ userId: user._id, token: verificationToken }).save();

    const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
    const htmlMessage = emailTemplates.studentVerificationEmail(user.firstName, verificationUrl);

    await sendEmail(user.email, "Email Verification - F-Learning", htmlMessage);

    res.status(200).json({
      message: "A new verification link has been sent to your email.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * @desc    Forgot password (for web)
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        message:
          "If the email exists in our system, a password reset link has been sent.",
      });
    }

    let token = await Token.findOne({ userId: user._id });
    if (token) await token.deleteOne();

    const resetToken = crypto.randomBytes(32).toString("hex");
    await new Token({ userId: user._id, token: resetToken }).save();

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    const htmlMessage = emailTemplates.passwordResetEmail(user.firstName, resetUrl);

    await sendEmail(user.email, "Password Reset Request - F-Learning", htmlMessage);
    res.status(200).json({
      message: "If the email exists in our system, a password reset link has been sent.",
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * @desc    [MOBILE] Send password reset code via email
 * @route   POST /api/auth/mobile/send-reset-code
 * @access  Public
 */
exports.sendMobileResetCode = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Please provide an email." });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(200).json({
                message: "If the email exists in our system, a recovery code has been sent.",
            });
        }

        const resetCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
        user.mobileResetCodeHash = await bcrypt.hash(resetCode, 10);
        user.mobileResetCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

        await user.save();

        const htmlMessage = emailTemplates.mobileResetCodeEmail(user.firstName, resetCode);

        await sendEmail(user.email, "Password Reset Code - F-Learning Mobile App", htmlMessage);
        
        res.status(200).json({
            message: "A recovery code has been sent to your email.",
        });

    } catch (error) {
        console.error("Error sending reset code for mobile:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * @desc    [MOBILE] Verify code and reset new password
 * @route   POST /api/auth/mobile/reset-with-code
 * @access  Public
 */
exports.resetPasswordWithCode = async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) {
            return res.status(400).json({ message: "Please provide email, code, and newPassword." });
        }

        const user = await User.findOne({
            email,
            mobileResetCodeExpires: { $gt: Date.now() },
        }).select('+mobileResetCodeHash');

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired code." });
        }

        const isMatch = await bcrypt.compare(code, user.mobileResetCodeHash);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid code." });
        }

        user.password = newPassword;
        user.mobileResetCodeHash = undefined;
        user.mobileResetCodeExpires = undefined;
        
        await user.save();

        res.status(200).json({ message: "Password has been reset successfully." });

    } catch (error) {
        console.error("Error resetting password with code:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * @desc    Submit instructor registration application
 * @route   POST /api/auth/instructor/register
 * @access  Public
 */
exports.registerInstructor = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      expertise,
      experience,
      bankName,
      accountNumber,
      accountHolderName,
      documents,
    } = req.body;

    // Detailed logging for debugging
    console.log("Received instructor registration data:", {
      firstName,
      lastName,
      email,
      phone,
      expertise: expertise,
      expertiseIsArray: Array.isArray(expertise),
      expertiseLength: expertise?.length,
      experience: experience?.substring(0, 50),
      bankName,
      accountNumber,
      accountHolderName,
      documentsLength: documents?.length
    });

    // Validate each field individually to pinpoint the issue
    const missingFields = [];
    if (!firstName) missingFields.push('firstName');
    if (!lastName) missingFields.push('lastName');
    if (!email) missingFields.push('email');
    if (!phone) missingFields.push('phone');
    if (!expertise) missingFields.push('expertise (undefined/null)');
    if (Array.isArray(expertise) && expertise.length === 0) missingFields.push('expertise (empty array)');
    if (!experience) missingFields.push('experience');
    if (!bankName) missingFields.push('bankName');
    if (!accountNumber) missingFields.push('accountNumber');
    if (!accountHolderName) missingFields.push('accountHolderName');

    if (missingFields.length > 0) {
      console.log("Missing/invalid fields:", missingFields);
      return res.status(400).json({
        message: `Please provide all required fields. Missing: ${missingFields.join(', ')}`
      });
    }

    // Check if email already has a pending or approved application
    const existingApplication = await InstructorApplication.findOne({
      email,
      status: { $in: ["pending", "approved"] },
    });

    if (existingApplication) {
      if (existingApplication.status === "approved") {
        return res.status(400).json({
          message: "This email is already registered as an instructor.",
        });
      }
      return res.status(400).json({
        message:
          "You already have a pending application. Please wait for admin review.",
      });
    }

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found. Please register first." });
    }

    // Determine application status based on user's email verification
    const applicationStatus = user.status === "verified" ? "pending" : "emailNotVerified";

    // Create new instructor application
    const newApplication = await InstructorApplication.create({
      firstName,
      lastName,
      email,
      phone,
      expertise,
      experience,
      bankName,
      accountNumber,
      accountHolderName,
      documents: documents || [],
      status: applicationStatus, // Set status based on email verification
    });

    // Delete old verification tokens for this user
    await Token.deleteMany({ userId: user._id });

    // Generate new verification token and send instructor verification email
    const verificationToken = crypto.randomBytes(32).toString("hex");
    await new Token({ userId: user._id, token: verificationToken }).save();

    const verificationUrl = `${process.env.CLIENT_URL}/verify-instructor-email/${verificationToken}`;
    const htmlMessage = emailTemplates.instructorVerificationEmail(user.firstName, verificationUrl);
    await sendEmail(user.email, "Verify Your Instructor Account - F-Learning", htmlMessage);

    res.status(201).json({
      message:
        "Your instructor application has been submitted successfully! Please check your email to verify your account.",
      applicationId: newApplication._id,
    });
  } catch (error) {
    console.error("Error in registerInstructor:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};