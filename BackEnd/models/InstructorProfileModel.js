const mongoose = require("mongoose");

const instructorProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Application Info
    phone: {
      type: String,
      required: true,
    },
    expertise: [
      {
        type: String,
        required: true,
      },
    ],
    experience: {
      type: String,
      required: true,
    },
    documents: [
      {
        type: String,
      },
    ],

    // Application Status
    applicationStatus: {
      type: String,
      enum: ["emailNotVerified", "pending", "approved", "rejected"],
      default: "emailNotVerified",
    },
    rejectionReason: String,

    // Public Profile Info (after approval)
    bio: {
      type: String,
      maxlength: 1000,
    },
    headline: {
      type: String,
      maxlength: 200,
    },
    website: String,
    socialLinks: {
      linkedin: String,
      twitter: String,
      youtube: String,
      facebook: String,
    },

    // Statistics
    totalStudents: {
      type: Number,
      default: 0,
    },
    totalCourses: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    // Timestamps
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: Date,
    rejectedAt: Date,

    // AI Review Fields
    aiReviewStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "manual_review"],
    },
    aiReviewScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    aiReviewDetails: {
      decision: {
        status: String,
        reason: String,
        confidence: Number,
      },
      analysis: {
        personalInfo: {
          score: Number,
          found: Boolean,
        },
        experience: {
          score: Number,
          found: Boolean,
        },
        education: {
          score: Number,
          found: Boolean,
        },
        skills: {
          score: Number,
          found: Boolean,
        },
      },
    },
    aiReviewedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
// Note: userId already has unique index from schema definition above
// instructorProfileSchema.index({ userId: 1 }); // REMOVED - duplicate with unique: true
instructorProfileSchema.index({ applicationStatus: 1 });

module.exports = mongoose.model("InstructorProfile", instructorProfileSchema);
