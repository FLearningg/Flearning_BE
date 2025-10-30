// Load environment variables
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/userModel');
const InstructorProfile = require('../models/instructorProfileModel');
const { reviewInstructorProfile, reviewAllPendingProfiles } = require('../services/aiReviewService');

/**
 * Script để test toàn bộ AI review flow
 * 1. Kiểm tra các hồ sơ đang chờ
 * 2. Chạy AI review trên các hồ sơ đó
 * 3. Hiển thị kết quả
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

const testAIReviewFlow = async () => {
  try {
    console.log('🚀 Bắt đầu test AI Review Flow...\n');

    // 1. Lấy tất cả hồ sơ đang chờ
    console.log('📋 Lấy danh sách hồ sơ đang chờ...');
    const pendingProfiles = await InstructorProfile.find({ 
      applicationStatus: 'pending',
      aiReviewStatus: { $in: [null, 'pending'] }
    }).populate('userId');

    console.log(`📊 Tìm thấy ${pendingProfiles.length} hồ sơ đang chờ AI review\n`);

    if (pendingProfiles.length === 0) {
      console.log('ℹ️ Không có hồ sơ nào để test. Tạo hồ sơ test...');
      
      // Tạo một hồ sơ test nếu không có hồ sơ nào
      await createTestProfile();
      return;
    }

    // 2. Hiển thị thông tin các hồ sơ
    pendingProfiles.forEach((profile, index) => {
      console.log(`\n👤 Hồ sơ ${index + 1}:`);
      console.log(`   Tên: ${profile.userId?.firstName} ${profile.userId?.lastName}`);
      console.log(`   Email: ${profile.userId?.email}`);
      console.log(`   Số tài liệu: ${profile.documents?.length || 0}`);
      console.log(`   AI Review Status: ${profile.aiReviewStatus || 'Chưa review'}`);
      console.log(`   Application Status: ${profile.applicationStatus}`);
    });

    // 3. Chạy AI review trên hồ sơ đầu tiên
    if (pendingProfiles.length > 0) {
      const testProfile = pendingProfiles[0];
      console.log(`\n🤖 Chạy AI review trên hồ sơ: ${testProfile.userId?.email}`);
      
      const startTime = Date.now();
      const result = await reviewInstructorProfile(testProfile._id);
      const endTime = Date.now();
      
      console.log(`⏱️ AI review hoàn thành trong ${(endTime - startTime) / 1000} giây`);
      console.log('📊 Kết quả AI Review:');
      console.log(JSON.stringify(result, null, 2));
      
      // 4. Kiểm tra lại hồ sơ sau khi AI review
      const updatedProfile = await InstructorProfile.findById(testProfile._id).populate('userId');
      console.log('\n📋 Hồ sơ sau AI review:');
      console.log(`   AI Review Status: ${updatedProfile.aiReviewStatus}`);
      console.log(`   AI Review Score: ${updatedProfile.aiReviewScore}`);
      console.log(`   Application Status: ${updatedProfile.applicationStatus}`);
      
      if (updatedProfile.aiReviewDetails?.decision) {
        console.log(`   AI Decision: ${updatedProfile.aiReviewDetails.decision.status}`);
        console.log(`   AI Reason: ${updatedProfile.aiReviewDetails.decision.reason}`);
      }
    }

    // 5. Test batch review
    console.log('\n🔄 Test batch AI review...');
    const batchResult = await reviewAllPendingProfiles();
    console.log('📊 Kết quả batch review:');
    console.log(JSON.stringify(batchResult, null, 2));

    console.log('\n✅ Test AI Review Flow hoàn thành!');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình test:', error);
  } finally {
    // Đóng kết nối
    await mongoose.disconnect();
    console.log('🔌 Đã đóng kết nối MongoDB');
  }
};

// Tạo hồ sơ test
const createTestProfile = async () => {
  try {
    console.log('🔧 Tạo hồ sơ test...');
    
    // Tạo user test
    const testUser = await User.findOne({ email: 'test.instructor@example.com' });
    let user;
    
    if (!testUser) {
      user = new User({
        firstName: 'Test',
        lastName: 'Instructor',
        email: 'test.instructor@example.com',
        password: 'password123',
        userName: 'test.instructor',
        status: 'verified',
        role: 'student'
      });
      await user.save();
      console.log('✅ Đã tạo user test');
    } else {
      user = testUser;
    }
    
    // Tạo instructor profile test
    const existingProfile = await InstructorProfile.findOne({ userId: user._id });
    if (!existingProfile) {
      const profile = new InstructorProfile({
        userId: user._id,
        phone: '0123456789',
        expertise: ['Web Development', 'JavaScript', 'React'],
        experience: '5+ years of experience in web development with expertise in React and Node.js',
        documents: [
          'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/test-cv.pdf?alt=media'
        ],
        applicationStatus: 'pending'
      });
      await profile.save();
      console.log('✅ Đã tạo instructor profile test');
      
      // Chạy AI review trên profile test
      console.log('🤖 Chạy AI review trên profile test...');
      const result = await reviewInstructorProfile(profile._id);
      console.log('📊 Kết quả AI Review cho profile test:');
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('ℹ️ Profile test đã tồn tại');
    }
    
  } catch (error) {
    console.error('❌ Lỗi tạo profile test:', error);
  }
};

// Chạy test
testAIReviewFlow();