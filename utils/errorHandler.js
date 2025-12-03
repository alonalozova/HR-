/**
 * Централізований обробник помилок
 */

const logger = require('./logger');
const { ValidationError, DatabaseError, TelegramError, AppError } = require('./errors');

/**
 * Обробляє помилку та відправляє відповідне повідомлення користувачу
 * @param {Error} error - Помилка для обробки
 * @param {number} chatId - ID чату для відправки повідомлення
 * @param {number} telegramId - Telegram ID користувача
 * @param {Function} sendMessage - Функція для відправки повідомлення
 * @returns {Promise<void>}
 */
async function handleError(error, chatId, telegramId, sendMessage) {
  if (!error) return;
  
  // Логування помилки
  if (error instanceof ValidationError) {
    logger.warn('Validation error', { telegramId, error: error.message, field: error.field });
    
    if (sendMessage && chatId) {
      await sendMessage(chatId, `❌ ${error.message}`);
    }
  } else if (error instanceof DatabaseError) {
    logger.error('Database error', error, { telegramId, operation: error.context?.operation });
    
    if (sendMessage && chatId) {
      await sendMessage(chatId, `❌ Помилка бази даних: ${error.message}\n\nБудь ласка, спробуйте пізніше або зверніться до HR.`);
    }
  } else if (error instanceof TelegramError) {
    logger.error('Telegram API error', error, { telegramId, chatId: error.context?.chatId });
    
    if (sendMessage && chatId) {
      await sendMessage(chatId, `❌ Помилка відправки повідомлення. Спробуйте пізніше.`);
    }
  } else if (error instanceof AppError) {
    logger.error('Application error', error, { telegramId, statusCode: error.statusCode });
    
    if (sendMessage && chatId) {
      const message = error.isOperational 
        ? `❌ ${error.message}`
        : `❌ Сталася несподівана помилка. Спробуйте пізніше або зверніться до HR.`;
      await sendMessage(chatId, message);
    }
  } else {
    // Невідома помилка
    logger.error('Unexpected error', error, { telegramId, errorName: error.name, errorMessage: error.message });
    
    if (sendMessage && chatId) {
      await sendMessage(chatId, '❌ Сталася несподівана помилка. Спробуйте пізніше або зверніться до HR.');
    }
  }
}

/**
 * Обгортає асинхронну функцію в try-catch з централізованою обробкою помилок
 * @param {Function} fn - Функція для обгортання
 * @param {Object} context - Контекст (chatId, telegramId, sendMessage)
 * @returns {Function} Обгорнута функція
 */
function withErrorHandling(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      await handleError(
        error,
        context.chatId,
        context.telegramId,
        context.sendMessage
      );
      throw error; // Прокидаємо помилку далі, якщо потрібно
    }
  };
}

/**
 * Створює middleware для обробки помилок в обробниках
 * @param {Function} handler - Обробник події
 * @returns {Function} Обгорнутий обробник
 */
function errorHandlingMiddleware(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      // Спробуємо витягти контекст з аргументів
      const chatId = args[0]?.chat?.id || args[0]?.message?.chat?.id || args[0];
      const telegramId = args[0]?.from?.id || args[1];
      const sendMessage = args[2] || (chatId ? async (id, text) => {
        // Fallback для відправки повідомлення
        try {
          const { default: bot } = await import('../HR_Bot_Complete_Ultimate.js');
          await bot.sendMessage(id, text);
        } catch (e) {
          logger.error('Failed to send error message', e);
        }
      } : null);
      
      await handleError(error, chatId, telegramId, sendMessage);
    }
  };
}

module.exports = {
  handleError,
  withErrorHandling,
  errorHandlingMiddleware
};

