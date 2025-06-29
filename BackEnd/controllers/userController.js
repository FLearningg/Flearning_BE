const User = require("../models/userModel");
const bcrypt = require("bcryptjs");

/**
 * @desc    Set a password for an account that doesn't have one (e.g., Google sign-up)
 * @route   POST /api/user/set-password
 * @access  Private (User must be logged in)
 */
exports.setPassword = async (req, res) => {
  const { newPassword } = req.body;
  const userId = req.user.id;

  if (!newPassword || newPassword.length < 6) {
    return res
      .status(400)
      .json({ message: "New password must be at least 6 characters long." });
  }

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if user already has a password
    if (user.password) {
      return res.status(400).json({
        message:
          'Your account already has a password. Please use the "Change Password" feature.',
      });
    }

    // Hash and set new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({
      message:
        "Password set successfully. You can use this password for your next login.",
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Change user's password when already logged in
 * @route   PUT /api/user/change-password
 * @access  Private (User must be logged in)
 */
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({
      message:
        "Please provide both current password and new password (at least 6 characters).",
    });
  }

  try {
    // Get user with password field included
    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Handle case where user signed up with Google and doesn't have a password
    if (!user.password) {
      return res.status(400).json({
        message:
          'Your account doesn\'t have a password yet. Please use the "Set Password" feature.',
      });
    }

    // Compare current password with the one in database
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Current password is incorrect." });
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Get user profile
 * @route   GET /api/user/profile
 * @access  Private
 */
exports.getUserProfile = async (req, res) => {
  // req.user is added by authMiddleware
  const user = await User.findById(req.user.id).select("-password");

  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ message: "User not found" });
  }
};

/**
 * @desc    Search users for chat functionality
 * @route   GET /api/user/search
 * @access  Private
 */
exports.searchUsers = async (req, res) => {
  try {
    const { query, page = 1, limit = 20 } = req.query;
    const currentUserId = req.user.id;

    // Validate query parameter
    if (!query || query.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const searchQuery = query.trim();
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build search query - search by firstName, lastName, userName, or email
    const searchFilter = {
      _id: { $ne: currentUserId }, // Exclude current user from search results
      status: "verified", // Only show verified users
      $or: [
        { firstName: { $regex: searchQuery, $options: "i" } },
        { lastName: { $regex: searchQuery, $options: "i" } },
        { userName: { $regex: searchQuery, $options: "i" } },
        { email: { $regex: searchQuery, $options: "i" } },
      ],
    };

    // Execute search with pagination
    const users = await User.find(searchFilter)
      .select("firstName lastName userName userImage email")
      .sort({ firstName: 1, lastName: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalUsers = await User.countDocuments(searchFilter);

    // Calculate pagination info
    const totalPages = Math.ceil(totalUsers / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNextPage,
          hasPrevPage,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Error in searchUsers:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
