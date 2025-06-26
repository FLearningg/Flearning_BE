const cartController = require('../controllers/cartController');
const authorize = require('../middlewares/authMiddleware');

const router = require('express').Router();

router.get('/:userId', authorize('student'), cartController.getCart);
router.post('/', authorize('student'), cartController.addToCart);
router.delete('/', authorize('student'), cartController.removeFromCart);

module.exports = router;