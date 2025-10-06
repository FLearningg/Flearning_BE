const mongoose = require("mongoose");
const { Schema } = mongoose;

const MaterialSchema = new Schema(
  {
    title: { type: String },
    fileUrl: { type: String },
    description: { type: String },
  },
  { timestamps: true }
);
module.exports = {
  Material: mongoose.model("Material", MaterialSchema),
  MaterialSchema: MaterialSchema,
};
