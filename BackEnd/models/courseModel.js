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
    // The user who created / published the course (instructor or admin)
    createdBy: { type: Types.ObjectId, ref: "User" },
    rating: { type: Number, default: 0 },
    level: { type: String, enum: ["beginner", "intermediate", "advanced"] },
    duration: { type: String },
    language: { type: String, enum: ["vietnam", "english"] },
    subtitleLanguage: { type: String, enum: ["vietnam", "english"] },
    sections: [{ type: Schema.Types.ObjectId, ref: "Section" }],
    status: {
      type: String,
      enum: ["active", "inactive", "draft", "pending", "rejected"],
      default: "pending",
    },
    rejectionReason: { type: String },
    deactivationReason: { type: String },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    deactivatedAt: { type: Date },
    reactivatedAt: { type: Date },
    materials: [MaterialSchema],
  },
  { timestamps: true, collection: "courses" }
);

// Indexes for query optimization
CourseSchema.index({ createdBy: 1 }); // For instructor course queries
CourseSchema.index({ status: 1 }); // For filtering by status
CourseSchema.index({ categoryIds: 1 }); // For filtering by category
CourseSchema.index({ createdBy: 1, status: 1 }); // Compound index for instructor courses with status filter

module.exports = mongoose.model("Course", CourseSchema);
