/**
 * Script để xóa các hồ sơ instructor bị rejected
 * Usage: node scripts/deleteRejectedProfiles.js [profileId1] [profileId2] ...
 * Or: node scripts/deleteRejectedProfiles.js --all-rejected
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
const deleteRejectedProfiles = async () => {
  try {
    await connectDB();

    const args = process.argv.slice(2);

    console.log('\n🗑️  Deleting Rejected Instructor Profiles...\n');
    console.log('='.repeat(80));

    if (args.includes('--all-rejected')) {
      // Xóa tất cả hồ sơ rejected
      console.log('⚠️  Deleting ALL rejected profiles...\n');

      // Xóa từ InstructorProfile collection
      const result1 = await InstructorProfile.deleteMany({ 
        applicationStatus: 'rejected' 
      });
      console.log(`✅ Deleted ${result1.deletedCount} rejected profiles from InstructorProfile collection`);

      // Xóa từ RejectedInstructor collection
      const result2 = await RejectedInstructor.deleteMany({});
      console.log(`✅ Deleted ${result2.deletedCount} profiles from RejectedInstructor collection`);

      console.log(`\n📊 Total deleted: ${result1.deletedCount + result2.deletedCount} profiles`);
    } else if (args.length > 0) {
      // Xóa các profile cụ thể theo ID
      let totalDeleted = 0;

      for (const profileId of args) {
        console.log(`\nProcessing profile ID: ${profileId}`);

        // Thử xóa từ InstructorProfile collection
        const result1 = await InstructorProfile.findByIdAndDelete(profileId);
        if (result1) {
          console.log(`  ✅ Deleted from InstructorProfile collection`);
          totalDeleted++;
        } else {
          console.log(`  ⚠️  Not found in InstructorProfile collection`);
        }

        // Thử xóa từ RejectedInstructor collection (dùng originalProfileId hoặc _id)
        const result2 = await RejectedInstructor.findOneAndDelete({
          $or: [
            { _id: profileId },
            { originalProfileId: profileId }
          ]
        });
        if (result2) {
          console.log(`  ✅ Deleted from RejectedInstructor collection`);
          totalDeleted++;
        } else {
          console.log(`  ⚠️  Not found in RejectedInstructor collection`);
        }
      }

      console.log(`\n📊 Total deleted: ${totalDeleted} profiles`);
    } else {
      // Không có tham số, xóa tất cả rejected
      console.log('⚠️  No profile IDs provided. Deleting ALL rejected profiles...\n');

      // Xóa từ InstructorProfile collection
      const result1 = await InstructorProfile.deleteMany({ 
        applicationStatus: 'rejected' 
      });
      console.log(`✅ Deleted ${result1.deletedCount} rejected profiles from InstructorProfile collection`);

      // Xóa từ RejectedInstructor collection  
      const result2 = await RejectedInstructor.deleteMany({});
      console.log(`✅ Deleted ${result2.deletedCount} profiles from RejectedInstructor collection`);

      console.log(`\n📊 Total deleted: ${result1.deletedCount + result2.deletedCount} profiles`);
    }

    console.log('\n='.repeat(80));
    console.log('✅ Deletion completed!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run the script
deleteRejectedProfiles();
