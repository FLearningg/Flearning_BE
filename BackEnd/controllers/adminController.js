const User = require("../models/userModel");
const Enrollment = require("../models/enrollmentModel");
const Course = require("../models/courseModel");
const Category = require("../models/categoryModel");
const Discount = require("../models/discountModel");
const Section = require("../models/sectionModel");
const Lesson = require("../models/lessonModel");
const Quiz = require("../models/QuizModel");
const mongoose = require("mongoose");
const admin = require("firebase-admin");
const Transaction = require("../models/transactionModel");
const InstructorProfile = require("../models/instructorProfileModel");
const {
  instructorApplicationApprovedEmail,
  instructorApplicationDeniedEmail,
  userBannedEmail,
} = require("../utils/emailTemplates");
const sendEmail = require("../utils/sendEmail");
/**
 * Helper function to extract file name from URL
 * @param {string} url - Firebase storage URL or any URL
 * @returns {string} - Extracted file name
 */
const extractFileNameFromUrl = (url) => {
  try {
    if (!url) return "Unknown File";

    // Handle Firebase storage URLs
    if (url.includes("firebasestorage.googleapis.com")) {
      // Extract filename from Firebase storage URL
      // Format: https://firebasestorage.googleapis.com/v0/b/bucket/o/path%2Ffilename.ext?...
      const decodedUrl = decodeURIComponent(url);
      const match = decodedUrl.match(/\/([^\/\?]+)(?:\?|$)/);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Fallback: extract from regular URL
    const urlParts = url.split("/");
    const lastPart = urlParts[urlParts.length - 1];

    // Remove query parameters
    const fileName = lastPart.split("?")[0];

    return fileName || "Unknown File";
  } catch (error) {
    console.error("Error extracting filename from URL:", error);
    return "Unknown File";
  }
};

/**
 * Helper function to move file from temporary to course folder
 */
const moveFileFromTemporaryToCourse = async (
  sourceDestination,
  courseId,
  folderType
) => {
  try {
    console.log("🔄 Starting file move operation:");
    console.log("  - Source:", sourceDestination);
    console.log("  - Course ID:", courseId);
    console.log("  - Folder Type:", folderType);

    const bucket = admin.storage().bucket();
    const sourceFile = bucket.file(sourceDestination);

    // Check if source file exists
    const [exists] = await sourceFile.exists();
    if (!exists) {
      console.log("❌ Source file not found:", sourceDestination);
      throw new Error(`Source file not found: ${sourceDestination}`);
    }

    console.log("✅ Source file exists");

    // Generate new destination based on folderType
    const fileName = sourceDestination.split("/").pop();
    let newDestination;

    // Handle different folder types
    if (folderType === "thumbnail" || folderType === "trailer") {
      // Standard folder structure for thumbnail and trailer
      newDestination = `courses/${courseId}/${folderType}/${fileName}`;
    } else if (
      folderType.includes("section_") &&
      folderType.includes("lesson_")
    ) {
      // New folder structure: section_1/lesson_1
      newDestination = `courses/${courseId}/${folderType}/${fileName}`;
    } else {
      // Fallback to general structure
      newDestination = `courses/${courseId}/${folderType}/${fileName}`;
    }

    console.log("📁 New destination:", newDestination);

    const targetFile = bucket.file(newDestination);

    // Copy file to new location
    console.log("📋 Copying file...");
    await sourceFile.copy(targetFile);
    console.log("✅ File copied successfully");

    // Delete original file from temporary folder
    console.log("🗑️ Deleting original file...");
    await sourceFile.delete();
    console.log("✅ Original file deleted");

    // Generate new URL with proper format
    const bucketName = bucket.name;
    const encodedDestination = encodeURIComponent(newDestination);
    const newUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedDestination}?alt=media`;

    console.log("🔗 New URL generated:", newUrl);

    // Update course with new URL if it's thumbnail or trailer
    if (folderType === "thumbnail" || folderType === "trailer") {
      console.log("📝 Updating course with new URL...");
      const updateData = {};
      updateData[folderType] = newUrl;
      await Course.findByIdAndUpdate(courseId, updateData);
      console.log("✅ Course updated");
    }

    console.log("🎉 File move operation completed successfully");

    return {
      success: true,
      from: sourceDestination,
      newDestination,
      newUrl,
    };
  } catch (error) {
    console.error(`❌ Error moving file from temporary:`, error);
    throw error;
  }
};

/**
 * @desc    Get all users with search and filtering
 * @route   GET /api/admin/users
 * @access  Private (Admin only)
 */
exports.getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      role = "",
      status = "",
      sortBy = "createdAt",
      sortOrder = "desc",
      fromDate,
      toDate,
      dateFilter,
    } = req.query;

    // Build query object
    const query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { userName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by role
    if (role) {
      query.role = role;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Date filtering
    if (dateFilter === "today") {
      const today = new Date();
      const startOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const endOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 1
      );
      query.createdAt = { $gte: startOfDay, $lt: endOfDay };
    } else if (dateFilter === "month") {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      query.createdAt = { $gte: startOfMonth, $lt: endOfMonth };
    } else if (fromDate && toDate) {
      query.createdAt = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query with pagination
    const users = await User.find(query)
      .select("-password")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("enrolledCourses", "title");

    // Get total count for pagination
    const totalUsers = await User.countDocuments(query);

    // Calculate pagination info
    const totalPages = Math.ceil(totalUsers / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    // Get enrollment count for each user
    const usersWithEnrollmentCount = await Promise.all(
      users.map(async (user) => {
        const enrollmentCount = await Enrollment.countDocuments({
          userId: user._id,
        });
        const userObj = user.toObject();
        return {
          ...userObj,
          enrollmentCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: usersWithEnrollmentCount,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalUsers,
        hasNextPage,
        hasPrevPage,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error in getUsers:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get user statistics
 * @route   GET /api/admin/users/stats
 * @access  Private (Admin only)
 */
exports.getUserStats = async (req, res) => {
  try {
    // Get current date and start of day/month
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Basic user counts
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ status: "verified" });
    const unverifiedUsers = await User.countDocuments({ status: "unverified" });
    const bannedUsers = await User.countDocuments({ status: "banned" });
    const students = await User.countDocuments({ role: "student" });
    const admins = await User.countDocuments({ role: "admin" });

    // Get users enrolled in at least one course
    const enrolledUsers = await User.countDocuments({
      enrolledCourses: { $exists: true, $ne: [] },
    });

    // Get users registered today
    const usersRegisteredToday = await User.countDocuments({
      createdAt: { $gte: startOfToday },
    });

    // Get users registered this month
    const usersRegisteredThisMonth = await User.countDocuments({
      createdAt: { $gte: startOfMonth },
    });

    // Get daily registration data for the last 7 days (for chart)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );
      const endOfDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + 1
      );

      const count = await User.countDocuments({
        createdAt: { $gte: startOfDay, $lt: endOfDay },
      });

      last7Days.push({
        date: startOfDay.toISOString().split("T")[0],
        count,
      });
    }

    // Get monthly registration data for the last 6 months (for chart)
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);

      const count = await User.countDocuments({
        createdAt: { $gte: startOfMonth, $lt: endOfMonth },
      });

      last6Months.push({
        month: startOfMonth.toISOString().slice(0, 7), // YYYY-MM format
        count,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        verifiedUsers,
        unverifiedUsers,
        bannedUsers,
        students,
        admins,
        enrolledUsers,
        usersRegisteredToday,
        usersRegisteredThisMonth,
        registrationTrends: {
          last7Days,
          last6Months,
        },
      },
    });
  } catch (error) {
    console.error("Error in getUserStats:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get user by ID with detailed information
 * @route   GET /api/admin/users/:id
 * @access  Private (Admin only)
 */
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select("-password")
      .populate("enrolledCourses", "title subTitle thumbnail price");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get enrollment count
    const enrollmentCount = await Enrollment.countDocuments({ userId: id });

    // Get user's enrollment details
    const enrollments = await Enrollment.find({ userId: id }).populate(
      "courseId",
      "title subTitle thumbnail price"
    );

    const userData = {
      ...user.toObject(),
      enrollmentCount,
      enrollments,
    };

    res.status(200).json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error("Error in getUserById:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update user status (ban/unban)
 * @route   PUT /api/admin/users/:id/status
 * @access  Private (Admin only)
 */
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["unverified", "verified", "banned"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // If user is being banned, terminate all their active sessions and send email
    if (status === "banned") {
      try {
        // Import the Token model to delete user's tokens
        const Token = require("../models/tokenModel");
        
        // Delete all refresh tokens for this user to terminate their sessions
        await Token.deleteMany({ userId: id });
        
        console.log(`All sessions terminated for banned user: ${user.email}`);
        
        // Send email notification to banned user
        try {
          const emailContent = userBannedEmail(user.firstName || user.userName);
          const emailResult = await sendEmail(
            user.email,
            "Your Account Has Been Banned",
            emailContent
          );
          
          if (emailResult.success) {
            console.log(`Ban notification email sent successfully to: ${user.email}`);
          } else {
            console.error(`Failed to send ban notification email to ${user.email}:`, emailResult.error);
          }
        } catch (emailError) {
          console.error("Error sending ban notification email:", emailError);
          // Continue with the response even if email sending fails
        }
      } catch (tokenError) {
        console.error("Error terminating user sessions:", tokenError);
        // Continue with the response even if session termination fails
      }
    }

    res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error in updateUserStatus:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all courses with search and filtering (Admin)
 * @route   GET /api/admin/courses
 * @access  Private (Admin only)
 */
exports.getAllCourses = async (req, res) => {
  try {
    const {
      page = 1,
      // limit = 10,
      search = "",
      categoryId = "",
      level = "",
      language = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build query object
    const query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { subTitle: { $regex: search, $options: "i" } },
        { "detail.description": { $regex: search, $options: "i" } },
      ];
    }

    // Filter by category
    if (categoryId) {
      let category;
      if (mongoose.Types.ObjectId.isValid(categoryId)) {
        category = await Category.findById(categoryId);
      }
      if (!category) {
        // Nếu không phải ObjectId hoặc không tìm thấy, thử tìm theo name
        category = await Category.findOne({ name: categoryId });
      }
      if (!category) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID or name",
        });
      }
      // Nếu FE truyền tên, gán lại categoryId là _id thực sự
      categoryId = category._id;
    }

    // Filter by level
    if (level) {
      query.level = level;
    }

    // Filter by language
    if (language) {
      query.language = language;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Remove pagination: do not use skip or limit
    // Execute query without pagination
    const courses = await Course.find(query)
      .populate("categoryIds", "name")
      .populate("discountId", "discountCode value type")
      .populate("sections", "name")
      .populate("createdBy", "firstName lastName") // Populate createdBy to get instructor details
      .sort(sort);

    // Get total count for pagination
    const totalCourses = await Course.countDocuments(query);

    // Get enrollment count for each course
    const coursesWithEnrollmentCount = await Promise.all(
      courses.map(async (course) => {
        const enrollmentCount = await Enrollment.countDocuments({
          courseId: course._id,
        });
        const courseObj = course.toObject();
        return {
          ...courseObj,
          enrollmentCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: coursesWithEnrollmentCount,
      totalCourses,
    });
  } catch (error) {
    console.error("Error in getAllCourses:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Helper to normalize and validate categoryIds from request
async function extractValidCategoryIds(reqBody) {
  let { category, subCategory, categoryId, categoryIds, subCategoryId } =
    reqBody;
  let allCategories = [];
  if (Array.isArray(categoryIds))
    allCategories = allCategories.concat(categoryIds);
  if (categoryId) allCategories.push(categoryId);
  if (category) allCategories.push(category);
  if (subCategory) allCategories.push(subCategory);
  if (subCategoryId) allCategories.push(subCategoryId);
  allCategories = [...new Set(allCategories.filter(Boolean))];
  const validCategories = [];
  for (const catId of allCategories) {
    let cat;
    if (mongoose.Types.ObjectId.isValid(catId)) {
      cat = await Category.findById(catId);
    }
    if (!cat) {
      // Try to find by exact name first
      if (typeof catId === "string" && catId.trim() !== "") {
        cat = await Category.findOne({ name: catId.trim() });
      }
      // If not found and the client sent a string name, create the category to keep UX smooth
      if (!cat && typeof catId === "string" && catId.trim() !== "") {
        try {
          const newCat = new Category({ name: catId.trim() });
          cat = await newCat.save();
        } catch (e) {
          // If create fails (race condition or validation), try to re-find
          cat = await Category.findOne({ name: catId.trim() });
        }
      }
    }
    if (cat) validCategories.push(cat._id);
  }
  return validCategories;
}

/**
 * @desc    Create a new course
 * @route   POST /api/admin/courses
 * @access  Private (Admin only)
 */
exports.createCourse = async (req, res) => {
  try {
    let {
      title,
      subTitle,
      subtitle,
      message,
      detail,
      materials,
      thumbnail,
      trailer,
      price,
      discountId,
      level,
      duration,
      language,
      subtitleLanguage,
    } = req.body;

    if (!subTitle && subtitle) {
      subTitle = subtitle;
    }

    // Validate required fields
    const errors = [];
    if (!title || title.trim() === "")
      errors.push("title is required and cannot be empty");
    if (!subTitle || subTitle.trim() === "")
      errors.push("subTitle is required and cannot be empty");
    if (!detail || typeof detail !== "object")
      errors.push("detail object is required");
    else if (!detail.description || detail.description.trim() === "")
      errors.push("detail.description is required and cannot be empty");
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0)
      errors.push("price is required and must be a positive number");
    if (errors.length > 0) {
      console.warn("createCourse validation failed", {
        errors,
        body: req.body,
      });
      // Return a bit more info to the client to aid debugging (avoid sensitive data)
      return res.status(400).json({
        success: false,
        message: "Validation failed: " + errors.join(", "),
        errors: errors,
        receivedData: {
          title,
          subTitle,
          detailSummary:
            detail && typeof detail === "object"
              ? { description: detail.description }
              : null,
          price,
          categoryFields: {
            category: req.body.category,
            categoryId: req.body.categoryId,
            categoryIds: req.body.categoryIds,
          },
        },
      });
    }

    // Gộp và validate categoryIds
    const validCategories = await extractValidCategoryIds(req.body);
    if (validCategories.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No valid categories" });
    }

    // Validate discountId if provided
    if (discountId) {
      const discount = await Discount.findById(discountId);
      if (!discount) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid discount ID" });
      }
    }

    if (level) level = level.toLowerCase();
    if (language) language = language.toLowerCase();
    if (subtitleLanguage) subtitleLanguage = subtitleLanguage.toLowerCase();

    const newCourse = new Course({
      title,
      subTitle,
      message: {
        welcome: message?.welcome || "",
        congrats: message?.congrats || "",
      },
      detail: {
        description: detail.description,
        willLearn: detail.willLearn || [],
        targetAudience: detail.targetAudience || [],
        requirement: detail.requirement || [],
      },
      materials: materials || [],
      thumbnail,
      trailer,
      categoryIds: validCategories,
      price: parseFloat(price),
      discountId,
      level: level || "beginner",
      duration,
      language: language || "vietnam",
      subtitleLanguage: subtitleLanguage || "vietnam",
      sections: [],
    });

    const savedCourse = await newCourse.save();

    // Populate category and discount information
    const populatedCourse = await Course.findById(savedCourse._id)
      .populate("categoryIds", "name")
      .populate("discountId", "discountCode value type");

    // After course creation, check for uploaded files to move from temporary
    const uploadedFiles = req.body.uploadedFiles || {};

    const filesToMove = [];

    // Check for video file (should be trailer)
    if (uploadedFiles.video && uploadedFiles.video.url) {
      const videoUrl = uploadedFiles.video.url;
      const sourceDestination = extractSourceDestination(videoUrl);
      if (sourceDestination) {
        filesToMove.push({
          sourceDestination,
          folderType: "trailer",
          fileType: "video",
        });
      }
    }

    // Check for image/thumbnail files
    if (uploadedFiles.image && uploadedFiles.image.url) {
      const imageUrl = uploadedFiles.image.url;
      const sourceDestination = extractSourceDestination(imageUrl);
      if (sourceDestination) {
        filesToMove.push({
          sourceDestination,
          folderType: "thumbnail",
          fileType: "image",
        });
      }
    }

    // Check for lesson videos (new addition)
    if (
      uploadedFiles.lessonVideos &&
      Array.isArray(uploadedFiles.lessonVideos)
    ) {
      uploadedFiles.lessonVideos.forEach((lessonVideo, index) => {
        if (lessonVideo.url) {
          const videoUrl = lessonVideo.url;
          const sourceDestination = extractSourceDestination(videoUrl);
          if (sourceDestination) {
            filesToMove.push({
              sourceDestination,
              folderType: "section-data",
              fileType: "lesson-video",
              lessonIndex: index,
              originalUrl: videoUrl,
            });
          }
        }
      });
    }

    // Check for individual lesson videos (alternative format)
    if (uploadedFiles.lessons && Array.isArray(uploadedFiles.lessons)) {
      uploadedFiles.lessons.forEach((lesson, index) => {
        // support both legacy videoUrl and new materialUrl
        const lessonMediaUrl = lesson.videoUrl || lesson.materialUrl;
        if (lessonMediaUrl) {
          const sourceDestination = extractSourceDestination(lessonMediaUrl);
          if (sourceDestination) {
            filesToMove.push({
              sourceDestination,
              folderType: "section-data",
              fileType: "lesson-video",
              lessonIndex: index,
              originalUrl: lessonMediaUrl,
            });
          }
        }
      });
    }

    // === TỰ ĐỘNG EXTRACT LESSON VIDEO URLs TỪ SECTIONS ===
    const inputSections = req.body.sections || [];
    let lessonVideoIndex = 0;
    const movedFilesMap = new Map(); // Map để lưu trữ URL mới sau khi move

    console.log("🔍 Processing sections for file move:");
    console.log("  - Number of sections:", inputSections.length);

    inputSections.forEach((section, sectionIndex) => {
      const lessons = section.lessons || [];
      console.log(`  - Section ${sectionIndex + 1}: ${lessons.length} lessons`);

      lessons.forEach((lesson, lessonIndex) => {
        // support both legacy videoUrl and new materialUrl field names
        const lessonMediaUrl = lesson.videoUrl || lesson.materialUrl;
        if (lessonMediaUrl) {
          console.log(
            `    - Lesson ${lessonIndex + 1} has media URL: ${lessonMediaUrl}`
          );
          const sourceDestination = extractSourceDestination(lessonMediaUrl);
          if (sourceDestination) {
            console.log(
              `    - Extracted source destination: ${sourceDestination}`
            );
            filesToMove.push({
              sourceDestination,
              folderType: `section_${sectionIndex + 1}/lesson_${
                lessonIndex + 1
              }`, // new folder structure
              fileType: "lesson-video",
              lessonIndex: lessonVideoIndex,
              sectionIndex: sectionIndex,
              lessonIndexInSection: lessonIndex,
              originalUrl: lessonMediaUrl,
            });
            lessonVideoIndex++;
          } else {
            console.log(
              `    - 4c Could not extract source destination from URL`
            );
          }
        }
      });
    });

    console.log(`📋 Total files to move: ${filesToMove.length}`);

    if (filesToMove.length > 0) {
      console.log("🚀 Starting file move operations...");
      const movePromises = filesToMove.map(async (fileData) => {
        try {
          console.log(
            `📁 Moving file: ${fileData.sourceDestination} → ${fileData.folderType}`
          );
          const moveResult = await moveFileFromTemporaryToCourse(
            fileData.sourceDestination,
            savedCourse._id,
            fileData.folderType
          );

          // Lưu URL mới vào map để sử dụng khi tạo lesson
          if (fileData.fileType === "lesson-video") {
            movedFilesMap.set(fileData.originalUrl, moveResult.newUrl);
            console.log(
              `📝 Mapped lesson video URL: ${fileData.originalUrl} → ${moveResult.newUrl}`
            );
          }

          return moveResult;
        } catch (error) {
          console.error(
            `❌ Failed to move file: ${fileData.sourceDestination}`,
            error.message
          );
          return { error: error.message, file: fileData };
        }
      });

      try {
        const moveResults = await Promise.all(movePromises);
        console.log("✅ All file move operations completed");

        // Log results
        const successCount = moveResults.filter((r) => r.success).length;
        const errorCount = moveResults.filter((r) => r.error).length;
        console.log(
          `📊 Move results: ${successCount} success, ${errorCount} errors`
        );

        if (errorCount > 0) {
          console.log(
            "❌ Some files failed to move:",
            moveResults.filter((r) => r.error)
          );
        }
      } catch (error) {
        console.error("❌ Error in file move operations:", error.message);
      }
    } else {
      console.log("📁 No files to move");
    }

    // === TỰ ĐỘNG TẠO SECTION VÀ LESSON ===
    const createdSectionIds = [];

    for (const sectionData of inputSections) {
      // Validate section data
      if (!sectionData.name || sectionData.name.trim() === "") {
        continue;
      }

      // Tạo section
      const newSection = new Section({
        name: sectionData.name,
        courseId: savedCourse._id,
        order: sectionData.order || 0,
        lessons: [],
      });
      const savedSection = await newSection.save();

      // Tạo lessons cho section này
      const inputLessons = sectionData.lessons || [];

      const createdLessonIds = [];
      for (const lessonData of inputLessons) {
        // Validate lesson data
        if (!lessonData.title || lessonData.title.trim() === "") {
          continue;
        }

        // Map lessonNotes -> lessonNotes (use lessonNotes as the field in DB)
        // Accept both lessonNotes and lectureNotes for backward compatibility, but always use lessonNotes in DB
        let notes = "";
        if (lessonData.lessonNotes !== undefined) {
          notes = lessonData.lessonNotes;
        } else if (lessonData.lectureNotes !== undefined) {
          notes = lessonData.lectureNotes;
        }
        // Ensure type is set
        let lessonType = lessonData.type || "video";

        // Determine media URL: prefer materialUrl, fallback to legacy videoUrl
        const mediaUrl = lessonData.materialUrl || lessonData.videoUrl || "";

        // Auto-detect quiz lessons: check if lesson has quizId or quiz-related data
        let finalQuizIds = [];

        // Handle quiz data from frontend (parsed but not saved yet)
        if (lessonData.quizData && typeof lessonData.quizData === "object") {
          // Quiz data exists - extract quiz ID for lesson reference
          const quizId = lessonData.quizData._id || lessonData.quizData.id;

          if (quizId && quizId.toString().trim() !== "") {
            console.log(
              `� Found quiz ID for lesson: ${quizId} (${lessonData.quizData.title})`
            );
            if (!quizId.toString().startsWith("temp_")) {
              finalQuizIds = [quizId];
              lessonType = "quiz";
            } else {
              // Temporary ID - create real quiz from quiz data
              try {
                const { createQuizFromData } = require("./quizController");

                // Prepare quiz data for creation
                const quizPayload = {
                  title: lessonData.quizData.title,
                  description: lessonData.quizData.description || "",
                  questions: lessonData.quizData.questions || [],
                  timeLimit: lessonData.quizData.timeLimit || null,
                  passingScore: lessonData.quizData.passingScore || 70,
                  maxAttempts: lessonData.quizData.maxAttempts || 3,
                  randomizeQuestions:
                    lessonData.quizData.randomizeQuestions || false,
                  showCorrectAnswers:
                    lessonData.quizData.showCorrectAnswers || true,
                };

                // Check if we have questions data
                if (
                  !quizPayload.questions ||
                  quizPayload.questions.length === 0
                ) {
                  console.log(
                    `⚠️ No questions found in quiz data. Skipping quiz creation.`
                  );
                  // Treat as regular lesson instead
                  continue;
                }

                // Validate questions structure - check if questions are corrupted
                const firstQuestion = quizPayload.questions[0];
                let hasValidStructure =
                  firstQuestion &&
                  firstQuestion.content &&
                  firstQuestion.answers &&
                  Array.isArray(firstQuestion.answers) &&
                  firstQuestion.answers.length > 0;

                // Check if frontend sent data in different format (question/options instead of content/answers)
                if (!hasValidStructure && firstQuestion) {
                  // Map frontend format to backend format
                  quizPayload.questions = quizPayload.questions.map((q) => {
                    if (q.question && q.options) {
                      return {
                        content: q.question,
                        answers: (() => {
                          let options = [];
                          if (Array.isArray(q.options)) {
                            options = q.options;
                          } else if (
                            q.options &&
                            typeof q.options === "object"
                          ) {
                            // Convert object to array (handle {0: 'Apple', 1: 'Google'} format)
                            options = Object.values(q.options);
                          }

                          return options.map((option, index) => ({
                            content: option, // Changed from 'text' to 'content'
                            isCorrect: index === (q.correctAnswer || 0),
                          }));
                        })(),
                        score: q.score || 1,
                        type: "multiple-choice",
                      };
                    }
                    return q;
                  });

                  // Revalidate after mapping
                  const mappedFirstQuestion = quizPayload.questions[0];
                  hasValidStructure =
                    mappedFirstQuestion &&
                    mappedFirstQuestion.content &&
                    mappedFirstQuestion.answers &&
                    Array.isArray(mappedFirstQuestion.answers) &&
                    mappedFirstQuestion.answers.length > 0;
                }

                if (!hasValidStructure) {
                  console.log(
                    `⚠️ Questions data corrupted - missing content or answers after mapping attempt. Skipping quiz creation.`
                  );
                  // Skip this corrupted quiz lesson
                  continue;
                }

                // Create real quiz
                quizPayload.userId = req.user?.id || req.userId || null; // Add userId
                quizPayload.roleCreated = "instructor"; // Add role
                const realQuiz = await createQuizFromData(quizPayload);

                // Use real quiz ID
                finalQuizIds = [realQuiz._id];
                lessonType = "quiz";
              } catch (error) {
                console.error(
                  `❌ Failed to create quiz from temp data:`,
                  error.message
                );
                // Skip this lesson if quiz creation fails
                continue;
              }
            }
          } else {
            // Skip this lesson or treat as regular lesson
          }
        }
        // Handle existing quiz IDs
        else if (
          Array.isArray(lessonData.quizIds) &&
          lessonData.quizIds.length > 0
        ) {
          finalQuizIds = lessonData.quizIds;
          lessonType = "quiz"; // Force type to quiz if quizIds present
        } else if (lessonData.quizId && lessonData.quizId.trim() !== "") {
          // Handle single quizId (maybe frontend sends quizId instead of quizIds)
          finalQuizIds = [lessonData.quizId];
          lessonType = "quiz";
        } else if (
          lessonData.quiz &&
          typeof lessonData.quiz === "object" &&
          lessonData.quiz._id
        ) {
          // Handle quiz object with _id
          finalQuizIds = [lessonData.quiz._id];
          lessonType = "quiz";
        } else if (
          lessonData.quiz &&
          typeof lessonData.quiz === "string" &&
          lessonData.quiz.trim() !== ""
        ) {
          // Handle quiz as string ID
          finalQuizIds = [lessonData.quiz];
          lessonType = "quiz";
        } else if (lessonType === "quiz") {
          // If type is explicitly set to quiz but no quizIds, skip
        }

        // If lesson is a quiz, ensure quizIds is present and non-empty
        if (lessonType === "quiz") {
          if (finalQuizIds.length === 0) {
            // Skip invalid quiz lesson
            console.log(
              "❌ Skipping quiz lesson without valid quizIds:",
              lessonData.title
            );
            continue;
          }
        }

        const lessonPayload = {
          courseId: savedCourse._id,
          sectionId: savedSection._id,
          title: lessonData.title,
          description: lessonData.description || "",
          lessonNotes: notes,
          materialUrl: mediaUrl,
          duration: lessonData.duration || 0,
          order: lessonData.order || 0,
          type: lessonType,
          quizIds: finalQuizIds,
        };

        let lesson;
        if (lessonData._id) {
          // Update existing lesson
          lesson = await Lesson.findOneAndUpdate(
            { _id: lessonData._id, sectionId: savedSection._id },
            lessonPayload,
            { new: true, runValidators: true }
          );
          if (!lesson) continue;
        } else {
          // Create new lesson
          lesson = new Lesson(lessonPayload);
          await lesson.save();
        }
        createdLessonIds.push(lesson._id);
      }

      // Gán lessons vào section
      savedSection.lessons = createdLessonIds;
      await savedSection.save();

      createdSectionIds.push(savedSection._id);
    }

    // Gán sections vào course
    if (createdSectionIds.length > 0) {
      savedCourse.sections = createdSectionIds;
      await savedCourse.save();
    }

    // Populate lại course để trả về đầy đủ thông tin
    const fullPopulatedCourse = await Course.findById(savedCourse._id)
      .populate({ path: "sections", populate: { path: "lessons" } })
      .populate("categoryIds", "name")
      .populate("discountId", "discountCode value type");

    res.status(201).json({
      success: true,
      message: "Course created successfully",
      data: fullPopulatedCourse,
    });
  } catch (error) {
    console.error("Error in createCourse:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * @desc    Get course by ID with detailed information
 * @route   GET /api/admin/courses/:courseId
 * @access  Private (Admin only)
 */
exports.getCourseById = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId)
      .populate({
        path: "sections",
        populate: {
          path: "lessons",
          select:
            "title description lessonNotes materialUrl duration type quizIds order createdAt updatedAt",
          populate: {
            path: "quizIds",
            select:
              "_id title description questions roleCreated userId createdAt updatedAt",
          },
        },
      })
      .populate("categoryIds", "name")
      .populate("discountId", "discountCode value type status")
      .populate("createdBy", "firstName lastName"); // Only firstName and lastName

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Get enrollment count
    const enrollmentCount = await Enrollment.countDocuments({
      courseId: courseId,
    });

    // Transform course data for frontend editing
    const courseObj = course.toObject();

    // Transform lesson data for frontend compatibility
    if (courseObj.sections) {
      courseObj.sections = courseObj.sections.map((section) => ({
        ...section,
        lessons: section.lessons.map((lesson) => {
          const baseLesson = { ...lesson };

          // Transform based on lesson type
          switch (lesson.type) {
            case "quiz":
              // Transform quiz data for frontend editing
              if (lesson.quizIds && lesson.quizIds.length > 0) {
                const quiz = lesson.quizIds[0]; // Take first quiz
                baseLesson.quizData = quiz
                  ? {
                      title: quiz.title,
                      description: quiz.description,
                      questions: quiz.questions,
                      roleCreated: quiz.roleCreated,
                      userId: quiz.userId,
                    }
                  : null;
              }
              break;

            case "video":
              // Ensure video URL is available for frontend
              baseLesson.videoUrl = lesson.materialUrl || lesson.videoUrl;

              // Add file information for video editing
              if (baseLesson.videoUrl) {
                const fileName = extractFileNameFromUrl(baseLesson.videoUrl);
                baseLesson.fileInfo = {
                  type: "video",
                  url: baseLesson.videoUrl,
                  fileName: fileName,
                  uploadedAt: lesson.createdAt,
                  canDelete: true, // Indicates frontend can show delete option
                };
              }
              break;

            case "article":
              // Ensure article content URL is available for frontend
              baseLesson.articleUrl = lesson.materialUrl;

              // Add file information for article editing
              if (baseLesson.articleUrl) {
                const fileName = extractFileNameFromUrl(baseLesson.articleUrl);
                baseLesson.fileInfo = {
                  type: "article",
                  url: baseLesson.articleUrl,
                  fileName: fileName,
                  uploadedAt: lesson.createdAt,
                  canDelete: true, // Indicates frontend can show delete option
                };
              }
              break;

            default:
              // Keep as is for other types
              break;
          }

          return baseLesson;
        }),
      }));
    }

    const courseData = {
      ...courseObj,
      enrollmentCount,
    };

    res.status(200).json({
      success: true,
      data: courseData,
    });
  } catch (error) {
    console.error("Error in getCourseById:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update course by ID
 * @route   PUT /api/admin/courses/:courseId
 * @access  Private (Admin only)
 */
exports.updateCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const updateData = { ...req.body };

    // Check if course exists
    const existingCourse = await Course.findById(courseId);
    if (!existingCourse) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    // Validate and normalize categoryIds
    const validCategories = await extractValidCategoryIds(updateData);
    if (validCategories.length > 0) {
      updateData.categoryIds = validCategories;
    }

    // Validate discountId if provided
    if (updateData.discountId) {
      const discount = await Discount.findById(updateData.discountId);
      if (!discount) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid discount ID" });
      }
    }

    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.level) updateData.level = updateData.level.toLowerCase();
    if (updateData.language)
      updateData.language = updateData.language.toLowerCase();
    if (updateData.subtitleLanguage)
      updateData.subtitleLanguage = updateData.subtitleLanguage.toLowerCase();

    // === Handle sections and lessons update ===
    const Section = require("../models/sectionModel");
    const Lesson = require("../models/lessonModel");
    let newSectionIds = [];
    let sectionIdMap = new Map(); // oldId -> newId
    let lessonIdMap = new Map(); // oldId -> newId
    const inputSections = Array.isArray(updateData.sections)
      ? updateData.sections
      : [];
    // Get all current section IDs of the course
    const currentSections = await Section.find({ courseId });
    const currentSectionIds = currentSections.map((s) => s._id.toString());
    // Track sections to delete
    let keepSectionIds = [];
    for (const sectionData of inputSections) {
      let section;
      if (sectionData._id) {
        // Update existing section
        section = await Section.findOneAndUpdate(
          { _id: sectionData._id, courseId },
          { name: sectionData.name, order: sectionData.order || 0 },
          { new: true, runValidators: true }
        );
        if (!section) continue;
      } else {
        // Create new section
        section = new Section({
          name: sectionData.name,
          courseId,
          order: sectionData.order || 0,
          lessons: [],
        });
        await section.save();
      }
      newSectionIds.push(section._id);
      sectionIdMap.set(sectionData._id, section._id);
      keepSectionIds.push(section._id.toString());
      // === Handle lessons in this section ===
      const inputLessons = Array.isArray(sectionData.lessons)
        ? sectionData.lessons
        : [];
      // Get all current lesson IDs of the section
      const currentLessons = await Lesson.find({ sectionId: section._id });
      const currentLessonIds = currentLessons.map((l) => l._id.toString());
      let keepLessonIds = [];
      for (const lessonData of inputLessons) {
        // Map lessonNotes -> lessonNotes (use lessonNotes as the field in DB)
        // Accept both lessonNotes and lectureNotes for backward compatibility, but always use lessonNotes in DB
        let notes = "";
        if (lessonData.lessonNotes !== undefined) {
          notes = lessonData.lessonNotes;
        } else if (lessonData.lectureNotes !== undefined) {
          notes = lessonData.lectureNotes;
        }
        // Normalize lesson fields similar to createCourse logic
        let lessonType = lessonData.type || "video";
        const mediaUrl = lessonData.materialUrl || lessonData.videoUrl || "";

        // Auto-detect quiz lessons: check if lesson has quizId or quiz-related data
        let finalQuizIds = [];

        // Handle quiz data from frontend (parsed but not saved yet)
        if (lessonData.quizData && typeof lessonData.quizData === "object") {
          // Quiz data exists - extract quiz ID for lesson reference
          const quizId = lessonData.quizData._id || lessonData.quizData.id;

          if (quizId && quizId.toString().trim() !== "") {
            console.log(
              `� Update: Found quiz ID for lesson: ${quizId} (${lessonData.quizData.title})`
            );
            if (!quizId.toString().startsWith("temp_")) {
              // Real quiz ID - use directly
              finalQuizIds = [quizId];
              lessonType = "quiz";
            } else {
              // Temporary ID - create real quiz from quiz data
              try {
                const { createQuizFromData } = require("./quizController");

                // Prepare quiz data for creation
                const quizPayload = {
                  title: lessonData.quizData.title,
                  description: lessonData.quizData.description || "",
                  questions: lessonData.quizData.questions || [],
                  timeLimit: lessonData.quizData.timeLimit || null,
                  passingScore: lessonData.quizData.passingScore || 70,
                  maxAttempts: lessonData.quizData.maxAttempts || 3,
                  randomizeQuestions:
                    lessonData.quizData.randomizeQuestions || false,
                  showCorrectAnswers:
                    lessonData.quizData.showCorrectAnswers || true,
                };

                // Create real quiz
                const realQuiz = await createQuizFromData(quizPayload);

                // Use real quiz ID
                finalQuizIds = [realQuiz._id];
                lessonType = "quiz";
              } catch (error) {
                console.error(
                  `❌ Update: Failed to create quiz from temp data:`,
                  error.message
                );
                // Skip this lesson if quiz creation fails
                continue;
              }
            }
          } else {
            // Skip this lesson or treat as regular lesson
          }
        }
        // Handle existing quiz IDs
        else if (
          Array.isArray(lessonData.quizIds) &&
          lessonData.quizIds.length > 0
        ) {
          finalQuizIds = lessonData.quizIds;
          lessonType = "quiz"; // Force type to quiz if quizIds present
        } else if (lessonData.quizId && lessonData.quizId.trim() !== "") {
          // Handle single quizId (maybe frontend sends quizId instead of quizIds)
          finalQuizIds = [lessonData.quizId];
          lessonType = "quiz";
        } else if (
          lessonData.quiz &&
          typeof lessonData.quiz === "object" &&
          lessonData.quiz._id
        ) {
          // Handle quiz object with _id
          finalQuizIds = [lessonData.quiz._id];
          lessonType = "quiz";
        } else if (
          lessonData.quiz &&
          typeof lessonData.quiz === "string" &&
          lessonData.quiz.trim() !== ""
        ) {
          // Handle quiz as string ID
          finalQuizIds = [lessonData.quiz];
          lessonType = "quiz";
        } else if (lessonType === "quiz") {
          // If type is explicitly set to quiz but no quizIds, log warning
          console.log(
            "⚠️ Update: Lesson marked as quiz but no quizIds found:",
            lessonData.title
          );
        }

        if (lessonType === "quiz") {
          if (finalQuizIds.length === 0) {
            // Skip invalid quiz lesson
            console.log(
              "❌ Update: Skipping quiz lesson without valid quizIds:",
              lessonData.title
            );
            continue;
          }
        }

        const lessonPayload = {
          title: lessonData.title,
          description: lessonData.description || "",
          lessonNotes: notes,
          materialUrl: mediaUrl,
          duration: lessonData.duration || 0,
          order: lessonData.order || 0,
          type: lessonType,
          quizIds: finalQuizIds,
        };

        let lesson;
        if (lessonData._id) {
          lesson = await Lesson.findOneAndUpdate(
            { _id: lessonData._id, sectionId: section._id },
            lessonPayload,
            { new: true, runValidators: true }
          );
          if (!lesson) continue;
        } else {
          lesson = new Lesson({
            courseId,
            sectionId: section._id,
            ...lessonPayload,
          });
          await lesson.save();
        }
        keepLessonIds.push(lesson._id.toString());
        lessonIdMap.set(lessonData._id, lesson._id);
      }
      // Remove lessons not in keepLessonIds
      const lessonsToDelete = currentLessonIds.filter(
        (id) => !keepLessonIds.includes(id)
      );
      if (lessonsToDelete.length > 0) {
        await Lesson.deleteMany({ _id: { $in: lessonsToDelete } });
      }
      // Update section.lessons
      section.lessons = keepLessonIds;
      await section.save();
    }
    // Remove sections not in keepSectionIds
    const sectionsToDelete = currentSectionIds.filter(
      (id) => !keepSectionIds.includes(id)
    );
    if (sectionsToDelete.length > 0) {
      // Also delete all lessons in these sections
      await Lesson.deleteMany({ sectionId: { $in: sectionsToDelete } });
      await Section.deleteMany({ _id: { $in: sectionsToDelete } });
    }
    // Update course.sections
    updateData.sections = newSectionIds;
    // === End handle sections/lessons ===

    // Update the course
    const updatedCourse = await Course.findByIdAndUpdate(courseId, updateData, {
      new: true,
      runValidators: true,
    })
      .populate({
        path: "sections",
        populate: {
          path: "lessons",
          select:
            "title description lessonNotes materialUrl duration type quizIds order",
        },
      })
      .populate("categoryIds", "name")
      .populate("discountId", "discountCode value type");

    res.status(200).json({
      success: true,
      message: "Course updated successfully",
      data: updatedCourse,
    });
  } catch (error) {
    console.error("Error in updateCourse:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * @desc    Delete course by ID
 * @route   DELETE /api/admin/courses/:courseId
 * @access  Private (Admin only)
 */
exports.deleteCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if there are any enrollments for this course
    const enrollmentCount = await Enrollment.countDocuments({
      courseId: courseId,
    });

    if (enrollmentCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete course. There are ${enrollmentCount} students enrolled in this course.`,
      });
    }

    // Delete the course
    await Course.findByIdAndDelete(courseId);

    res.status(200).json({
      success: true,
      message: "Course deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteCourse:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Create a new section for a course
 * @route   POST /api/admin/courses/:courseId/sections
 * @access  Private (Admin only)
 */
exports.createSection = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { name, order } = req.body;

    // Validate required fields
    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Section name is required",
      });
    }

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Create new section
    const newSection = new Section({
      name: name.trim(),
      courseId,
      order: order || 0,
      lessons: [],
    });

    const savedSection = await newSection.save();

    // Add section to course's sections array
    course.sections.push(savedSection._id);
    await course.save();

    res.status(201).json({
      success: true,
      message: "Section created successfully",
      data: savedSection,
    });
  } catch (error) {
    console.error("Error in createSection:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all sections for a course
 * @route   GET /api/admin/courses/:courseId/sections
 * @access  Private (Admin only)
 */
exports.getCourseSections = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Get sections with lessons populated
    const sections = await Section.find({ courseId })
      .populate({
        path: "lessons",
        select:
          "title description lessonNotes materialUrl duration type quizIds order",
        options: { sort: { order: 1 } },
      })
      .sort({ order: 1 });

    res.status(200).json({
      success: true,
      data: sections,
    });
  } catch (error) {
    console.error("Error in getCourseSections:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update a section
 * @route   PUT /api/admin/courses/:courseId/sections/:sectionId
 * @access  Private (Admin only)
 */
exports.updateSection = async (req, res) => {
  try {
    const { courseId, sectionId } = req.params;
    const { name, order } = req.body;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if section exists and belongs to the course
    const section = await Section.findOne({ _id: sectionId, courseId });
    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    // Update section
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (order !== undefined) updateData.order = order;

    const updatedSection = await Section.findByIdAndUpdate(
      sectionId,
      updateData,
      { new: true, runValidators: true }
    ).populate({
      path: "lessons",
      select: "title description materialUrl duration type quizIds order",
      options: { sort: { order: 1 } },
    });

    res.status(200).json({
      success: true,
      message: "Section updated successfully",
      data: updatedSection,
    });
  } catch (error) {
    console.error("Error in updateSection:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete a section
 * @route   DELETE /api/admin/courses/:courseId/sections/:sectionId
 * @access  Private (Admin only)
 */
exports.deleteSection = async (req, res) => {
  try {
    const { courseId, sectionId } = req.params;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if section exists and belongs to the course
    const section = await Section.findOne({ _id: sectionId, courseId });
    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    // Check if section has lessons
    if (section.lessons.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete section. Please remove all lessons first.",
      });
    }

    // Remove section from course's sections array
    course.sections = course.sections.filter(
      (id) => id.toString() !== sectionId
    );
    await course.save();

    // Delete the section
    await Section.findByIdAndDelete(sectionId);

    res.status(200).json({
      success: true,
      message: "Section deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteSection:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Create a new lesson in a section
 * @route   POST /api/admin/courses/:courseId/sections/:sectionId/lessons
 * @access  Private (Admin only)
 */
exports.createLesson = async (req, res) => {
  try {
    const { courseId, sectionId } = req.params;
    const {
      title,
      description,
      lessonNotes,
      materialUrl,
      duration,
      order,
      type,
      quizIds,
    } = req.body;

    // Validate required fields
    if (!title || title.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Lesson title is required",
      });
    }

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if section exists and belongs to the course
    const section = await Section.findOne({ _id: sectionId, courseId });
    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    // Determine media URL and lesson type
    const mediaUrl = materialUrl || videoUrl || "";
    const lessonType =
      type || (Array.isArray(quizIds) && quizIds.length > 0 ? "quiz" : "video");

    if (
      lessonType === "quiz" &&
      (!Array.isArray(quizIds) || quizIds.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "quizIds are required for quiz lessons",
      });
    }

    // Create new lesson
    const newLesson = new Lesson({
      courseId,
      sectionId,
      title: title.trim(),
      description: description || "",
      lessonNotes: lessonNotes || "",
      materialUrl: mediaUrl,
      duration: duration || 0,
      order: order || 0,
      type: lessonType,
      quizIds: Array.isArray(quizIds) ? quizIds : [],
    });

    const savedLesson = await newLesson.save();

    // Add lesson to section's lessons array
    section.lessons.push(savedLesson._id);
    await section.save();

    res.status(201).json({
      success: true,
      message: "Lesson created successfully",
      data: savedLesson,
    });
  } catch (error) {
    console.error("Error in createLesson:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update a lesson
 * @route   PUT /api/admin/courses/:courseId/lessons/:lessonId
 * @access  Private (Admin only)
 */
exports.updateLesson = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const {
      title,
      description,
      lessonNotes,
      materialUrl,
      duration,
      order,
      type,
      quizIds,
    } = req.body;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if lesson exists and belongs to the course
    const lesson = await Lesson.findOne({ _id: lessonId, courseId });
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      });
    }

    // Update lesson
    const mediaUrl = materialUrl || videoUrl;
    const lessonType = type;

    // If updating to quiz type, ensure quizIds provided
    if (
      lessonType === "quiz" &&
      (!Array.isArray(quizIds) || quizIds.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "quizIds are required for quiz lessons",
      });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description;
    if (lessonNotes !== undefined) updateData.lessonNotes = lessonNotes;
    if (mediaUrl !== undefined) {
      updateData.materialUrl = mediaUrl;
    }
    if (duration !== undefined) updateData.duration = duration;
    if (order !== undefined) updateData.order = order;
    if (lessonType !== undefined) updateData.type = lessonType;
    if (quizIds !== undefined)
      updateData.quizIds = Array.isArray(quizIds) ? quizIds : [];

    const updatedLesson = await Lesson.findByIdAndUpdate(lessonId, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Lesson updated successfully",
      data: updatedLesson,
    });
  } catch (error) {
    console.error("Error in updateLesson:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete a lesson
 * @route   DELETE /api/admin/courses/:courseId/lessons/:lessonId
 * @access  Private (Admin only)
 */
exports.deleteLesson = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if lesson exists and belongs to the course
    const lesson = await Lesson.findOne({ _id: lessonId, courseId });
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      });
    }

    // Remove lesson from section's lessons array
    const section = await Section.findById(lesson.sectionId);
    if (section) {
      section.lessons = section.lessons.filter(
        (id) => id.toString() !== lessonId
      );
      await section.save();
    }

    // Delete the lesson
    await Lesson.findByIdAndDelete(lessonId);

    res.status(200).json({
      success: true,
      message: "Lesson deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteLesson:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get a specific lesson
 * @route   GET /api/admin/courses/:courseId/lessons/:lessonId
 * @access  Private (Admin only)
 */
exports.getLesson = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Get lesson with section information
    const lesson = await Lesson.findOne({ _id: lessonId, courseId }).populate(
      "sectionId",
      "name"
    );

    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      });
    }

    res.status(200).json({
      success: true,
      data: lesson,
    });
  } catch (error) {
    console.error("Error in getLesson:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Move lesson video from temporary to course folder
 * @route   POST /api/admin/courses/:courseId/lessons/:lessonId/move-video
 * @access  Private (Admin only)
 */
exports.moveLessonVideo = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    // support both legacy videoUrl and new materialUrl in request body
    const { videoUrl, materialUrl } = req.body;
    const inputUrl = videoUrl || materialUrl;

    if (!inputUrl) {
      return res.status(400).json({
        success: false,
        message: "Video or material URL is required",
      });
    }

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if lesson exists and belongs to the course
    const lesson = await Lesson.findOne({ _id: lessonId, courseId });
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      });
    }

    // Extract source destination from video URL
    const sourceDestination = extractSourceDestination(videoUrl);
    if (!sourceDestination) {
      return res.status(400).json({
        success: false,
        message: "Invalid video URL format",
      });
    }

    // Move video from temporary to course folder
    const moveResult = await moveFileFromTemporaryToCourse(
      sourceDestination,
      courseId,
      "section-data"
    );

    // Update lesson with new material URL
    lesson.materialUrl = moveResult.newUrl;
    // Ensure lesson.type is video
    lesson.type = lesson.type || "video";
    await lesson.save();

    res.status(200).json({
      success: true,
      message: "Lesson video moved successfully",
      data: {
        lessonId,
        oldUrl: videoUrl,
        newUrl: moveResult.newUrl,
        moveResult,
      },
    });
  } catch (error) {
    console.error("Error in moveLessonVideo:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

function extractSourceDestination(firebaseUrl) {
  if (!firebaseUrl || typeof firebaseUrl !== "string") {
    console.log("❌ Invalid URL provided:", firebaseUrl);
    return null;
  }

  console.log("🔍 Extracting source destination from URL:", firebaseUrl);

  try {
    // Handle Firebase Storage URL format
    // https://firebasestorage.googleapis.com/v0/b/bucket/o/path%2Fto%2Ffile?alt=media
    if (firebaseUrl.includes("firebasestorage.googleapis.com")) {
      const url = new URL(firebaseUrl);
      const match = url.pathname.match(/\/o\/(.+)$/);
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        console.log("✅ Extracted from Firebase URL:", decoded);
        return decoded;
      }
    }

    // Handle direct Google Storage URL format
    // https://storage.googleapis.com/bucket/path/to/file
    if (firebaseUrl.includes("storage.googleapis.com")) {
      const url = new URL(firebaseUrl);
      const pathParts = url.pathname.split("/");
      if (pathParts.length >= 3) {
        // Remove bucket name and leading slash
        const filePath = pathParts.slice(2).join("/");
        console.log("✅ Extracted from Google Storage URL:", filePath);
        return filePath;
      }
    }

    // Handle signed URL format
    // https://storage.googleapis.com/bucket/path/to/file?X-Goog-Algorithm=...
    if (
      firebaseUrl.includes("storage.googleapis.com") &&
      firebaseUrl.includes("X-Goog-Algorithm")
    ) {
      const url = new URL(firebaseUrl);
      const pathParts = url.pathname.split("/");
      if (pathParts.length >= 3) {
        const filePath = pathParts.slice(2).join("/");
        console.log("✅ Extracted from signed URL:", filePath);
        return filePath;
      }
    }

    // Handle custom domain or other formats
    // Try to extract path after the domain
    const url = new URL(firebaseUrl);
    const path = url.pathname;
    if (path && path.length > 1) {
      // Remove leading slash
      const filePath = path.substring(1);
      console.log("✅ Extracted from custom URL:", filePath);
      return filePath;
    }

    console.log("❌ Could not extract path from URL format");
    return null;
  } catch (error) {
    console.log("❌ Error parsing URL:", error.message);
    return null;
  }
}

/**
 * @desc    Get dashboard statistics (revenue, users, etc.)
 * @route   GET /api/admin/stats
 * @access  Private (Admin only)
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalUsers,
      totalCourses,
      // THAY ĐỔI: Đổi tên biến để nhận kết quả từ aggregation
      totalEnrollmentsResult,
      totalRevenueResult,
      monthlySales,
      newUsersThisMonth,
      latestTransactions,
      courseRatingData,
    ] = await Promise.all([
      User.countDocuments(),
      Course.countDocuments(),
      // THAY ĐỔI: Dùng aggregation trên User để tính tổng số lượt ghi danh
      User.aggregate([
        // Giai đoạn 1: Tính số lượng khóa học mỗi người dùng đã đăng ký
        {
          $project: {
            enrollmentCount: { $size: { $ifNull: ["$enrolledCourses", []] } },
          },
        },
        // Giai đoạn 2: Tính tổng số lượt đăng ký từ tất cả người dùng
        {
          $group: {
            _id: null,
            total: { $sum: "$enrollmentCount" },
          },
        },
      ]),
      Transaction.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: new Date(today.getFullYear(), 0, 1) },
          },
        },
        {
          $group: {
            _id: { month: { $month: "$createdAt" } },
            total: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.month": 1 } },
      ]),
      User.countDocuments({ createdAt: { $gte: firstDayOfMonth } }),
      Transaction.find({ status: "completed" })
        .sort({ createdAt: -1 })
        .limit(5),
      Course.aggregate([
        { $match: { rating: { $exists: true, $ne: null } } },
        {
          $facet: {
            overallStats: [
              {
                $group: {
                  _id: null,
                  averageRating: { $avg: "$rating" },
                  totalCoursesWithRating: { $sum: 1 },
                },
              },
            ],
            ratingBreakdown: [
              { $group: { _id: { $round: "$rating" }, count: { $sum: 1 } } },
              { $sort: { _id: -1 } },
            ],
          },
        },
      ]),
    ]);

    // Xử lý dữ liệu rating (giữ nguyên)
    let courseRating = { averageRating: 0, breakdown: [] };
    if (
      courseRatingData.length > 0 &&
      courseRatingData[0].overallStats.length > 0
    ) {
      const stats = courseRatingData[0].overallStats[0];
      const breakdownData = courseRatingData[0].ratingBreakdown;
      const totalRatedCourses = stats.totalCoursesWithRating;
      courseRating.averageRating = stats.averageRating;
      const breakdownMap = new Map(
        breakdownData.map((item) => [item._id, item.count])
      );
      courseRating.breakdown = [5, 4, 3, 2, 1].map((star) => {
        const count = breakdownMap.get(star) || 0;
        return {
          stars: star,
          count: count,
          percentage:
            totalRatedCourses > 0
              ? Math.round((count / totalRatedCourses) * 100)
              : 0,
        };
      });
    }

    // Xử lý doanh thu theo tháng (giữ nguyên)
    const formattedMonthlySales = Array.from({ length: 12 }, (_, i) => {
      const monthData = monthlySales.find((m) => m._id.month === i + 1);
      return {
        month: i + 1,
        revenue: parseFloat(monthData?.total.toString() || "0"),
      };
    });

    res.status(200).json({
      totalUsers,
      totalCourses,
      // THAY ĐỔI: Lấy kết quả totalEnrollments từ aggregation
      totalEnrollments: totalEnrollmentsResult[0]?.total || 0,
      totalRevenue: parseFloat(totalRevenueResult[0]?.total.toString() || "0"),
      newUsersThisMonth,
      monthlySales: formattedMonthlySales,
      latestTransactions,
      courseRating,
    });
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu thống kê:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy dữ liệu thống kê." });
  }
};

/**
 * @desc    Get all categories (admin)
 * @route   GET /api/admin/categories
 * @access  Private (Admin only)
 */
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({}, { _id: 1, name: 1 });
    res.status(200).json({
      success: true,
      data: categories,
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
 * @desc    Delete lesson file (video/article) and update lesson
 * @route   DELETE /api/admin/lessons/:lessonId/file
 * @access  Private (Admin only)
 */
exports.deleteLessonFile = async (req, res) => {
  try {
    const { lessonId } = req.params;

    // Find the lesson
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      });
    }

    // Check if lesson has a file to delete
    if (!lesson.materialUrl) {
      return res.status(400).json({
        success: false,
        message: "Lesson does not have any file to delete",
      });
    }

    // Extract file path from Firebase URL for deletion
    const fileUrl = lesson.materialUrl;
    let deletionSuccess = false;

    try {
      // Attempt to delete file from Firebase Storage
      if (fileUrl.includes("firebasestorage.googleapis.com")) {
        // Extract file path from Firebase URL
        const bucket = admin.storage().bucket();
        const decodedUrl = decodeURIComponent(fileUrl);

        // Extract the file path from Firebase storage URL
        const pathMatch = decodedUrl.match(/\/o\/(.+?)\?/);
        if (pathMatch && pathMatch[1]) {
          const filePath = decodeURIComponent(pathMatch[1]);
          const file = bucket.file(filePath);

          // Check if file exists before deleting
          const [exists] = await file.exists();
          if (exists) {
            await file.delete();
            deletionSuccess = true;
            console.log(`✅ Successfully deleted file: ${filePath}`);
          } else {
            console.log(`ℹ️ File not found in storage: ${filePath}`);
            deletionSuccess = true; // Consider as success since file doesn't exist
          }
        }
      }
    } catch (fileError) {
      console.error("❌ Error deleting file from storage:", fileError);
      // Continue anyway to update the lesson record
    }

    // Update lesson to remove materialUrl
    lesson.materialUrl = "";
    await lesson.save();

    res.status(200).json({
      success: true,
      message: deletionSuccess
        ? "File deleted successfully and lesson updated"
        : "Lesson updated (file may not have been deleted from storage)",
      data: {
        lessonId: lesson._id,
        title: lesson.title,
        materialUrl: lesson.materialUrl,
        fileDeleted: deletionSuccess,
      },
    });
  } catch (error) {
    console.error("Error in deleteLessonFile:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update lesson file (video/article) with new uploaded file
 * @route   PUT /api/admin/lessons/:lessonId/file
 * @access  Private (Admin only)
 */
exports.updateLessonFile = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { fileUrl, fileName, fileType } = req.body;

    // Validate required fields
    if (!fileUrl) {
      return res.status(400).json({
        success: false,
        message: "File URL is required",
      });
    }

    // Find the lesson
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      });
    }

    // Store old file URL for deletion
    const oldFileUrl = lesson.materialUrl;

    // Update lesson with new file URL
    lesson.materialUrl = fileUrl;
    await lesson.save();

    // Delete old file if it exists
    let oldFileDeleted = false;
    if (oldFileUrl && oldFileUrl !== fileUrl) {
      try {
        if (oldFileUrl.includes("firebasestorage.googleapis.com")) {
          const bucket = admin.storage().bucket();
          const decodedUrl = decodeURIComponent(oldFileUrl);

          const pathMatch = decodedUrl.match(/\/o\/(.+?)\?/);
          if (pathMatch && pathMatch[1]) {
            const filePath = decodeURIComponent(pathMatch[1]);
            const file = bucket.file(filePath);

            const [exists] = await file.exists();
            if (exists) {
              await file.delete();
              oldFileDeleted = true;
              console.log(`✅ Successfully deleted old file: ${filePath}`);
            }
          }
        }
      } catch (fileError) {
        console.error("❌ Error deleting old file from storage:", fileError);
      }
    }

    // Return updated lesson with file info
    const fileName_extracted = extractFileNameFromUrl(fileUrl);

    res.status(200).json({
      success: true,
      message: "Lesson file updated successfully",
      data: {
        lessonId: lesson._id,
        title: lesson.title,
        type: lesson.type,
        materialUrl: lesson.materialUrl,
        fileInfo: {
          type: fileType || lesson.type,
          url: fileUrl,
          fileName: fileName || fileName_extracted,
          uploadedAt: new Date(),
          canDelete: true,
        },
        oldFileDeleted,
      },
    });
  } catch (error) {
    console.error("Error in updateLessonFile:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all courses pending approval
 * @route   GET /api/admin/courses/pending
 * @access  Private (Admin only)
 */
exports.getPendingCourses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build query object - only pending courses
    const query = { status: "pending" };

    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { subTitle: { $regex: search, $options: "i" } },
        { "detail.description": { $regex: search, $options: "i" } },
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query with pagination
    const courses = await Course.find(query)
      .populate("categoryIds", "name")
      .populate("createdBy", "firstName lastName email userImage")
      .populate({
        path: "sections",
        populate: { path: "lessons" },
      })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalCourses = await Course.countDocuments(query);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCourses / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    // Get enrollment count for each course (should be 0 for pending courses)
    const coursesWithEnrollmentCount = await Promise.all(
      courses.map(async (course) => {
        const enrollmentCount = await Enrollment.countDocuments({
          courseId: course._id,
        });
        const courseObj = course.toObject();
        return {
          ...courseObj,
          enrollmentCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: coursesWithEnrollmentCount,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCourses,
        hasNextPage,
        hasPrevPage,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error in getPendingCourses:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Approve a course
 * @route   POST /api/admin/courses/:courseId/approve
 * @access  Private (Admin only)
 */
exports.approveCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Find the course
    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if course is in pending status
    if (course.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot approve course. Current status is: ${course.status}`,
      });
    }

    // Update course status to active
    course.status = "active";
    course.approvedAt = new Date();
    course.rejectionReason = undefined; // Clear any previous rejection reason
    await course.save();

    // Populate course details for response
    const updatedCourse = await Course.findById(courseId)
      .populate("categoryIds", "name")
      .populate("createdBy", "firstName lastName email")
      .populate({
        path: "sections",
        populate: { path: "lessons" },
      });

    res.status(200).json({
      success: true,
      message: "Course approved successfully",
      data: updatedCourse,
    });
  } catch (error) {
    console.error("Error in approveCourse:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Reject a course
 * @route   POST /api/admin/courses/:courseId/reject
 * @access  Private (Admin only)
 */
exports.rejectCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { rejectionReason } = req.body;

    // Validate rejection reason
    if (!rejectionReason || rejectionReason.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    // Find the course
    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if course is in pending status
    if (course.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot reject course. Current status is: ${course.status}`,
      });
    }

    // Update course status to rejected
    course.status = "rejected";
    course.rejectedAt = new Date();
    course.rejectionReason = rejectionReason.trim();
    await course.save();

    // Populate course details for response
    const updatedCourse = await Course.findById(courseId)
      .populate("categoryIds", "name")
      .populate("createdBy", "firstName lastName email")
      .populate({
        path: "sections",
        populate: { path: "lessons" },
      });

    res.status(200).json({
      success: true,
      message: "Course rejected successfully",
      data: updatedCourse,
    });
  } catch (error) {
    console.error("Error in rejectCourse:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get course approval statistics
 * @route   GET /api/admin/courses/approval-stats
 * @access  Private (Admin only)
 */
exports.getCourseApprovalStats = async (req, res) => {
  try {
    const [
      pendingCount,
      approvedCount,
      rejectedCount,
      draftCount,
      totalCourses,
    ] = await Promise.all([
      Course.countDocuments({ status: "pending" }),
      Course.countDocuments({ status: "active" }),
      Course.countDocuments({ status: "rejected" }),
      Course.countDocuments({ status: "draft" }),
      Course.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        draft: draftCount,
        total: totalCourses,
      },
    });
  } catch (error) {
    console.error("Error in getCourseApprovalStats:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Deactivate a course (set status to inactive)
 * @route   POST /api/admin/courses/:courseId/deactivate
 * @access  Private (Admin only)
 */
exports.deactivateCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { reason } = req.body;

    // Find the course
    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if course is currently active
    if (course.status !== "active") {
      return res.status(400).json({
        success: false,
        message: `Cannot deactivate course. Current status is: ${course.status}. Only active courses can be deactivated.`,
      });
    }

    // Update course status to inactive
    const updateData = {
      status: "inactive",
      deactivatedAt: new Date(),
    };

    if (reason) {
      updateData.deactivationReason = reason;
    }

    await Course.updateOne({ _id: courseId }, { $set: updateData });

    // Populate course details for response
    const updatedCourse = await Course.findById(courseId)
      .populate("categoryIds", "name")
      .populate("createdBy", "firstName lastName email")
      .populate({
        path: "sections",
        populate: { path: "lessons" },
      });

    res.status(200).json({
      success: true,
      message: "Course deactivated successfully",
      data: updatedCourse,
    });
  } catch (error) {
    console.error("Error in deactivateCourse:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * @desc    Reactivate a course (set status back to active)
 * @route   POST /api/admin/courses/:courseId/reactivate
 * @access  Private (Admin only)
 */
exports.reactivateCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Find the course
    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if course is currently inactive
    if (course.status !== "inactive") {
      return res.status(400).json({
        success: false,
        message: `Cannot reactivate course. Current status is: ${course.status}. Only inactive courses can be reactivated.`,
      });
    }

    // Update course status to active
    const updateData = {
      status: "active",
      deactivationReason: undefined, // Clear deactivation reason
      reactivatedAt: new Date(),
    };

    await Course.updateOne({ _id: courseId }, { $set: updateData });

    // Populate course details for response
    const updatedCourse = await Course.findById(courseId)
      .populate("categoryIds", "name")
      .populate("createdBy", "firstName lastName email")
      .populate({
        path: "sections",
        populate: { path: "lessons" },
      });

    res.status(200).json({
      success: true,
      message: "Course reactivated successfully",
      data: updatedCourse,
    });
  } catch (error) {
    console.error("Error in reactivateCourse:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all instructor requests
 * @route   GET /api/admin/instructor-requests
 * @access  Private (Admin only)
 */
exports.getInstructorRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build query object
    const query = {};

    // Filter by status (use applicationStatus instead of status)
    if (status) {
      query.applicationStatus = status;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query with pagination
    const requests = await InstructorProfile.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("userId", "firstName lastName email userImage")
      .select(
        "userId phone expertise experience documents applicationStatus rejectionReason appliedAt approvedAt rejectedAt createdAt updatedAt"
      );

    // Get total count for pagination
    const totalRequests = await InstructorProfile.countDocuments(query);

    // Calculate pagination info
    const totalPages = Math.ceil(totalRequests / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    res.status(200).json({
      success: true,
      data: requests,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalRequests,
        hasNextPage,
        hasPrevPage,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error in getInstructorRequests:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Approve instructor request
 * @route   POST /api/admin/instructor-requests/approve
 * @access  Private (Admin only)
 */
exports.approveInstructorRequest = async (req, res) => {
  try {
    const { applicationId } = req.body;

    if (!applicationId) {
      return res
        .status(400)
        .json({ success: false, message: "Application ID is required." });
    }

    const profile = await InstructorProfile.findById(applicationId).populate(
      "userId"
    );

    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Instructor profile not found." });
    }

    // Update profile status
    profile.applicationStatus = "approved";
    profile.approvedAt = new Date();
    await profile.save();

    // Update user role to instructor
    const user = await User.findById(profile.userId);
    if (user) {
      user.role = "instructor";
      await user.save();
    }

    // Send approval email
    const emailContent = instructorApplicationApprovedEmail(
      profile.userId.firstName
    );
    await sendEmail(
      profile.userId.email,
      "Your Instructor Application is Approved!",
      emailContent
    );

    res.status(200).json({
      success: true,
      message: "Instructor request approved successfully.",
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * @desc    Deny instructor request
 * @route   POST /api/admin/instructor-requests/deny
 * @access  Private (Admin only)
 */
exports.denyInstructorRequest = async (req, res) => {
  try {
    const { applicationId, reasons, customReason } = req.body;

    if (!applicationId || !reasons || !Array.isArray(reasons)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid request data." });
    }

    const profile = await InstructorProfile.findById(applicationId).populate(
      "userId"
    );

    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Instructor profile not found." });
    }

    // Update profile status
    profile.applicationStatus = "rejected";
    profile.rejectedAt = new Date();
    const reasonText =
      reasons.join(", ") + (customReason ? `: ${customReason}` : "");
    profile.rejectionReason = reasonText;
    await profile.save();

    // Send denial email
    const emailContent = instructorApplicationDeniedEmail(
      profile.userId.firstName,
      reasonText
    );
    await sendEmail(
      profile.userId.email,
      "Your Instructor Application is Denied",
      emailContent
    );

    res.status(200).json({
      success: true,
      message: "Instructor request denied successfully.",
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};
