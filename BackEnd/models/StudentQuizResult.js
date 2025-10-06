const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const StudentQuizResultSchema = new Schema({
  userId: { type: Types.ObjectId, ref: "User", required: true },
  quizId: { type: Types.ObjectId, ref: "Quiz", required: true },
  score: { type: Number },
  takenAt: { type: Date, default: Date.now },
  details: Schema.Types.Mixed,
});

module.exports = mongoose.model("StudentQuizResult", StudentQuizResultSchema);
