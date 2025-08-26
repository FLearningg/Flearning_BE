const wishlistController = require('../controllers/wishlistController');
const authorize = require('../middlewares/authMiddleware');

const router = require('express').Router();

router.get('/:userId', authorize('student'), wishlistController.viewWishlist);
router.post('/', authorize('student'), wishlistController.addToWishlist);
router.delete('/', authorize('student'), wishlistController.removeFromWishlist);

module.exports = router;