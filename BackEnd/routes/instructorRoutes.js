const express = require("express");
const router = express.Router();
const { getDashboardStats, getAllCategories } = require("../controllers/instructorController");
const authorize = require("../middlewares/authMiddleware");

// All instructor routes require instructor authorization
router.use(authorize("instructor"));

// Dashboard stats route
router.get("/dashboard", getDashboardStats);

// Categories route
router.get("/categories", getAllCategories);

module.exports = router;
