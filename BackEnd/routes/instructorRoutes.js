const express = require("express");
const router = express.Router();
const {
  getDashboardStats,
  getAllCategories,
  createCourse,
  updateCourse,
  getCourses,
  getCourseById,
  createSection,
  updateSection,
  deleteSection,
  createLesson,
  updateLesson,
  deleteLesson,
  deleteLessonFile,
  updateLessonFile,
} = require("../controllers/instructorController");
const authorize = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");
const {
  uploadToFirebase,
  getCourseFiles,
  deleteFile,
  getTemporaryFiles,
  moveFileFromTemporary,
} = require("../controllers/firebaseController");

// All instructor routes require instructor authorization
router.use(authorize("instructor"));

// Dashboard stats route
router.get("/dashboard", getDashboardStats);

// Categories route
router.get("/categories", getAllCategories);

// Course management routes
router.post("/courses", createCourse);
router.get("/courses", getCourses);
router.get("/courses/:courseId", getCourseById);
router.put("/courses/:courseId", updateCourse);

// Section management routes
router.post("/courses/:courseId/sections", createSection);
router.put("/courses/:courseId/sections/:sectionId", updateSection);
router.delete("/courses/:courseId/sections/:sectionId", deleteSection);

// Lesson management routes
router.post("/courses/:courseId/sections/:sectionId/lessons", createLesson);
router.put("/courses/:courseId/lessons/:lessonId", updateLesson);
router.delete("/courses/:courseId/lessons/:lessonId", deleteLesson);

// Lesson file management routes
router.delete("/lessons/:lessonId/file", deleteLessonFile);
router.put("/lessons/:lessonId/file", updateLessonFile);

// File management routes (for uploading course materials)
router.post("/upload", upload.single("file"), uploadToFirebase);
router.get("/courses/:courseId/files/:folderType", getCourseFiles);
router.delete("/files", deleteFile);

// Temporary file management routes
router.get("/temporary-files/:folderType", getTemporaryFiles);
router.post("/move-to-course", moveFileFromTemporary);

module.exports = router;
