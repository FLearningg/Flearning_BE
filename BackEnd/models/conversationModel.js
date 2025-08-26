const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ConversationSchema = new Schema(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    last_message: { type: String },
    status: {
      type: String,
      enum: ["sending", "delivered", "read"],
      default: "sending",
    },
  },
  { timestamps: true, collection: "conversations" }
);

ConversationSchema.index({ participants: 1 });

module.exports = mongoose.model("Conversation", ConversationSchema);
