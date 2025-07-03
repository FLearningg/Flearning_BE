const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      unique: true,
    },
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
  },
  { timestamps: true, collection: "transactions" }
);

module.exports = mongoose.model("Transaction", transactionSchema);
