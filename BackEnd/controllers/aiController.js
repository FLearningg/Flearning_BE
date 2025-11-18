require("dotenv").config(); // Load environment variables

const mongoose = require("mongoose");
const { generateQuizQuestions, gradeEssayAnswer } = require("../services/openRouterService");
const NodeCache = require("node-cache");
const crypto = require("crypto");
const StudentQuizResult = require("../models/StudentQuizResult");
const axios = require("axios");

// OpenRouter configuration for Quiz AI (explain quiz)
const QUIZAI_API_KEY = process.env.QUIZAI_API_KEY;
const QUIZAI_BASE_URL = process.env.QUIZAI_BASE_URL || 'https://ai.121628.xyz/v1/chat/completions';
const QUIZAI_MODEL = process.env.QUIZAI_MODEL || 'gemini-2.0-flash';

// Legacy Gemini config (for backward compatibility if needed)
const MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

// Separate configuration for summarization
const SUMMARIZATION_MODEL = process.env.SUMMARIZATION_MODEL || "gemini-2.0-flash";
const SUMMARIZATION_API_KEY = process.env.GEMINI_SUMMARIZATION_API_KEY || process.env.GEMINI_API_KEY;
const SUMMARIZATION_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${SUMMARIZATION_MODEL}:generateContent?key=${SUMMARIZATION_API_KEY}`;
const parsedSummarizationMaxTokens = parseInt(process.env.SUMMARIZATION_MAX_OUTPUT_TOKENS, 10);
const SUMMARIZATION_MAX_OUTPUT_TOKENS =
  Number.isFinite(parsedSummarizationMaxTokens) && parsedSummarizationMaxTokens > 0
    ? Math.min(parsedSummarizationMaxTokens, 8192)
    : 2048;

// Cache configuration for summarization
const SUMMARIZATION_CACHE_TTL = process.env.SUMMARIZATION_CACHE_TTL || 3600; // 1 hour default
const summarizationCache = new NodeCache({ 
  stdTTL: SUMMARIZATION_CACHE_TTL,
  checkperiod: 600 // Check for expired keys every 10 minutes
});

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

    // Call Gemini API
    const explanations = await generateExplanationsFromAI(
      prompt,
      questionDetails
    );

    const responseData = {
      explanations,
      meta: {
        model: QUIZAI_MODEL,
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
 * Call OpenRouter API to generate explanations
 */
async function generateExplanationsFromAI(prompt, questionDetails) {
  try {
    const systemPrompt = `You are an expert educational tutor. Your role is to provide thorough, encouraging, and understandable explanations for quiz questions to help students learn.

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

CRITICAL: You MUST return ONLY a valid JSON array. No markdown formatting. No code blocks. No text outside the JSON array. Keep explanations short (max 50 words each).`;

    const response = await axios.post(
      QUIZAI_BASE_URL,
      {
        model: QUIZAI_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 16000,
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Authorization': `Bearer ${QUIZAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Extract content from OpenRouter response
    const content = response.data.choices[0].message.content;

    // Parse JSON response
    let parsedResponse;
    try {
      // OpenRouter might return the array directly or wrapped in an object
      const parsed = JSON.parse(content);
      parsedResponse = Array.isArray(parsed) ? parsed : (parsed.explanations || parsed.questions || []);
    } catch (parseError) {
      console.error("🚨 Failed to parse OpenRouter response as JSON:", parseError);
      console.error("🚨 Raw response:", content);
      return createFallbackExplanations(questionDetails);
    }

    // Validate and format response
    if (!Array.isArray(parsedResponse)) {
      console.error("🚨 OpenRouter response is not a JSON array");
      return createFallbackExplanations(questionDetails);
    }

    // Map AI response to expected format
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
        originalIndex: questionDetail?.originalIndex,
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
    console.error("🚨 generateExplanationsFromAI error:", error);
    console.error("🚨 Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Fallback to create basic explanations
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

/**
 * POST /api/ai/summarize-video
 * Generate summary for video content from Firebase Storage URL
 *
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.materialUrl - Firebase Storage URL of the video
 * @param {string} req.body.materialId - Optional material ID for reference
 */
exports.summarizeVideo = async (req, res) => {
  try {
    const { materialUrl, materialId } = req.body;
    const authenticatedUserId = req.user.id;

    // Validation
    const validationErrors = validateSummarizeVideoRequest({ materialUrl });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid request data",
        errors: validationErrors,
      });
    }

    // Generate cache key based on material URL
    const cacheKey = generateCacheKey('video', materialUrl);
    
    // Check cache first
    const cachedSummary = summarizationCache.get(cacheKey);
    if (cachedSummary) {
      return res.status(200).json({
        success: true,
        message: "Video summary retrieved from cache",
        data: {
          ...cachedSummary,
          cached: true,
          cacheKey
        },
      });
    }


    // Generate summary using Gemini multimodal API
    const summary = await generateVideoSummary(materialUrl);

    // Cache the result
    const responseData = {
      summary,
      materialUrl,
      materialId,
      meta: {
        model: SUMMARIZATION_MODEL,
        generatedAt: new Date().toISOString(),
        userId: authenticatedUserId,
      },
    };

    summarizationCache.set(cacheKey, responseData);

    res.status(200).json({
      success: true,
      message: "Video summary generated successfully",
      data: {
        ...responseData,
        cached: false,
        cacheKey
      },
    });
  } catch (error) {
    console.error("🚨 AI summarizeVideo error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate video summary",
      error: error.message,
    });
  }
};

