const multer = require("multer");
const path = require("path");

// Cấu hình multer lưu file tạm thời vào thư mục uploads
const upload = multer({ dest: path.join(__dirname, "../uploads/") });

module.exports = upload;
