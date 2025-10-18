const express = require("express");
const router = express.Router();
const publicRouter = express.Router();
const instructorRouter = express.Router();
const {
  getAllDiscounts,
  getInstructorDiscounts,
  getDiscountById,
  createDiscount,
  updateDiscount,
  getDiscountStats,
  getAvailableDiscounts, // Thêm controller mới
  increaseDiscountUsage, // Thêm controller tăng usage
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
 * INSTRUCTOR ROUTES
 */

/**
 * @route   GET /api/instructor/discounts
 * @desc    Get instructor's own discounts with filtering and pagination
 * @access  Instructor
 */
instructorRouter.get("/", authorize("instructor"), getInstructorDiscounts);

/**
 * @route   POST /api/instructor/discounts
 * @desc    Create new discount
 * @access  Instructor
 */
instructorRouter.post("/", authorize("instructor"), createDiscount);

/**
 * @route   GET /api/instructor/discounts/:discountId
 * @desc    Get single discount by ID
 * @access  Instructor
 */
instructorRouter.get("/:discountId", authorize("instructor"), getDiscountById);

/**
 * @route   PUT /api/instructor/discounts/:discountId
 * @desc    Update instructor's own discount by ID
 * @access  Instructor
 */
instructorRouter.put("/:discountId", authorize("instructor"), updateDiscount);

/**
 * PUBLIC ROUTES
 */

/**
 * @route   GET /api/discounts/available
 * @desc    Get available discounts (public)
 * @access  Public
 */
publicRouter.get("/available", getAvailableDiscounts);

/**
 * @route   POST /api/discounts/:discountId/increase-usage
 * @desc    Tăng usage cho discount (user thường)
 * @access  User
 */
publicRouter.post(
  "/:discountId/increase-usage",
  authorize(),
  increaseDiscountUsage
);

module.exports = {
  adminRouter: router,
  instructorRouter,
  publicRouter
};
