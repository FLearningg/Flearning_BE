const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const LessonSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true },
    title: { type: String, required: true },
    description: { type: String },
    lessonNotes: { type: String },
    type: {
      type: String,
      // Keep 'quiz' here for clarity. For quiz lessons we store references
      // to one or more Quiz documents in `quizIds` (see field below).
      enum: ["video", "article", "quiz"],
      required: true,
    },
    materialUrl: { type: String }, // URL to video or article
    duration: { type: Number }, // Duration in seconds
    order: { type: Number, default: 0 }, // For ordering lessons within a section
    // If a lesson represents a quiz, reference the Quiz documents here.
    // Use an array to allow lessons that contain multiple quiz parts.
    // For non-quiz lessons this should be empty.
    quizIds: [{ type: Schema.Types.ObjectId, ref: "Quiz", default: [] }],
  },
  { timestamps: true, collection: "lessons" }
);

LessonSchema.index({ sectionId: 1, order: 1 });
LessonSchema.index({ courseId: 1 });

// Schema-level validation to make intent explicit:
// - type === 'quiz' => quizIds must be a non-empty array
// - type !== 'quiz' => quizIds must be empty (prevents accidental attachments)
LessonSchema.pre("validate", function (next) {
  // `this` is the document being validated
  if (this.type === "quiz") {
    if (!this.quizIds || this.quizIds.length === 0) {
      return next(
        new Error('Lesson of type "quiz" must reference one or more quizIds.')
      );
    }
  } else {
    if (this.quizIds && this.quizIds.length > 0) {
      return next(
        new Error('Only lessons with type "quiz" may contain quizIds.')
      );
    }
  }

  return next();
});

// Virtual field for backward compatibility with frontend expecting videoUrl
LessonSchema.virtual("videoUrl").get(function () {
  return this.materialUrl;
});

// Ensure virtual fields are included when converting to JSON
LessonSchema.set("toJSON", { virtuals: true });
LessonSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Lesson", LessonSchema);