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
    moneyLeft: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0.0,
    },
    payoutDetails: {
      bankName: String,
      accountNumber: String,
      accountHolderName: String,
    },
    // Learning path personalization fields
    learningPreferences: {
      // Survey completion status
      surveyCompleted: {
        type: Boolean,
        default: false,
      },
      surveyCompletedAt: {
        type: Date,
      },
      // Step 1: Mục tiêu học tập của bạn muốn đạt được?
      learningGoal: {
        type: String,
        trim: true,
      },
      // Step 2: Mục tiêu học tập của bạn?
      learningObjectives: [
        {
          type: String,
          trim: true,
        },
      ],
      // Step 3: Kỹ năng bạn muốn học? (có thể chọn nhiều)
      interestedSkills: [
        {
          type: Schema.Types.ObjectId,
          ref: "Category",
        },
      ],
      // Step 4: Trình độ hiện tại của bạn?
      currentLevel: {
        type: String,
        enum: ["beginner", "intermediate", "advanced", "expert"],
      },
      // Step 5: Thời gian học tập? (giờ/tuần)
      weeklyStudyHours: {
        type: String,
        enum: ["1-3", "4-7", "8-15", "15+"],
      },
      // Step 6: Thời gian mong muốn hoàn thành?
      targetCompletionTime: {
        type: String,
        enum: ["1-month", "3-months", "6-months", "1-year+"],
      },
    },
    // Learning Path - AI-generated recommendations (stored in User)
    learningPath: {
      // Path metadata
      pathTitle: String,
      learningGoal: String,

      // Phases: Structured learning path divided into progressive steps
      phases: [
        {
          title: String, // AI-generated: e.g., "Nền Tảng Lập Trình Web"
          description: String, // e.g., "Tập trung vào HTML, CSS, JavaScript"
          phaseRationale: String, // AI-generated: WHY this phase is suitable
          order: Number, // Sequential order: 1, 2, 3...

          // Time estimates
          estimatedWeeks: Number, // Calculated based on survey data
          estimatedDays: Number, // estimatedWeeks × 7
          estimatedTime: String, // Human-readable: "4 tuần", "1 tháng"
          totalHours: Number, // Total learning hours for this phase

          // Courses in this phase
          courses: [
            {
              courseId: {
                type: Schema.Types.ObjectId,
                ref: "Course",
              },
              reason: String, // AI-generated reason
              order: Number, // Order within the phase
              matchScore: Number,
              estimatedHours: Number,
            },
          ],
        },
      ],

      // Legacy flat structure (kept for backward compatibility)
      recommendedCourses: [
        {
          courseId: {
            type: Schema.Types.ObjectId,
            ref: "Course",
          },
          reason: String, // AI-generated reason
          priority: Number,
          matchScore: Number,
          estimatedHours: Number,
        },
      ],

      pathSummary: {
        totalCourses: Number,
        totalEstimatedHours: Number,
        totalPhases: Number, // Number of phases in the path
        skillsCovered: [
          {
            type: Schema.Types.ObjectId,
            ref: "Category",
          },
        ],
        levelProgression: String,
      },
      lastGeneratedAt: Date,
      regenerationCount: {
        type: Number,
        default: 0,
      },
    },
  },
  { timestamps: true, collection: "users" }
);

module.exports = mongoose.model("User", UserSchema);
