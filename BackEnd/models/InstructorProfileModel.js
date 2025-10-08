const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const InstructorProfileSchema = new Schema(
  {
    instructorId: { type: Types.ObjectId, ref: "User", required: true },
    specialized: { type: Types.String },
    rating: { type: Types.Number, default: 0 },
    totalStudent: { type: Types.Number, default: 0 },
    totalCourse: { type: Types.Number, default: 0 },
    aboutMe: { type: Types.String },
    social: [{ type: Types.String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("InstructorProfile", InstructorProfileSchema);
