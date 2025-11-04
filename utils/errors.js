/**
 * 🛡️ КЛАСИ ПОМИЛОК ТА ЛОГЕР
 * Централізована обробка помилок для всього додатку
 */

// ✅ КЛАСИ ПОМИЛОК
class AppError extends Error {
  constructor(message, statusCode, isOperational = true, context = {}) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, true, { field });
    this.name = 'ValidationError';
  }
}

class DatabaseError extends AppError {
  constructor(message, operation = null) {
    super(message, 500, false, { operation });
    this.name = 'DatabaseError';
  }
}

class TelegramError extends AppError {
  constructor(message, chatId = null) {
    super(message, 500, true, { chatId });
    this.name = 'TelegramError';
  }
}

// 📊 ЛОГЕР
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

module.exports = {
  AppError,
  ValidationError,
  DatabaseError,
  TelegramError,
  logger
};

