const Conversation = require("../models/conversationModel");
const Chat = require("../models/chatModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");
const { emitConversationUpdate } = require("../socket/eventEmitters");

/**
 * @desc    Create a new conversation between users
 * @route   POST /api/conversations
 * @access  Private
 */
exports.createConversation = async (req, res) => {
  try {
    const { participantIds } = req.body;
    const currentUserId = req.user.id;

    // Validate participantIds
    if (
      !participantIds ||
      !Array.isArray(participantIds) ||
      participantIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Participant IDs array is required",
      });
    }

    // Add current user to participants if not already included
    const allParticipants = [...new Set([currentUserId, ...participantIds])];

    // Validate that all participant IDs are valid
    const validParticipants = await User.find({
      _id: { $in: allParticipants },
    });

    if (validParticipants.length !== allParticipants.length) {
      return res.status(400).json({
        success: false,
        message: "One or more participant IDs are invalid",
      });
    }

    // Check if conversation already exists between these participants
    const existingConversation = await Conversation.findOne({
      participants: { $all: allParticipants },
      $expr: { $eq: [{ $size: "$participants" }, allParticipants.length] },
    });

    if (existingConversation) {
      return res.status(400).json({
        success: false,
        message: "Conversation already exists between these participants",
        data: {
          conversationId: existingConversation._id,
        },
      });
    }

    // Create new conversation
    const newConversation = new Conversation({
      participants: allParticipants,
      last_message: "",
      status: "sending",
    });

    const savedConversation = await newConversation.save();

    // Populate participant information
    const populatedConversation = await Conversation.findById(
      savedConversation._id
    ).populate("participants", "firstName lastName userName userImage");

    // Emit Socket.IO events for real-time updates
    const io = req.app.get("io");
    if (io) {
      emitConversationUpdate(io, populatedConversation);
    }

    res.status(201).json({
      success: true,
      message: "Conversation created successfully",
      data: populatedConversation,
    });
  } catch (error) {
    console.error("Error in createConversation:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get conversation details by ID
 * @route   GET /api/conversations/:conversationId
 * @access  Private
 */
exports.getConversationById = async (req, res) => {
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

    // Find conversation and check if user is a participant
    const conversation = await Conversation.findById(conversationId).populate(
      "participants",
      "firstName lastName userName userImage"
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    if (!conversation.participants.some((p) => p._id.toString() === userId)) {
      return res.status(403).json({
        success: false,
        message: "You are not part of this conversation",
      });
    }

    // Get recent messages count
    const messageCount = await Chat.countDocuments({
      conversation_id: conversationId,
    });

    // Get unread messages count for current user
    const unreadCount = await Chat.countDocuments({
      conversation_id: conversationId,
      receiver_id: userId,
      status: { $ne: "read" },
    });

    const conversationData = {
      ...conversation.toObject(),
      messageCount,
      unreadCount,
    };

    res.status(200).json({
      success: true,
      data: conversationData,
    });
  } catch (error) {
    console.error("Error in getConversationById:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update conversation details
 * @route   PUT /api/conversations/:conversationId
 * @access  Private
 */
exports.updateConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { last_message, status } = req.body;
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

    // Build update object
    const updateData = {};
    if (last_message !== undefined) updateData.last_message = last_message;
    if (status !== undefined) {
      if (!["sending", "delivered", "read"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Must be 'sending', 'delivered', or 'read'",
        });
      }
      updateData.status = status;
    }

    // Update conversation
    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      updateData,
      { new: true, runValidators: true }
    ).populate("participants", "firstName lastName userName userImage");

    res.status(200).json({
      success: true,
      message: "Conversation updated successfully",
      data: updatedConversation,
    });
  } catch (error) {
    console.error("Error in updateConversation:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete conversation (only for group chats or if all participants agree)
 * @route   DELETE /api/conversations/:conversationId
 * @access  Private
 */
exports.deleteConversation = async (req, res) => {
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

    // For now, only allow deletion of conversations with 2 participants (direct messages)
    // In the future, you might want to implement group chat deletion logic
    if (conversation.participants.length > 2) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete group conversations yet",
      });
    }

    // Delete all messages in the conversation
    await Chat.deleteMany({ conversation_id: conversationId });

    // Delete the conversation
    await Conversation.findByIdAndDelete(conversationId);

    res.status(200).json({
      success: true,
      message: "Conversation and all messages deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteConversation:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get conversation statistics
 * @route   GET /api/conversations/stats
 * @access  Private
 */
exports.getConversationStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get total conversations
    const totalConversations = await Conversation.countDocuments({
      participants: userId,
    });

    // Get total messages sent by user
    const totalMessagesSent = await Chat.countDocuments({
      sender_id: userId,
    });

    // Get total messages received by user
    const totalMessagesReceived = await Chat.countDocuments({
      receiver_id: userId,
    });

    // Get unread messages count
    const unreadMessages = await Chat.countDocuments({
      receiver_id: userId,
      status: { $ne: "read" },
    });

    // Get conversations with unread messages
    const conversationsWithUnread = await Chat.aggregate([
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

    // Get most active conversations (by message count)
    const mostActiveConversations = await Chat.aggregate([
      {
        $match: {
          $or: [
            { sender_id: new mongoose.Types.ObjectId(userId) },
            { receiver_id: new mongoose.Types.ObjectId(userId) },
          ],
        },
      },
      {
        $group: {
          _id: "$conversation_id",
          messageCount: { $sum: 1 },
        },
      },
      {
        $sort: { messageCount: -1 },
      },
      {
        $limit: 5,
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalConversations,
        totalMessagesSent,
        totalMessagesReceived,
        unreadMessages,
        conversationsWithUnread: conversationsWithUnread.length,
        mostActiveConversations,
      },
    });
  } catch (error) {
    console.error("Error in getConversationStats:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get recent conversations with preview
 * @route   GET /api/conversations/recent
 * @access  Private
 */
exports.getRecentConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    // Get recent conversations with last message preview
    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate("participants", "firstName lastName userName userImage")
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit));

    // Get last message for each conversation
    const conversationsWithPreview = await Promise.all(
      conversations.map(async (conversation) => {
        const lastMessage = await Chat.findOne({
          conversation_id: conversation._id,
        })
          .populate("sender_id", "firstName lastName userName")
          .sort({ createdAt: -1 })
          .limit(1);

        const otherParticipant = conversation.participants.find(
          (p) => p._id.toString() !== userId
        );

        return {
          id: conversation._id,
          lastMessage: lastMessage
            ? {
                id: lastMessage._id,
                content: lastMessage.message,
                sender: lastMessage.sender_id,
                timestamp: lastMessage.createdAt,
                status: lastMessage.status,
              }
            : null,
          otherParticipant,
          status: conversation.status,
          updatedAt: conversation.updatedAt,
          createdAt: conversation.createdAt,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: conversationsWithPreview,
    });
  } catch (error) {
    console.error("Error in getRecentConversations:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
