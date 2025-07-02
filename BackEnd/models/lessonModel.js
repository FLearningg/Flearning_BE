const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const LessonSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true },
    title: { type: String, required: true },
    description: String,
    lessonNotes: String,
    videoUrl: String,
    captions: String,
    duration: Number, // Duration in seconds
    order: { type: Number, default: 0 }, // For ordering lessons within a section
  },
  { timestamps: true, collection: "lessons" }
);

LessonSchema.index({ sectionId: 1, order: 1 });
LessonSchema.index({ courseId: 1 });

module.exports = mongoose.model("Lesson", LessonSchema);
