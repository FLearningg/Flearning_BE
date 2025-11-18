const Course = require("../models/courseModel");
const Section = require("../models/sectionModel");
const Lesson = require("../models/lessonModel");
const Comment = require("../models/commentModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");
const {
  createAndSendNotification,
} = require("../services/notificationService");

const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({
  apiKey: process.env.AI_BAN_COMMENT_GEMINI_API_KEY,
});

const checkAndHandleToxicity = async (content, userId, io) => {
  // 1. Gọi AI Check
  const prompt = `
    Bạn là AI kiểm duyệt nội dung.
    Bình luận: "${content}"
    Yêu cầu:
    1. Kiểm tra xem có: từ ngữ tục tĩu, chửi thề, xúc phạm, phân biệt vùng miền, hoặc nội dung 18+ không.
    2. Trả về JSON format duy nhất:
    {
      "isToxic": boolean, 
      "reason": "string (Lý do ngắn gọn tiếng Việt nếu isToxic là true, nếu sạch để null)"
    }
  `;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    const aiText = result.text.replace(/```json|```/g, "").trim();
    const analysis = JSON.parse(aiText);

    // Nếu KHÔNG toxic -> trả về false
    if (!analysis.isToxic) {
      return { isToxic: false };
    }

    // Nếu CÓ toxic -> Xử lý đếm và Ban
    const toxicReason = analysis.reason;
    const user = await User.findById(userId);

    if (user) {
      // Tăng số lần vi phạm
      user.toxicViolationCount = (user.toxicViolationCount || 0) + 1;

      let notificationContent = "";
      let isBannedNow = false;

      // Kiểm tra ngưỡng phạt (Trên 3 lần -> Ban)
      if (user.toxicViolationCount > 3) {
        user.status = "banned"; // Khóa tài khoản
        isBannedNow = true;
        notificationContent = `TÀI KHOẢN ĐÃ BỊ KHÓA vĩnh viễn do vi phạm tiêu chuẩn cộng đồng quá 3 lần. Lý do lần này: ${toxicReason}`;
        if (io) {
          io.to(userId.toString()).emit("account_banned", {
            reason: toxicReason,
          });
        }
      } else {
        // Cảnh báo
        const chancesLeft = 4 - user.toxicViolationCount; // Giả sử vi phạm lần 4 là khóa
        notificationContent = `Bình luận bị chặn: ${toxicReason}. Bạn đã vi phạm ${user.toxicViolationCount}/4 lần. Nếu tiếp tục, tài khoản sẽ bị khóa.`;
      }

      await user.save();

      // Gửi thông báo Socket
      await createAndSendNotification(io, {
        recipient: userId,
        sender: "68da40f4584deac572895b5f", // ID admin hệ thống
        type: "system",
        content: notificationContent,
        link: "/faqs",
      });

      return {
        isToxic: true,
        reason: toxicReason,
        isBanned: isBannedNow,
        violationCount: user.toxicViolationCount,
      };
    }

    return { isToxic: true, reason: toxicReason };
  } catch (error) {
    console.error("⚠️ AI Check Error:", error.message);
    return { isToxic: false }; // Fail-open: Lỗi AI thì cho qua
  }
};

/**
 * @desc    Get lesson detail by lessonId
 * @route   GET /api/watch-course/lesson/:lessonId
 * @access  Public
 */
exports.getLessonDetail = async (req, res) => {
  try {
    let { lessonId } = req.params;

    // Handle frontend format with 'quiz_' prefix
    if (lessonId.startsWith("quiz_")) {
      lessonId = lessonId.replace("quiz_", "");
    }

    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({
        message: "Invalid lesson ID.",
        debug: {
          received: req.params.lessonId,
          cleaned: lessonId,
        },
      });
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
          select: "_id title description questions",
        },
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

    // --- KIỂM TRA USER STATUS TRƯỚC ---
    // (Phòng trường hợp user bị ban rồi nhưng chưa logout)
    const currentUser = await User.findById(userId);
    if (currentUser.status === "banned") {
      return res.status(403).json({ message: "Tài khoản của bạn đã bị khóa." });
    }

    // --- GỌI HÀM CHECK TOXIC ---
    const io = req.app.get("io");
    const checkResult = await checkAndHandleToxicity(content, userId, io);

    if (checkResult.isToxic) {
      // Nếu vừa bị ban xong thì trả về 403 Forbidden, ngược lại trả 400 Bad Request
      const statusCode = checkResult.isBanned ? 403 : 400;
      const message = checkResult.isBanned
        ? "Tài khoản của bạn vừa bị khóa do vi phạm nhiều lần."
        : "Bình luận bị từ chối.";

      return res.status(statusCode).json({
        success: false,
        message: message,
        reason: checkResult.reason,
        violationCount: checkResult.violationCount,
      });
    }

    // --- NẾU SẠCH SẼ -> TẠO COMMENT ---
    const newComment = await Comment.create({
      lessonId,
      authorId: userId,
      content,
    });

    await newComment.populate("authorId", "firstName lastName userImage");
    res.status(201).json(newComment);
  } catch (err) {
    console.error("Error adding comment:", err);
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
    if (!comment)
      return res.status(404).json({ message: "Comment not found." });

    if (!comment.authorId || comment.authorId.toString() !== userId) {
      return res.status(403).json({ message: "You are not the author." });
    }

    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Content is required." });
    }

    // --- KIỂM TRA USER STATUS ---
    const currentUser = await User.findById(userId);
    if (currentUser.status === "banned") {
      return res.status(403).json({ message: "Tài khoản của bạn đã bị khóa." });
    }

    // --- GỌI HÀM CHECK TOXIC ---
    const io = req.app.get("io");
    const checkResult = await checkAndHandleToxicity(content, userId, io);

    if (checkResult.isToxic) {
      const statusCode = checkResult.isBanned ? 403 : 400;
      const message = checkResult.isBanned
        ? "Tài khoản của bạn vừa bị khóa do vi phạm nhiều lần."
        : "Nội dung chỉnh sửa bị từ chối.";

      return res.status(statusCode).json({
        success: false,
        message: message,
        reason: checkResult.reason,
        violationCount: checkResult.violationCount,
      });
    }

    // --- UPDATE COMMENT ---
    comment.content = content;
    await comment.save();
    res.status(200).json(comment);
  } catch (err) {
    console.error("Error updating comment:", err);
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
