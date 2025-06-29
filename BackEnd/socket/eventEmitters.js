const emitNewMessage = (io, messageData) => {
  if (!io || !messageData) {
    return;
  }

  try {
    const receiverId = messageData.receiver_id._id.toString();
    const conversationId = messageData.conversation_id.toString();

    // Get room information for debugging
    const senderRoom = io.sockets.adapter.rooms.get(
      messageData.sender_id._id.toString()
    );
    const receiverRoom = io.sockets.adapter.rooms.get(receiverId);
    const conversationRoom = io.sockets.adapter.rooms.get(conversationId);

    // Emit to receiver's personal room
    if (receiverRoom && receiverRoom.size > 0) {
      io.to(receiverId).emit("new_message", messageData);
    }

    // Emit to conversation room (for real-time updates to all participants)
    if (conversationRoom && conversationRoom.size > 0) {
      io.to(conversationId).emit("new_message", messageData);
    }
  } catch (error) {
    console.error("Error emitting new_message:", error.message);
  }
};

const emitConversationUpdate = (io, conversationData) => {
  if (!io || !conversationData) {
    return;
  }

  try {
    // Emit to all participants in the conversation
    conversationData.participants.forEach((participantId) => {
      const participantIdStr = participantId.toString();
      io.to(participantIdStr).emit("conversation_updated", conversationData);
    });
  } catch (error) {
    console.error("Error emitting conversation_updated:", error.message);
  }
};

const emitUnreadCount = (io, userId, count) => {
  if (!io || !userId) {
    return;
  }

  try {
    const userIdStr = userId.toString();
    io.to(userIdStr).emit("unread_count_updated", { count });
  } catch (error) {
    console.error("Error emitting unread_count_updated:", error.message);
  }
};

const emitTypingIndicator = (io, conversationId, userId, isTyping) => {
  if (!io || !conversationId || !userId) {
    return;
  }

  try {
    const conversationIdStr = conversationId.toString();
    const userIdStr = userId.toString();

    // Emit typing indicator to conversation room (excluding the sender)
    io.to(conversationIdStr).emit("typing_indicator", {
      userId: userIdStr,
      isTyping,
      conversationId: conversationIdStr,
    });
  } catch (error) {
    console.error("Error emitting typing_indicator:", error.message);
  }
};

const emitMessageStatusUpdate = (io, messageId, status, conversationId) => {
  if (!io || !messageId || !status || !conversationId) {
    return;
  }

  try {
    const conversationIdStr = conversationId.toString();

    // Emit status update to conversation room
    io.to(conversationIdStr).emit("message_status_updated", {
      messageId,
      status,
      conversationId: conversationIdStr,
    });
  } catch (error) {
    console.error("Error emitting message_status_updated:", error.message);
  }
};

const emitReadReceipt = (io, messageId, conversationId, readBy) => {
  if (!io || !messageId || !conversationId || !readBy) {
    return;
  }

  try {
    const conversationIdStr = conversationId.toString();
    const readByStr = readBy.toString();

    // Emit read receipt to conversation room
    io.to(conversationIdStr).emit("message_read_receipt", {
      messageId,
      conversationId: conversationIdStr,
      readBy: readByStr,
    });
  } catch (error) {
    console.error("Error emitting message_read_receipt:", error.message);
  }
};

module.exports = {
  emitNewMessage,
  emitConversationUpdate,
  emitUnreadCount,
  emitTypingIndicator,
  emitMessageStatusUpdate,
  emitReadReceipt,
};
