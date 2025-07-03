const multer = require("multer");
const path = require("path");
// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp + random number + original extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "profile-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter for image validation
const fileFilter = (req, file, cb) => {
  // Check if file is an image
  if (file.mimetype.startsWith("image/")) {
    // Allowed image types
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Only JPEG, JPG, PNG, GIF and WebP files are allowed"),
        false
      );
    }
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

// Multer upload configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1, // Only allow 1 file
  },
});

// Error handling middleware for multer
const handleUploadError = (expectedFieldName = "file") => {
  return (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      switch (error.code) {
        case "LIMIT_FILE_SIZE":
          return res.status(400).json({
            success: false,
            message: "File size too large. Maximum allowed size is 5MB",
            error_code: "FILE_TOO_LARGE",
          });
        case "LIMIT_FILE_COUNT":
          return res.status(400).json({
            success: false,
            message: "Too many files. Only 1 file is allowed",
            error_code: "TOO_MANY_FILES",
          });
        case "LIMIT_UNEXPECTED_FILE":
          return res.status(400).json({
            success: false,
            message: `Unexpected field name. Please use "${expectedFieldName}" as the form field name for file upload`,
            error_code: "UNEXPECTED_FIELD",
            expected_field: expectedFieldName,
            hint: `Make sure your form field or FormData key is named "${expectedFieldName}"`,
          });
        case "LIMIT_PART_COUNT":
          return res.status(400).json({
            success: false,
            message: "Too many parts in multipart form",
            error_code: "TOO_MANY_PARTS",
          });
        case "LIMIT_FIELD_KEY":
          return res.status(400).json({
            success: false,
            message: "Field name too long",
            error_code: "FIELD_NAME_TOO_LONG",
          });
        case "LIMIT_FIELD_VALUE":
          return res.status(400).json({
            success: false,
            message: "Field value too long",
            error_code: "FIELD_VALUE_TOO_LONG",
          });
        case "LIMIT_FIELD_COUNT":
          return res.status(400).json({
            success: false,
            message: "Too many fields",
            error_code: "TOO_MANY_FIELDS",
          });
        default:
          return res.status(400).json({
            success: false,
            message: "File upload error: " + error.message,
            error_code: "UPLOAD_ERROR",
          });
      }
    }

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error_code: "GENERAL_ERROR",
      });
    }

    next();
  };
};

// Combined middleware for single file upload with error handling
const uploadSingle = (fieldName) => {
  return [upload.single(fieldName), handleUploadError(fieldName)];
};

// Combined middleware for multiple files upload with error handling
const uploadMultiple = (fieldName, maxCount = 5) => {
  const uploadInstance = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB per file
      files: maxCount,
    },
  });

  return [
    uploadInstance.array(fieldName, maxCount),
    handleUploadError(fieldName),
  ];
};

// Middleware for optional file upload (không bắt buộc phải có file)
const uploadOptional = (fieldName) => {
  return [
    (req, res, next) => {
      upload.single(fieldName)(req, res, (error) => {
        // Nếu không có file thì bỏ qua lỗi LIMIT_UNEXPECTED_FILE
        if (
          error instanceof multer.MulterError &&
          error.code === "LIMIT_UNEXPECTED_FILE"
        ) {
          return next();
        }
        if (error) {
          return handleUploadError(fieldName)(error, req, res, next);
        }
        next();
      });
    },
  ];
};

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadOptional,
  handleUploadError,
};
