require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/userModel");
const Course = require("../models/courseModel");
const Enrollment = require("../models/enrollmentModel");
const {
  callGeminiAPI,
  parseGeminiJSON,
  extractTextFromResponse,
  buildGeminiRequestBody,
  GeminiAPIError,
  MODEL,
} = require("../utils/geminiApiHelper");

/**
 * POST /api/recommendations/generate
 * Generate personalized learning path based on user preferences
 */
exports.generateLearningPath = async (req, res) => {
  try {
    const userId = req.user.id;

    // Allow FE to POST a pre-built learning path payload. If payload present, validate and save.
    const payload = req.body;

    // Get user with learning preferences
    const user = await User.findById(userId)
      .select("learningPreferences firstName lastName learningPath")
      .populate("learningPreferences.interestedSkills", "name");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // If FE provides a learningPath payload (create/update), validate & persist it
    if (
      payload &&
      (payload.pathTitle || (payload.phases && payload.phases.length))
    ) {
      const { valid, errors, normalized, warnings } =
        await validateAndNormalizePayload(payload);

      if (!valid) {
        return res.status(400).json({ success: false, errors });
      }

      // Build learningPath to save on user
      const learningPathToSave = buildLearningPathFromPayload(normalized);

      // Save to user
      user.learningPath = {
        recommendedCourses: learningPathToSave.recommendedCourses.map((r) => ({
          courseId: r.courseId, // store as ObjectId ref
          reason: r.reason || "",
          priority: r.priority || 0,
          matchScore: r.matchScore || 0,
          estimatedHours: r.estimatedHours || 0,
        })),
        pathSummary: learningPathToSave.pathSummary,
        lastGeneratedAt: new Date(),
        regenerationCount: (user.learningPath?.regenerationCount || 0) + 1,
      };

      await user.save();

      // Populate course objects for response
      await user.populate(
        "learningPath.recommendedCourses.courseId",
        "title subTitle thumbnail level duration price rating categoryIds detail"
      );
      await user.populate(
        "learningPath.recommendedCourses.courseId.categoryIds",
        "name icon"
      );

      // Convert phases courses to full objects for response
      const phasesWithPopulatedCourses = await populatePhasesCourses(
        normalized.phases
      );

      const respLearningPath = {
        pathTitle: normalized.pathTitle,
        learningGoal:
          normalized.learningGoal ||
          user.learningPreferences?.learningGoal ||
          "",
        phases: phasesWithPopulatedCourses,
        recommendedCourses: user.learningPath.recommendedCourses,
        pathSummary: user.learningPath.pathSummary,
        lastGeneratedAt: user.learningPath.lastGeneratedAt,
      };

      const responseBody = { learningPath: respLearningPath };
      if (warnings && warnings.length) responseBody.warnings = warnings;

      return res.status(200).json(responseBody);
    }

    // Check if user has completed survey
    if (!user.learningPreferences?.surveyCompleted) {
      return res.status(400).json({
        success: false,
        message: "Please complete the learning preferences survey first",
        requiresSurvey: true,
      });
    }

    // Get all active courses with their categories
    const courses = await Course.find({ status: "active" })
      .populate("categoryIds", "name")
      .select(
        "title subTitle detail level duration price categoryIds rating language"
      )
      .lean();

    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active courses found",
      });
    }

    // Get user's current enrollments to exclude them
    const enrollments = await Enrollment.find({
      userId,
      status: { $in: ["enrolled", "completed"] },
    }).select("courseId status");

    const enrolledCourseIds = enrollments.map((e) => e.courseId.toString());

    // Filter out already enrolled courses
    const availableCourses = courses.filter(
      (course) => !enrolledCourseIds.includes(course._id.toString())
    );

    console.log("📊 Total active courses:", courses.length);
    console.log("📊 Already enrolled:", enrolledCourseIds.length);
    console.log("📊 Available courses:", availableCourses.length);

    // Generate recommendations using AI + matching algorithm
    const recommendations = await generateRecommendations(
      user,
      availableCourses
    );

    if (recommendations.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No suitable courses found matching your preferences",
      });
    }

    // Extract preferences for phase organization
    const preferences = user.learningPreferences;

    // Organize recommendations into progressive phases (without AI rationales yet)
    const phasesWithoutRationale = organizeIntoPhases(
      recommendations,
      availableCourses,
      preferences
    );

    // Generate AI-powered phase rationales for all phases at once
    const phases = await generatePhaseRationales(
      phasesWithoutRationale,
      preferences,
      user
    );

    // Update user's learning path with phases
    user.learningPath = {
      pathTitle: generatePathTitle(preferences),
      learningGoal: preferences.learningGoal || "",
      phases: phases,
      recommendedCourses: recommendations, // Keep flat structure for backward compatibility
      pathSummary: calculatePathSummary(
        recommendations,
        availableCourses,
        phases.length
      ),
      lastGeneratedAt: new Date(),
      regenerationCount: (user.learningPath?.regenerationCount || 0) + 1,
    };

    await user.save();

    // Populate course details in both phases and flat structure
    await user.populate(
      "learningPath.phases.courses.courseId",
      "title subTitle thumbnail level duration price rating categoryIds"
    );
    await user.populate(
      "learningPath.phases.courses.courseId.categoryIds",
      "name icon"
    );
    await user.populate(
      "learningPath.recommendedCourses.courseId",
      "title subTitle thumbnail level duration price rating categoryIds"
    );
    await user.populate(
      "learningPath.recommendedCourses.courseId.categoryIds",
      "name icon"
    );
    await user.populate("learningPath.pathSummary.skillsCovered", "name icon");

    return res.status(200).json({
      success: true,
      learningPath: user.learningPath,
    });
  } catch (error) {
    console.error("🚨 generateLearningPath error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate learning path",
      error: error.message,
    });
  }
};

/**
 * GET /api/recommendations/learning-path
 * Get user's current learning path
 */
