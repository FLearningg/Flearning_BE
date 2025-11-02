const { analyzeCV } = require('./cvParsingService');
const InstructorProfile = require('../models/instructorProfileModel');
const RejectedInstructor = require('../models/rejectedInstructorModel');
const User = require('../models/userModel');
const emailTemplates = require('../utils/emailTemplates');
const sendEmail = require('../utils/sendEmail');

/**
 * Service để đánh giá tự động hồ sơ giảng viên bằng AI
 * Sử dụng CV parsing service để phân tích tài liệu và đưa ra quyết định
 */

/**
 * Ngưỡng điểm để approve/reject
 */
const AI_REVIEW_THRESHOLDS = {
  APPROVE_MIN_SCORE: 70,  // Điểm tối thiểu để approve
  REJECT_MAX_SCORE: 40,   // Điểm tối đa để reject
  MANUAL_REVIEW_MIN: 41, // Điểm tối thiểu để cần review thủ công
  MANUAL_REVIEW_MAX: 69  // Điểm tối đa để cần review thủ công
};

/**
 * Các lý do reject tự động
 */
const AUTO_REJECT_REASONS = [
  'Thiếu thông tin cá nhân quan trọng',
  'Không có kinh nghiệm làm việc liên quan',
  'Kỹ năng chuyên môn không đáp ứng yêu cầu',
  'Thiếu thông tin học vấn',
  'Tài liệu không thể đọc được'
];

/**
 * Đánh giá hồ sơ giảng viên bằng AI
 * @param {string} profileId - ID của hồ sơ giảng viên
 * @returns {Promise<Object>} - Kết quả đánh giá
 */
