const Certificate = require("../models/certificateModel");
const User = require("../models/userModel");
const Course = require("../models/courseModel");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto"); // THÊM IMPORT NÀY

exports.generateCertificate = async (req, res) => {
  const { courseId } = req.params;
  const userId = req.user.id;

  try {
    let existingCertificate = await Certificate.findOne({ userId, courseId });
    if (existingCertificate) {
      return res.status(200).json({
        message: "Chứng chỉ đã được tạo trước đó.",
        certificate: existingCertificate,
      });
    }

    const user = await User.findById(userId);
    const course = await Course.findById(courseId).populate("createdBy");

    if (!user || !course) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy người dùng hoặc khoá học." });
    }

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

    const templatePath = path.join(
      __dirname,
      "../templates/certificate-template.html"
    );
    let html = await fs.readFile(templatePath, "utf-8");

    html = html.replace("{{STUDENT_NAME}}", userName);
    html = html.replace("{{COURSE_TITLE}}", courseTitle);
    html = html.replace("{{SIGNATORY_NAME}}", teacherName);

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      width: "1123px",
      height: "794px",
      printBackground: true,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
    });

    await browser.close();

    const bucket = admin.storage().bucket();

    // THAY ĐỔI: Dùng UUID để tạo tên file ngẫu nhiên và bảo mật
    const fileName = `certificates/${crypto.randomUUID()}.pdf`;

    const file = bucket.file(fileName);

    await file.save(pdfBuffer, {
      metadata: {
        contentType: "application/pdf",
      },
      public: true,
    });

    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    const newCertificate = new Certificate({
      userId,
      courseId,
      certificateUrl: publicUrl,
    });

    await newCertificate.save();

    res.status(201).json({
      message: "Tạo chứng chỉ PDF thành công!",
      certificate: newCertificate,
    });
  } catch (error) {
    console.error("Lỗi khi tạo chứng chỉ PDF:", error);
    res.status(500).json({ message: "Lỗi máy chủ nội bộ." });
  }
};
