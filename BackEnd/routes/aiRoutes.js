const express = require("express");
const { 
  explainQuiz, 
  summarizeVideo, 
  summarizeArticle 
} = require("../controllers/aiController");
const authorize = require("../middlewares/authMiddleware");

const router = express.Router();

// POST /api/ai/explain-quiz
router.post("/explain-quiz", authorize(), explainQuiz);

// POST /api/ai/summarize-video
router.post("/summarize-video", authorize(), summarizeVideo);

// POST /api/ai/summarize-article
router.post("/summarize-article", authorize(), summarizeArticle);

module.exports = router;