const reviewInstructorProfile = async (profileId) => {
  try {
    // Lấy thông tin hồ sơ
    const profile = await InstructorProfile.findById(profileId).populate('userId');
    if (!profile) {
      return {
        success: false,
        error: 'Instructor profile not found'
      };
    }

    // Kiểm tra nếu đã được review
    if (profile.applicationStatus !== 'pending') {
      return {
        success: false,
        error: 'Profile is not in pending status'
      };
    }

    console.log(`🤖 Starting AI review for profile: ${profileId}`);
    console.log(`📄 Documents to analyze: ${profile.documents.length}`);

    // Phân tích CV bằng AI
    const cvAnalysis = await analyzeCV(profile.documents);
    
    if (!cvAnalysis.success) {
      console.error('CV Analysis failed:', cvAnalysis.error);
      return {
        success: false,
        error: `CV Analysis failed: ${cvAnalysis.error}`
      };
    }

    // Đánh giá thêm các yếu tố khác
    const additionalAnalysis = analyzeAdditionalFactors(profile);
    
    // Tính điểm tổng hợp
    const finalScore = calculateFinalScore(cvAnalysis.data, additionalAnalysis);
    
    // Đưa ra quyết định
    const decision = makeDecision(finalScore, cvAnalysis.data, additionalAnalysis);
    
    // Cập nhật hồ sơ
    profile.aiReviewScore = finalScore;
    profile.aiReviewStatus = decision.status;
    profile.aiReviewDetails = {
      cvAnalysis: cvAnalysis.data,
      additionalAnalysis,
      finalScore,
      decision,
      reviewedAt: new Date()
    };
    
    // Cập nhật trạng thái ứng dụng
    if (decision.status === 'approved') {
      profile.applicationStatus = 'approved';
      profile.approvedAt = new Date();
      
      // Cập nhật vai trò người dùng
      await User.findByIdAndUpdate(profile.userId._id, { role: 'instructor' });
      
      // Gửi email approve
      await sendApprovalEmail(profile.userId);
      
      console.log(`✅ AI Approved profile: ${profileId} with score: ${finalScore}`);
    } else if (decision.status === 'rejected') {
      profile.applicationStatus = 'rejected';
      profile.rejectedAt = new Date();
      profile.rejectionReason = decision.reason;
      
      // Chuyển hồ sơ sang collection rejected instructors
      try {
        const rejectedInstructor = await RejectedInstructor.createFromInstructorProfile(
          profile,
          'ai_rejected',
          decision.reason
        );
        console.log(`📋 Moved rejected profile to RejectedInstructors collection: ${rejectedInstructor._id}`);
        
        // Xóa hồ sơ khỏi collection instructor profiles
        await InstructorProfile.findByIdAndDelete(profileId);
        console.log(`🗑️ Deleted rejected profile from InstructorProfiles: ${profileId}`);
        
        // Gửi email reject
        await sendRejectionEmail(profile.userId, decision.reason);
        
        console.log(`❌ AI Rejected profile: ${profileId} with score: ${finalScore}`);
      } catch (error) {
        console.error('Error moving profile to rejected collection:', error);
        // Nếu có lỗi khi chuyển, vẫn giữ lại hồ sơ trong collection cũ
        await profile.save();
      }
    } else {
      // Cần review thủ công
      console.log(`👤 AI Manual Review Required for profile: ${profileId} with score: ${finalScore}`);
    }
    
    await profile.save();

    return {
      success: true,
      data: {
        profileId,
        finalScore,
        decision: decision.status,
        reason: decision.reason,
        recommendations: decision.recommendations
      }
    };
  } catch (error) {
    console.error('Error in AI review:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Phân tích các yếu tố bổ sung ngoài CV
 * @param {Object} profile - Hồ sơ giảng viên
 * @returns {Object} - Kết quả phân tích
 */
const analyzeAdditionalFactors = (profile) => {
  const analysis = {
    emailCompleteness: 0,
    phoneCompleteness: 0,
    expertiseRelevance: 0,
    experienceQuality: 0,
    documentQuality: 0
  };

  // Kiểm tra độ hoàn thiện của email
  if (profile.userId && profile.userId.email) {
    const email = profile.userId.email;
    if (email.includes('@') && email.includes('.')) {
      analysis.emailCompleteness = 10;
    } else {
      analysis.emailCompleteness = 5;
    }
  }

  // Kiểm tra độ hoàn thiện của số điện thoại
  if (profile.phone && profile.phone.length >= 10) {
    analysis.phoneCompleteness = 10;
  } else if (profile.phone && profile.phone.length >= 5) {
    analysis.phoneCompleteness = 5;
  }

  // Đánh giá độ liên quan của chuyên môn
  const relevantExpertise = [
    'Web Development', 'Mobile Development', 'Data Science', 'Machine Learning',
    'Artificial Intelligence', 'Cloud Computing', 'DevOps', 'Cybersecurity',
    'UI/UX Design', 'Graphic Design', 'Digital Marketing',
    'Business & Management', 'Finance & Accounting', 'Language Learning'
  ];
  
  if (profile.expertise && profile.expertise.length > 0) {
    const relevantCount = profile.expertise.filter(exp => 
      relevantExpertise.some(relevant => 
        exp.toLowerCase().includes(relevant.toLowerCase()) || 
        relevant.toLowerCase().includes(exp.toLowerCase())
      )
    ).length;
    
    analysis.expertiseRelevance = (relevantCount / profile.expertise.length) * 10;
  }

  // Đánh giá chất lượng kinh nghiệm
  if (profile.experience && profile.experience.length > 50) {
    const experienceKeywords = [
      'teaching', 'training', 'instructor', 'lecturer', 'mentor',
      'giảng dạy', 'đào tạo', 'huấn luyện', 'giảng viên'
    ];
    
    const hasTeachingKeywords = experienceKeywords.some(keyword => 
      profile.experience.toLowerCase().includes(keyword)
    );
    
    if (hasTeachingKeywords) {
      analysis.experienceQuality = 10;
    } else {
      analysis.experienceQuality = 5;
    }
  }

  // Đánh giá chất lượng tài liệu
  if (profile.documents && profile.documents.length > 0) {
    analysis.documentQuality = Math.min(10, profile.documents.length * 2);
  }

  return analysis;
};

/**
 * Tính điểm tổng hợp
 * @param {Object} cvAnalysis - Kết quả phân tích CV
 * @param {Object} additionalAnalysis - Kết quả phân tích bổ sung
 * @returns {number} - Điểm tổng hợp (0-100)
 */
const calculateFinalScore = (cvAnalysis, additionalAnalysis) => {
  let score = 0;

  // Điểm từ phân tích CV (60%)
  const cvScore = cvAnalysis.overallScore || 0;
  score += cvScore * 0.6;

  // Điểm từ phân tích bổ sung (40%)
  const additionalScore = 
    (additionalAnalysis.emailCompleteness || 0) +
    (additionalAnalysis.phoneCompleteness || 0) +
    (additionalAnalysis.expertiseRelevance || 0) +
    (additionalAnalysis.experienceQuality || 0) +
    (additionalAnalysis.documentQuality || 0);
  
  score += additionalScore * 0.4;

  return Math.round(Math.min(100, score));
};

/**
 * Đưa ra quyết định dựa trên điểm số
 * @param {number} score - Điểm tổng hợp
 * @param {Object} cvAnalysis - Kết quả phân tích CV
 * @param {Object} additionalAnalysis - Kết quả phân tích bổ sung
 * @returns {Object} - Quyết định và lý do
 */
const makeDecision = (score, cvAnalysis, additionalAnalysis) => {
  const decision = {
    status: 'manual_review', // Mặc định: cần review thủ công
    reason: '',
    recommendations: []
  };

  if (score >= AI_REVIEW_THRESHOLDS.APPROVE_MIN_SCORE) {
    decision.status = 'approved';
    decision.reason = 'Hồ sơ đáp ứng đủ điều kiện để trở thành giảng viên';
  } else if (score <= AI_REVIEW_THRESHOLDS.REJECT_MAX_SCORE) {
    decision.status = 'rejected';
    
    // Xác định lý do reject cụ thể
    const reasons = [];
    
    if (!cvAnalysis.personalInfo.name || !cvAnalysis.personalInfo.email || !cvAnalysis.personalInfo.phone) {
      reasons.push('Thiếu thông tin cá nhân quan trọng');
    }
    
    if (cvAnalysis.experience.length === 0) {
      reasons.push('Không có kinh nghiệm làm việc liên quan');
    }
    
    if (cvAnalysis.skills.length < 3) {
      reasons.push('Kỹ năng chuyên môn không đáp ứng yêu cầu');
    }
    
    if (cvAnalysis.education.length === 0) {
      reasons.push('Thiếu thông tin học vấn');
    }
    
    if (additionalAnalysis.documentQuality < 5) {
      reasons.push('Tài liệu không đủ chất lượng hoặc không thể đọc được');
    }
    
    decision.reason = reasons.join('; ');
  } else {
    // Cần review thủ công
    decision.status = 'manual_review';
    decision.reason = 'Hồ sơ cần được xem xét thủ công bởi admin';
    
    // Thêm đề xuất cho manual review
    decision.recommendations = [
      'Kiểm tra kỹ kinh nghiệm làm việc',
      'Xác minh các kỹ năng chuyên môn',
      'Đánh giá chất lượng tài liệu cung cấp'
    ];
  }

  return decision;
};

/**
 * Gửi email approve
 * @param {Object} user - Thông tin người dùng
 */
const sendApprovalEmail = async (user) => {
  try {
    const emailContent = emailTemplates.instructorApplicationApprovedEmail(user.firstName);
    await sendEmail(user.email, "Your Instructor Application is Approved!", emailContent);
    console.log(`✅ Approval email sent to: ${user.email}`);
  } catch (error) {
    console.error('Error sending approval email:', error);
  }
};

/**
 * Gửi email reject
 * @param {Object} user - Thông tin người dùng
 * @param {string} reason - Lý do reject
 */
const sendRejectionEmail = async (user, reason) => {
  try {
    const emailContent = emailTemplates.instructorApplicationDeniedEmail(user.firstName, reason);
    await sendEmail(user.email, "Your Instructor Application is Denied", emailContent);
    console.log(`❌ Rejection email sent to: ${user.email}`);
  } catch (error) {
    console.error('Error sending rejection email:', error);
  }
};

/**
 * Review tự động tất cả hồ sơ đang chờ
 * @returns {Promise<Object>} - Kết quả batch review
 */
const reviewAllPendingProfiles = async () => {
  try {
    console.log('🤖 Starting batch AI review for all pending profiles...');
    
    const pendingProfiles = await InstructorProfile.find({ 
      applicationStatus: 'pending',
      aiReviewStatus: { $in: [null, 'pending'] }
    }).populate('userId');
    
    console.log(`📊 Found ${pendingProfiles.length} pending profiles for AI review`);
    
    const results = [];
    
    for (const profile of pendingProfiles) {
      try {
        const result = await reviewInstructorProfile(profile._id);
        results.push({
          profileId: profile._id,
          email: profile.userId.email,
          result: result
        });
        
        // Delay giữa các review để tránh quá tải
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error reviewing profile ${profile._id}:`, error);
        results.push({
          profileId: profile._id,
          email: profile.userId.email,
          error: error.message
        });
      }
    }
    
    console.log(`✅ Batch AI review completed. Processed ${results.length} profiles`);
    
    return {
      success: true,
      data: {
        totalProcessed: results.length,
        results
      }
    };
  } catch (error) {
    console.error('Error in batch AI review:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  reviewInstructorProfile,
  reviewAllPendingProfiles,
  AI_REVIEW_THRESHOLDS,
  AUTO_REJECT_REASONS
};