exports.getLearningPath = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId)
      .select("learningPath learningPreferences")
      .populate(
        "learningPath.phases.courses.courseId",
        "title subTitle thumbnail level duration price rating categoryIds"
      )
      .populate("learningPath.phases.courses.courseId.categoryIds", "name icon")
      .populate(
        "learningPath.recommendedCourses.courseId",
        "title subTitle thumbnail level duration price rating categoryIds"
      )
      .populate(
        "learningPath.recommendedCourses.courseId.categoryIds",
        "name icon"
      )
      .populate("learningPath.pathSummary.skillsCovered", "name icon");

    if (
      !user ||
      !user.learningPath ||
      ((!user.learningPath.phases || user.learningPath.phases.length === 0) &&
        (!user.learningPath.recommendedCourses ||
          user.learningPath.recommendedCourses.length === 0))
    ) {
      return res.status(404).json({
        success: false,
        message: "No learning path found. Please generate one first.",
        requiresGeneration: true,
      });
    }

    return res.status(200).json({
      success: true,
      learningPath: user.learningPath,
    });
  } catch (error) {
    console.error("🚨 getLearningPath error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve learning path",
      error: error.message,
    });
  }
};

/**
 * Generate course recommendations using AI + matching algorithm
 */
async function generateRecommendations(user, courses) {
  const preferences = user.learningPreferences;

  // Step 1: Filter courses by level
  let filteredCourses = filterCoursesByLevel(courses, preferences.currentLevel);

  // Step 2: Filter by interested skills/categories
  if (preferences.interestedSkills && preferences.interestedSkills.length > 0) {
    const interestedSkillIds = preferences.interestedSkills.map((skill) =>
      skill._id ? skill._id.toString() : skill.toString()
    );

    filteredCourses = filteredCourses.filter((course) => {
      const courseCategoryIds = course.categoryIds.map((cat) =>
        cat._id ? cat._id.toString() : cat.toString()
      );
      return courseCategoryIds.some((catId) =>
        interestedSkillIds.includes(catId)
      );
    });
  }

  console.log(
    "📊 Filtered courses by level and skills:",
    filteredCourses.length
  );

  if (filteredCourses.length === 0) {
    // Fallback: Return courses matching only the level
    filteredCourses = filterCoursesByLevel(courses, preferences.currentLevel);
  }

  // Step 3: Calculate match scores for each course
  const coursesWithScores = filteredCourses.map((course) => ({
    course,
    matchScore: calculateMatchScore(course, preferences),
  }));

  // Step 4: Sort by match score (highest first)
  coursesWithScores.sort((a, b) => b.matchScore - a.matchScore);

  // Step 5: Select top courses based on target completion time
  const maxCourses = getMaxCoursesForTimeline(
    preferences.targetCompletionTime,
    preferences.weeklyStudyHours
  );

  const topCourses = coursesWithScores.slice(0, maxCourses);

  console.log("📊 Top courses selected:", topCourses.length);

  // Step 6: Use AI to generate reasons for recommendations
  const recommendationsWithReasons = await generateAIReasons(
    topCourses,
    preferences,
    user
  );

  // Step 7: Format recommendations and organize into phases
  const recommendations = recommendationsWithReasons.map((item, index) => ({
    courseId: item.course._id,
    reason: item.reason,
    priority: index + 1,
    matchScore: item.matchScore,
    estimatedHours: parseDuration(item.course.duration),
    level: item.course.level, // Keep level for phase organization
  }));

  return recommendations;
}

/**
 * Filter courses by user's current level
 */
function filterCoursesByLevel(courses, currentLevel) {
  const levelHierarchy = {
    beginner: ["beginner"],
    intermediate: ["beginner", "intermediate"],
    advanced: ["intermediate", "advanced"],
    expert: ["advanced"],
  };

  const allowedLevels = levelHierarchy[currentLevel] || ["beginner"];

  return courses.filter((course) => allowedLevels.includes(course.level));
}

/**
 * Calculate match score for a course (0-100)
 */
function calculateMatchScore(course, preferences) {
  let score = 0;

  // Level match (30 points)
  if (course.level === preferences.currentLevel) {
    score += 30;
  } else if (
    preferences.currentLevel === "intermediate" &&
    course.level === "beginner"
  ) {
    score += 20;
  } else if (
    preferences.currentLevel === "advanced" &&
    course.level === "intermediate"
  ) {
    score += 25;
  }

  // Category match (40 points)
  if (preferences.interestedSkills && preferences.interestedSkills.length > 0) {
    const interestedSkillIds = preferences.interestedSkills.map((skill) =>
      skill._id ? skill._id.toString() : skill.toString()
    );

    const courseCategoryIds = course.categoryIds.map((cat) =>
      cat._id ? cat._id.toString() : cat.toString()
    );

    const matchingCategories = courseCategoryIds.filter((catId) =>
      interestedSkillIds.includes(catId)
    );

    const categoryMatchRatio =
      matchingCategories.length / interestedSkillIds.length;
    score += Math.round(categoryMatchRatio * 40);
  }

  // Rating bonus (20 points)
  if (course.rating) {
    score += Math.round((course.rating / 5) * 20);
  }

  // Course detail quality (10 points)
  if (course.detail?.description && course.detail.description.length > 100) {
    score += 5;
  }
  if (course.detail?.willLearn && course.detail.willLearn.length > 0) {
    score += 5;
  }

  return Math.min(score, 100);
}

/**
 * Determine maximum number of courses based on timeline
 */
function getMaxCoursesForTimeline(targetCompletionTime, weeklyStudyHours) {
  const timelineMap = {
    "1-month": { "1-3": 1, "4-7": 2, "8-15": 3, "15+": 4 },
    "3-months": { "1-3": 2, "4-7": 3, "8-15": 5, "15+": 6 },
    "6-months": { "1-3": 3, "4-7": 5, "8-15": 7, "15+": 10 },
    "1-year+": { "1-3": 5, "4-7": 8, "8-15": 12, "15+": 15 },
  };

  return timelineMap[targetCompletionTime]?.[weeklyStudyHours] || 5;
}

