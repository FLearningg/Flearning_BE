const express = require("express");
const router = express.Router();
const {
  submitSurvey,
  getSurvey,
} = require("../controllers/surveyController");
const authorize = require("../middlewares/authMiddleware");

// POST /api/survey/submit - Submit user's learning preferences survey
router.post("/submit", authorize(), submitSurvey);

// GET /api/survey - Get user's survey data
router.get("/", authorize(), getSurvey);

module.exports = router;
