/**
 * 📨 MESSAGE HANDLER
 * Обробка повідомлень від користувачів
 * Використовує оригінальний код через глобальні змінні для швидкості
 */

const logger = require('../utils/logger');

// Ліниве завантаження оригінального модуля
let originalModule = null;

function loadOriginalModule() {
  if (!originalModule) {
    // Використовуємо require для завантаження оригінального файлу
    // Він виконається і створить глобальні функції
    originalModule = require('../HR_Bot_Complete_Ultimate');
  }
  return originalModule;
}

/**
 * Обробка повідомлення
 */
async function handleMessage(message, services) {
  try {
    // Перевірка наявності обов'язкових полів
    if (!message || !message.chat || !message.from) {
      logger.error('Невалідне повідомлення', null, { message: JSON.stringify(message) });
      return;
    }
    
    const chatId = message.chat.id;
    const text = message.text || '';
    const telegramId = message.from.id;
    const username = message.from.username;
    const firstName = message.from.first_name;
    const lastName = message.from.last_name;
    
    logger.info('Повідомлення отримано', { 
      telegramId, 
      text: text.substring(0, 50) 
    });
    
    // Завантажуємо оригінальний модуль (ліниве завантаження)
    // Використовуємо прямий require для швидкості
    // Оригінальний файл має всі функції як глобальні
    const originalBot = require('../HR_Bot_Complete_Ultimate');
    
    // Використовуємо функцію processMessage з оригінального файлу
    // Вона вже має всю логіку обробки
    if (typeof originalBot.processMessage === 'function') {
      await originalBot.processMessage(message);
    } else if (typeof processMessage === 'function') {
      // Fallback на глобальну функцію
      await processMessage(message);
    } else {
      // Fallback: використовуємо сервіси напряму
      logger.warn('processMessage не знайдено, використовуємо fallback');
      
      if (text === '/start') {
        const user = await services.userService.getUserInfo(telegramId);
        if (!user) {
          await services.telegramService.sendMessage(
            chatId,
            '🌟 <b>Привіт!</b>\n\nПочніть реєстрацію, натиснувши кнопку нижче.',
            {
              inline_keyboard: [[{ text: '📝 Почати реєстрацію', callback_data: 'start_registration' }]]
            }
          );
        } else {
          await services.telegramService.sendMessage(
            chatId,
            `🌟 <b>Ласкаво просимо до HR Бота!</b>\n\n👋 <b>Привіт, ${user.fullName || 'колега'}!</b>`
          );
        }
        return;
      }
      
      await services.telegramService.sendMessage(chatId, '❓ Оберіть дію з меню нижче.');
    }
    
  } catch (error) {
    logger.error('Помилка обробки повідомлення', error, { 
      telegramId: message.from?.id 
    });
  }
}

module.exports = {
  handleMessage
};

