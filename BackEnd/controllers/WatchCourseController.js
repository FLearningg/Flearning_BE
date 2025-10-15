const Course = require("../models/courseModel");
const Section = require("../models/sectionModel");
const Lesson = require("../models/lessonModel");
const Comment = require("../models/commentModel");
const mongoose = require("mongoose");

/**
 * @desc    Get lesson detail by lessonId
 * @route   GET /api/watch-course/lesson/:lessonId
 * @access  Public
 */
exports.getLessonDetail = async (req, res) => {
  try {
    const { lessonId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ message: "Invalid lesson ID." });
    }
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found." });
    }
    res.status(200).json(lesson);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Get course info (title, subtitle, detail, material, thumbnail, trailer, level, duration, section)
 * @route   GET /api/watch-course/:courseId
 * @access  Public
 */
exports.getCourseInfo = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }
    const course = await Course.findById(courseId)
      .select(
        "title subTitle detail materials thumbnail trailer level duration sections studentsEnrolled updatedAt"
      )
      .populate({
        path: "sections",
        select: "_id name order lessons",
        options: { sort: { order: 1 } },
      });
    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }
    // Count all comments in all lessons of this course
    let commentsCount = 0;
    if (course.sections && course.sections.length > 0) {
      const lessonIds = course.sections.flatMap((section) => section.lessons);
      commentsCount = await Comment.countDocuments({
        lessonId: { $in: lessonIds },
      });
    }
    res.status(200).json({
      ...course.toObject(),
      studentsCount: course.studentsEnrolled
        ? course.studentsEnrolled.length
        : 0,
      lastUpdated: course.updatedAt,
      commentsCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Get all lessons of a course
 * @route   GET /api/watch-course/:courseId/lessons
 * @access  Public
 */
exports.getAllLessonsOfCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: "Invalid course ID." });
    }
    // Get all lessons by courseId, sorted by section order and lesson order
    const sections = await Section.find({ courseId })
      .select("_id name order lessons")
      .sort({ order: 1 })
      .populate({
        path: "lessons",
        select:
          "_id title description lessonNotes materialUrl videoUrl captions duration order type quizIds createdAt updatedAt",
        options: { sort: { order: 1 } },
        populate: {
          path: "quizIds",
          select: "_id title description questions"
        }
      });
    res.status(200).json({ sections });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Get all comments of a lesson
 * @route   GET /api/watch-course/:lessonId/comments
 * @access  Public
 */
exports.getLessonComments = async (req, res) => {
  try {
    const { lessonId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ message: "Invalid lesson ID." });
    }
    const comments = await Comment.find({ lessonId })
      .populate("authorId", "firstName lastName userImage")
      .sort({ createdAt: -1 });
    res.status(200).json({ comments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Add a comment to a lesson
 * @route   POST /api/watch-course/:lessonId/comments
 * @access  Private (user must be logged in)
 */
exports.addLessonComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lessonId } = req.params;
    const { content } = req.body;
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ message: "Invalid lesson ID." });
    }
    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Content is required." });
    }
    const newComment = await Comment.create({
      lessonId,
      authorId: userId,
      content,
    });
    res.status(201).json(newComment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Update a comment of a lesson
 * @route   PUT /api/watch-course/:lessonId/comments/:commentId
 * @access  Private (user must be the author)
 */
exports.updateLessonComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lessonId, commentId } = req.params;
    const { content } = req.body;
    if (
      !mongoose.Types.ObjectId.isValid(lessonId) ||
      !mongoose.Types.ObjectId.isValid(commentId)
    ) {
      return res.status(400).json({ message: "Invalid ID." });
    }
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found." });
    }
    if (!comment.authorId || comment.authorId.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You are not the author of this comment." });
    }
    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Content is required." });
    }
    comment.content = content;
    await comment.save();
    res.status(200).json(comment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Delete a comment of a lesson
 * @route   DELETE /api/watch-course/:lessonId/comments/:commentId
 * @access  Private (user must be the author)
 */
exports.deleteLessonComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lessonId, commentId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(lessonId) ||
      !mongoose.Types.ObjectId.isValid(commentId)
    ) {
      return res.status(400).json({ message: "Invalid ID." });
    }
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found." });
    }
    if (!comment.authorId || comment.authorId.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You are not the author of this comment." });
    }
    await comment.deleteOne();
    res.status(200).json({ message: "Comment deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
