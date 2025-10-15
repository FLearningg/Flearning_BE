const {
  uploadToFirebase: uploadToFirebaseStorage,
  uploadTrailer,
  uploadThumbnail,
  uploadSectionData,
  listCourseFiles,
  deleteFromFirebase,
  initializeCourseFolder,
  createCourseFolder,
  checkCourseFolders,
} = require("../utils/firebaseStorage");
const fs = require("fs");
const Course = require("../models/courseModel");

/**
 * Helper function to auto-detect folder type based on multiple factors
 * @param {string} fieldname - The field name from the uploaded file
 * @param {string} mimetype - MIME type of the file
 * @param {string} originalname - Original filename
 * @param {string} fileType - Explicit file type parameter from request
 * @returns {string} - Detected folder type
 */
const detectFolderType = (fieldname, mimetype, originalname, fileType) => {
  // Priority 1: Check fileType parameter first (highest priority)
  if (fileType && fileType !== "undefined" && fileType !== "null") {
    const fileTypeMap = {
      thumbnail: "thumbnail",
      image: "thumbnail",
      cover: "thumbnail",
      trailer: "trailer",
      video: "trailer",
      preview: "trailer",
      lesson: "section-data",
      lessonvideo: "section-data",
      lesson_video: "section-data",
      "lesson-video": "section-data",
      content: "section-data",
      material: "section-data",
      sectiondata: "section-data",
      "section-data": "section-data",

    };

    const detectedType = fileTypeMap[fileType.toLowerCase()];
    if (detectedType) {
      return detectedType;
    }
  }

  // Priority 2: Check field name for specific patterns
  if (fieldname) {
    const fieldResult = detectFromFieldName(fieldname);
    if (fieldResult !== "general") {
      return fieldResult;
    }
  }

  // Priority 3: Check MIME type for common patterns (but with lower priority for videos)
  const mimeResult = detectFromMimeType(mimetype);
  if (mimeResult !== "general") {
    return mimeResult;
  }

  // Priority 4: Check filename patterns
  const filenameResult = detectFromFilename(originalname);
  if (filenameResult !== "general") {
    return filenameResult;
  }

  return "general";
};

/**
 * Detect folder type from field name
 */
const detectFromFieldName = (fieldname) => {
  if (!fieldname) return "general";

  switch (fieldname.toLowerCase()) {
    case "thumbnail":
    case "courseimage":
    case "image":
    case "cover":
    case "poster":
      return "thumbnail";
    case "trailer":
    case "video":
    case "coursevideo":
    case "previewvideo":
    case "introvideo":
      return "trailer";
    case "sectiondata":
    case "lesson":
    case "lessonvideo":
    case "lesson_video":
    case "lesson-video":
    case "sectionvideo":
    case "content":
    case "material":
    case "file": // Common field name, check other factors
      return "section-data";

    default:
      return "general";
  }
};

/**
 * Detect folder type from MIME type
 */
const detectFromMimeType = (mimetype) => {
  if (!mimetype) return "general";

  // Images are usually thumbnails unless specified otherwise
  if (mimetype.startsWith("image/")) {
    return "thumbnail";
  }

  // Videos are usually trailers unless specified otherwise
  if (mimetype.startsWith("video/")) {
    return "trailer";
  }

  return "general";
};

/**
 * Detect folder type from filename patterns
 */
const detectFromFilename = (filename) => {
  if (!filename) return "general";

  const name = filename.toLowerCase();

  // Check for thumbnail keywords in filename
  if (
    name.includes("thumbnail") ||
    name.includes("cover") ||
    name.includes("poster") ||
    name.includes("image")
  ) {
    return "thumbnail";
  }

  // Check for trailer keywords in filename
  if (
    name.includes("trailer") ||
    name.includes("preview") ||
    name.includes("intro") ||
    name.includes("demo")
  ) {
    return "trailer";
  }

  // Check for lesson/section keywords in filename
  if (
    name.includes("lesson") ||
    name.includes("section") ||
    name.includes("content") ||
    name.includes("material")
  ) {
    return "section-data";
  }

  return "general";
};