/**
 * POST /api/ai/summarize-article
 * Generate summary for article content from Firebase Storage URL
 *
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.articleUrl - Firebase Storage URL of the article file
 * @param {string} req.body.materialId - Optional material ID for reference
 */
exports.summarizeArticle = async (req, res) => {
  try {
    const { materialUrl, materialId } = req.body;
    const authenticatedUserId = req.user.id;

    // Validation
    const validationErrors = validateSummarizeArticleRequest({ materialUrl });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid request data",
        errors: validationErrors,
      });
    }

    // Generate cache key based on material URL
    const cacheKey = generateCacheKey('article', materialUrl);
    
    // Check cache first
    const cachedSummary = summarizationCache.get(cacheKey);
    if (cachedSummary) {
      return res.status(200).json({
        success: true,
        message: "Article summary retrieved from cache",
        data: {
          ...cachedSummary,
          cached: true,
          cacheKey
        },
      });
    }


    // Generate summary using Gemini API with document URL
    const summary = await generateArticleSummary(materialUrl);

    // Cache the result
    const responseData = {
      summary,
      materialUrl,
      materialId,
      meta: {
        model: SUMMARIZATION_MODEL,
        generatedAt: new Date().toISOString(),
        userId: authenticatedUserId,
      },
    };

    summarizationCache.set(cacheKey, responseData);

    res.status(200).json({
      success: true,
      message: "Article summary generated successfully",
      data: {
        ...responseData,
        cached: false,
        cacheKey
      },
    });
  } catch (error) {
    console.error("🚨 AI summarizeArticle error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate article summary",
      error: error.message,
    });
  }
};

/**
 * Validate the request body for summarizeVideo endpoint
 */
function validateSummarizeVideoRequest({ materialUrl }) {
  const errors = [];

  if (!materialUrl) {
    errors.push("materialUrl is required");
  } else if (typeof materialUrl !== "string") {
    errors.push("materialUrl must be a string");
  } else if (!isValidFirebaseStorageUrl(materialUrl)) {
    errors.push("materialUrl must be a valid Firebase Storage URL");
  }

  return errors;
}

/**
 * Validate the request body for summarizeArticle endpoint
 */
function validateSummarizeArticleRequest({ materialUrl }) {
  const errors = [];

  if (!materialUrl) {
    errors.push("materialUrl is required");
  } else if (typeof materialUrl !== "string") {
    errors.push("materialUrl must be a string");
  } else if (!isValidFirebaseStorageUrl(materialUrl)) {
    errors.push("materialUrl must be a valid Firebase Storage URL");
  }

  return errors;
}

/**
 * Validate if URL is a Firebase Storage URL
 */
function isValidFirebaseStorageUrl(url) {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname === 'firebasestorage.googleapis.com' ||
      urlObj.hostname.includes('firebasestorage.googleapis.com')
    );
  } catch (error) {
    return false;
  }
}

/**
 * Generate cache key for content
 */
function generateCacheKey(type, url) {
  const hash = crypto.createHash('md5').update(url).digest('hex');
  return `summarization:${type}:${hash}`;
}

/**
 * Convert DOCX/DOC file to PDF using text extraction fallback
 * Note: For production, install LibreOffice for better conversion quality
 */
