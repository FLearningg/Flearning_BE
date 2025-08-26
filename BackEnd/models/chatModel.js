const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ChatSchema = new Schema(
  {
    sender_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiver_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    conversation_id: { type: Schema.Types.ObjectId, ref: "Conversation" },
  },
  { timestamps: true, collection: "chat" }
);

ChatSchema.index({ conversation_id: 1 });
ChatSchema.index({ sender_id: 1, receiver_id: 1 });

module.exports = mongoose.model("Chat", ChatSchema);
