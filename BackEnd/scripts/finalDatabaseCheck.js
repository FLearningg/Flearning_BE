const mongoose = require('mongoose');
require('dotenv').config();

const InstructorProfile = require('../models/instructorProfileModel');
const RejectedInstructor = require('../models/rejectedInstructorModel');

const finalCheck = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Đã kết nối đến MongoDB');
    
    // Kiểm tra tổng số hồ sơ trong InstructorProfiles
    const totalInstructorProfiles = await InstructorProfile.countDocuments();
    console.log(`📊 Tổng số hồ sơ trong InstructorProfiles: ${totalInstructorProfiles}`);
    
    // Kiểm tra số hồ sơ bị rejected trong InstructorProfiles
    const rejectedInInstructorProfiles = await InstructorProfile.countDocuments({
      $or: [
        { applicationStatus: 'rejected' },
        { aiReviewStatus: 'rejected' }
      ]
    });
    console.log(`❌ Số hồ sơ rejected còn lại trong InstructorProfiles: ${rejectedInInstructorProfiles}`);
    
    // Kiểm tra tổng số hồ sơ trong RejectedInstructors
    const totalRejectedInstructors = await RejectedInstructor.countDocuments();
    console.log(`📋 Tổng số hồ sơ trong RejectedInstructors: ${totalRejectedInstructors}`);
    
    // Liệt kê các hồ sơ rejected trong RejectedInstructors
    const rejectedProfiles = await RejectedInstructor.find({});
    console.log('\n📋 Danh sách các hồ sơ trong RejectedInstructors:');
    rejectedProfiles.forEach((profile, index) => {
      console.log(`${index + 1}. Email: ${profile.email}`);
      console.log(`   Rejection Reason: ${profile.rejectionReason}`);
      console.log(`   Original Profile ID: ${profile.originalProfileId || 'N/A'}`);
      console.log('---');
    });
    
    // Kiểm tra xem có hồ sơ nào bị rejected trong cả hai collection không
    const allRejectedEmails = rejectedProfiles.map(p => p.email);
    const stillRejectedInMain = await InstructorProfile.find({
      'userId.email': { $in: allRejectedEmails }
    });
    
    if (stillRejectedInMain.length > 0) {
      console.log('\n⚠️ CẢNH BÁO: Các hồ sơ sau vẫn tồn tại trong InstructorProfiles:');
      stillRejectedInMain.forEach(profile => {
        console.log(`   Email: ${profile.userId.email}`);
        console.log(`   Application Status: ${profile.applicationStatus}`);
        console.log(`   AI Review Status: ${profile.aiReviewStatus || 'N/A'}`);
      });
    } else {
      console.log('\n✅ TỐT: Không có hồ sơ rejected nào tồn tại trong cả hai collection');
    }
    
    await mongoose.connection.close();
    console.log('\n🔌 Đã đóng kết nối MongoDB');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

finalCheck();