const mongoose = require('mongoose');
require('dotenv').config();

const RejectedInstructor = require('../models/rejectedInstructorModel');

const checkRejected = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Đã kết nối đến MongoDB');
    
    const profile = await RejectedInstructor.findOne({ originalProfileId: '690274e3f10ce735f2e4834c' });
    if (profile) {
      console.log('✅ Hồ sơ tồn tại trong RejectedInstructors:');
      console.log('   ID:', profile._id);
      console.log('   Original Profile ID:', profile.originalProfileId);
      console.log('   Email:', profile.email);
      console.log('   Rejection Reason:', profile.rejectionReason);
    } else {
      console.log('❌ Hồ sơ không tồn tại trong RejectedInstructors');
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

checkRejected();