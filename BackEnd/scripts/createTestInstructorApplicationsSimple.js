const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");
const InstructorProfile = require("../models/instructorProfileModel");
require("dotenv").config();

// Simple script to create test data without complex logic
const createSimpleTestData = async () => {
  try {
    console.log("🚀 Starting to create simple test data...");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Create test user 1 - Will be AI approved
    const user1 = await User.findOneAndUpdate(
      { email: "john.approved@test.com" },
      {
        firstName: "John",
        lastName: "Approved",
        userName: "john_approved_instructor",
        email: "john.approved@test.com",
        password: await bcrypt.hash("password123", 12),
        role: "student",
        status: "verified",
      },
      { upsert: true, new: true }
    );
    console.log("✅ Created/updated test user 1:", user1.email);

    // Create test user 2 - Will be AI rejected
    const user2 = await User.findOneAndUpdate(
      { email: "jane.rejected@test.com" },
      {
        firstName: "Jane",
        lastName: "Rejected",
        userName: "jane_rejected_instructor",
        email: "jane.rejected@test.com",
        password: await bcrypt.hash("password123", 12),
        role: "student",
        status: "verified",
      },
      { upsert: true, new: true }
    );
    console.log("✅ Created/updated test user 2:", user2.email);

    // Create instructor profile for user 1 (AI approved)
    await InstructorProfile.findOneAndUpdate(
      { userId: user1._id },
      {
        userId: user1._id,
        phone: "+1234567890",
        expertise: ["JavaScript", "React", "Node.js"],
        experience: "5+ years of experience in web development",
        documents: ["https://example.com/doc1.pdf"],
        applicationStatus: "pending",
        aiReviewStatus: "approved",
        aiReviewScore: 85,
        aiReviewedAt: new Date()
      },
      { upsert: true, new: true }
    );
    console.log("✅ Created/updated instructor profile 1 (AI approved)");

    // Create instructor profile for user 2 (AI rejected)
    await InstructorProfile.findOneAndUpdate(
      { userId: user2._id },
      {
        userId: user2._id,
        phone: "+0987654321",
        expertise: ["Testing", "QA"],
        experience: "No professional experience",
        documents: ["https://example.com/doc2.pdf"],
        applicationStatus: "pending",
        aiReviewStatus: "rejected",
        aiReviewScore: 25,
        aiReviewedAt: new Date()
      },
      { upsert: true, new: true }
    );
    console.log("✅ Created/updated instructor profile 2 (AI rejected)");

    console.log("\n🎉 Test data created successfully!");
    console.log("\n📋 Summary:");
    console.log("1. John Approved (john.approved@test.com) - AI Status: approved, Score: 85");
    console.log("2. Jane Rejected (jane.rejected@test.com) - AI Status: rejected, Score: 25");
    console.log("\n🔑 Login credentials:");
    console.log("Email: john.approved@test.com | Password: password123");
    console.log("Email: jane.rejected@test.com | Password: password123");

  } catch (error) {
    console.error("❌ Error creating test data:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
};

// Run script
createSimpleTestData();