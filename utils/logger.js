/**
 * Безпечний логер для бота
 * Не логує особисті дані (telegramId, fullName, тощо)
 */

const crypto = require('crypto');

/**
 * Хешує ID для безпечного логування
 * @param {string|number} id - ID для хешування
 * @returns {string} Хешований ID (перші 8 символів)
 */
function hashId(id) {
  if (!id) return 'unknown';
  const hash = crypto.createHash('sha256').update(String(id)).digest('hex');
  return hash.substring(0, 8);
}

/**
 * Очищає контекст від особистих даних
 * @param {Object} context - Контекст для очищення
 * @returns {Object} Очищений контекст
 */
function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return {};
  
  const sanitized = { ...context };
  
  // Видаляємо особисті дані
  if (sanitized.telegramId) {
    sanitized.userId = hashId(sanitized.telegramId);
    delete sanitized.telegramId;
  }
  
  if (sanitized.fullName) {
    sanitized.hasName = !!sanitized.fullName;
    sanitized.nameLength = sanitized.fullName.length;
    delete sanitized.fullName;
  }
  
  if (sanitized.user) {
    sanitized.user = {
      userId: hashId(sanitized.user.telegramId),
      hasName: !!sanitized.user.fullName,
      department: sanitized.user.department,
      team: sanitized.user.team,
      position: sanitized.user.position
    };
  }
  
  // Хешуємо інші ID
  ['userId', 'hrTelegramId', 'userTelegramId', 'approvedBy', 'rejectedBy'].forEach(key => {
    if (sanitized[key]) {
      sanitized[key] = hashId(sanitized[key]);
    }
  });
  
  return sanitized;
}

const logger = {
  info: (message, context = {}) => {
    const sanitized = sanitizeContext(context);
    console.log(`ℹ️ ${new Date().toISOString()} - ${message}`, Object.keys(sanitized).length > 0 ? sanitized : '');
  },
  warn: (message, context = {}) => {
    const sanitized = sanitizeContext(context);
    console.warn(`⚠️ ${new Date().toISOString()} - ${message}`, Object.keys(sanitized).length > 0 ? sanitized : '');
  },
  error: (message, error = null, context = {}) => {
    const sanitized = sanitizeContext(context);
    const errorInfo = error ? {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    } : null;
    console.error(`❌ ${new Date().toISOString()} - ${message}`, errorInfo, Object.keys(sanitized).length > 0 ? sanitized : '');
  },
  success: (message, context = {}) => {
    const sanitized = sanitizeContext(context);
    console.log(`✅ ${new Date().toISOString()} - ${message}`, Object.keys(sanitized).length > 0 ? sanitized : '');
  },
  debug: (message, context = {}) => {
    if (process.env.NODE_ENV === 'development') {
      const sanitized = sanitizeContext(context);
      console.log(`🔍 ${new Date().toISOString()} - ${message}`, Object.keys(sanitized).length > 0 ? sanitized : '');
    }
  }
};

module.exports = logger;
module.exports.hashId = hashId;
module.exports.sanitizeContext = sanitizeContext;

