const Quiz = require("../models/QuizModel");
const StudentQuizResult = require("../models/StudentQuizResult");
const Course = require("../models/courseModel");
const Lesson = require("../models/lessonModel");
const Section = require("../models/sectionModel");
const mongoose = require("mongoose");
const mammoth = require("mammoth");
const multer = require("multer");
const { uploadToFirebase: uploadToFirebaseStorage } = require("../utils/firebaseStorage");

// In-memory cache for request deduplication (simple protection against rapid duplicates)
const requestCache = new Map();

// Processing state tracker to prevent concurrent execution
const processingQuizzes = new Set();

// Store interval reference for proper cleanup
let cleanupInterval;

// Clean cache every 5 seconds with more aggressive cleanup
function startCleanupInterval() {
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, timestamp] of requestCache.entries()) {
      if (now - timestamp > 5000) { // Remove entries older than 5 seconds
        requestCache.delete(key);
        cleanedCount++;
      }
    }
    
    // Clean processing state for items older than 30 seconds
    for (const key of processingQuizzes) {
      if (key.includes('-') && now - parseInt(key.split('-')[1]) > 30000) {
        processingQuizzes.delete(key);
      }
    }
    
    // Log cleanup if items were removed
    if (cleanedCount > 0) {
      console.log(`🧹 Cache cleanup: removed ${cleanedCount} expired entries. Current cache size: ${requestCache.size}, processing: ${processingQuizzes.size}`);
    }
    
    // Emergency cleanup if cache gets too large
    if (requestCache.size > 1000) {
      console.log(`⚠️ Cache size exceeded 1000 entries (${requestCache.size}). Performing emergency cleanup...`);
      requestCache.clear();
      console.log(`🧹 Emergency cleanup completed. Cache cleared.`);
    }
  }, 5000);
}

// Function to stop cleanup interval (for graceful shutdown)
function stopCleanupInterval() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('🛑 Quiz cache cleanup interval stopped');
  }
}

// Start the cleanup interval
startCleanupInterval();

// Handle graceful shutdown
process.on('SIGINT', () => {
  stopCleanupInterval();
});

process.on('SIGTERM', () => {
  stopCleanupInterval();
});

// Ensure uploads directory exists
const fs = require('fs');
const path = require('path');
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for Word file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'quiz-' + uniqueSuffix + '.docx')
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept only .docx files
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Only .docx files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

/**
 * Parse Word document content and extract quiz questions
 * @param {Buffer} buffer - Word file buffer
 * @returns {Promise<Array>} - Array of parsed questions
 */
async function parseWordQuiz(buffer) {
  try {
    // Extract text from Word document
    const result = await mammoth.extractRawText({ buffer: buffer });
    const text = result.value;
    
    // Split by lines and clean up
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const questions = [];
    let currentQuestion = null;
    let currentAnswers = [];
    let questionCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if line is a question (starts with Q followed by number and dot)
      const questionMatch = line.match(/^Q(\d+)\.?\s*(.+)$/i);
      if (questionMatch) {
        
        // Save previous question if exists
        if (currentQuestion && currentAnswers.length > 0) {
          const question = {
            content: currentQuestion,
            type: "multiple-choice",
            score: 1,
            answers: [...currentAnswers]
          };
          questions.push(question);
          questionCount++;
        }
        
        // Start new question
        currentQuestion = questionMatch[2].trim();
        currentAnswers = [];
        continue;
      }
      
      // Check if line is an answer (starts with letter followed by closing parenthesis)
      const answerMatch = line.match(/^([A-Z])\)\s*(.+?)(\s*\*)?$/i);
      if (answerMatch && currentQuestion) {
        const answerText = answerMatch[2].trim();
        const isCorrect = !!answerMatch[3]; // Has * at the end
        
        const answer = {
          content: answerText,
          isCorrect: isCorrect
        };
        
        currentAnswers.push(answer);
      }
    }
    
    // Add the last question
    if (currentQuestion && currentAnswers.length > 0) {
      const question = {
        content: currentQuestion,
        type: "multiple-choice",
        score: 1,
        answers: [...currentAnswers]
      };
      questions.push(question);
      questionCount++;
    }
    
    return questions;
  } catch (error) {
    console.error("❌ Error in parseWordQuiz:", error);
    throw new Error(`Failed to parse Word document: ${error.message}`);
  }
}

/**
 * @desc    Parse Word file and return quiz data (does not save to database)
 * @route   POST /api/quiz/upload-word
 * @access  Private
 */
