/**
 * Proctoring Service
 * Handles anti-cheating detection and monitoring during quiz
 */

const ProctoringSession = require('../../models/proctoringSessionModel');
const StudentQuizResult = require('../../models/StudentQuizResult');

class ProctoringService {
  constructor() {
    // Thresholds for violation detection
    this.thresholds = {
      maxFaceDetectionFailures: 5,      // Mất mặt 5 lần
      maxMultipleFaceDetections: 3,      // Phát hiện nhiều người 3 lần
      maxGazeAwayDetections: 10,         // Nhìn ra ngoài 10 lần
      maxFullscreenViolations: 2,        // Thoát fullscreen 2 lần
      maxTabSwitches: 2,                 // Đổi tab 2 lần
      maxWindowSwitches: 2               // Đổi window 2 lần
    };

    this.violationScores = {
      noFaceDetected: 10,
      multipleFaces: 35,  // Very high penalty - this is serious cheating!
      differentPerson: 40,  // CRITICAL - someone else is taking the exam!
      gazeAway: 5,
      exitFullscreen: 20,
      tabSwitch: 25,
      windowSwitch: 25,
      suspiciousObject: 15,
      cameraAccessDenied: 30,  // High penalty for camera denial
      identityVerified: 0  // Not a violation, just a log entry
    };
  }

  /**
   * Start proctoring session for a quiz attempt
   */
  async startSession(userId, quizId, resultId) {
    try {
      const session = new ProctoringSession({
        userId,
        quizId,
        resultId,
        startTime: new Date(),
        status: 'active',
        violations: [],
        suspicionScore: 0,
        isLocked: false
      });

      await session.save();
      return session;
    } catch (error) {
      throw new Error('Failed to start proctoring session: ' + error.message);
    }
  }

  /**
   * Log a violation
   */
  async logViolation(sessionId, violationType, details = {}) {
    try {
      const session = await ProctoringSession.findById(sessionId);
      if (!session) {
        throw new Error('Proctoring session not found');
      }

      const violation = {
        type: violationType,
        timestamp: new Date(),
        details: details,
        severity: this.getViolationSeverity(violationType)
      };

      session.violations.push(violation);
      session.suspicionScore += this.violationScores[violationType] || 5;

      // Check if should lock quiz
      const shouldLock = this.shouldLockQuiz(session);
      if (shouldLock && !session.isLocked) {
        session.isLocked = true;
        session.lockReason = `Exceeded threshold for ${violationType}`;
        session.lockTime = new Date();
      }

      await session.save();

      return {
        violation,
        suspicionScore: session.suspicionScore,
        isLocked: session.isLocked,
        lockReason: session.lockReason
      };
    } catch (error) {
      throw new Error('Failed to log violation: ' + error.message);
    }
  }

  /**
   * Check if quiz should be locked based on violations
   */
  shouldLockQuiz(session) {
    const violationCounts = this.countViolationsByType(session.violations);

    // Check each threshold
    if (violationCounts.noFaceDetected >= this.thresholds.maxFaceDetectionFailures) {
      return true;
    }
    if (violationCounts.multipleFaces >= this.thresholds.maxMultipleFaceDetections) {
      return true;
    }
    // Lock immediately after 3 different person detections
    if (violationCounts.differentPerson >= 3) {
      return true;
    }
    if (violationCounts.gazeAway >= this.thresholds.maxGazeAwayDetections) {
      return true;
    }
    if (violationCounts.exitFullscreen >= this.thresholds.maxFullscreenViolations) {
      return true;
    }
    if (violationCounts.tabSwitch >= this.thresholds.maxTabSwitches) {
      return true;
    }
    if (violationCounts.windowSwitch >= this.thresholds.maxWindowSwitches) {
      return true;
    }
    // Lock immediately after 3 camera access denials
    if (violationCounts.cameraAccessDenied >= 3) {
      return true;
    }

    // Lock if suspicion score too high
    if (session.suspicionScore >= 100) {
      return true;
    }

    return false;
  }

  /**
   * Count violations by type
   */
  countViolationsByType(violations) {
    const counts = {
      noFaceDetected: 0,
      multipleFaces: 0,
      differentPerson: 0,
      gazeAway: 0,
      exitFullscreen: 0,
      tabSwitch: 0,
      windowSwitch: 0,
      suspiciousObject: 0,
      cameraAccessDenied: 0,
      identityVerified: 0
    };

    violations.forEach(v => {
      if (counts.hasOwnProperty(v.type)) {
        counts[v.type]++;
      }
    });

    return counts;
  }

