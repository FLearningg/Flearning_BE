const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SectionSchema = new Schema(
  {
    name: { type: String, required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    lessons: [{ type: Schema.Types.ObjectId, ref: "Lesson" }],
    order: { type: Number, default: 0 }, // For ordering sections within a course
  },
  { timestamps: true, collection: "course_sections" }
);

SectionSchema.index({ courseId: 1, order: 1 });

module.exports = mongoose.model("Section", SectionSchema);
