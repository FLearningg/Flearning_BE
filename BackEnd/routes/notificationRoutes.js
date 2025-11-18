const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");

// Import middleware auth của bạn (đường dẫn có thể khác tùy folder structure của bạn)
const authMiddleware = require("../middlewares/authMiddleware");

/**
 * @route   GET /api/notifications/
 * @desc    Lấy danh sách thông báo cho user hiện tại
 * @access  Private (Student/Instructor/Admin)
 */
router.get("/", authMiddleware(), notificationController.getUserNotifications);

/**
 * @route   PUT /api/notifications/:notificationId/read
 * @desc    Đánh dấu 1 thông báo là đã đọc
 * @access  Private
 */
router.put(
  "/:notificationId/read",
  authMiddleware(),
  notificationController.markAsRead
);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Đánh dấu TẤT CẢ thông báo là đã đọc
 * @access  Private
 */
router.put("/read-all", authMiddleware(), notificationController.markAllAsRead);

/**
 * @route   POST /api/notifications/
 * @desc    (Admin only) Tạo thông báo hệ thống thủ công
 * @access  Admin
 */
router.post(
  "/",
  authMiddleware("admin"), // Chỉ admin mới được post trực tiếp
  notificationController.createSystemNotification
);

module.exports = router;
