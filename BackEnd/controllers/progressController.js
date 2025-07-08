const Progress = require("../models/progressModel");
const Course = require("../models/courseModel");
const Section = require("../models/sectionModel");
const Lesson = require("../models/lessonModel");
const Enrollment = require("../models/enrollmentModel");

/**
 * @desc    Get course progress for a user
 * @route   GET /api/progress/:courseId
 * @access  Private
 */
const getCourseProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // Check if user is enrolled in the course
    const enrollment = await Enrollment.findOne({
      userId: userId,
      courseId: courseId,
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You are not enrolled in this course",
      });
    }

    // Get course information and count lessons
    const course = await Course.findById(courseId)
      .populate({
        path: "sections",
        populate: {
          path: "lessons",
          select: "_id",
        },
      })
      .select("title sections");

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Get user's progress for this course
    const progress = await Progress.findOne({
      studentId: userId,
      courseId: courseId,
    });

    // Calculate total lessons in the course
    const totalLessons = course.sections.reduce((total, section) => {
      return total + (section.lessons ? section.lessons.length : 0);
    }, 0);

    // Calculate completed lessons
    const completedLessons = progress ? progress.completedLessons.length : 0;

    // Calculate completion percentage
    const progressPercentage =
      totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

    res.status(200).json({
      success: true,
      data: {
        courseId: courseId,
        courseTitle: course.title,
        completedLessons,
        totalLessons,
        progressPercentage,
      },
    });
  } catch (error) {
    console.error("Error getting course progress:", error);
    res.status(500).json({
      success: false,
      message: "Server error while getting course progress",
    });
  }
};

/**
 * @desc    Mark a lesson as completed
 * @route   POST /api/progress/:courseId/lessons/:lessonId/complete
 * @access  Private
 */
const markLessonCompleted = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const userId = req.user.id;

    // Check enrollment
    const enrollment = await Enrollment.findOne({
      userId: userId,
      courseId: courseId,
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You are not enrolled in this course",
      });
    }

    // Check if lesson exists and belongs to the course
    const lesson = await Lesson.findOne({
      _id: lessonId,
      courseId: courseId,
    });

    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found in this course",
      });
    }

    // Find or create progress record
    let progress = await Progress.findOne({
      studentId: userId,
      courseId: courseId,
    });

    if (!progress) {
      progress = new Progress({
        studentId: userId,
        courseId: courseId,
        completedLessons: [],
      });
    }

    // Add lesson to completed list if not already completed
    if (!progress.completedLessons.includes(lessonId)) {
      progress.completedLessons.push(lessonId);
      await progress.save();
    }

    res.status(200).json({
      success: true,
      message: "Lesson marked as completed",
      data: {
        lessonId,
        completedLessonsCount: progress.completedLessons.length,
      },
    });
  } catch (error) {
    console.error("Error marking lesson completed:", error);
    res.status(500).json({
      success: false,
      message: "Server error while marking lesson as completed",
    });
  }
};

/**
 * @desc    Mark a lesson as incomplete
 * @route   DELETE /api/progress/:courseId/lessons/:lessonId/complete
 * @access  Private
 */
const markLessonIncomplete = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const userId = req.user.id;

    // Find progress record
    const progress = await Progress.findOne({
      studentId: userId,
      courseId: courseId,
    });

    if (!progress) {
      return res.status(404).json({
        success: false,
        message: "Progress record not found",
      });
    }

    // Remove lesson from completed list
    progress.completedLessons = progress.completedLessons.filter(
      (id) => id.toString() !== lessonId
    );
    await progress.save();

    res.status(200).json({
      success: true,
      message: "Lesson marked as incomplete",
      data: {
        lessonId,
        completedLessonsCount: progress.completedLessons.length,
      },
    });
  } catch (error) {
    console.error("Error marking lesson incomplete:", error);
    res.status(500).json({
      success: false,
      message: "Server error while marking lesson as incomplete",
    });
  }
};

/**
 * @desc    Get all courses progress for a user
 * @route   GET /api/progress
 * @access  Private
 */
const getAllCoursesProgress = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all user enrollments
    const enrollments = await Enrollment.find({ userId: userId }).populate({
      path: "courseId",
      select: "title thumbnail sections",
      populate: {
        path: "sections",
        populate: {
          path: "lessons",
          select: "_id",
        },
      },
    });

    if (!enrollments.length) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "You are not enrolled in any courses",
      });
    }

    const coursesProgress = [];

    for (const enrollment of enrollments) {
      const course = enrollment.courseId;
      if (!course) continue;

      // Count total lessons
      const totalLessons = course.sections.reduce((total, section) => {
        return total + (section.lessons ? section.lessons.length : 0);
      }, 0);

      // Get progress
      const progress = await Progress.findOne({
        studentId: userId,
        courseId: course._id,
      });

      const completedLessons = progress ? progress.completedLessons.length : 0;
      const progressPercentage =
        totalLessons > 0
          ? Math.round((completedLessons / totalLessons) * 100)
          : 0;

      coursesProgress.push({
        courseId: course._id,
        courseTitle: course.title,
        completedLessons,
        totalLessons,
        progressPercentage,
      });
    }

    res.status(200).json({
      success: true,
      data: coursesProgress,
    });
  } catch (error) {
    console.error("Error getting all courses progress:", error);
    res.status(500).json({
      success: false,
      message: "Server error while getting all courses progress",
    });
  }
};

