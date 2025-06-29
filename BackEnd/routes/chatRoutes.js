const express = require("express");
const router = express.Router();
const {
  sendMessage,
  getConversations,
  getConversationMessages,
  markAsRead,
  getUnreadCount,
  deleteMessage,
  searchChat,
} = require("../controllers/chatController");
const authorize = require("../middlewares/authMiddleware");

// All chat routes require authentication
router.use(authorize());

// Message routes
router.post("/send", sendMessage);
router.delete("/messages/:messageId", deleteMessage);

// Conversation routes
router.get("/conversations", getConversations);
router.get("/conversations/:conversationId/messages", getConversationMessages);
router.put("/conversations/:conversationId/read", markAsRead);

// Utility routes
router.get("/unread-count", getUnreadCount);
router.get("/search", searchChat);

module.exports = router;
