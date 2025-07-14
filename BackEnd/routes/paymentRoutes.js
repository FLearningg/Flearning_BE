const express = require("express");
const router = express.Router();

// IMPORTANT: Cần destructuring đúng tên hàm export ra
const {
  addTransaction,
  vietQrPayment,
} = require("../controllers/paymentController");

// GET → lấy QR
router.get("/transactions", vietQrPayment);

// POST → tạo giao dịch
router.post("/transactions", addTransaction);

module.exports = router;
