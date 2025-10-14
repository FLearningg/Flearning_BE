const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const QuizAnswerSchema = new Schema(
  {
    content: String,
    isCorrect: Boolean,
  },
  { _id: false }
);

const QuizQuestionSchema = new Schema(
  {
    content: String,
    type: String,
    score: Number,
    answers: [QuizAnswerSchema],
  },
  { _id: false }
);

const QuizSchema = new Schema(
  {
    courseId: { type: Types.ObjectId, ref: "Course", required: false },
    lessonId: { type: Types.ObjectId, ref: "Lesson" },
    userId: { type: Types.ObjectId, ref: "User" },
    title: { type: String, required: true },
    description: { type: String },
    questions: [QuizQuestionSchema],
    roleCreated: {
      type: String,
      enum: ["student", "instructor"],
      required: true,
    },
  },
  { timestamps: true, collection: "quizzes" }
);

module.exports = mongoose.model("Quiz", QuizSchema);
