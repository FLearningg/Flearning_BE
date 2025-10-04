const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enrollment",
      required: true,
    },
    // courseId and userId intentionally omitted: use enrollmentId -> Enrollment contains userId and courseId
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    paymentDate: {
      type: Date,
      required: true,
    },
    paymentMethod: {
      type: String,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
  },
  { timestamps: true, collection: "payments" }
);

module.exports = mongoose.model("Payment", paymentSchema);
