const express = require("express");
const router = express.Router();
const authorize = require("../middlewares/authMiddleware");
const WatchCourseController = require("../controllers/WatchCourseController");

// Get course info (title, subtitle, detail, material, thumbnail, trailer, level, duration, section)
router.get("/:courseId", WatchCourseController.getCourseInfo);

// Get all lessons of a course
router.get("/:courseId/lessons", WatchCourseController.getAllLessonsOfCourse);

// Get all comments of a lesson
router.get("/lesson/:lessonId/comments", WatchCourseController.getLessonComments);

// Add a comment to a lesson (private)
router.post(
  "/lesson/:lessonId/comments",
  authorize(),
  WatchCourseController.addLessonComment
);

// Update a comment of a lesson (private, must be author)
router.put(
  "/lesson/:lessonId/comments/:commentId",
  authorize(),
  WatchCourseController.updateLessonComment
);

// Delete a comment of a lesson (private, must be author)
router.delete(
  "/lesson/:lessonId/comments/:commentId",
  authorize(),
  WatchCourseController.deleteLessonComment
);

// Get lesson detail by lessonId
router.get("/lesson/:lessonId", WatchCourseController.getLessonDetail);

module.exports = router; 