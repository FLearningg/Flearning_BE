const Feedback = require("../models/feedbackModel");
const Course = require("../models/courseModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");

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

    // Validate required fields
    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Feedback content is required." });
    }

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

    // Check if user is enrolled in the course using User.enrolledCourses
    const user = await User.findById(userId).select("enrolledCourses");
    if (!user || !user.enrolledCourses.some(cid => cid.toString() === courseId)) {
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
      content: content.trim(),
      rateStar: parseInt(rateStar),
      courseId: courseId,
      userId,
    });

    await newFeedback.save();

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

    // Validate required fields
    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Feedback content is required." });
    }

    if (!rateStar || rateStar < 1 || rateStar > 5) {
      return res
        .status(400)
        .json({ message: "Rating must be between 1 and 5." });
    }

    // Validate courseId format
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }

    // Check if user is enrolled in the course using User.enrolledCourses
    const user = await User.findById(userId).select("enrolledCourses");
    if (!user || !user.enrolledCourses.some(cid => cid.toString() === courseId)) {
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
    feedback.content = content.trim();
    feedback.rateStar = parseInt(rateStar);
    await feedback.save();

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

    // Check if user is enrolled in the course using User.enrolledCourses
    const user = await User.findById(userId).select("enrolledCourses");
    if (!user || !user.enrolledCourses.some(cid => cid.toString() === courseId)) {
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

    res.status(200).json({ message: "Feedback deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
