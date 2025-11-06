const InstructorProfile = require('../models/instructorProfileModel');
const { reviewInstructorProfile } = require('./aiReviewService');

/**
 * Service để tự động chấm điểm các applications pending chưa có AI review
 */

/**
 * Tìm và review tất cả pending applications chưa có AI score
 */
const reviewPendingApplications = async () => {
  try {
    console.log('🔍 [AUTO-AI] Checking for pending applications without AI review...');

    // Tìm tất cả applications pending CHƯA có aiReviewScore
    // Simplified query - just check for pending status
    const pendingProfiles = await InstructorProfile.find({
      applicationStatus: 'pending'
    });

    console.log(`📊 [AUTO-AI] Found ${pendingProfiles.length} pending profiles`);
    
    // Filter out those that already have AI score
    const needsReview = pendingProfiles.filter(p => !p.aiReviewScore && p.aiReviewScore !== 0);
    
    console.log(`📊 [AUTO-AI] Needs review: ${needsReview.length} profiles`);
    
    if (needsReview.length === 0) {
      console.log('✅ [AUTO-AI] No pending applications need AI review');
      return {
        success: true,
        message: 'No applications to review',
        processed: 0
      };
    }

    console.log(`📋 [AUTO-AI] Found ${needsReview.length} pending applications without AI review`);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const profile of needsReview) {
      try {
        console.log(`🤖 [AUTO-AI] Processing application: ${profile._id}`);
        const aiReviewResult = await reviewInstructorProfile(profile._id);
        
        if (aiReviewResult.success) {
          successCount++;
          console.log(`✅ [AUTO-AI] Successfully reviewed ${profile._id} - Score: ${aiReviewResult.data?.finalScore}`);
        } else {
          failCount++;
          console.log(`❌ [AUTO-AI] Failed to review ${profile._id}: ${aiReviewResult.error}`);
        }

        results.push({
          applicationId: profile._id,
          success: aiReviewResult.success,
          score: aiReviewResult.data?.finalScore,
          error: aiReviewResult.error
        });

        // Delay nhỏ giữa các reviews để tránh overload
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        failCount++;
        console.error(`❌ [AUTO-AI] Error reviewing application ${profile._id}:`, error);
        results.push({
          applicationId: profile._id,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`✅ [AUTO-AI] Batch review completed. Success: ${successCount}, Failed: ${failCount}`);

    return {
      success: true,
      message: `Reviewed ${successCount} applications successfully, ${failCount} failed`,
      total: pendingProfiles.length,
      successCount,
      failCount,
      results
    };
  } catch (error) {
    console.error('❌ [AUTO-AI] Error in reviewPendingApplications:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Bắt đầu auto review service
 * @param {number} intervalMinutes - Khoảng thời gian giữa các lần check (phút)
 */
const startAutoReviewService = (intervalMinutes = 30) => {
  console.log(`🚀 [AUTO-AI] Starting auto AI review service...`);
  console.log(`⏰ [AUTO-AI] Will check every ${intervalMinutes} minutes`);

  // Chạy ngay lập tức khi start server
  console.log('🔄 [AUTO-AI] Running initial check...');
  reviewPendingApplications();

  // Sau đó chạy định kỳ
  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(() => {
    console.log('🔄 [AUTO-AI] Running periodic check...');
    reviewPendingApplications();
  }, intervalMs);

  console.log('✅ [AUTO-AI] Auto review service started successfully');
};

module.exports = {
  reviewPendingApplications,
  startAutoReviewService
};
