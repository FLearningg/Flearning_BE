const express = require("express");
const { explainQuiz } = require("../controllers/aiController");
const authorize = require("../middlewares/authMiddleware");

const router = express.Router();

// POST /api/ai/explain-quiz
router.post("/explain-quiz", authorize(), explainQuiz);

module.exports = router;
