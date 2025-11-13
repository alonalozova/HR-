/**
 * Класи помилок для бота
 */

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

module.exports = {
  AppError,
  ValidationError,
  DatabaseError,
  TelegramError
};
