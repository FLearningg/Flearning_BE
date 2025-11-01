const courseController = require("../controllers/courseController");
const authMiddleware = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/authMiddleware");

const router = require("express").Router();
const detailsRouter = require("express").Router();
const {
  getCourseDetails,
  getRelatedCourses,
  getLessonDetails,
  getLessonComments,
  CommentToLesson,
  deleteLessonComment,
} = require("../controllers/courseDetailsController");
const { generateCertificate } = require("../controllers/certificateController");

router.get("/", courseController.getAllCourses);
router.get("/search", courseController.searchCourses);
router.get("/top-selling", courseController.getTopCourses);
router.get("/recently-added", courseController.getNewCourses);
router.post("/enroll-course", courseController.enrollCourse);
router.get("/is-enrolled", authorize(), courseController.isUserEnrolled);

// Course details
router.get("/:courseId", getCourseDetails);
router.get("/:courseId/related", getRelatedCourses);

// Lesson details
router.get("/:courseId/lessons/:lessonId", authMiddleware(), getLessonDetails);

// Lesson comments
router.get(
  "/:courseId/lessons/:lessonId/comments",
  authMiddleware(),
  getLessonComments
);
router.post(
  "/:courseId/lessons/:lessonId/comments",
  authMiddleware(),
  CommentToLesson
);
router.delete(
  "/:courseId/lessons/:lessonId/comments/:commentId",
  authMiddleware(),
  deleteLessonComment
);

// Thêm route gán discount cho course (admin)
router.post(
  "/:courseId/assign-discount",
  authMiddleware("admin"),
  courseController.assignDiscountToCourse
);

router.post(
  "/:courseId/generate-certificate",
  authMiddleware(),
  generateCertificate
);

module.exports = router;
