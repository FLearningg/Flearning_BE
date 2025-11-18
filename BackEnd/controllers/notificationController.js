const Notification = require("../models/notificationModel");
const {
  createAndSendNotification,
} = require("../services/notificationService");

// Lấy danh sách thông báo
exports.getUserNotifications = async (req, res) => {
  try {
    // Lấy ID user từ middleware (thường là req.user.id hoặc req.user._id)
    const userId = req.user.id || req.user._id;

    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 }) // Mới nhất lên đầu
      .limit(20) // Lấy 20 cái gần nhất
      .populate("sender", "firstName lastName userImage");

    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Đánh dấu 1 cái là đã đọc
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id || req.user._id;

    const updated = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true },
      { new: true }
    );

    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// Đánh dấu tất cả là đã đọc
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true }
    );
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// (Admin) Tạo thông báo hệ thống
exports.createSystemNotification = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { recipientId, content, link } = req.body;
    const senderId = req.user.id || req.user._id; // Admin là người gửi

    const noti = await createAndSendNotification(io, {
      recipient: recipientId,
      sender: senderId,
      type: "system", // Loại system icon khác
      content: content,
      link: link,
    });

    res.status(201).json(noti);
  } catch (error) {
    res.status(500).json({ message: "Create System Noti Error" });
  }
};
