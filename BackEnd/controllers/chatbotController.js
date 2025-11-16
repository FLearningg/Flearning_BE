const https = require('https');
const http = require('http');
const mongoose = require('mongoose');

// Import các model cần thiết để truy vấn (đúng tên file)
const Course = require("../models/courseModel");
const User = require("../models/userModel");
const Category = require("../models/categoryModel");
const Enrollment = require("../models/enrollmentModel");
const Transaction = require("../models/transactionModel");
const Quiz = require("../models/QuizModel");
const StudentQuizResult = require("../models/StudentQuizResult");
const Progress = require("../models/progressModel");
const Certificate = require("../models/certificateModel");
const Feedback = require("../models/feedbackModel");
const InstructorProfile = require("../models/instructorProfileModel");
const ProctoringSession = require("../models/proctoringSessionModel");
const Lesson = require("../models/lessonModel");
const Section = require("../models/sectionModel");

// OpenRouter Configuration
const openRouterApiKey = process.env.QUIZAI_API_KEY;
const openRouterBaseUrl = process.env.QUIZAI_BASE_URL;
const openRouterModel = process.env.QUIZAI_MODEL || 'gemini-2.5-flash';

// Helper function to call OpenRouter API
async function callOpenRouter(messages) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            model: openRouterModel,
            messages: messages,
            max_tokens: 8192,
            temperature: 0.7,
            top_p: 0.95,
            top_k: 40
        });

        const url = new URL(openRouterBaseUrl);
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openRouterApiKey}`,
                'Content-Length': Buffer.byteLength(postData),
                'HTTP-Referer': 'https://flearning.com',
                'X-Title': 'F-Learning Chatbot',
                'User-Agent': 'F-Learning-Backend/1.0'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`OpenRouter API Error: ${res.statusCode} - ${data}`));
                    return;
                }

                try {
                    const response = JSON.parse(data);
                    resolve(response.choices[0].message.content);
                } catch (error) {
                    reject(new Error(`Failed to parse OpenRouter response: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Request error: ${error.message}`));
        });

        req.write(postData);
        req.end();
    });
}

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
    -   instructorId (ObjectId): Reference to instructor / Tham chiếu đến giảng viên.

2.  **users**: Stores user information / Lưu trữ thông tin người dùng.
    -   firstName (String): User's first name / Tên.
    -   lastName (String): User's last name / Họ.
    -   email (String): User's email / Email người dùng.
    -   role (String, enum: ['student', 'instructor', 'admin']): User role / Vai trò người dùng.
    -   status (String, enum: ['verified', 'unverified', 'banned']): Account status / Trạng thái tài khoản.
    -   enrolledCourses (Array of ObjectId): References to the courses the user is enrolled in / Tham chiếu đến các khóa học người dùng đã đăng ký.
    -   createdAt (Date): Registration date / Ngày đăng ký.

3.  **categories**: Stores course categories / Lưu trữ danh mục khóa học.
    -   name (String): The name of the category (e.g., 'Programming', 'Lập trình').

4.  **transactions**: Stores payment transactions / Lưu trữ các giao dịch thanh toán.
    -   amount (Number): Transaction amount / Số tiền giao dịch.
    -   status (String, enum: ['completed', 'pending', 'failed']): Transaction status / Trạng thái giao dịch.
    -   createdAt (Date): The date of the transaction / Ngày giao dịch.

5.  **quizzes**: Stores quiz information / Lưu trữ thông tin bài quiz.
    -   title (String): Quiz title / Tiêu đề quiz.
    -   lessonId (ObjectId): Reference to lesson / Tham chiếu đến bài học.
    -   questions (Array): Quiz questions / Các câu hỏi.
    -   timeLimit (Number): Time limit in seconds / Giới hạn thời gian (giây).
    -   createdAt (Date): Creation date / Ngày tạo.

6.  **studentquizresults**: Stores quiz results / Lưu trữ kết quả làm quiz.
    -   studentId (ObjectId): Reference to student / Tham chiếu đến học sinh.
    -   quizId (ObjectId): Reference to quiz / Tham chiếu đến quiz.
    -   score (Number): Score achieved / Điểm đạt được.
    -   totalQuestions (Number): Total questions / Tổng số câu.
    -   isPassed (Boolean): Pass status / Trạng thái đậu/rớt.
    -   submittedAt (Date): Submission time / Thời gian nộp bài.

7.  **progress**: Stores student progress / Lưu trữ tiến độ học tập.
    -   studentId (ObjectId): Reference to student / Tham chiếu đến học sinh.
    -   courseId (ObjectId): Reference to course / Tham chiếu đến khóa học.
    -   completedLessons (Array): Completed lessons / Các bài học đã hoàn thành.
    -   progressPercentage (Number): Progress percentage / Phần trăm tiến độ.
    -   lastAccessed (Date): Last access time / Thời gian truy cập cuối.

8.  **certificates**: Stores certificates / Lưu trữ chứng chỉ.
    -   studentId (ObjectId): Reference to student / Tham chiếu đến học sinh.
    -   courseId (ObjectId): Reference to course / Tham chiếu đến khóa học.
    -   certificateId (String): Unique certificate ID / Mã chứng chỉ duy nhất.
    -   issuedAt (Date): Issue date / Ngày cấp.

9.  **feedbacks**: Stores course feedback / Lưu trữ đánh giá khóa học.
    -   studentId (ObjectId): Reference to student / Tham chiếu đến học sinh.
    -   courseId (ObjectId): Reference to course / Tham chiếu đến khóa học.
    -   rating (Number): Rating (1-5) / Đánh giá (1-5 sao).
    -   comment (String): Feedback comment / Bình luận đánh giá.
    -   createdAt (Date): Creation date / Ngày tạo.

10. **instructorprofiles**: Stores instructor information / Lưu trữ thông tin giảng viên.
    -   userId (ObjectId): Reference to user / Tham chiếu đến người dùng.
    -   bio (String): Biography / Tiểu sử.
    -   expertise (Array): Areas of expertise / Lĩnh vực chuyên môn.
    -   totalStudents (Number): Total students taught / Tổng số học viên.
    -   totalCourses (Number): Total courses created / Tổng số khóa học tạo.

11. **proctoringsessions**: Stores proctoring sessions / Lưu trữ phiên giám sát thi.
    -   studentId (ObjectId): Reference to student / Tham chiếu đến học sinh.
    -   quizId (ObjectId): Reference to quiz / Tham chiếu đến quiz.
    -   violations (Array): List of violations / Danh sách vi phạm.
    -   violationScore (Number): Total violation score / Tổng điểm vi phạm.
    -   status (String): Session status / Trạng thái phiên.
    -   startedAt (Date): Start time / Thời gian bắt đầu.
    -   endedAt (Date): End time / Thời gian kết thúc.

12. **lessons**: Stores lesson information / Lưu trữ thông tin bài học.
    -   title (String): Lesson title / Tiêu đề bài học.
    -   sectionId (ObjectId): Reference to section / Tham chiếu đến phần.
    -   content (String): Lesson content / Nội dung bài học.
    -   duration (Number): Duration in minutes / Thời lượng (phút).

13. **sections**: Stores course sections / Lưu trữ các phần của khóa học.
    -   title (String): Section title / Tiêu đề phần.
    -   courseId (ObjectId): Reference to course / Tham chiếu đến khóa học.
    -   order (Number): Display order / Thứ tự hiển thị.
`;

