const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const DiscountSchema = new Schema(
  {
    discountCode: String,
    description: String,
    category: {
      type: String,
      enum: ["general", "seasonal", "welcome", "special"],
    },
    type: { type: String, enum: ["percent", "fixedAmount"] },
    value: Number,
    usage: { type: Number, default: 0 },
    usageLimit: Number,
    status: { type: String, enum: ["active", "expired", "inActive"] },
    minimumOrder: Number,
    maximumDiscount: Number,
    startDate: Date,
    endDate: Date,
  },
  { timestamps: true, collection: "discounts" }
);

module.exports = mongoose.model("Discount", DiscountSchema);
