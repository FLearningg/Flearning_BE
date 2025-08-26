const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CartSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    courseIds: [{ type: Schema.Types.ObjectId, ref: "Course" }],
  },
  { timestamps: true, collection: "carts" }
);

CartSchema.index({ userId: 1 });

module.exports = mongoose.model("Cart", CartSchema);
