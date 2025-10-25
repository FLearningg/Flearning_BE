require("dotenv").config(); // Load environment variables

const mongoose = require("mongoose");

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

    console.log(`Generating explanations for quiz ${quizId} by user ${userId}`);

    // Extract question details from quizData.questions or quizResult
    const questionDetails =
      quizData?.questions ||
      quizResult.details?.questionResults ||
      quizResult.questionResults ||
      [];

    if (!Array.isArray(questionDetails) || questionDetails.length === 0) {

    // Call Gemini API with streaming capability
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
    console.error("Error in explainQuiz:", error);
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
      // Handle both structures: quizData.questions and quizResult.questionResults
      const questionText = q.questionText || `Question ${index + 1}`;

      // Get user answer - handle both structures
      let userAnswer = "Not answered";
      if (q.userAnswer !== undefined) {
        // From quizData.questions: userAnswer is the index
        userAnswer =
          q.options?.[q.userAnswer]?.content || `Option ${q.userAnswer}`;
      } else if (q.userAnswers?.[0]?.content) {
        // From quizResult.questionResults
        userAnswer = q.userAnswers[0].content;
      }

      // Get correct answer - handle both structures
      let correctAnswer = "N/A";
      if (q.correctAnswer !== undefined) {
        // From quizData.questions: correctAnswer is the index
        correctAnswer =
          q.options?.[q.correctAnswer]?.content || `Option ${q.correctAnswer}`;
      } else if (q.correctAnswers?.[0]?.content) {
        // From quizResult.questionResults
        correctAnswer = q.correctAnswers[0].content;
      }

      // Determine if correct
      const isCorrect = q.userAnswer === q.correctAnswer || q.isCorrect;

      return `${questionText}
User's Answer: ${userAnswer}
Correct Answer: ${correctAnswer}
Is Correct: ${isCorrect}`;
    })
    .join("\n\n");

  return `${questionPrompts}

For each question above, generate a clear and educational explanation (2-3 sentences) about:
1. Why the answer is correct or incorrect
2. Key concepts to understand
3. Tips for similar questions

Return ONLY a valid JSON array with this exact structure for each question:
[
  {
    "questionIndex": 0,
    "questionText": "Question text here",
    "isCorrect": true/false,
    "userAnswerText": "User's answer",
    "correctAnswerText": "Correct answer",
    "explanation": "Your educational explanation here"
  }
]

Important: Return ONLY valid JSON, no markdown or extra text.`;
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
            text: `You are an expert educational AI assistant. Your role is to provide clear, positive, and educational explanations for quiz questions.
For each question, explain:
1. Why the selected answer was correct or incorrect
2. The key concept being tested
3. Helpful tips for understanding similar questions

Always be encouraging and constructive in your explanations. Keep responses concise (2-3 sentences max).
IMPORTANT: You MUST return ONLY a valid JSON array. No markdown formatting. No code blocks. No extra text.`,
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
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    };

    console.log("Calling Gemini API...");

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

    console.log("Gemini API response received");

    // Extract and parse the AI response
    const explanations = parseAIResponse(result, questionDetails);

    return explanations;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
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
      console.error("Invalid Gemini response structure:", response);
      return createFallbackExplanations(questionDetails);
    }

    const responseText = response.candidates[0].content.parts[0].text;
    console.log("AI Response text:", responseText);

    // Parse JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not extract valid JSON from AI response");
      }
    }

    // Validate and format response
    if (!Array.isArray(parsedResponse)) {
      throw new Error("AI response is not a JSON array");
    }

    // Map AI response to expected format and replace questionText with actual question
    const explanations = parsedResponse.map((item, index) => {
      // Get actual isCorrect value from questionDetails if available
      let isCorrect = item.isCorrect ?? false;
      if (questionDetails[index]) {
        // From quizData.questions: compare userAnswer with correctAnswer
        if (
          questionDetails[index].userAnswer !== undefined &&
          questionDetails[index].correctAnswer !== undefined
        ) {
          isCorrect =
            questionDetails[index].userAnswer ===
            questionDetails[index].correctAnswer;
        }
        // From quizResult: use isCorrect directly
        else if (questionDetails[index].isCorrect !== undefined) {
          isCorrect = questionDetails[index].isCorrect;
        }
      }

      return {
        questionIndex: item.questionIndex ?? index,
        questionId: questionDetails[index]?.questionId || item.questionId,
        questionText:
          questionDetails[index]?.questionText ||
          item.questionText ||
          `Question ${index + 1}`,
        isCorrect: isCorrect,
        userAnswerText: item.userAnswerText ?? "Not provided",
        correctAnswerText: item.correctAnswerText ?? "Not provided",
        explanation:
          item.explanation || "No explanation available for this question.",
      };
    });

    return explanations;
  } catch (error) {
    console.error("Error parsing AI response:", error);
    return createFallbackExplanations(questionDetails);
  }
}

/**
 * Create fallback explanations when AI fails
 */
function createFallbackExplanations(questionDetails) {
  return questionDetails.map((q, index) => {
    // Get user answer text - handle both structures
    let userAnswerText = "Not answered";
    if (q.userAnswer !== undefined && q.options) {
      // From quizData.questions: userAnswer is the index
      userAnswerText =
        q.options[q.userAnswer]?.content || `Option ${q.userAnswer}`;
    } else if (q.userAnswers?.[0]?.content) {
      // From quizResult.questionResults
      userAnswerText = q.userAnswers[0].content;
    }

    // Get correct answer text - handle both structures
    let correctAnswerText = "N/A";
    if (q.correctAnswer !== undefined && q.options) {
      // From quizData.questions: correctAnswer is the index
      correctAnswerText =
        q.options[q.correctAnswer]?.content || `Option ${q.correctAnswer}`;
    } else if (q.correctAnswers?.[0]?.content) {
      // From quizResult.questionResults
      correctAnswerText = q.correctAnswers[0].content;
    }

    return {
      questionIndex: index,
      questionId: q.questionId,
      questionText: q.questionText || `Question ${index + 1}`,
      isCorrect: q.userAnswer === q.correctAnswer || (q.isCorrect ?? false),
      userAnswerText: userAnswerText,
      correctAnswerText: correctAnswerText,
      explanation:
        "Explanation generation is currently unavailable. Please try again later.",
    };
  });
}
