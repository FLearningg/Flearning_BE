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
router.get("/transactions", vietQrPayment);

// POST → tạo giao dịch
router.post("/transactions", addTransaction);

router.post("/create-link", authorize(), createPaymentLink);
router.post("/webhook", handlePayOsWebhook);
router.get("/status/:orderCode", authorize(), getPaymentStatus);
router.put("/cancel/:orderCode", authorize(), cancelPayment);

module.exports = router;
