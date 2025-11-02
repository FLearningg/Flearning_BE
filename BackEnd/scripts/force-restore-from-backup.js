const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Kết nối database
mongoose.connect('mongodb://localhost:27017/FLearning');

async function forceRestoreFromBackup() {
  try {
    console.log('🔍 Reading backup files...');
    
    const backupDir = path.join(__dirname, '..', 'backups', 'rejected-profiles');
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 3); // Lấy 3 files backup mới nhất
    
    console.log(`📦 Found ${files.length} backup files`);
    
    const db = mongoose.connection.db;
    const collection = db.collection('instructorprofiles');
    
    let restored = 0;
    
    for (const file of files) {
      const filePath = path.join(backupDir, file);
      const backupData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Backup có structure: { profile: {...}, timestamp, reason }
      const data = backupData.profile || backupData;
      
      // Restore với status = pending để có thể review lại
      const profileData = {
        ...data,
        _id: new mongoose.Types.ObjectId(data._id),
        userId: new mongoose.Types.ObjectId(data.userId._id || data.userId),
        applicationStatus: 'pending', // Reset về pending
        aiReviewStatus: undefined, // Clear AI review
        aiReviewDetails: undefined, // Clear AI review details
        documents: data.documents || [], // Preserve documents array
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(),
        submittedAt: data.submittedAt ? new Date(data.submittedAt) : undefined,
        approvedAt: undefined,
        rejectedAt: undefined,
        rejectionReason: undefined
      };
      
      await collection.insertOne(profileData);
      console.log(`✅ Restored: ${data._id} | Docs: ${profileData.documents?.length || 0}`);
      restored++;
    }
    
    console.log(`\n✅ Successfully restored ${restored} profiles`);
    
    // Verify
    const total = await collection.countDocuments({});
    console.log(`📊 Total profiles in database: ${total}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

mongoose.connection.once('open', () => {
  console.log('✅ Connected to MongoDB');
  forceRestoreFromBackup();
});
