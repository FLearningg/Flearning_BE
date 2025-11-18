const express = require("express");
const router = express.Router();
const {
  getUsers,
  getUserStats,
  getUserById,
  updateUserStatus,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  createSection,
  getCourseSections,
  updateSection,
  deleteSection,
  createLesson,
  updateLesson,
  deleteLesson,
  getLesson,
  moveLessonVideo,
  getAllCategories,
  deleteLessonFile,
  updateLessonFile,
  getInstructorRequests,
  approveInstructorRequest,
  denyInstructorRequest,
  getPendingCourses,
  approveCourse,
  rejectCourse,
  getCourseApprovalStats,
  deactivateCourse,
  reactivateCourse,
  triggerAIReview,
} = require("../controllers/adminController");
const authorize = require("../middlewares/authMiddleware");
const { getDashboardStats } = require("../controllers/adminController");
const upload = require("../middlewares/uploadMiddleware");
const {
  uploadToFirebase,
  getCourseFiles,
  deleteFile,
  testDetectFolder,
  testFirebaseUrl,
  getTemporaryFiles,
  moveFileFromTemporary,
  testUrlAccess,
  fixCorsUrl,
} = require("../controllers/firebaseController");

// All admin routes require admin authorization
router.use(authorize("admin"));

// User management routes
router.get("/users", getUsers);
router.get("/users/stats", getUserStats);
router.get("/users/:id", getUserById);
router.put("/users/:id/status", updateUserStatus);

// Course management routes (Admin can view, update, delete, and approve/reject only)
router.get("/courses", getAllCourses);
router.get("/courses/pending", getPendingCourses);
router.get("/courses/approval-stats", getCourseApprovalStats);
router.get("/courses/:courseId", getCourseById);
router.put("/courses/:courseId", updateCourse);
router.delete("/courses/:courseId", deleteCourse);
router.post("/courses/:courseId/approve", approveCourse);
router.post("/courses/:courseId/reject", rejectCourse);
router.post("/courses/:courseId/deactivate", deactivateCourse);
router.post("/courses/:courseId/reactivate", reactivateCourse);

// Section management routes
router.post("/courses/:courseId/sections", createSection);
router.get("/courses/:courseId/sections", getCourseSections);
router.put("/courses/:courseId/sections/:sectionId", updateSection);
router.delete("/courses/:courseId/sections/:sectionId", deleteSection);

// Lesson management routes
router.post("/courses/:courseId/sections/:sectionId/lessons", createLesson);
router.put("/courses/:courseId/lessons/:lessonId", updateLesson);
router.delete("/courses/:courseId/lessons/:lessonId", deleteLesson);
router.get("/courses/:courseId/lessons/:lessonId", getLesson);

// Lesson file management routes
router.post("/courses/:courseId/lessons/:lessonId/move-video", moveLessonVideo);
router.delete("/lessons/:lessonId/file", deleteLessonFile);
router.put("/lessons/:lessonId/file", updateLessonFile);

// File management routes
router.post("/upload", upload.single("file"), uploadToFirebase);
router.get("/courses/:courseId/files/:folderType", getCourseFiles);
router.delete("/files", deleteFile);

// Temporary file management routes
router.get("/temporary-files/:folderType", getTemporaryFiles);
router.post("/move-to-course", moveFileFromTemporary);

// Testing routes
router.post("/test-detect-folder", testDetectFolder);
router.post("/test-firebase-url", testFirebaseUrl);
router.post("/test-url-access", testUrlAccess);
router.post("/fix-cors-url", fixCorsUrl);

router.get("/stats", authorize("admin"), getDashboardStats);

router.get("/categories", getAllCategories);

// Instructor requests route
router.get("/instructor-requests", getInstructorRequests);
router.post("/instructors/approve", approveInstructorRequest);
router.post("/instructors/deny", denyInstructorRequest);
router.post("/instructors/trigger-ai-review", triggerAIReview);

module.exports = router;
