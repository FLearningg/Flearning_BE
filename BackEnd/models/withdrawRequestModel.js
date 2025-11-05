const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Model này theo dõi mọi yêu cầu rút tiền từ instructor.
 */
const WithdrawalRequestSchema = new Schema(
  {
    // Giảng viên yêu cầu rút tiền
    instructorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Số tiền (Decimal128) yêu cầu rút
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    // Trạng thái của yêu cầu
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    // Thông tin thanh toán của giảng viên tại thời điểm yêu cầu
    // (Snapshot lại để phòng trường hợp instructor đổi thông tin sau này)
    payoutDetails: {
      bankName: String,
      accountNumber: String,
      accountHolderName: String,
    },
    // Ghi chú của Admin (ví dụ: lý do từ chối)
    adminNotes: {
      type: String,
      trim: true,
    },
    // Admin nào đã xử lý yêu cầu này
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true, // Tự động thêm createdAt và updatedAt
    collection: "withdrawal_requests",
  }
);

module.exports = mongoose.model("WithdrawalRequest", WithdrawalRequestSchema);
