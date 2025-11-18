const Feedback = require("../models/feedbackModel");
const Course = require("../models/courseModel");
const User = require("../models/userModel");
const Enrollment = require("../models/enrollmentModel");
const InstructorProfile = require("../models/instructorProfileModel");
const mongoose = require("mongoose");

/**
 * Helper function to update instructor ratings
 */
const updateInstructorRating = async (instructorId) => {
  try {
    // Get all courses by this instructor
    const courses = await Course.find({ createdBy: instructorId });
    const courseIds = courses.map((c) => c._id);

    if (courseIds.length === 0) {
      return;
    }

    // Get all feedbacks for instructor's courses
    const feedbacks = await Feedback.find({
      courseId: { $in: courseIds },
    });

    const totalReviews = feedbacks.length;
    const averageRating =
      totalReviews > 0
        ? feedbacks.reduce((sum, feedback) => sum + feedback.rateStar, 0) /
          totalReviews
        : 0;

    // Update instructor profile
    await InstructorProfile.findOneAndUpdate(
      { userId: instructorId },
      {
        totalReviews: totalReviews,
        averageRating: parseFloat(averageRating.toFixed(1)),
        totalCourses: courses.length,
      }
    );
  } catch (error) {
    console.error("Error updating instructor rating:", error);
  }
};

/**
 * @desc    Get all feedback for a specific course
 * @route   GET /api/courses/:courseId/feedback
 * @access  Public
 */