/**
 * Parse duration string to hours (e.g., "10h 30m" -> 10.5)
 */
function parseDuration(durationString) {
  if (!durationString) return 0;

  let totalHours = 0;
  const hourMatch = durationString.match(/(\d+)\s*h/i);
  const minuteMatch = durationString.match(/(\d+)\s*m/i);

  if (hourMatch) {
    totalHours += parseInt(hourMatch[1]);
  }

  if (minuteMatch) {
    totalHours += parseInt(minuteMatch[1]) / 60;
  }

  return Math.round(totalHours * 10) / 10; // Round to 1 decimal
}

/**
 * Generate AI-powered reasons for each recommendation using Gemini API
 */
async function generateAIReasons(topCourses, preferences, user) {
  try {
    const prompt = buildRecommendationPrompt(topCourses, preferences, user);

    const systemInstruction = `You are an expert educational advisor. Your role is to explain why specific courses are recommended for a student based on their learning goals, current level, and interests.

For each course, provide:
1. A clear, personalized reason (1-2 sentences) explaining why this course is suitable
2. Focus on how it matches their goals, level, and interests
3. Use encouraging and motivating language
4. Be specific about what skills or knowledge they'll gain

CRITICAL: You MUST return ONLY a valid JSON array. No markdown formatting. No code blocks. No text outside the JSON array. Each reason should be concise (max 100 characters).`;

    const requestBody = buildGeminiRequestBody({
      systemInstruction,
      userPrompt: prompt,
      generationConfig: {
        temperature: 0.5,
        topP: 0.9,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    // Call Gemini API with retry mechanism
    const result = await callGeminiAPI(requestBody, {
      maxRetries: 3,
      baseDelay: 1000,
      timeout: 30000,
    });

    // Extract and parse response
    const responseText = extractTextFromResponse(result);
    const parsedResponse = parseGeminiJSON(responseText);

    if (!Array.isArray(parsedResponse)) {
      throw new Error("AI response is not a JSON array");
    }

    // Merge AI reasons with course data
    return topCourses.map((item, index) => ({
      ...item,
      reason:
        parsedResponse[index]?.reason ||
        createFallbackReason(item.course, preferences),
    }));
  } catch (error) {
    // Log the error with appropriate context
    if (error instanceof GeminiAPIError) {
      console.error("🚨 Gemini API Error:", error.toJSON());
    } else {
      console.error("🚨 generateAIReasons error:", error.message);
    }

    // Always use fallback on any error
    console.warn("⚠️ Using fallback reasons due to error");
    return createFallbackReasons(topCourses, preferences);
  }
}

/**
 * Build prompt for AI recommendation reasons
 */
function buildRecommendationPrompt(topCourses, preferences, user) {
  const userName = user.firstName || "bạn";
  const level = preferences.currentLevel || "beginner";
  const goals = preferences.learningGoal || "nâng cao kỹ năng";
  const objectives = preferences.learningObjectives?.join(", ") || "N/A";
  const skills =
    preferences.interestedSkills?.map((s) => s.name).join(", ") || "N/A";

  const coursesInfo = topCourses
    .map(
      (item, index) => `
Course ${index + 1}:
- Title: ${item.course.title}
- Subtitle: ${item.course.subTitle || "N/A"}
- Level: ${item.course.level}
- Description: ${item.course.detail?.description?.substring(0, 200) || "N/A"}
- Match Score: ${item.matchScore}/100
`
    )
    .join("\n");

  return `Thông tin học viên:
Tên: ${userName}
Trình độ hiện tại: ${level}
Mục tiêu học tập: ${goals}
Mục tiêu cụ thể: ${objectives}
Kỹ năng quan tâm: ${skills}
Thời gian học mỗi tuần: ${preferences.weeklyStudyHours} giờ
Thời gian mục tiêu: ${preferences.targetCompletionTime}

Các khóa học được gợi ý:
${coursesInfo}

YÊU CẦU: Với mỗi khóa học trên, hãy tạo lý do gợi ý ngắn gọn (tối đa 100 ký tự) giải thích tại sao khóa học này phù hợp với học viên.

Trả về CHÍNH XÁC một JSON array với cấu trúc:
[
  {
    "courseIndex": 0,
    "reason": "Lý do gợi ý cá nhân hóa ở đây"
  }
]

Quan trọng: Chỉ trả về JSON array, không có markdown, không có code block, không có text nào khác ngoài JSON array.`;
}

/**
 * Generate AI-powered phase rationales for all phases
 */
async function generatePhaseRationales(phases, preferences, user) {
  try {
    const prompt = buildPhaseRationalePrompt(phases, preferences, user);

    const systemInstruction = `You are an expert educational advisor. Your role is to create meaningful phase titles, explain WHY each learning phase is suitable for a student, and recommend realistic TIME DURATION based on their learning goals, current level, weekly study commitment, and the phase's content.

For each phase, provide:
1. A descriptive, engaging TITLE (4-6 words in Vietnamese) that captures the essence of this learning stage
2. A clear, personalized RATIONALE (1-2 sentences, max 150 characters) explaining WHY this phase is appropriate NOW
3. A realistic ESTIMATED_WEEKS for completing this phase based on:
   - The student's weekly study hours commitment
   - The total content hours in the phase
   - Their current skill level (beginners need more time)
   - Their overall target completion timeline

Title guidelines:
- Use action-oriented, inspiring language
- Reference the skill level or focus area
- Make it feel progressive (foundation → development → mastery)
- Examples: "Nền Tảng Lập Trình Web", "Phát Triển Ứng Dụng Thực Tế", "Chuyên Sâu Full-Stack"

Rationale guidelines:
- Reference their current level, goals, or timeline when relevant
- Explain how this phase fits into their overall learning progression
- Use encouraging and motivating language
- Write in Vietnamese (tiếng Việt)

Time Duration guidelines:
- Consider the student's weekly study hours (e.g., "1-3" = ~2h/week, "4-7" = ~5.5h/week, "8-15" = ~11.5h/week, "15+" = ~20h/week)
- Consider their target completion time (e.g., "1-month", "3-months", "6-months", "1-year+")
- Beginners typically need 20-30% more time than intermediate/advanced students
- Be realistic: Don't compress too much content into too little time
- Balance between the student's timeline goals and effective learning pace
- Return as a NUMBER (integer) representing weeks

CRITICAL: You MUST return ONLY a valid JSON array. No markdown formatting. No code blocks. No text outside the JSON array.
Response format: [{"title": "...", "rationale": "...", "estimatedWeeks": 4}, ...]`;

    const requestBody = buildGeminiRequestBody({
      systemInstruction,
      userPrompt: prompt,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    });

    // Call Gemini API with retry mechanism
    const result = await callGeminiAPI(requestBody, {
      maxRetries: 3,
      baseDelay: 1000,
      timeout: 30000,
    });

    // Extract and parse response
    const responseText = extractTextFromResponse(result);
    const parsedResponse = parseGeminiJSON(responseText);

    if (!Array.isArray(parsedResponse)) {
      throw new Error("AI response is not a JSON array");
    }

    // Merge AI titles, rationales, and time estimates with phase data
    return phases.map((phase, index) => {
      const aiData = parsedResponse[index] || {};
      const tempInfo = phase._tempPhaseInfo;

      // Remove temporary info
      const { _tempPhaseInfo, ...cleanPhase } = phase;

      // Use AI-provided weeks or fallback to calculated value
      const estimatedWeeks =
        aiData.estimatedWeeks ||
        cleanPhase.estimatedWeeks ||
        calculateWeeksForPhase(
          cleanPhase.totalHours,
          preferences.weeklyStudyHours
        );

      return {
        ...cleanPhase,
        title: aiData.title || createFallbackPhaseTitle(tempInfo, preferences),
        phaseRationale:
          aiData.rationale ||
          createFallbackPhaseRationale(
            phase,
            index,
            phases.length,
            preferences
          ),
        estimatedWeeks: Math.max(1, Math.ceil(estimatedWeeks)), // Ensure at least 1 week
        estimatedDays: Math.ceil(estimatedWeeks * 7),
        estimatedTime: formatEstimatedTime(estimatedWeeks),
      };
    });
  } catch (error) {
    // Log the error with appropriate context
    if (error instanceof GeminiAPIError) {
      console.error("🚨 Gemini API Error (Phase Rationales):", error.toJSON());
    } else {
      console.error("🚨 generatePhaseRationales error:", error.message);
    }

    // Always use fallback on any error
    console.warn("⚠️ Using fallback phase titles and rationales due to error");
    return phases.map((phase, index) => {
      const tempInfo = phase._tempPhaseInfo;
      const { _tempPhaseInfo, ...cleanPhase } = phase;

      // Calculate fallback weeks
      const estimatedWeeks =
        cleanPhase.estimatedWeeks ||
        calculateWeeksForPhase(
          cleanPhase.totalHours,
          preferences.weeklyStudyHours
        );

      return {
        ...cleanPhase,
        title: createFallbackPhaseTitle(tempInfo, preferences),
        phaseRationale: createFallbackPhaseRationale(
          phase,
          index,
          phases.length,
          preferences
        ),
        estimatedWeeks: Math.max(1, Math.ceil(estimatedWeeks)),
        estimatedDays: Math.ceil(estimatedWeeks * 7),
        estimatedTime: formatEstimatedTime(estimatedWeeks),
      };
    });
  }
}

/**
 * Build prompt for AI phase rationales
 */
function buildPhaseRationalePrompt(phases, preferences, user) {
  const userName = user.firstName || "bạn";
  const level = preferences.currentLevel || "beginner";
  const goals = preferences.learningGoal || "nâng cao kỹ năng";
  const timeline = preferences.targetCompletionTime || "6-months";
  const weeklyHours = preferences.weeklyStudyHours || "4-7";

  // Map weekly hours to approximate hours per week for context
  const weeklyHoursMap = {
    "1-3": "~2 giờ",
    "4-7": "~5.5 giờ",
    "8-15": "~11.5 giờ",
    "15+": "~20 giờ",
  };
  const weeklyHoursDetail = weeklyHoursMap[weeklyHours] || weeklyHours + " giờ";

  // Map timeline to Vietnamese
  const timelineMap = {
    "1-month": "1 tháng",
    "3-months": "3 tháng",
    "6-months": "6 tháng",
    "1-year+": "1 năm hoặc lâu hơn",
  };
  const timelineDetail = timelineMap[timeline] || timeline;

  const phasesInfo = phases
    .map(
      (phase, index) => `
Phase ${index + 1}:
- Description: ${phase.description}
- Total Content Hours: ${phase.totalHours}h
- Number of Courses: ${phase.courses.length}
- Primary Level: ${phase._tempPhaseInfo?.primaryLevel || "mixed"}
- Order: ${phase.order} of ${phases.length}
- Current Estimated Time: ${phase.estimatedTime} (có thể điều chỉnh)
`
    )
    .join("\n");

  return `Thông tin học viên:
Tên: ${userName}
Trình độ hiện tại: ${level}
Mục tiêu học tập: ${goals}
Thời gian học mỗi tuần: ${weeklyHours} giờ (${weeklyHoursDetail})
Thời gian mục tiêu hoàn thành TOÀN BỘ lộ trình: ${timelineDetail}
Tổng số giai đoạn: ${phases.length}

Các giai đoạn học tập:
${phasesInfo}

YÊU CẦU: Với mỗi giai đoạn trên, hãy tạo:

1. TITLE (Tiêu đề): 
   - Độ dài: 4-6 từ tiếng Việt
   - Phong cách: Hành động, truyền cảm hứng
   - Phản ánh trình độ và trọng tâm của giai đoạn
   - VÍ DỤ tốt:
     * Phase 1 (beginner): "Khởi Đầu Lập Trình Web"
     * Phase 2 (intermediate): "Phát Triển Ứng Dụng Thực Tế"
     * Phase 3 (advanced): "Chuyên Sâu Full-Stack"

2. RATIONALE (Lý do):
   - Độ dài: 1-2 câu, tối đa 150 ký tự
   - Giải thích TẠI SAO giai đoạn này phù hợp NGAY BÂY GIỜ
   - Tham chiếu đến trình độ, mục tiêu, hoặc timeline của học viên
   - Ngôn ngữ: Thân thiện, động viên

3. ESTIMATED_WEEKS (Thời gian ước tính):
   - Xác định SỐ TUẦN thực tế để hoàn thành giai đoạn này
   - Cân nhắc:
     * Số giờ nội dung của giai đoạn (Total Content Hours)
     * Thời gian học mỗi tuần của học viên (${weeklyHoursDetail})
     * Trình độ hiện tại (${level}) - beginners cần thêm 20-30% thời gian
     * Mục tiêu timeline tổng thể (${timelineDetail})
     * Phân bổ thời gian hợp lý giữa các giai đoạn (tổng ${phases.length} giai đoạn)
   - QUY TẮC:
     * Không nén quá nhiều nội dung vào thời gian quá ngắn
     * Cân bằng giữa mục tiêu timeline và tốc độ học hiệu quả
     * Beginners: thêm 20-30% thời gian so với tính toán cơ bản
     * Phase cuối có thể dài hơn vì nội dung nâng cao
   - Trả về số NGUYÊN (integer) đại diện số tuần

Trả về CHÍNH XÁC một JSON array với cấu trúc:
[
  {
    "phaseIndex": 0,
    "title": "Tiêu đề giai đoạn (4-6 từ)",
    "rationale": "Lý do cá nhân hóa (max 150 chars)",
    "estimatedWeeks": 4
  }
]

VÍ DỤ đầy đủ:
[
  {
    "phaseIndex": 0,
    "title": "Nền Tảng Lập Trình",
    "rationale": "Bạn đang ở trình độ beginner nên cần xây dựng nền tảng vững chắc trước khi học framework nâng cao.",
    "estimatedWeeks": 6
  },
  {
    "phaseIndex": 1,
    "title": "Phát Triển Ứng Dụng Thực Tế",
    "rationale": "Sau nền tảng vững, bạn sẵn sàng áp dụng kiến thức vào dự án thực tế để đạt mục tiêu trong 6 tháng.",
    "estimatedWeeks": 8
  }
]

LƯU Ý QUAN TRỌNG:
- Tổng thời gian tất cả phases NÊN phù hợp với mục tiêu "${timelineDetail}" của học viên
- Với commitment ${weeklyHoursDetail}, học viên cần ước tính thực tế
- Đừng quá lạc quan hoặc quá bi quan về thời gian hoàn thành`;
}

/**
 * Create fallback phase title when AI fails
 */
function createFallbackPhaseTitle(tempInfo, preferences) {
  if (!tempInfo) return "Giai Đoạn Học Tập";

  const { phaseNum, primaryLevel } = tempInfo;

  const levelMap = {
    beginner: "Nền Tảng Cơ Bản",
    intermediate: "Phát Triển Kỹ Năng",
    advanced: "Nâng Cao Chuyên Môn",
    expert: "Chuyên Gia",
  };

  return `Giai Đoạn ${phaseNum}: ${levelMap[primaryLevel] || "Học Tập"}`;
}

/**
 * Create fallback phase rationale when AI fails
 */
function createFallbackPhaseRationale(
  phase,
  phaseIndex,
  totalPhases,
  preferences
) {
  const phaseNum = phaseIndex + 1;
  const isFirstPhase = phaseNum === 1;
  const isLastPhase = phaseNum === totalPhases;
  const currentLevel = preferences.currentLevel || "beginner";
  const timeline = preferences.targetCompletionTime || "6-months";
  const learningGoal = preferences.learningGoal || "học tập hiệu quả";

  // Extract skills from phase title/description
  const skillMatch = phase.description?.match(/Tập trung vào ([^.]+)/);
  const skills = skillMatch ? skillMatch[1] : "các kỹ năng quan trọng";

  // Timeline mapping for Vietnamese
  const timelineMap = {
    "1-month": "1 tháng",
    "3-months": "3 tháng",
    "6-months": "6 tháng",
    "1-year+": "1 năm",
  };
  const timelineVN = timelineMap[timeline] || timeline;

  if (isFirstPhase) {
    if (currentLevel === "beginner") {
      return `Bạn đang ở trình độ beginner nên cần xây dựng nền tảng vững chắc về ${skills} trước khi học nâng cao.`;
    } else if (currentLevel === "intermediate") {
      return `Bạn đã có nền tảng, giai đoạn này giúp bạn làm chủ ${skills} để đạt mục tiêu trong ${timelineVN}.`;
    } else {
      return `Với trình độ ${currentLevel}, bạn sẽ nhanh chóng nắm vững ${skills} và tiến lên giai đoạn nâng cao.`;
    }
  } else if (isLastPhase) {
    if (learningGoal && learningGoal !== "học tập hiệu quả") {
      return `Giai đoạn cuối hoàn thiện kỹ năng chuyên môn. Sau đây bạn đã sẵn sàng cho "${learningGoal}".`;
    } else {
      return `Giai đoạn cuối hoàn thiện kỹ năng chuyên môn, giúp bạn đạt được mục tiêu nghề nghiệp.`;
    }
  } else {
    return `Sau khi nắm vững cơ bản, bạn sẵn sàng phát triển kỹ năng ${skills} để tiến gần hơn đến mục tiêu.`;
  }
}

/**
 * Create fallback reasons when AI fails
 */
function createFallbackReasons(topCourses, preferences) {
  return topCourses.map((item) => ({
    ...item,
    reason: createFallbackReason(item.course, preferences),
  }));
}

/**
 * Create a single fallback reason
 */
function createFallbackReason(course, preferences) {
  const level =
    course.level === "beginner"
      ? "Cơ bản"
      : course.level === "intermediate"
      ? "Trung cấp"
      : course.level === "advanced"
      ? "Nâng cao"
      : "Chuyên sâu";
  const categories =
    course.categoryIds?.map((cat) => cat.name).join(", ") || "chủ đề này";

  return `Phù hợp với cấp độ ${level} & kỹ năng ${categories}`;
}

/**
 * Generate path title based on user preferences
 */
function generatePathTitle(preferences) {
  const skillNames =
    preferences.interestedSkills?.map((s) => s.name).join(", ") ||
    "General Learning";
  const level =
    preferences.currentLevel === "beginner"
      ? "Cơ Bản"
      : preferences.currentLevel === "intermediate"
      ? "Trung Cấp"
      : preferences.currentLevel === "advanced"
      ? "Nâng Cao"
      : "Chuyên Gia";

  return `Lộ Trình ${skillNames} - Cấp Độ ${level}`;
}

/**
 * Organize recommendations into progressive learning phases
 * Phases are created based on:
 * 1. Course level progression (beginner → intermediate → advanced)
 * 2. Timeline and weekly study hours from survey
 * 3. Logical skill progression
 */
function organizeIntoPhases(recommendations, allCourses, preferences) {
  if (!recommendations || recommendations.length === 0) {
    return [];
  }

  // Get course details map
  const coursesMap = new Map(allCourses.map((c) => [c._id.toString(), c]));

  // Add full course data to recommendations
  const enrichedRecs = recommendations
    .map((rec) => ({
      ...rec,
      course: coursesMap.get(rec.courseId.toString()),
    }))
    .filter((rec) => rec.course); // Remove any with missing course data

  // Determine number of phases based on timeline and course count
  const phaseCount = calculatePhaseCount(
    preferences.targetCompletionTime,
    preferences.weeklyStudyHours,
    enrichedRecs.length
  );

  // Sort courses by level progression first, then by matchScore within each level
  const levelOrder = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
  const sortedRecs = [...enrichedRecs].sort((a, b) => {
    const levelDiff =
      (levelOrder[a.course.level] || 0) - (levelOrder[b.course.level] || 0);
    if (levelDiff !== 0) return levelDiff; // Sort by level first
    return b.matchScore - a.matchScore; // Then by matchScore (highest first)
  });

  // Group courses by level after sorting
  const coursesByLevel = {
    beginner: sortedRecs.filter((r) => r.course.level === "beginner"),
    intermediate: sortedRecs.filter((r) => r.course.level === "intermediate"),
    advanced: sortedRecs.filter((r) => r.course.level === "advanced"),
    expert: sortedRecs.filter((r) => r.course.level === "expert"),
  };

  // Create phases with progressive difficulty
  const phases = [];
  const coursesPerPhase = Math.ceil(sortedRecs.length / phaseCount);

  // Distribute courses across phases, prioritizing level progression
  let beginnerIndex = 0;
  let intermediateIndex = 0;
  let advancedIndex = 0;
  let expertIndex = 0;

  for (let i = 0; i < phaseCount; i++) {
    const phaseNum = i + 1;
    const isFirstPhase = i === 0;
    const isLastPhase = i === phaseCount - 1;

    // Determine which levels to include in this phase (progressive difficulty)
    let phaseCourses = [];

    if (isFirstPhase) {
      // Phase 1: Prioritize beginner courses
      const beginnerCount = Math.min(
        coursesPerPhase,
        coursesByLevel.beginner.length - beginnerIndex
      );
      phaseCourses.push(
        ...coursesByLevel.beginner.slice(
          beginnerIndex,
          beginnerIndex + beginnerCount
        )
      );
      beginnerIndex += beginnerCount;

      // Fill remaining slots with intermediate if needed
      if (phaseCourses.length < coursesPerPhase) {
        const intermediateCount = Math.min(
          coursesPerPhase - phaseCourses.length,
          coursesByLevel.intermediate.length - intermediateIndex
        );
        phaseCourses.push(
          ...coursesByLevel.intermediate.slice(
            intermediateIndex,
            intermediateIndex + intermediateCount
          )
        );
        intermediateIndex += intermediateCount;
      }
    } else if (isLastPhase) {
      // Last phase: Advanced/Expert courses first, then any remaining
      const advancedCount = coursesByLevel.advanced.length - advancedIndex;
      phaseCourses.push(...coursesByLevel.advanced.slice(advancedIndex));
      advancedIndex += advancedCount;

      const expertCount = coursesByLevel.expert.length - expertIndex;
      phaseCourses.push(...coursesByLevel.expert.slice(expertIndex));
      expertIndex += expertCount;

      // Fill any remaining intermediate or beginner
      if (intermediateIndex < coursesByLevel.intermediate.length) {
        phaseCourses.push(
          ...coursesByLevel.intermediate.slice(intermediateIndex)
        );
      }
      if (beginnerIndex < coursesByLevel.beginner.length) {
        phaseCourses.push(...coursesByLevel.beginner.slice(beginnerIndex));
      }
    } else {
      // Middle phases: Transition from beginner → intermediate → advanced
      const phaseProgress = i / (phaseCount - 1); // 0 to 1

      if (phaseProgress < 0.5) {
        // Early-middle phases: Mix beginner + intermediate
        const remainingBeginner =
          coursesByLevel.beginner.length - beginnerIndex;
        const beginnerCount = Math.min(
          Math.floor(coursesPerPhase * 0.3),
          remainingBeginner
        );
        phaseCourses.push(
          ...coursesByLevel.beginner.slice(
            beginnerIndex,
            beginnerIndex + beginnerCount
          )
        );
        beginnerIndex += beginnerCount;

        const intermediateCount = Math.min(
          coursesPerPhase - phaseCourses.length,
          coursesByLevel.intermediate.length - intermediateIndex
        );
        phaseCourses.push(
          ...coursesByLevel.intermediate.slice(
            intermediateIndex,
            intermediateIndex + intermediateCount
          )
        );
        intermediateIndex += intermediateCount;
      } else {
        // Late-middle phases: Mix intermediate + advanced
        const intermediateCount = Math.min(
          Math.floor(coursesPerPhase * 0.6),
          coursesByLevel.intermediate.length - intermediateIndex
        );
        phaseCourses.push(
          ...coursesByLevel.intermediate.slice(
            intermediateIndex,
            intermediateIndex + intermediateCount
          )
        );
        intermediateIndex += intermediateCount;

        const advancedCount = Math.min(
          coursesPerPhase - phaseCourses.length,
          coursesByLevel.advanced.length - advancedIndex
        );
        phaseCourses.push(
          ...coursesByLevel.advanced.slice(
            advancedIndex,
            advancedIndex + advancedCount
          )
        );
        advancedIndex += advancedCount;
      }
    }

    if (phaseCourses.length === 0) break;

    // Calculate phase duration
    const totalPhaseHours = phaseCourses.reduce(
      (sum, rec) => sum + (rec.estimatedHours || 0),
      0
    );
    const weeksForPhase = calculateWeeksForPhase(
      totalPhaseHours,
      preferences.weeklyStudyHours
    );

    // Generate phase description (title and rationale will be added by AI later)
    const phaseDescription = generatePhaseDescription(
      phaseCourses,
      preferences
    );

    // Format estimated time dynamically based on duration
    const estimatedTime = formatEstimatedTime(weeksForPhase);

    phases.push({
      title: "", // Will be filled by AI generation
      description: phaseDescription,
      phaseRationale: "", // Will be filled by AI generation
      order: phaseNum,
      estimatedWeeks: weeksForPhase,
      estimatedDays: Math.ceil(weeksForPhase * 7),
      estimatedTime: estimatedTime, // Human-readable format
      totalHours: Math.round(totalPhaseHours),
      courses: phaseCourses.map((rec, idx) => ({
        courseId: rec.courseId,
        reason: rec.reason,
        order: idx + 1,
        matchScore: rec.matchScore,
        estimatedHours: rec.estimatedHours,
      })),
      // Store phase info for AI generation (temporary, will be used by generatePhaseRationales)
      _tempPhaseInfo: {
        phaseNum,
        totalPhases: phaseCount,
        primaryLevel: phaseCourses[0]?.course?.level || "beginner",
        courseCount: phaseCourses.length,
      },
    });
  }

  return phases;
}

/**
 * Calculate optimal number of phases based on timeline and course count
 */
function calculatePhaseCount(
  targetCompletionTime,
  weeklyStudyHours,
  totalCourses
) {
  // Base phase count on timeline
  const phaseMap = {
    "1-month": Math.min(2, totalCourses),
    "3-months": Math.min(3, Math.ceil(totalCourses / 2)),
    "6-months": Math.min(4, Math.ceil(totalCourses / 2)),
    "1-year+": Math.min(5, Math.ceil(totalCourses / 2)),
  };

  return phaseMap[targetCompletionTime] || 3;
}

/**
 * Calculate estimated weeks for a phase based on total hours and weekly study commitment
 */
function calculateWeeksForPhase(totalHours, weeklyStudyHours) {
  const hoursPerWeek =
    {
      "1-3": 2,
      "4-7": 5.5,
      "8-15": 11.5,
      "15+": 20,
    }[weeklyStudyHours] || 5;

  return Math.ceil(totalHours / hoursPerWeek);
}

/**
 * Format estimated time in human-readable format (days/weeks/months)
 */
function formatEstimatedTime(weeks) {
  if (weeks < 1) {
    const days = Math.ceil(weeks * 7);
    return `${days} ngày`;
  } else if (weeks === 1) {
    return "1 tuần";
  } else if (weeks < 4) {
    return `${weeks} tuần`;
  } else if (weeks < 8) {
    const months = Math.round(weeks / 4);
    return months === 1 ? "1 tháng" : `${months} tháng`;
  } else {
    const months = Math.round(weeks / 4);
    return `${months} tháng`;
  }
}

/**
 * Generate descriptive title for a phase (DEPRECATED - now using AI)
 */
function generatePhaseTitle(phaseNum, courses, preferences) {
  const levels = [...new Set(courses.map((c) => c.course.level))];
  const primaryLevel = levels[0];

  const levelMap = {
    beginner: "Nền Tảng Cơ Bản",
    intermediate: "Phát Triển Kỹ Năng",
    advanced: "Nâng Cao Chuyên Môn",
    expert: "Chuyên Gia",
  };

  return `Giai Đoạn ${phaseNum}: ${levelMap[primaryLevel] || "Học Tập"}`;
}

/**
 * Generate description for a phase based on courses included
 */
function generatePhaseDescription(courses, preferences) {
  const skillSet = new Set();
  courses.forEach((rec) => {
    rec.course.categoryIds?.forEach((cat) => {
      if (cat.name) skillSet.add(cat.name);
    });
  });

  const skills = Array.from(skillSet).slice(0, 3).join(", ");
  return `Tập trung vào ${skills}${
    skillSet.size > 3 ? " và nhiều hơn nữa" : ""
  }. Hoàn thành ${courses.length} khóa học để tiến lên giai đoạn tiếp theo.`;
}

/**
 * Calculate learning path summary
 */
function calculatePathSummary(recommendations, courses, totalPhases = 0) {
  const coursesMap = new Map(courses.map((c) => [c._id.toString(), c]));

  const totalEstimatedHours = recommendations.reduce((total, rec) => {
    return total + (rec.estimatedHours || 0);
  }, 0);

  const allCategories = new Set();
  const levels = new Set();

  recommendations.forEach((rec) => {
    const course = coursesMap.get(rec.courseId.toString());
    if (course) {
      course.categoryIds?.forEach((cat) => {
        allCategories.add(cat._id ? cat._id.toString() : cat.toString());
      });
      if (course.level) {
        levels.add(course.level);
      }
    }
  });

  let levelProgression = "mixed";
  if (levels.size === 1) {
    const onlyLevel = Array.from(levels)[0];
    levelProgression = `${onlyLevel}-only`;
  } else if (levels.has("beginner") && levels.has("intermediate")) {
    levelProgression = "beginner-to-intermediate";
  } else if (levels.has("intermediate") && levels.has("advanced")) {
    levelProgression = "intermediate-to-advanced";
  }

  return {
    totalCourses: recommendations.length,
    totalEstimatedHours: Math.round(totalEstimatedHours),
    totalPhases: totalPhases,
    skillsCovered: Array.from(allCategories),
    levelProgression,
  };
}

/**
 * Validate and normalize frontend-provided learning path payload.
 * Returns { valid: boolean, errors: [{field,message}], normalized: {...}, warnings: [] }
 */
async function validateAndNormalizePayload(payload) {
  const errors = [];
  const warnings = [];

  // Basic types
  if (payload.pathTitle && typeof payload.pathTitle !== "string") {
    errors.push({ field: "pathTitle", message: "must be a string" });
  }

  if (payload.learningGoal && typeof payload.learningGoal !== "string") {
    errors.push({ field: "learningGoal", message: "must be a string" });
  }

  // phases validation
  const phases = Array.isArray(payload.phases) ? payload.phases : [];

  if (phases.length === 0) {
    // it's acceptable for FE to not provide phases, but warn
    warnings.push(
      "No phases provided: result will contain empty phases array."
    );
  }

  const normalizedPhases = [];

  for (let pIndex = 0; pIndex < phases.length; pIndex++) {
    const p = phases[pIndex] || {};
    const title = p.title || p.phaseName || null;
    const description = p.description || p.phaseDescription || "";
    const phaseRationale = p.phaseRationale || ""; // Accept phaseRationale from FE
    const order = typeof p.order === "number" ? p.order : pIndex + 1;

    if (!title) {
      errors.push({ field: `phases[${pIndex}].title`, message: "required" });
    }

    const steps = Array.isArray(p.steps) ? p.steps : [];
    const normalizedSteps = [];

    for (let sIndex = 0; sIndex < steps.length; sIndex++) {
      const s = steps[sIndex] || {};
      const sTitle = s.title || null;
      const sOrder = typeof s.order === "number" ? s.order : sIndex + 1;
      const sCourseId = s.courseId || null;

      if (!sTitle) {
        errors.push({
          field: `phases[${pIndex}].steps[${sIndex}].title`,
          message: "required",
        });
      }

      // If courseId exists, validate that it's a valid ObjectId format
      if (sCourseId) {
        if (!mongoose.Types.ObjectId.isValid(sCourseId)) {
          warnings.push(
            `phases[${pIndex}].steps[${sIndex}].courseId is not a valid id and will be ignored`
          );
        }
      }

      normalizedSteps.push({
        title: sTitle,
        description: s.description || "",
        courseId: mongoose.Types.ObjectId.isValid(sCourseId) ? sCourseId : null,
        order: sOrder,
      });
    }

    normalizedPhases.push({
      title,
      description,
      phaseRationale, // Include phaseRationale in normalized payload
      order,
      steps: normalizedSteps,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      pathTitle: payload.pathTitle || "",
      learningGoal: payload.learningGoal || "",
      preferredTopics: Array.isArray(payload.preferredTopics)
        ? payload.preferredTopics
        : [],
      phases: normalizedPhases,
    },
    warnings,
  };
}

/**
 * Build learningPath object (in-memory) from normalized payload.
 * This does not persist courses; courseIds remain as provided (ObjectId strings).
 */
function buildLearningPathFromPayload(normalized) {
  // Aggregate recommendedCourses from phases' steps that include courseId
  const recommendedCourses = [];
  const courseIdSet = new Set();

  normalized.phases.forEach((phase, pIndex) => {
    phase.steps.forEach((step, sIndex) => {
      if (step.courseId) {
        const key = step.courseId.toString();
        if (!courseIdSet.has(key)) {
          courseIdSet.add(key);
          recommendedCourses.push({
            courseId: step.courseId,
            reason: step.description || "",
            priority: recommendedCourses.length + 1,
            matchScore: 0,
            estimatedHours: 0,
          });
        }
      }
    });
  });

  const pathSummary = {
    totalCourses: recommendedCourses.length,
    totalEstimatedHours: recommendedCourses.reduce(
      (t, r) => t + (r.estimatedHours || 0),
      0
    ),
    levelProgression: "mixed",
  };

  return { recommendedCourses, pathSummary };
}

/**
 * Populate each phase's course entries with full Course documents for response.
 * Returns phases where each course object in courses[] has courseId populated as full object.
 */
async function populatePhasesCourses(phases) {
  // Collect all courseIds
  const courseIds = [];
  phases.forEach((p) => {
    p.steps.forEach((s) => {
      if (s.courseId) courseIds.push(s.courseId);
    });
  });

  // Query courses in bulk
  const uniqueIds = Array.from(new Set(courseIds.map((id) => id.toString())));
  const courses = await Course.find({ _id: { $in: uniqueIds } })
    .select(
      "title subTitle thumbnail level duration price rating categoryIds detail"
    )
    .populate("categoryIds", "name icon")
    .lean();

  const courseMap = new Map(courses.map((c) => [c._id.toString(), c]));

  // Build phases with courses array in FE-expected shape
  const outPhases = phases.map((p) => {
    const coursesArr = p.steps
      .filter((s) => s.courseId && courseMap.has(s.courseId.toString()))
      .map((s, idx) => {
        const courseObj = courseMap.get(s.courseId.toString());
        return {
          courseId: courseObj,
          matchScore: 0,
          reason: s.description || "",
          estimatedHours: parseDuration(courseObj.duration),
          priority: idx + 1,
        };
      });

    return {
      phaseName: p.title,
      title: p.title,
      phaseDescription: p.description,
      description: p.description,
      phaseRationale: p.phaseRationale || "", // Include phase rationale from payload
      totalHours: coursesArr.reduce((t, c) => t + (c.estimatedHours || 0), 0),
      courses: coursesArr,
    };
  });

  return outPhases;
}
