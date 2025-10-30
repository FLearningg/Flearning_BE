const mongoose = require('mongoose');
require('dotenv').config();

const RejectedInstructor = require('../models/rejectedInstructorModel');

const listRejected = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Đã kết nối đến MongoDB');
    
    const profiles = await RejectedInstructor.find({});
    console.log(`📊 Tìm thấy ${profiles.length} hồ sơ trong RejectedInstructors:`);
    
    profiles.forEach((profile, index) => {
      console.log(`${index + 1}. ID: ${profile._id}`);
      console.log(`   Original Profile ID: ${profile.originalProfileId || 'N/A'}`);
      console.log(`   Email: ${profile.email}`);
      console.log(`   Rejection Reason: ${profile.rejectionReason}`);
      console.log('---');
    });
    
    await mongoose.connection.close();
    console.log('🔌 Đã đóng kết nối MongoDB');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

listRejected();