/**
 * @desc    Upload file to Firebase Storage with specific folder type
 * @route   POST /api/admin/upload
 * @access  Private (Admin only)
 */
exports.uploadToFirebase = async (req, res) => {
  let tempFilePath = null;

  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { path: filePath, originalname, mimetype, fieldname } = req.file;
    const { courseId, folderType, fileType } = req.body;

    // Store temp file path for cleanup
    tempFilePath = filePath;

    // Validate folderType
    const validFolderTypes = [
      "trailer",
      "thumbnail",
      "section-data",
      "general",
    ];

    // Auto-detect folderType based on field name if not explicitly provided
    let actualFolderType;

    if (folderType && folderType !== "undefined" && folderType !== "null") {
      // Use explicitly provided folderType
      actualFolderType = folderType;
    } else if (fileType && fileType !== "undefined" && fileType !== "null") {
      // Use fileType parameter for direct specification
      const fileTypeMap = {
        thumbnail: "thumbnail",
        image: "thumbnail",
        cover: "thumbnail",
        trailer: "trailer",
        video: "trailer",
        preview: "trailer",
        lesson: "section-data",
        lessonvideo: "section-data",
        lesson_video: "section-data",
        "lesson-video": "section-data",
        content: "section-data",
        material: "section-data",
        sectiondata: "section-data",
        "section-data": "section-data",
      };

      actualFolderType = fileTypeMap[fileType.toLowerCase()] || "general";
    } else {
      // Auto-detect based on multiple factors
      actualFolderType = detectFolderType(
        fieldname,
        mimetype,
        originalname,
        fileType
      );
    }

    if (!validFolderTypes.includes(actualFolderType)) {
      return res.status(400).json({
        message: `Invalid folder type. Must be one of: ${validFolderTypes.join(
          ", "
        )}`,
      });
    }

    let result;

    // Use specific upload functions based on folderType
    switch (actualFolderType) {
      case "trailer":
        if (courseId && courseId !== "undefined" && courseId !== "null") {
          // Upload to course-specific folder
          result = await uploadTrailer(
            filePath,
            originalname,
            mimetype,
            courseId
          );
        } else {
          // Upload to temporary folder
          result = await uploadToFirebaseStorage(
            filePath,
            originalname,
            mimetype,
            null,
            "trailer"
          );
        }
        break;

      case "thumbnail":
        if (courseId && courseId !== "undefined" && courseId !== "null") {
          // Upload to course-specific folder
          result = await uploadThumbnail(
            filePath,
            originalname,
            mimetype,
            courseId
          );
        } else {
          // Upload to temporary folder
          result = await uploadToFirebaseStorage(
            filePath,
            originalname,
            mimetype,
            null,
            "thumbnail"
          );
        }
        break;

      case "section-data":
        if (courseId && courseId !== "undefined" && courseId !== "null") {
          // Upload to course-specific folder
          result = await uploadSectionData(
            filePath,
            originalname,
            mimetype,
            courseId
          );
        } else {
          // Upload to temporary folder
          result = await uploadToFirebaseStorage(
            filePath,
            originalname,
            mimetype,
            null,
            "section-data"
          );
        }
        break;

      // Handle new folder structure: section_1/lesson_1, section_2/lesson_1, etc.
      default:
        // Check if folderType matches pattern section_X/lesson_Y or section_X
        if (folderType && folderType.match(/^section_\d+(\/lesson_\d+)?$/)) {
          if (courseId && courseId !== "undefined" && courseId !== "null") {
            // Upload to course-specific folder
            result = await uploadToFirebaseStorage(
              filePath,
              originalname,
              mimetype,
              courseId,
              actualFolderType
            );
          } else {
            // Upload to temporary folder
            result = await uploadToFirebaseStorage(
              filePath,
              originalname,
              mimetype,
              null,
              actualFolderType
            );
          }
        } else {
          // For general uploads, courseId is optional
          result = await uploadToFirebaseStorage(
            filePath,
            originalname,
            mimetype,
            courseId && courseId !== "undefined" && courseId !== "null"
              ? courseId
              : null,
            actualFolderType
          );
        }
        break;
    }

    if (result.error) {
      return res.status(500).json({ message: result.error });
    }

    // Return the URL and additional info
    return res.json({
      success: true,
      url: result.url,
      fileName: result.fileName,
      destination: result.destination,
      folderType: result.folderType,
      detectedFrom:
        folderType && folderType !== "undefined" && folderType !== "null"
          ? "explicit folderType"
          : fileType && fileType !== "undefined" && fileType !== "null"
          ? `fileType parameter: ${fileType}`
          : "smart detection",
      originalFileType: fileType || null,
      courseId:
        courseId && courseId !== "undefined" && courseId !== "null"
          ? courseId
          : null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    // Always clean up temporary file, regardless of success or error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        // Log cleanup error but don't throw
        console.error("Failed to cleanup temp file:", cleanupError.message);
      }
    }
  }
};

