const Discount = require("../models/discountModel");

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
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalDiscounts = await Discount.countDocuments(filter);
    const totalPages = Math.ceil(totalDiscounts / parseInt(limit));

    if (!discounts || discounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy discount nào",
      });
    }

    res.status(200).json({
      success: true,
      message: "Lấy danh sách discount thành công",
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
      message: "Lỗi máy chủ",
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
        message: "Không tìm thấy discount",
      });
    }

    res.status(200).json({
      success: true,
      message: "Lấy thông tin discount thành công",
      data: discount,
    });
  } catch (error) {
    console.error("Get discount by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

/**
 * @desc    Create new discount
 * @route   POST /api/admin/discounts
 * @access  Admin
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
    } = req.body;

    // Validate required fields
    if (!discountCode || !description || !category || !type || !value) {
      return res.status(400).json({
        success: false,
        message:
          "Vui lòng cung cấp đầy đủ thông tin bắt buộc (discountCode, description, category, type, value)",
      });
    }

    // Check if discount code already exists
    const existingDiscount = await Discount.findOne({ discountCode });
    if (existingDiscount) {
      return res.status(400).json({
        success: false,
        message: "Mã giảm giá đã tồn tại",
      });
    }

    // Validate date range
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu phải nhỏ hơn ngày kết thúc",
      });
    }

    // Validate value based on type
    if (type === "percent" && (value < 0 || value > 100)) {
      return res.status(400).json({
        success: false,
        message: "Giá trị phần trăm phải từ 0 đến 100",
      });
    }

    if (type === "fixedAmount" && value < 0) {
      return res.status(400).json({
        success: false,
        message: "Giá trị giảm giá phải lớn hơn 0",
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
    });

    const savedDiscount = await newDiscount.save();

    res.status(201).json({
      success: true,
      message: "Tạo discount thành công",
      data: savedDiscount,
    });
  } catch (error) {
    console.error("Create discount error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

/**
 * @desc    Update discount by ID
 * @route   PUT /api/admin/discounts/:discountId
 * @access  Admin
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
        message: "Không tìm thấy discount",
      });
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
          message: "Mã giảm giá đã tồn tại",
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
        message: "Ngày bắt đầu phải nhỏ hơn ngày kết thúc",
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
        message: "Giá trị phần trăm phải từ 0 đến 100",
      });
    }

    if (
      updateData.type === "fixedAmount" &&
      updateData.value &&
      updateData.value < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Giá trị giảm giá phải lớn hơn 0",
      });
    }

    // Convert date strings to Date objects if provided
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    // Update discount
    const updatedDiscount = await Discount.findByIdAndUpdate(
      discountId,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Cập nhật discount thành công",
      data: updatedDiscount,
    });
  } catch (error) {
    console.error("Update discount error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete discount by ID
 * @route   DELETE /api/admin/discounts/:discountId
 * @access  Admin
 */
exports.deleteDiscount = async (req, res) => {
  try {
    const { discountId } = req.params;

    // Check if discount exists
    const discount = await Discount.findById(discountId);
    if (!discount) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy discount",
      });
    }

    // Check if discount is being used (has usage > 0)
    if (discount.usage > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Không thể xóa discount đã được sử dụng. Hãy đặt trạng thái thành 'inActive' thay vì xóa.",
      });
    }

    // Delete discount
    await Discount.findByIdAndDelete(discountId);

    res.status(200).json({
      success: true,
      message: "Xóa discount thành công",
    });
  } catch (error) {
    console.error("Delete discount error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
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
      message: "Lấy thống kê discount thành công",
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
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};
