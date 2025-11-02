const proctorService = require('../services/proctoring/proctorService');

/**
 * @desc    Start proctoring session
 * @route   POST /api/proctoring/start
 * @access  Private (Student)
 */
exports.startSession = async (req, res) => {
  try {
    const { quizId, resultId } = req.body;
    const userId = req.user.id;

    if (!quizId) {
      return res.status(400).json({
        success: false,
        message: 'Quiz ID is required'
      });
    }

    const session = await proctorService.startSession(userId, quizId, resultId);

    res.status(201).json({
      success: true,
      message: 'Proctoring session started',
      data: {
        sessionId: session._id,
        startTime: session.startTime
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to start proctoring session',
      error: error.message
    });
  }
};

/**
 * @desc    Log a violation
 * @route   POST /api/proctoring/violation
 * @access  Private (Student)
 */
exports.logViolation = async (req, res) => {
  try {
    const { sessionId, violationType, details } = req.body;

    if (!sessionId || !violationType) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and violation type are required'
      });
    }

    const result = await proctorService.logViolation(sessionId, violationType, details);

    res.status(200).json({
      success: true,
      message: 'Violation logged',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to log violation',
      error: error.message
    });
  }
};

/**
 * @desc    Get session status
 * @route   GET /api/proctoring/session/:sessionId
 * @access  Private
 */
exports.getSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const status = await proctorService.getSessionStatus(sessionId);

    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get session status',
      error: error.message
    });
  }
};

/**
 * @desc    End proctoring session
 * @route   POST /api/proctoring/end
 * @access  Private (Student)
 */
exports.endSession = async (req, res) => {
  try {
    const { sessionId, status = 'completed' } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    const session = await proctorService.endSession(sessionId, status);

    res.status(200).json({
      success: true,
      message: 'Proctoring session ended',
      data: {
        sessionId: session._id,
        endTime: session.endTime,
        suspicionScore: session.suspicionScore,
        wasLocked: session.isLocked
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to end proctoring session',
      error: error.message
    });
  }
};

/**
 * @desc    Get proctoring report
 * @route   GET /api/proctoring/report/:sessionId
 * @access  Private (Instructor)
 */
exports.getReport = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const report = await proctorService.getReport(sessionId);

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get proctoring report',
      error: error.message
    });
  }
};
