const Course = require("../models/courseModel");
const User = require("../models/userModel");
const Lesson = require("../models/lessonModel");
const Section = require("../models/sectionModel");
const Comment = require("../models/commentModel");
const Discount = require("../models/discountModel");
const Enrollment = require("../models/enrollmentModel");
const mongoose = require("mongoose");

//nom :  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4NjRmM2QxYjU3MWFiY2VkZTkxYzE0MiIsInJvbGUiOiJzdHVkZW50IiwiaWF0IjoxNzUxNTYwNDM5LCJleHAiOjE3NTE1NjEzMzl9.M5etGMLUFuxEcqckKvNorFWFGnimxobgakVD9pqXTKs
//mon : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4NjRmNDI1YjU3MWFiY2VkZTkxYzE0NyIsInJvbGUiOiJzdHVkZW50IiwiaWF0IjoxNzUxNTYwNDY4LCJleHAiOjE3NTE1NjEzNjh9.mZmw6LITe1SuHKiWT65xp5xOI-OOw58Meo9GUJJZEAk

//Get course details
exports.getCourseDetails = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId)
      .populate("sections")
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

//Get related courses
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

//Get all lessons in a course
//Get lesson details (user must be enrolled)
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

//Get lesson comments ( user must be enrolled in the course)
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

//Post comment to lesson (user must be enrolled in the course)
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

//Delete comment (check xem thử đã đúng user đã post comment hay chưa)
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
