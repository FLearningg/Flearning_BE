const Course = require("../models/courseModel");
const User = require("../models/userModel");
const Lesson = require("../models/lessonModel");
const Section = require("../models/sectionModel");
const Comment = require("../models/commentModel");
const Discount = require("../models/discountModel");
const Enrollment = require("../models/enrollmentModel");
const mongoose = require("mongoose");

/**
 * @desc    Get details for a specific course
 * @route   GET /api/courses/:courseId
 * @access  Public
 */
exports.getCourseDetails = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId)
      .populate({
        path: "sections",
        populate: {
          path: "lessons",
          model: "Lesson", // tên model chính xác
          options: { sort: { order: 1 } }, // nếu muốn lessons sắp theo thứ tự
        },
        options: { sort: { order: 1 } }, // nếu muốn sections sắp theo thứ tự
      })
      .populate("categoryIds")
      .populate("discountId");

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * @desc    Get courses related to a specific course
 * @route   GET /api/courses/:courseId/related
 * @access  Public
 */
exports.getRelatedCourses = async (req, res) => {
  try {
    const currentCourse = await Course.findById(req.params.courseId);
    if (!currentCourse)
      return res.status(404).json({ message: "Course not found" });

    const relatedCourses = await Course.find({
      categoryId: currentCourse.categoryId,
      _id: { $ne: currentCourse._id },
    }).limit(4);

    res.json(relatedCourses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * @desc    Get details of a specific lesson (user must be enrolled)
 * @route   GET /api/courses/:courseId/lessons/:lessonId
 * @access  Private
 */
exports.getLessonDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId, lessonId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(courseId) ||
      !mongoose.Types.ObjectId.isValid(lessonId)
    ) {
      return res.status(400).json({ message: "Invalid ID." });
    }

    const enrollment = await Enrollment.findOne({ userId, courseId });
    if (!enrollment) {
      return res
        .status(403)
        .json({ message: "You are not enrolled in this course." });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found." });
    }

    res.status(200).json({ lesson });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

/**
 * @desc    Get all comments for a specific lesson (user must be enrolled)
 * @route   GET /api/courses/:courseId/lessons/:lessonId/comments
 * @access  Private
 */
exports.getLessonComments = async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId, lessonId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(courseId) ||
      !mongoose.Types.ObjectId.isValid(lessonId)
    ) {
      return res.status(400).json({ message: "Invalid ID." });
    }

    const enrollment = await Enrollment.findOne({ userId, courseId });
    if (!enrollment) {
      return res
        .status(403)
        .json({ message: "You are not enrolled in this course." });
    }

    const comments = await Comment.find({ lessonId })
      .populate("authorId", "firstName lastName userImage")
      .sort({ createdAt: -1 });

    res.status(200).json({ comments });
  } catch (err) {
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/**
 * @desc    Add a new comment to a lesson (user must be enrolled)
 * @route   POST /api/courses/:courseId/lessons/:lessonId/comments
 * @access  Private
 */
exports.CommentToLesson = async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId, lessonId } = req.params;
    const { content } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(courseId) ||
      !mongoose.Types.ObjectId.isValid(lessonId)
    ) {
      return res.status(400).json({ message: "Invalid ID." });
    }

    const enrollment = await Enrollment.findOne({ userId, courseId });
    if (!enrollment) {
      return res
        .status(403)
        .json({ message: "You are not enrolled in this course." });
    }

    const newComment = await Comment.create({
      lessonId,
      authorId: userId,
      content,
    });

    const formattedDate = newComment.createdAt.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    res.status(201).json({
      _id: newComment._id,
      lessonId: newComment.lessonId,
      authorId: newComment.authorId,
      content: newComment.content,
      createdAt: formattedDate,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/**
 * @desc    Delete a specific comment from a lesson (user must be the owner or admin)
 * @route   DELETE /api/courses/:courseId/lessons/:lessonId/comments/:commentId
 * @access  Private
 */
exports.deleteLessonComment = async (req, res) => {
  const userId = req.user.id;

  try {
    const comment = await Comment.findById(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    //  Check if the user is the author
    if (!comment.authorId || comment.authorId.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You are not the author of this comment." });
    }

    await comment.deleteOne();
    res.json({ message: "Đã xoá bình luận." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
