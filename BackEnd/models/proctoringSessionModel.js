const mongoose = require('mongoose');

const proctoringSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
  resultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentQuizResult'
  },
  startTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'locked', 'terminated'],
    default: 'active'
  },
  violations: [{
    type: {
      type: String,
      enum: [
        'noFaceDetected',
        'multipleFaces',
        'gazeAway',
        'exitFullscreen',
        'tabSwitch',
        'windowSwitch',
        'suspiciousObject',
        'audioDetected',
        'screenCaptureDetected',
        'cameraAccessDenied',
        'identityVerified',
        'differentPerson'
      ],
      required: true
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    details: {
      type: mongoose.Schema.Types.Mixed
    }
  }],
  suspicionScore: {
    type: Number,
    default: 0,
    min: 0
  },
  finalSuspicionScore: {
    type: Number
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  lockReason: {
    type: String
  },
  lockTime: {
    type: Date
  },
  snapshots: [{
    timestamp: Date,
    imageUrl: String,
    violationType: String
  }],
  browserInfo: {
    userAgent: String,
    platform: String,
    language: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes for faster queries
proctoringSessionSchema.index({ userId: 1, quizId: 1 });
proctoringSessionSchema.index({ status: 1 });
proctoringSessionSchema.index({ suspicionScore: 1 });

// Method to add violation
proctoringSessionSchema.methods.addViolation = function(violationType, severity, details) {
  this.violations.push({
    type: violationType,
    timestamp: new Date(),
    severity,
    details
  });
};

// Virtual for session duration
proctoringSessionSchema.virtual('duration').get(function() {
  if (this.endTime) {
    return (this.endTime - this.startTime) / 1000 / 60; // minutes
  }
  return null;
});

// Virtual for violation count
proctoringSessionSchema.virtual('violationCount').get(function() {
  return this.violations.length;
});

module.exports = mongoose.model('ProctoringSession', proctoringSessionSchema);
