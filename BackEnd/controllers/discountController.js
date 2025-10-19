const Discount = require("../models/discountModel");
const Course = require("../models/courseModel");

/**
 * Helper function to validate if courses exist and user has permission
 * @param {Array} courseIds - Array of course IDs
 * @param {Object} user - User object from req.user
 * @returns {Object} { valid: boolean, message: string, courses: Array }
 */
const validateCoursesOwnership = async (courseIds, user) => {
  // If no courses specified, it's valid (discount applies to all courses)
  if (!courseIds || courseIds.length === 0) {
    return { valid: true, courses: [] };
  }

  // Check if all courses exist
  const courses = await Course.find({ _id: { $in: courseIds } });

  if (courses.length !== courseIds.length) {
    return {
      valid: false,
      message: "Some courses do not exist",
      courses: [],
    };
  }

  // If user is instructor, check if they own all the courses
  if (user.role === "instructor") {
    const notOwnedCourses = courses.filter(
      (course) => course.createdBy.toString() !== user._id.toString()
    );

    if (notOwnedCourses.length > 0) {
      return {
        valid: false,
        message: "You can only apply discount to your own courses",
        courses: [],
      };
    }
  }

  // Admin can apply to any courses, so validation passes
  return { valid: true, courses };
};

/**
 * @desc    Get all discounts with filtering and pagination
 * @route   GET /api/admin/discounts
 * @access  Admin
 */
