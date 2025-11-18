const Chat = require("../models/chatModel");
const Conversation = require("../models/conversationModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");
const {
  emitNewMessage,
  emitConversationUpdate,
  emitUnreadCount,
  emitMessageStatusUpdate,
} = require("../socket/eventEmitters");
const {
  createAndSendNotification,
} = require("../services/notificationService");

/**
 * @desc    Send a message to another user
 * @route   POST /api/chat/send
 * @access  Private
 */
exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, message, conversationId } = req.body;
    const senderId = req.user.id;

    // Validate required fields
    if (!receiverId || !message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Receiver ID and message are required",
      });
    }

    // Check if receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      });
    }

    // Prevent sending message to yourself
    if (senderId === receiverId) {
      return res.status(400).json({
        success: false,
        message: "Cannot send message to yourself",
      });
    }

    let conversation;

    // If conversationId is provided, use it; otherwise find or create conversation
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: "Conversation not found",
        });
      }
      // Verify user is part of this conversation
      if (
        !conversation.participants.includes(senderId) ||
        !conversation.participants.includes(receiverId)
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not part of this conversation",
        });
      }
    } else {
      // Find existing conversation between these users
      conversation = await Conversation.findOne({
        participants: { $all: [senderId, receiverId] },
      });

      // If no conversation exists, create a new one
      if (!conversation) {
        conversation = new Conversation({
          participants: [senderId, receiverId],
          last_message: message,
          status: "sending",
        });
        await conversation.save();
      }
    }

    // Create the message
    const newMessage = new Chat({
      sender_id: senderId,
      receiver_id: receiverId,
      message: message.trim(),
      conversation_id: conversation._id,
      status: "sent",
    });

    await newMessage.save();

    // Update conversation's last message and status
    conversation.last_message = message;
    conversation.status = "sending";
    await conversation.save();

    // Populate sender and receiver information
    const populatedMessage = await Chat.findById(newMessage._id)
      .populate("sender_id", "firstName lastName userName userImage")
      .populate("receiver_id", "firstName lastName userName userImage");

    // Emit Socket.IO events for real-time updates
    const io = req.app.get("io");
    if (io) {
      emitNewMessage(io, populatedMessage);
      emitConversationUpdate(io, conversation);

      // Update unread count for receiver
      const unreadCount = await Chat.countDocuments({
        receiver_id: receiverId,
        status: { $ne: "read" },
      });
      emitUnreadCount(io, receiverId, unreadCount);

      const senderName = req.user.firstName || "Một ai đó";

      await createAndSendNotification(io, {
        recipient: receiverId,
        sender: senderId,
        type: "chat_message", // Một type mới để phân biệt
        content: `đã gửi cho bạn một tin nhắn.`,
        link: `/profile/message`, // Link tới trang chat chung
      });
    }

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: {
        message: populatedMessage,
        conversationId: conversation._id,
      },
    });
  } catch (error) {
    console.error("Error in sendMessage:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all conversations for the current user
 * @route   GET /api/chat/conversations
 * @access  Private
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Find conversations where the user is a participant
    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate("participants", "firstName lastName userName userImage")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalConversations = await Conversation.countDocuments({
      participants: userId,
    });

    // Format conversations to show other participant's info
    const formattedConversations = conversations.map((conversation) => {
      const otherParticipant = conversation.participants.find(
        (participant) => participant._id.toString() !== userId
      );

      return {
        id: conversation._id,
        lastMessage: conversation.last_message,
        status: conversation.status,
        updatedAt: conversation.updatedAt,
        createdAt: conversation.createdAt,
        otherParticipant: otherParticipant || null,
      };
    });

    const totalPages = Math.ceil(totalConversations / parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        conversations: formattedConversations,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalConversations,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error in getConversations:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get messages for a specific conversation
 * @route   GET /api/chat/conversations/:conversationId/messages
 * @access  Private
 */
exports.getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 50 } = req.query;

    // Validate conversationId
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID",
      });
    }

    // Check if conversation exists and user is a participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "You are not part of this conversation",
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get messages for this conversation
    const messages = await Chat.find({ conversation_id: conversationId })
      .populate("sender_id", "firstName lastName userName userImage")
      .populate("receiver_id", "firstName lastName userName userImage")
      .sort({ createdAt: -1 }) // Most recent first
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalMessages = await Chat.countDocuments({
      conversation_id: conversationId,
    });

    // REMOVED: Automatic mark as read functionality
    // Messages will only be marked as read when frontend explicitly calls markAsRead API

    const totalPages = Math.ceil(totalMessages / parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        messages: messages.reverse(), // Reverse to show oldest first
        conversation: {
          id: conversation._id,
          participants: conversation.participants,
          lastMessage: conversation.last_message,
          status: conversation.status,
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalMessages,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error in getConversationMessages:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Mark messages as read
 * @route   PUT /api/chat/conversations/:conversationId/read
 * @access  Private
 */
exports.markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Validate conversationId
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID",
      });
    }

    // Check if conversation exists and user is a participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "You are not part of this conversation",
      });
    }

    // Mark all unread messages in this conversation as read
    const result = await Chat.updateMany(
      {
        conversation_id: conversationId,
        receiver_id: userId,
        status: { $ne: "read" },
      },
      { status: "read" }
    );

    // Update conversation status
    await Conversation.findByIdAndUpdate(conversationId, {
      status: "read",
    });

    // Emit Socket.IO events for real-time updates
    const io = req.app.get("io");
    if (io && result.modifiedCount > 0) {
      // Get updated conversation
      const updatedConversation = await Conversation.findById(conversationId);
      emitConversationUpdate(io, updatedConversation);

      // Update unread count for current user
      const unreadCount = await Chat.countDocuments({
        receiver_id: userId,
        status: { $ne: "read" },
      });
      emitUnreadCount(io, userId, unreadCount);

      // Emit message status updates to conversation participants
      conversation.participants.forEach((participantId) => {
        if (participantId.toString() !== userId) {
          emitMessageStatusUpdate(io, "multiple", "read", conversationId);
        }
      });
    }

    res.status(200).json({
      success: true,
      message: "Messages marked as read",
      data: {
        updatedCount: result.modifiedCount,
        conversationId,
      },
    });
  } catch (error) {
    console.error("Error in markAsRead:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get unread message count for the current user
 * @route   GET /api/chat/unread-count
 * @access  Private
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get total unread messages
    const totalUnread = await Chat.countDocuments({
      receiver_id: userId,
      status: { $ne: "read" },
    });

    // Get unread count per conversation
    const unreadPerConversation = await Chat.aggregate([
      {
        $match: {
          receiver_id: new mongoose.Types.ObjectId(userId),
          status: { $ne: "read" },
        },
      },
      {
        $group: {
          _id: "$conversation_id",
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalUnread,
        unreadPerConversation: unreadPerConversation.map((item) => ({
          conversationId: item._id,
          count: item.count,
        })),
      },
    });
  } catch (error) {
    console.error("Error in getUnreadCount:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete a message (only sender can delete)
 * @route   DELETE /api/chat/messages/:messageId
 * @access  Private
 */
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    // Validate messageId
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid message ID",
      });
    }

    // Find the message
    const message = await Chat.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Check if user is the sender
    if (message.sender_id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own messages",
      });
    }

    // Delete the message
    await Chat.findByIdAndDelete(messageId);

    res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteMessage:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Search conversations and messages
 * @route   GET /api/chat/search
 * @access  Private
 */
