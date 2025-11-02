const mongoose = require('mongoose');
require('dotenv').config();

const InstructorProfile = require('../models/instructorProfileModel');
const RejectedInstructor = require('../models/rejectedInstructorModel');

const cleanRejectedProfiles = async () => {
  try {
    // Kết nối đến MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/flearning');
    console.log('✅ Đã kết nối đến MongoDB');
    
    // Tìm các hồ sơ bị rejected còn lại
    const rejectedProfiles = await InstructorProfile.find({
      $or: [
        { applicationStatus: 'rejected' },
        { aiReviewStatus: 'rejected' }
      ]
    }).populate('userId');
    
    console.log(`📊 Tìm thấy ${rejectedProfiles.length} hồ sơ bị rejected còn lại`);
    
    if (rejectedProfiles.length === 0) {
      console.log('✅ Không có hồ sơ rejected nào cần di chuyển');
      
      // Kiểm tra số lượng hiện tại
      const totalRejected = await RejectedInstructor.countDocuments();
      const remainingRejected = await InstructorProfile.countDocuments({
        $or: [
          { applicationStatus: 'rejected' },
          { aiReviewStatus: 'rejected' }
        ]
      });
      
      console.log(`📊 Thống kê hiện tại:`);
      console.log(`   - Hồ sơ rejected còn lại trong InstructorProfiles: ${remainingRejected}`);
      console.log(`   - Tổng hồ sơ trong RejectedInstructors: ${totalRejected}`);
      
      await mongoose.connection.close();
      console.log('🔌 Đã đóng kết nối MongoDB');
      return;
    }
    
    for (const profile of rejectedProfiles) {
      console.log(`👤 Đang xử lý hồ sơ: ${profile._id}`);
      console.log(`   Email: ${profile.userId ? profile.userId.email : 'N/A'}`);
      console.log(`   Application Status: ${profile.applicationStatus}`);
      console.log(`   AI Review Status: ${profile.aiReviewStatus || 'N/A'}`);
      
      try {
        // Tạo bản ghi trong RejectedInstructors
        const rejectedInstructor = await RejectedInstructor.createFromInstructorProfile(
          profile,
          'ai_rejected',
          profile.rejectionReason || 'AI rejected'
        );
        console.log(`✅ Đã tạo bản ghi rejected: ${rejectedInstructor._id}`);
        
        // Xóa hồ sơ khỏi InstructorProfiles
        await InstructorProfile.findByIdAndDelete(profile._id);
        console.log(`🗑️ Đã xóa hồ sơ khỏi InstructorProfiles: ${profile._id}`);
      } catch (error) {
        console.error(`❌ Lỗi khi xử lý hồ sơ ${profile._id}:`, error.message);
      }
    }
    
    // Kiểm tra lại
    const remainingRejected = await InstructorProfile.countDocuments({
      $or: [
        { applicationStatus: 'rejected' },
        { aiReviewStatus: 'rejected' }
      ]
    });
    
    const totalRejected = await RejectedInstructor.countDocuments();
    
    console.log(`🎉 Hoàn thành!`);
    console.log(`   - Hồ sơ rejected còn lại trong InstructorProfiles: ${remainingRejected}`);
    console.log(`   - Tổng hồ sơ trong RejectedInstructors: ${totalRejected}`);
    
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

cleanRejectedProfiles();