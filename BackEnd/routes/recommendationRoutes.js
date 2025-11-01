const express = require("express");
const router = express.Router();
const recommendationController = require("../controllers/recommendationController");
const authorize = require("../middlewares/authMiddleware");

/**
 * Learning Path Recommendation Routes
 * All routes require authentication
 */

// POST /api/recommendations/generate - Generate personalized learning path using AI
router.post(
  "/generate",
  authorize(),
  recommendationController.generateLearningPath
);

// GET /api/recommendations/learning-path - Get user's current learning path
router.get(
  "/learning-path",
  authorize(),
  recommendationController.getLearningPath
);

module.exports = router;
