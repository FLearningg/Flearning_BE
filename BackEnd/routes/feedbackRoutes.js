const express = require("express");
const router = express.Router();
const {
  getCourseFeedback,
  createCourseFeedback,
  updateCourseFeedback,
  deleteCourseFeedback,
  getCourseAverageRating, // Thêm controller mới
} = require("../controllers/feedbackController");
const authorize = require("../middlewares/authMiddleware");

// GET /api/courses/:courseId/feedback - Get all feedback for a course (public)
router.get("/:courseId/feedback", getCourseFeedback);

// POST /api/courses/:courseId/feedback - Create feedback for a course (protected)
router.post("/:courseId/feedback", authorize(), createCourseFeedback);

// PUT /api/courses/:courseId/feedback - Update user's feedback for a course (protected)
router.put("/:courseId/feedback", authorize(), updateCourseFeedback);

// DELETE /api/courses/:courseId/feedback/:feedbackId - Delete specific feedback (protected)
router.delete(
  "/:courseId/feedback/:feedbackId",
  authorize(),
  deleteCourseFeedback
);

// GET /api/courses/:courseId/average-rating - Get average rating for a course (public)
router.get("/:courseId/average-rating", getCourseAverageRating);

module.exports = router;
