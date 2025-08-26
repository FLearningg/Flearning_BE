const express = require("express");
const router = express.Router();
const chatbotController = require("../controllers/chatbotController");

// Route để xử lý các câu hỏi từ chatbot
router.post("/query", chatbotController.handleQuery);

module.exports = router;
