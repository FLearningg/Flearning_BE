const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");
const InstructorProfile = require("../models/instructorProfileModel");
require("dotenv").config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/flearning");

const createTestInstructors = async () => {
  try {
    console.log("🚀 Starting to create test instructor applications...");

    // Create test user 1 - Will be AI approved
    const testUser1Data = {
      firstName: "John",
      lastName: "Approved",
      userName: "john_approved_instructor",
      email: "john.approved@test.com",
      password: await bcrypt.hash("password123", 12),
      role: "student", // Initially student, will become instructor after approval
      status: "verified", // Verified email
    };

    // Create test user 2 - Will be AI rejected
    const testUser2Data = {
      firstName: "Jane",
      lastName: "Rejected",
      userName: "jane_rejected_instructor",
      email: "jane.rejected@test.com",
      password: await bcrypt.hash("password123", 12),
      role: "student", // Initially student, will become instructor after approval
      status: "verified", // Verified email
    };

    // Check if users already exist
    const existingUser1 = await User.findOne({ email: testUser1Data.email });
    const existingUser2 = await User.findOne({ email: testUser2Data.email });

    let user1, user2;

    if (!existingUser1) {
      user1 = await User.create(testUser1Data);
      console.log("✅ Created test user 1 (will be AI approved):", user1.email);
    } else {
      user1 = existingUser1;
      console.log("ℹ️ Test user 1 already exists:", user1.email);
    }

    if (!existingUser2) {
      user2 = await User.create(testUser2Data);
      console.log("✅ Created test user 2 (will be AI rejected):", user2.email);
    } else {
      user2 = existingUser2;
      console.log("ℹ️ Test user 2 already exists:", user2.email);
    }

    // Create instructor profile for user 1 (AI approved)
    const instructorProfile1Data = {
      userId: user1._id,
      phone: "+1234567890",
      expertise: ["JavaScript", "React", "Node.js", "Web Development"],
      experience: "5+ years of experience in full-stack web development. Worked with Fortune 500 companies and startups alike. Specialized in React and Node.js ecosystems.",
      documents: [
        "https://firebasestorage.googleapis.com/v0/b/flearning-app.appspot.com/o/documents%2Fresume1.pdf?alt=media",
        "https://firebasestorage.googleapis.com/v0/b/flearning-app.appspot.com/o/documents%2Fcertificate1.pdf?alt=media"
      ],
      applicationStatus: "pending", // Initially pending
      aiReviewStatus: "approved", // AI approved
      aiReviewScore: 85,
      aiReviewDetails: {
        decision: {
          status: "approved",
          reason: "Strong technical background with relevant experience in web development",
          confidence: 0.9
        },
        analysis: {
          personalInfo: { score: 90, found: true },
          experience: { score: 85, found: true },
          education: { score: 80, found: true },
          skills: { score: 90, found: true }
        }
      },
      aiReviewedAt: new Date()
    };

    // Create instructor profile for user 2 (AI rejected)
    const instructorProfile2Data = {
      userId: user2._id,
      phone: "+0987654321",
      expertise: ["Testing", "Quality Assurance"],
      experience: "Just started learning programming. No professional experience yet.",
      documents: [
        "https://firebasestorage.googleapis.com/v0/b/flearning-app.appspot.com/o/documents%2Fresume2.pdf?alt=media"
      ],
      applicationStatus: "pending", // Initially pending
      aiReviewStatus: "rejected", // AI rejected
      aiReviewScore: 25,
      aiReviewDetails: {
        decision: {
          status: "rejected",
          reason: "Insufficient experience and qualifications for instructor position",
          confidence: 0.85
        },
        analysis: {
          personalInfo: { score: 70, found: true },
          experience: { score: 15, found: true },
          education: { score: 30, found: true },
          skills: { score: 20, found: true }
        }
      },
      aiReviewedAt: new Date()
    };

    // Check if instructor profiles already exist
    const existingProfile1 = await InstructorProfile.findOne({ userId: user1._id });
    const existingProfile2 = await InstructorProfile.findOne({ userId: user2._id });

    if (!existingProfile1) {
      await InstructorProfile.create(instructorProfile1Data);
      console.log("✅ Created instructor profile 1 (AI approved):", user1.email);
    } else {
      console.log("ℹ️ Instructor profile 1 already exists:", user1.email);
    }

    if (!existingProfile2) {
      await InstructorProfile.create(instructorProfile2Data);
      console.log("✅ Created instructor profile 2 (AI rejected):", user2.email);
    } else {
      console.log("ℹ️ Instructor profile 2 already exists:", user2.email);
    }

    console.log("\n🎉 Test instructor applications created successfully!");
    console.log("\n📋 Summary:");
    console.log("1. John Approved (john.approved@test.com) - AI Status: approved, Score: 85");
    console.log("2. Jane Rejected (jane.rejected@test.com) - AI Status: rejected, Score: 25");
    console.log("\n🔑 Login credentials:");
    console.log("Email: john.approved@test.com | Password: password123");
    console.log("Email: jane.rejected@test.com | Password: password123");

  } catch (error) {
    console.error("❌ Error creating test instructor applications:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
};

// Run the script
createTestInstructors();