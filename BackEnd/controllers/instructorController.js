const User = require("../models/userModel");
const Course = require("../models/courseModel");
const Transaction = require("../models/transactionModel");
const Category = require("../models/categoryModel");
const Discount = require("../models/discountModel");
const Section = require("../models/sectionModel");
const Lesson = require("../models/lessonModel");
const Quiz = require("../models/QuizModel");
const InstructorProfile = require("../models/instructorProfileModel");
const Enrollment = require("../models/enrollmentModel");
const Payment = require("../models/paymentModel");
const Feedback = require("../models/feedbackModel");
const Comment = require("../models/commentModel");
const Progress = require("../models/progressModel");
const mongoose = require("mongoose");
const admin = require("firebase-admin");
const fs = require("fs");
const {
  uploadUserAvatar,
  deleteFromFirebase,
} = require("../utils/firebaseStorage");

/**
 * @desc    Get dashboard statistics for instructor
 * @route   GET /api/instructor/dashboard
 * @access  Private (Instructor only)
 * @query   year - Filter by year (optional, default: current year)
 * @query   startDate - Start date for custom range (optional, ISO format)
 * @query   endDate - End date for custom range (optional, ISO format)
 * @query   period - Time period: 'week', 'month', 'quarter', 'year', 'all' (optional, default: 'year')
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const instructorId = req.user._id;
    const today = new Date();

    // Parse query parameters
    const { year, startDate, endDate, period = "year" } = req.query;

    // Determine date range based on query parameters
    let dateRangeStart, dateRangeEnd;

    if (startDate && endDate) {
      // Custom date range
      dateRangeStart = new Date(startDate);
      dateRangeEnd = new Date(endDate);
    } else if (year) {
      // Specific year
      const targetYear = parseInt(year);
      dateRangeStart = new Date(targetYear, 0, 1);
      dateRangeEnd = new Date(targetYear, 11, 31, 23, 59, 59);
    } else {
      // Default to current year
      dateRangeStart = new Date(today.getFullYear(), 0, 1);
      dateRangeEnd = new Date(today.getFullYear(), 11, 31, 23, 59, 59);
    }

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayOfWeek = new Date(today);
    firstDayOfWeek.setDate(today.getDate() - today.getDay());

    // Lấy thông tin instructor để lấy moneyLeft
    const instructor = await User.findById(instructorId).select("moneyLeft");

    // Lấy danh sách các khóa học của instructor
    const instructorCourses = await Course.find({
      createdBy: instructorId,
    }).select("_id title price");

    const courseIds = instructorCourses.map((course) => course._id);

    const [
      totalCourses,
      totalStudents,
      totalRevenueResult,
      periodRevenueResult,
      monthlySales,
      newStudentsThisMonth,
      newStudentsThisWeek,
      latestTransactions,
      courseRatingData,
      topCoursesByRevenue,
      topCoursesByStudents,
      studentGrowthData,
      revenueByCourse,
      courseCompletionData,
      enrollmentStatusDistribution,
      categorySalesDistribution,
    ] = await Promise.all([
      // Tổng số khóa học của instructor
      Course.countDocuments({ createdBy: instructorId }),

      // Tổng số học viên (tất cả thời gian)
      Enrollment.aggregate([
        {
          $match: {
            courseId: { $in: courseIds },
            status: { $in: ["enrolled", "completed"] },
          },
        },
        {
          $group: {
            _id: "$userId",
          },
        },
        {
          $count: "total",
        },
      ]),

      // Tổng doanh thu (tất cả thời gian)
      Payment.aggregate([
        {
          $match: {
            status: "completed",
          },
        },
        {
          $lookup: {
            from: "enrollments",
            localField: "enrollmentIds",
            foreignField: "_id",
            as: "enrollments",
          },
        },
        {
          $unwind: "$enrollments",
        },
        {
          $match: {
            "enrollments.courseId": { $in: courseIds },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]),

      // Doanh thu trong khoảng thời gian được chọn
      Payment.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: dateRangeStart, $lte: dateRangeEnd },
          },
        },
        {
          $lookup: {
            from: "enrollments",
            localField: "enrollmentIds",
            foreignField: "_id",
            as: "enrollments",
          },
        },
        {
          $unwind: "$enrollments",
        },
        {
          $match: {
            "enrollments.courseId": { $in: courseIds },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),

      // Doanh thu theo tháng trong khoảng thời gian
      Payment.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: dateRangeStart, $lte: dateRangeEnd },
          },
        },
        {
          $lookup: {
            from: "enrollments",
            localField: "enrollmentIds",
            foreignField: "_id",
            as: "enrollments",
          },
        },
        {
          $unwind: "$enrollments",
        },
        {
          $match: {
            "enrollments.courseId": { $in: courseIds },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            revenue: { $sum: "$amount" },
            transactions: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),

      // Số học viên mới trong tháng này
      Enrollment.countDocuments({
        courseId: { $in: courseIds },
        status: { $in: ["enrolled", "completed"] },
        createdAt: { $gte: firstDayOfMonth },
      }),

      // Số học viên mới trong tuần này
      Enrollment.countDocuments({
        courseId: { $in: courseIds },
        status: { $in: ["enrolled", "completed"] },
        createdAt: { $gte: firstDayOfWeek },
      }),

      // 10 giao dịch gần nhất (tăng từ 5 lên 10)
      Payment.aggregate([
        {
          $match: {
            status: "completed",
          },
        },
        {
          $lookup: {
            from: "enrollments",
            localField: "enrollmentIds",
            foreignField: "_id",
            as: "enrollments",
          },
        },
        {
          $unwind: "$enrollments",
        },
        {
          $match: {
            "enrollments.courseId": { $in: courseIds },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "enrollments.userId",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $unwind: "$user",
        },
        {
          $lookup: {
            from: "courses",
            localField: "enrollments.courseId",
            foreignField: "_id",
            as: "course",
          },
        },
        {
          $unwind: "$course",
        },
        {
          $sort: { createdAt: -1 },
        },
        {
          $limit: 10,
        },
        {
          $project: {
            _id: 1,
            amount: 1,
            paymentDate: 1,
            paymentMethod: 1,
            status: 1,
            createdAt: 1,
            userId: {
              _id: "$user._id",
              firstName: "$user.firstName",
              lastName: "$user.lastName",
              email: "$user.email",
            },
            courseId: {
              _id: "$course._id",
              title: "$course.title",
            },
          },
        },
      ]),

      // Đánh giá khóa học - Lấy từ Feedback thực tế
      Feedback.aggregate([
        {
          $lookup: {
            from: "courses",
            localField: "courseId",
            foreignField: "_id",
            as: "course",
          },
        },
        {
          $unwind: "$course",
        },
        {
          $match: {
            "course.createdBy": instructorId,
          },
        },
        {
          $facet: {
            overallStats: [
              {
                $group: {
                  _id: null,
                  averageRating: { $avg: "$rateStar" },
                  totalFeedbacks: { $sum: 1 },
                },
              },
            ],
            ratingBreakdown: [
              {
                $group: {
                  _id: "$rateStar",
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: -1 } },
            ],
          },
        },
      ]),

      // Top 5 khóa học theo doanh thu
      Payment.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: dateRangeStart, $lte: dateRangeEnd },
          },
        },
        {
          $lookup: {
            from: "enrollments",
            localField: "enrollmentIds",
            foreignField: "_id",
            as: "enrollments",
          },
        },
        {
          $unwind: "$enrollments",
        },
        {
          $match: {
            "enrollments.courseId": { $in: courseIds },
          },
        },
        {
          $group: {
            _id: "$enrollments.courseId",
            revenue: { $sum: "$amount" },
            enrollments: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "courses",
            localField: "_id",
            foreignField: "_id",
            as: "course",
          },
        },
        {
          $unwind: "$course",
        },
        {
          $project: {
            _id: 1,
            title: "$course.title",
            thumbnail: "$course.thumbnail",
            price: "$course.price",
            rating: "$course.rating",
            revenue: 1,
            enrollments: 1,
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),

      // Top 5 khóa học theo số học viên
      Enrollment.aggregate([
        {
          $match: {
            courseId: { $in: courseIds },
            status: { $in: ["enrolled", "completed"] },
            createdAt: { $gte: dateRangeStart, $lte: dateRangeEnd },
          },
        },
        {
          $group: {
            _id: "$courseId",
            totalStudents: { $sum: 1 },
            uniqueStudents: { $addToSet: "$userId" },
          },
        },
        {
          $project: {
            _id: 1,
            totalEnrollments: "$totalStudents",
            uniqueStudents: { $size: "$uniqueStudents" },
          },
        },
        {
          $lookup: {
            from: "courses",
            localField: "_id",
            foreignField: "_id",
            as: "course",
          },
        },
        {
          $unwind: "$course",
        },
        {
          $project: {
            _id: 1,
            title: "$course.title",
            thumbnail: "$course.thumbnail",
            rating: "$course.rating",
            totalEnrollments: 1,
            uniqueStudents: 1,
          },
        },
        { $sort: { uniqueStudents: -1 } },
        { $limit: 5 },
      ]),

      // Student growth theo tuần trong khoảng thời gian
      Enrollment.aggregate([
        {
          $match: {
            courseId: { $in: courseIds },
            status: { $in: ["enrolled", "completed"] },
            createdAt: { $gte: dateRangeStart, $lte: dateRangeEnd },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              week: { $week: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.week": 1 } },
      ]),

      // Doanh thu theo từng khóa học
      Payment.aggregate([
        {
          $match: {
            status: "completed",
          },
        },
        {
          $lookup: {
            from: "enrollments",
            localField: "enrollmentIds",
            foreignField: "_id",
            as: "enrollments",
          },
        },
        {
          $unwind: "$enrollments",
        },
        {
          $match: {
            "enrollments.courseId": { $in: courseIds },
          },
        },
        {
          $group: {
            _id: "$enrollments.courseId",
            totalRevenue: { $sum: "$amount" },
            totalTransactions: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "courses",
            localField: "_id",
            foreignField: "_id",
            as: "course",
          },
        },
        {
          $unwind: "$course",
        },
        {
          $project: {
            _id: 1,
            title: "$course.title",
            price: "$course.price",
            totalRevenue: 1,
            totalTransactions: 1,
          },
        },
        { $sort: { totalRevenue: -1 } },
      ]),

      // Tỷ lệ hoàn thành khóa học
      Enrollment.aggregate([
        {
          $match: {
            courseId: { $in: courseIds },
          },
        },
        {
          $group: {
            _id: {
              courseId: "$courseId",
              status: "$status",
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: "$_id.courseId",
            statuses: {
              $push: {
                status: "$_id.status",
                count: "$count",
              },
            },
            totalEnrollments: { $sum: "$count" },
          },
        },
        {
          $lookup: {
            from: "courses",
            localField: "_id",
            foreignField: "_id",
            as: "course",
          },
        },
        {
          $unwind: "$course",
        },
        {
          $project: {
            _id: 1,
            title: "$course.title",
            statuses: 1,
            totalEnrollments: 1,
          },
        },
      ]),

      // Phân bố trạng thái enrollment (cho pie chart)
      Enrollment.aggregate([
        {
          $match: {
            courseId: { $in: courseIds },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            status: "$_id",
            count: 1,
            _id: 0,
          },
        },
      ]),

      // Phân bố doanh thu theo category (cho pie chart)
      Payment.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: dateRangeStart, $lte: dateRangeEnd },
          },
        },
        {
          $lookup: {
            from: "enrollments",
            localField: "enrollmentIds",
            foreignField: "_id",
            as: "enrollments",
          },
        },
        {
          $unwind: "$enrollments",
        },
        {
          $match: {
            "enrollments.courseId": { $in: courseIds },
          },
        },
        {
          $lookup: {
            from: "courses",
            localField: "enrollments.courseId",
            foreignField: "_id",
            as: "course",
          },
        },
        {
          $unwind: "$course",
        },
        {
          $unwind: "$course.categoryIds",
        },
        {
          $group: {
            _id: "$course.categoryIds",
            revenue: { $sum: "$amount" },
            enrollments: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "category",
          },
        },
        {
          $unwind: "$category",
        },
        {
          $project: {
            categoryId: "$_id",
            categoryName: "$category.name",
            revenue: 1,
            enrollments: 1,
          },
        },
        { $sort: { revenue: -1 } },
      ]),
    ]);

    // Xử lý dữ liệu rating
    let courseRating = { averageRating: 0, breakdown: [], totalReviews: 0 };
    if (
      courseRatingData.length > 0 &&
      courseRatingData[0].overallStats.length > 0
    ) {
      const stats = courseRatingData[0].overallStats[0];
      const breakdownData = courseRatingData[0].ratingBreakdown;
      const totalFeedbacks = stats.totalFeedbacks || 0;
      courseRating.averageRating = stats.averageRating || 0;
      courseRating.totalReviews = totalFeedbacks;
      const breakdownMap = new Map(
        breakdownData.map((item) => [item._id, item.count])
      );
      courseRating.breakdown = [5, 4, 3, 2, 1].map((star) => {
        const count = breakdownMap.get(star) || 0;
        return {
          stars: star,
          count: count,
          percentage:
            totalFeedbacks > 0 ? Math.round((count / totalFeedbacks) * 100) : 0,
        };
      });
    }

    // Xử lý doanh thu theo tháng - format theo year và month
    const formattedMonthlySales = monthlySales.map((item) => ({
      year: item._id.year,
      month: item._id.month,
      revenue: parseFloat(item.revenue.toString()),
      transactions: item.transactions,
    }));

    // Xử lý student growth data
    const formattedStudentGrowth = studentGrowthData.map((item) => ({
      year: item._id.year,
      week: item._id.week,
      newStudents: item.count,
    }));

    // Xử lý course completion rates
    const formattedCompletionData = courseCompletionData.map((course) => {
      const completedCount =
        course.statuses.find((s) => s.status === "completed")?.count || 0;
      const enrolledCount =
        course.statuses.find((s) => s.status === "enrolled")?.count || 0;
      const completionRate =
        course.totalEnrollments > 0
          ? Math.round((completedCount / course.totalEnrollments) * 100)
          : 0;

      return {
        courseId: course._id,
        title: course.title,
        totalEnrollments: course.totalEnrollments,
        completed: completedCount,
        inProgress: enrolledCount,
        completionRate: completionRate,
        statuses: course.statuses,
      };
    });

    // Format revenue by course
    const formattedRevenueByCourse = revenueByCourse.map((course) => ({
      courseId: course._id,
      title: course.title,
      price: parseFloat(course.price?.toString() || "0"),
      totalRevenue: parseFloat(course.totalRevenue.toString()),
      totalTransactions: course.totalTransactions,
      averageRevenuePerTransaction:
        course.totalTransactions > 0
          ? parseFloat(
              (course.totalRevenue / course.totalTransactions).toString()
            )
          : 0,
    }));

    // Format enrollment status distribution (for pie chart)
    const totalEnrollments = enrollmentStatusDistribution.reduce(
      (sum, item) => sum + item.count,
      0
    );
    const formattedEnrollmentStatus = enrollmentStatusDistribution.map(
      (item) => ({
        status: item.status,
        count: item.count,
        percentage:
          totalEnrollments > 0
            ? Math.round((item.count / totalEnrollments) * 100)
            : 0,
      })
    );

    // Format category sales distribution (for pie chart)
    const totalCategoryRevenue = categorySalesDistribution.reduce(
      (sum, item) => sum + parseFloat(item.revenue.toString()),
      0
    );
    const formattedCategorySales = categorySalesDistribution.map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      revenue: parseFloat(item.revenue.toString()),
      enrollments: item.enrollments,
      percentage:
        totalCategoryRevenue > 0
          ? Math.round(
              (parseFloat(item.revenue.toString()) / totalCategoryRevenue) * 100
            )
          : 0,
    }));

    res.status(200).json({
      success: true,
      period: {
        type: period,
        startDate: dateRangeStart,
        endDate: dateRangeEnd,
      },
      overview: {
        role: "instructor",
        totalCourses,
        totalStudents: totalStudents[0]?.total || 0,
        totalRevenue: parseFloat(
          totalRevenueResult[0]?.total.toString() || "0"
        ),
        periodRevenue: parseFloat(
          periodRevenueResult[0]?.total.toString() || "0"
        ),
        periodTransactions: periodRevenueResult[0]?.count || 0,
        moneyLeft: parseFloat(instructor?.moneyLeft?.toString() || "0"),
        newStudentsThisWeek,
        newStudentsThisMonth,
      },
      analytics: {
        monthlySales: formattedMonthlySales,
        studentGrowth: formattedStudentGrowth,
        topCoursesByRevenue,
        topCoursesByStudents,
        revenueByCourse: formattedRevenueByCourse,
        courseCompletion: formattedCompletionData,
      },
      pieCharts: {
        enrollmentStatus: formattedEnrollmentStatus,
        revenueByCategory: formattedCategorySales,
        revenueByCoursePieData: formattedRevenueByCourse.map((c) => ({
          name: c.title,
          value: c.totalRevenue,
          percentage: totalRevenueResult[0]?.total
            ? Math.round(
                (c.totalRevenue /
                  parseFloat(totalRevenueResult[0].total.toString())) *
                  100
              )
            : 0,
        })),
        courseRatingDistribution: courseRating.breakdown,
      },
      latestTransactions,
      courseRating,
    });
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu thống kê instructor:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy dữ liệu thống kê.",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all courses of the instructor
 * @route   GET /api/instructor/courses
 * @access  Private (Instructor only)
 */
