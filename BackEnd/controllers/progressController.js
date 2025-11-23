const Progress = require("../models/progressModel");
const Course = require("../models/courseModel");
const Section = require("../models/sectionModel");
const Lesson = require("../models/lessonModel");
const Enrollment = require("../models/enrollmentModel");
const Certificate = require("../models/CertificateModel");

/**
 * @desc    Get course progress for a user
 * @route   GET /api/progress/:courseId
 * @access  Private
 */
const getCourseProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // Check if user is enrolled in the course using Enrollment model
    const enrollment = await Enrollment.findOne({
      userId: userId,
      courseId: courseId,
      status: "enrolled"
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

    // Check if user is enrolled in the course using Enrollment model
    const enrollment = await Enrollment.findOne({
      userId: userId,
      courseId: courseId,
      status: "enrolled"
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

    // Get all enrolled courses from Enrollment model
    const enrollments = await Enrollment.find({
      userId: userId,
      status: "enrolled"
    }).populate({
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

    if (!enrollments || enrollments.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "You are not enrolled in any courses",
      });
    }

    const coursesProgress = [];

    for (const enrollment of enrollments) {
      const course = enrollment.courseId;
      
      // Skip if course is null (data integrity issue)
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
        enrolledAt: enrollment.createdAt,
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

    // Get all enrolled courses from Enrollment model
    const enrollments = await Enrollment.find({
      userId: userId,
      status: "enrolled"
    }).populate({
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

    if (!enrollments || enrollments.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "You are not enrolled in any courses",
      });
    }

    const completedCourses = [];

    for (const enrollment of enrollments) {
      const course = enrollment.courseId;
      
      // Skip if course is null (data integrity issue)
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
          enrolledAt: enrollment.createdAt,
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

    // Get all enrolled courses from Enrollment model
    const enrollments = await Enrollment.find({
      userId: userId,
      status: "enrolled"
    }).populate({
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

    if (!enrollments || enrollments.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "You are not enrolled in any courses",
      });
    }

    const incompleteCourses = [];

    for (const enrollment of enrollments) {
      const course = enrollment.courseId;
      
      // Skip if course is null (data integrity issue)
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
          lastUpdated: progress ? progress.updatedAt : null,
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

/**
 * @desc    Get details of completed lessons for a user in a course
 * @route   GET /api/progress/:courseId/completed-lessons
 * @access  Private
 */
const getCompletedLessonsDetails = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // Check if user is enrolled in the course using Enrollment model
    const enrollment = await Enrollment.findOne({
      userId: userId,
      courseId: courseId,
      status: "enrolled"
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You are not enrolled in this course",
      });
    }

    // Get user's progress for this course
    const progress = await Progress.findOne({
      studentId: userId,
      courseId: courseId,
    });

    if (!progress || !progress.completedLessons || progress.completedLessons.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No completed lessons found",
      });
    }

    // Get lesson details
    const lessons = await Lesson.find({ _id: { $in: progress.completedLessons } });

    res.status(200).json({
      success: true,
      data: lessons,
      count: lessons.length,
    });
  } catch (error) {
    console.error("Error getting completed lessons details:", error);
    res.status(500).json({
      success: false,
      message: "Server error while getting completed lessons details",
    });
  }
};

/**
 * @desc    Get student learning analytics (time, streak, achievements)
 * @route   GET /api/progress/analytics
 * @access  Private (Student)
 */
const getStudentAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const month = req.query.month ? parseInt(req.query.month) : new Date().getMonth() + 1;
    
    console.log('getStudentAnalytics called with:', { userId, year, month });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all progress records for this student
    const allProgress = await Progress.find({ studentId: userId });
    
    console.log('Found progress records:', allProgress.length);
    
    // Log all completed lessons with dates
    let totalLessonsWithDates = 0;
    allProgress.forEach(progress => {
      if (progress.completedLessons && Array.isArray(progress.completedLessons)) {
        progress.completedLessons.forEach(lesson => {
          if (lesson.completedAt) {
            totalLessonsWithDates++;
            const dateStr = new Date(lesson.completedAt).toISOString().split('T')[0];
            console.log(`Lesson completed on: ${dateStr}`);
          }
        });
      }
    });
    console.log('Total lessons with completedAt:', totalLessonsWithDates);
    
    // Initialize counters
    let totalLearningMinutes = 0;
    let lessonsCompletedToday = 0;
    let lessonsCompletedThisWeek = 0;
    let lessonsCompletedThisMonth = 0;
    let totalCompletedLessons = 0;
    
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    // Process each progress record
    allProgress.forEach(progress => {
      if (!progress.completedLessons || !Array.isArray(progress.completedLessons)) {
        return;
      }
      
      totalCompletedLessons += progress.completedLessons.length;
      
      progress.completedLessons.forEach(lesson => {
        // Estimate 30 minutes per lesson
        totalLearningMinutes += 30;
        
        if (!lesson.completedAt) return;
        
        const completedDate = new Date(lesson.completedAt);
        completedDate.setHours(0, 0, 0, 0);
        
        if (completedDate.getTime() === today.getTime()) {
          lessonsCompletedToday++;
        }
        if (completedDate >= sevenDaysAgo) {
          lessonsCompletedThisWeek++;
        }
        if (completedDate >= thirtyDaysAgo) {
          lessonsCompletedThisMonth++;
        }
      });
    });
    
    // Calculate learning streak (consecutive days with completed lessons)
    const uniqueDates = new Set();
    allProgress.forEach(progress => {
      if (!progress.completedLessons || !Array.isArray(progress.completedLessons)) {
        return;
      }
      progress.completedLessons.forEach(lesson => {
        if (!lesson.completedAt) return;
        const dateStr = new Date(lesson.completedAt).toISOString().split('T')[0];
        uniqueDates.add(dateStr);
      });
    });
    
    const sortedDates = Array.from(uniqueDates).sort().reverse();
    let currentStreak = 0;
    let expectedDate = new Date(today);
    
    for (const dateStr of sortedDates) {
      const lessonDate = new Date(dateStr);
      lessonDate.setHours(0, 0, 0, 0);
      expectedDate.setHours(0, 0, 0, 0);
      
      if (lessonDate.getTime() === expectedDate.getTime()) {
        currentStreak++;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    // Get enrollment stats
    const enrollments = await Enrollment.find({ 
      userId: userId,
      status: "enrolled"
    });
    
    const completedCourses = await Enrollment.countDocuments({
      userId: userId,
      status: "completed"
    });
    
    // Activity chart data for selected year (12 months)
    const weeklyActivity = [];
    
    console.log(`Generating monthly activity for year ${year}`);
    
    // Get all certificates for this user (certificate = course completed)
    const certificates = await Certificate.find({ 
      userId: userId
    }).select('courseId createdAt');
    
    console.log('Found certificates:', certificates.length);
    if (certificates.length > 0) {
      console.log('Sample certificate:', {
        courseId: certificates[0].courseId,
        createdAt: certificates[0].createdAt,
        month: new Date(certificates[0].createdAt).getMonth() + 1,
        year: new Date(certificates[0].createdAt).getFullYear()
      });
    }
    
    // Generate data for 12 months
    for (let month = 1; month <= 12; month++) {
      const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);
      
      console.log(`\nChecking month ${month}/${year}`);
      
      let coursesCount = 0;
      certificates.forEach(cert => {
        if (!cert.createdAt) return;
        const certDate = new Date(cert.createdAt);
        
        if (certDate >= startOfMonth && certDate <= endOfMonth) {
          coursesCount++;
          console.log(`  ✓ Certificate issued: ${certDate.toISOString()} for course ${cert.courseId}`);
        }
      });
      
      console.log(`Month ${month} total: ${coursesCount} courses`);
      
      weeklyActivity.push({
        month: month,
        courses: coursesCount
      });
    }
    
    console.log('Monthly activity generated:', weeklyActivity.length, 'months');
    
    res.status(200).json({
      success: true,
      data: {
        learningTime: {
          total: Math.floor(totalLearningMinutes / 60), // hours
          totalMinutes: totalLearningMinutes,
          today: lessonsCompletedToday * 30,
          thisWeek: lessonsCompletedThisWeek * 30,
          thisMonth: lessonsCompletedThisMonth * 30,
        },
        streak: {
          current: currentStreak,
          longest: currentStreak, // You can track this separately in the future
        },
        lessons: {
          total: totalCompletedLessons,
          today: lessonsCompletedToday,
          thisWeek: lessonsCompletedThisWeek,
          thisMonth: lessonsCompletedThisMonth,
        },
        courses: {
          enrolled: enrollments.length,
          completed: completedCourses,
          inProgress: enrollments.length - completedCourses,
        },
        weeklyActivity: weeklyActivity,
      }
    });
  } catch (error) {
    console.error("Error getting student analytics:", error);
    res.status(500).json({
      success: false,
      message: "Server error while getting student analytics",
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
  getCompletedLessonsDetails,
  getStudentAnalytics,
};
