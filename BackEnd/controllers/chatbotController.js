const { GoogleGenerativeAI } = require("@google/generative-ai");
const mongoose = require('mongoose');

// Import các model cần thiết để truy vấn
const Course = require("../models/courseModel");
const User = require("../models/userModel");
const Category = require("../models/categoryModel");
const Enrollment = require("../models/enrollmentModel");
const Transaction = require("../models/transactionModel");

// Khởi tạo Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// --- CẬP NHẬT SONG NGỮ ---
// Mô tả Schema cho Gemini hiểu (Mô tả song ngữ)
const schemaDescription = `
You have access to a MongoDB database with the following collections and schemas:

1.  **courses**: Stores course information / Lưu trữ thông tin về các khóa học.
    -   title (String): The title of the course / Tiêu đề của khóa học.
    -   price (Number): The price of the course in VND / Giá của khóa học (đơn vị: VNĐ).
    -   level (String, enum: ['beginner', 'intermediate', 'advanced', 'all']): Difficulty level / Cấp độ khó.
    -   language (String): The language of the course (e.g., 'vietnam', 'english') / Ngôn ngữ của khóa học.
    -   categoryIds (Array of ObjectId): References to the 'categories' collection / Tham chiếu đến collection 'categories'.
    -   studentsEnrolled (Array of ObjectId): IDs of enrolled students / Mảng ID của học viên đã đăng ký.
    -   createdAt (Date): The creation date / Ngày tạo khóa học.
    -   rating (Number): The average rating / Đánh giá trung bình.

2.  **users**: Stores user information / Lưu trữ thông tin người dùng.
    -   firstName (String): User's first name / Tên.
    -   lastName (String): User's last name / Họ.
    -   role (String, enum: ['student', 'admin']): User role / Vai trò người dùng.
    -   status (String, enum: ['verified', 'unverified', 'banned']): Account status / Trạng thái tài khoản.
    -   createdAt (Date): Registration date / Ngày đăng ký.

3.  **categories**: Stores course categories / Lưu trữ danh mục khóa học.
    -   name (String): The name of the category (e.g., 'Programming', 'Lập trình').

4.  **enrollments**: Links users to enrolled courses / Liên kết người dùng và khóa học.
    -   userId (ObjectId): Reference to the user / Tham chiếu đến người dùng.
    -   courseId (ObjectId): Reference to the course / Tham chiếu đến khóa học.
    -   createdAt (Date): The date of enrollment / Ngày đăng ký.

5.  **transactions**: Stores payment transactions / Lưu trữ các giao dịch thanh toán.
    -   amount (Number): Transaction amount / Số tiền giao dịch.
    -   status (String, enum: ['completed', 'pending', 'failed']): Transaction status / Trạng thái giao dịch.
    -   createdAt (Date): The date of the transaction / Ngày giao dịch.
`;

// --- CẬP NHẬT SONG NGỮ ---
const systemPrompt = `
You are a helpful and friendly bilingual chatbot for an e-learning platform called F-Learning.
**Your most important rule is to detect the language of the user's question (Vietnamese or English) and respond in that SAME language.**

Analyze the user's question.
- If it's a general knowledge question (e.g., "What is JavaScript?" or "ReactJS là gì?"), answer it directly in the original language.
- If the question requires data from the F-Learning database, you MUST respond ONLY with a JSON object in the following format:
  {
    "collection": "collection_name_to_query",
    "query": { "mongodb_find_query_object" },
    "options": { "mongodb_find_options_like_sort_limit" }
  }

- The "collection" must be one of the collections described in the schema.
- The "query" should be a valid MongoDB 'find' query object. Use operators like $regex for searching text. For example, to find courses with 'React' in the title, use: { "title": { "$regex": "react", "$options": "i" } }.
- The "options" can include 'limit', 'sort', 'select'. Default limit is 10.
- Do NOT add any text or explanation before or after the JSON object.

Example Questions and expected responses:
- User (Vietnamese): "Liệt kê 5 người dùng gần đây" -> { "collection": "users", "query": {}, "options": { "sort": { "createdAt": -1 }, "limit": 5, "select": "firstName lastName email createdAt" } }
- User (English): "List the 5 most recent users" -> { "collection": "users", "query": {}, "options": { "sort": { "createdAt": -1 }, "limit": 5, "select": "firstName lastName email createdAt" } }
- User (Vietnamese): "Kể cho tôi một câu chuyện cười" -> You should tell a joke in Vietnamese.
- User (English): "Tell me a joke" -> You should tell a joke in English.
`;

exports.handleQuery = async (req, res) => {
    try {
        const userPrompt = req.body.prompt;
        if (!userPrompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        const fullPromptForAnalysis = `${systemPrompt}\n\n${schemaDescription}\n\nUser Question: "${userPrompt}"`;
        
        // --- Step 1: Gemini analyzes the prompt ---
        let analysisResult = await model.generateContent(fullPromptForAnalysis);
        let analysisText = analysisResult.response.text().trim();

        // --- Step 2: Check if Gemini returned a query or a direct answer ---
        let queryJson;
        try {
            const jsonString = analysisText.replace(/```json/g, '').replace(/```/g, '').trim();
            queryJson = JSON.parse(jsonString);
        } catch (e) {
            // It's a direct answer, not a query
            return res.json({ reply: analysisText });
        }

        // --- Step 3: If it's a query, execute it ---
        if (queryJson && queryJson.collection && queryJson.query) {
            const { collection, query, options = {} } = queryJson;
            
            const modelMap = {
                'courses': Course,
                'users': User,
                'categories': Category,
                'enrollments': Enrollment,
                'transactions': Transaction,
            };

            const dbModel = modelMap[collection];
            if (!dbModel) {
                return res.status(400).json({ error: `Invalid collection: ${collection}` });
            }

            const limit = options.limit || 10;
            const sort = options.sort || {};
            const select = options.select || '';

            const dbResults = await dbModel.find(query).limit(limit).sort(sort).select(select).lean();
            
            if (!dbResults || dbResults.length === 0) {
                // --- CẬP NHẬT SONG NGỮ ---
                return res.json({ reply: "I couldn't find any information for that question. / Tôi không thể tìm thấy thông tin nào cho câu hỏi này." });
            }
            
            // --- Step 4: Ask Gemini to summarize the data into a friendly response ---
            // --- CẬP NHẬT SONG NGỮ ---
            const promptForSummary = `
                Based on the user's original question and the data I retrieved, please formulate a friendly and natural-sounding response.
                **IMPORTANT: Respond in the same language as the "Original Question" (Vietnamese or English).**

                Original Question: "${userPrompt}"

                Retrieved Data (JSON):
                ${JSON.stringify(dbResults, null, 2)}

                Your Response (in the original language):
            `;

            const summaryResult = await model.generateContent(promptForSummary);
            const finalReply = summaryResult.response.text();
            
            return res.json({ reply: finalReply });
        } else {
             // Fallback if the JSON is malformed but was parsed
             res.json({ reply: analysisText });
        }

    } catch (error) {
        console.error("Chatbot Error:", error);
        res.status(500).json({ error: "An error occurred while processing your request." });
    }
};