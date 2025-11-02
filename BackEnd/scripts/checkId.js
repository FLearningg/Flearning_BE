const mongoose = require('mongoose');
require('dotenv').config();

const InstructorProfile = require('../models/instructorProfileModel');

const checkId = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Đã kết nối đến MongoDB');
    
    const profile = await InstructorProfile.findById('690274e3f10ce735f2e4834c');
    if (profile) {
      console.log('❌ VẪN TỒN TẠI: Hồ sơ vẫn tồn tại');
      console.log('   ID:', profile._id);
      console.log('   Application Status:', profile.applicationStatus);
      console.log('   AI Review Status:', profile.aiReviewStatus);
      console.log('   Email:', profile.userId ? profile.userId.email : 'N/A');
    } else {
      console.log('✅ XÁC NHẬN: Hồ sơ không tồn tại');
    }
    
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

checkId();