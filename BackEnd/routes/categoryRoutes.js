const categoryController = require('../controllers/categoryController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = require('express').Router();

router.get('/top', categoryController.getTopCategories);


module.exports = router;