/**
 * Home Page & General
 * PIC: Trung
 **/
const Course = require("../models/courseModel");
const Discount = require("../models/discountModel");
const section = require("../models/sectionModel");
const Category = require("../models/categoryModel");
const User = require("../models/userModel");
const Enrollment = require("../models/enrollmentModel");
const InstructorProfile = require("../models/instructorProfileModel");
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const courseController = {
  /**
   * @desc    Lấy danh sách khóa học: Hỗ trợ lọc, sắp xếp và phân trang. Dùng cho các use case: View Courses, Filter, Sort.
   * @route   GET /api/courses
   * @access  Public
   */
  getAllCourses: async (req, res) => {
    try {
      // Thêm { status: "active" } vào hàm find()
      const courses = await Course.find({ status: "active" })
        .populate("categoryIds") // Populate categoryId to get category details
        .populate("discountId")
        .populate("sections")
        .populate("createdBy", "firstName lastName"); // Populate createdBy to get instructor details
      if (!courses || courses.length === 0) {
        // Trả về 200 với mảng rỗng
        return res.status(200).json([]);
      }

      // Get enrollment count for each course
      const coursesWithEnrollmentCount = await Promise.all(
        courses.map(async (course) => {
          const enrollmentCount = await Enrollment.countDocuments({
            courseId: course._id,
            status: "enrolled",
          });
          const courseObj = course.toObject();
          return {
            ...courseObj,
            studentsCount: enrollmentCount,
          };
        })
      );

      res.status(200).json(coursesWithEnrollmentCount);
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
   * @desc    Lấy khóa học bán chạy (đã cập nhật với filter category)
   * @route   GET api/courses/top-selling?limit=...&category=...
   * @access  Public
   */
  getTopCourses: async (req, res) => {
    try {
      // ... (Phần code aggregation của bạn giữ nguyên) ...
      const limit = parseInt(req.query.limit) || 5;
      const categoryName = req.query.category;
      const matchStage = { status: "active" };
      if (categoryName) {
        const escapedCategoryName = escapeRegex(categoryName);
        const matchingCategories = await Category.find({
          name: { $regex: escapedCategoryName, $options: "i" },
        });
        if (matchingCategories.length > 0) {
          const categoryIds = matchingCategories.map((cat) => cat._id);
          matchStage.categoryIds = { $in: categoryIds };
        } else {
          return res.status(200).json([]);
        }
      }
      const courses = await Course.aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: "enrollments",
            localField: "_id",
            foreignField: "courseId",
            pipeline: [{ $match: { status: "enrolled" } }],
            as: "studentData",
          },
        },
        { $addFields: { studentsCount: { $size: "$studentData" } } },
        { $sort: { studentsCount: -1 } },
        { $limit: limit },
        { $project: { studentData: 0 } },
      ]);
      const populatedCourses = await Course.populate(courses, [
        { path: "categoryIds" },
        { path: "discountId" },
        { path: "sections" },
        { path: "createdBy", select: "firstName lastName userImage" },
      ]);
      if (!populatedCourses || populatedCourses.length === 0) {
        return res.status(200).json([]);
      } // --- BẮT ĐẦU SỬA LỖI ---

      const coursesWithFullInstructor = await Promise.all(
        populatedCourses.map(async (course) => {
          if (course.createdBy && course.createdBy._id) {
            const instructorProfile = await InstructorProfile.findOne({
              userId: course.createdBy._id,
            }).select("averageRating totalReviews");

            // 1. Chuyển createdBy (Mongoose Doc) thành object thuần túy
            const createdByObject = course.createdBy.toObject();

            if (instructorProfile) {
              // 2. Gắn profile vào object thuần túy
              createdByObject.instructorProfile = instructorProfile;
            } else {
              createdByObject.instructorProfile = {
                averageRating: 0,
                totalReviews: 0,
              };
            }

            // 3. Ghi đè createdBy cũ bằng object mới đã có profile
            course.createdBy = createdByObject;
          }
          return course;
        })
      ); // --- KẾT THÚC SỬA LỖI ---
      res.status(200).json(coursesWithFullInstructor); // Gửi mảng đã được sửa
    } catch (error) {
      console.error("Error in getTopCourses:", error);
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
      const limit = parseInt(req.query.limit) || 5;
      const courses = await Course.find({ status: "active" })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("categoryIds")
        .populate("discountId")
        .populate("sections")
        .populate("createdBy", "firstName lastName userImage"); // 1. Populate cơ bản

      if (!courses || courses.length === 0) {
        return res.status(404).json({ message: "Not found new courses" });
      } // 2. Dùng Promise.all để thêm CẢ studentsCount VÀ instructorProfile

      const finalCourses = await Promise.all(
        courses.map(async (course) => {
          // Lấy số lượng học viên
          const enrollmentCount = await Enrollment.countDocuments({
            courseId: course._id,
            status: "enrolled",
          }); // Chuyển sang object thuần túy

          const courseObj = course.toObject(); // --- BẮT ĐẦU SỬA LỖI --- // Lấy instructorProfile (giống hệt logic của getTopCourses)

          if (courseObj.createdBy && courseObj.createdBy._id) {
            const instructorProfile = await InstructorProfile.findOne({
              userId: courseObj.createdBy._id,
            }).select("averageRating totalReviews");

            if (instructorProfile) {
              courseObj.createdBy.instructorProfile = instructorProfile;
            } else {
              courseObj.createdBy.instructorProfile = {
                averageRating: 0,
                totalReviews: 0,
              };
            }
          } // --- KẾT THÚC SỬA LỖI --- // Trả về object đã được thêm 2 trường
          return {
            ...courseObj,
            studentsCount: enrollmentCount,
          };
        })
      );

      res.status(200).json(finalCourses); // Trả về mảng đã sửa
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
      const { userId, courseIds } = req.body;

      if (!userId || !Array.isArray(courseIds) || courseIds.length === 0) {
        return res.status(400).json({ message: "Missing userId or courseIds" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // 1. Lọc ra các khóa học mà người dùng CHƯA đăng ký
      const newCourses = courseIds.filter(
        (id) => !user.enrolledCourses.includes(id)
      );

      // Nếu không có khóa học mới nào để thêm thì báo thành công luôn
      if (newCourses.length === 0) {
        return res.status(200).json({
          message: "User is already enrolled in all specified courses.",
          enrolledCourses: user.enrolledCourses,
          addedCourses: [],
        });
      }

      // 2. Cập nhật cho User: Thêm các khóa học mới vào danh sách của user
      user.enrolledCourses.push(...newCourses);
      await user.save();

      // 3. LOGIC MỚI: Cập nhật cho các Course
      // Thêm userId vào mảng studentsEnrolled của TẤT CẢ các khóa học mới
      await Course.updateMany(
        { _id: { $in: newCourses } }, // Điều kiện: Tìm tất cả course có _id nằm trong mảng newCourses
        { $addToSet: { studentsEnrolled: userId } } // Hành động: Thêm userId vào mảng studentsEnrolled
      );

      // 4. Trả về kết quả thành công
      res.status(200).json({
        message: "Courses enrolled successfully",
        enrolledCourses: user.enrolledCourses,
        addedCourses: newCourses,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
  /**
   * @desc    Gán discount cho khóa học
   * @route   POST /api/courses/:courseId/assign-discount
   * @access  Admin
   */
  assignDiscountToCourse: async (req, res) => {
    try {
      const { courseId } = req.params;
      const { discountId } = req.body;
      if (!discountId) {
        return res.status(400).json({ message: "Missing discountId" });
      }
      // Kiểm tra tồn tại course
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }
      // Kiểm tra tồn tại discount
      const discount = await Discount.findById(discountId);
      if (!discount) {
        return res.status(404).json({ message: "Discount not found" });
      }
      // Gán discountId cho course
      course.discountId = discountId;
      await course.save();
      const updatedCourse = await Course.findById(courseId).populate(
        "discountId"
      );
      res.status(200).json({
        message: "Discount assigned to course successfully",
        course: updatedCourse,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
  /**
   * @desc    Kiểm tra xem user đã join khóa học hay chưa
   * @route   GET /api/courses/is-enrolled
   * @access  Admin
   */
  isUserEnrolled: async (req, res) => {
    try {
      // SỬA Ở ĐÂY: Đổi từ req.body sang req.query
      const { userId, courseId } = req.query;

      if (!userId || !courseId) {
        return res.status(400).json({ message: "Missing userId or courseId" });
      }

      const enrollment = await Enrollment.findOne({
        userId: userId,
        courseId: courseId,
        status: "enrolled",
      });

      res.status(200).json({ isEnrolled: !!enrollment });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = courseController;
