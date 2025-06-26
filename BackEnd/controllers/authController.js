const User = require("../models/userModel");
const Token = require("../models/tokenModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Hàm nội bộ để tạo token
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
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp đầy đủ thông tin." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email đã tồn tại." });
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

    const verificationToken = crypto.randomBytes(32).toString("hex");
    await new Token({ userId: newUser._id, token: verificationToken }).save();
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
    const htmlMessage = `<p>Vui lòng nhấp vào nút dưới đây để xác thực email của bạn:</p><a href="${verificationUrl}" target="_blank">Verify Email</a>`;
    await sendEmail(newUser.email, "Xác thực Email", htmlMessage);

    res.status(201).json({
      message:
        "Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * @desc    Verify user's email
 * @route   GET /api/auth/verify-email/:token
 * @access  Public
 */
exports.verifyEmail = async (req, res) => {
  try {
    // LOG 1: Xem backend nhận được token gì từ URL
    const receivedToken = req.params.token;
    console.log("Backend đã nhận được token từ URL:", receivedToken);

    // LOG 2: Tìm kiếm token này trong database
    const tokenDocument = await Token.findOne({ token: receivedToken });

    // LOG 3: In kết quả tìm kiếm ra
    // Nếu kết quả là 'null', nghĩa là không tìm thấy.
    console.log(
      "Kết quả tìm kiếm token trong DB (Token.findOne):",
      tokenDocument
    );

    if (!tokenDocument) {
      // Thêm ghi chú vào response để dễ debug hơn
      return res
        .status(400)
        .send(
          "Liên kết không hợp lệ hoặc đã hết hạn (không tìm thấy token trong DB)."
        );
    }

    const user = await User.findById(tokenDocument.userId);
    if (!user) {
      return res.status(400).send("Không tìm thấy người dùng.");
    }

    if (user.status === "verified") {
      await tokenDocument.deleteOne();
      return res.status(200).send("Tài khoản này đã được xác thực trước đó.");
    }

    user.status = "verified";
    await user.save();
    await tokenDocument.deleteOne();

    res.status(200).send("Email đã được xác thực thành công.");
  } catch (error) {
    console.error("Đã có lỗi trong hàm verifyEmail:", error);
    res.status(500).json({ message: "Lỗi máy chủ", error: error.message });
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

    // 1. Kiểm tra user có tồn tại không
    if (!user) {
      // Nếu không có user, trả về lỗi mật khẩu sai luôn
      return res
        .status(400)
        .json({ message: "Email hoặc mật khẩu không đúng." });
    }

    // 2. Kiểm tra mật khẩu ĐẦU TIÊN (đã bỏ qua bước kiểm tra password null)
    const isMatch = await bcrypt.compare(password, user.password || ""); // So sánh với chuỗi rỗng nếu password là null
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Email hoặc mật khẩu không đúng." });
    }

    // 3. CHỈ KHI mật khẩu đúng, MỚI kiểm tra đến status
    if (user.status === "unverified") {
      return res.status(403).json({
        message: "Vui lòng xác thực email của bạn trước khi đăng nhập.",
        errorCode: "ACCOUNT_NOT_VERIFIED",
      });
    }

    // Nếu tất cả đều qua, đăng nhập thành công
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
    res.status(500).json({ message: "Lỗi máy chủ", error: error.message });
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
        .json({ message: "Email Google chưa được xác thực." });
    }

    let user = await User.findOne({ email });

    if (!user) {
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
      .json({ message: "Lỗi xác thực Google.", error: error.message });
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
        .json({ message: "Email hoặc mật khẩu không đúng." });
    }

    const isMatch = await bcrypt.compare(password, user.password || "");
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Email hoặc mật khẩu không đúng." });
    }

    // --- THAY ĐỔI Ở ĐÂY: Dùng switch-case để kiểm tra status ---
    // Logic này chỉ chạy sau khi đã xác thực mật khẩu thành công.
    switch (user.status) {
      case "verified":
        // Nếu status là 'verified', không làm gì cả và đi tiếp đến phần tạo token.
        break;

      case "unverified":
        return res.status(403).json({
          message: "Vui lòng xác thực email của bạn trước khi đăng nhập.",
          errorCode: "ACCOUNT_NOT_VERIFIED",
        });

      case "banned":
        return res.status(403).json({
          message:
            "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.",
          errorCode: "ACCOUNT_BANNED",
        });

      default:
        // Xử lý các trường hợp status không xác định khác nếu có
        return res
          .status(500)
          .json({ message: "Trạng thái tài khoản không xác định." });
    }

    // Nếu tất cả đều qua (chỉ trường hợp status = 'verified'), đăng nhập thành công
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
    res.status(500).json({ message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * @desc    Reset password using token
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
        .json({ message: "Token không hợp lệ hoặc đã hết hạn." });

    const user = await User.findById(token.userId);
    if (!user)
      return res.status(400).json({ message: "Không tìm thấy người dùng." });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    await token.deleteOne();

    res.status(200).json({ message: "Đặt lại mật khẩu thành công." });
  } catch (error) {
    res.status(500).json({ message: "Lỗi máy chủ" });
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
    return res.status(401).json({ message: "Không có quyền truy cập." });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user)
      return res.status(401).json({ message: "Người dùng không tồn tại." });

    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN }
    );
    res.status(200).json({ accessToken });
  } catch (error) {
    return res.status(403).json({ message: "Refresh token không hợp lệ." });
  }
};

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
exports.logout = (req, res) => {
  res.cookie("refreshToken", "", { httpOnly: true, expires: new Date(0) });
  res.status(200).json({ message: "Đăng xuất thành công." });
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
      return res.status(400).json({ message: "Vui lòng cung cấp email." });
    }

    const user = await User.findOne({ email });

    // Vẫn trả về thành công nếu không tìm thấy user để tránh bị dò email
    if (!user) {
      return res.status(200).json({
        message:
          "Nếu email này đã được đăng ký, một liên kết xác thực mới đã được gửi.",
      });
    }

    // Nếu tài khoản đã được xác thực rồi
    if (user.status === "verified") {
      return res
        .status(400)
        .json({ message: "Tài khoản này đã được xác thực." });
    }

    // Xóa token cũ nếu có
    await Token.findOneAndDelete({ userId: user._id });

    // Tạo và gửi token mới
    const verificationToken = crypto.randomBytes(32).toString("hex");
    await new Token({ userId: user._id, token: verificationToken }).save();

    const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
    const htmlMessage = `<p>Vui lòng nhấp vào nút dưới đây để xác thực email của bạn:</p><a href="${verificationUrl}" target="_blank">Verify Email</a>`;

    await sendEmail(user.email, "Xác thực Email", htmlMessage);

    res.status(200).json({
      message: "Một liên kết xác thực mới đã được gửi đến email của bạn.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};
