module.exports = (io) => {
  io.on("connection", (socket) => {
    // Lưu ý: Authentication Middleware trong chatSocket.js ĐÃ CHẠY trước khi vào đây.
    // Do đó socket.userId đã có sẵn.

    if (socket.userId) {
      const userIdStr = socket.userId.toString();

      // ChatSocket đã join rồi, nhưng join lại lần nữa ở đây cũng không sao (idempotent).
      // Điều này giúp đảm bảo logic Notification hoạt động kể cả khi logic Chat thay đổi.
      socket.join(userIdStr);

      // Log để biết user này đã sẵn sàng nhận thông báo
      // console.log(`🔔 [SOCKET] Notification service connected for user: ${userIdStr}`);
    }

    // Sau này nếu Client cần gửi event ngược lên (vd: "đã đọc tất cả"),
    // bạn viết code xử lý ở đây:
    socket.on("mark_all_notifications_read", () => {
      // Logic xử lý...
    });
  });
};
