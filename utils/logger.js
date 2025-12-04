/**
 * Логер для бота
 */

const logger = {
  info: (message, context = {}) => {
    console.log(`ℹ️ ${new Date().toISOString()} - ${message}`, context);
  },
  warn: (message, context = {}) => {
    console.warn(`⚠️ ${new Date().toISOString()} - ${message}`, context);
  },
  error: (message, error = null, context = {}) => {
    console.error(`❌ ${new Date().toISOString()} - ${message}`, error, context);
  },
  success: (message, context = {}) => {
    console.log(`✅ ${new Date().toISOString()} - ${message}`, context);
  }
};

module.exports = logger;