/**
 * @desc    Upload file and automatically update course field (trailer/thumbnail)
 * @route   POST /api/admin/courses/:courseId/upload/:fieldType
 * @access  Private (Admin only)
 */
exports.uploadAndUpdateCourse = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { courseId, fieldType } = req.params;
    const { path: filePath, originalname, mimetype } = req.file;

    // Validate fieldType
    const validFieldTypes = ["trailer", "thumbnail"];
    if (!validFieldTypes.includes(fieldType)) {
      return res.status(400).json({
        message: `Invalid field type. Must be one of: ${validFieldTypes.join(
          ", "
        )}`,
      });
    }

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    let result;

    // Upload based on field type
    switch (fieldType) {
      case "trailer":
        result = await uploadTrailer(
          filePath,
          originalname,
          mimetype,
          courseId
        );
        break;
      case "thumbnail":
        result = await uploadThumbnail(
          filePath,
          originalname,
          mimetype,
          courseId
        );
        break;
    }

    // Clean up temporary file
    fs.unlinkSync(filePath);

    if (result.error) {
      return res.status(500).json({ message: result.error });
    }

    // Update course with new URL
    const updateData = {};
    updateData[fieldType] = result.url;

    const updatedCourse = await Course.findByIdAndUpdate(courseId, updateData, {
      new: true,
    })
      .populate("categoryId", "name")
      .populate("discountId", "discountCode value type");

    // Return the URL and updated course
    return res.json({
      success: true,
      message: `Course ${fieldType} updated successfully`,
      url: result.url,
      fileName: result.fileName,
      destination: result.destination,
      folderType: result.folderType,
      courseId: courseId,
      updatedCourse: updatedCourse,
    });
  } catch (err) {
    // Clean up file if it exists
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error("Error cleaning up file:", cleanupError);
      }
    }
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Update course field (trailer/thumbnail) with existing URL
 * @route   PUT /api/admin/courses/:courseId/media/:fieldType
 * @access  Private (Admin only)
 */
