/**
 * Script để kiểm tra TẤT CẢ các hồ sơ instructor (pending, approved, rejected)
 * Usage: node scripts/checkAllProfiles.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const InstructorProfile = require('../models/instructorProfileModel');
const RejectedInstructor = require('../models/rejectedInstructorModel');

// MongoDB connection
const connectDB = async () => {
  try {
    // Use MONGO_URI from .env file (Atlas cloud database)
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/flearning';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    console.log('📍 Database:', mongoUri.includes('mongodb+srv') ? 'Atlas Cloud' : 'Local');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Main function
const checkAllProfiles = async () => {
  try {
    await connectDB();

    console.log('\n🔍 Checking ALL Instructor Profiles...\n');
    console.log('='.repeat(80));

    // Count by status
    const pendingCount = await InstructorProfile.countDocuments({ applicationStatus: 'pending' });
    const approvedCount = await InstructorProfile.countDocuments({ applicationStatus: 'approved' });
    const rejectedCount = await InstructorProfile.countDocuments({ applicationStatus: 'rejected' });
    const emailNotVerifiedCount = await InstructorProfile.countDocuments({ applicationStatus: 'emailNotVerified' });
    const rejectedInstructorCount = await RejectedInstructor.countDocuments();

    console.log('📊 SUMMARY:');
    console.log(`  - Pending: ${pendingCount}`);
    console.log(`  - Approved: ${approvedCount}`);
    console.log(`  - Rejected (in InstructorProfile): ${rejectedCount}`);
    console.log(`  - Email Not Verified: ${emailNotVerifiedCount}`);
    console.log(`  - Rejected (in RejectedInstructor): ${rejectedInstructorCount}`);
    console.log(`  - TOTAL: ${pendingCount + approvedCount + rejectedCount + emailNotVerifiedCount + rejectedInstructorCount}`);

    // Get ALL profiles
    const allProfiles = await InstructorProfile.find()
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(20);

    console.log(`\n\n📋 LATEST ${allProfiles.length} PROFILES:`);
    console.log('='.repeat(80));

    if (allProfiles.length > 0) {
      allProfiles.forEach((profile, index) => {
        console.log(`\n[${index + 1}] Profile ID: ${profile._id}`);
        console.log(`    Status: ${profile.applicationStatus} ${profile.applicationStatus === 'rejected' ? '❌' : profile.applicationStatus === 'approved' ? '✅' : profile.applicationStatus === 'pending' ? '⏳' : '📧'}`);
        console.log(`    User: ${profile.userId?.firstName} ${profile.userId?.lastName} (${profile.userId?.email})`);
        console.log(`    Phone: ${profile.phone}`);
        console.log(`    Expertise: ${profile.expertise?.join(', ') || 'N/A'}`);
        console.log(`    Experience Length: ${profile.experience?.length || 0} chars`);
        console.log(`    Documents: ${profile.documents?.length || 0} files`);
        console.log(`    Created At: ${profile.createdAt}`);
        console.log(`    Applied At: ${profile.appliedAt}`);
        
        if (profile.aiReviewScore !== undefined) {
          console.log(`    AI Review Score: ${profile.aiReviewScore}/100`);
          console.log(`    AI Review Status: ${profile.aiReviewStatus || 'N/A'}`);
        }
        
        if (profile.applicationStatus === 'rejected') {
          console.log(`    Rejected At: ${profile.rejectedAt}`);
          console.log(`    Rejection Reason: ${profile.rejectionReason || 'N/A'}`);
        }
        
        if (profile.applicationStatus === 'approved') {
          console.log(`    Approved At: ${profile.approvedAt}`);
        }
        
        if (profile.aiReviewDetails) {
          console.log(`    AI Details:`);
          if (profile.aiReviewDetails.cvAnalysis) {
            console.log(`      - CV Score: ${profile.aiReviewDetails.cvAnalysis.overallScore || 'N/A'}`);
            console.log(`      - Has No Documents: ${profile.aiReviewDetails.cvAnalysis.hasNoDocuments || false}`);
          }
          if (profile.aiReviewDetails.additionalAnalysis) {
            const aa = profile.aiReviewDetails.additionalAnalysis;
            console.log(`      - Email: ${aa.emailCompleteness || 0}/10`);
            console.log(`      - Phone: ${aa.phoneCompleteness || 0}/10`);
            console.log(`      - Expertise: ${aa.expertiseRelevance || 0}/10`);
            console.log(`      - Experience: ${aa.experienceQuality || 0}/10`);
            console.log(`      - Documents: ${aa.documentQuality || 0}/10`);
            console.log(`      - TOTAL Additional: ${(aa.emailCompleteness || 0) + (aa.phoneCompleteness || 0) + (aa.expertiseRelevance || 0) + (aa.experienceQuality || 0) + (aa.documentQuality || 0)}/50`);
          }
          if (profile.aiReviewDetails.decision) {
            console.log(`      - Decision: ${profile.aiReviewDetails.decision.status}`);
            console.log(`      - Reason: ${profile.aiReviewDetails.decision.reason}`);
          }
        }
      });
    } else {
      console.log('❌ No profiles found!');
    }

    // Check RejectedInstructor collection
    const rejectedInstructors = await RejectedInstructor.find()
      .sort({ rejectedAt: -1 })
      .limit(10);

    if (rejectedInstructors.length > 0) {
      console.log(`\n\n📋 REJECTED INSTRUCTORS (Moved to separate collection): ${rejectedInstructors.length}`);
      console.log('='.repeat(80));
      
      rejectedInstructors.forEach((profile, index) => {
        console.log(`\n[${index + 1}] Rejected ID: ${profile._id}`);
        console.log(`    Original Profile ID: ${profile.originalProfileId}`);
        console.log(`    User: ${profile.firstName} ${profile.lastName} (${profile.email})`);
        console.log(`    Phone: ${profile.phone}`);
        console.log(`    Expertise: ${profile.expertise?.join(', ') || 'N/A'}`);
        console.log(`    Rejection Type: ${profile.rejectionType}`);
        console.log(`    AI Score: ${profile.aiReviewScore || 'N/A'}/100`);
        console.log(`    Reason: ${profile.rejectionReason}`);
        console.log(`    Rejected At: ${profile.rejectedAt}`);
      });
    }

    console.log('\n\n🎯 CURRENT AI THRESHOLDS:');
    console.log('='.repeat(80));
    console.log('  ✅ Auto Approve: ≥ 50 points');
    console.log('  ❌ Auto Reject: ≤ 25 points');
    console.log('  👤 Manual Review: 26-49 points');
    console.log('\n📊 Score Calculation:');
    console.log('  - CV Analysis: 60% (max 60 points)');
    console.log('  - Additional Factors: 40% (max 40 points)');
    console.log('    • Email completeness: 10 points');
    console.log('    • Phone completeness: 10 points');
    console.log('    • Expertise relevance: 10 points');
    console.log('    • Experience quality: 10 points');
    console.log('    • Document quality: 10 points (2 per file, max 10)');

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
checkAllProfiles();
