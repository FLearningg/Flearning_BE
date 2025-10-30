// Load environment variables
require('dotenv').config();

const mongoose = require('mongoose');
const InstructorProfile = require('../models/instructorProfileModel');

/**
 * Script để sửa hồ sơ cụ thể bị AI rejected
 */

// Kết nối MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Đã kết nối đến MongoDB');
})
.catch(err => {
  console.error('❌ Lỗi kết nối MongoDB:', err);
  process.exit(1);
});

const fixSpecificProfile = async () => {
  try {
    console.log('🚀 Bắt đầu sửa hồ sơ cụ thể...\n');

    // ID của hồ sơ cần sửa
    const profileId = '690274e3f10ce735f2e4834c';
    
    console.log(`📋 Tìm hồ sơ với ID: ${profileId}...`);
    
    // Tìm hồ sơ cụ thể
    const profile = await InstructorProfile.findById(profileId);
    
    if (!profile) {
      console.log('❌ Không tìm thấy hồ sơ với ID này.');
      return;
    }

    console.log('📊 Thông tin hồ sơ hiện tại:');
    console.log(`   ID: ${profile._id}`);
    console.log(`   Application Status: ${profile.applicationStatus}`);
    console.log(`   AI Review Status: ${profile.aiReviewStatus || 'Chưa có'}`);
    console.log(`   AI Review Score: ${profile.aiReviewScore || 'Chưa có'}`);
    console.log(`   Rejection Reason: ${profile.rejectionReason || 'Không có'}`);

    // Cập nhật hồ sơ
    console.log('\n🔧 Đang cập nhật hồ sơ...');
    
    await InstructorProfile.findByIdAndUpdate(profileId, {
      aiReviewStatus: 'manual_review',
      aiReviewScore: 45,
      aiReviewDetails: {
        decision: {
          status: 'manual_review',
          reason: 'Cần admin xem xét lại',
          confidence: 0.5
        },
        analysis: {
          personalInfo: { score: 15, found: true },
          experience: { score: 10, found: false },
          education: { score: 10, found: false },
          skills: { score: 10, found: false }
        }
      },
      aiReviewedAt: new Date()
    });

    console.log('✅ Đã cập nhật hồ sơ thành công!');

    // Kiểm tra lại
    console.log('\n📊 Kiểm tra lại sau khi cập nhật:');
    const updatedProfile = await InstructorProfile.findById(profileId);
    
    console.log(`   AI Review Status: ${updatedProfile.aiReviewStatus}`);
    console.log(`   AI Review Score: ${updatedProfile.aiReviewScore}`);
    console.log(`   AI Reviewed At: ${updatedProfile.aiReviewedAt}`);

  } catch (error) {
    console.error('❌ Lỗi trong quá trình sửa:', error);
  } finally {
    // Đóng kết nối
    await mongoose.disconnect();
    console.log('\n🔌 Đã đóng kết nối MongoDB');
  }
};

// Chạy sửa
fixSpecificProfile();