exports.updateCourseMediaUrl = async (req, res) => {
  try {
    const { courseId, fieldType } = req.params;
    const { url } = req.body;

    // Validate fieldType
    const validFieldTypes = ["trailer", "thumbnail"];
    if (!validFieldTypes.includes(fieldType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid field type. Must be one of: ${validFieldTypes.join(
          ", "
        )}`,
      });
    }

    // Validate URL
    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        message: "Valid URL is required",
      });
    }

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Update course with new URL
    const updateData = {};
    updateData[fieldType] = url;

    const updatedCourse = await Course.findByIdAndUpdate(courseId, updateData, {
      new: true,
    })
      .populate("categoryId", "name")
      .populate("discountId", "discountCode value type");

    return res.json({
      success: true,
      message: `Course ${fieldType} URL updated successfully`,
      courseId: courseId,
      fieldType: fieldType,
      url: url,
      updatedCourse: updatedCourse,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Initialize course folders in Firebase Storage
 * @route   POST /api/admin/courses/:courseId/folders/init
 * @access  Private (Admin only)
 */
exports.initializeCourseFolders = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId || courseId === "undefined" || courseId === "null") {
      return res.status(400).json({
        success: false,
        message: "courseId is required",
      });
    }

    const result = await initializeCourseFolder(courseId);

    if (result.success) {
      return res.status(201).json({
        success: true,
        message: "Course folders initialized successfully",
        data: result,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.error,
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Create specific folder for a course
 * @route   POST /api/admin/courses/:courseId/folders/:folderType
 * @access  Private (Admin only)
 */
exports.createSpecificFolder = async (req, res) => {
  try {
    const { courseId, folderType } = req.params;

    // Validate courseId
    if (!courseId || courseId === "undefined" || courseId === "null") {
      return res.status(400).json({
        success: false,
        message: "courseId is required",
      });
    }

    // Validate folderType
    const validFolderTypes = [
      "trailer",
      "thumbnail",
      "section-data",
      "general",
    ];
    if (!validFolderTypes.includes(folderType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid folder type. Must be one of: ${validFolderTypes.join(
          ", "
        )}`,
      });
    }

    const folderPath = await createCourseFolder(courseId, folderType);

    return res.status(201).json({
      success: true,
      message: `${folderType} folder created successfully`,
      data: {
        courseId,
        folderType,
        folderPath,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Check course folder status
 * @route   GET /api/admin/courses/:courseId/folders/status
 * @access  Private (Admin only)
 */
exports.checkCourseFolderStatus = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId || courseId === "undefined" || courseId === "null") {
      return res.status(400).json({
        success: false,
        message: "courseId is required",
      });
    }

    const result = await checkCourseFolders(courseId);

    if (result.success) {
      return res.json({
        success: true,
        message: "Folder status retrieved successfully",
        data: result,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.error,
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Get list of files in a course folder
 * @route   GET /api/admin/courses/:courseId/files/:folderType
 * @access  Private (Admin only)
 */
exports.getCourseFiles = async (req, res) => {
  try {
    const { courseId, folderType } = req.params;

    // Validate courseId
    if (!courseId || courseId === "undefined" || courseId === "null") {
      return res.status(400).json({
        success: false,
        message: "courseId is required",
      });
    }

    // Validate folderType
    const validFolderTypes = ["trailer", "thumbnail", "section-data"];
    if (!validFolderTypes.includes(folderType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid folder type. Must be one of: ${validFolderTypes.join(
          ", "
        )}`,
      });
    }

    const files = await listCourseFiles(courseId, folderType);

    return res.json({
      success: true,
      courseId,
      folderType,
      files,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Delete file from Firebase Storage
 * @route   DELETE /api/admin/files
 * @access  Private (Admin only)
 */
exports.deleteFile = async (req, res) => {
  try {
    const { destination } = req.body;

    if (!destination || destination === "undefined" || destination === "null") {
      return res.status(400).json({
        success: false,
        message: "File destination is required",
      });
    }

    const success = await deleteFromFirebase(destination);

    if (success) {
      return res.json({
        success: true,
        message: "File deleted successfully",
        destination,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to delete file",
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Test Firebase Storage URL formats
 * @route   POST /api/admin/test-firebase-url
 * @access  Private (Admin only)
 */
exports.testFirebaseUrl = async (req, res) => {
  try {
    const { destination } = req.body;

    if (!destination) {
      return res.status(400).json({
        success: false,
        message: "destination parameter is required",
      });
    }

    const bucketName = require("firebase-admin").storage().bucket().name;
    const encodedDestination = encodeURIComponent(destination);

    const urlFormats = {
      storage_googleapis: `https://storage.googleapis.com/${bucketName}/${destination}`,
      firebasestorage_alt_media: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedDestination}?alt=media`,
      firebasestorage_token: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedDestination}?alt=media&token=`,
    };

    return res.json({
      success: true,
      destination,
      bucketName,
      urlFormats,
      recommended: urlFormats.firebasestorage_alt_media,
      message:
        "Use the firebasestorage_alt_media format for best compatibility",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Test folder type detection without uploading file
 * @route   POST /api/admin/test-detect-folder
 * @access  Private (Admin only)
 */
exports.testDetectFolder = async (req, res) => {
  try {
    const { fieldname, mimetype, filename, fileType } = req.body;

    let detectedFolderType;
    let detectionMethod;

    if (fileType && fileType !== "undefined" && fileType !== "null") {
      const fileTypeMap = {
        thumbnail: "thumbnail",
        image: "thumbnail",
        cover: "thumbnail",
        trailer: "trailer",
        video: "trailer",
        preview: "trailer",
        lesson: "section-data",
        content: "section-data",
        material: "section-data",
      };

      detectedFolderType = fileTypeMap[fileType.toLowerCase()] || "general";
      detectionMethod = `fileType parameter: ${fileType}`;
    } else {
      detectedFolderType = detectFolderType(
        fieldname,
        mimetype,
        filename,
        fileType
      );
      detectionMethod = "smart detection";
    }

    return res.json({
      success: true,
      input: {
        fieldname,
        mimetype,
        filename,
        fileType,
      },
      result: {
        detectedFolderType,
        detectionMethod,
      },
      message: "Folder type detection test completed",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Get files from temporary folders
 * @route   GET /api/admin/temporary-files/:folderType
 * @access  Private (Admin only)
 */
exports.getTemporaryFiles = async (req, res) => {
  try {
    const { folderType } = req.params;

    // Validate folderType
    const validFolderTypes = [
      "thumbnail",
      "trailer",
      "section-data",
      "general",
    ];
    if (!validFolderTypes.includes(folderType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid folder type. Must be one of: ${validFolderTypes.join(
          ", "
        )}`,
      });
    }

    // Map folder types to their temporary paths
    const folderPaths = {
      thumbnail: "temporary/thumbnails/",
      trailer: "temporary/trailers/",
      "section-data": "temporary/section-data/",
      general: "temporary/general/",
    };

    const prefix = folderPaths[folderType];
    const [files] = await require("firebase-admin")
      .storage()
      .bucket()
      .getFiles({ prefix });

    // Filter out placeholder files
    const actualFiles = files.filter(
      (file) => !file.name.endsWith(".placeholder")
    );

    const fileList = actualFiles.map((file) => {
      const bucketName = require("firebase-admin").storage().bucket().name;
      const encodedFileName = encodeURIComponent(file.name);
      const altUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedFileName}?alt=media`;

      return {
        name: file.name,
        url: altUrl,
        publicUrl: `https://storage.googleapis.com/${bucketName}/${file.name}`,
        metadata: file.metadata,
        fileName: file.name.split("/").pop(), // Extract just the filename
      };
    });

    return res.json({
      success: true,
      folderType,
      temporaryPath: prefix,
      files: fileList,
      count: fileList.length,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Move file from temporary folder to course folder
 * @route   POST /api/admin/move-to-course
 * @access  Private (Admin only)
 */
exports.moveFileFromTemporary = async (req, res) => {
  try {
    const { sourceDestination, courseId, folderType } = req.body;

    // Validate inputs
    if (!sourceDestination || !courseId || !folderType) {
      return res.status(400).json({
        success: false,
        message: "sourceDestination, courseId, and folderType are required",
        received: { sourceDestination, courseId, folderType },
      });
    }

    // Validate folderType
    const validFolderTypes = ["thumbnail", "trailer", "section-data"];
    if (!validFolderTypes.includes(folderType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid folder type. Must be one of: ${validFolderTypes.join(
          ", "
        )}`,
      });
    }

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const bucket = require("firebase-admin").storage().bucket();
    const sourceFile = bucket.file(sourceDestination);

    // Check if source file exists
    const [exists] = await sourceFile.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Source file not found in temporary folder",
      });
    }

    // Generate new destination
    const fileName = sourceDestination.split("/").pop();
    const newDestination = `courses/${courseId}/${folderType}/${fileName}`;
    const targetFile = bucket.file(newDestination);

    // Copy file to new location
    await sourceFile.copy(targetFile);

    // Delete original file from temporary folder
    await sourceFile.delete();

    // Generate new URL with proper format
    const bucketName = bucket.name;
    const encodedDestination = encodeURIComponent(newDestination);
    const newUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedDestination}?alt=media`;

    // Update course with new URL if it's thumbnail or trailer
    if (folderType === "thumbnail" || folderType === "trailer") {
      const updateData = {};
      updateData[folderType] = newUrl;

      await Course.findByIdAndUpdate(courseId, updateData);
    }

    return res.json({
      success: true,
      message: `File moved from temporary to course folder successfully`,
      from: sourceDestination,
      to: newDestination,
      newUrl,
      courseId,
      folderType,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Test URL accessibility from different formats
 * @route   POST /api/admin/test-url-access
 * @access  Private (Admin only)
 */
exports.testUrlAccess = async (req, res) => {
  try {
    const { destination } = req.body;

    if (!destination) {
      return res.status(400).json({
        success: false,
        message: "destination parameter is required",
      });
    }

    const bucket = require("firebase-admin").storage().bucket();
    const file = bucket.file(destination);
    const bucketName = bucket.name;
    const encodedDestination = encodeURIComponent(destination);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "File not found in Firebase Storage",
      });
    }

    // Get file metadata
    const [metadata] = await file.getMetadata();

    // Generate signed URL
    let signedUrl = null;
    let signedUrlError = null;
    try {
      const options = {
        version: "v4",
        action: "read",
        expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
      };

      const [url] = await file.getSignedUrl(options);
      signedUrl = url;
    } catch (error) {
      signedUrlError = error.message;
    }

    // Test if file is public
    let isPublic = false;
    try {
      await file.makePublic();
      isPublic = true;
    } catch (error) {
      // File is not public or cannot be made public
    }

    const urlFormats = {
      signedUrl: {
        url: signedUrl,
        error: signedUrlError,
        recommended: true,
        description: "Signed URL with expiration - best for CORS and security",
      },
      firebaseApi: {
        url: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedDestination}?alt=media`,
        description: "Firebase Storage API URL - good for public files",
      },
      directStorage: {
        url: `https://storage.googleapis.com/${bucketName}/${destination}`,
        description: "Direct Google Storage URL - requires public access",
      },
      firebaseToken: {
        url: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedDestination}?alt=media&token=${
          metadata.metadata?.firebaseStorageDownloadTokens || "MISSING_TOKEN"
        }`,
        description: "Firebase URL with token - alternative format",
      },
    };

    return res.json({
      success: true,
      destination,
      bucketName,
      fileExists: exists,
      isPublic,
      fileSize: metadata.size,
      contentType: metadata.contentType,
      urlFormats,
      recommendations: {
        forFrontend: signedUrl ? "signedUrl" : "firebaseApi",
        corsSupport: signedUrl ? "Excellent" : "Limited",
        needsFirebaseRules: !isPublic,
        solution: !signedUrl
          ? "Configure Firebase Storage Rules for public access"
          : "Signed URL provides best access",
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * @desc    Fix CORS issues by generating proper URLs
 * @route   POST /api/admin/fix-cors-url
 * @access  Private (Admin only)
 */
exports.fixCorsUrl = async (req, res) => {
  try {
    const { destination, urlType = "signed" } = req.body;

    if (!destination) {
      return res.status(400).json({
        success: false,
        message: "destination parameter is required",
      });
    }

    const bucket = require("firebase-admin").storage().bucket();
    const file = bucket.file(destination);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    let fixedUrl = null;
    let method = "";

    switch (urlType) {
      case "signed":
        try {
          const options = {
            version: "v4",
            action: "read",
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
          };

          const [url] = await file.getSignedUrl(options);
          fixedUrl = url;
          method = "Generated 7-day signed URL";
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: `Failed to generate signed URL: ${error.message}`,
          });
        }
        break;

      case "public":
        try {
          await file.makePublic();
          const bucketName = bucket.name;
          fixedUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;
          method = "Made file public and generated direct URL";
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: `Failed to make file public: ${error.message}`,
            suggestion: "Check Firebase Storage Rules",
          });
        }
        break;

      case "firebase":
        const bucketName = bucket.name;
        const encodedDestination = encodeURIComponent(destination);
        fixedUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedDestination}?alt=media`;
        method = "Generated Firebase Storage API URL";
        break;

      default:
        return res.status(400).json({
          success: false,
          message: "Invalid urlType. Use 'signed', 'public', or 'firebase'",
        });
    }

    return res.json({
      success: true,
      destination,
      fixedUrl,
      method,
      urlType,
      corsSupport: urlType === "signed" ? "Excellent" : "Limited",
      expires: urlType === "signed" ? "7 days" : "Never",
      canFetchFromFrontend: true,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
