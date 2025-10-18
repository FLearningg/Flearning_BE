const express = require("express");
const router = express.Router();
const authorize = require("../middlewares/authMiddleware");

// IMPORTANT: Cần destructuring đúng tên hàm export ra
const {
  addTransaction,
  vietQrPayment,
  createPaymentLink,
  handlePayOsWebhook,
  getPaymentStatus,
  cancelPayment,
} = require("../controllers/paymentController");

// GET → lấy QR
router.get("/transactions", authorize(), vietQrPayment); // Thêm authorize() cho bảo mật

// POST → tạo giao dịch
// ***** START: SỬA LỖI BẢO MẬT *****
// Thêm middleware 'authorize()' để bảo vệ endpoint này
router.post("/transactions", authorize(), addTransaction);
// ***** END: SỬA LỖI BẢO MẬT *****

// Các route PayOS (đã đúng)
router.post("/create-link", authorize(), createPaymentLink);
router.post("/webhook", handlePayOsWebhook); // Webhook phải là public
router.get("/status/:orderCode", authorize(), getPaymentStatus);
router.put("/cancel/:orderCode", authorize(), cancelPayment);

module.exports = router;