exports.uploadWordQuiz = [
  upload.single('wordFile'),
  async (req, res) => {
    let tempFilePath = null;
    
    try {
      // Extract file info and request body
      console.log("📁 File info:", req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      } : "No file");
      console.log("� Request body:", {
        courseId: req.body.courseId,
        title: req.body.title,
        hasDescription: !!req.body.description,
        sectionId: req.body.sectionId,
        lessonTitle: req.body.lessonTitle,
        autoCreateLesson: req.body.autoCreateLesson
      });
      
      const { courseId, title, description, sectionId, lessonTitle, autoCreateLesson } = req.body;
      
      if (!req.file) {
        console.log("❌ No Word file uploaded - request body:", {
          hasQuizData: !!req.body.quizData,
          hasTitle: !!req.body.title,
          hasQuestions: !!req.body.questions,
          bodyKeys: Object.keys(req.body)
        });
        
        // Check if this is actually a quiz data request misrouted
        if (req.body.quizData || (req.body.title && req.body.questions)) {
          return res.status(400).json({
            success: false,
            message: "This endpoint is for Word file upload. For creating quiz from data, use POST /api/quiz/create-from-data",
            hint: "Frontend should call createQuizFromData API instead of uploadWordQuiz API"
          });
        }
        
        return res.status(400).json({
          success: false,
          message: "No Word file uploaded. This endpoint requires a .docx file."
        });
      }
      
      // CourseId is optional - can create quiz before course exists
      let validCourseId = null;
      if (courseId && courseId !== "undefined" && courseId !== "null" && courseId.trim() !== "") {
        // Validate courseId format (MongoDB ObjectId) if provided
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid Course ID format"
          });
        }
        validCourseId = courseId;
      }
      
      if (!title || title.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Quiz title is required"
        });
      }
      
      // Store temp file path for cleanup
      tempFilePath = req.file.path;
      
      // Verify course exists (only if courseId is provided)
      if (validCourseId) {
        const course = await Course.findById(validCourseId);
        if (!course) {
          return res.status(404).json({
            success: false,
            message: "Course not found"
          });
        }
      }
      
      // Parse the Word document
      const questions = await parseWordQuiz(require('fs').readFileSync(req.file.path));
      
      if (questions.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid questions found in the Word document. Please check the format.",
          hint: "Expected format: Q1. Question text? A) Answer 1 B) Answer 2 C) Answer 3 *"
        });
      }
      
      // Validate that each question has at least one correct answer
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const hasCorrectAnswer = question.answers.some(answer => answer.isCorrect);
        if (!hasCorrectAnswer) {
          console.log(`❌ Question ${i + 1} has no correct answer`);
          return res.status(400).json({
            success: false,
            message: `Question ${i + 1} has no correct answer marked with *`
          });
        }
      }
      
      // All questions validated - ready to return
      
      // Create content hash to prevent duplicate uploads of same file
      const crypto = require('crypto');
      const fileBuffer = require('fs').readFileSync(req.file.path);
      const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
      const contentHash = crypto.createHash('md5').update(JSON.stringify({
        title: title.trim(),
        questions: questions.map(q => ({
          content: q.content,
          answers: q.answers.map(a => ({ content: a.content, isCorrect: a.isCorrect }))
        }))
      })).digest('hex');
      
      // Check for duplicate by comparing content within recent time window
      const recentQuizzes = await Quiz.find({
        title: title.trim(),
        userId: req.user?.id || null,
        createdAt: { $gte: new Date(Date.now() - 300000) } // Last 5 minutes
      }).sort({ createdAt: -1 });
      
      for (const recentQuiz of recentQuizzes) {
        if (recentQuiz.questions.length === questions.length) {
          // Deep compare questions content
          const isSameContent = recentQuiz.questions.every((existingQ, index) => {
            const newQ = questions[index];
            return existingQ.content === newQ.content && 
                   existingQ.answers.length === newQ.answers.length &&
                   existingQ.answers.every((existingA, aIndex) => {
                     const newA = newQ.answers[aIndex];
                     return existingA.content === newA.content && existingA.isCorrect === newA.isCorrect;
                   });
          });
          
          if (isSameContent) {
            const timeDiff = Date.now() - new Date(recentQuiz.createdAt).getTime();
            
            return res.status(200).json({
              success: true,
              message: "Quiz with identical content already exists (duplicate prevention)",
              data: {
                quizId: recentQuiz._id,
                title: recentQuiz.title,
                questionsCount: recentQuiz.questions.length,
                isDuplicate: true,
                duplicateDetectedBy: "contentComparison",
                existingCreatedAt: recentQuiz.createdAt,
                timeDifference: timeDiff
              }
            });
          }
        }
      }
      
      // Upload Word file to Firebase for reference (optional)
      let firebaseResult = null;
      try {
        firebaseResult = await uploadToFirebaseStorage(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          validCourseId || null, // null means temporary folder
          "quiz"
        );
      } catch (firebaseError) {
        console.error("Firebase upload error:", firebaseError);
        // Continue even if firebase upload fails
      }
      
      // Return parsed quiz data WITHOUT saving to database
      // Frontend will store this in state and save to DB when course is saved
      const quizData = {
        title: title.trim(),
        description: description || "",
        questions: questions, // Make sure questions are included
        roleCreated: "instructor",
        userId: req.user?.id || null,
        courseId: validCourseId || null
      };
      
      console.log(`📦 Quiz data prepared:`, {
        title: quizData.title,
        questionsCount: quizData.questions.length,
        hasQuestions: quizData.questions.length > 0,
        firstQuestionPreview: quizData.questions[0]?.content?.substring(0, 50) + "...",
        questionsAreArray: Array.isArray(quizData.questions),
        sampleQuestion: quizData.questions[0] ? {
          content: quizData.questions[0].content,
          answersCount: quizData.questions[0].answers?.length || 0,
          hasAnswers: Array.isArray(quizData.questions[0].answers)
        } : null
      });
      
      res.status(200).json({
        success: true,
        message: `Quiz parsed successfully with ${questions.length} questions (not saved to database yet)`,
        data: {
          quizData: quizData,
          questionsCount: questions.length,
          courseId: validCourseId,
          firebaseUrl: firebaseResult?.downloadURL || null,
          // Include temporary ID for frontend state management
          tempQuizId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      });
      
    } catch (error) {
      console.error("Error in uploadWordQuiz:", error);
      
      if (error.message.includes('Failed to parse Word document')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: "Server error while processing quiz",
        error: error.message
      });
    } finally {
      // Clean up temporary file
      if (tempFilePath) {
        try {
          require('fs').unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.error("Error cleaning up temp file:", cleanupError);
        }
      }
    }
  }
];

/**
 * @desc    Create quiz from parsed Word document data
 * @param   {Object} quizData - Parsed quiz data from Word document
 * @param   {String} courseId - Course ID
 * @param   {String} userId - User ID (optional)
 * @returns {Promise<Object>} - Created quiz document
 */
async function createQuizFromWordData(quizData, courseId, userId = null) {
  try {
    const { title, description, questions } = quizData;
    
    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
      throw new Error("Course not found");
    }
    
    if (questions.length === 0) {
      throw new Error("No valid questions found in the Word document");
    }
    
    // Validate that each question has at least one correct answer
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const hasCorrectAnswer = question.answers.some(answer => answer.isCorrect);
      if (!hasCorrectAnswer) {
        throw new Error(`Question ${i + 1} has no correct answer marked with *`);
      }
    }
    
    // Create quiz document
    const newQuiz = new Quiz({
      courseId: courseId,
      title: title.trim(),
      description: description || "",
      questions: questions,
      roleCreated: "instructor",
      userId: userId
    });
    
    const savedQuiz = await newQuiz.save();
    return savedQuiz;
    
  } catch (error) {
    throw error;
  }
}

