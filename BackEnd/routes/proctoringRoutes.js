const express = require('express');
const router = express.Router();
const proctoringController = require('../controllers/proctoringController');
const authMiddleware = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Start proctoring session
router.post('/start', proctoringController.startSession);

// Log violation
router.post('/violation', proctoringController.logViolation);

// Get session status
router.get('/session/:sessionId', proctoringController.getSessionStatus);

// End proctoring session
router.post('/end', proctoringController.endSession);

// Get proctoring report (instructor only)
router.get('/report/:sessionId', proctoringController.getReport);

module.exports = router;
