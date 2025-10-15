const User = require("../models/userModel");
const Course = require("../models/courseModel");
const Transaction = require("../models/transactionModel");
const Category = require("../models/categoryModel");

/**
 * @desc    Get dashboard statistics for instructor
 * @route   GET /api/instructor/dashboard
 * @access  Private (Instructor only)
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const instructorId = req.user._id;
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Lấy danh sách các khóa học của instructor
    const instructorCourses = await Course.find({
      createdBy: instructorId
    }).select("_id");

    const courseIds = instructorCourses.map(course => course._id);

    const [
      totalCourses,
      totalStudents,
      totalRevenueResult,
      monthlySales,
      newStudentsThisMonth,
      latestTransactions,
      courseRatingData,
    ] = await Promise.all([
      // Tổng số khóa học của instructor
      Course.countDocuments({ createdBy: instructorId }),

      // Tổng số học viên đã đăng ký các khóa học của instructor
      User.aggregate([
        {
          $match: {
            enrolledCourses: { $in: courseIds }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 }
          }
        }
      ]),

      // Tổng doanh thu từ các khóa học của instructor
      Transaction.aggregate([
        {
          $match: {
            status: "completed",
            courseId: { $in: courseIds }
          }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),

      // Doanh thu theo tháng trong năm hiện tại
      Transaction.aggregate([
        {
          $match: {
            status: "completed",
            courseId: { $in: courseIds },
            createdAt: { $gte: new Date(today.getFullYear(), 0, 1) },
          },
        },
        {
          $group: {
            _id: { month: { $month: "$createdAt" } },
            total: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.month": 1 } },
      ]),

      // Số học viên mới trong tháng này
      User.countDocuments({
        enrolledCourses: { $in: courseIds },
        createdAt: { $gte: firstDayOfMonth }
      }),

      // 5 giao dịch gần nhất
      Transaction.find({
        status: "completed",
        courseId: { $in: courseIds }
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("userId", "firstName lastName email")
        .populate("courseId", "title"),

      // Đánh giá khóa học
      Course.aggregate([
        {
          $match: {
            createdBy: instructorId,
            rating: { $exists: true, $ne: null }
          }
        },
        {
          $facet: {
            overallStats: [
              {
                $group: {
                  _id: null,
                  averageRating: { $avg: "$rating" },
                  totalCoursesWithRating: { $sum: 1 },
                },
              },
            ],
            ratingBreakdown: [
              { $group: { _id: { $round: "$rating" }, count: { $sum: 1 } } },
              { $sort: { _id: -1 } },
            ],
          },
        },
      ]),
    ]);

    // Xử lý dữ liệu rating
    let courseRating = { averageRating: 0, breakdown: [] };
    if (
      courseRatingData.length > 0 &&
      courseRatingData[0].overallStats.length > 0
    ) {
      const stats = courseRatingData[0].overallStats[0];
      const breakdownData = courseRatingData[0].ratingBreakdown;
      const totalRatedCourses = stats.totalCoursesWithRating;
      courseRating.averageRating = stats.averageRating;
      const breakdownMap = new Map(
        breakdownData.map((item) => [item._id, item.count])
      );
      courseRating.breakdown = [5, 4, 3, 2, 1].map((star) => {
        const count = breakdownMap.get(star) || 0;
        return {
          stars: star,
          count: count,
          percentage:
            totalRatedCourses > 0
              ? Math.round((count / totalRatedCourses) * 100)
              : 0,
        };
      });
    }

    // Xử lý doanh thu theo tháng
    const formattedMonthlySales = Array.from({ length: 12 }, (_, i) => {
      const monthData = monthlySales.find((m) => m._id.month === i + 1);
      return {
        month: i + 1,
        revenue: parseFloat(monthData?.total.toString() || "0"),
      };
    });

    res.status(200).json({
      role: "instructor",
      totalCourses,
      totalStudents: totalStudents[0]?.total || 0,
      totalRevenue: parseFloat(totalRevenueResult[0]?.total.toString() || "0"),
      newStudentsThisMonth,
      monthlySales: formattedMonthlySales,
      latestTransactions,
      courseRating,
    });
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu thống kê instructor:", error);
    res.status(500).json({
      message: "Lỗi máy chủ khi lấy dữ liệu thống kê.",
      error: error.message
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
