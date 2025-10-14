const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const {
  uploadWordQuiz,
  getQuizById,
  getQuizzesByCourse,
  deleteQuiz,
  linkQuizToCourse,
  linkQuizToLesson,
  createQuizLesson,
  createMissingQuizLessons,
  createQuizFromFrontendData,
  updateQuiz
} = require("../controllers/quizController");

// Request tracking middleware
const trackRequest = (req, res, next) => {
  const trackId = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  console.log(`🌍 [ROUTE-${trackId}] ${req.method} ${req.originalUrl}`);
  console.log(`📍 [ROUTE-${trackId}] IP: ${req.ip}, User-Agent: ${req.headers['user-agent']?.substr(0, 50)}`);
  req.trackId = trackId;
  next();
};

// Upload Word file to create quiz
router.post("/upload-word", trackRequest, authMiddleware(), uploadWordQuiz);

// Create quiz from frontend data (from state)
router.post("/create-from-data", trackRequest, authMiddleware(), createQuizFromFrontendData);

// Link quiz to course (for temporary quizzes)
router.put("/:quizId/link-course", authMiddleware(), linkQuizToCourse);

// Link quiz to existing lesson
router.put("/:quizId/link-lesson", authMiddleware(), linkQuizToLesson);

// Create a new lesson for quiz in a section
router.post("/:quizId/create-lesson", authMiddleware(), createQuizLesson);

// Create lessons for all orphaned quizzes
router.post("/create-missing-lessons", authMiddleware(), createMissingQuizLessons);

// Get quiz by ID
router.get("/:quizId", authMiddleware(), getQuizById);

// Update quiz
router.put("/:quizId", authMiddleware(), updateQuiz);

// Get all quizzes for a course
router.get("/course/:courseId", authMiddleware(), getQuizzesByCourse);

// Delete quiz
router.delete("/:quizId", authMiddleware(), deleteQuiz);

module.exports = router;