/**
 * @desc    Get completed courses for a user
 * @route   GET /api/progress/completed
 * @access  Private
 */
const getCompletedCourses = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all user enrollments
    const enrollments = await Enrollment.find({ userId: userId }).populate({
      path: "courseId",
      select: "title thumbnail sections",
      populate: {
        path: "sections",
        populate: {
          path: "lessons",
          select: "_id",
        },
      },
    });

    if (!enrollments.length) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "You are not enrolled in any courses",
      });
    }

    const completedCourses = [];

    for (const enrollment of enrollments) {
      const course = enrollment.courseId;
      if (!course) continue;

      // Count total lessons
      const totalLessons = course.sections.reduce((total, section) => {
        return total + (section.lessons ? section.lessons.length : 0);
      }, 0);

      // Skip courses with no lessons
      if (totalLessons === 0) continue;

      // Get progress
      const progress = await Progress.findOne({
        studentId: userId,
        courseId: course._id,
      });

      const completedLessons = progress ? progress.completedLessons.length : 0;
      const progressPercentage = Math.round(
        (completedLessons / totalLessons) * 100
      );

      // Only include courses that are 100% completed
      if (progressPercentage === 100) {
        completedCourses.push({
          courseId: course._id,
          courseTitle: course.title,
          courseThumbnail: course.thumbnail,
          completedLessons,
          totalLessons,
          progressPercentage: 100,
          completedDate: progress ? progress.updatedAt : null,
        });
      }
    }

    res.status(200).json({
      success: true,
      data: completedCourses,
      count: completedCourses.length,
      message:
        completedCourses.length > 0
          ? `Found ${completedCourses.length} completed courses`
          : "No completed courses found",
    });
  } catch (error) {
    console.error("Error getting completed courses:", error);
    res.status(500).json({
      success: false,
      message: "Server error while getting completed courses",
    });
  }
};

/**
 * @desc    Get incomplete courses for a user (progress < 100%)
 * @route   GET /api/progress/incomplete
 * @access  Private
 */
const getIncompleteCourses = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all user enrollments
    const enrollments = await Enrollment.find({ userId: userId }).populate({
      path: "courseId",
      select: "title thumbnail sections",
      populate: {
        path: "sections",
        populate: {
          path: "lessons",
          select: "_id",
        },
      },
    });

    if (!enrollments.length) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "You are not enrolled in any courses",
      });
    }

    const incompleteCourses = [];

    for (const enrollment of enrollments) {
      const course = enrollment.courseId;
      if (!course) continue;

      // Count total lessons
      const totalLessons = course.sections.reduce((total, section) => {
        return total + (section.lessons ? section.lessons.length : 0);
      }, 0);

      // Skip courses with no lessons
      if (totalLessons === 0) continue;

      // Get progress
      const progress = await Progress.findOne({
        studentId: userId,
        courseId: course._id,
      });

      const completedLessons = progress ? progress.completedLessons.length : 0;
      const progressPercentage = Math.round(
        (completedLessons / totalLessons) * 100
      );

      // Only include courses that are NOT 100% completed
      if (progressPercentage < 100) {
        incompleteCourses.push({
          courseId: course._id,
          courseTitle: course.title,
          courseThumbnail: course.thumbnail,
          completedLessons,
          totalLessons,
          progressPercentage,
          remainingLessons: totalLessons - completedLessons,
          enrollmentDate: enrollment.createdAt,
          lastUpdated: progress ? progress.updatedAt : enrollment.createdAt,
        });
      }
    }

    // Sort by progress percentage (lowest first - courses that need more attention)
    incompleteCourses.sort(
      (a, b) => a.progressPercentage - b.progressPercentage
    );

    res.status(200).json({
      success: true,
      data: incompleteCourses,
      count: incompleteCourses.length,
      message:
        incompleteCourses.length > 0
          ? `Found ${incompleteCourses.length} incomplete courses`
          : "All courses are completed! Well done!",
    });
  } catch (error) {
    console.error("Error getting incomplete courses:", error);
    res.status(500).json({
      success: false,
      message: "Server error while getting incomplete courses",
    });
  }
};

module.exports = {
  getCourseProgress,
  markLessonCompleted,
  markLessonIncomplete,
  getAllCoursesProgress,
  getCompletedCourses,
  getIncompleteCourses,
};
