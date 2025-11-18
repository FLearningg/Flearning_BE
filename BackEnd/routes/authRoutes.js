const express = require("express");
const {
  register,
  login,
  verifyEmail,
  verifyInstructorEmail,
  verifyInstructorApplication,
  googleLogin,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  resendVerificationEmail,
  sendMobileResetCode,
  resetPasswordWithCode,
  registerInstructor,
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/instructor/register", registerInstructor);
router.get("/verify-email/:token", verifyEmail);
router.get("/verify-instructor-email/:token", verifyInstructorEmail);
router.get("/verify-instructor-application/:token", verifyInstructorApplication);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/refresh-token", refreshToken);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.post("/resend-verification", resendVerificationEmail);

router.post('/mobile/send-reset-code', sendMobileResetCode);
router.post('/mobile/reset-with-code', resetPasswordWithCode);

module.exports = router;
