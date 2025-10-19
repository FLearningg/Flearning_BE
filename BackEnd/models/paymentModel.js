// paymentModel.js
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    enrollmentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Enrollment",
        required: true,
      },
    ],
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
      default: "PayOS",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true, collection: "payments" }
);

module.exports = mongoose.model("Payment", paymentSchema);
