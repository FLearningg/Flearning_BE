const express = require("express");
const { 
  explainQuiz, 
  generateQuiz,
  summarizeVideo, 
  summarizeArticle,
  gradeEssayAnswers 
} = require("../controllers/aiController");
const authorize = require("../middlewares/authMiddleware");

const router = express.Router();

// POST /api/ai/explain-quiz
router.post("/explain-quiz", authorize(), explainQuiz);

// POST /api/ai/generate-quiz
router.post("/generate-quiz", authorize(), generateQuiz);

// POST /api/ai/grade-essay
router.post("/grade-essay", authorize(), gradeEssayAnswers);

// POST /api/ai/summarize-video
router.post("/summarize-video", authorize(), summarizeVideo);

// POST /api/ai/summarize-article
router.post("/summarize-article", authorize(), summarizeArticle);

module.exports = router;
