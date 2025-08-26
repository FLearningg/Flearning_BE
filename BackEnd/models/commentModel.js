const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CommentSchema = new Schema(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson" },
    authorId: { type: Schema.Types.ObjectId, ref: "User" },
    content: String,
  },
  { timestamps: true, collection: "comments" }
);

module.exports = mongoose.model("Comment", CommentSchema);
