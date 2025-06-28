const jwt = require("jsonwebtoken");
const Chat = require("../models/chatModel");
const Conversation = require("../models/conversationModel");
const User = require("../models/userModel");

module.exports = (io) => {
  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const user = await User.findById(decoded.id);

      if (!user || user.status !== "verified") {
        return next(
          new Error("Authentication error: User not found or not verified")
        );
      }

      socket.userId = user._id;
      socket.userRole = user.role;
      next();
    } catch (error) {
      console.error("Socket authentication error:", error.message);
      next(new Error("Authentication error: Invalid token"));
    }
  });

  // Connection handler
  io.on("connection", (socket) => {
    // Join user's personal room - ensure userId is string
    const userIdStr = socket.userId.toString();
    socket.join(userIdStr);

    // Auto-join user's existing conversations
    const autoJoinConversations = async () => {
      try {
        const conversations = await Conversation.find({
          participants: socket.userId,
        }).select("_id");

        if (conversations.length > 0) {
          conversations.forEach((conversation) => {
            const conversationIdStr = conversation._id.toString();
            socket.join(conversationIdStr);
          });
        }
      } catch (error) {
        console.error("Error auto-joining conversations:", error.message);
      }
    };

    // Call auto-join function
    autoJoinConversations();

    // Handle joining conversation rooms
    socket.on("join_conversation", async (data) => {
      try {
        const { conversationId } = data;
        const conversationIdStr = conversationId.toString();

        // TODO: Validate that user is part of this conversation
        socket.join(conversationIdStr);

        // Emit confirmation back to client
        socket.emit("conversation_joined", {
          conversationId: conversationIdStr,
        });
      } catch (error) {
        console.error("Error joining conversation:", error.message);
        socket.emit("error", { message: "Failed to join conversation" });
      }
    });

    // Handle leaving conversation rooms
    socket.on("leave_conversation", (data) => {
      try {
        const { conversationId } = data;
        const conversationIdStr = conversationId.toString();

        socket.leave(conversationIdStr);

        // Emit confirmation back to client
        socket.emit("conversation_left", { conversationId: conversationIdStr });
      } catch (error) {
        console.error("Error leaving conversation:", error.message);
        socket.emit("error", { message: "Failed to leave conversation" });
      }
    });

    // Handle typing indicators
    socket.on("typing_start", (data) => {
      try {
        const { conversationId } = data;
        const conversationIdStr = conversationId.toString();

        // Emit typing indicator to all users in the conversation (except sender)
        socket.to(conversationIdStr).emit("typing_indicator", {
          userId: socket.userId.toString(),
          isTyping: true,
          conversationId: conversationIdStr,
        });
      } catch (error) {
        console.error("Error handling typing_start:", error.message);
      }
    });

    socket.on("typing_stop", (data) => {
      try {
        const { conversationId } = data;
        const conversationIdStr = conversationId.toString();

        // Emit typing stop indicator to all users in the conversation (except sender)
        socket.to(conversationIdStr).emit("typing_indicator", {
          userId: socket.userId.toString(),
          isTyping: false,
          conversationId: conversationIdStr,
        });
      } catch (error) {
        console.error("Error handling typing_stop:", error.message);
      }
    });

    // Handle message read receipts
    socket.on("message_read", async (data) => {
      try {
        const { messageId, conversationId } = data;
        const conversationIdStr = conversationId.toString();
        const messageIdStr = messageId.toString();

        // TODO: Update message status in database
        // await Chat.findByIdAndUpdate(messageId, { status: "read" });

        // Emit read receipt to all users in the conversation
        io.to(conversationIdStr).emit("message_read_receipt", {
          messageId: messageIdStr,
          conversationId: conversationIdStr,
          readBy: socket.userId.toString(),
        });
      } catch (error) {
        console.error("Error handling message_read:", error.message);
      }
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      // Silent disconnect - only log errors if needed for debugging
    });

    // Handle errors
    socket.on("error", (error) => {
      console.error("Socket error:", error.message);
    });
  });
};
