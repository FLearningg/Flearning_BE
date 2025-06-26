const express = require("express");
const router = express.Router();
const { getDashboardStats } = require("../controllers/adminController");
const authorize = require("../middleware/authMiddleware");

router.get("/stats", authorize("admin"), getDashboardStats);

module.exports = router;
