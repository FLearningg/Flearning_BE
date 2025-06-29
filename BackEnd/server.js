require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const cleanupTempFiles = require("./utils/cleanup-temp-files");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const profileRoutes = require("./routes/profileRoutes");
const adminRoutes = require("./routes/adminRoutes");

const courseRoutes = require("./routes/courseRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const cartRoutes = require("./routes/cartRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const discountRoutes = require("./routes/discountRoutes");
const chatRoutes = require("./routes/chatRoutes");
const conversationRoutes = require("./routes/conversationRoutes");

const app = express();

console.log("🚀 [SERVER] Starting FLearning Backend Server...");

// Create HTTP server
const server = http.createServer(app);
console.log("✅ [SERVER] HTTP server created");

// Initialize Socket.IO with CORS configuration
console.log("🔌 [SERVER] Initializing Socket.IO...");
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});
console.log("✅ [SERVER] Socket.IO initialized with CORS");

// Make io instance available to routes
app.set("io", io);
console.log("✅ [SERVER] Socket.IO instance made available to routes");

// Initialize socket handlers
console.log("🔧 [SERVER] Loading Socket.IO chat handlers...");
require("./socket/chatSocket")(io);

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

console.log("✅ [SERVER] Middleware configured");

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/courses", feedbackRoutes);
app.use("/api/profile", profileRoutes);

// Admin routes (includes section, lesson management and file upload)
app.use("/api/admin", adminRoutes);

// Course routes
app.use("/api/courses", courseRoutes);
// Category routes
app.use("/api/categories", categoryRoutes);
// Notification routes
app.use("/api/notifications", notificationRoutes);
// Cart routes
app.use("/api/cart", cartRoutes);
// Wishlist routes
app.use("/api/wishlist", wishlistRoutes);
// Profile routes
app.use("/api/profile", profileRoutes);

// Chat routes
app.use("/api/chat", chatRoutes);
// Conversation routes
app.use("/api/conversations", conversationRoutes);

// Discount routes
app.use("/api/admin/discounts", discountRoutes);
// Profile routes
app.use("/api/profile", profileRoutes);

console.log("✅ [SERVER] All routes configured");

// Dọn dẹp file tạm mỗi lần server start
console.log("🧹 [SERVER] Cleaning up temporary files...");
cleanupTempFiles();

console.log("🔗 [SERVER] Connecting to MongoDB...");
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ [SERVER] Connected to MongoDB successfully");
    const PORT = process.env.PORT || 5000;
    // Use server.listen instead of app.listen for Socket.IO
    server.listen(PORT, () => {
      console.log("🎉 [SERVER] Server is running successfully!");
      console.log(`   - Port: ${PORT}`);
      console.log(`   - Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(
        `   - Client URL: ${process.env.CLIENT_URL || "http://localhost:3000"}`
      );
      console.log(`   - Socket.IO: Enabled with WebSocket and Polling`);
      console.log(
        "🚀 [SERVER] Ready to handle requests and Socket.IO connections!"
      );
    });
  })
  .catch((err) => {
    console.error("❌ [SERVER] MongoDB connection failed:", err.message);
    process.exit(1);
  });
