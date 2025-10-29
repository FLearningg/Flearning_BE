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
3. Each question should have 4 answer options (for multiple-choice)
4. Make sure all answer options are plausible but only one is correct
5. Difficulty level: ${difficulty}
   - Easy: Basic recall and understanding
   - Medium: Application and analysis
   - Hard: Synthesis and evaluation
6. Avoid trivial questions - focus on important learning objectives
7. Use clear, professional language
8. Ensure questions are unambiguous`;

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

  // Add JSON format specification
  prompt += `\n\nOUTPUT FORMAT:
Return the response in the following JSON format ONLY (no markdown, no code blocks, no extra text):
{
  "questions": [
    {
      "content": "Question text here?",
      "type": "${questionType === 'true-false' ? 'true-false' : 'multiple-choice'}",
      "score": 10,
      "answers": [
        {
          "content": "Answer option 1",
          "isCorrect": false
        },
        {
          "content": "Answer option 2",
          "isCorrect": true
        },
        {
          "content": "Answer option 3",
          "isCorrect": false
        },
        {
          "content": "Answer option 4",
          "isCorrect": false
        }
      ]
    }
  ]
}

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

      // Set defaults
      q.type = q.type || 'multiple-choice';
      q.score = q.score || 10;
    });

    return parsed.questions;

  } catch (error) {
    console.error('Failed to parse quiz response:', error.message);
    console.error('Raw content:', content);
    throw new Error(`Failed to parse AI response: ${error.message}`);
  }
}

module.exports = {
  generateQuizQuestions
};
