const Wishlist = require("../models/wishlistModel");
require("../models/courseModel");
require("../models/categoryModel");
require("../models/sectionModel");
require("../models/discountModel");
const wishlistController = {
  /**
   * @desc    Xem danh sách yêu thích: Lấy danh sách các khóa học trong wishlist.
   * @route   GET /api/wishlist/:userId
   * @access  Student
   */
  //
  viewWishlist: async (req, res) => {
    try {
      const userId = req.params.userId;
      let wishlist = await Wishlist.findOne({ userId }).populate({
        path: "courseIds",
        populate: [
          { path: "categoryIds" },
          { path: "sections" },
          { path: "discountId" },
        ],
      });
      if (!wishlist) {
        wishlist = new Wishlist({ userId, courseIds: [] });
        await wishlist.save();
      }
      res.status(200).json(wishlist);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
  /**
   * @desc    Thêm vào danh sách yêu thích: Thêm một khóa học vào wishlist.
   * @route   POST /api/wishlist
   * @access  Student
   */
  addToWishlist: async (req, res) => {
    try {
      const { userId, courseId } = req.body;
      if (!courseId) {
        return res.status(400).json({ message: "Course ID is required." });
      }
      let wishlist = await Wishlist.findOne({ userId });
      if (!wishlist) {
        wishlist = new Wishlist({ userId, courseIds: [] });
      }
      if (wishlist.courseIds.includes(courseId)) {
        return res.status(400).json({
          message: "Course already exists in the wishlist.",
          courseId,
        });
      }
      wishlist.courseIds.push(courseId);
      await wishlist.save();
      res
        .status(200)
        .json({ message: "Course added to wishlist successfully.", courseId });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
  /**
   * @desc    Xóa khỏi danh sách yêu thích: Xóa một khóa học khỏi wishlist.
   * @route   DELETE /api/wishlist/?userId=<userId>&courseId=<courseId>
   * @access  Student
   */
  removeFromWishlist: async (req, res) => {
    try {
      const { userId, courseId } = req.query;
      let wishlist = await Wishlist.findOne({ userId });
      if (!wishlist) {
        return res.status(404).json({ message: "Wishlist not found." });
      }
      if (!wishlist.courseIds.includes(courseId)) {
        return res
          .status(400)
          .json({ message: "Course not found in the wishlist.", courseId });
      }
      wishlist.courseIds = wishlist.courseIds.filter(
        (id) => id.toString() !== courseId
      );
      await wishlist.save();
      res.status(200).json({
        message: "Course removed from wishlist successfully.",
        courseId,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
};
module.exports = wishlistController;
