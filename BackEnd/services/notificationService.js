const Notification = require("../models/notificationModel"); // Nhớ tạo model Notification ở bước trước
const User = require("../models/userModel");

/**
 * Service tạo và bắn thông báo realtime
 * @param {Object} io - Socket.io instance (lấy từ req.app.get('io'))
 * @param {Object} data - Dữ liệu thông báo
 * @param {string} data.recipient - ID người nhận
 * @param {string} data.sender - ID người gửi
 * @param {string} data.type - Loại: 'like', 'comment', 'system', 'course', 'payment'
 * @param {string} data.content - Nội dung hiển thị
 * @param {string} data.link - Link điều hướng (vd: /courses/123)
 */
exports.createAndSendNotification = async (
  io,
  { recipient, sender, type, content, link }
) => {
  try {
    // 1. Không gửi thông báo nếu tự like/comment bài mình
    if (recipient.toString() === sender.toString()) {
      return null;
    }

    // 2. Tạo DB Record
    const newNotification = new Notification({
      recipient,
      sender,
      type,
      content,
      link: link || "",
      isRead: false,
    });

    await newNotification.save();

    // 3. Populate thông tin người gửi để hiển thị Avatar/Tên bên Client
    const populatedNoti = await newNotification.populate(
      "sender",
      "firstName lastName userImage"
    );

    // 4. Bắn Socket tới Room của người nhận
    if (io) {
      // Emit sự kiện có thông báo mới
      io.to(recipient.toString()).emit("new_notification", populatedNoti);

      // (Optional) Emit số lượng chưa đọc mới nhất để cập nhật badge đỏ
      const unreadCount = await Notification.countDocuments({
        recipient,
        isRead: false,
      });
      io.to(recipient.toString()).emit("unread_count_update", unreadCount);
    }

    return populatedNoti;
  } catch (error) {
    console.error("Notification Service Error:", error);
    // Không throw error để tránh làm hỏng flow chính (vd: comment vẫn thành công dù noti lỗi)
  }
};
