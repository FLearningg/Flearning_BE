// Google Drive Uploader using Node.js
// Step-by-step: Auth, Upload, Share, and Get Public URL

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
require("dotenv").config();

// === STEP 1: Set up OAuth2 client ===
const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_DRIVE_REDIRECT_URI;
const REFRESH_TOKEN = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({ version: "v3", auth: oauth2Client });

// === Helper function to detect MIME type ===
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  // Image MIME types
  const imageMimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };

  // Video MIME types
  const videoMimeTypes = {
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".m4v": "video/x-m4v",
  };

  return (
    imageMimeTypes[ext] || videoMimeTypes[ext] || "application/octet-stream"
  );
}

// === Helper function to determine file type ===
function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".svg",
  ];
  const videoExtensions = [
    ".mp4",
    ".avi",
    ".mov",
    ".wmv",
    ".flv",
    ".webm",
    ".mkv",
    ".m4v",
  ];

  if (imageExtensions.includes(ext)) return "image";
  if (videoExtensions.includes(ext)) return "video";
  return "unknown";
}

// === STEP 2: Upload image ===
async function uploadImage(filePath, customName = null) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File does not exist");
    }

    const fileType = getFileType(filePath);
    if (fileType !== "image") {
      throw new Error("File is not an image");
    }

    const mimeType = getMimeType(filePath);
    const fileName = customName || path.basename(filePath);

    // Upload to specific folder
    const FOLDER_ID = "1FzglgBmY8mKsMXnZL3jno3WqHzoqv_J_";

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mimeType,
        parents: [FOLDER_ID], // Upload to specific folder
      },
      media: {
        mimeType: mimeType,
        body: fs.createReadStream(filePath),
      },
    });

    const fileId = response.data.id;

    // === STEP 3: Make file public ===
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    // === STEP 4: Get Direct URL ===
    const directImageUrl = `https://lh3.googleusercontent.com/d/${fileId}=s400`;

    // Try to delete the local file, but don't throw if it fails
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (deleteError) {
      console.warn(`Warning: Could not delete temporary file ${filePath}:`, deleteError.message);
    }

    return {
      fileId,
      userImage: directImageUrl,  // This is what we'll use for userImage
      fileName,
      mimeType,
      type: "image",
    };
  } catch (error) {
    // Try to clean up the local file in case of upload error
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (deleteError) {
      console.warn(`Warning: Could not delete temporary file ${filePath}:`, deleteError.message);
    }
    
    console.error("Error uploading image:", error.message);
    throw error;
  }
}

// === STEP 2: Upload video ===
async function uploadVideo(filePath, customName = null) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File does not exist");
    }

    const fileType = getFileType(filePath);
    if (fileType !== "video") {
      throw new Error("File is not a video");
    }

    const mimeType = getMimeType(filePath);
    const fileName = customName || path.basename(filePath);

    // Upload to specific folder
    const FOLDER_ID = "1FzglgBmY8mKsMXnZL3jno3WqHzoqv_J_";

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mimeType,
        parents: [FOLDER_ID], // Upload to specific folder
      },
      media: {
        mimeType: mimeType,
        body: fs.createReadStream(filePath),
      },
    });

    const fileId = response.data.id;

    // === STEP 3: Make file public ===
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    // === STEP 4: Get Public URLs ===
    const publicUrl = `https://drive.google.com/uc?id=${fileId}`;
    const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
    const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;

    return {
      fileId,
      publicUrl,
      viewUrl,
      embedUrl,
      fileName,
      mimeType,
      type: "video",
    };
  } catch (error) {
    console.error("Error uploading video:", error.message);
    throw error;
  }
}

// === Universal upload function ===
async function uploadFile(filePath, customName = null) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File does not exist");
    }

    const fileType = getFileType(filePath);

    switch (fileType) {
      case "image":
        return await uploadImage(filePath, customName);
      case "video":
        return await uploadVideo(filePath, customName);
      default:
        throw new Error(
          "Unsupported file type. Only images and videos are supported."
        );
    }
  } catch (error) {
    console.error("Error uploading file:", error.message);
    throw error;
  }
}

// === Delete file from Google Drive ===
async function deleteFile(fileId) {
  try {
    await drive.files.delete({
      fileId: fileId,
    });
    return true;
  } catch (error) {
    console.error("Error deleting file:", error.message);
    throw error;
  }
}

// === Get file info ===
async function getFileInfo(fileId) {
  try {
    const response = await drive.files.get({
      fileId: fileId,
      fields: "id, name, mimeType, size, createdTime, modifiedTime",
    });
    return response.data;
  } catch (error) {
    console.error("Error getting file info:", error.message);
    throw error;
  }
}

module.exports = {
  uploadImage,
  uploadVideo,
  uploadFile,
  deleteFile,
  getFileInfo,
  getMimeType,
  getFileType,
};
 