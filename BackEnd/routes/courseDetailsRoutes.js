const express = require("express");
const router = express.Router();
const {
  getCourseDetails,
  getRelatedCourses,
  getLessonDetails,
  getLessonComments,
  CommentToLesson,
  deleteLessonComment,
} = require("../controllers/courseDetailsController");
const authorize = require("../middlewares/authMiddleware");

// Course details
router.get("/:courseId", getCourseDetails);
router.get("/:courseId/related", getRelatedCourses);

// Lesson details
router.get("/:courseId/lessons/:lessonId", authorize(), getLessonDetails);

// Lesson comments
router.get(
  "/:courseId/lessons/:lessonId/comments",
  authorize(),
  getLessonComments
);
router.post(
  "/:courseId/lessons/:lessonId/comments",
  authorize(),
  CommentToLesson
);
router.delete(
  "/:courseId/lessons/:lessonId/comments/:commentId",
  authorize(),
  deleteLessonComment
);

module.exports = router;
