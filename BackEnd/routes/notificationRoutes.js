const notificationController = require('../controllers/notificationController');
const authorize = require('../middlewares/authMiddleware');

const router = require('express').Router();

router.get('/:userId', authorize('student'), notificationController.getNotifications);

module.exports = router;