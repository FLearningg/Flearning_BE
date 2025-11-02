/**
 * Script để khôi phục các rejected profiles từ backup files
 * Sử dụng khi dữ liệu bị mất hoặc cần rollback
 */

const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/flearning_database');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Restore profiles from backup directory
const restoreProfiles = async () => {
  try {
    const RejectedInstructor = require('../models/rejectedInstructorModel');
    const backupDir = path.join(__dirname, '../backups/rejected-profiles');
    
    // Check if backup directory exists
    try {
      await fs.access(backupDir);
    } catch (error) {
      console.log('⚠️ No backup directory found:', backupDir);
      return;
    }
    
    // Read all backup files
    const files = await fs.readdir(backupDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
      console.log('⚠️ No backup files found');
      return;
    }
    
    console.log(`📦 Found ${jsonFiles.length} backup files`);
    
    let restored = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const file of jsonFiles) {
      try {
        const filepath = path.join(backupDir, file);
        const content = await fs.readFile(filepath, 'utf8');
        const backupData = JSON.parse(content);
        
        // Check if profile already exists in RejectedInstructor
        const existing = await RejectedInstructor.findOne({ 
          originalProfileId: backupData.profile._id 
        });
        
        if (existing) {
          console.log(`⏭️ Skipping ${file} - already exists`);
          skipped++;
          continue;
        }
        
        // Restore profile
        const profile = backupData.profile;
        const rejectedDoc = new RejectedInstructor({
          userId: profile.userId,
          email: profile.userId?.email || 'unknown@email.com',
          firstName: profile.userId?.firstName || 'Unknown',
          lastName: profile.userId?.lastName || 'User',
          phone: profile.phone,
          expertise: profile.expertise,
          experience: profile.experience,
          documents: profile.documents,
          rejectionReason: profile.rejectionReason || 'Restored from backup',
          rejectionType: 'ai_rejected',
          aiReviewScore: profile.aiReviewScore,
          aiReviewDetails: profile.aiReviewDetails,
          appliedAt: profile.appliedAt,
          rejectedAt: profile.rejectedAt || new Date(),
          originalProfileId: profile._id
        });
        
        await rejectedDoc.save();
        console.log(`✅ Restored: ${file}`);
        restored++;
        
      } catch (error) {
        console.error(`❌ Error restoring ${file}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n=== RESTORE SUMMARY ===');
    console.log(`✅ Restored: ${restored}`);
    console.log(`⏭️ Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📦 Total: ${jsonFiles.length}`);
    
  } catch (error) {
    console.error('❌ Error in restore process:', error);
    throw error;
  }
};

// Main function
const main = async () => {
  await connectDB();
  await restoreProfiles();
  await mongoose.disconnect();
  console.log('\n✅ Restore process completed');
  process.exit(0);
};

// Run script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
