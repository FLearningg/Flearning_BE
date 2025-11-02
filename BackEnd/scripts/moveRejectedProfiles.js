const mongoose = require('mongoose');
const InstructorProfile = require('../models/instructorProfileModel');
const RejectedInstructor = require('../models/rejectedInstructorModel');
const User = require('../models/userModel');

// Kết nối đến MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/flearning', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Đã kết nối đến MongoDB');
    return conn;
  } catch (error) {
    console.error('❌ Lỗi kết nối MongoDB:', error);
    process.exit(1);
  }
};

const moveRejectedProfiles = async () => {
  try {
    console.log('🚀 Bắt đầu di chuyển các hồ sơ bị rejected...');

    // Tìm tất cả các hồ sơ bị rejected
    const rejectedProfiles = await InstructorProfile.find({
      $or: [
        { applicationStatus: 'rejected' },
        { aiReviewStatus: 'rejected' }
      ]
    }).populate('userId');

    console.log(`📊 Tìm thấy ${rejectedProfiles.length} hồ sơ bị rejected`);

    if (rejectedProfiles.length === 0) {
      console.log('✅ Không có hồ sơ nào cần di chuyển');
      return;
    }

    let movedCount = 0;
    let errorCount = 0;

    for (const profile of rejectedProfiles) {
      try {
        console.log(`\n👤 Đang xử lý hồ sơ: ${profile._id}`);
        console.log(`   Email: ${profile.userId?.email || 'N/A'}`);
        console.log(`   Application Status: ${profile.applicationStatus}`);
        console.log(`   AI Review Status: ${profile.aiReviewStatus || 'N/A'}`);

        // Tạo bản ghi trong RejectedInstructors collection
        const rejectionType = profile.aiReviewStatus === 'rejected' ? 'ai_rejected' : 'admin_rejected';
        const rejectionReason = profile.rejectionReason || 'Hồ sơ không đáp ứng yêu cầu';

        const rejectedInstructor = await RejectedInstructor.createFromInstructorProfile(
          profile,
          rejectionType,
          rejectionReason
        );

        console.log(`✅ Đã tạo bản ghi rejected: ${rejectedInstructor._id}`);

        // Xóa hồ sơ khỏi InstructorProfiles collection
        await InstructorProfile.findByIdAndDelete(profile._id);
        console.log(`🗑️ Đã xóa hồ sơ khỏi InstructorProfiles: ${profile._id}`);

        movedCount++;
      } catch (error) {
        console.error(`❌ Lỗi khi di chuyển hồ sơ ${profile._id}:`, error);
        errorCount++;
      }
    }

    console.log(`\n🎉 Hoàn thành! Đã di chuyển ${movedCount}/${rejectedProfiles.length} hồ sơ`);
    if (errorCount > 0) {
      console.log(`⚠️ Có ${errorCount} hồ sơ gặp lỗi khi di chuyển`);
    }

    // Kiểm tra lại kết quả
    const remainingRejected = await InstructorProfile.countDocuments({
      $or: [
        { applicationStatus: 'rejected' },
        { aiReviewStatus: 'rejected' }
      ]
    });

    const totalRejected = await RejectedInstructor.countDocuments();

    console.log(`\n📊 Kiểm tra lại kết quả:`);
    console.log(`   - Hồ sơ rejected còn lại trong InstructorProfiles: ${remainingRejected}`);
    console.log(`   - Tổng hồ sơ trong RejectedInstructors: ${totalRejected}`);

  } catch (error) {
    console.error('❌ Lỗi trong quá trình di chuyển:', error);
  } finally {
    // Đóng kết nối
    await mongoose.connection.close();
    console.log('🔌 Đã đóng kết nối MongoDB');
  }
};

// Chạy script
const main = async () => {
  await connectDB();
  await moveRejectedProfiles();
  process.exit(0);
};

main();