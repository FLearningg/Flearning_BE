// Load environment variables
require('dotenv').config();

const mongoose = require('mongoose');
const InstructorProfile = require('../models/instructorProfileModel');

/**
 * Script để cập nhật các hồ sơ instructor cũ
 * Thêm các trường AI review status và score cho các hồ sơ chưa có
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

const updateOldProfiles = async () => {
  try {
    console.log('🚀 Bắt đầu cập nhật hồ sơ cũ...\n');

    // 1. Tìm tất cả hồ sơ chưa có aiReviewStatus
    console.log('📋 Tìm kiếm hồ sơ chưa có AI review status...');
    const oldProfiles = await InstructorProfile.find({ 
      aiReviewStatus: { $exists: false } 
    });

    console.log(`📊 Tìm thấy ${oldProfiles.length} hồ sơ cần cập nhật\n`);

    if (oldProfiles.length === 0) {
      console.log('ℹ️ Không có hồ sơ nào cần cập nhật.');
      return;
    }

    // 2. Hiển thị thông tin các hồ sơ
    oldProfiles.forEach((profile, index) => {
      console.log(`👤 Hồ sơ ${index + 1}:`);
      console.log(`   ID: ${profile._id}`);
      console.log(`   Application Status: ${profile.applicationStatus}`);
      console.log(`   Email: ${profile.userId?.email || 'N/A'}`);
      console.log(`   Số tài liệu: ${profile.documents?.length || 0}`);
    });

    // 3. Cập nhật từng hồ sơ
    let updatedCount = 0;
    for (const profile of oldProfiles) {
      try {
        // Xác định AI review status dựa trên application status hiện tại
        let aiReviewStatus;
        let aiReviewScore;
        let aiReviewDetails;

        switch (profile.applicationStatus) {
          case 'approved':
            aiReviewStatus = 'approved';
            aiReviewScore = 85; // Điểm cao cho các hồ sơ đã approved
            aiReviewDetails = {
              decision: {
                status: 'approved',
                reason: 'Hồ sơ đã được admin duyệt trước đây',
                confidence: 0.9
              },
              analysis: {
                personalInfo: { score: 25, found: true },
                experience: { score: 30, found: true },
                education: { score: 20, found: true },
                skills: { score: 10, found: true }
              }
            };
            break;
          
          case 'rejected':
            aiReviewStatus = 'rejected';
            aiReviewScore = 25; // Điểm thấp cho các hồ sơ đã rejected
            aiReviewDetails = {
              decision: {
                status: 'rejected',
                reason: profile.rejectionReason || 'Hồ sơ đã bị admin từ chối trước đây',
                confidence: 0.9
              },
              analysis: {
                personalInfo: { score: 10, found: true },
                experience: { score: 5, found: false },
                education: { score: 5, found: false },
                skills: { score: 5, found: false }
              }
            };
            break;
          
          case 'pending':
          default:
            aiReviewStatus = 'manual_review'; // Cần admin review lại
            aiReviewScore = 55; // Điểm trung bình
            aiReviewDetails = {
              decision: {
                status: 'manual_review',
                reason: 'Hồ sơ cũ cần admin xem xét lại',
                confidence: 0.7
              },
              analysis: {
                personalInfo: { score: 15, found: true },
                experience: { score: 15, found: true },
                education: { score: 15, found: true },
                skills: { score: 10, found: true }
              }
            };
            break;
        }

        // Cập nhật hồ sơ
        await InstructorProfile.findByIdAndUpdate(profile._id, {
          aiReviewStatus: aiReviewStatus,
          aiReviewScore: aiReviewScore,
          aiReviewDetails: aiReviewDetails,
          aiReviewedAt: new Date()
        });

        console.log(`✅ Đã cập nhật hồ sơ ${profile._id} - Status: ${aiReviewStatus}, Score: ${aiReviewScore}`);
        updatedCount++;

      } catch (error) {
        console.error(`❌ Lỗi cập nhật hồ sơ ${profile._id}:`, error.message);
      }
    }

    console.log(`\n🎉 Hoàn thành! Đã cập nhật ${updatedCount}/${oldProfiles.length} hồ sơ.`);

    // 4. Kiểm tra lại kết quả
    console.log('\n📊 Kiểm tra lại kết quả:');
    const updatedProfiles = await InstructorProfile.find({
      aiReviewStatus: { $exists: true }
    });

    const statusCount = {
      approved: 0,
      rejected: 0,
      manual_review: 0
    };

    updatedProfiles.forEach(profile => {
      statusCount[profile.aiReviewStatus]++;
    });

    console.log(`   - Approved: ${statusCount.approved}`);
    console.log(`   - Rejected: ${statusCount.rejected}`);
    console.log(`   - Manual Review: ${statusCount.manual_review}`);
    console.log(`   - Tổng cộng: ${updatedProfiles.length}`);

  } catch (error) {
    console.error('❌ Lỗi trong quá trình cập nhật:', error);
  } finally {
    // Đóng kết nối
    await mongoose.disconnect();
    console.log('\n🔌 Đã đóng kết nối MongoDB');
  }
};

// Chạy cập nhật
updateOldProfiles();