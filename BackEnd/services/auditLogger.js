/**
 * Audit log service để track tất cả các thay đổi quan trọng
 * Giúp debug và khôi phục dữ liệu khi cần
 */

const fs = require('fs').promises;
const path = require('path');

class AuditLogger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs/audit');
    this.initLogDir();
  }

  async initLogDir() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create audit log directory:', error);
    }
  }

  async log(action, data) {
    try {
      const timestamp = new Date().toISOString();
      const date = timestamp.split('T')[0];
      const logFile = path.join(this.logDir, `audit-${date}.log`);

      const logEntry = {
        timestamp,
        action,
        data,
        environment: process.env.NODE_ENV || 'development'
      };

      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(logFile, logLine);

      // Also log to console in development
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📝 AUDIT: ${action}`, data);
      }
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  async logProfileRejection(profileId, userId, score, reason) {
    await this.log('PROFILE_REJECTED', {
      profileId,
      userId,
      aiScore: score,
      reason,
      timestamp: new Date()
    });
  }

  async logProfileApproval(profileId, userId, score) {
    await this.log('PROFILE_APPROVED', {
      profileId,
      userId,
      aiScore: score,
      timestamp: new Date()
    });
  }

  async logProfileMove(profileId, from, to, newId) {
    await this.log('PROFILE_MOVED', {
      originalProfileId: profileId,
      fromCollection: from,
      toCollection: to,
      newProfileId: newId,
      timestamp: new Date()
    });
  }

  async logProfileDelete(profileId, collection, reason) {
    await this.log('PROFILE_DELETED', {
      profileId,
      collection,
      reason,
      timestamp: new Date()
    });
  }

  async logError(operation, error, context) {
    await this.log('ERROR', {
      operation,
      error: error.message,
      stack: error.stack,
      context,
      timestamp: new Date()
    });
  }
}

module.exports = new AuditLogger();
