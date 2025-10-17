const mongoose = require("mongoose");
const { Schema } = mongoose;

const InstructorApplicationSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    bio: { type: String, required: true },
    expertise: [{ type: String, required: true }], // Array of expertise areas
    experience: { type: String, required: true },
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountHolderName: { type: String, required: true },
    documents: [{ type: String }], // URLs to uploaded documents
    status: {
      type: String,
      enum: ["pending", "emailNotVerified", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNotes: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: "User" }, // If user is already registered
  },
  { timestamps: true }
);

module.exports = mongoose.model("InstructorApplication", InstructorApplicationSchema);
