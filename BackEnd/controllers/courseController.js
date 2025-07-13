/**
 * Home Page & General
 * PIC: Trung
 **/
const Course = require("../models/courseModel");
const Discount = require("../models/discountModel");
const section = require("../models/sectionModel");
const Category = require("../models/categoryModel");
const User = require("../models/userModel");
const courseController = {
  /**
   * @desc    Lấy danh sách khóa học: Hỗ trợ lọc, sắp xếp và phân trang. Dùng cho các use case: View Courses, Filter, Sort.
   * @route   GET /api/courses
   * @access  Public
   */
  getAllCourses: async (req, res) => {
    try {
      const courses = await Course.find()
        .populate("categoryIds") // Populate categoryId to get category details
        .populate("discountId")
        .populate("sections");
      if (!courses || courses.length === 0) {
        return res.status(404).json({ message: "Not found courses" });
      }
      res.status(200).json(courses);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
  /**
   * @desc    Tìm kiếm khóa học: Trả về danh sách khóa học dựa trên từ khóa.(title and description)
   * @route   GET api/courses/search?keyword=<keyword>
   * @access  Public
   * Example: api/courses/search?keyword=This course teaches the fundamentals
   */
  searchCourses: async (req, res) => {
    try {
      const { keyword } = req.query;
      const courses = await Course.find({
        $or: [
          { title: { $regex: keyword, $options: "i" } },
          { "detail.description": { $regex: keyword, $options: "i" } },
        ],
      })
        .populate("categoryIds")
        .populate("discountId")
        .populate("sections");
      if (!courses || courses.length === 0) {
        return res.status(404).json({ message: "Not found courses" });
      }
      res.status(200).json(courses);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
  /**
   * @desc    Lấy khóa học bán chạy: Lấy danh sách các khóa học hàng đầu.
   * @route   GET api/courses/top-selling?limit=...
   * @access  Public
   */
  getTopCourses: async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 5; // Default to 5 if not provided
      const courses = await Course.aggregate([
        {
          $addFields: {
            studentsCount: { $size: { $ifNull: ["$studentsEnrolled", []] } },
          },
        },
        { $sort: { studentsCount: -1 } }, // Sort by number of students enrolled desc
        { $limit: limit }, // Limit to top N courses
      ]);
      // Populate all fields after aggregate
      const populatedCourses = await Course.populate(courses, [
        { path: "categoryIds" },
        { path: "discountId" },
        { path: "sections" },
      ]);
      if (!populatedCourses || populatedCourses.length === 0) {
        return res.status(404).json({ message: "Not found top courses" });
      }
      res.status(200).json(populatedCourses);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  /**
   * @desc    Lấy khóa học mới: Lấy danh sách các khóa học được thêm gần đây.
   * @route   GET /api/courses/recently-added?limit=...
   * @access  Public
   */
  getNewCourses: async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 5; // Default to 5 if not provided
      const courses = await Course.find()
        .sort({ createdAt: -1 }) // Sort by creation date desc
        .limit(limit)
        .populate("categoryIds")
        .populate("discountId")
        .populate("sections");
      if (!courses || courses.length === 0) {
        return res.status(404).json({ message: "Not found new courses" });
      }
      res.status(200).json(courses);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
  /**
   * @desc    Tham gia vào khóa học: Thêm courseId vào enrolledCourse
   * @route   POST /api/courses/enroll-course
   * @access  Student
   */
  enrollCourse: async (req, res) => {
    try {
      const { userId, courseId } = req.body;
      if (!userId || !courseId) {
        return res.status(400).json({ message: "Missing userId or courseId" });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Kiểm tra nếu đã enroll thì không thêm nữa
      if (user.enrolledCourses.includes(courseId)) {
        return res.status(400).json({ message: "Course already enrolled" });
      }
      user.enrolledCourses.push(courseId);
      await user.save();
      res
        .status(200)
        .json({
          message: "Course enrolled successfully",
        });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
};
module.exports = courseController;