// Improved Smart AI Prompt
const systemPrompt = `
You are F-Learning Assistant - an intelligent, helpful, and friendly bilingual AI chatbot for the F-Learning e-learning platform.

## Core Rules:
1. **Language Detection**: ALWAYS detect and respond in the SAME language as the user's question (Vietnamese or English).
2. **Context Awareness**: Understand user intent, context, and provide relevant, conversational responses.
3. **Proactive Suggestions**: After answering any question, suggest relevant F-Learning courses or features.
4. **Natural Conversation**: Be friendly, supportive, and encouraging. Use emojis appropriately (📚 💡 🎯 ✨).

## Response Strategy:

### For General Knowledge Questions:
- Answer comprehensively and clearly in the user's language
- Provide examples and explanations when helpful
- Include practical tips and best practices
- ALWAYS end with relevant F-Learning course suggestions
- Be conversational and engaging

### For Database Queries:
When the user asks about F-Learning data (courses, instructors, progress, etc.), respond with ONLY this JSON format.
DO NOT include any explanations, descriptions, or additional text. ONLY return the JSON object.

{
  "collection": "collection_name",
  "query": { "mongodb_query" },
  "options": { "limit": 50, "sort": {}, "select": "" }
}

**CRITICAL SEARCH RULES - MUST FOLLOW:**
1. For course searches, ALWAYS use $regex with case-insensitive search on the "title" field
2. Use broad search patterns with multiple keywords separated by | (OR operator)
3. DO NOT return explanations - ONLY return the JSON object
4. DO NOT use markdown code blocks - ONLY return raw JSON

**Examples:**
- "khóa học về React" → {"collection":"courses","query":{"title":{"$regex":"react","$options":"i"}}}
- "course sức khỏe" → {"collection":"courses","query":{"title":{"$regex":"sức khỏe|yoga|health|fitness|thể dục|wellness","$options":"i"}}}
- "find python courses" → {"collection":"courses","query":{"title":{"$regex":"python","$options":"i"}}}
- "tìm khóa học lập trình" → {"collection":"courses","query":{"title":{"$regex":"lập trình|programming|code|dev","$options":"i"}}}

### Special User Data Rules:
- "my courses" / "khóa học của tôi" → { "collection": "users", "query": { "action": "get_enrolled_courses" } }
- "my progress" / "tiến độ" → { "collection": "progress", "query": { "studentId": "USER_ID" } }
- "my quiz results" / "kết quả quiz" → { "collection": "studentquizresults", "query": { "studentId": "USER_ID" } }
- "my certificates" / "chứng chỉ" → { "collection": "certificates", "query": { "studentId": "USER_ID" } }

Example Questions and expected responses:
- User (Vietnamese): "Liệt kê 5 người dùng gần đây" -> { "collection": "users", "query": {}, "options": { "sort": { "createdAt": -1 }, "limit": 5, "select": "firstName lastName email createdAt" } }
- User (English): "List the 5 most recent users" -> { "collection": "users", "query": {}, "options": { "sort": { "createdAt": -1 }, "limit": 5, "select": "firstName lastName email createdAt" } }
- User (Vietnamese): "Các khóa học của tôi" -> { "collection": "users", "query": { "action": "get_enrolled_courses" } }
- User (English): "My enrolled courses" -> { "collection": "users", "query": { "action": "get_enrolled_courses" } }
- User (Vietnamese): "Kết quả quiz của tôi" -> { "collection": "studentquizresults", "query": { "studentId": "USER_ID" }, "options": { "sort": { "submittedAt": -1 }, "limit": 10 } }
- User (English): "My quiz results" -> { "collection": "studentquizresults", "query": { "studentId": "USER_ID" }, "options": { "sort": { "submittedAt": -1 }, "limit": 10 } }
- User (Vietnamese): "Tiến độ học tập của tôi" -> { "collection": "progress", "query": { "studentId": "USER_ID" } }
- User (English): "My learning progress" -> { "collection": "progress", "query": { "studentId": "USER_ID" } }
- User (Vietnamese): "Chứng chỉ của tôi" -> { "collection": "certificates", "query": { "studentId": "USER_ID" } }
- User (English): "My certificates" -> { "collection": "certificates", "query": { "studentId": "USER_ID" } }
- User (Vietnamese): "Các giảng viên nổi bật" -> { "collection": "instructorprofiles", "query": {}, "options": { "sort": { "totalStudents": -1 }, "limit": 5 } }
- User (English): "Top instructors" -> { "collection": "instructorprofiles", "query": {}, "options": { "sort": { "totalStudents": -1 }, "limit": 5 } }
- User (Vietnamese): "Kể cho tôi một câu chuyện cười" -> You should tell a joke in Vietnamese.
- User (English): "Tell me a joke" -> You should tell a joke in English.
`;

