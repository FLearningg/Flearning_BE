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
    type: {
      type: String,
      enum: ['multiple-choice', 'true-false', 'essay'], // Thêm loại 'essay' cho câu hỏi tự luận
      default: 'multiple-choice'
    },
    score: Number,
    answers: [QuizAnswerSchema],
    // Thêm trường cho câu hỏi tự luận
    essayGuideline: { 
      type: String, 
      required: function() { return this.type === 'essay'; } 
    }, // Hướng dẫn/tiêu chí chấm điểm cho câu tự luận
    essayMaxLength: { 
      type: Number, 
      default: 1000 
    }, // Số ký tự tối đa cho câu trả lời tự luận
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
    questionPoolSize: { 
      type: Number, 
      default: null,
      validate: {
        validator: function(value) {
          // Nếu có giá trị, phải > 0
          if (value !== null && value !== undefined) {
            if (value <= 0) return false;
            // Chỉ validate với questions nếu questions tồn tại và có length
            if (this.questions && Array.isArray(this.questions) && this.questions.length > 0) {
              return value <= this.questions.length;
            }
            // Nếu chưa có questions, cho phép set questionPoolSize (sẽ validate sau)
            return true;
          }
          return true;
        },
        message: 'questionPoolSize must be greater than 0 and not exceed total questions'
      }
    },
    roleCreated: {
      type: String,
      enum: ["student", "instructor"],
      required: true,
    },
  },
  { timestamps: true, collection: "quizzes" }
);

module.exports = mongoose.model("Quiz", QuizSchema);
