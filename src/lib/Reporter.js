const fs = require('fs');
const path = require('path');

class Reporter {
  static LEVELS = Object.freeze({
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
  });

  constructor(options = {}) {
    const {
      level = 'info',
      reportingEndpoint = null,
      pollingInterval = 5000,
      allowReportingAll = false,
      logDirectory = 'logs',
      maxRetries = 3,
      batchSize = 10,
      rotationSize = 5 * 1024 * 1024, // 5MB
    } = options;

    this.validateLevel(level);
    this.level = level.toLowerCase();
    this.reportingEndpoint = reportingEndpoint;
    this.pollingInterval = pollingInterval;
    this.allowReportingAll = allowReportingAll;
    this.maxRetries = maxRetries;
    this.batchSize = batchSize;
    this.rotationSize = rotationSize;
    this.logDirectory = logDirectory;
    this.logFilePath = path.join(logDirectory, 'error.log');
    this.pendingReports = [];
    this.retryCount = new Map();
    this.isPolling = false;

    this.initializeLogger();
  }

  initializeLogger() {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }

    // Create log file if it doesn't exist
    if (!fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(this.logFilePath, '');
    }
  }

  validateLevel(level) {
    const validLevels = Object.keys(Reporter.LEVELS).map(l => l.toLowerCase());
    if (!validLevels.includes(level.toLowerCase())) {
      throw new Error(`Invalid log level: ${level}. Valid levels are: ${validLevels.join(', ')}`);
    }
  }

  rotateLogFileIfNeeded() {
    try {
      const stats = fs.statSync(this.logFilePath);
      if (stats.size >= this.rotationSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFilePath = `${this.logFilePath}.${timestamp}`;
        fs.renameSync(this.logFilePath, rotatedFilePath);
        fs.writeFileSync(this.logFilePath, '');
      }
    } catch (error) {
      console.error(`Error rotating log file: ${error.message}`);
    }
  }

  formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  }

  shouldLog(messageLevel) {
    const levels = Reporter.LEVELS;
    const logLevel = this.allowReportingAll ? levels.ERROR : levels[messageLevel.toUpperCase()];
    return logLevel <= levels[this.level.toUpperCase()];
  }

  log(level, message) {
    try {
      this.validateLevel(level);
      
      if (!this.shouldLog(level)) {
        return;
      }

      const formattedMessage = this.formatMessage(level, message);
      
      // Check and rotate log file if needed
      this.rotateLogFileIfNeeded();

      // Write to console and file
      console.log(formattedMessage);
      fs.appendFileSync(this.logFilePath, formattedMessage + '\n');

      // Add to pending reports if endpoint is configured
      if (this.reportingEndpoint) {
        this.pendingReports.push({
          message: formattedMessage,
          timestamp: Date.now(),
          level
        });
      }
    } catch (error) {
      console.error(`Error logging message: ${error.message}`);
    }
  }

  async reportToEndpoint(messages) {
    if (!Array.isArray(messages)) {
      messages = [messages];
    }

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.9) { // Simulate occasional failures
          reject(new Error('Network error'));
          return;
        }
        console.log(`Reporting to endpoint ${this.reportingEndpoint}:`, messages);
        resolve(`Successfully reported ${messages.length} messages`);
      }, 1000);
    });
  }

  async startPolling() {
    if (this.isPolling) {
      console.warn('Polling is already active');
      return;
    }

    this.isPolling = true;
    
    while (this.isPolling) {
      if (this.pendingReports.length > 0) {
        // Process messages in batches
        const batch = this.pendingReports.splice(0, this.batchSize);
        
        try {
          await this.reportToEndpoint(batch);
          this.retryCount.clear(); // Clear retry counts after successful batch
        } catch (error) {
          console.error(`Error reporting batch: ${error.message}`);
          
          // Handle retries for failed messages
          batch.forEach(report => {
            const retries = this.retryCount.get(report.message) || 0;
            
            if (retries < this.maxRetries) {
              this.retryCount.set(report.message, retries + 1);
              this.pendingReports.unshift(report); // Put back at start of queue
            } else {
              console.error(`Maximum retries exceeded for message: ${report.message}`);
              this.log('error', `Failed to report message after ${this.maxRetries} attempts: ${report.message}`);
            }
          });
        }
      }
      
      await this.delay(this.pollingInterval);
    }
  }

  stopPolling() {
    this.isPolling = false;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Convenience methods for different log levels
  error(message) { this.log('error', message); }
  warn(message) { this.log('warn', message); }
  info(message) { this.log('info', message); }
  debug(message) { this.log('debug', message); }
}

module.exports = Reporter