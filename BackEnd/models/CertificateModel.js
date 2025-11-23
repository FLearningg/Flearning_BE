const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const CertificateSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true },
    courseId: { type: Types.ObjectId, ref: "Course", required: true },
    certificateUrl: { type: String },
  },
  { timestamps: true, collection: "certificates" }
);

module.exports = mongoose.models.Certificate || mongoose.model("Certificate", CertificateSchema);