exports.getCourses = async (req, res) => {
  try {
    const instructorId = req.user._id;

    // Get all courses created by this instructor
    const courses = await Course.find({ createdBy: instructorId })
      .populate("categoryIds", "name")
      .populate("discountId", "discountCode value type")
      .populate("sections", "name")
      .sort({ createdAt: -1 });

    // Get enrollment count for each course
    const coursesWithEnrollmentCount = await Promise.all(
      courses.map(async (course) => {
        const enrollmentCount = await Enrollment.countDocuments({
          courseId: course._id,
          status: "enrolled",
        });
        const courseObj = course.toObject();
        return {
          ...courseObj,
          studentsCount: enrollmentCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: coursesWithEnrollmentCount,
    });
  } catch (error) {
    console.error("Error in getCourses:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get course by ID (Instructor)
 * @route   GET /api/instructor/courses/:courseId
 * @access  Private (Instructor only)
 */
exports.getCourseById = async (req, res) => {
  try {
    const { courseId } = req.params;
    const instructorId = req.user._id;

    // Get course created by this instructor
    const course = await Course.findOne({
      _id: courseId,
      createdBy: instructorId,
    })
      .populate({
        path: "sections",
        populate: {
          path: "lessons",
          select:
            "title description lessonNotes materialUrl duration type quizIds order createdAt updatedAt",
          populate: {
            path: "quizIds",
            select:
              "_id title description questions roleCreated userId createdAt updatedAt",
          },
        },
      })
      .populate("categoryIds", "name")
      .populate("discountId", "discountCode value type status");

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found or you don't have permission to view it",
      });
    }

    // Get enrollment count and rating statistics
    const enrollmentCount = await Enrollment.countDocuments({
      courseId: courseId,
      status: "enrolled",
    });

    const courseObj = course.toObject();
    courseObj.enrollmentCount = enrollmentCount;

    // Transform lesson data for frontend compatibility
    if (courseObj.sections) {
      courseObj.sections = courseObj.sections.map((section) => ({
        ...section,
        lessons: section.lessons.map((lesson) => {
          const baseLesson = { ...lesson };

          switch (lesson.type) {
            case "quiz":
              if (lesson.quizIds && lesson.quizIds.length > 0) {
                const quiz = lesson.quizIds[0];
                baseLesson.quizData = quiz
                  ? {
                      title: quiz.title,
                      description: quiz.description,
                      questions: quiz.questions,
                      roleCreated: quiz.roleCreated,
                      userId: quiz.userId,
                    }
                  : null;
              }
              break;

            case "video":
              baseLesson.videoUrl = lesson.materialUrl || lesson.videoUrl;
              if (baseLesson.videoUrl) {
                const fileName = extractFileNameFromUrl(baseLesson.videoUrl);
                baseLesson.fileInfo = {
                  type: "video",
                  url: baseLesson.videoUrl,
                  fileName: fileName,
                  uploadedAt: lesson.createdAt,
                  canDelete: true,
                };
              }
              break;

            case "article":
              baseLesson.articleUrl = lesson.materialUrl;
              if (baseLesson.articleUrl) {
                const fileName = extractFileNameFromUrl(baseLesson.articleUrl);
                baseLesson.fileInfo = {
                  type: "article",
                  url: baseLesson.articleUrl,
                  fileName: fileName,
                  uploadedAt: lesson.createdAt,
                  canDelete: true,
                };
              }
              break;

            default:
              break;
          }

          return baseLesson;
        }),
      }));
    }

    res.status(200).json({
      success: true,
      data: courseObj,
    });
  } catch (error) {
    console.error("Error in getCourseById:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Helper function to check if course belongs to instructor
 */
const checkCourseOwnership = async (courseId, instructorId) => {
  return await Course.findOne({
    _id: courseId,
    createdBy: instructorId,
  });
};

/**
 * @desc    Update a section (Instructor)
 * @route   PUT /api/instructor/courses/:courseId/sections/:sectionId
 * @access  Private (Instructor only)
 */
exports.updateSection = async (req, res) => {
  try {
    const { courseId, sectionId } = req.params;
    const { name, order } = req.body;

    // Check if course exists and belongs to the instructor
    const course = await checkCourseOwnership(courseId, req.user._id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found or you don't have permission to edit it",
      });
    }

    // Check if section exists and belongs to the course
    const section = await Section.findOne({ _id: sectionId, courseId });
    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (order !== undefined) updateData.order = order;

    const updatedSection = await Section.findByIdAndUpdate(
      sectionId,
      updateData,
      { new: true, runValidators: true }
    ).populate({
      path: "lessons",
      select: "title description materialUrl duration type quizIds order",
      options: { sort: { order: 1 } },
    });

    res.status(200).json({
      success: true,
      message: "Section updated successfully",
      data: updatedSection,
    });
  } catch (error) {
    console.error("Error in updateSection:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete a section (Instructor)
 * @route   DELETE /api/instructor/courses/:courseId/sections/:sectionId
 * @access  Private (Instructor only)
 */
exports.deleteSection = async (req, res) => {
  try {
    const { courseId, sectionId } = req.params;

    // Check if course exists and belongs to the instructor
    const course = await checkCourseOwnership(courseId, req.user._id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found or you don't have permission to edit it",
      });
    }

    // Check if section exists and belongs to the course
    const section = await Section.findOne({ _id: sectionId, courseId });
    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    // Check if section has lessons
    if (section.lessons.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete section. Please remove all lessons first.",
      });
    }

    // Remove section from course's sections array
    course.sections = course.sections.filter(
      (id) => id.toString() !== sectionId
    );
    await course.save();

    // Delete the section
    await Section.findByIdAndDelete(sectionId);

    res.status(200).json({
      success: true,
      message: "Section deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteSection:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update a lesson (Instructor)
 * @route   PUT /api/instructor/courses/:courseId/lessons/:lessonId
 * @access  Private (Instructor only)
 */
exports.updateLesson = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const {
      title,
      description,
      lessonNotes,
      materialUrl,
      videoUrl,
      duration,
      order,
      type,
      quizIds,
    } = req.body;

    // Check if course exists and belongs to the instructor
    const course = await checkCourseOwnership(courseId, req.user._id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found or you don't have permission to edit it",
      });
    }

    // Check if lesson exists and belongs to the course
    const lesson = await Lesson.findOne({ _id: lessonId, courseId });
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      });
    }

    const mediaUrl = materialUrl || videoUrl;
    const lessonType = type;

    if (
      lessonType === "quiz" &&
      (!Array.isArray(quizIds) || quizIds.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "quizIds are required for quiz lessons",
      });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description;
    if (lessonNotes !== undefined) updateData.lessonNotes = lessonNotes;
    if (mediaUrl !== undefined) {
      updateData.materialUrl = mediaUrl;
    }
    if (duration !== undefined) updateData.duration = duration;
    if (order !== undefined) updateData.order = order;
    if (lessonType !== undefined) updateData.type = lessonType;
    if (quizIds !== undefined)
      updateData.quizIds = Array.isArray(quizIds) ? quizIds : [];

    const updatedLesson = await Lesson.findByIdAndUpdate(lessonId, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Lesson updated successfully",
      data: updatedLesson,
    });
  } catch (error) {
    console.error("Error in updateLesson:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete a lesson (Instructor)
 * @route   DELETE /api/instructor/courses/:courseId/lessons/:lessonId
 * @access  Private (Instructor only)
 */
exports.deleteLesson = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;

    // Check if course exists and belongs to the instructor
    const course = await checkCourseOwnership(courseId, req.user._id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found or you don't have permission to edit it",
      });
    }

    // Check if lesson exists and belongs to the course
    const lesson = await Lesson.findOne({ _id: lessonId, courseId });
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      });
    }

    // Remove lesson from section's lessons array
    const section = await Section.findById(lesson.sectionId);
    if (section) {
      const beforeCount = section.lessons.length;
      section.lessons = section.lessons.filter(
        (id) => id.toString() !== lessonId
      );
      await section.save();
    }

    // Delete the lesson
    await Lesson.findByIdAndDelete(lessonId);

    res.status(200).json({
      success: true,
      message: "Lesson deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteLesson:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Save course as draft (Instructor)
 * @route   POST /api/instructor/courses/draft
 * @access  Private (Instructor only)
 */
exports.saveToDraft = async (req, res) => {
  try {
    let {
      title,
      subTitle,
      subtitle,
      message,
      detail,
      materials,
      thumbnail,
      trailer,
      price,
      discountId,
      level,
      duration,
      language,
      subtitleLanguage,
    } = req.body;

    if (!subTitle && subtitle) {
      subTitle = subtitle;
    }

    // For draft, we don't require strict validation - allow partial data
    // Only validate that at least some basic field is present
    if (!title || title.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "At least a title is required to save as draft",
      });
    }

    // Gộp và validate categoryIds (allow empty for draft)
    const validCategories = await extractValidCategoryIds(req.body);

    if (level) level = level.toLowerCase();
    if (language) language = language.toLowerCase();
    if (subtitleLanguage) subtitleLanguage = subtitleLanguage.toLowerCase();

    // Get instructor's userId from authenticated user
    const instructorId = req.user._id;

    const newCourse = new Course({
      title,
      subTitle: subTitle || "",
      message: {
        welcome: message?.welcome || "",
        congrats: message?.congrats || "",
      },
      detail: {
        description: detail?.description || "",
        willLearn: detail?.willLearn || [],
        targetAudience: detail?.targetAudience || [],
        requirement: detail?.requirement || [],
      },
      materials: materials || [],
      thumbnail: thumbnail || "",
      trailer: trailer || "",
      categoryIds: validCategories,
      price: price ? parseFloat(price) : 0,
      discountId,
      level: level || "beginner",
      language: language || "vietnam",
      subtitleLanguage: subtitleLanguage || "vietnam",
      sections: [],
      createdBy: instructorId,
      status: "draft", // Set status to draft
    });

    const savedCourse = await newCourse.save();

    // Populate category and discount information
    const populatedCourse = await Course.findById(savedCourse._id)
      .populate("categoryIds", "name")
      .populate("discountId", "discountCode value type");

    res.status(201).json({
      success: true,
      message: "Course saved as draft successfully",
      data: populatedCourse,
    });
  } catch (error) {
    console.error("Error in saveToDraft:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * @desc    Create a new course (Instructor)
 * @route   POST /api/instructor/courses
 * @access  Private (Instructor only)
 */
exports.createCourse = async (req, res) => {
  try {
    let {
      title,
      subTitle,
      subtitle,
      message,
      detail,
      materials,
      thumbnail,
      trailer,
      price,
      discountId,
      level,
      duration,
      language,
      subtitleLanguage,
      status, // Allow instructor to set status (draft/pending)
    } = req.body;

    if (!subTitle && subtitle) {
      subTitle = subtitle;
    }

    // Validate required fields
    const errors = [];
    if (!title || title.trim() === "")
      errors.push("title is required and cannot be empty");
    if (!subTitle || subTitle.trim() === "")
      errors.push("subTitle is required and cannot be empty");
    if (!detail || typeof detail !== "object")
      errors.push("detail object is required");
    else if (!detail.description || detail.description.trim() === "")
      errors.push("detail.description is required and cannot be empty");
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0)
      errors.push("price is required and must be a positive number");
    if (errors.length > 0) {
      console.warn("createCourse validation failed", {
        errors,
        body: req.body,
      });
      return res.status(400).json({
        success: false,
        message: "Validation failed: " + errors.join(", "),
        errors: errors,
        receivedData: {
          title,
          subTitle,
          detailSummary:
            detail && typeof detail === "object"
              ? { description: detail.description }
              : null,
          price,
          categoryFields: {
            category: req.body.category,
            categoryId: req.body.categoryId,
            categoryIds: req.body.categoryIds,
          },
        },
      });
    }

    // Gộp và validate categoryIds
    const validCategories = await extractValidCategoryIds(req.body);
    if (validCategories.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No valid categories" });
    }

    // Validate discountId if provided
    if (discountId) {
      const discount = await Discount.findById(discountId);
      if (!discount) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid discount ID" });
      }
    }

    if (level) level = level.toLowerCase();
    if (language) language = language.toLowerCase();
    if (subtitleLanguage) subtitleLanguage = subtitleLanguage.toLowerCase();

    // Get instructor's userId from authenticated user
    const instructorId = req.user._id;

    // Validate status if provided
    const validStatuses = ["draft", "pending"];
    let courseStatus = "pending"; // Default status
    if (status !== undefined && validStatuses.includes(status)) {
      courseStatus = status;
    }

    const newCourse = new Course({
      title,
      subTitle,
      message: {
        welcome: message?.welcome || "",
        congrats: message?.congrats || "",
      },
      detail: {
        description: detail.description,
        willLearn: detail.willLearn || [],
        targetAudience: detail.targetAudience || [],
        requirement: detail.requirement || [],
      },
      materials: materials || [],
      thumbnail,
      trailer,
      categoryIds: validCategories,
      price: parseFloat(price),
      discountId,
      level: level || "beginner",
      language: language || "vietnam",
      subtitleLanguage: subtitleLanguage || "vietnam",
      sections: [],
      createdBy: instructorId,
      status: courseStatus,
    });

    const savedCourse = await newCourse.save();

    // Populate category and discount information
    const populatedCourse = await Course.findById(savedCourse._id)
      .populate("categoryIds", "name")
      .populate("discountId", "discountCode value type");

    // After course creation, check for uploaded files to move from temporary
    const uploadedFiles = req.body.uploadedFiles || {};

    const filesToMove = [];

    // Check for video file (should be trailer)
    if (uploadedFiles.video && uploadedFiles.video.url) {
      const videoUrl = uploadedFiles.video.url;
      const sourceDestination = extractSourceDestination(videoUrl);
      if (sourceDestination) {
        filesToMove.push({
          sourceDestination,
          folderType: "trailer",
          fileType: "video",
        });
      }
    }

    // Check for image/thumbnail files
    if (uploadedFiles.image && uploadedFiles.image.url) {
      const imageUrl = uploadedFiles.image.url;
      const sourceDestination = extractSourceDestination(imageUrl);
      if (sourceDestination) {
        filesToMove.push({
          sourceDestination,
          folderType: "thumbnail",
          fileType: "image",
        });
      }
    }

    // Check for lesson videos (new addition)
    if (
      uploadedFiles.lessonVideos &&
      Array.isArray(uploadedFiles.lessonVideos)
    ) {
      uploadedFiles.lessonVideos.forEach((lessonVideo, index) => {
        if (lessonVideo.url) {
          const videoUrl = lessonVideo.url;
          const sourceDestination = extractSourceDestination(videoUrl);
          if (sourceDestination) {
            filesToMove.push({
              sourceDestination,
              folderType: "section-data",
              fileType: "lesson-video",
              lessonIndex: index,
              originalUrl: videoUrl,
            });
          }
        }
      });
    }

    // Check for individual lesson videos (alternative format)
    if (uploadedFiles.lessons && Array.isArray(uploadedFiles.lessons)) {
      uploadedFiles.lessons.forEach((lesson, index) => {
        const lessonMediaUrl = lesson.videoUrl || lesson.materialUrl;
        if (lessonMediaUrl) {
          const sourceDestination = extractSourceDestination(lessonMediaUrl);
          if (sourceDestination) {
            filesToMove.push({
              sourceDestination,
              folderType: "section-data",
              fileType: "lesson-video",
              lessonIndex: index,
              originalUrl: lessonMediaUrl,
            });
          }
        }
      });
    }

    // ✅ Check for article files
    if (uploadedFiles.articles && Array.isArray(uploadedFiles.articles)) {
      uploadedFiles.articles.forEach((article, index) => {
        if (article.url) {
          const sourceDestination = extractSourceDestination(article.url);
          if (sourceDestination) {
            filesToMove.push({
              sourceDestination,
              folderType: "section-data",
              fileType: "lesson-article",
              lessonIndex: index,
              originalUrl: article.url,
            });
          }
        }
      });
    }

    // ✅ Check for quiz files (Word documents)
    if (uploadedFiles.quizFiles && Array.isArray(uploadedFiles.quizFiles)) {
      uploadedFiles.quizFiles.forEach((quizFile, index) => {
        if (quizFile.url) {
          const sourceDestination = extractSourceDestination(quizFile.url);
          if (sourceDestination) {
            filesToMove.push({
              sourceDestination,
              folderType: "section-data",
              fileType: "lesson-quiz-file",
              lessonIndex: index,
              originalUrl: quizFile.url,
            });
          }
        }
      });
    }

    // === TỰ ĐỘNG EXTRACT LESSON MEDIA URLs (VIDEO, ARTICLE, QUIZ) TỪ SECTIONS ===
    const inputSections = req.body.sections || [];
    let lessonVideoIndex = 0;
    const movedFilesMap = new Map();

    inputSections.forEach((section, sectionIndex) => {
      const lessons = section.lessons || [];

      lessons.forEach((lesson, lessonIndex) => {
        // Xác định loại lesson và URL tương ứng
        const lessonType = lesson.type || "video";
        let mediaUrl = null;
        let fileType = "lesson-video";
        let folderTypeForLesson = `section_${sectionIndex + 1}/lesson_${
          lessonIndex + 1
        }`;

        // Xử lý theo từng loại lesson
        if (lessonType === "video") {
          mediaUrl = lesson.videoUrl || lesson.materialUrl;
          fileType = "lesson-video";
        } else if (lessonType === "article") {
          mediaUrl = lesson.materialUrl || lesson.articleUrl;
          fileType = "lesson-article";
        } else if (lessonType === "quiz") {
          // Quiz có thể có file đính kèm (Word document)
          if (lesson.quizData && lesson.quizData.fileUrl) {
            mediaUrl = lesson.quizData.fileUrl;
            fileType = "lesson-quiz-file";
          }
        }

        // Nếu có media URL, thêm vào danh sách cần di chuyển
        if (mediaUrl) {
          const sourceDestination = extractSourceDestination(mediaUrl);
          if (sourceDestination) {
            // Kiểm tra xem file có đang ở temporary folder không
            if (sourceDestination.startsWith("temporary/")) {
              filesToMove.push({
                sourceDestination,
                folderType: folderTypeForLesson,
                fileType: fileType,
                lessonIndex: lessonVideoIndex,
                sectionIndex: sectionIndex,
                lessonIndexInSection: lessonIndex,
                originalUrl: mediaUrl,
                lessonType: lessonType,
              });
            }
            lessonVideoIndex++;
          }
        }
      });
    });

    if (filesToMove.length > 0) {
      const movePromises = filesToMove.map(async (fileData) => {
        try {
          const moveResult = await moveFileFromTemporaryToCourse(
            fileData.sourceDestination,
            savedCourse._id,
            fileData.folderType
          );

          // Lưu mapping cho tất cả các loại file (video, article, quiz)
          if (
            fileData.fileType === "lesson-video" ||
            fileData.fileType === "lesson-article" ||
            fileData.fileType === "lesson-quiz-file"
          ) {
            movedFilesMap.set(fileData.originalUrl, moveResult.newUrl);
          }

          return moveResult;
        } catch (error) {
          console.error(
            `❌ Failed to move file ${fileData.sourceDestination}:`,
            error.message
          );
          return { error: error.message, file: fileData };
        }
      });

      try {
        const moveResults = await Promise.all(movePromises);
      } catch (error) {
        console.error("❌ File move operation failed:", error.message);
      }
    }

    // === TỰ ĐỘNG TẠO SECTION VÀ LESSON ===
    const createdSectionIds = [];
    let totalDurationSeconds = 0;

    for (const sectionData of inputSections) {
      if (!sectionData.name || sectionData.name.trim() === "") {
        continue;
      }

      const newSection = new Section({
        name: sectionData.name,
        courseId: savedCourse._id,
        order: sectionData.order || 0,
        lessons: [],
      });
      const savedSection = await newSection.save();

      const inputLessons = sectionData.lessons || [];
      const createdLessonIds = [];

      for (const lessonData of inputLessons) {
        if (!lessonData.title || lessonData.title.trim() === "") {
          continue;
        }

        const lessonDuration = parseFloat(lessonData.duration) || 0;
        if (lessonDuration > 0) {
          totalDurationSeconds += lessonDuration; // <-- CỘNG VÀO TỔNG
        }

        let notes = "";
        if (lessonData.lessonNotes !== undefined) {
          notes = lessonData.lessonNotes;
        } else if (lessonData.lectureNotes !== undefined) {
          notes = lessonData.lectureNotes;
        }

        let lessonType = lessonData.type || "video";
        let mediaUrl = lessonData.materialUrl || lessonData.videoUrl || "";

        // ✅ Cập nhật URL nếu file đã được di chuyển từ temporary
        if (mediaUrl && movedFilesMap.has(mediaUrl)) {
          mediaUrl = movedFilesMap.get(mediaUrl);
        }

        let finalQuizIds = [];

        // Handle quiz data from frontend
        if (lessonData.quizData && typeof lessonData.quizData === "object") {
          const quizId = lessonData.quizData._id || lessonData.quizData.id;

          if (quizId && quizId.toString().trim() !== "") {
            if (!quizId.toString().startsWith("temp_")) {
              finalQuizIds = [quizId];
              lessonType = "quiz";
            } else {
              try {
                const { createQuizFromData } = require("./quizController");

                const quizPayload = {
                  title: lessonData.quizData.title,
                  description: lessonData.quizData.description || "",
                  questions: lessonData.quizData.questions || [],
                  timeLimit: lessonData.quizData.timeLimit || null,
                  passingScore: lessonData.quizData.passingScore || 70,
                  maxAttempts: lessonData.quizData.maxAttempts || 3,
                  randomizeQuestions:
                    lessonData.quizData.randomizeQuestions || false,
                  showCorrectAnswers:
                    lessonData.quizData.showCorrectAnswers || true,
                };

                if (
                  !quizPayload.questions ||
                  quizPayload.questions.length === 0
                ) {
                  continue;
                }

                const firstQuestion = quizPayload.questions[0];
                let hasValidStructure =
                  firstQuestion &&
                  firstQuestion.content &&
                  firstQuestion.answers &&
                  Array.isArray(firstQuestion.answers) &&
                  firstQuestion.answers.length > 0;

                if (!hasValidStructure && firstQuestion) {
                  quizPayload.questions = quizPayload.questions.map((q) => {
                    if (q.question && q.options) {
                      return {
                        content: q.question,
                        answers: (() => {
                          let options = [];
                          if (Array.isArray(q.options)) {
                            options = q.options;
                          } else if (
                            q.options &&
                            typeof q.options === "object"
                          ) {
                            options = Object.values(q.options);
                          }

                          return options.map((option, index) => ({
                            content: option,
                            isCorrect: index === (q.correctAnswer || 0),
                          }));
                        })(),
                        score: q.score || 1,
                        type: "multiple-choice",
                      };
                    }
                    return q;
                  });

                  const mappedFirstQuestion = quizPayload.questions[0];
                  hasValidStructure =
                    mappedFirstQuestion &&
                    mappedFirstQuestion.content &&
                    mappedFirstQuestion.answers &&
                    Array.isArray(mappedFirstQuestion.answers) &&
                    mappedFirstQuestion.answers.length > 0;
                }

                if (!hasValidStructure) {
                  continue;
                }

                quizPayload.userId = req.user._id;
                quizPayload.roleCreated = "instructor";
                const realQuiz = await createQuizFromData(quizPayload);

                finalQuizIds = [realQuiz._id];
                lessonType = "quiz";
              } catch (error) {
                continue;
              }
            }
          }
        } else if (
          Array.isArray(lessonData.quizIds) &&
          lessonData.quizIds.length > 0
        ) {
          finalQuizIds = lessonData.quizIds;
          lessonType = "quiz";
        } else if (lessonData.quizId && lessonData.quizId.trim() !== "") {
          finalQuizIds = [lessonData.quizId];
          lessonType = "quiz";
        } else if (
          lessonData.quiz &&
          typeof lessonData.quiz === "object" &&
          lessonData.quiz._id
        ) {
          finalQuizIds = [lessonData.quiz._id];
          lessonType = "quiz";
        } else if (
          lessonData.quiz &&
          typeof lessonData.quiz === "string" &&
          lessonData.quiz.trim() !== ""
        ) {
          finalQuizIds = [lessonData.quiz];
          lessonType = "quiz";
        }

        if (lessonType === "quiz") {
          if (finalQuizIds.length === 0) {
            continue;
          }
        }

        // ✅ Resolve URL from movedFilesMap if file was moved from temporary
        const resolvedMediaUrl = movedFilesMap.get(mediaUrl) || mediaUrl;

        const lessonPayload = {
          courseId: savedCourse._id,
          sectionId: savedSection._id,
          title: lessonData.title,
          description: lessonData.description || "",
          lessonNotes: notes,
          materialUrl: resolvedMediaUrl, // ✅ Use resolved URL instead of original
          duration: lessonDuration || 0,
          order: lessonData.order || 0,
          type: lessonType,
          quizIds: finalQuizIds,
        };

        let lesson;
        if (lessonData._id) {
          lesson = await Lesson.findOneAndUpdate(
            { _id: lessonData._id, sectionId: savedSection._id },
            lessonPayload,
            { new: true, runValidators: true }
          );
          if (!lesson) continue;
        } else {
          lesson = new Lesson(lessonPayload);
          await lesson.save();
        }
        createdLessonIds.push(lesson._id);
      }

      savedSection.lessons = createdLessonIds;
      await savedSection.save();

      createdSectionIds.push(savedSection._id);
    }

    if (createdSectionIds.length > 0) {
      savedCourse.sections = createdSectionIds;
    }

    function formatTotalDuration(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    }

    const formattedDuration = formatTotalDuration(totalDurationSeconds);
    savedCourse.duration = formattedDuration; // <-- GÁN DURATION ĐÃ TÍNH TOÁN // Lưu lại course với cả sections và duration
    await savedCourse.save();

    const fullPopulatedCourse = await Course.findById(savedCourse._id)
      .populate({ path: "sections", populate: { path: "lessons" } })
      .populate("categoryIds", "name")
      .populate("discountId", "discountCode value type");

    res.status(201).json({
      success: true,
      message: "Course created successfully",
      data: fullPopulatedCourse,
    });
  } catch (error) {
    console.error("Error in createCourse:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * @desc    Update an existing course (Instructor)
 * @route   PUT /api/instructor/courses/:courseId
 * @access  Private (Instructor only)
 */
exports.updateCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const {
      title,
      subTitle,
      subtitle,
      message,
      detail,
      materials,
      thumbnail,
      trailer,
      price,
      discountId,
      level,
      duration,
      language,
      subtitleLanguage,
      categoryIds,
      category,
      subCategory,
      sections, // Frontend có thể gửi sections data
      status, // Allow instructor to change status (draft/pending)
    } = req.body;

    // Check if course exists and belongs to the instructor
    const course = await checkCourseOwnership(courseId, req.user._id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found or you don't have permission to edit it",
      });
    }

    // Prepare update data
    const updateData = {};

    if (title !== undefined) updateData.title = title.trim();
    if (subTitle !== undefined || subtitle !== undefined) {
      updateData.subTitle = (subTitle || subtitle).trim();
    }

    if (message !== undefined) {
      updateData.message = {
        welcome: message.welcome || course.message?.welcome || "",
        congrats: message.congrats || course.message?.congrats || "",
      };
    }

    if (detail !== undefined) {
      updateData.detail = {
        description: detail.description || course.detail?.description || "",
        willLearn: detail.willLearn || course.detail?.willLearn || [],
        targetAudience:
          detail.targetAudience || course.detail?.targetAudience || [],
        requirement: detail.requirement || course.detail?.requirement || [],
      };
    }

    if (materials !== undefined) updateData.materials = materials;
    if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
    if (trailer !== undefined) updateData.trailer = trailer;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (discountId !== undefined) updateData.discountId = discountId;
    if (level !== undefined) updateData.level = level.toLowerCase();
    if (duration !== undefined) updateData.duration = duration;
    if (language !== undefined) updateData.language = language.toLowerCase();
    if (subtitleLanguage !== undefined)
      updateData.subtitleLanguage = subtitleLanguage.toLowerCase();

    // Handle status update (instructor can set draft/pending)
    if (status !== undefined) {
      const validStatuses = ["draft", "pending"];
      if (validStatuses.includes(status)) {
        updateData.status = status;
      }
    }

    // Handle category updates
    if (categoryIds || category || subCategory) {
      const validCategories = await extractValidCategoryIds(req.body);
      if (validCategories.length > 0) {
        updateData.categoryIds = validCategories;
      }
    }

    // Update the course basic info
    const updatedCourse = await Course.findByIdAndUpdate(courseId, updateData, {
      new: true,
      runValidators: true,
    });

    // === HANDLE SECTIONS/LESSONS UPDATE ===
    // If frontend sends sections data, sync the database state with it
    if (sections && Array.isArray(sections)) {
      let totalDurationSeconds = 0;

      // === DI CHUYỂN FILES TỪ TEMPORARY TRƯỚC KHI XỬ LÝ SECTIONS ===
      const filesToMove = [];
      const movedFilesMap = new Map();

      // Extract all media URLs from sections to check for temporary files
      sections.forEach((section, sectionIndex) => {
        const lessons = section.lessons || [];
        lessons.forEach((lesson, lessonIndex) => {
          const lessonType = lesson.type || "video";
          let mediaUrl = null;
          let fileType = "lesson-video";

          if (lessonType === "video") {
            mediaUrl = lesson.videoUrl || lesson.materialUrl;
            fileType = "lesson-video";
          } else if (lessonType === "article") {
            mediaUrl = lesson.materialUrl || lesson.articleUrl;
            fileType = "lesson-article";
          }

          if (mediaUrl) {
            const sourceDestination = extractSourceDestination(mediaUrl);
            if (
              sourceDestination &&
              sourceDestination.startsWith("temporary/")
            ) {
              filesToMove.push({
                sourceDestination,
                folderType: `section_${sectionIndex + 1}/lesson_${
                  lessonIndex + 1
                }`,
                fileType: fileType,
                originalUrl: mediaUrl,
                lessonType: lessonType,
              });
            }
          }
        });
      });

      // Move files from temporary to course folder
      if (filesToMove.length > 0) {
        const movePromises = filesToMove.map(async (fileData) => {
          try {
            const moveResult = await moveFileFromTemporaryToCourse(
              fileData.sourceDestination,
              courseId,
              fileData.folderType
            );

            movedFilesMap.set(fileData.originalUrl, moveResult.newUrl);

            return moveResult;
          } catch (error) {
            console.error(
              `❌ Failed to move file ${fileData.sourceDestination}:`,
              error.message
            );
            return { error: error.message, file: fileData };
          }
        });

        try {
          const moveResults = await Promise.all(movePromises);
        } catch (error) {
          console.error("❌ File move operation failed:", error.message);
        }
      }

      // Get current sections from database
      const currentSections = await Section.find({ courseId }).populate(
        "lessons"
      );
      const currentSectionIds = new Set(
        currentSections.map((s) => s._id.toString())
      );
      const requestSectionIds = new Set();
      const updatedSectionIds = [];

      // Process each section from request
      for (const sectionData of sections) {
        let section;

        // If section has _id and exists, update it
        if (
          sectionData._id &&
          currentSectionIds.has(sectionData._id.toString())
        ) {
          section = await Section.findByIdAndUpdate(
            sectionData._id,
            {
              name: sectionData.name,
              order: sectionData.order || 0,
            },
            { new: true }
          );
          requestSectionIds.add(sectionData._id.toString());
        }
        // Otherwise create new section
        else if (sectionData.name && sectionData.name.trim() !== "") {
          section = new Section({
            name: sectionData.name,
            courseId: courseId,
            order: sectionData.order || 0,
            lessons: [],
          });
          await section.save();
        } else {
          continue; // Skip invalid sections
        }

        // Process lessons for this section
        const requestLessonIds = new Set();
        const updatedLessonIds = [];
        const currentLessons = await Lesson.find({ sectionId: section._id });
        const currentLessonIds = new Set(
          currentLessons.map((l) => l._id.toString())
        );

        const inputLessons = sectionData.lessons || [];

        for (const lessonData of inputLessons) {
          if (!lessonData.title || lessonData.title.trim() === "") continue;

          const lessonDuration = parseFloat(lessonData.duration) || 0;
          if (lessonDuration > 0) {
            totalDurationSeconds += lessonDuration; // <-- CỘNG VÀO TỔNG
          }

          let lessonType = lessonData.type || "video";
          let mediaUrl = lessonData.materialUrl || lessonData.videoUrl || "";
          let finalQuizIds = [];

          // Handle quiz data
          if (lessonType === "quiz") {
            if (
              lessonData.quizData &&
              typeof lessonData.quizData === "object"
            ) {
              const quizId = lessonData.quizData._id || lessonData.quizData.id;
              if (quizId && !quizId.toString().startsWith("temp_")) {
                finalQuizIds = [quizId];
              }
            } else if (
              Array.isArray(lessonData.quizIds) &&
              lessonData.quizIds.length > 0
            ) {
              finalQuizIds = lessonData.quizIds;
            }

            if (finalQuizIds.length === 0) continue;
          }

          // Resolve URL from movedFilesMap if file was moved from temporary
          const resolvedMediaUrl = movedFilesMap.get(mediaUrl) || mediaUrl;

          const lessonPayload = {
            courseId: courseId,
            sectionId: section._id,
            title: lessonData.title.trim(),
            description: lessonData.description || "",
            lessonNotes:
              lessonData.lessonNotes || lessonData.lectureNotes || "",
            materialUrl: resolvedMediaUrl,
            duration: lessonDuration || 0,
            order: lessonData.order || 0,
            type: lessonType,
            quizIds: finalQuizIds,
          };

          let lesson;

          // Update existing lesson
          if (
            lessonData._id &&
            currentLessonIds.has(lessonData._id.toString())
          ) {
            lesson = await Lesson.findByIdAndUpdate(
              lessonData._id,
              lessonPayload,
              { new: true, runValidators: true }
            );
            requestLessonIds.add(lessonData._id.toString());
          }
          // Create new lesson
          else {
            lesson = new Lesson(lessonPayload);
            await lesson.save();
          }

          updatedLessonIds.push(lesson._id);
        }

        // Delete lessons that are not in the request (were removed by user)
        for (const currentLesson of currentLessons) {
          if (!requestLessonIds.has(currentLesson._id.toString())) {
            await Lesson.findByIdAndDelete(currentLesson._id);
          }
        }

        // Update section's lessons array
        section.lessons = updatedLessonIds;
        await section.save();

        updatedSectionIds.push(section._id);
      }

      // Delete sections that are not in the request (were removed by user)
      for (const currentSection of currentSections) {
        if (!requestSectionIds.has(currentSection._id.toString())) {
          // Delete all lessons in this section first
          await Lesson.deleteMany({ sectionId: currentSection._id });
          await Section.findByIdAndDelete(currentSection._id);
        }
      }

      function formatTotalDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
      }

      const formattedDuration = formatTotalDuration(totalDurationSeconds);
      updatedCourse.duration = formattedDuration;

      // Update course's sections array
      updatedCourse.sections = updatedSectionIds;
      await updatedCourse.save();
    }

    // Populate the updated course
    const populatedCourse = await Course.findById(courseId)
      .populate("categoryIds", "name")
      .populate("discountId", "discountCode value type")
      .populate({
        path: "sections",
        populate: {
          path: "lessons",
          select:
            "title description lessonNotes materialUrl duration type quizIds order",
          populate: {
            path: "quizIds",
            select: "_id title description questions roleCreated userId",
          },
        },
      });

    res.status(200).json({
      success: true,
      message: "Course updated successfully",
      data: populatedCourse,
    });
  } catch (error) {
    console.error("Error in updateCourse:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Create a new section in a course (Instructor)
 * @route   POST /api/instructor/courses/:courseId/sections
 * @access  Private (Instructor only)
 */
exports.createSection = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { name, order } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Section name is required",
      });
    }

    // Check if course exists and belongs to the instructor
    const course = await checkCourseOwnership(courseId, req.user._id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found or you don't have permission to edit it",
      });
    }

    const newSection = new Section({
      name: name.trim(),
      courseId,
      order: order || 0,
      lessons: [],
    });

    const savedSection = await newSection.save();

    course.sections.push(savedSection._id);
    await course.save();

    res.status(201).json({
      success: true,
      message: "Section created successfully",
      data: savedSection,
    });
  } catch (error) {
    console.error("Error in createSection:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Create a new lesson in a section (Instructor)
 * @route   POST /api/instructor/courses/:courseId/sections/:sectionId/lessons
 * @access  Private (Instructor only)
 */
exports.createLesson = async (req, res) => {
  try {
    const { courseId, sectionId } = req.params;
    const {
      title,
      description,
      lessonNotes,
      materialUrl,
      videoUrl,
      duration,
      order,
      type,
      quizIds,
    } = req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Lesson title is required",
      });
    }

    // Check if course exists and belongs to the instructor
    const course = await checkCourseOwnership(courseId, req.user._id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found or you don't have permission to edit it",
      });
    }

    // Check if section exists and belongs to the course
    const section = await Section.findOne({ _id: sectionId, courseId });
    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    const mediaUrl = materialUrl || videoUrl || "";
    const lessonType =
      type || (Array.isArray(quizIds) && quizIds.length > 0 ? "quiz" : "video");

    if (
      lessonType === "quiz" &&
      (!Array.isArray(quizIds) || quizIds.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "quizIds are required for quiz lessons",
      });
    }

    const newLesson = new Lesson({
      courseId,
      sectionId,
      title: title.trim(),
      description: description || "",
      lessonNotes: lessonNotes || "",
      materialUrl: mediaUrl,
      duration: duration || 0,
      order: order || 0,
      type: lessonType,
      quizIds: Array.isArray(quizIds) ? quizIds : [],
    });

    const savedLesson = await newLesson.save();

    section.lessons.push(savedLesson._id);
    await section.save();

    res.status(201).json({
      success: true,
      message: "Lesson created successfully",
      data: savedLesson,
    });
  } catch (error) {
    console.error("Error in createLesson:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all categories
 * @route   GET /api/instructor/categories
 * @access  Private (Instructor only)
 */
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({}, { _id: 1, name: 1 });
    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete lesson file (video/article) and update lesson
 * @route   DELETE /api/instructor/lessons/:lessonId/file
 * @access  Private (Instructor only)
 */
exports.deleteLessonFile = async (req, res) => {
  try {
    const { lessonId } = req.params;

    // Find the lesson
    const lesson = await Lesson.findById(lessonId).populate("courseId");
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      });
    }

    // Check if course belongs to instructor
    const course = await checkCourseOwnership(
      lesson.courseId._id,
      req.user._id
    );
    if (!course) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to modify this lesson",
      });
    }

    // Check if lesson has a file to delete
    if (!lesson.materialUrl) {
      return res.status(400).json({
        success: false,
        message: "Lesson does not have any file to delete",
      });
    }

    // Extract file path from Firebase URL for deletion
    const fileUrl = lesson.materialUrl;
    let deletionSuccess = false;

    try {
      // Attempt to delete file from Firebase Storage
      if (fileUrl.includes("firebasestorage.googleapis.com")) {
        const bucket = admin.storage().bucket();
        const decodedUrl = decodeURIComponent(fileUrl);

        // Extract the file path from Firebase storage URL
        const pathMatch = decodedUrl.match(/\/o\/(.+?)\?/);
        if (pathMatch && pathMatch[1]) {
          const filePath = decodeURIComponent(pathMatch[1]);
          const file = bucket.file(filePath);

          // Check if file exists before deleting
          const [exists] = await file.exists();
          if (exists) {
            await file.delete();
            deletionSuccess = true;
          } else {
            deletionSuccess = true;
          }
        }
      }
    } catch (fileError) {
      console.error("❌ Error deleting file from storage:", fileError);
      // Continue anyway to update the lesson record
    }

    // Update lesson to remove materialUrl
    lesson.materialUrl = "";
    await lesson.save();

    res.status(200).json({
      success: true,
      message: deletionSuccess
        ? "File deleted successfully and lesson updated"
        : "Lesson updated (file may not have been deleted from storage)",
      data: {
        lessonId: lesson._id,
        title: lesson.title,
        materialUrl: lesson.materialUrl,
        fileDeleted: deletionSuccess,
      },
    });
  } catch (error) {
    console.error("Error in deleteLessonFile:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update lesson file (video/article) with new uploaded file
 * @route   PUT /api/instructor/lessons/:lessonId/file
 * @access  Private (Instructor only)
 */
exports.updateLessonFile = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { materialUrl, fileType, videoUrl, url, fileUrl } = req.body;

    // Support multiple field names for URL
    const newFileUrl = materialUrl || videoUrl || url || fileUrl;

    if (!newFileUrl) {
      return res.status(400).json({
        success: false,
        message:
          "File URL is required (materialUrl, videoUrl, url, or fileUrl)",
        received: req.body,
      });
    }

    // Find the lesson
    const lesson = await Lesson.findById(lessonId).populate("courseId");
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      });
    }

    // Check if course belongs to instructor
    const course = await checkCourseOwnership(
      lesson.courseId._id,
      req.user._id
    );
    if (!course) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to modify this lesson",
      });
    }

    // Delete old file if exists
    if (lesson.materialUrl) {
      try {
        if (lesson.materialUrl.includes("firebasestorage.googleapis.com")) {
          const bucket = admin.storage().bucket();
          const decodedUrl = decodeURIComponent(lesson.materialUrl);
          const pathMatch = decodedUrl.match(/\/o\/(.+?)\?/);
          if (pathMatch && pathMatch[1]) {
            const filePath = decodeURIComponent(pathMatch[1]);
            const file = bucket.file(filePath);
            const [exists] = await file.exists();
            if (exists) {
              await file.delete();
            }
          }
        }
      } catch (fileError) {
        console.error("❌ Error deleting old file:", fileError);
        // Continue anyway
      }
    }

    // Update lesson with new file URL
    lesson.materialUrl = newFileUrl;

    // Update lesson type if fileType is provided
    if (fileType) {
      if (fileType === "video" || fileType === "article") {
        lesson.type = fileType;
      }
    }

    await lesson.save();

    res.status(200).json({
      success: true,
      message: "Lesson file updated successfully",
      data: {
        lessonId: lesson._id,
        title: lesson.title,
        materialUrl: lesson.materialUrl,
        type: lesson.type,
      },
    });
  } catch (error) {
    console.error("Error in updateLessonFile:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Helper function to extract file name from URL
 * @param {string} url - Firebase storage URL or any URL
 * @returns {string} - Extracted file name
 */
const extractFileNameFromUrl = (url) => {
  try {
    if (!url) return "Unknown File";

    // Handle Firebase storage URLs
    if (url.includes("firebasestorage.googleapis.com")) {
      // Extract filename from Firebase storage URL
      // Format: https://firebasestorage.googleapis.com/v0/b/bucket/o/path%2Ffilename.ext?...
      const decodedUrl = decodeURIComponent(url);
      const match = decodedUrl.match(/\/([^\/\?]+)(?:\?|$)/);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Fallback: extract from regular URL
    const urlParts = url.split("/");
    const lastPart = urlParts[urlParts.length - 1];

    // Remove query parameters
    const fileName = lastPart.split("?")[0];

    return fileName || "Unknown File";
  } catch (error) {
    console.error("Error extracting filename from URL:", error);
    return "Unknown File";
  }
};

/**
 * Helper function to extract source destination from Firebase URL
 */
function extractSourceDestination(firebaseUrl) {
  if (!firebaseUrl || typeof firebaseUrl !== "string") {
    return null;
  }

  try {
    // Handle Firebase Storage URL format
    // https://firebasestorage.googleapis.com/v0/b/bucket/o/path%2Fto%2Ffile?alt=media
    if (firebaseUrl.includes("firebasestorage.googleapis.com")) {
      const url = new URL(firebaseUrl);
      const match = url.pathname.match(/\/o\/(.+)$/);
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        return decoded;
      }
    }

    // Handle direct Google Storage URL format
    // https://storage.googleapis.com/bucket/path/to/file
    if (firebaseUrl.includes("storage.googleapis.com")) {
      const url = new URL(firebaseUrl);
      const pathParts = url.pathname.split("/");
      if (pathParts.length >= 3) {
        // Remove bucket name and leading slash
        const filePath = pathParts.slice(2).join("/");
        return filePath;
      }
    }

    // Handle signed URL format
    // https://storage.googleapis.com/bucket/path/to/file?X-Goog-Algorithm=...
    if (
      firebaseUrl.includes("storage.googleapis.com") &&
      firebaseUrl.includes("X-Goog-Algorithm")
    ) {
      const url = new URL(firebaseUrl);
      const pathParts = url.pathname.split("/");
      if (pathParts.length >= 3) {
        const filePath = pathParts.slice(2).join("/");
        return filePath;
      }
    }

    // Handle custom domain or other formats
    // Try to extract path after the domain
    const url = new URL(firebaseUrl);
    const path = url.pathname;
    if (path && path.length > 1) {
      // Remove leading slash
      const filePath = path.substring(1);
      return filePath;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Helper function to move file from temporary to course folder
 */
const moveFileFromTemporaryToCourse = async (
  sourceDestination,
  courseId,
  folderType
) => {
  try {
    const bucket = admin.storage().bucket();
    const sourceFile = bucket.file(sourceDestination);

    // Check if source file exists
    const [exists] = await sourceFile.exists();
    if (!exists) {
      throw new Error(`Source file not found: ${sourceDestination}`);
    }

    // Generate new destination based on folderType
    const fileName = sourceDestination.split("/").pop();
    let newDestination;

    // Handle different folder types
    if (folderType === "thumbnail" || folderType === "trailer") {
      // Standard folder structure for thumbnail and trailer
      newDestination = `courses/${courseId}/${folderType}/${fileName}`;
    } else if (
      folderType.includes("section_") &&
      folderType.includes("lesson_")
    ) {
      // New folder structure: section_1/lesson_1
      newDestination = `courses/${courseId}/${folderType}/${fileName}`;
    } else {
      // Fallback to general structure
      newDestination = `courses/${courseId}/${folderType}/${fileName}`;
    }

    const targetFile = bucket.file(newDestination);

    // Copy file to new location
    await sourceFile.copy(targetFile);

    // Delete original file from temporary folder
    await sourceFile.delete();

    // Generate new URL with proper format
    const bucketName = bucket.name;
    const encodedDestination = encodeURIComponent(newDestination);
    const newUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedDestination}?alt=media`;

    // Update course with new URL if it's thumbnail or trailer
    if (folderType === "thumbnail" || folderType === "trailer") {
      const updateData = {};
      updateData[folderType] = newUrl;
      await Course.findByIdAndUpdate(courseId, updateData);
    }

    return {
      success: true,
      from: sourceDestination,
      newDestination,
      newUrl,
    };
  } catch (error) {
    throw error;
  }
};

// Helper to normalize and validate categoryIds from request
// Only accepts valid existing category IDs - does NOT auto-create categories
// Category creation should be restricted to admin workflows only
async function extractValidCategoryIds(reqBody) {
  let { category, subCategory, categoryId, categoryIds, subCategoryId } =
    reqBody;
  let allCategories = [];
  if (Array.isArray(categoryIds))
    allCategories = allCategories.concat(categoryIds);
  if (categoryId) allCategories.push(categoryId);
  if (category) allCategories.push(category);
  if (subCategory) allCategories.push(subCategory);
  if (subCategoryId) allCategories.push(subCategoryId);
  allCategories = [...new Set(allCategories.filter(Boolean))];
  const validCategories = [];

  for (const catId of allCategories) {
    let cat = null;

    // Try to find by ObjectId first
    if (mongoose.Types.ObjectId.isValid(catId)) {
      cat = await Category.findById(catId);
    }

    // If not found and it's a string, try to find by exact name
    if (!cat && typeof catId === "string" && catId.trim() !== "") {
      cat = await Category.findOne({ name: catId.trim() });
    }

    // If category exists, add to valid list
    if (cat) {
      validCategories.push(cat._id);
    } else {
      // Log warning for invalid category but don't fail the request
      console.warn(
        `[WARN] Invalid category ID or name provided: "${catId}" - skipping`
      );
    }
  }

  return validCategories;
}

/**
 * @desc    Get instructor's own profile
 * @route   GET /api/instructor/profile
 * @access  Private (Instructor only)
 */
exports.getMyProfile = async (req, res) => {
  try {
    let profile = await InstructorProfile.findOne({
      userId: req.user._id,
    }).populate("userId", "firstName lastName email userImage");

    // If profile doesn't exist, create a default one
    if (!profile) {
      profile = await InstructorProfile.create({
        userId: req.user._id,
        phone: req.user.phone || "",
        expertise: [],
        experience: "",
        documents: [],
        applicationStatus: "approved", // Since they're already an instructor
        bio: "",
        headline: "",
        website: "",
        socialLinks: {
          linkedin: "",
          twitter: "",
          youtube: "",
          facebook: "",
        },
      });

      // Populate after creation
      profile = await InstructorProfile.findById(profile._id).populate(
        "userId",
        "firstName lastName email userImage"
      );
    }

    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error("Error fetching instructor profile:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update instructor's own profile
 * @route   PUT /api/instructor/profile
 * @access  Private (Instructor only)
 */
exports.updateMyProfile = async (req, res) => {
  try {
    const { phone, bio, headline, website, socialLinks } = req.body;

    const profile = await InstructorProfile.findOne({ userId: req.user._id });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Instructor profile not found",
      });
    }

    // Update fields
    if (phone) profile.phone = phone;
    if (bio !== undefined) profile.bio = bio;
    if (headline !== undefined) profile.headline = headline;
    if (website !== undefined) profile.website = website;
    if (socialLinks) {
      const parsedLinks =
        typeof socialLinks === "string" ? JSON.parse(socialLinks) : socialLinks;
      profile.socialLinks = { ...profile.socialLinks, ...parsedLinks };
    }

    // Handle avatar upload to Firebase if file is provided
    if (req.file) {
      let uploadedFilePath = null;
      try {
        uploadedFilePath = req.file.path;

        // Verify file exists before upload
        if (!fs.existsSync(uploadedFilePath)) {
          throw new Error("Upload file not found");
        }

        // Get current user data to check for existing image
        const currentUser = await User.findById(req.user._id);

        // Upload to Firebase Storage using uploadUserAvatar function
        const uploadResult = await uploadUserAvatar(
          uploadedFilePath,
          req.file.originalname,
          req.file.mimetype,
          req.user._id,
          currentUser.userName
        );

        // Delete old image if it exists
        if (currentUser.userImage) {
          try {
            // Extract file path from URL (format: UserAvatar/...)
            const urlParts = currentUser.userImage.split("/");
            const filePathIndex = urlParts.findIndex(
              (part) => part === "UserAvatar"
            );
            if (filePathIndex !== -1) {
              const oldImagePath = urlParts.slice(filePathIndex).join("/");
              await deleteFromFirebase(oldImagePath).catch((err) => {
                console.warn("Failed to delete old image:", err.message);
              });
            }
          } catch (deleteError) {
            console.warn("Error deleting old image:", deleteError.message);
          }
        }

        // Update user's avatar in User model
        await User.findByIdAndUpdate(req.user._id, {
          userImage: uploadResult.url,
        });

        // Clean up temp file
        if (fs.existsSync(uploadedFilePath)) {
          fs.unlinkSync(uploadedFilePath);
        }
      } catch (uploadError) {
        console.error("Error uploading avatar:", uploadError);

        // Clean up temp file on error
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
          fs.unlinkSync(uploadedFilePath);
        }

        return res.status(500).json({
          success: false,
          message: "Failed to upload avatar",
          error: uploadError.message,
        });
      }
    }

    await profile.save();

    // Re-fetch profile with populated userId to get updated avatar
    const updatedProfile = await InstructorProfile.findById(
      profile._id
    ).populate("userId", "firstName lastName email userImage");

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedProfile,
    });
  } catch (error) {
    console.error("Error updating instructor profile:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get public instructor profile
 * @route   GET /api/instructor/public/:userId
 * @access  Public
 */
exports.getPublicProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await InstructorProfile.findOne({
      userId,
      applicationStatus: "approved", // Only show approved instructors
    }).populate("userId", "firstName lastName email userImage");

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Instructor profile not found or not approved",
      });
    }

    // Get instructor's courses - only active courses
    const courses = await Course.find({
      createdBy: userId,
      status: "active",
    })
      .select("title thumbnail price rating")
      .populate("categoryIds", "name")
      .sort({ createdAt: -1 });

    // Get enrollment count for each course
    const coursesWithEnrollmentCount = await Promise.all(
      courses.map(async (course) => {
        const enrollmentCount = await Enrollment.countDocuments({
          courseId: course._id,
          status: "enrolled",
        });
        const courseObj = course.toObject();
        return {
          ...courseObj,
          enrollmentCount: enrollmentCount,
        };
      })
    );

    // Calculate total students from Enrollment table (consistent with enrollmentCount)
    const totalStudents = await Enrollment.countDocuments({
      courseId: { $in: courses.map((c) => c._id) },
      status: "enrolled",
    });

    // Calculate real-time statistics
    const totalCourses = courses.length;

    // Get all feedbacks for instructor's courses
    const feedbacks = await Feedback.find({
      courseId: { $in: courses.map((c) => c._id) },
    });

    const totalReviews = feedbacks.length;
    const averageRating =
      totalReviews > 0
        ? feedbacks.reduce((sum, feedback) => sum + feedback.rateStar, 0) /
          totalReviews
        : 0;

    const response = {
      user: profile.userId,
      profile: {
        bio: profile.bio,
        headline: profile.headline,
        website: profile.website,
        socialLinks: profile.socialLinks,
        expertise: profile.expertise,
        experience: profile.experience,
      },
      statistics: {
        totalCourses: totalCourses,
        totalStudents: totalStudents,
        averageRating: parseFloat(averageRating.toFixed(1)),
        totalReviews: totalReviews,
      },
      courses: coursesWithEnrollmentCount,
    };

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Error fetching public instructor profile:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get instructor statistics
 * @route   GET /api/instructor/stats/:userId
 * @access  Public
 */
exports.getInstructorStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await InstructorProfile.findOne({
      userId,
      applicationStatus: "approved",
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Instructor not found",
      });
    }

    const courses = await Course.find({ createdBy: userId });
    const courseIds = courses.map((c) => c._id);

    const [totalStudents, totalRevenue, courseRatings] = await Promise.all([
      User.countDocuments({
        enrolledCourses: { $in: courseIds },
      }),
      Transaction.aggregate([
        {
          $match: {
            status: "completed",
            courseId: { $in: courseIds },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Course.aggregate([
        {
          $match: {
            createdBy: userId,
            rating: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: "$totalReviews" },
          },
        },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalCourses: courses.length,
        totalStudents,
        totalRevenue: totalRevenue[0]?.total || 0,
        averageRating: courseRatings[0]?.averageRating || 0,
        totalReviews: courseRatings[0]?.totalReviews || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching instructor stats:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get course analytics for a specific course
 * @route   GET /api/instructor/courses/:courseId/analytics
 * @access  Private (Instructor only)
 * @query   period - 'week' | 'month' | 'year' (default: 'month')
 */
exports.getCourseAnalytics = async (req, res) => {
  try {
    const { courseId } = req.params;
    const instructorId = req.user._id;
    const { period = "month" } = req.query;

    // Verify course belongs to instructor
    const course = await Course.findOne({
      _id: courseId,
      createdBy: instructorId,
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found or you don't have permission to view it",
      });
    }

    const today = new Date();
    let startDate, endDate, labels, dateFormat;

    // Determine date range and labels based on period
    if (period === "all") {
      // All-time data - no date filter, just get summary
      startDate = new Date(0); // Beginning of time
      endDate = new Date();
      labels = [];
      dateFormat = "all";
    } else if (period === "week") {
      startDate = new Date(today);
      startDate.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
      labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      dateFormat = "dayOfWeek";
    } else if (period === "year") {
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today.getFullYear(), 11, 31, 23, 59, 59);
      labels = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      dateFormat = "month";
    } else {
      // month (default)
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
        23,
        59,
        59
      );
      const daysInMonth = endDate.getDate();
      labels = [];
      for (let i = 1; i <= daysInMonth; i += Math.ceil(daysInMonth / 7)) {
        labels.push(
          `${today.toLocaleString("en-US", { month: "short" })} ${String(
            i
          ).padStart(2, "0")}`
        );
      }
      dateFormat = "date";
    }

    // Convert courseId to ObjectId if it's a valid string
    let courseObjectId;
    if (mongoose.Types.ObjectId.isValid(courseId)) {
      courseObjectId = new mongoose.Types.ObjectId(courseId);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid course ID format",
      });
    }

    // Get enrollments for this course (filtered by date range for charts)
    const enrollments = await Enrollment.find({
      courseId: courseObjectId,
      createdAt: { $gte: startDate, $lte: endDate },
    }).select("createdAt userId");

    // Get total all-time student count for this course
    const totalStudents = await Enrollment.countDocuments({
      courseId: courseObjectId,
      status: { $in: ["enrolled", "completed"] },
    });

    // Get all sections and lessons for this course
    const sections = await Section.find({ courseId: courseObjectId }).select(
      "lessons"
    );
    const lessonIds = sections.flatMap((section) => section.lessons);

    // Get real comments (from lessons) for this course
    const comments = await Comment.find({
      lessonId: { $in: lessonIds },
      createdAt: { $gte: startDate, $lte: endDate },
    }).select("createdAt");

    // Get course progress data (views simulation based on progress updates)
    const progressUpdates = await Progress.find({
      courseId: courseObjectId,
      updatedAt: { $gte: startDate, $lte: endDate },
    }).select("updatedAt");

    // Get revenue data with proper date formatting
    let revenueData;
    if (dateFormat === "dayOfWeek") {
      revenueData = await Payment.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $lookup: {
            from: "enrollments",
            localField: "enrollmentIds",
            foreignField: "_id",
            as: "enrollments",
          },
        },
        {
          $unwind: "$enrollments",
        },
        {
          $match: {
            "enrollments.courseId": courseObjectId,
          },
        },
        {
          $group: {
            _id: { $dayOfWeek: "$createdAt" },
            totalRevenue: { $sum: { $toDouble: "$amount" } },
          },
        },
      ]);
    } else if (dateFormat === "month") {
      revenueData = await Payment.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $lookup: {
            from: "enrollments",
            localField: "enrollmentIds",
            foreignField: "_id",
            as: "enrollments",
          },
        },
        {
          $unwind: "$enrollments",
        },
        {
          $match: {
            "enrollments.courseId": courseObjectId,
          },
        },
        {
          $group: {
            _id: { $month: "$createdAt" },
            totalRevenue: { $sum: { $toDouble: "$amount" } },
          },
        },
      ]);
    } else {
      revenueData = await Payment.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $lookup: {
            from: "enrollments",
            localField: "enrollmentIds",
            foreignField: "_id",
            as: "enrollments",
          },
        },
        {
          $unwind: "$enrollments",
        },
        {
          $match: {
            "enrollments.courseId": courseObjectId,
          },
        },
        {
          $group: {
            _id: { $dayOfMonth: "$createdAt" },
            totalRevenue: { $sum: { $toDouble: "$amount" } },
          },
        },
      ]);
    }

    // Get rating breakdown
    const feedbacks = await Feedback.find({ courseId: courseObjectId }).select(
      "rateStar"
    );
    const ratingBreakdown = [0, 0, 0, 0, 0]; // 1-5 stars
    feedbacks.forEach((feedback) => {
      if (feedback.rateStar >= 1 && feedback.rateStar <= 5) {
        ratingBreakdown[feedback.rateStar - 1]++;
      }
    });

    const totalRatings = feedbacks.length;
    const ratingPercentages = ratingBreakdown.map((count) =>
      totalRatings > 0 ? Math.round((count / totalRatings) * 100) : 0
    );

    // Helper function to aggregate data by time period
    const aggregateByPeriod = (data, dateField = "createdAt") => {
      const counts = new Array(labels.length).fill(0);

      data.forEach((item) => {
        const date = new Date(item[dateField]);
        let index;

        if (dateFormat === "dayOfWeek") {
          index = date.getDay();
        } else if (dateFormat === "month") {
          index = date.getMonth();
        } else {
          // date
          const day = date.getDate();
          index = Math.floor((day - 1) / Math.ceil(endDate.getDate() / 7));
          index = Math.min(index, labels.length - 1);
        }

        if (index >= 0 && index < counts.length) {
          counts[index]++;
        }
      });

      return counts;
    };

    // Aggregate revenue by period
    const revenueByPeriod = new Array(labels.length).fill(0);
    revenueData.forEach((item) => {
      let index = item._id;
      if (dateFormat === "dayOfWeek") {
        // $dayOfWeek returns 1 (Sunday) to 7 (Saturday), convert to 0-6
        index = index - 1;
      } else if (dateFormat === "month") {
        // $month returns 1-12, convert to 0-11
        index = index - 1;
      } else {
        // For date format, map day to label index
        const day = index;
        index = Math.floor((day - 1) / Math.ceil(endDate.getDate() / 7));
        index = Math.min(index, labels.length - 1);
      }
      if (index >= 0 && index < revenueByPeriod.length) {
        revenueByPeriod[index] = item.totalRevenue;
      }
    });

    const commentsData = aggregateByPeriod(comments);
    const viewsData = aggregateByPeriod(progressUpdates, "updatedAt");

    // Calculate total revenue (for 'all' period, sum directly from revenueData)
    const totalRevenue =
      dateFormat === "all"
        ? revenueData.reduce((sum, item) => sum + item.totalRevenue, 0)
        : revenueByPeriod.reduce((a, b) => a + b, 0);

    // Calculate rating trend (simplified - last 7 data points)
    const recentFeedbacks = await Feedback.find({ courseId: courseObjectId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("rateStar");

    const ratingTrend = [];
    const chunkSize = Math.ceil(recentFeedbacks.length / 7);
    for (let i = 0; i < 7; i++) {
      const chunk = recentFeedbacks.slice(i * chunkSize, (i + 1) * chunkSize);
      const avgRating =
        chunk.length > 0
          ? chunk.reduce((sum, f) => sum + f.rateStar, 0) / chunk.length
          : 0;
      ratingTrend.push(Math.round(avgRating * 10)); // Scale for visualization
    }

    res.status(200).json({
      success: true,
      data: {
        revenue: {
          labels: labels,
          data: revenueByPeriod,
        },
        courseOverview: {
          labels: labels,
          comments: commentsData,
          views: viewsData,
        },
        ratingBreakdown: {
          stars: [5, 4, 3, 2, 1],
          percentages: ratingPercentages.reverse(), // 5 stars first
          counts: ratingBreakdown.reverse(),
        },
        ratingTrend: ratingTrend,
        summary: {
          totalRevenue: totalRevenue,
          totalStudents: totalStudents,
          totalComments: commentsData.reduce((a, b) => a + b, 0),
          totalViews: viewsData.reduce((a, b) => a + b, 0),
          averageRating: course.rating || 0,
          totalRatings: totalRatings,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching course analytics:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all feedbacks for instructor's courses
 * @route   GET /api/instructor/feedbacks/:userId
 * @access  Public
 */
exports.getInstructorFeedbacks = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    // Check if instructor profile exists and is approved
    const profile = await InstructorProfile.findOne({
      userId,
      applicationStatus: "approved",
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Instructor not found",
      });
    }

    // Get all courses by this instructor
    const courses = await Course.find({
      createdBy: userId,
      status: "active",
    }).select("_id title thumbnail");

    const courseIds = courses.map((c) => c._id);

    if (courseIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          feedbacks: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalFeedbacks: 0,
            hasMore: false,
          },
        },
      });
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortOrder = order === "asc" ? 1 : -1;

    // Get feedbacks with populated user and course info
    const feedbacks = await Feedback.find({
      courseId: { $in: courseIds },
    })
      .populate("userId", "firstName lastName userImage")
      .populate("courseId", "title thumbnail")
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalFeedbacks = await Feedback.countDocuments({
      courseId: { $in: courseIds },
    });

    const totalPages = Math.ceil(totalFeedbacks / limit);

    res.status(200).json({
      success: true,
      data: {
        feedbacks,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalFeedbacks,
          hasMore: page < totalPages,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching instructor feedbacks:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * API: Cập nhật thông tin thanh toán (Payout Details)
 * Dùng cho: Instructor
 * PUT /api/instructor/payout-details
 */
exports.updatePayoutDetails = async (req, res) => {
  const { bankName, accountNumber, accountHolderName } = req.body;
  const instructorId = req.user._id; // Lấy từ middleware authorize

  // 1. Validate đầu vào
  if (!bankName || !accountNumber || !accountHolderName) {
    return res.status(400).json({
      message:
        "Vui lòng cung cấp đầy đủ: Tên ngân hàng, Số tài khoản, và Tên chủ tài khoản.",
    });
  }

  try {
    // 2. Tìm và cập nhật user
    const updatedUser = await User.findByIdAndUpdate(
      instructorId,
      {
        $set: {
          payoutDetails: {
            bankName: bankName.trim(),
            accountNumber: accountNumber.trim(),
            accountHolderName: accountHolderName.trim(),
          },
        },
      },
      {
        new: true, // Trả về tài liệu đã cập nhật
        runValidators: true, // Chạy qua các validation (nếu có)
        select: "payoutDetails", // Chỉ trả về trường payoutDetails
      }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng." });
    }

    // 3. Trả về kết quả
    res.status(200).json({
      message: "Cập nhật thông tin thanh toán thành công.",
      payoutDetails: updatedUser.payoutDetails,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật payout details:", error);
    res.status(500).json({ message: "Lỗi máy chủ nội bộ." });
  }
};
