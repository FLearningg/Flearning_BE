const categoryController = require("../controllers/categoryController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = require("express").Router();

router.get("/top", categoryController.getTopCategories);
// Public: get all categories
router.get("/", categoryController.getAllCategories);

module.exports = router;
