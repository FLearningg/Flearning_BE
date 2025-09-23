const mongoose = require("mongoose");
const { Schema, Types } = mongoose;
const { MaterialSchema } = require("./MaterialModel.js");
const CourseSchema = new Schema(
  {
    title: { type: String },
    subTitle: { type: String },
    message: {
      welcome: String,
      congrats: String,
    },
    detail: {
      description: String,
      willLearn: [String],
      targetAudience: [String],
      requirement: [String],
    },
    thumbnail: { type: String },
    trailer: { type: String },
    categoryIds: [{ type: Types.ObjectId, ref: "Category" }],
    price: { type: Number },
    discountId: { type: Types.ObjectId, ref: "Discount" },
    rating: { type: Number },
    level: { type: String, enum: ["beginner", "intermediate", "advanced"] },
    duration: { type: String },
    language: { type: String, enum: ["vietnam", "english"] },
    subtitleLanguage: { type: String, enum: ["vietnam", "english"] },
    sections: [{ type: Schema.Types.ObjectId, ref: "Section" }],
    status: {
      type: String,
      enum: ["active", "inactive", "draft"],
      default: "draft",
    },
    materials: [MaterialSchema],
  },
  { timestamps: true, collection: "courses" }
);

module.exports = mongoose.model("Course", CourseSchema);