exports.getCourseFeedback = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    // Validate courseId format
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }

    // Check if course exists
    const course = await Course.findOne({ _id: courseId });
    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    const skip = (page - 1) * limit;

    // Get feedback with user information - try both string and ObjectId
    const feedback = await Feedback.find({
      courseId: courseId,
    })
      .populate("userId", "firstName lastName userImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalFeedback = await Feedback.countDocuments({
      courseId: courseId,
    });
    const totalPages = Math.ceil(totalFeedback / limit);

    // Calculate average rating
    const allFeedbackForRating = await Feedback.find({
      courseId: courseId,
    });

    const averageRating =
      allFeedbackForRating.length > 0
        ? allFeedbackForRating.reduce((sum, fb) => sum + fb.rateStar, 0) /
          allFeedbackForRating.length
        : 0;

    res.status(200).json({
      feedback,
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalFeedback,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Create new feedback for a course
 * @route   POST /api/courses/:courseId/feedback
 * @access  Private (User must be logged in)
 */
exports.createCourseFeedback = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { content, rateStar } = req.body;
    const userId = req.user.id;

    // Không còn validate content là bắt buộc
    if (!rateStar || rateStar < 1 || rateStar > 5) {
      return res
        .status(400)
        .json({ message: "Rating must be between 1 and 5." });
    }

    // Validate courseId format
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }

    // Check if course exists
    const course = await Course.findOne({ _id: courseId });
    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    // Check if user is enrolled in the course using Enrollment table
    const enrollment = await Enrollment.findOne({
      userId: userId,
      courseId: courseId,
      status: { $in: ["enrolled", "completed"] }
    });

    if (!enrollment) {
      return res.status(403).json({
        message: "You must be enrolled in this course to give feedback.",
      });
    }

    // Check if user has already given feedback for this course
    const existingFeedback = await Feedback.findOne({
      courseId: courseId,
      userId,
    });
    if (existingFeedback) {
      return res
        .status(400)
        .json({ message: "You have already given feedback for this course." });
    }

    // Create new feedback
    const newFeedback = new Feedback({
      content: content ? content.trim() : undefined,
      rateStar: parseInt(rateStar),
      courseId: courseId,
      userId,
    });

    await newFeedback.save();

    // Calculate and update course rating
    const allFeedback = await Feedback.find({ courseId: courseId });
    const averageRating =
      allFeedback.length > 0
        ? allFeedback.reduce((sum, fb) => sum + fb.rateStar, 0) / allFeedback.length
        : 0;

    // Update course rating
    await Course.findByIdAndUpdate(courseId, {
      rating: Math.round(averageRating * 10) / 10 // Round to 1 decimal place
    });

    // Update instructor rating
    await updateInstructorRating(course.createdBy);

    // Populate user information for response
    const populatedFeedback = await Feedback.findById(newFeedback._id).populate(
      "userId",
      "firstName lastName userImage"
    );

    res.status(201).json({
      message: "Feedback created successfully.",
      feedback: populatedFeedback,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Update user's feedback for a course
 * @route   PUT /api/courses/:courseId/feedback
 * @access  Private (User must be logged in and own the feedback)
 */
exports.updateCourseFeedback = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { content, rateStar } = req.body;
    const userId = req.user.id;

    // Không còn validate content là bắt buộc
    if (!rateStar || rateStar < 1 || rateStar > 5) {
      return res
        .status(400)
        .json({ message: "Rating must be between 1 and 5." });
    }

    // Validate courseId format
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }

    // Check if user is enrolled in the course using Enrollment table
    const enrollment = await Enrollment.findOne({
      userId: userId,
      courseId: courseId,
      status: { $in: ["enrolled", "completed"] }
    });

    if (!enrollment) {
      return res.status(403).json({
        message: "You must be enrolled in this course to update feedback.",
      });
    }

    // Find the feedback
    const feedback = await Feedback.findOne({
      courseId: courseId,
      userId,
    });
    if (!feedback) {
      return res
        .status(404)
        .json({ message: "Your feedback for this course not found." });
    }

    // Update feedback
    feedback.content = content ? content.trim() : undefined;
    feedback.rateStar = parseInt(rateStar);
    await feedback.save();

    // Calculate and update course rating
    const allFeedback = await Feedback.find({ courseId: courseId });
    const averageRating =
      allFeedback.length > 0
        ? allFeedback.reduce((sum, fb) => sum + fb.rateStar, 0) / allFeedback.length
        : 0;

    // Update course rating
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { rating: Math.round(averageRating * 10) / 10 },
      { new: false } // Get old version to access createdBy
    );

    // Update instructor rating
    if (updatedCourse) {
      await updateInstructorRating(updatedCourse.createdBy);
    }

    // Populate user information for response
    const populatedFeedback = await Feedback.findById(feedback._id).populate(
      "userId",
      "firstName lastName userImage"
    );

    res.status(200).json({
      message: "Feedback updated successfully.",
      feedback: populatedFeedback,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Delete user's feedback for a course
 * @route   DELETE /api/courses/:courseId/feedback/:feedbackId
 * @access  Private (User must be logged in and own the feedback)
 */
exports.deleteCourseFeedback = async (req, res) => {
  try {
    const { courseId, feedbackId } = req.params;
    const userId = req.user.id;

    // Validate courseId format
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }

    // Validate feedbackId format
    if (!mongoose.Types.ObjectId.isValid(feedbackId)) {
      return res.status(400).json({ message: "Invalid feedback ID." });
    }

    // Check if user is enrolled in the course using Enrollment table
    const enrollment = await Enrollment.findOne({
      userId: userId,
      courseId: courseId,
      status: { $in: ["enrolled", "completed"] }
    });

    if (!enrollment) {
      return res.status(403).json({
        message: "You must be enrolled in this course to delete feedback.",
      });
    }

    // Find the feedback
    const feedback = await Feedback.findOne({
      _id: feedbackId,
      courseId: courseId,
      userId,
    });

    if (!feedback) {
      return res.status(404).json({
        message:
          "Feedback not found or you don't have permission to delete it.",
      });
    }

    // Delete the feedback
    await Feedback.findByIdAndDelete(feedbackId);

    // Recalculate and update course rating after deletion
    const allFeedback = await Feedback.find({ courseId: courseId });
    const averageRating =
      allFeedback.length > 0
        ? allFeedback.reduce((sum, fb) => sum + fb.rateStar, 0) / allFeedback.length
        : 0;

    // Update course rating
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { rating: Math.round(averageRating * 10) / 10 },
      { new: false } // Get old version to access createdBy
    );

    // Update instructor rating
    if (updatedCourse) {
      await updateInstructorRating(updatedCourse.createdBy);
    }

    res.status(200).json({ message: "Feedback deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Get average rating for a specific course
 * @route   GET /api/courses/:courseId/average-rating
 * @access  Public
 */
exports.getCourseAverageRating = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Validate courseId format
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }

    // Check if course exists
    const course = await Course.findOne({ _id: courseId });
    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    // Get all feedback for the course
    const allFeedback = await Feedback.find({ courseId: courseId });

    // Calculate average rating
    const averageRating =
      allFeedback.length > 0
        ? allFeedback.reduce((sum, fb) => sum + fb.rateStar, 0) / allFeedback.length
        : 0;
    const roundedAverage = Math.round(averageRating * 10) / 10;

    // Update rating field in Course
    await Course.findByIdAndUpdate(courseId, { rating: roundedAverage });

    res.status(200).json({
      averageRating: roundedAverage, // Round to 1 decimal place
      totalFeedback: allFeedback.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
