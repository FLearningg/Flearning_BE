const User = require("../models/userModel");
const Course = require("../models/courseModel");
const Enrollment = require("../models/enrollmentModel");
const Transaction = require("../models/transactionModel");

/**
 * @desc    Get dashboard statistics (revenue, users, etc.)
 * @route   GET /api/admin/stats
 * @access  Private (Admin only)
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Sử dụng Promise.all để thực hiện các truy vấn song song, tăng hiệu suất
    const [
      totalUsers,
      totalCourses,
      totalEnrollments,
      totalRevenueResult,
      monthlySales,
      newUsersThisMonth,
      latestTransactions,
    ] = await Promise.all([
      // 1. Đếm tổng số người dùng
      User.countDocuments(),

      // 2. Đếm tổng số khóa học
      Course.countDocuments(),

      // 3. Đếm tổng số lượt đăng ký
      Enrollment.countDocuments(),

      // 4. Tính tổng doanh thu từ các giao dịch đã hoàn thành
      Transaction.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),

      // 5. Thống kê doanh thu theo từng tháng trong năm nay
      Transaction.aggregate([
        {
          $match: {
            status: "completed",
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

      // 6. Đếm số lượng người dùng mới trong tháng này
      User.countDocuments({ createdAt: { $gte: firstDayOfMonth } }),

      // 7. Lấy 5 giao dịch gần nhất
      Transaction.find({ status: "completed" })
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    // Định dạng lại dữ liệu doanh thu theo tháng để dễ dùng ở frontend
    const formattedMonthlySales = Array.from({ length: 12 }, (_, i) => {
      const monthData = monthlySales.find((m) => m._id.month === i + 1);
      return {
        month: i + 1,
        revenue: parseFloat(monthData?.total.toString() || "0"),
      };
    });

    // Trả về kết quả
    res.status(200).json({
      totalUsers,
      totalCourses,
      totalEnrollments,
      totalRevenue: parseFloat(totalRevenueResult[0]?.total.toString() || "0"),
      newUsersThisMonth,
      monthlySales: formattedMonthlySales,
      latestTransactions,
    });
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu thống kê:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy dữ liệu thống kê." });
  }
};
