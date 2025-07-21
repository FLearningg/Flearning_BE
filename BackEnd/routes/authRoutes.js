const express = require("express");
const {
  register,
  login,
  verifyEmail,
  googleLogin,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  resendVerificationEmail,
  sendMobileResetCode,
  resetPasswordWithCode,
} = require("../controllers/authController");
const passport = require("passport");
const jwt = require("jsonwebtoken");


const router = express.Router();

router.post("/register", register);
router.get("/verify-email/:token", verifyEmail);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/refresh-token", refreshToken);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.post("/resend-verification", resendVerificationEmail);

router.post('/mobile/send-reset-code', sendMobileResetCode);
router.post('/mobile/reset-with-code', resetPasswordWithCode);

// Endpoint 1: Bắt đầu quá trình xác thực Google
router.get(
  '/google/login/mobile',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Endpoint 2: Callback URL mà Google sẽ gọi lại
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/api/auth/login/failed', // Chuyển hướng nếu thất bại
    session: false // Không sử dụng session cookie
  }),
  (req, res) => {
    // `req.user` được Passport gán sau khi xác thực thành công
    const user = req.user;

    // Tạo JWT token
    const payload = { user: { id: user._id, role: user.role } };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' });
    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET_REFRESH, { expiresIn: '7d' });

    // Dữ liệu người dùng cần gửi về app
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      userImage: user.userImage,
      role: user.role,
      status: user.status,
    };

    // Tạo deep link để trả token và user data về ứng dụng
    // "flearning://" là scheme bạn đã định nghĩa trong app.json
    const deepLink = `flearning://login-success?token=${encodeURIComponent(accessToken)}&user=${encodeURIComponent(JSON.stringify(userData))}&refreshToken=${encodeURIComponent(refreshToken)}`;

    // Chuyển hướng trình duyệt đến deep link đó
    res.redirect(deepLink);
  }
);

// Endpoint 3: Xử lý khi đăng nhập thất bại
router.get('/login/failed', (req, res) => {
  const deepLink = `flearning://login-failed?error=AuthenticationFailed`;
  res.redirect(deepLink);
});

module.exports = router;
