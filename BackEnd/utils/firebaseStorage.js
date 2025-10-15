const path = require("path");
const fs = require("fs");

// Initialize Firebase Admin SDK
let admin;
try {
  // Try to initialize from environment variables first
  const serviceAccount = {
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url:
      process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  };

  admin = require("firebase-admin");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
} catch (error) {
  // Fallback to JSON file if environment variables are not available
  const serviceAccount = require("../config/firebase-service-account.json");
  admin = require("firebase-admin");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

const bucket = admin.storage().bucket();

// Helper: luôn thêm timestamp vào tên file và sanitize filename
function appendTimestampToFileName(fileName) {
  // Remove special characters and spaces, replace with underscore
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.]/g, '_');
  const timestamp = Date.now();
  const dotIndex = sanitizedName.lastIndexOf('.');
  if (dotIndex === -1) return `${sanitizedName}_${timestamp}`;
  return `${sanitizedName.slice(0, dotIndex)}_${timestamp}${sanitizedName.slice(dotIndex)}`;
}

/**
 * Create folder structure in Firebase Storage
 * @param {string} courseId - Course ID
 * @param {string} folderType - Type of folder to create
 * @returns {string} - Created folder path
 */
async function createCourseFolder(courseId, folderType) {
  try {
    const folderPath = `courses/${courseId}/${folderType}/`;

    // Create a placeholder file to ensure the folder exists
    const placeholderFile = bucket.file(folderPath + ".placeholder");
    await placeholderFile.save("", {
      metadata: {
        contentType: "text/plain",
      },
    });

    return folderPath;
  } catch (error) {
    throw new Error(`Failed to create folder: ${error.message}`);
  }
}

/**
 * Initialize all course folders when a course is created
 * @param {string} courseId - Course ID
 * @returns {Object} - Created folder paths
 */
async function initializeCourseFolder(courseId) {
  try {
    const bucket = admin.storage().bucket();

    // Create basic folder structure
    const basicFolders = ["thumbnail", "trailer", "section-data"];

    for (const folderType of basicFolders) {
      const folderPath = `courses/${courseId}/${folderType}/`;
      const placeholderFile = bucket.file(folderPath + ".placeholder");
      await placeholderFile.save("", {
        metadata: {
          contentType: "text/plain",
        },
      });
    }

    return {
      success: true,
      courseId,
      folders: basicFolders,
      message: "Course folders initialized successfully",
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Upload file to Firebase Storage with specific folder structure
 * @param {string} filePath - Local file path
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {string} courseId - Course ID for folder organization
 * @param {string} folderType - Type of folder: 'trailer', 'thumbnail', 'section-data', or 'general'
 * @returns {Object} - { url, fileName, destination } or { error }
 */
async function uploadToFirebase(
  filePath,
  fileName,
  mimeType,
  courseId,
  folderType = "general"
) {
  try {
    console.log(`Starting upload for file: ${fileName}`);
    console.log(`File details:
      - Path: ${filePath}
      - Size: ${fs.statSync(filePath).size} bytes
      - MIME Type: ${mimeType}
      - Course ID: ${courseId}
      - Folder Type: ${folderType}
    `);

    const bucket = admin.storage().bucket();

    // Generate unique filename with timestamp
    const uniqueFileName = appendTimestampToFileName(fileName);
    console.log(`Sanitized and timestamped filename: ${uniqueFileName}`);

    let destination;
    let tempFolderPath;

    if (courseId) {
      destination = `courses/${courseId}/${folderType}/${uniqueFileName}`;
    } else {
      tempFolderPath = `temporary/${folderType}/`;
      destination = tempFolderPath + uniqueFileName;
    }
    console.log(`Final destination path: ${destination}`);

    // Upload file
    console.log(`Uploading to destination: ${destination}`);
    await bucket.upload(filePath, {
      destination: destination,
      metadata: {
        contentType: mimeType,
      },
    });
    console.log('Upload completed successfully');

    // Make file public for direct access
    const file = bucket.file(destination);
    await file.makePublic();
    console.log('File made public successfully');

    // Generate URLs
    const bucketName = bucket.name;
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;
    const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
      destination
    )}?alt=media`;

    // Use public URL instead of signed URL for permanent access
    const bestUrl = firebaseUrl; // Use Firebase public URL

    return {
      success: true,
      fileName: uniqueFileName,
      destination: destination,
      folderType: folderType,
      url: bestUrl,
      publicUrl: publicUrl,
      firebaseUrl: firebaseUrl,
      downloadURL: firebaseUrl, // Add downloadURL for compatibility
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Upload trailer video to Firebase Storage
 * @param {string} filePath - Local file path
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {string} courseId - Course ID for folder organization
 * @returns {Object} - { url, fileName, destination } or { error }
 */
async function uploadTrailer(filePath, fileName, mimeType, courseId) {
  return await uploadToFirebase(
    filePath,
    fileName,
    mimeType,
    courseId,
    "trailer"
  );
}

/**
 * Upload thumbnail image to Firebase Storage
 * @param {string} filePath - Local file path
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {string} courseId - Course ID for folder organization
 * @returns {Object} - { url, fileName, destination } or { error }
 */
async function uploadThumbnail(filePath, fileName, mimeType, courseId) {
  return await uploadToFirebase(
    filePath,
    fileName,
    mimeType,
    courseId,
    "thumbnail"
  );
}

/**
 * Upload section data (lesson videos) to Firebase Storage
 * @param {string} filePath - Local file path
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {string} courseId - Course ID for folder organization
 * @returns {Object} - { url, fileName, destination } or { error }
 */
async function uploadSectionData(filePath, fileName, mimeType, courseId) {
  return await uploadToFirebase(
    filePath,
    fileName,
    mimeType,
    courseId,
    "section-data"
  );
}

/**
 * Upload trailer or thumbnail to Firebase Storage (backward compatibility)
 * @param {string} filePath - Local file path
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {string} courseId - Course ID for folder organization
 * @returns {Object} - { url, fileName } or { error }
 */
async function uploadToFirebaseTrailer(filePath, fileName, mimeType, courseId) {
  // Determine folder type based on MIME type
  const folderType = mimeType.startsWith("video/") ? "trailer" : "thumbnail";
  return await uploadToFirebase(
    filePath,
    fileName,
    mimeType,
    courseId,
    folderType
  );
}

/**
 * Delete file from Firebase Storage
 * @param {string} destination - File path in storage
 * @returns {boolean} - Success status
 */
async function deleteFromFirebase(destination) {
  try {
    const file = bucket.file(destination);
    await file.delete();
    return true;
  } catch (error) {
    console.error("Firebase delete error:", error);
    return false;
  }
}

/**
 * List files in a specific course folder
 * @param {string} courseId - Course ID
 * @param {string} folderType - Type of folder: 'trailer', 'thumbnail', 'section-data'
 * @returns {Array} - List of files
 */
async function listCourseFiles(courseId, folderType) {
  try {
    const prefix = `courses/${courseId}/${folderType}/`;
    const [files] = await bucket.getFiles({ prefix });

    // Filter out placeholder files
    const actualFiles = files.filter(
      (file) => !file.name.endsWith(".placeholder")
    );

    return actualFiles.map((file) => {
      const bucketName = bucket.name;
      const encodedFileName = encodeURIComponent(file.name);
      const altUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedFileName}?alt=media`;

      return {
        name: file.name,
        url: altUrl,
        publicUrl: `https://storage.googleapis.com/${bucketName}/${file.name}`,
        metadata: file.metadata,
      };
    });
  } catch (error) {
    console.error("Firebase list files error:", error);
    return [];
  }
}