exports.getAllDiscounts = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, category, type, search } = req.query;

    // Build filter object
    const filter = {};

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (type) filter.type = type;

    // Search by discount code or description
    if (search) {
      filter.$or = [
        { discountCode: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get discounts with pagination
    const discounts = await Discount.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("userId", "name email");

    // Get total count for pagination
    const totalDiscounts = await Discount.countDocuments(filter);
    const totalPages = Math.ceil(totalDiscounts / parseInt(limit));

    if (!discounts || discounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No discounts found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Get discounts list successfully",
      data: {
        discounts,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalDiscounts,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get all discounts error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get instructor's own discounts with filtering and pagination
 * @route   GET /api/instructor/discounts
 * @access  Instructor
 */
exports.getInstructorDiscounts = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, category, type, search } = req.query;

    // Build filter object - only show discounts created by this instructor
    const filter = {
      userId: req.user._id,
    };

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (type) filter.type = type;

    // Search by discount code or description
    if (search) {
      filter.$or = [
        { discountCode: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get discounts with pagination
    const discounts = await Discount.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalDiscounts = await Discount.countDocuments(filter);
    const totalPages = Math.ceil(totalDiscounts / parseInt(limit));

    if (!discounts || discounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No discounts found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Get instructor discounts list successfully",
      data: {
        discounts,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalDiscounts,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get instructor discounts error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get single discount by ID
 * @route   GET /api/admin/discounts/:discountId
 * @access  Admin
 */
exports.getDiscountById = async (req, res) => {
  try {
    const { discountId } = req.params;

    const discount = await Discount.findById(discountId);

    if (!discount) {
      return res.status(404).json({
        success: false,
        message: "Discount not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Get discount information successfully",
      data: discount,
    });
  } catch (error) {
    console.error("Get discount by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Create new discount
 * @route   POST /api/admin/discounts
 * @route   POST /api/instructor/discounts
 * @access  Admin, Instructor
 */
exports.createDiscount = async (req, res) => {
  try {
    const {
      discountCode,
      description,
      category,
      type,
      value,
      usageLimit,
      status,
      minimumOrder,
      maximumDiscount,
      startDate,
      endDate,
      applyCourses, // Array of course IDs
    } = req.body;

    // Validate required fields
    if (!discountCode || !description || !category || !type || !value) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide all required fields (discountCode, description, category, type, value)",
      });
    }

    // Validate category enum
    const validCategories = ["general", "seasonal", "welcome", "special"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Category must be one of: ${validCategories.join(", ")}`,
      });
    }

    // Validate type enum
    const validTypes = ["percent", "fixedAmount"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Type must be one of: ${validTypes.join(", ")}`,
      });
    }

    // Validate status enum if provided
    if (status) {
      const validStatuses = ["active", "expired", "inActive"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Status must be one of: ${validStatuses.join(", ")}`,
        });
      }
    }

    // Check if discount code already exists
    const existingDiscount = await Discount.findOne({ discountCode });
    if (existingDiscount) {
      return res.status(400).json({
        success: false,
        message: "Discount code already exists",
      });
    }

    // Validate date range
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Start date must be earlier than end date",
      });
    }

    // Validate value based on type
    if (type === "percent" && (value < 0 || value > 100)) {
      return res.status(400).json({
        success: false,
        message: "Percentage value must be between 0 and 100",
      });
    }

    if (type === "fixedAmount" && value < 0) {
      return res.status(400).json({
        success: false,
        message: "Discount value must be greater than 0",
      });
    }

    // Validate applyCourses ownership
    const courseValidation = await validateCoursesOwnership(
      applyCourses,
      req.user
    );
    if (!courseValidation.valid) {
      return res.status(403).json({
        success: false,
        message: courseValidation.message,
      });
    }

    // Create new discount
    const newDiscount = new Discount({
      discountCode,
      description,
      category,
      type,
      value,
      usage: 0, // Default usage is 0
      usageLimit: usageLimit || 0,
      status: status || "active",
      minimumOrder: minimumOrder || 0,
      maximumDiscount: maximumDiscount || 0,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      userId: req.user._id, // Save the creator's userId
      applyCourses: applyCourses || [], // Save the courses this discount applies to
    });

    const savedDiscount = await newDiscount.save();

    res.status(201).json({
      success: true,
      message: "Create discount successfully",
      data: savedDiscount,
    });
  } catch (error) {
    console.error("Create discount error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Update discount by ID
 * @route   PUT /api/admin/discounts/:discountId
 * @access  Admin
 * @route   PUT /api/instructor/discounts/:discountId
 * @access  Instructor (only their own discounts)
 */
exports.updateDiscount = async (req, res) => {
  try {
    const { discountId } = req.params;
    const updateData = req.body;

    // Check if discount exists
    const existingDiscount = await Discount.findById(discountId);
    if (!existingDiscount) {
      return res.status(404).json({
        success: false,
        message: "Discount not found",
      });
    }

    // Check ownership for instructors (admins can update any discount)
    if (req.user.role === "instructor") {
      if (existingDiscount.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to update this discount",
        });
      }
    }

    // Validate category enum if provided
    if (updateData.category) {
      const validCategories = ["general", "seasonal", "welcome", "special"];
      if (!validCategories.includes(updateData.category)) {
        return res.status(400).json({
          success: false,
          message: `Category must be one of: ${validCategories.join(", ")}`,
        });
      }
    }

    // Validate type enum if provided
    if (updateData.type) {
      const validTypes = ["percent", "fixedAmount"];
      if (!validTypes.includes(updateData.type)) {
        return res.status(400).json({
          success: false,
          message: `Type must be one of: ${validTypes.join(", ")}`,
        });
      }
    }

    // Validate status enum if provided
    if (updateData.status) {
      const validStatuses = ["active", "expired", "inActive"];
      if (!validStatuses.includes(updateData.status)) {
        return res.status(400).json({
          success: false,
          message: `Status must be one of: ${validStatuses.join(", ")}`,
        });
      }
    }

    // Check if discount code already exists (excluding current discount)
    if (updateData.discountCode) {
      const duplicateDiscount = await Discount.findOne({
        discountCode: updateData.discountCode,
        _id: { $ne: discountId },
      });
      if (duplicateDiscount) {
        return res.status(400).json({
          success: false,
          message: "Discount code already exists",
        });
      }
    }

    // Validate date range if both dates are provided
    if (
      updateData.startDate &&
      updateData.endDate &&
      new Date(updateData.startDate) >= new Date(updateData.endDate)
    ) {
      return res.status(400).json({
        success: false,
        message: "Start date must be earlier than end date",
      });
    }

    // Validate value based on type
    if (
      updateData.type === "percent" &&
      updateData.value &&
      (updateData.value < 0 || updateData.value > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Percentage value must be between 0 and 100",
      });
    }

    if (
      updateData.type === "fixedAmount" &&
      updateData.value &&
      updateData.value < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Discount value must be greater than 0",
      });
    }

    // Validate applyCourses ownership if provided
    if (updateData.applyCourses !== undefined) {
      const courseValidation = await validateCoursesOwnership(
        updateData.applyCourses,
        req.user
      );
      if (!courseValidation.valid) {
        return res.status(403).json({
          success: false,
          message: courseValidation.message,
        });
      }
    }

    // Convert date strings to Date objects if provided
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    // Prevent updating userId
    delete updateData.userId;

    // Update discount
    const updatedDiscount = await Discount.findByIdAndUpdate(
      discountId,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Update discount successfully",
      data: updatedDiscount,
    });
  } catch (error) {
    console.error("Update discount error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get discount statistics
 * @route   GET /api/admin/discounts/stats
 * @access  Admin
 */
exports.getDiscountStats = async (req, res) => {
  try {
    const totalDiscounts = await Discount.countDocuments();
    const activeDiscounts = await Discount.countDocuments({ status: "active" });
    const expiredDiscounts = await Discount.countDocuments({
      status: "expired",
    });
    const inactiveDiscounts = await Discount.countDocuments({
      status: "inActive",
    });

    // Get most used discounts
    const mostUsedDiscounts = await Discount.find()
      .sort({ usage: -1 })
      .limit(5)
      .select("discountCode description usage usageLimit");

    res.status(200).json({
      success: true,
      message: "Get discount statistics successfully",
      data: {
        overview: {
          total: totalDiscounts,
          active: activeDiscounts,
          expired: expiredDiscounts,
          inactive: inactiveDiscounts,
        },
        mostUsed: mostUsedDiscounts,
      },
    });
  } catch (error) {
    console.error("Get discount stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get available discounts (active, not expired, usage not full)
 * @route   GET /api/discounts/available
 * @access  Public
 */
exports.getAvailableDiscounts = async (req, res) => {
  try {
    const now = new Date();
    // Build filter for available discounts
    const filter = {
      status: "active",
      $or: [
        { usageLimit: 0 }, // unlimited usage
        { $expr: { $lt: ["$usage", "$usageLimit"] } }, // usage < usageLimit
      ],
      $and: [
        {
          $or: [{ startDate: null }, { startDate: { $lte: now } }],
        },
        {
          $or: [{ endDate: null }, { endDate: { $gte: now } }],
        },
      ],
    };

    const discounts = await Discount.find(filter).sort({ createdAt: -1 });

    if (!discounts || discounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No available discounts found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Get available discounts successfully",
      data: discounts,
    });
  } catch (error) {
    console.error("Get available discounts error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Tăng usage cho discount
 * @route   POST /api/discounts/:discountId/increase-usage
 * @access  User
 */
exports.increaseDiscountUsage = async (req, res) => {
  try {
    const { discountId } = req.params;
    const discount = await Discount.findById(discountId);
    if (!discount) {
      return res.status(404).json({ message: "Discount not found" });
    }
    // Nếu có usageLimit > 0 và usage đã đủ thì không tăng nữa
    if (discount.usageLimit > 0 && discount.usage >= discount.usageLimit) {
      return res.status(400).json({ message: "Discount usage limit reached" });
    }
    discount.usage += 1;
    await discount.save();
    res.status(200).json({
      message: "Discount usage increased successfully",
      discount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get available discounts for specific courses
 * @route   POST /api/discounts/available-for-courses
 * @access  Public
 */
exports.getAvailableDiscountsForCourses = async (req, res) => {
  try {
    const { courseIds } = req.body;

    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of course IDs",
      });
    }

    const now = new Date();

    // Build filter for available discounts
    const filter = {
      status: "active",
      $or: [
        { usageLimit: 0 }, // unlimited usage
        { $expr: { $lt: ["$usage", "$usageLimit"] } }, // usage < usageLimit
      ],
      $and: [
        {
          $or: [{ startDate: null }, { startDate: { $lte: now } }],
        },
        {
          $or: [{ endDate: null }, { endDate: { $gte: now } }],
        },
        {
          // Discount must have at least one course in applyCourses that matches courseIds
          applyCourses: { $in: courseIds },
        },
      ],
    };

    const discounts = await Discount.find(filter)
      .populate("userId", "name email")
      .populate("applyCourses", "title price")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Get available discounts for courses successfully",
      data: discounts,
    });
  } catch (error) {
    console.error("Get available discounts for courses error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Remove course from discount applyCourses
 * @route   DELETE /api/admin/discounts/:discountId/courses/:courseId
 * @access  Admin
 * @route   DELETE /api/instructor/discounts/:discountId/courses/:courseId
 * @access  Instructor (only their own discounts)
 */
exports.removeCourseFromDiscount = async (req, res) => {
  try {
    const { discountId, courseId } = req.params;

    // Check if discount exists
    const discount = await Discount.findById(discountId);
    if (!discount) {
      return res.status(404).json({
        success: false,
        message: "Discount not found",
      });
    }

    // Check ownership for instructors (admins can remove from any discount)
    if (req.user.role === "instructor") {
      if (discount.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to modify this discount",
        });
      }
    }

    // Remove course from applyCourses array
    const updatedDiscount = await Discount.findByIdAndUpdate(
      discountId,
      { $pull: { applyCourses: courseId } },
      { new: true }
    ).populate("applyCourses", "title price");

    res.status(200).json({
      success: true,
      message: "Course removed from discount successfully",
      data: updatedDiscount,
    });
  } catch (error) {
    console.error("Remove course from discount error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
