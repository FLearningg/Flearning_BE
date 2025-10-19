const Cart = require("../models/cartModel");
require("../models/categoryModel");
require("../models/sectionModel");
require("../models/discountModel");
const cartController = {
  /**
   * @desc    Xem giỏ hàng: Lấy danh sách các khóa học trong giỏ hàng.
   * @route   GET /api/cart/:userId
   * @access  Student
   */
  getCart: async (req, res) => {
    try {
      const userId = req.params.userId;
      let cart = await Cart.findOne({ userId })
        .populate({
          path: "courseIds",
          populate: [
            { path: "categoryIds" },
            { path: "sections" },
            { path: "discountId" },
            { path: "createdBy" },
          ],
        })
        .sort({ createdAt: -1 });
      if (!cart) {
        // NOTE: If no cart exists for the user, create a new one (check in frontend if courseIds.length === 0 => show empty cart)
        cart = new Cart({ userId, courseIds: [] });
        await cart.save();
      }
      res.status(200).json(cart);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
  /**
   * @desc    Thêm vào giỏ hàng: Thêm một khóa học vào giỏ hàng.
   * @route   POST /api/cart
   * @access  Student
   */
  addToCart: async (req, res) => {
    try {
      const { userId, courseId } = req.body;
      let cart = await Cart.findOne({ userId });
      if (!userId || !courseId) {
        return res
          .status(400)
          .json({ message: "User ID and Course ID are required." });
      }
      if (!cart) {
        cart = new Cart({ userId, courseIds: [] });
      }
      if (cart.courseIds.includes(courseId)) {
        return res
          .status(400)
          .json({ message: "Course already exists in the cart.", courseId });
      }
      if (!cart.courseIds.includes(courseId)) {
        cart.courseIds.push(courseId);
      }
      await cart.save();
      res
        .status(200)
        .json({ message: "Course added to cart successfully.", courseId });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
  /**
   * @desc    Xóa khỏi giỏ hàng: Xóa một khóa học khỏi giỏ hàng.
   * @route   DELETE /api/cart/?userId=<userId>&courseId=<courseId>
   * @access  Student
   */
  removeFromCart: async (req, res) => {
    try {
      const { userId, courseId } = req.query;
      if (!userId || !courseId) {
        return res
          .status(400)
          .json({ message: "User ID and Course ID are required." });
      }
      let cart = await Cart.findOne({ userId });
      if (!cart) {
        return res.status(404).json({ message: "Cart not found." });
      }
      const courseIdStr = courseId.toString();
      const exists = cart.courseIds.some((id) => id.toString() === courseIdStr);
      if (!exists) {
        return res
          .status(404)
          .json({ message: "Course not found in cart.", courseId });
      }

      cart.courseIds = cart.courseIds.filter(
        (id) => id.toString() !== courseIdStr
      );
      await cart.save();
      res
        .status(200)
        .json({ message: "Course removed from cart successfully.", courseId });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
};
module.exports = cartController;
