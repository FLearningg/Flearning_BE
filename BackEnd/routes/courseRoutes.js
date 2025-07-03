const courseController = require('../controllers/courseController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = require('express').Router();

router.get('/', courseController.getAllCourses);
router.get('/search', courseController.searchCourses);
router.get('/top-selling', courseController.getTopCourses);
router.get('/recently-added', courseController.getNewCourses);


module.exports = router;