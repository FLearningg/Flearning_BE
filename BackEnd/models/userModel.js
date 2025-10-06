const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const UserSchema = new Schema(
  {
    firstName: { type: String },
    lastName: { type: String },
    // userName: { type: String, unique: true }, move sang instructor profile
    email: { type: String, unique: true },
    password: { type: String }, // hashed
    role: {
      type: String,
      enum: ["admin", "instructor", "student"],
      default: "student",
    },
    userImage: { type: String },
    status: {
      type: String,
      enum: ["unverified", "verified", "banned"],
      default: "unverified",
    },
    // biography: String, move sang instructor profile
  },
  { timestamps: true, collection: "users" }
);

module.exports = mongoose.model("User", UserSchema);
