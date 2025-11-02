const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const StudentQuizResultSchema = new Schema({
  userId: { type: Types.ObjectId, ref: "User", required: true },
  quizId: { type: Types.ObjectId, ref: "Quiz", required: true },
  score: { type: Number },
  takenAt: { type: Date, default: Date.now },
  details: Schema.Types.Mixed,
  // Thêm trường cho câu hỏi tự luận
  essayAnswers: [{
    questionIndex: Number,
    questionContent: String,
    studentAnswer: String,
    aiScore: Number, // Điểm AI chấm (0-100)
    aiFeedback: String, // Nhận xét của AI
    maxScore: Number, // Điểm tối đa của câu hỏi
    gradedAt: Date,
    gradingModel: String // Model AI đã sử dụng để chấm
  }],
  // Trạng thái chấm điểm
  gradingStatus: {
    type: String,
    enum: ['pending', 'grading', 'completed', 'failed'],
    default: 'pending'
  },
  // Điểm tổng (bao gồm cả tự luận)
  totalScore: { type: Number },
  maxTotalScore: { type: Number }
});

module.exports = mongoose.model("StudentQuizResult", StudentQuizResultSchema);
