const User = require("../models/userModel");
const Course = require("../models/courseModel");
const Payment = require("../models/paymentModel");
const Transaction = require("../models/transactionModel");
const mongoose = require("mongoose");
const {
  uploadUserAvatar,
  deleteFromFirebase,
} = require("../utils/firebaseStorage");
const fs = require("fs");

/**
 * @desc    Get user profile (specific fields only)
 * @route   GET /api/profile
 * @access  Private
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

    const user = await User.findById(userId).select(
      "firstName lastName userName email biography userImage"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        userName: user.userName,
        email: user.email,
        biography: user.biography,
        userImage: user.userImage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update user profile (specific fields only)
 * @route   PUT /api/profile
 * @access  Private
 */
const updateProfile = async (req, res) => {
  let uploadedFilePath = null;

  try {
    const userId = req.user.id; // From auth middleware
    const { firstName, lastName, userName, email, biography } = req.body;

    // Get current user data to check for existing image
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if userName already exists (excluding current user)
    if (userName) {
      const existingUserByUsername = await User.findOne({
        userName,
        _id: { $ne: userId },
      });
      if (existingUserByUsername) {
        return res.status(400).json({
          success: false,
          message: "Username already exists",
        });
      }
    }

    // Check if email already exists (excluding current user)
    if (email) {
      const existingUserByEmail = await User.findOne({
        email,
        _id: { $ne: userId },
      });
      if (existingUserByEmail) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }
    }

    // Build update object with only provided fields
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (userName !== undefined) updateData.userName = userName;
    if (email !== undefined) updateData.email = email;
    if (biography !== undefined) updateData.biography = biography;

    if (req.file) {
      try {
        uploadedFilePath = req.file.path;

        // Verify file exists before upload
        if (!fs.existsSync(uploadedFilePath)) {
          throw new Error("Upload file not found");
        }

        // Upload to Firebase Storage using the new uploadUserAvatar function
        const uploadResult = await uploadUserAvatar(
          uploadedFilePath,
          req.file.originalname,
          req.file.mimetype,
          userId,
          currentUser.userName
        );

        // Delete old image if it exists
        if (currentUser.userImage) {
          try {
            // Extract file path from the old image URL
            const oldImagePath = extractSourceDestination(
              currentUser.userImage
            );
            if (oldImagePath) {
              await deleteFromFirebase(oldImagePath).catch((err) => {
                console.warn("Failed to delete old image:", err.message);
              });
            }
          } catch (deleteError) {
            console.warn("Error deleting old image:", deleteError.message);
          }
        }

        updateData.userImage = uploadResult.url;
      } catch (uploadError) {
        console.error("Upload error details:", uploadError);
        return res.status(500).json({
          success: false,
          message: "Failed to upload image to cloud storage",
          error: uploadError.message,
        });
      } finally {
        // Clean up local file regardless of upload success/failure
        try {
          if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
            fs.unlinkSync(uploadedFilePath);
          }
        } catch (cleanupError) {
          console.warn(
            "Failed to cleanup temporary file:",
            cleanupError.message
          );
        }
      }
    }

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("firstName lastName userName email biography userImage");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        userName: updatedUser.userName,
        email: updatedUser.email,
        biography: updatedUser.biography,
        userImage: updatedUser.userImage,
      },
    });
  } catch (error) {
    // Clean up uploaded file if there was an error
    try {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
    } catch (cleanupError) {
      console.warn("Failed to cleanup temporary file:", cleanupError.message);
    }

    console.error("Profile update error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Helper function to extract file path from Firebase URL
function extractSourceDestination(firebaseUrl) {
  if (!firebaseUrl || typeof firebaseUrl !== "string") {
    return null;
  }

  try {
    // Handle Firebase Storage URL format
    if (firebaseUrl.includes("firebasestorage.googleapis.com")) {
      const url = new URL(firebaseUrl);
      const match = url.pathname.match(/\/o\/(.+)$/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }

    // Handle direct Google Storage URL format
    if (firebaseUrl.includes("storage.googleapis.com")) {
      const url = new URL(firebaseUrl);
      const pathParts = url.pathname.split("/");
      if (pathParts.length >= 3) {
        return pathParts.slice(2).join("/");
      }
    }

    return null;
  } catch (error) {
    console.error("Error parsing URL:", error.message);
    return null;
  }
}

/**
 * @desc    Get enrolled courses for user
 * @route   GET /api/profile/enrolled-courses
 * @access  Private
 */
const getEnrolledCourses = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware (string)

    // Find user and populate enrolledCourses
    const user = await User.findById(userId).populate({
      path: "enrolledCourses",
      populate: {
        path: "categoryIds",
        model: "Category",
        select: "name",
      },
      select:
        "title subTitle thumbnail price rating level duration language categoryIds createdAt instructor",
    });

    if (!user || !user.enrolledCourses || user.enrolledCourses.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No enrolled courses found",
        data: [],
        count: 0,
      });
    }

    // Extract course information from enrolledCourses
    const enrolledCourses = user.enrolledCourses.map((course) => ({
      course: {
        id: course._id,
        title: course.title,
        subTitle: course.subTitle,
        thumbnail: course.thumbnail,
        price: course.price,
        rating: course.rating,
        level: course.level,
        duration: course.duration,
        language: course.language,
        instructor: course.instructor || null, // fallback if not present
        category:
          course.categoryIds && course.categoryIds.length > 0
            ? course.categoryIds[0].name
            : null,
        createdAt: course.createdAt,
      },
    }));

    res.status(200).json({
      success: true,
      message: "Enrolled courses retrieved successfully",
      data: enrolledCourses,
      count: enrolledCourses.length,
    });
  } catch (error) {
    console.error("Error in getEnrolledCourses:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get purchase history for user (enriched with payment and course info)
 * @route   GET /api/profile/purchase-history
 * @access  Private
 */
const getPurchaseHistory = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware (string)
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Get transactions for this user
    const transactions = await Transaction.find({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalTransactions = await Transaction.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
    });
    const totalPages = Math.ceil(totalTransactions / limit);

    // For each transaction, fetch payment and course info
    const data = await Promise.all(
      transactions.map(async (tran) => {
        // Find related payment (if any)
        const payment = await Payment.findOne({ transactionId: tran._id });
        // Find related course (first courseId in array)
        let course = null;
        let categoryName = null;
        if (tran.courseId && tran.courseId.length > 0) {
          course = await Course.findById(tran.courseId[0]).populate({
            path: "categoryIds",
            select: "name",
          });
          if (course && course.categoryIds && course.categoryIds.length > 0) {
            categoryName = course.categoryIds[0].name;
          }
        }
        return {
          paymentId: tran._id,
          amount: parseFloat(tran.amount),
          currency: tran.currency,
          status: tran.status,
          type: tran.type,
          description: tran.description,
          gatewayTransactionId: tran.gatewayTransactionId,
          createdAt: tran.createdAt,
          updatedAt: tran.updatedAt,
          paymentMethod: payment ? payment.paymentMethod : null,
          paymentDate: payment ? payment.paymentDate : tran.createdAt,
          course: course
            ? {
                id: course._id,
                title: course.title,
                subTitle: course.subTitle,
                thumbnail: course.thumbnail,
                price: course.price,
                rating: course.rating,
                level: course.level,
                duration: course.duration,
                language: course.language,
                category: categoryName,
                createdAt: course.createdAt,
              }
            : null,
          transaction: {
            gatewayTransactionId: tran.gatewayTransactionId,
            status: tran.status,
            type: tran.type,
          },
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Purchase history retrieved successfully",
      data,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalTransactions,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        totalPayments: totalTransactions,
      },
    });
  } catch (error) {
    console.error("Error in getPurchaseHistory:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getEnrolledCourses,
  getPurchaseHistory,
};
