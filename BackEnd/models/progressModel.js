const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ProgressSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User" },
    courseId: { type: Schema.Types.ObjectId, ref: "Course" },
    completedLessons: [{ type: Schema.Types.ObjectId, ref: "Lesson" }],
  },
  { timestamps: true, collection: "progress" }
);

ProgressSchema.index({ studentId: 1, courseId: 1 });

module.exports = mongoose.model("Progress", ProgressSchema);
