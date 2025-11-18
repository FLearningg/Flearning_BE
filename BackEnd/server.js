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
const instructorRoutes = require("./routes/instructorRoutes");
const publicRoutes = require("./routes/publicRoutes");

const courseRoutes = require("./routes/courseRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const cartRoutes = require("./routes/cartRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const {
  adminRouter: discountAdminRouter,
  instructorRouter: discountInstructorRouter,
  publicRouter: discountPublicRouter,
} = require("./routes/discountRoutes");
const chatRoutes = require("./routes/chatRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const chatbotRoutes = require("./routes/chatbotRoutes");
const progressRoutes = require("./routes/progressRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const watchCourseRoute = require("./routes/WatchCourseRoute");
const quizRoutes = require("./routes/quizRoutes");
const aiRoutes = require("./routes/aiRoutes");
const recommendationRoutes = require("./routes/recommendationRoutes");
const proctoringRoutes = require("./routes/proctoringRoutes");
const surveyRoutes = require("./routes/surveyRoutes");
const { startAutoReviewService } = require("./services/autoAIReviewService");

const app = express();

console.log("🚀 [SERVER] Starting FLearning Backend Server...");

// Create HTTP server
const server = http.createServer(app);
console.log("✅ [SERVER] HTTP server created");

// Initialize Socket.IO with CORS configuration
console.log("🔌 [SERVER] Initializing Socket.IO...");

// Get allowed origins from environment or use defaults
const getAllowedOrigins = () => {
  const origins = [];

  // Primary client URL
  if (process.env.CLIENT_URL) {
    origins.push(process.env.CLIENT_URL);
  }

  // Azure URLs (add your Azure domain here)
  if (process.env.AZURE_CLIENT_URL) {
    origins.push(process.env.AZURE_CLIENT_URL);
  }

  // Development URLs
  if (process.env.NODE_ENV === "development") {
    origins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  // Default fallback
  if (origins.length === 0) {
    origins.push("http://localhost:3000");
  }

  console.log("🌐 [SOCKET] Allowed CORS origins:", origins);
  return origins;
};

const io = socketIo(server, {
  cors: {
    origin: getAllowedOrigins(),
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  },
  // Prioritize polling for Azure - more reliable
  transports: ["polling", "websocket"],
  // Azure-specific optimizations
  allowEIO3: true,
  pingTimeout: 60000, // Increased for Azure
  pingInterval: 25000, // Increased for Azure
  maxHttpBufferSize: 1e6,
  compression: true,
  httpCompression: true,
  cookie: false,
  // Enable sticky sessions for Azure
  serveClient: false,
  // Azure connection handling
  upgradeTimeout: 30000,
  // Force polling on Azure if needed
  forceNew: true,
});
console.log("✅ [SERVER] Socket.IO initialized with CORS");

// Make io instance available to routes
app.set("io", io);
console.log("✅ [SERVER] Socket.IO instance made available to routes");

// Initialize socket handlers
console.log("🔧 [SERVER] Loading Socket.IO chat handlers...");
require("./socket/chatSocket")(io);
require("./socket/notificationSocket")(io);

app.use(
  cors({
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);
app.use(
  express.json({
    limit: "50mb", // Increase payload limit for large quiz data
    // Chúng ta cần giữ lại raw body để xác thực webhook
    verify: (req, res, buf) => {
      // Chỉ lưu lại rawBody cho các request đến webhook của PayOS
      if (req.originalUrl.startsWith("/api/payment/webhook")) {
        req.rawBody = buf.toString("utf8");
      }
    },
  })
);
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

console.log("✅ [SERVER] Middleware configured");

// Health check endpoint for Render
app.get("/healthz", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
  });
});

// Additional health endpoint with more details
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    clientUrl: process.env.CLIENT_URL || "Not set",
    socketConnections: io ? io.engine.clientsCount : 0,
    uptime: process.uptime(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/courses", feedbackRoutes);
app.use("/api/profile", profileRoutes);

// Public routes (no auth required)
app.use("/api/public", publicRoutes);

// Admin routes (includes section, lesson management and file upload)
app.use("/api/admin", adminRoutes);

// Instructor routes
app.use("/api/instructor", instructorRoutes);

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
app.use("/api/admin/discounts", discountAdminRouter);
app.use("/api/instructor/discounts", discountInstructorRouter);
app.use("/api/discounts", discountPublicRouter);
// Profile routes
app.use("/api/profile", profileRoutes);
// Chatbot routes
app.use("/api/chatbot", chatbotRoutes);
// Progress routes
app.use("/api/progress", progressRoutes);
//Payment routes
app.use("/api/payment", paymentRoutes);
app.use("/api/watch-course", watchCourseRoute);
// Quiz routes
app.use("/api/quiz", quizRoutes);
app.use("/api/ai", aiRoutes);
// Proctoring routes
app.use("/api/proctoring", proctoringRoutes);
// Learning Path routes
app.use("/api/recommendations", recommendationRoutes);
// Survey routes
app.use("/api/survey", surveyRoutes);

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

    // Khởi động auto AI review service
    startAutoReviewService(30); // Check mỗi 30 phút

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