/**
 * Check if course folders exist
 * @param {string} courseId - Course ID
 * @returns {Object} - Folder existence status
 */
async function checkCourseFolders(courseId) {
  try {
    const folderTypes = ["trailer", "thumbnail", "section-data", "general"];
    const folderStatus = {};

    for (const folderType of folderTypes) {
      const placeholderPath = `courses/${courseId}/${folderType}/.placeholder`;
      const placeholderFile = bucket.file(placeholderPath);
      const [exists] = await placeholderFile.exists();
      folderStatus[folderType] = exists;
    }

    // Note: Section folders are created dynamically, so we don't check them here
    // They will be created when needed during upload operations

    return {
      success: true,
      courseId,
      folders: folderStatus,
      note: "Section folders (section_1, section_2, etc.) are created dynamically when needed",
    };
  } catch (error) {
    console.error("Error checking course folders:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create user avatar folder structure in Firebase Storage
 * @returns {string} - Created folder path
 */
async function createUserAvatarFolder() {
  try {
    const folderPath = `UserAvatar/`;

    // Create a placeholder file to ensure the folder exists
    const placeholderFile = bucket.file(folderPath + ".placeholder");
    await placeholderFile.save("", {
      metadata: {
        contentType: "text/plain",
      },
    });

    return folderPath;
  } catch (error) {
    throw new Error(`Failed to create folder: ${error.message}`);
  }
}

/**
 * Upload user avatar to Firebase Storage
 * @param {string} filePath - Local file path
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {string} userId - User ID
 * @returns {Object} - Upload result with URLs
 */
async function uploadUserAvatar(filePath, fileName, mimeType, userId) {
  try {
    // Ensure UserAvatar folder exists
    await createUserAvatarFolder();

    // Generate unique filename with timestamp
    const uniqueFileName = appendTimestampToFileName(fileName);
    const destination = `UserAvatar/${userId}/${uniqueFileName}`;

    // Upload file
    await bucket.upload(filePath, {
      destination: destination,
      metadata: {
        contentType: mimeType,
      },
    });

    // Make file public for direct access
    const file = bucket.file(destination);
    await file.makePublic();

    // Generate URLs
    const bucketName = bucket.name;
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;
    const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
      destination
    )}?alt=media`;

    // Use Firebase public URL for permanent access
    const bestUrl = firebaseUrl;

    return {
      success: true,
      fileName: uniqueFileName,
      destination: destination,
      url: bestUrl,
      publicUrl: publicUrl,
      firebaseUrl: firebaseUrl,
    };
  } catch (error) {
    console.error("Error uploading user avatar:", error);
    throw error;
  }
}

module.exports = {
  uploadToFirebase,
  uploadTrailer,
  uploadThumbnail,
  uploadSectionData,
  uploadToFirebaseTrailer, // For backward compatibility
  deleteFromFirebase,
  listCourseFiles,
  initializeCourseFolder, // New function to initialize all folders
  createCourseFolder, // New function to create specific folder
  checkCourseFolders, // New function to check folder existence
  uploadUserAvatar, // Function to upload user avatars
  createUserAvatarFolder, // Function to create user avatar folders
};