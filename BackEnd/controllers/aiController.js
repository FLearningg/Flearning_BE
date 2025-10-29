require("dotenv").config(); // Load environment variables

const mongoose = require("mongoose");
const { generateQuizQuestions } = require("../services/openRouterService");

const MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

// Use dynamic import for node-fetch
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

/**
 * POST /api/ai/explain-quiz
 * Generate explanations for quiz questions based on user's quiz result
 *
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.quizId - MongoDB ObjectId of the quiz
 * @param {string} req.body.userId - MongoDB ObjectId of the user
 * @param {Object} req.body.quizResult - Complete quiz result object
 * @param {number} req.body.quizResult.score - Score percentage (0-100)
 * @param {number} req.body.quizResult.correctAnswers - Count of correct answers
 * @param {number} req.body.quizResult.totalQuestions - Total questions
 * @param {boolean} req.body.quizResult.passed - Whether quiz was passed
 * @param {Array} req.body.quizResult.questionResults - Per-question results
 * @param {Object} req.body.quizResult.details - Detailed question information
 */
exports.explainQuiz = async (req, res) => {
  try {
    const { quizId, userId, quizData, quizResult } = req.body;
    const authenticatedUserId = req.user.id;

    // Validation
    const validationErrors = validateExplainQuizRequest({
      quizId,
      userId,
      quizResult,
      authenticatedUserId,
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid request data",
        errors: validationErrors,
      });
    }

    // Verify user can only access their own quiz explanations
    if (userId !== authenticatedUserId) {
      return res.status(403).json({
        success: false,
        message: "You can only access explanations for your own quiz attempts",
      });
    }

    // Extract question details - prioritize quizData.questions (complete frontend data)
    const questionDetails =
      quizData?.questions ||                    // 1. Complete data from frontend (preferred)
      quizResult.details?.questionResults ||    // 2. Fallback: from database details
      quizResult.questionResults ||             // 3. Fallback: from database root
      [];
      

    if (!Array.isArray(questionDetails) || questionDetails.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No question details found in quiz result",
      });
    }

    // Build prompt for AI
    const prompt = buildExplanationPrompt(questionDetails);
    console.log("🔍 AI prompt preview:", prompt.substring(0, 500) + "...");
    console.log("🔍 Question details count:", questionDetails.length);
    console.log("🔍 First question sample:", questionDetails[0] ? {
      questionText: questionDetails[0].questionText || questionDetails[0].questionContent,
      userAnswerText: questionDetails[0].userAnswerText,
      correctAnswerText: questionDetails[0].correctAnswerText,
      isCorrect: questionDetails[0].isCorrect
    } : "No questions");

    // Call Gemini API
    console.log("🔍 Gemini API Key exists:", !!process.env.GEMINI_API_KEY);
    console.log("🔍 Gemini API URL:", GEMINI_API_URL.replace(process.env.GEMINI_API_KEY || '', '[HIDDEN]'));
    const explanations = await generateExplanationsFromAI(
      prompt,
      questionDetails
    );

    const responseData = {
      explanations,
      meta: {
        model: MODEL,
        questionsCount: questionDetails.length,
        generatedAt: new Date().toISOString(),
      },
    };

    res.status(200).json({
      success: true,
      message: "Explanations generated successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("🚨 AI explainQuiz error:", error);
    console.error("🚨 Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      message: "Failed to generate AI explanations",
      error: error.message,
    });
  }
};

/**
 * Validate the request body for explainQuiz endpoint
 */
function validateExplainQuizRequest({
  quizId,
  userId,
  quizResult,
  authenticatedUserId,
}) {
  const errors = [];

  // Check required fields
  if (!quizId) {
    errors.push("quizId is required");
  } else if (!mongoose.Types.ObjectId.isValid(quizId)) {
    errors.push("quizId must be a valid MongoDB ObjectId");
  }

  if (!userId) {
    errors.push("userId is required");
  } else if (!mongoose.Types.ObjectId.isValid(userId)) {
    errors.push("userId must be a valid MongoDB ObjectId");
  }

  if (!quizResult) {
    errors.push("quizResult object is required");
  } else {
    // Validate quizResult structure
    if (quizResult.score === undefined || quizResult.score === null) {
      errors.push("quizResult.score is required");
    } else if (typeof quizResult.score !== "number") {
      errors.push("quizResult.score must be a number");
    }

    if (
      quizResult.correctAnswers === undefined ||
      quizResult.correctAnswers === null
    ) {
      errors.push("quizResult.correctAnswers is required");
    }

    if (
      quizResult.totalQuestions === undefined ||
      quizResult.totalQuestions === null
    ) {
      errors.push("quizResult.totalQuestions is required");
    }

    if (quizResult.passed === undefined || quizResult.passed === null) {
      errors.push("quizResult.passed is required");
    }
  }

  return errors;
}

