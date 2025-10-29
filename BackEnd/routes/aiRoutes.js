const express = require("express");
const { explainQuiz, generateQuiz } = require("../controllers/aiController");
const authorize = require("../middlewares/authMiddleware");

const router = express.Router();

// POST /api/ai/explain-quiz
router.post("/explain-quiz", authorize(), explainQuiz);

// POST /api/ai/generate-quiz
router.post("/generate-quiz", authorize(), generateQuiz);

module.exports = router;
