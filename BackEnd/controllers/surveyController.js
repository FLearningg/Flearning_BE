const User = require("../models/userModel");

/**
 * Submit survey - Save user's learning preferences
 * @route POST /api/survey/submit
 * @access Private (requires authentication)
 */
exports.submitSurvey = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      learningGoal,
      learningObjectives,
      interestedSkills,
      otherSkill,
      currentLevel,
      weeklyStudyHours,
      targetCompletionTime,
    } = req.body;

    // Validate required fields
    if (!learningGoal || !currentLevel || !weeklyStudyHours || !targetCompletionTime) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ các thông tin bắt buộc",
      });
    }

    // Validate enum values
    const validLevels = ["beginner", "intermediate", "advanced", "expert"];
    const validStudyHours = ["1-3", "4-7", "8-15", "15+"];
    const validCompletionTimes = ["1-month", "3-months", "6-months", "1-year+"];

    if (!validLevels.includes(currentLevel)) {
      return res.status(400).json({
        success: false,
        message: "Trình độ không hợp lệ",
      });
    }

    if (!validStudyHours.includes(weeklyStudyHours)) {
      return res.status(400).json({
        success: false,
        message: "Thời gian học tập không hợp lệ",
      });
    }

    if (!validCompletionTimes.includes(targetCompletionTime)) {
      return res.status(400).json({
        success: false,
        message: "Thời gian hoàn thành không hợp lệ",
      });
    }

    // Find and update user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    // Update learning preferences
    user.learningPreferences = {
      surveyCompleted: true,
      surveyCompletedAt: new Date(),
      learningGoal: learningGoal.trim(),
      learningObjectives: learningObjectives || [],
      interestedSkills: interestedSkills || [],
      currentLevel,
      weeklyStudyHours,
      targetCompletionTime,
    };

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Lưu thông tin khảo sát thành công",
      data: {
        learningPreferences: user.learningPreferences,
      },
    });
  } catch (error) {
    console.error("Error submitting survey:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lưu thông tin khảo sát",
      error: error.message,
    });
  }
};

/**
 * Get user's survey data
 * @route GET /api/survey
 * @access Private
 */
exports.getSurvey = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId)
      .select("learningPreferences")
      .populate("learningPreferences.interestedSkills", "name");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        learningPreferences: user.learningPreferences,
      },
    });
  } catch (error) {
    console.error("Error getting survey:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin khảo sát",
      error: error.message,
    });
  }
};
