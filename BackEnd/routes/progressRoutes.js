const express = require("express");
const router = express.Router();
const {
  getCourseProgress,
  markLessonCompleted,
  markLessonIncomplete,
  getAllCoursesProgress,
  getCompletedCourses,
  getIncompleteCourses,
  getCompletedLessonsDetails,
} = require("../controllers/progressController");
const authorize = require("../middlewares/authMiddleware");

/**
 * @route   GET /api/progress
 * @desc    Get progress for all enrolled courses of user
 * @access  Private
 */
router.get("/", authorize(), getAllCoursesProgress);

/**
 * @route   GET /api/progress/completed
 * @desc    Get all completed courses for user (100% progress)
 * @access  Private
 */
router.get("/completed", authorize(), getCompletedCourses);

/**
 * @route   GET /api/progress/incomplete
 * @desc    Get all incomplete courses for user (< 100% progress) with progress details
 * @access  Private
 */
router.get("/incomplete", authorize(), getIncompleteCourses);

/**
 * @route   GET /api/progress/:courseId
 * @desc    Get detailed progress for a specific course
 * @access  Private
 */
router.get("/:courseId", authorize(), getCourseProgress);

/**
 * @route   POST /api/progress/:courseId/lessons/:lessonId/complete
 * @desc    Mark a lesson as completed
 * @access  Private
 */
router.post("/:courseId/lessons/:lessonId/complete", authorize(), markLessonCompleted);

/**
 * @route   DELETE /api/progress/:courseId/lessons/:lessonId/complete
 * @desc    Mark a lesson as incomplete (remove from completed list)
 * @access  Private
 */
router.delete("/:courseId/lessons/:lessonId/complete", authorize(), markLessonIncomplete);

/**
 * @route   GET /api/progress/:courseId/completed-lessons
 * @desc    Get completed lessons details for a specific course
 * @access  Private
 */
router.get("/:courseId/completed-lessons", authorize(), getCompletedLessonsDetails);

module.exports = router; 