async function convertDocxToPdf(fileUrl) {
  const fetch = (await import('node-fetch')).default;
  const fs = require('fs');
  const path = require('path');
  
  try {
    
    // Download original file
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const bufferData = Buffer.from(buffer);
    const originalFileName = path.basename(new URL(fileUrl).pathname);
    const fileExtension = originalFileName.split('.').pop().toLowerCase();
    
    let extractedText = '';
    
    // Extract text based on file type
    if (fileExtension === 'docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: bufferData });
      extractedText = result.value;
    } else if (fileExtension === 'doc') {
      // Basic text extraction for DOC files (limited support)
      extractedText = bufferData.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    } else {
      throw new Error(`Unsupported file type: ${fileExtension}`);
    }
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No text could be extracted from the document");
    }
    
    
    // Create a simple PDF with the extracted text using PDFKit
    const PDFDocument = require('pdfkit');
    
    // Create temp directory
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const pdfPath = path.join(tempDir, `converted_${Date.now()}.pdf`);
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    
    // Add text to PDF with proper formatting
    doc.fontSize(12);
    const maxWidth = 500;
    const lineHeight = 14;
    
    // Split text into paragraphs and add to PDF
    const paragraphs = extractedText.split(/\n\s*\n/);
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      if (paragraph) {
        doc.text(paragraph, { width: maxWidth, align: 'left' });
        doc.moveDown();
        
        // Add new page if needed
        if (doc.y > 700) {
          doc.addPage();
        }
      }
    }
    
    doc.end();
    
    // Wait for PDF creation to complete
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    
    // Upload PDF to Firebase Storage
    const admin = require('firebase-admin');
    const bucket = admin.storage().bucket();
    
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfFileName = `converted_${Date.now()}_${path.parse(originalFileName).name}.pdf`;
    const pdfFile_ref = bucket.file(`temp/converted/${pdfFileName}`);
    
    await pdfFile_ref.save(pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
      },
    });
    
    // Get download URL
    const [pdfUrl] = await pdfFile_ref.getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });
    
    
    // Cleanup temp file
    try {
      fs.unlinkSync(pdfPath);
    } catch (cleanupError) {
      console.warn("⚠️ Cleanup warning:", cleanupError.message);
    }
    
    return pdfUrl;
    
  } catch (error) {
    console.error("🚨 convertDocxToPdf error:", error);
    throw error;
  }
}

/**
 * Upload file to Gemini File API from Firebase Storage URL
 */
async function uploadFileToGemini(fileUrl, mimeType) {
  try {
    
    // Download file from Firebase Storage
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file from Firebase: ${fileResponse.status}`);
    }
    
    const fileBuffer = await fileResponse.arrayBuffer();
    
    // Extract proper filename with extension from URL
    const urlParts = fileUrl.split('?')[0]; // Remove query parameters
    const fileName = urlParts.split('/').pop() || 'file';
    
    
    // Upload to Gemini File API
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer], { type: mimeType }), fileName);
    
    const uploadResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${SUMMARIZATION_API_KEY}`, {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.text();
      console.error("🚨 Gemini upload failed:", {
        status: uploadResponse.status,
        fileName,
        mimeType,
        errorBody
      });
      throw new Error(`Gemini File API upload error: ${uploadResponse.status} - ${errorBody}`);
    }
    
    const uploadResult = await uploadResponse.json();
    
    return uploadResult.file;
  } catch (error) {
    console.error("🚨 uploadFileToGemini error:", error);
    throw error;
  }
}

/**
 * Generate video summary using Gemini multimodal API
 */
