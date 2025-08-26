const Notification = require("../models/notificationModel");
const notificationController = {
  /**
   * @desc    Nhận thông báo: Lấy danh sách thông báo cho người dùng đã đăng nhập, hỗ trợ phân trang.
   * @route   GET /api/notifications/:userId?page=1&limit=10
   * @access  public
   */
  getNotifications: async (req, res) => {
    try {
      const userId = req.params.userId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const notifications = await Notification.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Notification.countDocuments({ userId });

      res.status(200).json({
        notifications,
        page,
        totalPages: Math.ceil(total / limit),
        total,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
  /**
   * @desc    Update thông báo: Cập nhật trạng thái đọc cho tất cả thông báo của người dùng đã đăng nhập.
   * @route   PUT /api/notifications/:userId
   * @access  public
   */
  updateAllStatusNotification: async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      const result = await Notification.updateMany(
        { userId },
        { readStatus: true }
      );
      res.status(200).json({ message: "Updated all notifications", result });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
};
module.exports = notificationController;
// const Notification = require('../models/notificationModel'); ----không dùng nhưng để đây để fix sau này
// const notificationController = {
//     //Nhận thông báo: Lấy danh sách thông báo cho người dùng đã đăng nhập.
//     // just student can access this route
//     // api/notifications/:userId
//     getNotifications: async (req, res) => {
//         try {
//             const userId = req.params.userId
//             const notifications = await Notification.find({ userId })
//             res.status(200).json(notifications);
//         } catch (error) {
//             res.status(500).json({ message: error.message });
//         }
//     }
// }
// module.exports = notificationController;
