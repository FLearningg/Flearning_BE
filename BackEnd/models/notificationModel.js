const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const NotificationSchema = new Schema(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Đánh index để query cho nhanh
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "like",
        "comment",
        "system",
        "course_enrollment",
        "follow",
        "payment",
        "chat_message",
      ],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    link: {
      type: String, // Link điều hướng khi bấm vào (vd: /course/123)
      default: "",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", NotificationSchema);