/**
 * Build prompt for AI to generate explanations
 */
function buildExplanationPrompt(questionDetails) {
  const questionPrompts = questionDetails
    .map((q, index) => {
      // Handle both formats: frontend questionsForAI and database questionResults
      let questionText, userAnswer, correctAnswer, isCorrect;

      if (q.questionText) {
        // Frontend questionsForAI format
        questionText = q.questionText;
        userAnswer = q.userAnswerText || "Not answered";
        correctAnswer = q.correctAnswerText || "N/A";
        isCorrect = q.isCorrect || false;
      } else {
        // Database questionResults format (fallback)
        questionText = q.questionContent || `Question ${index + 1}`;
        
        userAnswer = "Not answered";
        if (q.userAnswers && q.userAnswers.length > 0 && q.userAnswers[0].content) {
          userAnswer = q.userAnswers[0].content;
        }

        correctAnswer = "N/A";
        if (q.correctAnswers && q.correctAnswers.length > 0 && q.correctAnswers[0].content) {
          correctAnswer = q.correctAnswers[0].content;
        }

        isCorrect = q.isCorrect || false;
      }


      return `Q${index + 1}: ${questionText}
User: ${userAnswer}
Correct: ${correctAnswer}
Result: ${isCorrect ? 'Correct' : 'Wrong'}`;
    })
    .join("\n\n");

  return `${questionPrompts}

IMPORTANT INSTRUCTIONS:
For each question above, provide a brief and clear explanation (1-2 sentences) that:
1. ALWAYS explain why the correct answer is correct - what concept or principle makes it the right choice
2. If the user answer is WRONG - explain why their answer is incorrect and what misconception they might have
3. Provide key concepts or principles related to the question
4. Give practical examples or tips to remember this concept
5. Suggest how to approach similar questions in the future

Be encouraging and supportive. Use simple, clear language that a student can understand.

Return ONLY a valid JSON array with this exact structure for each question:
[
  {
    "questionIndex": 0,
    "questionText": "Question text here",
    "isCorrect": true/false,
    "userAnswerText": "User's answer",
    "correctAnswerText": "Correct answer",
    "explanation": "Your detailed educational explanation here"
  }
]

Important: Return ONLY valid JSON, no markdown, no code blocks, no extra text outside the JSON array.`;
}

/**
 * Call Gemini API to generate explanations
 */
