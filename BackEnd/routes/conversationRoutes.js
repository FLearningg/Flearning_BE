const express = require("express");
const router = express.Router();
const {
  createConversation,
  getConversationById,
  updateConversation,
  deleteConversation,
  getConversationStats,
  getRecentConversations,
} = require("../controllers/conversationController");
const authorize = require("../middlewares/authMiddleware");

// All conversation routes require authentication
router.use(authorize());

// Conversation management routes
router.post("/", createConversation);
router.get("/stats", getConversationStats);
router.get("/recent", getRecentConversations);
router.get("/:conversationId", getConversationById);
router.put("/:conversationId", updateConversation);
router.delete("/:conversationId", deleteConversation);

module.exports = router;