exports.searchChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { query, type = "all" } = req.query; // type: "conversations", "messages", "all"

    if (!query || query.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const searchQuery = query.trim();
    const results = {};

    // Search conversations (participant names)
    if (type === "all" || type === "conversations") {
      const conversations = await Conversation.find({
        participants: userId,
      })
        .populate("participants", "firstName lastName userName")
        .then((conversations) =>
          conversations.filter((conversation) => {
            const otherParticipant = conversation.participants.find(
              (p) => p._id.toString() !== userId
            );
            if (!otherParticipant) return false;

            const fullName =
              `${otherParticipant.firstName} ${otherParticipant.lastName}`.toLowerCase();
            const userName = otherParticipant.userName.toLowerCase();
            const searchLower = searchQuery.toLowerCase();

            return (
              fullName.includes(searchLower) ||
              userName.includes(searchLower) ||
              (conversation.last_message &&
                conversation.last_message.toLowerCase().includes(searchLower))
            );
          })
        );

      results.conversations = conversations.map((conversation) => {
        const otherParticipant = conversation.participants.find(
          (p) => p._id.toString() !== userId
        );
        return {
          id: conversation._id,
          lastMessage: conversation.last_message,
          status: conversation.status,
          updatedAt: conversation.updatedAt,
          otherParticipant,
        };
      });
    }

    // Search messages
    if (type === "all" || type === "messages") {
      const messages = await Chat.find({
        $or: [{ sender_id: userId }, { receiver_id: userId }],
        message: { $regex: searchQuery, $options: "i" },
      })
        .populate("sender_id", "firstName lastName userName userImage")
        .populate("receiver_id", "firstName lastName userName userImage")
        .populate("conversation_id")
        .sort({ createdAt: -1 })
        .limit(20);

      results.messages = messages;
    }

    res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("Error in searchChat:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
