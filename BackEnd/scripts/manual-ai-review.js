const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/flearning_database')
  .then(async () => {
    // Import models after connection
    const InstructorProfile = require('../models/InstructorProfileModel');
    const { reviewInstructorProfile } = require('../services/aiReviewService');
    
    console.log('🔍 Finding pending applications...\n');
    
    // Find all pending applications without AI review
    const pendingProfiles = await InstructorProfile.find({ 
      applicationStatus: 'pending',
      $or: [
        { aiReviewScore: { $exists: false } },
        { aiReviewScore: null }
      ]
    });
    
    console.log(`📋 Found ${pendingProfiles.length} pending applications\n`);
    
    if (pendingProfiles.length === 0) {
      console.log('✅ No pending applications to review');
      process.exit(0);
      return;
    }
    
    let successCount = 0;
    let failedCount = 0;
    
    for (const profile of pendingProfiles) {
      try {
        console.log(`\n🤖 Reviewing profile: ${profile._id}`);
        console.log(`   Documents: ${profile.documents?.length || 0}`);
        
        await reviewInstructorProfile(profile._id);
        
        successCount++;
        console.log(`   ✅ Review completed`);
        
        // Delay 500ms between reviews to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        failedCount++;
        console.error(`   ❌ Review failed:`, error.message);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`📦 Total: ${pendingProfiles.length}`);
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
