/**
 * Cleanup script for temporary upload files
 * Run this script to clean up orphaned temporary files
 */

const fs = require("fs");
const path = require("path");

const uploadsDir = path.join(__dirname, "..", "uploads");

function cleanupTempFiles() {
  console.log("🧹 Starting cleanup of temporary files...");

  try {
    // Check if uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      console.log("✅ Uploads directory does not exist, nothing to clean");
      return;
    }

    // Read all files in uploads directory
    const files = fs.readdirSync(uploadsDir);

    if (files.length === 0) {
      console.log("✅ Uploads directory is empty, nothing to clean");
      return;
    }

    console.log(`📁 Found ${files.length} files in uploads directory`);

    let deletedCount = 0;
    let errorCount = 0;

    // Delete each file
    files.forEach((file) => {
      const filePath = path.join(uploadsDir, file);

      try {
        // Check if it's a file (not directory)
        const stats = fs.statSync(filePath);

        if (stats.isFile()) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Deleted: ${file}`);
          deletedCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to delete ${file}:`, error.message);
        errorCount++;
      }
    });

    console.log("\n📊 Cleanup Summary:");
    console.log(`✅ Successfully deleted: ${deletedCount} files`);
    if (errorCount > 0) {
      console.log(`❌ Failed to delete: ${errorCount} files`);
    }

    console.log("🎉 Cleanup completed!");
  } catch (error) {
    console.error("❌ Cleanup failed:", error.message);
  }
}

// Run cleanup if script is executed directly
if (require.main === module) {
  cleanupTempFiles();
}

module.exports = cleanupTempFiles;
