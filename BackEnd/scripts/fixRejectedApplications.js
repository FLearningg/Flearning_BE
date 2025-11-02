// Load environment variables
require('dotenv').config();

const mongoose = require('mongoose');
const InstructorProfile = require('../models/instructorProfileModel');

/**
 * Script để sửa các hồ sơ bị AI rejected thành manual review
 * Để các hồ sơ này không xuất hiện trong admin view
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

const fixRejectedApplications = async () => {
  try {
    console.log('🚀 Bắt đầu sửa các hồ sơ bị AI rejected...\n');

    // 1. Tìm tất cả hồ sơ có aiReviewStatus là "rejected"
    console.log('📋 Tìm kiếm hồ sơ bị AI rejected...');
    const rejectedProfiles = await InstructorProfile.find({ 
      aiReviewStatus: "rejected" 
    });

    console.log(`📊 Tìm thấy ${rejectedProfiles.length} hồ sơ bị AI rejected\n`);

    if (rejectedProfiles.length === 0) {
      console.log('ℹ️ Không có hồ sơ nào bị AI rejected cần sửa.');
      return;
    }

    // 2. Hiển thị thông tin các hồ sơ sẽ sửa
    rejectedProfiles.forEach((profile, index) => {
      console.log(`👤 Hồ sơ ${index + 1}:`);
      console.log(`   ID: ${profile._id}`);
      console.log(`   Application Status: ${profile.applicationStatus}`);
      console.log(`   AI Review Status: ${profile.aiReviewStatus}`);
      console.log(`   AI Review Score: ${profile.aiReviewScore}`);
      console.log(`   Email: ${profile.userId?.email || 'N/A'}`);
    });

    // 3. Sửa từng hồ sơ từ rejected thành manual_review
    let updatedCount = 0;
    for (const profile of rejectedProfiles) {
      try {
        // Cập nhật hồ sơ
        await InstructorProfile.findByIdAndUpdate(profile._id, {
          aiReviewStatus: 'manual_review',
          aiReviewScore: 45, // Điểm trung bình thấp
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
          }
        });

        console.log(`✅ Đã sửa hồ sơ ${profile._id} từ rejected → manual_review`);
        updatedCount++;

      } catch (error) {
        console.error(`❌ Lỗi sửa hồ sơ ${profile._id}:`, error.message);
      }
    }

    console.log(`\n🎉 Hoàn thành! Đã sửa ${updatedCount}/${rejectedProfiles.length} hồ sơ.`);

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

    // 5. Kiểm tra xem còn hồ sơ rejected nào không
    const remainingRejected = await InstructorProfile.find({
      aiReviewStatus: "rejected"
    });

    if (remainingRejected.length > 0) {
      console.log(`\n⚠️ Còn ${remainingRejected.length} hồ sơ rejected chưa được sửa:`);
      remainingRejected.forEach(profile => {
        console.log(`   - ID: ${profile._id}`);
      });
    } else {
      console.log(`\n✅ Không còn hồ sơ nào bị rejected!`);
    }

  } catch (error) {
    console.error('❌ Lỗi trong quá trình sửa:', error);
  } finally {
    // Đóng kết nối
    await mongoose.disconnect();
    console.log('\n🔌 Đã đóng kết nối MongoDB');
  }
};

// Chạy sửa
fixRejectedApplications();