exports.handleQuery = async (req, res) => {
    try {
        const userId = req.user?.id;
        const userPrompt = req.body.prompt;
        if (!userPrompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        const messages = [
            {
                role: "system",
                content: `${systemPrompt}\n\n${schemaDescription}`
            },
            {
                role: "user",
                content: `User Question: "${userPrompt}"`
            }
        ];

        let analysisResult = await callOpenRouter(messages);
        let analysisText = analysisResult.trim();

        // Log the AI response for debugging
        console.log("AI Response:", analysisText);

        let queryJson;
        try {
            // More robust JSON extraction
            let jsonString = analysisText;

            // Remove markdown code blocks
            jsonString = jsonString.replace(/```json\n?/g, '').replace(/```\n?/g, '');

            // Try to extract JSON object if there's text before/after it
            const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonString = jsonMatch[0];
            }

            jsonString = jsonString.trim();
            queryJson = JSON.parse(jsonString);

            console.log("Parsed Query JSON:", JSON.stringify(queryJson, null, 2));
        } catch (e) {
            console.log("Failed to parse as JSON, treating as general knowledge question");
            // Đây là câu trả lời kiến thức chung, không phải query database
            // Thêm gợi ý khóa học liên quan
            const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(userPrompt);
            
            // Trích xuất từ khóa chính từ câu hỏi
            const extractKeywords = (text) => {
                const stopWords = ['là', 'gì', 'là gì', 'what', 'is', 'how', 'why', 'the', 'a', 'an', 'tôi', 'mình', 'cho', 'về'];
                const words = text.toLowerCase().split(/\s+/);
                return words.filter(w => w.length > 3 && !stopWords.includes(w)).slice(0, 3);
            };
            
            const keywords = extractKeywords(userPrompt);
            
            // Tìm khóa học liên quan dựa trên từ khóa
            try {
                let relatedCourses = [];
                if (keywords.length > 0) {
                    const searchQuery = {
                        $or: keywords.map(keyword => ({
                            title: { $regex: keyword, $options: 'i' }
                        }))
                    };
                    relatedCourses = await Course.find(searchQuery).limit(3).select('title _id').lean();
                }
                
                // Tạo suggestion về khóa học
                let courseSuggestion = '';
                if (relatedCourses.length > 0) {
                    const clientUrl = process.env.CLIENT_URL;
                    if (isVietnamese) {
                        courseSuggestion = '\n\n📚 **Bạn có thể học thêm về chủ đề này tại F-Learning:**\n';
                        relatedCourses.forEach(course => {
                            courseSuggestion += `• [${course.title}](${clientUrl}/course/${course._id})\n`;
                        });
                    } else {
                        courseSuggestion = '\n\n📚 **You can learn more about this topic on F-Learning:**\n';
                        relatedCourses.forEach(course => {
                            courseSuggestion += `• [${course.title}](${clientUrl}/course/${course._id})\n`;
                        });
                    }
                } else {
                    // Không tìm thấy khóa học liên quan, gợi ý xem tất cả
                    const clientUrl = process.env.CLIENT_URL;
                    courseSuggestion = isVietnamese 
                        ? `\n\n📚 Khám phá các khóa học khác tại [F-Learning](${clientUrl}/courses)!`
                        : `\n\n📚 Explore more courses at [F-Learning](${clientUrl}/courses)!`;
                }
                
                return res.json({ reply: analysisText + courseSuggestion });
            } catch (err) {
                // Fallback nếu có lỗi khi tìm khóa học
                return res.json({ reply: analysisText });
            }
        }
        
        let dbResults;

        if (queryJson.query?.action === 'get_enrolled_courses') {
            if (!userId) {
                return res.json({ reply: "Please log in to see your enrolled courses. / Vui lòng đăng nhập để xem các khóa học của bạn." });
            }
            const userWithCourses = await User.findById(userId).populate('enrolledCourses').lean();
            dbResults = userWithCourses ? userWithCourses.enrolledCourses : [];
        } 
        else if (queryJson.collection && queryJson.query) {
            const { collection, query, options = {} } = queryJson;
            
            // Replace "USER_ID" placeholder with actual userId for personal queries
            if (query.studentId === "USER_ID" || query.userId === "USER_ID") {
                if (!userId) {
                    return res.json({ reply: "Please log in to see your personal data. / Vui lòng đăng nhập để xem dữ liệu cá nhân." });
                }
                if (query.studentId === "USER_ID") query.studentId = userId;
                if (query.userId === "USER_ID") query.userId = userId;
            }
            
            const modelMap = {
                'courses': Course,
                'users': User,
                'categories': Category,
                'transactions': Transaction,
                'quizzes': Quiz,
                'studentquizresults': StudentQuizResult,
                'progress': Progress,
                'certificates': Certificate,
                'feedbacks': Feedback,
                'instructorprofiles': InstructorProfile,
                'proctoringsessions': ProctoringSession,
                'lessons': Lesson,
                'sections': Section,
            };

            const dbModel = modelMap[collection];
            if (!dbModel) {
                return res.status(400).json({ error: `Invalid collection: ${collection}` });
            }

            const limit = options.limit || 50;
            const sort = options.sort || {};
            const select = options.select || '';

            dbResults = await dbModel.find(query).limit(limit).sort(sort).select(select).lean();

            // Fallback: If no results found and searching courses, try broader search
            if ((!dbResults || dbResults.length === 0) && collection === 'courses' && query.title && query.title.$regex) {
                console.log("No results found, trying broader search across multiple fields...");

                // Try searching in subTitle, description and other fields too
                const broadQuery = {
                    $or: [
                        { title: query.title },
                        { subTitle: query.title },
                        { 'detail.description': query.title }
                    ]
                };

                dbResults = await dbModel.find(broadQuery).limit(limit).sort(sort).select(select).lean();
                console.log("Broader search results:", dbResults.length);
            }
        }

        // Phần code còn lại để tóm tắt và trả về kết quả giữ nguyên...
        if (!dbResults || dbResults.length === 0) {
            const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(userPrompt);
            return res.json({
                reply: isVietnamese
                    ? "Tôi không thể tìm thấy thông tin nào cho câu hỏi này. Bạn có thể thử hỏi theo cách khác hoặc xem tất cả khóa học tại F-Learning."
                    : "I couldn't find any information for that question. You can try asking differently or browse all courses on F-Learning."
            });
        }
        
        const clientUrl = process.env.CLIENT_URL;
        const promptForSummary = `
            Based on the user's original question and the data I retrieved, please formulate a friendly and natural-sounding response.
            **IMPORTANT: Respond in the same language as the "Original Question" (Vietnamese or English).**

            **CRITICAL RULE: If your response includes the title of a course from the data, you MUST format it as a Markdown hyperlink.**
            The link format is: \`[Course Title](${clientUrl}/course/COURSE_ID)\`.
            
            Original Question: "${userPrompt}"

            Retrieved Data (JSON):
            ${JSON.stringify(dbResults, null, 2)}

            Your Response (in the original language, with Markdown links for courses):
        `;

        const summaryMessages = [
            {
                role: "system",
                content: `You are F-Learning Assistant. Based on the user's original question and the data retrieved, formulate a friendly and natural-sounding response in the same language as the original question. If your response includes course titles, format them as Markdown links: [Course Title](${clientUrl}/course/COURSE_ID)`
            },
            {
                role: "user",
                content: promptForSummary
            }
        ];

        const summaryResult = await callOpenRouter(summaryMessages);
        const finalReply = summaryResult;

        return res.json({ reply: finalReply });

    } catch (error) {
        console.error("Chatbot Error:", error);
        res.status(500).json({ error: "An error occurred while processing your request." });
    }
};
