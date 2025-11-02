const mongoose = require('mongoose');
require('dotenv').config();

const RejectedInstructor = require('../models/rejectedInstructorModel');
const InstructorProfile = require('../models/instructorProfileModel');

const updateRejectedProfiles = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Đã kết nối đến MongoDB');
    
    // Lấy tất cả rejected instructors không có originalProfileId
    const rejectedProfiles = await RejectedInstructor.find({ 
      originalProfileId: { $exists: false } 
    });
    
    console.log(`📊 Tìm thấy ${rejectedProfiles.length} hồ sơ cần cập nhật`);
    
    for (const rejected of rejectedProfiles) {
      console.log(`👤 Đang cập nhật hồ sơ: ${rejected._id}`);
      console.log(`   Email: ${rejected.email}`);
      
      try {
        // Tìm hồ sơ gốc trong InstructorProfile bằng email
        const originalProfile = await InstructorProfile.findOne({
          'userId.email': rejected.email
        });
        
        if (originalProfile) {
          // Cập nhật originalProfileId
          await RejectedInstructor.findByIdAndUpdate(
            rejected._id,
            { originalProfileId: originalProfile._id }
          );
          console.log(`✅ Đã cập nhật originalProfileId: ${originalProfile._id}`);
        } else {
          console.log(`⚠️ Không tìm thấy hồ sơ gốc cho email: ${rejected.email}`);
        }
      } catch (error) {
        console.error(`❌ Lỗi khi cập nhật hồ sơ ${rejected._id}:`, error.message);
      }
    }
    
    // Kiểm tra lại
    const updatedProfiles = await RejectedInstructor.find({ 
      originalProfileId: { $exists: true } 
    });
    
    console.log(`🎉 Hoàn thành! Đã cập nhật ${updatedProfiles.length} hồ sơ`);
    
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

updateRejectedProfiles();