async function generateVideoSummary(videoUrl) {
  try {
    
    // Upload video file to Gemini File API
    const uploadedFile = await uploadFileToGemini(videoUrl, 'video/*');
    
    // Wait for file processing (Gemini needs time to process video files)
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    
    const requestBody = {
      systemInstruction: {
        parts: [
          {
            text: `Bạn là một chuyên gia giáo dục có nhiều kinh nghiệm trong việc tóm tắt nội dung học tập. 

Nhiệm vụ của bạn:
1. Xem và phân tích toàn bộ nội dung video
2. Tạo ra một bản tóm tắt chi tiết, có cấu trúc và dễ hiểu bằng tiếng Việt
3. Tập trung vào các kiến thức chính, khái niệm quan trọng
4. Sắp xếp thông tin theo thứ tự logic, dễ theo dõi
5. Sử dụng ngôn ngữ rõ ràng, phù hợp với học sinh/sinh viên

QUAN TRỌNG - Cấu trúc tóm tắt bắt buộc:
Sử dụng định dạng sau với các tiêu đề rõ ràng, mỗi phần cách nhau bằng 2 dòng trống:

Tổng quan nội dung:
[Mô tả tổng quan về chủ đề chính của video]

Điểm chính:
- [Điểm quan trọng thứ 1]
- [Điểm quan trọng thứ 2]  
- [Điểm quan trọng thứ 3]

Khái niệm cần thiết:
- [Khái niệm/thuật ngữ quan trọng 1]
- [Khái niệm/thuật ngữ quan trọng 2]

Kết luận:
[Tóm tắt những điểm then chốt và takeaways quan trọng]

Độ dài: 2000-5000 từ hoặc nhiều hơn nếu cần thiết. Hãy tạo tóm tắt CỰC KỲ CHI TIẾT và TOÀN DIỆN:
- Phân tích sâu từng khái niệm quan trọng
- Giải thích chi tiết các ví dụ và case study
- Bao gồm tất cả các bước thực hiện cụ thể
- Liệt kê đầy đủ các công thức, thuật toán, phương pháp
- Mô tả chi tiết các hình ảnh, biểu đồ, sơ đồ trong video
- Phân tích ưu nhược điểm của từng phương pháp
- Đưa ra các lưu ý, tips và best practices
- Kết nối với kiến thức liên quan và ứng dụng thực tế`,
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Hãy tóm tắt nội dung của video này một cách chi tiết và có cấu trúc. Tập trung vào các kiến thức chính và sắp xếp thông tin theo thứ tự logic.",
            },
            {
              fileData: {
                mimeType: uploadedFile.mimeType,
                fileUri: uploadedFile.uri,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        maxOutputTokens: SUMMARIZATION_MAX_OUTPUT_TOKENS,
      },
    };

    const response = await fetch(SUMMARIZATION_API_URL, {
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

    // Extract summary from response
    if (
      !result.candidates ||
      !result.candidates[0]?.content?.parts[0]?.text
    ) {
      throw new Error("Invalid response structure from Gemini API");
    }

    // Clean up uploaded file (optional)
    try {
      await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFile.name}?key=${SUMMARIZATION_API_KEY}`, {
        method: 'DELETE'
      });
    } catch (cleanupError) {
      console.warn("⚠️ Failed to cleanup uploaded file:", cleanupError.message);
    }

    return result.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("🚨 generateVideoSummary error:", error);
    throw error;
  }
}

/**
 * Generate article summary using Gemini API
 */
async function generateArticleSummary(articleUrl) {
  try {
    
    // Extract file extension from URL (handle Firebase Storage URLs)
    const urlParts = articleUrl.split('?')[0]; // Remove query parameters
    const fileName = urlParts.split('/').pop(); // Get filename
    const fileExtension = fileName.split('.').pop().toLowerCase();
    
    
    // Check if file needs conversion before Gemini upload
    let fileToUpload = articleUrl;
    let finalMimeType;
    
    switch (fileExtension) {
      case 'pdf':
        finalMimeType = 'application/pdf';
        break;
      case 'txt':
        finalMimeType = 'text/plain';
        break;
      case 'docx':
      case 'doc':
        fileToUpload = await convertDocxToPdf(articleUrl);
        finalMimeType = 'application/pdf';
        break;
      default:
        throw new Error(`Unsupported file type for AI summarization: ${fileExtension}. Supported types: PDF, TXT, DOCX, DOC`);
    }
    
    
    // Upload file to Gemini File API
    const uploadedFile = await uploadFileToGemini(fileToUpload, finalMimeType);
    
    // Wait for file processing
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds for documents
    
    const requestBody = {
      systemInstruction: {
        parts: [
          {
            text: `Bạn là một chuyên gia giáo dục có nhiều kinh nghiệm trong việc tóm tắt tài liệu học tập.

Nhiệm vụ của bạn:
1. Đọc và phân tích toàn bộ nội dung tài liệu
2. Tạo ra một bản tóm tắt chi tiết, có cấu trúc và dễ hiểu bằng tiếng Việt
3. Tập trung vào các ý chính, khái niệm quan trọng
4. Sắp xếp thông tin theo thứ tự logic từ tổng quát đến cụ thể
5. Sử dụng ngôn ngữ rõ ràng, phù hợp với học sinh/sinh viên

QUAN TRỌNG - Cấu trúc tóm tắt bắt buộc:
Sử dụng định dạng sau với các tiêu đề rõ ràng, mỗi phần cách nhau bằng 2 dòng trống:

Nội dung chính:
[Giới thiệu tổng quan về chủ đề của tài liệu]

Điểm chính:
- [Ý chính thứ 1]
- [Ý chính thứ 2]
- [Ý chính thứ 3]

Khái niệm quan trọng:
- [Định nghĩa/khái niệm quan trọng 1]
- [Định nghĩa/khái niệm quan trọng 2]

Lưu ý:
- [Điểm cần chú ý đặc biệt]
- [Lời khuyên hoặc gợi ý thực hành]

Kết luận:
[Tóm tắt những điểm then chốt và takeaways quan trọng]

Độ dài: 2500-6000 từ hoặc nhiều hơn nếu cần thiết. Hãy tạo tóm tắt CỰC KỲ CHI TIẾT và TOÀN DIỆN:
- Phân tích từng chương, từng phần một cách chi tiết
- Giải thích sâu sắc tất cả các khái niệm, định nghĩa
- Mô tả chi tiết các ví dụ, bài tập, case study
- Liệt kê đầy đủ các công thức, định lý, quy tắc
- Phân tích các bảng biểu, hình ảnh, sơ đồ trong tài liệu
- So sánh các phương pháp và cách tiếp cận khác nhau
- Đưa ra phân tích ưu nhược điểm chi tiết
- Kết nối với kiến thức nền tảng và ứng dụng thực tế
- Bao gồm tất cả các ghi chú quan trọng và lưu ý đặc biệt`,
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Hãy tóm tắt nội dung của tài liệu này một cách chi tiết và có cấu trúc. Tập trung vào các ý chính và sắp xếp thông tin theo thứ tự logic.",
            },
            {
              fileData: {
                mimeType: uploadedFile.mimeType,
                fileUri: uploadedFile.uri,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        maxOutputTokens: SUMMARIZATION_MAX_OUTPUT_TOKENS,
      },
    };

    const response = await fetch(SUMMARIZATION_API_URL, {
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

    // Extract summary from response
    if (
      !result.candidates ||
      !result.candidates[0]?.content?.parts[0]?.text
    ) {
      throw new Error("Invalid response structure from Gemini API");
    }

    // Clean up uploaded file (optional)
    try {
      await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFile.name}?key=${SUMMARIZATION_API_KEY}`, {
        method: 'DELETE'
      });
    } catch (cleanupError) {
      console.warn("⚠️ Failed to cleanup uploaded file:", cleanupError.message);
    }

    return result.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("🚨 generateArticleSummary error:", error);
    throw error;
  }
}

/**
 * POST /api/ai/grade-essay
 * Grade essay answers using AI
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.quizResultId - MongoDB ObjectId of the quiz result
 * @param {Array} req.body.essayAnswers - Array of essay answers to grade
 * @param {number} req.body.essayAnswers[].questionIndex - Question index
 * @param {string} req.body.essayAnswers[].questionContent - Question content
 * @param {string} req.body.essayAnswers[].studentAnswer - Student's answer
 * @param {string} req.body.essayAnswers[].essayGuideline - Grading guideline
 * @param {number} req.body.essayAnswers[].maxScore - Maximum score for question
 */
exports.gradeEssayAnswers = async (req, res) => {
  try {
    const { quizResultId, essayAnswers } = req.body;
    const authenticatedUserId = req.user.id;

    // Validation
    if (!quizResultId || !mongoose.Types.ObjectId.isValid(quizResultId)) {
      return res.status(400).json({
        success: false,
        message: "Valid quizResultId is required"
      });
    }

    if (!Array.isArray(essayAnswers) || essayAnswers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "essayAnswers array is required and must not be empty"
      });
    }

    // Find quiz result and verify ownership
    const quizResult = await StudentQuizResult.findById(quizResultId);
    
    if (!quizResult) {
      return res.status(404).json({
        success: false,
        message: "Quiz result not found"
      });
    }

    if (quizResult.userId.toString() !== authenticatedUserId) {
      return res.status(403).json({
        success: false,
        message: "You can only grade your own quiz answers"
      });
    }

    // Check if already graded
    if (quizResult.gradingStatus === 'completed') {
      return res.status(400).json({
        success: false,
        message: "This quiz has already been graded"
      });
    }

    // Update status to grading
    quizResult.gradingStatus = 'grading';
    await quizResult.save();

    console.log(`🤖 Grading ${essayAnswers.length} essay answers for quiz result ${quizResultId}...`);

    // Grade each essay answer
    const gradedAnswers = [];
    let totalEssayScore = 0;
    let maxEssayScore = 0;

    for (const essayAnswer of essayAnswers) {
      try {
        console.log(`📝 Grading question ${essayAnswer.questionIndex + 1}...`);

        const gradingResult = await gradeEssayAnswer({
          questionContent: essayAnswer.questionContent,
          studentAnswer: essayAnswer.studentAnswer,
          essayGuideline: essayAnswer.essayGuideline,
          maxScore: essayAnswer.maxScore || 10
        });

        const gradedAnswer = {
          questionIndex: essayAnswer.questionIndex,
          questionContent: essayAnswer.questionContent,
          studentAnswer: essayAnswer.studentAnswer,
          aiScore: gradingResult.score,
          aiFeedback: gradingResult.feedback,
          aiStrengths: gradingResult.strengths,
          aiImprovements: gradingResult.improvements,
          percentage: gradingResult.percentage,
          maxScore: essayAnswer.maxScore || 10,
          gradedAt: new Date(),
          gradingModel: process.env.QUIZAI_MODEL || 'gemini-2.5-flash'
        };

        gradedAnswers.push(gradedAnswer);
        totalEssayScore += gradingResult.score;
        maxEssayScore += essayAnswer.maxScore || 10;

        console.log(`✅ Question ${essayAnswer.questionIndex + 1}: ${gradingResult.score}/${essayAnswer.maxScore || 10} points`);

      } catch (error) {
        console.error(`❌ Failed to grade question ${essayAnswer.questionIndex + 1}:`, error.message);
        
        // Add failed grading with 0 score
        gradedAnswers.push({
          questionIndex: essayAnswer.questionIndex,
          questionContent: essayAnswer.questionContent,
          studentAnswer: essayAnswer.studentAnswer,
          aiScore: 0,
          aiFeedback: "Không thể chấm điểm câu hỏi này. Vui lòng thử lại sau.",
          maxScore: essayAnswer.maxScore || 10,
          gradedAt: new Date(),
          gradingModel: process.env.QUIZAI_MODEL || 'gemini-2.5-flash',
          error: error.message
        });
        
        maxEssayScore += essayAnswer.maxScore || 10;
      }
    }

    // Calculate total score (existing multiple choice + essay scores)
    const existingScore = quizResult.score || 0;
    const totalScore = existingScore + totalEssayScore;
    const maxTotalScore = (quizResult.maxTotalScore || 0) + maxEssayScore;

    // Update quiz result with graded essays
    quizResult.essayAnswers = gradedAnswers;
    quizResult.totalScore = totalScore;
    quizResult.maxTotalScore = maxTotalScore;
    quizResult.gradingStatus = 'completed';
    await quizResult.save();

    console.log(`✅ Completed grading. Total score: ${totalScore}/${maxTotalScore}`);

    res.status(200).json({
      success: true,
      message: "Essay answers graded successfully",
      data: {
        quizResultId: quizResult._id,
        gradedAnswers: gradedAnswers,
        essayScore: totalEssayScore,
        maxEssayScore: maxEssayScore,
        totalScore: totalScore,
        maxTotalScore: maxTotalScore,
        percentage: Math.round((totalScore / maxTotalScore) * 100),
        gradingStatus: 'completed',
        gradedAt: new Date()
      }
    });

  } catch (error) {
    console.error("🚨 AI gradeEssayAnswers error:", error);
    console.error("🚨 Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    // Update status to failed if we have quizResultId
    if (req.body.quizResultId) {
      try {
        await StudentQuizResult.findByIdAndUpdate(
          req.body.quizResultId,
          { gradingStatus: 'failed' }
        );
      } catch (updateError) {
        console.error("Failed to update grading status:", updateError);
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to grade essay answers",
      error: error.message
    });
  }
};
