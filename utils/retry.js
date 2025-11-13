/**
 * Утиліти для retry та моніторингу продуктивності
 */

const logger = require('./logger');
const config = require('../config');

/**
 * Виконує функцію з повторними спробами при помилках
 */
async function withRetry(fn, maxRetries = config.RETRY.MAX_RETRIES, delay = config.RETRY.DELAY) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries;
      const isRetryable = error.message?.includes('rate limit') || 
                         error.message?.includes('quota') ||
                         error.message?.includes('timeout') ||
                         error.code === 'ECONNRESET' ||
                         error.code === 'ETIMEDOUT';
      
      if (isLastAttempt || !isRetryable) {
        logger.error(`Retry failed after ${attempt} attempts`, error);
        throw error;
      }
      
      const waitTime = delay * Math.pow(2, attempt - 1); // Exponential backoff
      logger.warn(`Retry attempt ${attempt}/${maxRetries} after ${waitTime}ms`, { error: error.message });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  throw lastError;
}

/**
 * Вимірює час виконання функції та логує результат
 */
async function withPerformanceMonitor(fn, operationName, context = {}) {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    logger.info(`Performance: ${operationName}`, { 
      duration: `${duration}ms`,
      ...context 
    });
    
    // Попередження якщо операція занадто довга
    if (duration > 5000) {
      logger.warn(`Slow operation detected: ${operationName} took ${duration}ms`, context);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Performance: ${operationName} failed`, error, { 
      duration: `${duration}ms`,
      ...context 
    });
    throw error;
  }
}

/**
 * Виконує функцію з retry та моніторингом продуктивності
 */
async function executeWithRetryAndMonitor(fn, operationName, options = {}) {
  const { maxRetries = config.RETRY.MAX_RETRIES, delay = config.RETRY.DELAY, context = {} } = options;
  
  return withPerformanceMonitor(
    () => withRetry(fn, maxRetries, delay),
    operationName,
    context
  );
}

module.exports = {
  withRetry,
  withPerformanceMonitor,
  executeWithRetryAndMonitor
};