  /**
   * Get violation severity
   */
  getViolationSeverity(type) {
    const severityMap = {
      noFaceDetected: 'medium',
      multipleFaces: 'high',
      differentPerson: 'critical',
      gazeAway: 'low',
      exitFullscreen: 'critical',
      tabSwitch: 'critical',
      windowSwitch: 'critical',
      suspiciousObject: 'high',
      cameraAccessDenied: 'critical',
      identityVerified: 'low'
    };

    return severityMap[type] || 'low';
  }

  /**
   * End proctoring session
   */
  async endSession(sessionId, status = 'completed') {
    try {
      const session = await ProctoringSession.findById(sessionId);
      if (!session) {
        throw new Error('Proctoring session not found');
      }

      session.endTime = new Date();
      session.status = status;
      session.finalSuspicionScore = session.suspicionScore;

      // Update quiz result with proctoring data
      if (session.resultId) {
        await StudentQuizResult.findByIdAndUpdate(session.resultId, {
          proctoringData: {
            sessionId: session._id,
            suspicionScore: session.suspicionScore,
            violationCount: session.violations.length,
            wasLocked: session.isLocked,
            lockReason: session.lockReason
          }
        });
      }

      await session.save();
      return session;
    } catch (error) {
      throw new Error('Failed to end proctoring session: ' + error.message);
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId) {
    try {
      const session = await ProctoringSession.findById(sessionId);
      if (!session) {
        throw new Error('Proctoring session not found');
      }

      const violationCounts = this.countViolationsByType(session.violations);

      return {
        isActive: session.status === 'active',
        isLocked: session.isLocked,
        lockReason: session.lockReason,
        suspicionScore: session.suspicionScore,
        violations: session.violations,
        violationCounts: violationCounts,
        warnings: this.generateWarnings(violationCounts)
      };
    } catch (error) {
      throw new Error('Failed to get session status: ' + error.message);
    }
  }

  /**
   * Generate warnings based on violation counts
   */
  generateWarnings(violationCounts) {
    const warnings = [];

    if (violationCounts.noFaceDetected >= 3) {
      warnings.push({
        type: 'noFaceDetected',
        message: `Không phát hiện khuôn mặt ${violationCounts.noFaceDetected} lần. Giữ mặt trong khung hình!`,
        remaining: this.thresholds.maxFaceDetectionFailures - violationCounts.noFaceDetected
      });
    }

    if (violationCounts.multipleFaces >= 1) {
      warnings.push({
        type: 'multipleFaces',
        message: `Phát hiện nhiều người ${violationCounts.multipleFaces} lần. Chỉ một người duy nhất!`,
        remaining: this.thresholds.maxMultipleFaceDetections - violationCounts.multipleFaces
      });
    }

    if (violationCounts.exitFullscreen >= 1) {
      warnings.push({
        type: 'exitFullscreen',
        message: `Thoát fullscreen ${violationCounts.exitFullscreen} lần. Giữ chế độ toàn màn hình!`,
        remaining: this.thresholds.maxFullscreenViolations - violationCounts.exitFullscreen
      });
    }

    if (violationCounts.tabSwitch >= 1) {
      warnings.push({
        type: 'tabSwitch',
        message: `Đổi tab ${violationCounts.tabSwitch} lần. Không được rời khỏi trang thi!`,
        remaining: this.thresholds.maxTabSwitches - violationCounts.tabSwitch
      });
    }

    return warnings;
  }

  /**
   * Get proctoring report
   */
  async getReport(sessionId) {
    try {
      const session = await ProctoringSession.findById(sessionId)
        .populate('userId', 'name email')
        .populate('quizId', 'title');

      if (!session) {
        throw new Error('Proctoring session not found');
      }

      const violationCounts = this.countViolationsByType(session.violations);
      const duration = session.endTime 
        ? (session.endTime - session.startTime) / 1000 / 60 // minutes
        : null;

      return {
        session,
        violationCounts,
        duration,
        riskLevel: this.getRiskLevel(session.suspicionScore),
        recommendation: this.getRecommendation(session)
      };
    } catch (error) {
      throw new Error('Failed to get proctoring report: ' + error.message);
    }
  }

  /**
   * Get risk level based on suspicion score
   */
  getRiskLevel(score) {
    if (score >= 100) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  /**
   * Get recommendation for instructor
   */
  getRecommendation(session) {
    if (session.isLocked) {
      return 'Quiz đã bị khóa do vi phạm nghiêm trọng. Xem xét làm lại hoặc điều tra.';
    }

    if (session.suspicionScore >= 50) {
      return 'Điểm nghi ngờ cao. Nên xem lại video và xem xét kết quả.';
    }

    if (session.violations.length >= 10) {
      return 'Nhiều vi phạm nhỏ. Cần theo dõi thêm.';
    }

    return 'Không có dấu hiệu gian lận nghiêm trọng.';
  }
}

module.exports = new ProctoringService();
