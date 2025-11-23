/**
 * Script để kiểm tra các hồ sơ instructor bị từ chối và điểm AI review
 * Usage: node scripts/checkRejectedProfiles.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const InstructorProfile = require('../models/instructorProfileModel');
const RejectedInstructor = require('../models/rejectedInstructorModel');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/flearning', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Main function
const checkRejectedProfiles = async () => {
  try {
    await connectDB();

    console.log('\n🔍 Checking Rejected Instructor Profiles...\n');
    console.log('='.repeat(80));

    // 1. Check rejected profiles in InstructorProfile collection
    const rejectedInProfiles = await InstructorProfile.find({ 
      applicationStatus: 'rejected' 
    })
      .populate('userId', 'firstName lastName email')
      .sort({ rejectedAt: -1 })
      .limit(10);

    console.log(`\n📋 REJECTED IN InstructorProfile Collection: ${rejectedInProfiles.length} profiles`);
    console.log('='.repeat(80));

    if (rejectedInProfiles.length > 0) {
      rejectedInProfiles.forEach((profile, index) => {
        console.log(`\n[${index + 1}] Profile ID: ${profile._id}`);
        console.log(`    User: ${profile.userId?.firstName} ${profile.userId?.lastName} (${profile.userId?.email})`);
        console.log(`    Phone: ${profile.phone}`);
        console.log(`    Expertise: ${profile.expertise.join(', ')}`);
        console.log(`    Documents: ${profile.documents?.length || 0} files`);
        console.log(`    Applied At: ${profile.appliedAt}`);
        console.log(`    Rejected At: ${profile.rejectedAt}`);
        console.log(`    AI Review Score: ${profile.aiReviewScore || 'N/A'}/100`);
        console.log(`    AI Review Status: ${profile.aiReviewStatus || 'N/A'}`);
        console.log(`    Rejection Reason: ${profile.rejectionReason || 'N/A'}`);
        
        if (profile.aiReviewDetails) {
          console.log(`    AI Review Details:`);
          console.log(`      - CV Score: ${profile.aiReviewDetails.cvAnalysis?.overallScore || 'N/A'}`);
          console.log(`      - Decision: ${profile.aiReviewDetails.decision?.status || 'N/A'}`);
          if (profile.aiReviewDetails.additionalAnalysis) {
            const aa = profile.aiReviewDetails.additionalAnalysis;
            console.log(`      - Email: ${aa.emailCompleteness || 0}/10`);
            console.log(`      - Phone: ${aa.phoneCompleteness || 0}/10`);
            console.log(`      - Expertise: ${aa.expertiseRelevance || 0}/10`);
            console.log(`      - Experience: ${aa.experienceQuality || 0}/10`);
            console.log(`      - Documents: ${aa.documentQuality || 0}/10`);
          }
        }
      });
    }

    // 2. Check profiles in RejectedInstructor collection
    const rejectedInstructors = await RejectedInstructor.find()
      .populate('userId', 'firstName lastName email')
      .sort({ rejectedAt: -1 })
      .limit(10);

    console.log(`\n\n📋 REJECTED IN RejectedInstructor Collection: ${rejectedInstructors.length} profiles`);
    console.log('='.repeat(80));

    if (rejectedInstructors.length > 0) {
      rejectedInstructors.forEach((profile, index) => {
        console.log(`\n[${index + 1}] Rejected Profile ID: ${profile._id}`);
        console.log(`    Original Profile ID: ${profile.originalProfileId}`);
        console.log(`    User: ${profile.firstName} ${profile.lastName} (${profile.email})`);
        console.log(`    Phone: ${profile.phone}`);
        console.log(`    Expertise: ${profile.expertise.join(', ')}`);
        console.log(`    Documents: ${profile.documents?.length || 0} files`);
        console.log(`    Applied At: ${profile.appliedAt}`);
        console.log(`    Rejected At: ${profile.rejectedAt}`);
        console.log(`    Rejection Type: ${profile.rejectionType}`);
        console.log(`    AI Review Score: ${profile.aiReviewScore || 'N/A'}/100`);
        console.log(`    Rejection Reason: ${profile.rejectionReason}`);
        
        if (profile.aiReviewDetails) {
          console.log(`    AI Review Details:`);
          console.log(`      - Decision: ${profile.aiReviewDetails.decision?.status || 'N/A'}`);
          console.log(`      - Confidence: ${profile.aiReviewDetails.decision?.confidence || 'N/A'}`);
          if (profile.aiReviewDetails.analysis) {
            const analysis = profile.aiReviewDetails.analysis;
            console.log(`      - Personal Info: ${analysis.personalInfo?.score || 'N/A'} (Found: ${analysis.personalInfo?.found || false})`);
            console.log(`      - Experience: ${analysis.experience?.score || 'N/A'} (Found: ${analysis.experience?.found || false})`);
            console.log(`      - Education: ${analysis.education?.score || 'N/A'} (Found: ${analysis.education?.found || false})`);
            console.log(`      - Skills: ${analysis.skills?.score || 'N/A'} (Found: ${analysis.skills?.found || false})`);
          }
        }
      });
    }

    // 3. Statistics
    console.log('\n\n📊 STATISTICS');
    console.log('='.repeat(80));

    const totalRejected = rejectedInProfiles.length + rejectedInstructors.length;
    const avgScore = [...rejectedInProfiles, ...rejectedInstructors]
      .filter(p => p.aiReviewScore)
      .reduce((sum, p) => sum + p.aiReviewScore, 0) / totalRejected || 0;

    console.log(`Total Rejected Profiles: ${totalRejected}`);
    console.log(`Average AI Score: ${avgScore.toFixed(2)}/100`);
    console.log(`Current Thresholds:`);
    console.log(`  - Auto Approve: ≥ 50 points`);
    console.log(`  - Auto Reject: ≤ 25 points`);
    console.log(`  - Manual Review: 26-49 points`);

    console.log('\n='.repeat(80));
    console.log('✅ Check completed!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run the script
checkRejectedProfiles();
