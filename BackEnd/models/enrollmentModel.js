const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "enrolled", "completed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true, collection: "enrollments" }
);

module.exports = mongoose.model("Enrollment", enrollmentSchema);
