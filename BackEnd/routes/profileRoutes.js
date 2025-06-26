const express = require("express");
const router = express.Router();
const {
  getProfile,
  updateProfile,
  getEnrolledCourses,
  getPurchaseHistory,
} = require("../controllers/profileController");
const authorize = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");

/**
 * @route   GET /api/profile
 * @desc    Get user profile (firstName, lastName, userName, email, biography)
 * @access  Private
 */
router.get("/", authorize(), getProfile);

/**
 * @route   PUT /api/profile
 * @desc    Update user profile (firstName, lastName, userName, email, biography, userImage)
 * @access  Private
 */
router.put("/", authorize(), upload.single("userImage"), updateProfile);

/**
 * @route   GET /api/profile/enrolled-courses
 * @desc    Get enrolled courses for user
 * @access  Private
 */
router.get("/enrolled-courses", authorize(), getEnrolledCourses);

/**
 * @route   GET /api/profile/purchase-history
 * @desc    Get purchase history for user
 * @access  Private
 */
router.get("/purchase-history", authorize(), getPurchaseHistory);

module.exports = router;
