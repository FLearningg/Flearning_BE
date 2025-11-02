const axios = require('axios');

/**
 * OpenRouter AI Service for quiz generation
 * Uses Gemini 2.5 Flash model through OpenRouter API
 */

const OPENROUTER_CONFIG = {
  apiKey: process.env.QUIZAI_API_KEY,
  baseURL: process.env.QUIZAI_BASE_URL || 'https://ai.121628.xyz/v1/chat/completions',
  model: process.env.QUIZAI_MODEL || 'gemini-2.5-flash'
};

// Validate API key is configured
if (!OPENROUTER_CONFIG.apiKey) {
  console.warn('⚠️ QUIZAI_API_KEY not configured in environment variables');
}

/**
 * Generate quiz questions using OpenRouter AI
 * @param {Object} params - Generation parameters
 * @param {string} params.topic - Topic/subject for quiz
 * @param {string} params.lessonContent - Optional lesson content for context
 * @param {number} params.numberOfQuestions - Number of questions to generate
 * @param {string} params.difficulty - Difficulty level (easy, medium, hard)
 * @param {string} params.questionType - Type of questions (multiple-choice, true-false, mixed)
 * @returns {Promise<Array>} Generated questions array
 */
async function generateQuizQuestions(params) {
  const {
    topic,
    lessonContent = '',
    numberOfQuestions = 5,
    difficulty = 'medium',
    questionType = 'multiple-choice'
  } = params;

  const prompt = buildQuizGenerationPrompt({
    topic,
    lessonContent,
    numberOfQuestions,
    difficulty,
    questionType
  });

  try {
    const response = await axios.post(
      OPENROUTER_CONFIG.baseURL,
      {
        model: OPENROUTER_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert educational content creator specializing in creating high-quality quiz questions for online courses. Generate questions that are clear, educational, and properly formatted.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Extract content from response
    const content = response.data.choices[0].message.content;

    // Parse JSON response
    const questions = parseQuizResponse(content);

    return questions;

  } catch (error) {
    console.error('OpenRouter API Error:', error.response?.data || error.message);
    throw new Error(`Failed to generate quiz: ${error.message}`);
  }
}

/**
 * Build prompt for quiz generation
 */
function buildQuizGenerationPrompt({ topic, lessonContent, numberOfQuestions, difficulty, questionType }) {
  let prompt = '';

  // Determine if we have lesson content to analyze
  const hasLessonContent = lessonContent && lessonContent.trim().length > 0;

  if (hasLessonContent) {
    // With lesson content - create contextual questions
    prompt = `You are creating a quiz based on specific lesson content.

LESSON CONTENT:
---
${lessonContent.substring(0, 4000)}
---

TASK: Generate ${numberOfQuestions} ${difficulty} level ${questionType} questions that test understanding of the LESSON CONTENT above.

REQUIREMENTS:
1. Questions MUST be directly based on the lesson content provided
2. Test key concepts, definitions, and principles from the lesson
3. Question types:
   - multiple-choice: 4 answer options, only one correct
   - true-false: 2 options (True/False)
   - essay: Open-ended question with grading guideline
   - mixed: Mix of multiple-choice, true-false, and essay
4. Make sure all answer options are plausible but only one is correct (for MC/TF)
5. For essay questions, provide clear grading guidelines
6. Difficulty level: ${difficulty}
   - Easy: Basic recall and understanding
   - Medium: Application and analysis
   - Hard: Synthesis and evaluation
7. Avoid trivial questions - focus on important learning objectives
8. Use clear, professional language
9. Ensure questions are unambiguous`;

  } else {
    // Without lesson content - create general questions about topic
    prompt = `You are creating a quiz about: ${topic}

TASK: Generate ${numberOfQuestions} ${difficulty} level ${questionType} questions about this topic.

REQUIREMENTS:
1. Create educational and meaningful questions
2. Each question should have 4 answer options (for multiple-choice)
3. Cover different aspects of the topic
4. Difficulty level: ${difficulty}
   - Easy: Basic concepts and definitions
   - Medium: Application and understanding
   - Hard: Advanced concepts and critical thinking
5. Questions should test understanding, not just memorization
6. Make questions relevant and practical
7. Use clear, professional language`;
  }

  // Add JSON format specification based on question type
  const isMixed = questionType === 'mixed';
  const hasEssay = questionType === 'essay' || isMixed;
  
  let formatExample = '';
  
  if (hasEssay && !isMixed) {
    // Pure essay questions
    formatExample = `{
  "questions": [
    {
      "content": "Essay question text here?",
      "type": "essay",
      "score": 10,
      "essayGuideline": "Grading criteria: 1) Content accuracy (40%), 2) Understanding (30%), 3) Completeness (20%), 4) Clarity (10%)",
      "essayMaxLength": 1000,
      "answers": []
    }
  ]
}`;
  } else if (isMixed) {
    // Mixed question types
    formatExample = `{
  "questions": [
    {
      "content": "Multiple choice question?",
      "type": "multiple-choice",
      "score": 10,
      "answers": [
        {"content": "Option 1", "isCorrect": false},
        {"content": "Option 2", "isCorrect": true},
        {"content": "Option 3", "isCorrect": false},
        {"content": "Option 4", "isCorrect": false}
      ]
    },
    {
      "content": "Essay question?",
      "type": "essay",
      "score": 15,
      "essayGuideline": "Clear grading criteria here",
      "essayMaxLength": 1000,
      "answers": []
    }
  ]
}`;
  } else {
    // Multiple choice or true-false
    formatExample = `{
  "questions": [
    {
      "content": "Question text here?",
      "type": "${questionType === 'true-false' ? 'true-false' : 'multiple-choice'}",
      "score": 10,
      "answers": [
        {"content": "Answer option 1", "isCorrect": false},
        {"content": "Answer option 2", "isCorrect": true},
        {"content": "Answer option 3", "isCorrect": false},
        {"content": "Answer option 4", "isCorrect": false}
      ]
    }
  ]
}`;
  }
  
  prompt += `\n\nOUTPUT FORMAT:
Return the response in the following JSON format ONLY (no markdown, no code blocks, no extra text):
${formatExample}

IMPORTANT:
- Generate exactly ${numberOfQuestions} questions
- Each question must have exactly ONE correct answer
- All questions must be in the same language as the lesson content
- Return ONLY the JSON, nothing else`;

  return prompt;
}

/**
 * Parse quiz response from AI
 */
function parseQuizResponse(content) {
  try {
    // Remove markdown code blocks if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/```\n?/g, '');
    }

    const parsed = JSON.parse(cleanContent);

    // Validate structure
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error('Invalid response structure: missing questions array');
    }

    // Validate each question
    parsed.questions.forEach((q, index) => {
      if (!q.content) throw new Error(`Question ${index + 1}: missing content`);
      
      // Set defaults
      q.type = q.type || 'multiple-choice';
      q.score = q.score || 10;
      
      // Validation based on question type
      if (q.type === 'essay') {
        // Essay questions validation
        if (!q.essayGuideline) {
          q.essayGuideline = 'Evaluate based on content accuracy, understanding, completeness, and clarity.';
        }
        if (!q.essayMaxLength) {
          q.essayMaxLength = 1000;
        }
        // Essay questions don't need answer options
        q.answers = q.answers || [];
      } else {
        // Multiple choice and true-false validation
        if (!q.answers || !Array.isArray(q.answers)) {
          throw new Error(`Question ${index + 1}: missing answers array`);
        }
        if (q.answers.length < 2) {
          throw new Error(`Question ${index + 1}: must have at least 2 answers`);
        }

        const correctAnswers = q.answers.filter(a => a.isCorrect);
        if (correctAnswers.length !== 1) {
          throw new Error(`Question ${index + 1}: must have exactly one correct answer`);
        }
      }
    });

    return parsed.questions;

  } catch (error) {
    console.error('Failed to parse quiz response:', error.message);
    console.error('Raw content:', content);
    throw new Error(`Failed to parse AI response: ${error.message}`);
  }
}

