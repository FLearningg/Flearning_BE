const mongoose = require('mongoose');

const rejectedInstructorSchema = new mongoose.Schema({
  // Thông tin cơ bản từ user
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  email: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  
  // Thông tin application
  expertise: [{
    type: String,
    required: true
  }],
  experience: {
    type: String,
    required: true
  },
  documents: [{
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    mimeType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Thông tin về rejection
  rejectionReason: {
    type: String,
    required: true
  },
  rejectionType: {
    type: String,
    enum: ['ai_rejected', 'admin_rejected'],
    required: true
  },
  
  // AI Review Details (nếu bị AI reject)
  aiReviewScore: {
    type: Number,
    min: 0,
    max: 100
  },
  aiReviewDetails: {
    decision: {
      status: String,
      reason: String,
      confidence: Number
    },
    analysis: {
      personalInfo: { score: Number, found: Boolean },
      experience: { score: Number, found: Boolean },
      education: { score: Number, found: Boolean },
      skills: { score: Number, found: Boolean }
    }
  },
  
  // Timestamps
  appliedAt: {
    type: Date,
    default: Date.now
  },
  rejectedAt: {
    type: Date,
    default: Date.now
  },
  
  // Email notification status
  rejectionEmailSent: {
    type: Boolean,
    default: false
  },
  rejectionEmailSentAt: Date,
  
  // Reference to original instructor profile
  originalProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InstructorProfile'
  }
}, {
  timestamps: true
});

// Index for faster queries
rejectedInstructorSchema.index({ email: 1 });
rejectedInstructorSchema.index({ rejectedAt: -1 });
rejectedInstructorSchema.index({ rejectionType: 1 });

// Static method to create rejected instructor from instructor profile
rejectedInstructorSchema.statics.createFromInstructorProfile = async function(instructorProfile, rejectionType, rejectionReason) {
  const user = await mongoose.model('User').findById(instructorProfile.userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Xử lý documents - chuyển từ string sang object nếu cần
  let processedDocuments = [];
  if (instructorProfile.documents && instructorProfile.documents.length > 0) {
    // Kiểm tra nếu documents là array của strings (URLs cũ)
    if (typeof instructorProfile.documents[0] === 'string') {
      processedDocuments = instructorProfile.documents.map((url, index) => ({
        filename: `document_${index + 1}`,
        originalName: `document_${index + 1}`,
        path: url,
        size: 0,
        mimeType: 'unknown',
        uploadedAt: new Date()
      }));
    } else {
      // Nếu đã là array của objects, giữ nguyên
      processedDocuments = instructorProfile.documents;
    }
  }
  
  const rejectedInstructor = new this({
    userId: instructorProfile.userId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: instructorProfile.phone,
    expertise: instructorProfile.expertise,
    experience: instructorProfile.experience,
    documents: processedDocuments,
    rejectionReason,
    rejectionType,
    aiReviewScore: instructorProfile.aiReviewScore,
    aiReviewDetails: instructorProfile.aiReviewDetails,
    appliedAt: instructorProfile.appliedAt,
    rejectedAt: new Date(),
    originalProfileId: instructorProfile._id
  });
  
  return await rejectedInstructor.save();
};

module.exports = mongoose.model('RejectedInstructor', rejectedInstructorSchema);