/**
 * @desc    Get quiz by ID
 * @route   GET /api/quiz/:quizId
 * @access  Private
 */
exports.getQuizById = async (req, res) => {
  try {
    const { quizId } = req.params;
    
    const quiz = await Quiz.findById(quizId)
      .populate("courseId", "title")
      .populate("userId", "firstName lastName");
    
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found"
      });
    }
    
    res.status(200).json({
      success: true,
      data: quiz
    });
    
  } catch (error) {
    console.error("Error in getQuizById:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * @desc    Get quiz by lesson ID
 * @route   GET /api/quiz/by-lesson/:lessonId
 * @access  Private
 */
exports.getQuizByLesson = async (req, res) => {
  try {
    let { lessonId } = req.params;
    const originalParam = lessonId;

    // Handle frontend format with 'quiz_' prefix
    if (lessonId.startsWith('quiz_')) {
      lessonId = lessonId.replace('quiz_', '');
    }

    // Validate lessonId
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Lesson ID format",
        debug: {
          received: originalParam,
          cleaned: lessonId,
          isValid: false
        }
      });
    }

    // Find lesson first
    const lesson = await Lesson.findById(lessonId);

    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
        debug: {
          originalParam: originalParam,
          searchedLessonId: lessonId
        }
      });
    }

    // Check if it's a quiz lesson
    if (lesson.type !== "quiz") {
      return res.status(200).json({
        success: false,
        message: "This lesson is not a quiz lesson",
        isQuizLesson: false,
        data: {
          lessonInfo: {
            id: lesson._id,
            title: lesson.title,
            description: lesson.description,
            type: lesson.type,
            order: lesson.order,
            materialUrl: lesson.materialUrl,
            duration: lesson.duration
          },
          allowRetake: true // Added flag to indicate retake is allowed for non-quiz lessons as well
        }
      });
    }

    // Check if lesson has quizIds
    if (!lesson.quizIds || lesson.quizIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No quiz found in this lesson",
        data: {
          lessonTitle: lesson.title,
          lessonType: lesson.type,
          allowRetake: true // Added flag to indicate retake is allowed even if no quizzes are found
        }
      });
    }

    const firstQuizId = lesson.quizIds[0];

    // Get the first quiz (assuming one quiz per lesson for now)
    const quiz = await Quiz.findById(firstQuizId)
      .populate("courseId", "title")
      .populate("userId", "firstName lastName");

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz data not found",
        debug: {
          lessonQuizIds: lesson.quizIds,
          searchedQuizId: firstQuizId
        },
        allowRetake: true // Added flag to indicate retake is allowed even if quiz data is not found
      });
    }

    // Allow users to retake the quiz
    res.status(200).json({
      success: true,
      data: {
        ...quiz.toObject(),
        lessonInfo: {
          id: lesson._id,
          title: lesson.title,
          description: lesson.description,
          type: lesson.type,
          order: lesson.order
        },
        allowRetake: true // Added flag to indicate retake is allowed for all quizzes
      }
    });

  } catch (error) {
    console.error("❌ Error in getQuizByLesson:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
      stack: error.stack
    });
  }
};

/**
 * @desc    Get lesson detail with type-specific data (video/article/quiz)
 * @route   GET /api/quiz/lesson/:lessonId
 * @access  Private
 */
exports.getLessonDetail = async (req, res) => {
  try {
    let { lessonId } = req.params;
    const originalParam = lessonId;
    
    // Handle frontend format with 'quiz_' prefix
    if (lessonId.startsWith('quiz_')) {
      lessonId = lessonId.replace('quiz_', '');
    }
    
    // Validate lessonId
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Lesson ID format",
        debug: {
          received: originalParam,
          cleaned: lessonId,
          isValid: false
        }
      });
    }
    
    // Find lesson first
    const lesson = await Lesson.findById(lessonId)
      .populate('courseId', 'title')
      .populate('sectionId', 'name order');
    
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
        debug: {
          originalParam: originalParam,
          searchedLessonId: lessonId
        }
      });
    }
    
    // Base lesson info
    const baseResponse = {
      success: true,
      data: {
        lessonInfo: {
          id: lesson._id,
          title: lesson.title,
          description: lesson.description,
          lessonNotes: lesson.lessonNotes,
          type: lesson.type,
          order: lesson.order,
          duration: lesson.duration,
          courseId: lesson.courseId,
          sectionId: lesson.sectionId,
          createdAt: lesson.createdAt,
          updatedAt: lesson.updatedAt
        }
      }
    };
    
    // Handle different lesson types
    switch (lesson.type) {
      case 'video':
        baseResponse.data.videoData = {
          materialUrl: lesson.materialUrl, // Video URL
          duration: lesson.duration,
          hasVideo: !!lesson.materialUrl
        };
        break;
        
      case 'article':
        baseResponse.data.articleData = {
          content: lesson.description || lesson.lessonNotes, // Article content
          materialUrl: lesson.materialUrl, // Optional resource URL
          hasContent: !!(lesson.description || lesson.lessonNotes)
        };
        break;
        
      case 'quiz':
        // Check if lesson has quizIds
        if (!lesson.quizIds || lesson.quizIds.length === 0) {
          baseResponse.data.quizData = {
            hasQuiz: false,
            message: "No quiz found in this lesson",
            quizIds: []
          };
        } else {
          // Get quiz data with questions and answers
          const quizzes = await Quiz.find({ 
            _id: { $in: lesson.quizIds }
          })
          .populate("courseId", "title")
          .populate("userId", "firstName lastName")
          .sort({ createdAt: -1 });
          
          if (quizzes.length === 0) {
            baseResponse.data.quizData = {
              hasQuiz: false,
              message: "Quiz documents not found",
              quizIds: lesson.quizIds
            };
          } else {
            baseResponse.data.quizData = {
              hasQuiz: true,
              quizzes: quizzes
            };
          }
        }
        break;
    }
    
    res.status(200).json(baseResponse);
    
  } catch (error) {
    console.error("❌ Error in getLessonDetail:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
      stack: error.stack
    });
  }
};

