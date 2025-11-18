const Certificate = require("../models/certificateModel");
const User = require("../models/userModel");
const Course = require("../models/courseModel");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { userCompletedCourseEmail } = require("../utils/emailTemplates");
const sendEmail = require("../utils/sendEmail");

exports.generateCertificate = async (req, res) => {
  const { courseId } = req.params;
  const userId = req.user.id;

  try {
    // 1. Kiểm tra chứng chỉ đã tồn tại chưa
    let existingCertificate = await Certificate.findOne({ userId, courseId });
    if (existingCertificate) {
      return res.status(200).json({
        message: "Chứng chỉ đã được tạo trước đó.",
        certificate: existingCertificate,
      });
    }

    // 2. Nếu chưa, bắt đầu tạo mới
    // Lấy thông tin (thêm 'email' và 'message.congrats'
    const user = await User.findById(userId).select("firstName lastName email"); // <-- ĐÃ THÊM 'email'
    const course = await Course.findById(courseId)
      .populate("createdBy")
      .select("title message.congrats createdBy"); // <-- ĐÃ THÊM 'message.congrats'

    if (!user || !course) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy người dùng hoặc khoá học." });
    }

    // 3. Chuẩn bị dữ liệu (Giữ nguyên)
    const userName = `${user.firstName} ${user.lastName}`.trim();
    const courseTitle = course.title;
    const teacherName =
      course.createdBy && course.createdBy.firstName
        ? `${course.createdBy.firstName} ${course.createdBy.lastName}`.trim()
        : "TEA ROBINSON";

    if (!userName || !courseTitle) {
      console.error("Dữ liệu in bị thiếu:", { userName, courseTitle });
      return res
        .status(400)
        .json({ message: "Thiếu tên người dùng hoặc tên khoá học." });
    }

    // 4. Đọc template (Giữ nguyên)
    const templatePath = path.join(
      __dirname,
      "../templates/certificate-template.html"
    );
    let html = await fs.readFile(templatePath, "utf-8");
    html = html.replace("{{STUDENT_NAME}}", userName);
    html = html.replace("{{COURSE_TITLE}}", courseTitle);
    html = html.replace("{{SIGNATORY_NAME}}", teacherName);

    // 5. Chạy Puppeteer (Giữ nguyên)
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({
      width: 1123,
      height: 794,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "networkidle0" });
    const imageBuffer = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1123, height: 794 },
    });
    await browser.close();

    // 6. Upload lên Firebase (Giữ nguyên)
    const bucket = admin.storage().bucket();
    const fileName = `certificates/${crypto.randomUUID()}.png`;
    const file = bucket.file(fileName);

    await file.save(imageBuffer, {
      metadata: { contentType: "image/png" },
      public: true,
    });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // 7. Lưu chứng chỉ vào DB (Giữ nguyên)
    const newCertificate = new Certificate({
      userId,
      courseId,
      certificateUrl: publicUrl,
    });
    await newCertificate.save();

    // 8. --- *** LOGIC GỬI EMAIL MỚI ĐƯỢC THÊM VÀO *** ---
    // Gửi email sau khi đã tạo chứng chỉ thành công
    try {
      console.log(`[Certificate] Gửi email chúc mừng cho user: ${user.email}`);

      const congratsMessage =
        course.message.congrats || "You've successfully completed the course.";

      // Dùng template 'userCompletedCourseEmail' mà bạn đã có
      const emailContent = userCompletedCourseEmail(
        userName, // Tên học viên
        courseTitle, // Tên khoá học
        congratsMessage, // Lời chúc mừng
        publicUrl // Link tới chứng chỉ mới
      );

      await sendEmail(
        user.email,
        `Chúc mừng bạn đã hoàn thành khóa học: ${courseTitle}!`,
        emailContent
      );

      console.log(`[Certificate] Gửi email thành công.`);
    } catch (emailError) {
      // Quan trọng: Chỉ ghi log lỗi email, không làm hỏng request
      // Người dùng vẫn nhận được chứng chỉ, đó là điều quan trọng nhất
      console.error(
        `[Certificate] Lỗi khi gửi email chúc mừng (nhưng đã tạo cert thành công):`,
        emailError
      );
    }
    // --- *** KẾT THÚC LOGIC EMAIL *** ---

    // 9. Trả về kết quả
    res.status(201).json({
      message: "Tạo chứng chỉ và gửi email thành công!", // <-- Cập nhật thông báo
      certificate: newCertificate,
    });
  } catch (error) {
    console.error("Lỗi khi tạo chứng chỉ PNG:", error);
    res.status(500).json({ message: "Lỗi máy chủ nội bộ." });
  }
};
