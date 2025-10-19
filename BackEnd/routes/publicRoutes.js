const express = require("express");
const router = express.Router();
const upload = require("../middlewares/uploadMiddleware");
const { uploadToFirebasePublic } = require("../controllers/firebaseController");

// Public upload endpoint for instructor registration documents
router.post("/upload", upload.single("file"), uploadToFirebasePublic);

module.exports = router;
