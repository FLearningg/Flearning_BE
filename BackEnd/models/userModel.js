const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema(
  {
    firstName: String,
    lastName: String,
    userName: { type: String, unique: true },
    biography: String,
    email: { type: String, unique: true },
    password: String,
    role: {
      type: String,
      enum: ["admin", "student", "instructor"],
      default: "student",
    },
    status: {
      type: String,
      enum: ["unverified", "verified", "banned"],
      default: "unverified",
    },
    enrolledCourses: [{ type: Schema.Types.ObjectId, ref: "Course" }],
    userImage: String,
    mobileResetCodeHash: {
      type: String,
      select: false,
    },
    mobileResetCodeExpires: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true, collection: "users" }
);

module.exports = mongoose.model("User", UserSchema);
