const mongoose = require("mongoose");
const User = require("../models/userModel");
const InstructorProfile = require("../models/instructorProfileModel");
const { instructorApplicationDeniedEmail } = require("../utils/emailTemplates");
const sendEmail = require("../utils/sendEmail");
require("dotenv").config();

// Script to send rejection emails for AI rejected applications
const sendRejectionEmails = async () => {
  try {
    console.log("🚀 Starting to send rejection emails for AI rejected applications...");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Find all AI rejected applications that haven't been notified yet
    const aiRejectedProfiles = await InstructorProfile.find({
      aiReviewStatus: "rejected",
      applicationStatus: "pending" // Still pending, not yet manually rejected
    }).populate("userId", "firstName lastName email");

    console.log(`📊 Found ${aiRejectedProfiles.length} AI rejected applications to process`);

    if (aiRejectedProfiles.length === 0) {
      console.log("ℹ️ No AI rejected applications found to send emails");
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Send rejection emails
    for (const profile of aiRejectedProfiles) {
      try {
        const user = profile.userId;
        if (!user || !user.email) {
          console.log(`⚠️ Skipping profile ${profile._id} - No user/email found`);
          continue;
        }

        // Create rejection reason from AI review details
        let rejectionReason = "Your application was reviewed by our AI system and found to not meet our requirements.";
        
        if (profile.aiReviewDetails && profile.aiReviewDetails.decision && profile.aiReviewDetails.decision.reason) {
          rejectionReason = `AI Review: ${profile.aiReviewDetails.decision.reason}`;
        }

        // Send rejection email
        const emailContent = instructorApplicationDeniedEmail(user.firstName, rejectionReason);
        const emailResult = await sendEmail(
          user.email,
          "Your Instructor Application Has Been Reviewed",
          emailContent
        );

        if (emailResult.success) {
          console.log(`✅ Email sent successfully to: ${user.email}`);
          successCount++;
        } else {
          console.log(`❌ Failed to send email to: ${user.email}`);
          console.log(`Error: ${emailResult.error}`);
          errorCount++;
        }

        // Update application status to "rejected" to mark as processed
        await InstructorProfile.findByIdAndUpdate(profile._id, {
          applicationStatus: "rejected",
          rejectedAt: new Date(),
          rejectionReason: rejectionReason
        });

        console.log(`📝 Updated application status to rejected for: ${user.email}`);

      } catch (error) {
        console.error(`❌ Error processing profile ${profile._id}:`, error.message);
        errorCount++;
      }
    }

    console.log("\n🎉 Email sending process completed!");
    console.log(`📊 Summary:`);
    console.log(`   - Total processed: ${aiRejectedProfiles.length}`);
    console.log(`   - Emails sent successfully: ${successCount}`);
    console.log(`   - Emails failed: ${errorCount}`);

  } catch (error) {
    console.error("❌ Error sending rejection emails:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
};

// Run script
sendRejectionEmails();