const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    orderCode: {
      type: Number,
      required: true,
      unique: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      // required: true, // Có thể không required ngay lúc đầu nếu bạn tạo transaction trước
    },
    gatewayTransactionId: {
      type: String,
      unique: true, // Giữ lại unique
      sparse: true, // <<< THÊM DÒNG NÀY
    },
    type: {
      type: String,
      enum: ["sale", "refund", "chargeback"],
      default: "sale",
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      default: "VND",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded", "cancelled"],
      default: "pending",
    },
    description: {
      type: String,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, collection: "transactions" }
);

module.exports = mongoose.model("Transaction", transactionSchema);