/**
 * @desc    Get all quizzes in a lesson
 * @route   GET /api/quiz/lesson/:lessonId/all
 * @access  Private
 */
exports.getQuizzesInLesson = async (req, res) => {
  try {
    let { lessonId } = req.params;
    
    // Handle frontend format with 'quiz_' prefix
    if (lessonId.startsWith('quiz_')) {
      lessonId = lessonId.replace('quiz_', '');
      console.log(`🔄 Cleaned lessonId from quiz_${lessonId} to ${lessonId}`);
    }
    
    // Validate lessonId
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Lesson ID format",
        debug: {
          received: req.params.lessonId,
          cleaned: lessonId,
          isValid: false
        }
      });
    }
    
    // Check if lesson exists and get its quizIds
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
        debug: {
          originalParam: req.params.lessonId,
          searchedLessonId: lessonId
        }
      });
    }
    
    if (lesson.type !== "quiz" || !lesson.quizIds || lesson.quizIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "This lesson has no quizzes",
        data: [],
        count: 0
      });
    }
    
    // Find all quizzes for this lesson
    const quizzes = await Quiz.find({ 
      _id: { $in: lesson.quizIds }
    })
    .populate("courseId", "title")
    .populate("userId", "firstName lastName")
    .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: quizzes,
      count: quizzes.length,
      lessonInfo: {
        id: lesson._id,
        title: lesson.title,
        type: lesson.type
      }
    });
    
  } catch (error) {
    console.error("Error in getQuizzesInLesson:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * @desc    Get all quizzes for a course
 * @route   GET /api/quiz/course/:courseId
 * @access  Private
 */
exports.getQuizzesByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    const quizzes = await Quiz.find({ courseId })
      .populate("userId", "firstName lastName")
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: quizzes,
      count: quizzes.length
    });
    
  } catch (error) {
    console.error("Error in getQuizzesByCourse:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * @desc    Delete quiz
 * @route   DELETE /api/quiz/:quizId
 * @access  Private
 */
exports.deleteQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found"
      });
    }
    
    await Quiz.findByIdAndDelete(quizId);
    
    res.status(200).json({
      success: true,
      message: "Quiz deleted successfully"
    });
    
  } catch (error) {
    console.error("Error in deleteQuiz:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * @desc    Update quiz
 * @route   PUT /api/quiz/:quizId
 * @access  Private
 */
exports.updateQuiz = async (req, res) => {
  // Generate unique request ID for tracking
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`🔄 [${requestId}] UPDATE QUIZ REQUEST STARTED`);
    
    const { quizId } = req.params;
    const { title, description, questions } = req.body;
    
    console.log(`🔍 [${requestId}] Received Quiz ID:`, {
      quizId: quizId,
      quizIdType: typeof quizId,
      quizIdLength: quizId?.length,
      isString: typeof quizId === 'string',
      requestUrl: req.originalUrl
    });
    
    // Validate quizId
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      console.log(`❌ [${requestId}] Invalid Quiz ID format:`, {
        received: quizId,
        type: typeof quizId,
        length: quizId?.length
      });
      return res.status(400).json({
        success: false,
        message: "Invalid Quiz ID format",
        debug: {
          receivedId: quizId,
          expectedFormat: "24-character hex string",
          hint: "Make sure you're sending quiz._id, not the entire quiz object"
        }
      });
    }
    
    // Create cache key for edit deduplication
    const editCacheKey = `edit-${quizId}-${JSON.stringify({ title, questions: questions?.length || 0 })}`;
    
    // Check for recent duplicate edit request
    if (requestCache.has(editCacheKey)) {
      const lastRequest = requestCache.get(editCacheKey);
      const timeDiff = Date.now() - lastRequest;
      if (timeDiff < 3000) { // If same edit within 3 seconds
        console.log(`🚨 [${requestId}] DUPLICATE EDIT BLOCKED! Last edit ${timeDiff}ms ago`);
        return res.status(429).json({
          success: false,
          message: "Duplicate edit request detected. Please wait before trying again.",
          timeDiff: timeDiff
        });
      }
    }
    
    // Store current request in cache
    requestCache.set(editCacheKey, Date.now());
    console.log(`💾 [${requestId}] Edit request cached`);

    // Check if quiz exists
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found"
      });
    }
    
    // Prepare update data
    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description;
    if (questions !== undefined) {
      // Validate questions if provided
      if (Array.isArray(questions)) {
        for (let i = 0; i < questions.length; i++) {
          const question = questions[i];
          if (question.answers && Array.isArray(question.answers)) {
            const hasCorrectAnswer = question.answers.some(answer => answer.isCorrect);
            if (!hasCorrectAnswer) {
              return res.status(400).json({
                success: false,
                message: `Question ${i + 1} has no correct answer marked`
              });
            }
          }
        }
        updateData.questions = questions;
      } else {
        return res.status(400).json({
          success: false,
          message: "Questions must be an array"
        });
      }
    }
    
    // Update quiz with optimistic concurrency control
    const updatedQuiz = await Quiz.findOneAndUpdate(
      { _id: quizId, __v: quiz.__v }, // Include version for concurrency control
      { ...updateData, $inc: { __v: 1 } }, // Increment version
      { new: true, runValidators: true }
    ).populate("courseId", "title")
     .populate("userId", "firstName lastName");
    
    if (!updatedQuiz) {
      return res.status(409).json({
        success: false,
        message: "Quiz was modified by another request. Please refresh and try again."
      });
    }
    
    console.log(`✅ [${requestId}] Quiz updated successfully: ${updatedQuiz._id}`);

    res.status(200).json({
      success: true,
      message: "Quiz updated successfully",
      data: updatedQuiz
    });
    
  } catch (error) {
    console.error(`❌ [${requestId}] Error in updateQuiz:`, error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * @desc    Link quiz to course (for temporary quizzes created before course)
 * @route   PUT /api/quiz/:quizId/link-course
 * @access  Private
 */
exports.linkQuizToCourse = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { courseId } = req.body;
    
    if (!courseId || courseId === "undefined" || courseId === "null" || courseId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Valid Course ID is required"
      });
    }
    
    // Validate courseId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Course ID format"
      });
    }
    
    // Check if quiz exists
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found"
      });
    }
    
    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found"
      });
    }
    
    // Update quiz with courseId
    quiz.courseId = courseId;
    const updatedQuiz = await quiz.save();
    
    res.status(200).json({
      success: true,
      message: "Quiz successfully linked to course",
      data: {
        quizId: updatedQuiz._id,
        courseId: courseId,
        title: updatedQuiz.title
      }
    });
    
  } catch (error) {
    console.error("Error in linkQuizToCourse:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

// Export the parsing and creation functions for use in other controllers
exports.parseWordQuiz = parseWordQuiz;
exports.createQuizFromWordData = createQuizFromWordData;

/**
 * @desc    Link quiz to a lesson
 * @route   PUT /api/quiz/:quizId/link-lesson
 * @access  Private
 */
exports.linkQuizToLesson = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { lessonId } = req.body;
    
    // Validate input
    if (!lessonId || lessonId === "undefined" || lessonId === "null" || lessonId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Valid Lesson ID is required"
      });
    }
    
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(quizId) || !mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Quiz ID or Lesson ID format"
      });
    }
    
    // Check if quiz exists
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found"
      });
    }
    
    // Check if lesson exists
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found"
      });
    }
    
    // Update quiz with lessonId
    quiz.lessonId = lessonId;
    await quiz.save();
    
    // Add quizId to lesson's quizIds array if not already present
    if (!lesson.quizIds.includes(quizId)) {
      lesson.quizIds.push(quizId);
      lesson.type = "quiz"; // Ensure lesson type is quiz
      await lesson.save();
    }
    
    res.status(200).json({
      success: true,
      message: "Quiz successfully linked to lesson",
      data: {
        quizId: quiz._id,
        lessonId: lessonId,
        quizTitle: quiz.title,
        lessonTitle: lesson.title
      }
    });
    
  } catch (error) {
    console.error("Error in linkQuizToLesson:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * @desc    Create a quiz lesson in a section
 * @route   POST /api/quiz/:quizId/create-lesson
 * @access  Private
 */
exports.createQuizLesson = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { sectionId, title, description, order } = req.body;
    
    // Validate input
    if (!sectionId || sectionId === "undefined" || sectionId === "null" || sectionId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Valid Section ID is required"
      });
    }
    
    if (!title || title.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Lesson title is required"
      });
    }
    
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(quizId) || !mongoose.Types.ObjectId.isValid(sectionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Quiz ID or Section ID format"
      });
    }
    
    // Check if quiz exists
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found"
      });
    }
    
    // Check if section exists
    const section = await Section.findById(sectionId).populate('lessons');
    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found"
      });
    }
    
    // Calculate lesson order if not provided
    const lessonOrder = order || (section.lessons.length > 0 ? Math.max(...section.lessons.map(l => l.order || 0)) + 1 : 1);
    
    // Create new lesson
    const newLesson = new Lesson({
      courseId: section.courseId,
      sectionId: sectionId,
      title: title.trim(),
      description: description || "",
      type: "quiz",
      quizIds: [quizId],
      order: lessonOrder
    });
    
    const savedLesson = await newLesson.save();
    
    // Update quiz with lessonId
    quiz.lessonId = savedLesson._id;
    if (!quiz.courseId) {
      quiz.courseId = section.courseId; // Link quiz to course if not already linked
    }
    await quiz.save();
    
    // Add lesson to section
    section.lessons.push(savedLesson._id);
    await section.save();
    
    res.status(201).json({
      success: true,
      message: "Quiz lesson created successfully",
      data: {
        lessonId: savedLesson._id,
        quizId: quiz._id,
        sectionId: sectionId,
        title: savedLesson.title,
        order: savedLesson.order,
        type: savedLesson.type
      }
    });
    
  } catch (error) {
    console.error("Error in createQuizLesson:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * @desc    Create lessons for existing quizzes that don't have lessons yet
 * @route   POST /api/quiz/create-missing-lessons
 * @access  Private
 */
exports.createMissingQuizLessons = async (req, res) => {
  try {
    // Find all quizzes that have courseId but no lessonId
    const orphanedQuizzes = await Quiz.find({
      courseId: { $exists: true, $ne: null },
      lessonId: { $exists: false }
    }).populate('courseId', 'title');

    if (orphanedQuizzes.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No orphaned quizzes found - all quizzes already have lessons",
        data: {
          processedQuizzes: 0,
          createdLessons: 0
        }
      });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const quiz of orphanedQuizzes) {
      try {
        // Find first section of the course to put the lesson
        const firstSection = await Section.findOne({ 
          courseId: quiz.courseId._id 
        }).populate('lessons');

        if (!firstSection) {
          console.log(`❌ No section found for course ${quiz.courseId.title}`);
          errorCount++;
          results.push({
            quizId: quiz._id,
            quizTitle: quiz.title,
            error: "No section found in course"
          });
          continue;
        }

        // Calculate lesson order
        const lessonOrder = firstSection.lessons.length > 0 
          ? Math.max(...firstSection.lessons.map(l => l.order || 0)) + 1 
          : 1;

        // Create lesson for this quiz
        const newLesson = new Lesson({
          courseId: quiz.courseId._id,
          sectionId: firstSection._id,
          title: quiz.title,
          description: quiz.description || "",
          type: "quiz",
          quizIds: [quiz._id],
          order: lessonOrder
        });

        const createdLesson = await newLesson.save();

        // Update quiz with lessonId
        quiz.lessonId = createdLesson._id;
        await quiz.save();

        // Add lesson to section
        firstSection.lessons.push(createdLesson._id);
        await firstSection.save();

        successCount++;
        results.push({
          quizId: quiz._id,
          quizTitle: quiz.title,
          lessonId: createdLesson._id,
          lessonTitle: createdLesson.title,
          sectionId: firstSection._id,
          sectionName: firstSection.name,
          success: true
        });

        console.log(`✅ Created lesson for quiz: ${quiz.title}`);

      } catch (error) {
        console.error(`❌ Error creating lesson for quiz ${quiz.title}:`, error);
        errorCount++;
        results.push({
          quizId: quiz._id,
          quizTitle: quiz.title,
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Processed ${orphanedQuizzes.length} orphaned quizzes. Created ${successCount} lessons, ${errorCount} errors.`,
      data: {
        totalProcessed: orphanedQuizzes.length,
        successCount: successCount,
        errorCount: errorCount,
        results: results
      }
    });

  } catch (error) {
    console.error("Error in createMissingQuizLessons:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * @desc    Create quiz from quiz data object (helper function)
 * @param   {Object} quizData - Quiz data object 
 * @param   {String} courseId - Course ID to link quiz to
 * @returns {Promise<Object>} - Created quiz document
 */
async function createQuizFromData(quizData, courseId) {
  try {
    const newQuiz = new Quiz({
      courseId: courseId,
      title: quizData.title,
      description: quizData.description || "",
      questions: quizData.questions || [],
      roleCreated: quizData.roleCreated || "instructor",
      userId: quizData.userId || null
    });
    
    const savedQuiz = await newQuiz.save();
    console.log("✅ Quiz created from data:", savedQuiz._id, savedQuiz.title);
    return savedQuiz;
    
  } catch (error) {
    console.error("❌ Error creating quiz from data:", error);
    throw error;
  }
}

// Export helper functions
module.exports.createQuizFromData = createQuizFromData;
module.exports.stopCleanupInterval = stopCleanupInterval;

/**
 * @desc    Create quiz from frontend quiz data (from state)
 * @route   POST /api/quiz/create-from-data
 * @access  Private
 */
exports.createQuizFromFrontendData = async (req, res) => {
  // Generate unique request ID for tracking
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const { 
      quizData, 
      courseId, 
      sectionId, 
      lessonTitle, 
      autoCreateLesson 
    } = req.body;

    // Handle different frontend data formats first
    let actualQuizData = quizData;
    
    // If quizData is missing, check if data is sent directly in request body
    if (!quizData && req.body.title && req.body.questions) {
      actualQuizData = {
        title: req.body.title,
        description: req.body.description,
        questions: req.body.questions,
        roleCreated: req.body.roleCreated || "instructor",
        userId: req.body.userId
      };
    }

    // Validate required fields first before any caching
    if (!actualQuizData || typeof actualQuizData !== 'object') {
      console.log(`❌ [${requestId}] VALIDATION FAILED: Quiz data is required`);
      return res.status(400).json({
        success: false,
        message: "Quiz data is required"
      });
    }

    if (!actualQuizData.title || actualQuizData.title.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Quiz title is required"
      });
    }

    if (!Array.isArray(actualQuizData.questions) || actualQuizData.questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Quiz must have at least one question",
        debug: {
          receivedQuestionsLength: actualQuizData.questions?.length || 0,
          questionsType: typeof actualQuizData.questions,
          hint: "Questions array is empty. Check frontend data transfer from upload to save."
        }
      });
    }

    // Create processing key to prevent concurrent execution
    const processingKey = `${actualQuizData.title.trim()}-${req.user?.id || 'anonymous'}-${Date.now()}`;

    // Check if same quiz is currently being processed
    const existingProcessing = Array.from(processingQuizzes).find(key => 
      key.includes(actualQuizData.title.trim()) && 
      key.includes(req.user?.id || 'anonymous')
    );
    
    if (existingProcessing) {
      console.log(`🔒 [${requestId}] Quiz is currently being processed: ${existingProcessing}`);
      return res.status(429).json({
        success: false,
        message: "This quiz is currently being processed. Please wait a moment and try again.",
        processingKey: existingProcessing
      });
    }
    
    // Add to processing set
    processingQuizzes.add(processingKey);

    // Create a more robust cache key using content hash
    const contentToHash = JSON.stringify({
      title: actualQuizData.title.trim(),
      questionCount: actualQuizData.questions.length,
      firstQuestionContent: actualQuizData.questions[0]?.content || '',
      userId: req.user?.id || 'anonymous',
      courseId: courseId || 'none'
    });
    
    const crypto = require('crypto');
    const contentHash = crypto.createHash('md5').update(contentToHash).digest('hex').substring(0, 16);
    const cacheKey = `quiz-create-${contentHash}`;
    
    // Check for recent duplicate request with extended time window
    if (requestCache.has(cacheKey)) {
      const lastRequest = requestCache.get(cacheKey);
      const timeDiff = Date.now() - lastRequest;
      if (timeDiff < 10000) { // Increased to 10 seconds for better protection
        console.log(`🚨 [${requestId}] DUPLICATE REQUEST BLOCKED! Last request ${timeDiff}ms ago`);
        console.log(`🔍 [${requestId}] Cache key: ${cacheKey}`);
        
        // Try to find the quiz that was created by the previous request
        const recentQuiz = await Quiz.findOne({
          title: actualQuizData.title.trim(),
          userId: req.user?.id || null,
          createdAt: { $gte: new Date(Date.now() - 15000) } // Within last 15 seconds
        }).sort({ createdAt: -1 });
        
        if (recentQuiz) {
          console.log(`📋 [${requestId}] Found recent quiz from cache: ${recentQuiz._id}`);
          processingQuizzes.delete(processingKey); // Clean up before return
          return res.status(200).json({
            success: true,
            message: "Quiz already exists (cache duplicate prevention)",
            data: {
              quizId: recentQuiz._id,
              title: recentQuiz.title,
              questionsCount: recentQuiz.questions.length,
              courseId: recentQuiz.courseId,
              isDuplicate: true,
              preventedBy: "cache",
              timeDifference: timeDiff
            }
          });
        }
        
        processingQuizzes.delete(processingKey); // Clean up before return
        return res.status(429).json({
          success: false,
          message: "Duplicate request detected. Please wait before trying again.",
          lastRequestTime: lastRequest,
          timeDiff: timeDiff
        });
      }
    }
    
    // Store current request in cache with extended expiry
    requestCache.set(cacheKey, Date.now());

    // If quizData is missing, check if data is sent directly in request body
    if (!quizData && req.body.title && req.body.questions) {
      actualQuizData = {
        title: req.body.title,
        description: req.body.description,
        questions: req.body.questions,
        roleCreated: req.body.roleCreated || "instructor",
        userId: req.body.userId
      };
    }

    // Validate required fields
    if (!actualQuizData || typeof actualQuizData !== 'object') {
      console.log(`❌ [${requestId}] VALIDATION FAILED: Quiz data is required`);
      return res.status(400).json({
        success: false,
        message: "Quiz data is required"
      });
    }

    if (!actualQuizData.title || actualQuizData.title.trim() === "") {
      console.log(`❌ [${requestId}] VALIDATION FAILED: Quiz title is required`);
      return res.status(400).json({
        success: false,
        message: "Quiz title is required"
      });
    }

    if (!Array.isArray(actualQuizData.questions) || actualQuizData.questions.length === 0) {
      console.log(`❌ [${requestId}] VALIDATION FAILED: Quiz must have at least one question`);
      return res.status(400).json({
        success: false,
        message: "Quiz must have at least one question"
      });
    }

    // Validate courseId if provided - MOVE THIS BEFORE USING validCourseId
    let validCourseId = null;
    if (courseId && courseId !== "undefined" && courseId !== "null" && courseId.trim() !== "") {
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Course ID format"
        });
      }

      // Verify course exists
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found"
        });
      }
      validCourseId = courseId;
    }

    // Create quiz in database
    const mongoose = require('mongoose');
    const session = await mongoose.startSession();
    
    let savedQuiz;
    let createdLesson = null;
    
    try {
      await session.withTransaction(async () => {
        // Create quiz in database within transaction
        const newQuiz = new Quiz({
          courseId: validCourseId,
          title: actualQuizData.title.trim(),
          description: actualQuizData.description || "",
          questions: actualQuizData.questions, // Ensure questions are saved
          roleCreated: actualQuizData.roleCreated || "instructor",
          userId: req.user?.id || actualQuizData.userId || null
        });

        savedQuiz = await newQuiz.save({ session });

        // Auto-create lesson if requested - within same transaction
        if (autoCreateLesson === 'true' && sectionId && validCourseId) {
          if (mongoose.Types.ObjectId.isValid(sectionId)) {
            // Check if section exists
            const section = await Section.findById(sectionId).populate('lessons').session(session);
            if (section && section.courseId.toString() === validCourseId) {
              // Calculate lesson order
              const lessonOrder = section.lessons.length > 0 
                ? Math.max(...section.lessons.map(l => l.order || 0)) + 1 
                : 1;

              // Create lesson for this quiz
              const newLesson = new Lesson({
                courseId: validCourseId,
                sectionId: sectionId,
                title: lessonTitle || savedQuiz.title,
                description: savedQuiz.description,
                type: "quiz",
                quizIds: [savedQuiz._id],
                order: lessonOrder
              });

              createdLesson = await newLesson.save({ session });

              // Update quiz with lessonId
              savedQuiz.lessonId = createdLesson._id;
              await savedQuiz.save({ session });

              // Add lesson to section
              section.lessons.push(createdLesson._id);
              await section.save({ session });
            }
          }
        }
      });
      
    } catch (transactionError) {
      throw transactionError;
    } finally {
      await session.endSession();
    }

    const responseData = {
      quizId: savedQuiz._id,
      title: savedQuiz.title,
      description: savedQuiz.description,
      questionsCount: savedQuiz.questions.length,
      courseId: validCourseId,
      requestId: requestId, // Include request ID for tracking
      // Include lesson info if created
      lesson: createdLesson ? {
        lessonId: createdLesson._id,
        lessonTitle: createdLesson.title,
        sectionId: createdLesson.sectionId,
        order: createdLesson.order,
        type: createdLesson.type
      } : null
    };

    // Remove from processing set before responding
    processingQuizzes.delete(processingKey);

    res.status(201).json({
      success: true,
      message: createdLesson 
        ? `Quiz and lesson created successfully` 
        : `Quiz created successfully`,
      data: responseData
    });

  } catch (error) {
    
    // Clean up processing key on error
    if (typeof processingKey !== 'undefined') {
      processingQuizzes.delete(processingKey);
      console.log(`🔓 [${requestId}] Cleaned up processing key on error: ${processingKey}`);
    }
    
    res.status(500).json({
      success: false,
      message: "Server error while creating quiz",
      error: error.message
    });
  }
};

/**
 * @desc    Submit quiz answers and calculate score
 * @route   POST /api/quiz/:quizId/submit
 * @access  Private (Student)
 */
exports.submitQuiz = async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const { quizId } = req.params;
    const { answers } = req.body; // Array of { questionIndex: number, selectedAnswers: [indices] }
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Quiz ID format"
      });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: "Answers must be an array"
      });
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found"
      });
    }

    if (!quiz.questions || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Quiz has no questions",
        debug: {
          hasQuestions: !!quiz.questions,
          isArray: Array.isArray(quiz.questions),
          length: quiz.questions?.length || 0
        }
      });
    }

    let existingResult = await StudentQuizResult.findOne({
      userId: userId,
      quizId: quizId
    });

    let totalQuestions = quiz.questions.length;
    let correctAnswers = 0;
    let questionResults = [];

    for (let i = 0; i < answers.length; i++) {
      const userAnswer = answers[i];
      const questionIndex = userAnswer.questionIndex;
      const selectedAnswers = userAnswer.selectedAnswers || [];

      // Validate question index
      if (questionIndex < 0 || questionIndex >= totalQuestions) {
        continue;
      }

      const question = quiz.questions[questionIndex];

      // Check if question has answers array
      if (!question.answers || !Array.isArray(question.answers)) {
        questionResults.push({
          questionIndex: questionIndex,
          questionContent: question.content || "No content",
          userAnswers: selectedAnswers.map(index => ({ index, content: "Invalid answer structure" })),
          correctAnswers: [],
          isCorrect: false,
          error: "Question has no answers array"
        });
        continue;
      }
      
      const correctAnswerIndices = question.answers.reduce((indices, answer, index) => {
        if (answer && answer.isCorrect) indices.push(index);
        return indices;
      }, []);

      const isCorrect = 
        selectedAnswers.length === correctAnswerIndices.length &&
        selectedAnswers.every(index => correctAnswerIndices.includes(index)) &&
        correctAnswerIndices.every(index => selectedAnswers.includes(index));

      if (isCorrect) correctAnswers++;

      questionResults.push({
        questionIndex: questionIndex,
        questionContent: question.content || "No content",
        userAnswers: selectedAnswers.map(index => ({
          index: index,
          content: question.answers && question.answers[index] ? question.answers[index].content : "Invalid answer"
        })),
        correctAnswers: correctAnswerIndices.map(index => ({
          index: index,
          content: question.answers && question.answers[index] ? question.answers[index].content : "Invalid answer"
        })),
        isCorrect: isCorrect
      });
    }
    
    // Calculate percentage score
    const scorePercentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    const passed = scorePercentage >= 80;
    
    if (existingResult) {
      // Update existing result
      existingResult.score = scorePercentage;
      existingResult.takenAt = new Date();
      existingResult.details = {
        totalQuestions: totalQuestions,
        correctAnswers: correctAnswers,
        scorePercentage: scorePercentage,
        passed: passed,
        questionResults: questionResults
      };

      await existingResult.save();

      return res.status(200).json({
        success: true,
        message: `Quiz retaken successfully. Score: ${scorePercentage}% ${passed ? '(PASSED)' : '(FAILED - Need 80% to pass)'}`,
        data: {
          resultId: existingResult._id,
          quizId: quizId,
          score: scorePercentage,
          totalQuestions: totalQuestions,
          correctAnswers: correctAnswers,
          passed: passed,
          passingScore: 80,
          takenAt: existingResult.takenAt,
          questionResults: questionResults
        }
      });
    } else {
      // Save new result
      const quizResult = new StudentQuizResult({
        userId: userId,
        quizId: quizId,
        score: scorePercentage,
        takenAt: new Date(),
        details: {
          totalQuestions: totalQuestions,
          correctAnswers: correctAnswers,
          scorePercentage: scorePercentage,
          passed: passed,
          questionResults: questionResults
        }
      });

      const savedResult = await quizResult.save();

      res.status(201).json({
        success: true,
        message: `Quiz submitted successfully. Score: ${scorePercentage}% ${passed ? '(PASSED)' : '(FAILED - Need 80% to pass)'}`,
        data: {
          resultId: savedResult._id,
          quizId: quizId,
          score: scorePercentage,
          totalQuestions: totalQuestions,
          correctAnswers: correctAnswers,
          passed: passed,
          passingScore: 80,
          takenAt: savedResult.takenAt,
          questionResults: questionResults
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "An error occurred while submitting the quiz",
      error: error.message
    });
  }
};

/**
 * @desc    Get quiz result for a specific quiz submission
 * @route   GET /api/quiz/:quizId/result
 * @access  Private (Student)
 */
exports.getQuizResult = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user.id;
    
    // Validate quizId
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Quiz ID format"
      });
    }
    
    // Get quiz result
    const result = await StudentQuizResult.findOne({
      userId: userId,
      quizId: quizId
    }).populate('quizId', 'title description')
      .populate('userId', 'firstName lastName');
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Quiz result not found. You haven't submitted this quiz yet."
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        resultId: result._id,
        quiz: result.quizId,
        user: result.userId,
        score: result.score,
        passed: result.score >= 80,
        passingScore: 80,
        takenAt: result.takenAt,
        details: result.details
      }
    });
    
  } catch (error) {
    console.error("Error in getQuizResult:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * @desc    Get quiz history for current user
 * @route   GET /api/quiz/my-results
 * @access  Private (Student)
 */
exports.getMyQuizHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, courseId } = req.query;
    
    // Build query
    let query = { userId: userId };
    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      // First get all quizzes for the course
      const courseQuizzes = await Quiz.find({ courseId: courseId }).select('_id');
      const quizIds = courseQuizzes.map(quiz => quiz._id);
      query.quizId = { $in: quizIds };
    }
    
    const skip = (page - 1) * limit;
    
    // Get results with pagination
    const results = await StudentQuizResult.find(query)
      .populate({
        path: 'quizId',
        select: 'title description courseId',
        populate: {
          path: 'courseId',
          select: 'title'
        }
      })
      .sort({ takenAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await StudentQuizResult.countDocuments(query);
    
    // Format results
    const formattedResults = results.map(result => ({
      resultId: result._id,
      quiz: {
        id: result.quizId._id,
        title: result.quizId.title,
        description: result.quizId.description,
        course: result.quizId.courseId ? {
          id: result.quizId.courseId._id,
          title: result.quizId.courseId.title
        } : null
      },
      score: result.score,
      passed: result.score >= 80,
      takenAt: result.takenAt,
      summary: result.details ? {
        totalQuestions: result.details.totalQuestions,
        correctAnswers: result.details.correctAnswers
      } : null
    }));
    
    res.status(200).json({
      success: true,
      data: {
        results: formattedResults,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalResults: total,
          hasNextPage: skip + results.length < total,
          hasPrevPage: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error("Error in getMyQuizHistory:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};