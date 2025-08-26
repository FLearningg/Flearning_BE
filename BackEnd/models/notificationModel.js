const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
    readStatus: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "notifications" }
);

NotificationSchema.index({ userId: 1 });

module.exports = mongoose.model("Notification", NotificationSchema);
