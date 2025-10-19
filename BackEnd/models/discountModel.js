const mongoose = require("mongoose");
const { Schema } = mongoose;

const DiscountSchema = new Schema(
  {
    discountCode: { type: String },
    description: { type: String },
    type: { type: String, enum: ["percent", "fixedAmount"] },
    value: { type: Number },
    usage: { type: Number, default: 0 },
    usageLimit: { type: Number },
    status: { type: String, enum: ["active", "expired", "inActive"] },
    minimumOrder: { type: Number },
    maximumDiscount: { type: Number },
    startDate: { type: Date },
    endDate: { type: Date },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    applyCourses: [{ type: Schema.Types.ObjectId, ref: "Course" }], // Array of courses this discount applies to
  },
  { timestamps: true, collection: "discounts" }
);

module.exports = mongoose.model("Discount", DiscountSchema);