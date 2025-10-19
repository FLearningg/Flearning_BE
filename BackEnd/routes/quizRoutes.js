const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const {
  uploadWordQuiz,
  getQuizById,
  getQuizByLesson,
  getLessonDetail,
  getQuizzesInLesson,
  getQuizzesByCourse,
  deleteQuiz,
  linkQuizToCourse,
  linkQuizToLesson,
  createQuizLesson,
  createMissingQuizLessons,
  createQuizFromFrontendData,
  updateQuiz,
  submitQuiz,
  getQuizResult,
  getMyQuizHistory
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

// === STUDENT QUIZ ROUTES ===
// Note: Put specific paths before parameterized paths to avoid route conflicts

// Get all quiz results history for current user
router.get("/my-results", authMiddleware(), getMyQuizHistory);

// Get quiz by lesson ID
router.get("/by-lesson/:lessonId", authMiddleware(), getQuizByLesson);

// Get lesson detail with type-specific data (video/article/quiz)
router.get("/lesson/:lessonId", authMiddleware(), getLessonDetail);

// Get all quizzes in a lesson
router.get("/lesson/:lessonId/all", authMiddleware(), getQuizzesInLesson);

// === INSTRUCTOR/ADMIN QUIZ ROUTES ===

// Submit quiz answers and get results (must be before /:quizId)
router.post("/:quizId/submit", authMiddleware(), submitQuiz);

// Get result for a specific quiz (must be before /:quizId)
router.get("/:quizId/result", authMiddleware(), getQuizResult);

// Get quiz by ID
router.get("/:quizId", authMiddleware(), getQuizById);

// Update quiz
router.put("/:quizId", authMiddleware(), updateQuiz);

// Delete quiz
router.delete("/:quizId", authMiddleware(), deleteQuiz);

// Get all quizzes for a course
router.get("/course/:courseId", authMiddleware(), getQuizzesByCourse);

module.exports = router;