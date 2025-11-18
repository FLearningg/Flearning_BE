require("dotenv").config();

const MODEL = "gemini-2.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// Use dynamic import for node-fetch
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

/**
 * Call Gemini API with retry mechanism and exponential backoff
 * @param {Object} requestBody - The request body for Gemini API
 * @param {Object} options - Configuration options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in ms for exponential backoff (default: 1000)
 * @param {number} options.timeout - Request timeout in ms (default: 30000)
 * @param {string} options.apiUrl - Custom API URL (optional)
 * @returns {Promise<Object>} - Gemini API response
 */
async function callGeminiAPI(requestBody, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    timeout = 30000,
    apiUrl = GEMINI_API_URL,
  } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🤖 Gemini API - Attempt ${attempt}/${maxRetries}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check for rate limiting or server errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => "No error details");

        console.error(`🚨 Gemini API error (Attempt ${attempt}):`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText.substring(0, 200), // Log first 200 chars
        });

        // Retry on 503 (Service Unavailable) or 429 (Rate Limit)
        if (
          (response.status === 503 || response.status === 429) &&
          attempt < maxRetries
        ) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`⏳ Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        // Throw error for non-retryable errors
        throw new GeminiAPIError(
          `API request failed with status ${response.status}`,
          response.status,
          errorText
        );
      }

      const result = await response.json();

      // Validate response structure
      if (!result.candidates || !result.candidates[0]?.content?.parts[0]?.text) {
        console.error("🚨 Invalid Gemini response structure:", JSON.stringify(result).substring(0, 300));

        // Check if content was blocked
        if (result.promptFeedback?.blockReason) {
          console.error("🚫 Content blocked:", result.promptFeedback.blockReason);
          throw new GeminiAPIError(
            `Content blocked: ${result.promptFeedback.blockReason}`,
            "CONTENT_BLOCKED",
            result.promptFeedback
          );
        }

        // Retry on invalid response
        if (attempt < maxRetries) {
          console.log(`⏳ Retrying due to invalid response...`);
          await sleep(baseDelay);
          continue;
        }

        throw new GeminiAPIError(
          "Invalid response structure from Gemini API",
          "INVALID_RESPONSE",
          result
        );
      }

      console.log(`✅ Gemini API success on attempt ${attempt}`);
      return result;
    } catch (error) {
      // Handle timeout errors
      if (error.name === "AbortError") {
        console.error(`🚨 Request timeout (Attempt ${attempt})`);

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        throw new GeminiAPIError("Request timeout", "TIMEOUT", error);
      }

      // If it's already a GeminiAPIError, rethrow it
      if (error instanceof GeminiAPIError) {
        throw error;
      }

      console.error(`🚨 Gemini API error (Attempt ${attempt}):`, error.message);

      // Retry on network errors
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      // All retries exhausted
      throw new GeminiAPIError(
        `All retry attempts exhausted: ${error.message}`,
        "MAX_RETRIES_EXCEEDED",
        error
      );
    }
  }

  // Should never reach here, but just in case
  throw new GeminiAPIError(
    "Unexpected error in callGeminiAPI",
    "UNEXPECTED_ERROR"
  );
}

/**
 * Parse JSON response from Gemini API text
 * @param {string} responseText - Raw text response from Gemini
 * @returns {Object|Array} - Parsed JSON object or array
 */
function parseGeminiJSON(responseText) {
  try {
    return JSON.parse(responseText);
  } catch (parseError) {
    console.error("🚨 Failed to parse Gemini response as JSON:", parseError.message);
    console.error("🚨 Response text preview:", responseText.substring(0, 200));

    // Try to fix truncated JSON
    let fixedJson = responseText;

    // Remove markdown code blocks if present
    fixedJson = fixedJson.replace(/^```json\s*/i, "").replace(/\s*```$/, "");

    // Handle "Unexpected non-whitespace character after JSON" - truncate at the error position
    if (parseError.message.includes("Unexpected non-whitespace character")) {
      // Try to find the last complete object before truncation
      const lastCloseBrace = fixedJson.lastIndexOf("}");
      if (lastCloseBrace > 0) {
        // Check if there's a closing bracket after
        const afterBrace = fixedJson.substring(lastCloseBrace + 1).trim();
        if (afterBrace.startsWith(",") || afterBrace.startsWith("]")) {
          // Already has proper structure, just need to close array
          fixedJson = fixedJson.substring(0, lastCloseBrace + 1) + "\n]";
        } else {
          // Find where the incomplete part starts
          const lastComma = fixedJson.lastIndexOf(",", lastCloseBrace);
          if (lastComma > 0) {
            // Truncate at last comma and close array
            fixedJson = fixedJson.substring(0, lastComma) + "\n]";
          } else {
            // Just close after the last complete object
            fixedJson = fixedJson.substring(0, lastCloseBrace + 1) + "\n]";
          }
        }
      }
    }

    // If JSON is truncated, try to close it properly
    if (
      parseError.message.includes("Unterminated string") ||
      parseError.message.includes("Unexpected end")
    ) {
      // Find the last complete object
      const lastCompleteObjectMatch = fixedJson.match(/.*}(?=\s*,?\s*\{)/g);
      if (lastCompleteObjectMatch) {
        const lastCompleteIndex =
          fixedJson.lastIndexOf(
            lastCompleteObjectMatch[lastCompleteObjectMatch.length - 1]
          ) + lastCompleteObjectMatch[lastCompleteObjectMatch.length - 1].length;
        fixedJson = fixedJson.substring(0, lastCompleteIndex) + "\n]";
      } else {
        // Find last complete object by looking for closing brace
        const lastCloseBrace = fixedJson.lastIndexOf("}");
        if (lastCloseBrace > 0) {
          fixedJson = fixedJson.substring(0, lastCloseBrace + 1) + "\n]";
        } else {
          // Try to close the current object and array
          fixedJson = fixedJson.replace(/,?\s*$/, "") + '"}]';
        }
      }
    }

    try {
      return JSON.parse(fixedJson);
    } catch (fixError) {
      console.error("🚨 Failed to parse fixed JSON:", fixError.message);
      throw new GeminiAPIError(
        "Could not parse JSON from Gemini response",
        "JSON_PARSE_ERROR",
        { originalError: parseError, responseText: responseText.substring(0, 500) }
      );
    }
  }
}

/**
 * Extract text from Gemini API response
 * @param {Object} result - Gemini API response
 * @returns {string} - Extracted text
 */
function extractTextFromResponse(result) {
  if (!result.candidates || !result.candidates[0]?.content?.parts[0]?.text) {
    throw new GeminiAPIError(
      "Invalid response structure",
      "INVALID_RESPONSE",
      result
    );
  }
  return result.candidates[0].content.parts[0].text;
}

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Custom error class for Gemini API errors
 */
class GeminiAPIError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = "GeminiAPIError";
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
    };
  }
}

/**
 * Build standard Gemini request body
 * @param {Object} options - Configuration options
 * @param {string} options.systemInstruction - System instruction text
 * @param {string} options.userPrompt - User prompt text
 * @param {Object} options.generationConfig - Generation configuration (optional)
 * @returns {Object} - Request body for Gemini API
 */
function buildGeminiRequestBody(options) {
  const {
    systemInstruction,
    userPrompt,
    generationConfig = {},
  } = options;

  return {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.5,
      topP: 0.9,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      ...generationConfig,
    },
  };
}

module.exports = {
  callGeminiAPI,
  parseGeminiJSON,
  extractTextFromResponse,
  buildGeminiRequestBody,
  GeminiAPIError,
  GEMINI_API_URL,
  MODEL,
};
