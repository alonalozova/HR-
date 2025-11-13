/**
 * 🔘 CALLBACK HANDLER
 * Обробка callback запитів від кнопок
 * Використовує оригінальний код через глобальні змінні для швидкості
 */

const logger = require('../utils/logger');

// Ліниве завантаження оригінального модуля
let originalModule = null;

function loadOriginalModule() {
  if (!originalModule) {
    originalModule = require('../HR_Bot_Complete_Ultimate');
  }
  return originalModule;
}

/**
 * Обробка callback запиту
 */
async function handleCallback(callbackQuery, services) {
  try {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    logger.info('Callback отримано', { 
      telegramId, 
      data 
    });
    
    // Відповідаємо на callback (важливо для Telegram)
    await services.telegramService.bot.answerCallbackQuery(callbackQuery.id);
    
    // Завантажуємо оригінальний модуль (ліниве завантаження)
    const originalBot = require('../HR_Bot_Complete_Ultimate');
    
    // Використовуємо функцію processCallback з оригінального файлу
    if (typeof originalBot.processCallback === 'function') {
      await originalBot.processCallback(callbackQuery);
    } else if (typeof processCallback === 'function') {
      // Fallback на глобальну функцію
      await processCallback(callbackQuery);
    } else {
      logger.warn('processCallback не знайдено');
    }
    
  } catch (error) {
    logger.error('Помилка обробки callback', error, { 
      telegramId: callbackQuery.from?.id,
      data: callbackQuery.data
    });
  }
}

module.exports = {
  handleCallback
};