/**
 * Grade essay answer using AI
 * @param {Object} params - Grading parameters
 * @param {string} params.questionContent - The essay question
 * @param {string} params.studentAnswer - Student's essay answer
 * @param {string} params.essayGuideline - Grading criteria/guidelines
 * @param {number} params.maxScore - Maximum score for this question
 * @returns {Promise<Object>} Grading result with score and feedback
 */
async function gradeEssayAnswer(params) {
  const {
    questionContent,
    studentAnswer,
    essayGuideline,
    maxScore = 10
  } = params;

  const prompt = buildEssayGradingPrompt({
    questionContent,
    studentAnswer,
    essayGuideline,
    maxScore
  });

  try {
    const response = await axios.post(
      OPENROUTER_CONFIG.baseURL,
      {
        model: OPENROUTER_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert educator and grader. Your role is to fairly and objectively evaluate student essay answers based on provided criteria. Provide constructive feedback that helps students learn.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent grading
        max_tokens: 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Extract content from response
    const content = response.data.choices[0].message.content;

    // Parse JSON response
    const gradingResult = parseEssayGradingResponse(content, maxScore);

    return gradingResult;

  } catch (error) {
    console.error('OpenRouter Essay Grading Error:', error.response?.data || error.message);
    throw new Error(`Failed to grade essay: ${error.message}`);
  }
}

/**
 * Build prompt for essay grading
 */
function buildEssayGradingPrompt({ questionContent, studentAnswer, essayGuideline, maxScore }) {
  const prompt = `You are grading a student's essay answer.

QUESTION:
${questionContent}

GRADING CRITERIA:
${essayGuideline}

STUDENT'S ANSWER:
---
${studentAnswer}
---

TASK:
Evaluate the student's answer based on the grading criteria provided.

GRADING GUIDELINES:
1. Content Accuracy (40%): Is the information correct and relevant?
2. Understanding (30%): Does the student demonstrate clear understanding?
3. Completeness (20%): Does the answer cover all required points?
4. Clarity & Organization (10%): Is the answer well-structured and clear?

MAXIMUM SCORE: ${maxScore} points

OUTPUT FORMAT:
Return the response in the following JSON format ONLY (no markdown, no code blocks):
{
  "score": <number between 0 and ${maxScore}>,
  "percentage": <score as percentage 0-100>,
  "feedback": "Detailed feedback explaining the score, highlighting strengths and areas for improvement. Be constructive and encouraging.",
  "strengths": ["Strength 1", "Strength 2"],
  "improvements": ["Area to improve 1", "Area to improve 2"]
}

IMPORTANT:
- Be fair and objective
- Provide specific, actionable feedback
- Score should reflect the quality based on criteria
- Use Vietnamese if the answer is in Vietnamese, English if in English
- Return ONLY the JSON, nothing else`;

  return prompt;
}

/**
 * Parse essay grading response from AI
 */
function parseEssayGradingResponse(content, maxScore) {
  try {
    // Remove markdown code blocks if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/```\n?/g, '');
    }

    const parsed = JSON.parse(cleanContent);

    // Validate structure
    if (typeof parsed.score !== 'number') {
      throw new Error('Invalid response: missing or invalid score');
    }
    if (!parsed.feedback || typeof parsed.feedback !== 'string') {
      throw new Error('Invalid response: missing or invalid feedback');
    }

    // Ensure score is within bounds
    parsed.score = Math.max(0, Math.min(maxScore, parsed.score));
    
    // Calculate percentage if not provided
    if (typeof parsed.percentage !== 'number') {
      parsed.percentage = Math.round((parsed.score / maxScore) * 100);
    }

    // Ensure arrays exist
    parsed.strengths = parsed.strengths || [];
    parsed.improvements = parsed.improvements || [];

    return {
      score: parsed.score,
      percentage: parsed.percentage,
      feedback: parsed.feedback,
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      maxScore: maxScore
    };

  } catch (error) {
    console.error('Failed to parse essay grading response:', error.message);
    console.error('Raw content:', content);
    throw new Error(`Failed to parse AI grading response: ${error.message}`);
  }
}

module.exports = {
  generateQuizQuestions,
  gradeEssayAnswer
};
