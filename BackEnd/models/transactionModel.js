const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    gatewayTransactionId: {
      type: String,
      unique: true,
    },
    type: {
      type: String,
      enum: ["sale", "refund", "chargeback"],
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      default: "USD",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
    },
    description: {
      type: String,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    courseId: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        required: true,
      }
    ],
  },
  { timestamps: true, collection: "transactions" }
);

module.exports = mongoose.model("Transaction", transactionSchema);
