const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WishlistSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    courseIds: [{ type: Schema.Types.ObjectId, ref: "Course" }],
  },
  { timestamps: true, collection: "wishlists" }
);

WishlistSchema.index({ userId: 1 });

module.exports = mongoose.model("Wishlist", WishlistSchema);
