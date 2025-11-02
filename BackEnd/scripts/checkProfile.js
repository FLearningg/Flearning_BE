const mongoose = require('mongoose');
require('dotenv').config();

const InstructorProfile = require('../models/instructorProfileModel');

const checkProfile = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Đã kết nối đến MongoDB');
    
    const profile = await InstructorProfile.findById('690274e3f10ce735f2e4834c');
    if (profile) {
      console.log('❌ Hồ sơ vẫn tồn tại trong InstructorProfiles:');
      console.log('   ID:', profile._id);
      console.log('   Application Status:', profile.applicationStatus);
      console.log('   AI Review Status:', profile.aiReviewStatus);
    } else {
      console.log('✅ Hồ sơ không còn tồn tại trong InstructorProfiles');
    }
    
    // Kiểm tra tổng số hồ sơ rejected
    const rejectedCount = await InstructorProfile.countDocuments({
      $or: [
        { applicationStatus: 'rejected' },
        { aiReviewStatus: 'rejected' }
      ]
    });
    
    console.log(`📊 Tổng số hồ sơ rejected còn lại: ${rejectedCount}`);
    
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

checkProfile();