async function generateExplanationsFromAI(prompt, questionDetails) {
  try {
    const requestBody = {
      systemInstruction: {
        parts: [
          {
            text: `You are an expert educational tutor. Your role is to provide thorough, encouraging, and understandable explanations for quiz questions to help students learn.

For each question:
1. If the student's answer is CORRECT:
   - Congratulate them
   - Explain WHY this answer is correct
   - Reinforce the key concept or principle
   - Give a real-world example or analogy
   - Provide a tip to remember this concept

2. If the student's answer is WRONG:
   - Be supportive and encouraging
   - Clearly explain why their answer is incorrect
   - Identify the misconception they might have
   - Explain WHY the correct answer is correct
   - Give context and examples
   - Provide a memory aid or technique to avoid this mistake

3. Always:
   - Use simple, clear language that a student can understand
   - Focus on building understanding, not just giving answers
   - Make explanations engaging and relatable
   - Be positive and constructive

CRITICAL: You MUST return ONLY a valid JSON array. No markdown formatting. No code blocks. No text outside the JSON array. Keep explanations short (max 50 words each).`,
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        maxOutputTokens: 16384, // Increased for longer responses
        responseMimeType: "application/json",
      },
    };


    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
    }

    const result = await response.json();

    // Extract and parse the AI response
    const explanations = parseAIResponse(result, questionDetails);

    return explanations;
  } catch (error) {
    console.error("🚨 generateExplanationsFromAI error:", error);
    console.error("🚨 Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw error;
  }
}

/**
 * Parse and validate the AI response
 */
function parseAIResponse(response, questionDetails) {
  try {
    // Extract text from response
    if (
      !response.candidates ||
      !response.candidates[0]?.content?.parts[0]?.text
    ) {
      console.error("🚨 Invalid Gemini response structure:", JSON.stringify(response, null, 2));
      return createFallbackExplanations(questionDetails);
    }

    const responseText = response.candidates[0].content.parts[0].text;

    // Parse JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("🚨 Failed to parse AI response as JSON:", parseError);
      console.error("🚨 Raw response text length:", responseText.length);
      
      // Try to fix truncated JSON
      let fixedJson = responseText;
      
      // If JSON is truncated, try to close it properly
      if (parseError.message.includes("Unterminated string") || parseError.message.includes("Unexpected end")) {
        console.log("🔧 Attempting to fix truncated JSON...");
        
        // Find the last complete object
        const lastCompleteObjectMatch = fixedJson.match(/.*}(?=\s*,?\s*\{)/g);
        if (lastCompleteObjectMatch) {
          const lastCompleteIndex = fixedJson.lastIndexOf(lastCompleteObjectMatch[lastCompleteObjectMatch.length - 1]) + lastCompleteObjectMatch[lastCompleteObjectMatch.length - 1].length;
          fixedJson = fixedJson.substring(0, lastCompleteIndex) + "\n]";
          console.log("🔧 Fixed JSON by truncating to last complete object");
        } else {
          // Try to close the current object and array
          fixedJson = fixedJson.replace(/,?\s*$/, '') + '"}]';
          console.log("🔧 Fixed JSON by closing current object");
        }
      }
      
      try {
        parsedResponse = JSON.parse(fixedJson);
        console.log("✅ Successfully parsed fixed JSON with", parsedResponse.length, "items");
      } catch (fixError) {
        console.error("🚨 Failed to parse fixed JSON:", fixError);
        // Try to extract JSON array from the response
        const jsonMatch = responseText.match(/\[[\s\S]*?\}(?=\s*,?\s*\{|\s*\])/g);
        if (jsonMatch && jsonMatch.length > 0) {
          console.log("🔧 Found partial JSON, extracting valid objects...");
          const validObjects = [];
          for (const match of jsonMatch) {
            try {
              const obj = JSON.parse(match + '}');
              validObjects.push(obj);
            } catch (e) {
              // Skip invalid objects
            }
          }
          if (validObjects.length > 0) {
            parsedResponse = validObjects;
            console.log("✅ Extracted", validObjects.length, "valid objects from partial JSON");
          } else {
            throw new Error("Could not extract valid JSON from AI response");
          }
        } else {
          throw new Error("Could not extract valid JSON from AI response");
        }
      }
    }

    // Validate and format response
    if (!Array.isArray(parsedResponse)) {
      throw new Error("AI response is not a JSON array");
    }

    // Map AI response to expected format - handle both frontend and database formats
    const explanations = parsedResponse.map((item, index) => {
      const questionDetail = questionDetails[index];
      
      // Handle both formats: frontend questionsForAI and database questionResults
      let questionText, userAnswerText, correctAnswerText, isCorrect;

      if (questionDetail?.questionText) {
        // Frontend questionsForAI format
        questionText = questionDetail.questionText;
        userAnswerText = questionDetail.userAnswerText || "Not answered";
        correctAnswerText = questionDetail.correctAnswerText || "N/A";
        isCorrect = questionDetail.isCorrect || false;
      } else {
        // Database questionResults format (fallback)
        questionText = questionDetail?.questionContent || item.questionText || `Question ${index + 1}`;
        
        userAnswerText = item.userAnswerText ?? "Not provided";
        if (questionDetail?.userAnswers && questionDetail.userAnswers.length > 0) {
          userAnswerText = questionDetail.userAnswers[0].content;
        }
        
        correctAnswerText = item.correctAnswerText ?? "Not provided";
        if (questionDetail?.correctAnswers && questionDetail.correctAnswers.length > 0) {
          correctAnswerText = questionDetail.correctAnswers[0].content;
        }

        isCorrect = questionDetail?.isCorrect ?? item.isCorrect ?? false;
      }

      return {
        questionIndex: questionDetail?.questionIndex ?? index,
        originalIndex: questionDetail?.originalIndex, // Include originalIndex for reference
        questionId: questionDetail?.questionId || item.questionId,
        questionText: questionText,
        isCorrect: isCorrect,
        userAnswerText: userAnswerText,
        correctAnswerText: correctAnswerText,
        explanation: item.explanation || "No explanation available for this question.",
      };
    });

    return explanations;
  } catch (error) {
    console.error("🚨 parseAIResponse error:", error);
    console.error("🚨 Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return createFallbackExplanations(questionDetails);
  }
}

/**
 * Create fallback explanations when AI fails
 */
function createFallbackExplanations(questionDetails) {
  return questionDetails.map((q, index) => {
    // Handle both formats: frontend questionsForAI and database questionResults
    let questionText, userAnswerText, correctAnswerText, isCorrect;

    if (q.questionText) {
      // Frontend questionsForAI format
      questionText = q.questionText;
      userAnswerText = q.userAnswerText || "Not answered";
      correctAnswerText = q.correctAnswerText || "N/A";
      isCorrect = q.isCorrect || false;
    } else {
      // Database questionResults format (fallback)
      questionText = q.questionContent || `Question ${index + 1}`;
      
      userAnswerText = "Not answered";
      if (q.userAnswers && q.userAnswers.length > 0 && q.userAnswers[0].content) {
        userAnswerText = q.userAnswers[0].content;
      }

      correctAnswerText = "N/A";
      if (q.correctAnswers && q.correctAnswers.length > 0 && q.correctAnswers[0].content) {
        correctAnswerText = q.correctAnswers[0].content;
      }

      isCorrect = q.isCorrect || false;
    }

    return {
      questionIndex: q.questionIndex ?? index,
      originalIndex: q.originalIndex, // Include originalIndex for reference
      questionId: q.questionId,
      questionText: questionText,
      isCorrect: isCorrect,
      userAnswerText: userAnswerText,
      correctAnswerText: correctAnswerText,
      explanation:
        "Explanation generation is currently unavailable. Please try again later.",
    };
  });
}

/**
 * POST /api/ai/generate-quiz
 * Generate quiz questions using AI based on topic and parameters
 */
exports.generateQuiz = async (req, res) => {
  try {
    const {
      topic,
      lessonContent,
      numberOfQuestions = 5,
      difficulty = 'medium',
      questionType = 'multiple-choice',
      courseId,
      lessonId,
      title,
      description
    } = req.body;

    const authenticatedUserId = req.user.id;

    // Validation
    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Topic is required for quiz generation"
      });
    }

    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        message: "Valid courseId is required"
      });
    }

    if (numberOfQuestions < 1 || numberOfQuestions > 50) {
      return res.status(400).json({
        success: false,
        message: "Number of questions must be between 1 and 50"
      });
    }

    const validDifficulties = ['easy', 'medium', 'hard'];
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        success: false,
        message: "Difficulty must be one of: easy, medium, hard"
      });
    }

    console.log("🤖 Generating quiz with AI...");
    console.log("📝 Parameters:", { topic, numberOfQuestions, difficulty, questionType });

    // Generate questions using OpenRouter AI
    const questions = await generateQuizQuestions({
      topic,
      lessonContent,
      numberOfQuestions,
      difficulty,
      questionType
    });

    console.log(`✅ Generated ${questions.length} questions`);

    // Create quiz object (but don't save to database yet - let instructor review first)
    const quizData = {
      courseId,
      lessonId: lessonId || null,
      userId: authenticatedUserId,
      title: title || `Quiz: ${topic}`,
      description: description || `AI-generated quiz about ${topic}`,
      questions: questions,
      questionPoolSize: questions.length, // Show all questions by default
      roleCreated: 'instructor'
    };

    // Return the generated quiz for instructor to review and edit
    res.status(200).json({
      success: true,
      message: "Quiz generated successfully. Please review and edit before saving.",
      data: {
        quiz: quizData,
        meta: {
          generatedAt: new Date().toISOString(),
          questionsCount: questions.length,
          difficulty,
          topic
        }
      }
    });

  } catch (error) {
    console.error("🚨 AI generateQuiz error:", error);
    console.error("🚨 Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    res.status(500).json({
      success: false,
      message: "Failed to generate quiz with AI",
      error: error.message
    });
  }
};
