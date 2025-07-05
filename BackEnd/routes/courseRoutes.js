const courseController = require("../controllers/courseController");
const authMiddleware = require("../middlewares/authMiddleware");

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

router.get("/", courseController.getAllCourses);
router.get("/search", courseController.searchCourses);
router.get("/top-selling", courseController.getTopCourses);
router.get("/recently-added", courseController.getNewCourses);

// Course details
detailsRouter.get("/:courseId", getCourseDetails);
detailsRouter.get("/:courseId/related", getRelatedCourses);

// Lesson details
detailsRouter.get(
  "/:courseId/lessons/:lessonId",
  authMiddleware(),
  getLessonDetails
);

// Lesson comments
detailsRouter.get(
  "/:courseId/lessons/:lessonId/comments",
  authMiddleware(),
  getLessonComments
);
detailsRouter.post(
  "/:courseId/lessons/:lessonId/comments",
  authMiddleware(),
  CommentToLesson
);
detailsRouter.delete(
  "/:courseId/lessons/:lessonId/comments/:commentId",
  authMiddleware(),
  deleteLessonComment
);

module.exports = router;
