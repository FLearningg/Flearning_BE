const User = require("../models/userModel");
const Enrollment = require("../models/enrollmentModel");
const Course = require("../models/courseModel");
const Payment = require("../models/paymentModel");
const Transaction = require("../models/transactionModel");
const mongoose = require("mongoose");
const { uploadImage, deleteFile } = require("../utils/googleDriveUploader");
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

        const uploadResult = await uploadImage(uploadedFilePath);
        
        // Delete old image if it exists
        if (currentUser.userImage) {
          try {
            // Extract fileId from the old image URL
            const fileId = currentUser.userImage.split('/d/')[1].split('=')[0];
            if (fileId) {
              await deleteFile(fileId).catch(err => {
                console.warn("Failed to delete old image:", err.message);
              });
            }
          } catch (deleteError) {
            console.warn("Error extracting old image ID:", deleteError.message);
          }
        }
        
        updateData.userImage = uploadResult.userImage;
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
          console.warn("Failed to cleanup temporary file:", cleanupError.message);
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

/**
 * @desc    Get enrolled courses for user
 * @route   GET /api/profile/enrolled-courses
 * @access  Private
 */
const getEnrolledCourses = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware (string)

    // Find all enrollments for this user and populate course details
    // Convert string userId to ObjectId for proper MongoDB query
    const enrollments = await Enrollment.find({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .populate({
        path: "courseId",
        model: "Course",
        populate: {
          path: "categoryId",
          model: "Category",
          select: "name",
        },
        select:
          "title subTitle thumbnail price rating level duration language categoryId createdAt",
      })
      .sort({ createdAt: -1 }); // Sort by enrollment date (newest first)

    if (!enrollments || enrollments.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No enrolled courses found",
        data: [],
        count: 0,
      });
    }

    // Filter out enrollments where courseId is null or undefined (course might have been deleted)
    const validEnrollments = enrollments.filter(
      (enrollment) => enrollment.courseId && enrollment.courseId._id
    );

    if (validEnrollments.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No valid enrolled courses found",
        data: [],
        count: 0,
      });
    }

    // Extract course information from valid enrollments
    const enrolledCourses = validEnrollments.map((enrollment) => ({
      enrollmentId: enrollment._id,
      enrollmentDate: enrollment.createdAt,
      course: {
        id: enrollment.courseId._id,
        title: enrollment.courseId.title,
        subTitle: enrollment.courseId.subTitle,
        thumbnail: enrollment.courseId.thumbnail,
        price: enrollment.courseId.price,
        rating: enrollment.courseId.rating,
        level: enrollment.courseId.level,
        duration: enrollment.courseId.duration,
        language: enrollment.courseId.language,
        category: enrollment.courseId.categoryId
          ? enrollment.courseId.categoryId.name
          : null,
        createdAt: enrollment.courseId.createdAt,
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
 * @desc    Get purchase history for user
 * @route   GET /api/profile/purchase-history
 * @access  Private
 */
const getPurchaseHistory = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware (string)
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    // Find all payments for this user and populate related data
    const payments = await Payment.find({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .populate({
        path: "courseId",
        model: "Course",
        select: "title subTitle thumbnail price categoryId",
        populate: {
          path: "categoryId",
          model: "Category",
          select: "name",
        },
      })
      .populate({
        path: "transactionId",
        model: "Transaction",
        select: "gatewayTransactionId type status description",
      })
      .sort({ paymentDate: -1 }) // Sort by payment date (newest first)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalPayments = await Payment.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!payments || payments.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No purchase history found",
        data: [],
        pagination: {
          currentPage: parseInt(page),
          totalPages: 0,
          totalPayments: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    // Format purchase history data
    const purchaseHistory = payments.map((payment) => ({
      paymentId: payment._id,
      enrollmentId: payment.enrollmentId,
      amount: parseFloat(payment.amount.toString()),
      paymentDate: payment.paymentDate,
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      createdAt: payment.createdAt,
      course: payment.courseId
        ? {
            id: payment.courseId._id,
            title: payment.courseId.title,
            subTitle: payment.courseId.subTitle,
            thumbnail: payment.courseId.thumbnail,
            price: payment.courseId.price,
            category: payment.courseId.categoryId
              ? payment.courseId.categoryId.name
              : null,
          }
        : null,
      transaction: payment.transactionId
        ? {
            id: payment.transactionId._id,
            gatewayTransactionId: payment.transactionId.gatewayTransactionId,
            type: payment.transactionId.type,
            status: payment.transactionId.status,
            description: payment.transactionId.description,
          }
        : null,
    }));

    const totalPages = Math.ceil(totalPayments / limit);

    res.status(200).json({
      success: true,
      message: "Purchase history retrieved successfully",
      data: purchaseHistory,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalPayments,
        hasNext: page < totalPages,
        hasPrev: page > 1,
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