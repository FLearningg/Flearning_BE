const express = require("express");
const router = express.Router();
const {
  getAllDiscounts,
  getDiscountById,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  getDiscountStats,
} = require("../controllers/discountController");
const authorize = require("../middlewares/authMiddleware");

/**
 * @route   GET /api/admin/discounts/stats
 * @desc    Get discount statistics
 * @access  Admin
 */
router.get("/stats", authorize("admin"), getDiscountStats);

/**
 * @route   GET /api/admin/discounts
 * @desc    Get all discounts with filtering and pagination
 * @access  Admin
 */
router.get("/", authorize("admin"), getAllDiscounts);

/**
 * @route   POST /api/admin/discounts
 * @desc    Create new discount
 * @access  Admin
 */
router.post("/", authorize("admin"), createDiscount);

/**
 * @route   GET /api/admin/discounts/:discountId
 * @desc    Get single discount by ID
 * @access  Admin
 */
router.get("/:discountId", authorize("admin"), getDiscountById);

/**
 * @route   PUT /api/admin/discounts/:discountId
 * @desc    Update discount by ID
 * @access  Admin
 */
router.put("/:discountId", authorize("admin"), updateDiscount);

/**
 * @route   DELETE /api/admin/discounts/:discountId
 * @desc    Delete discount by ID
 * @access  Admin
 */
router.delete("/:discountId", authorize("admin"), deleteDiscount);

module.exports = router;
