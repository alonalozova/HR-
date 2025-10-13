/**
 * 📱 TELEGRAM SERVICE
 * Сервіс для роботи з Telegram Bot API
 */

const TelegramBot = require('node-telegram-bot-api');
const { TelegramError, logger } = require('../utils/errors');

class TelegramService {
  constructor(botToken) {
    this.bot = new TelegramBot(botToken);
  }

  /**
   * Відправка повідомлення з клавіатурою
   */
  async sendMessage(chatId, text, keyboard = null) {
    try {
      const options = { parse_mode: 'HTML' };
      if (keyboard) {
        if (keyboard.inline_keyboard) {
          options.reply_markup = keyboard;
        } else {
          options.reply_markup = { keyboard: keyboard, resize_keyboard: true };
        }
      }
      
      await this.bot.sendMessage(chatId, text, options);
      logger.info('Message sent successfully', { chatId, textLength: text.length });
      
    } catch (error) {
      if (error.response?.statusCode === 403) {
        logger.warn('Bot blocked by user', { chatId });
        throw new TelegramError('Бот заблокований користувачем', chatId);
      } else if (error.response?.statusCode === 400) {
        logger.warn('Invalid message format', { chatId, error: error.response.body });
        throw new TelegramError('Невірний формат повідомлення', chatId);
      } else {
        logger.error('Failed to send message', error, { chatId });
        throw new TelegramError('Помилка відправки повідомлення', chatId);
      }
    }
  }

  /**
   * Встановлення webhook
   */
  async setWebhook(webhookUrl) {
    try {
      await this.bot.setWebHook(webhookUrl);
      logger.success('Webhook set successfully', { webhookUrl });
    } catch (error) {
      logger.error('Failed to set webhook', error, { webhookUrl });
      throw new TelegramError('Помилка встановлення webhook');
    }
  }

  /**
   * Видалення webhook
   */
  async deleteWebhook() {
    try {
      await this.bot.deleteWebHook();
      logger.success('Webhook deleted successfully');
    } catch (error) {
      logger.error('Failed to delete webhook', error);
      throw new TelegramError('Помилка видалення webhook');
    }
  }

  /**
   * Отримання інформації про бота
   */
  async getBotInfo() {
    try {
      const botInfo = await this.bot.getMe();
      logger.info('Bot info retrieved', { username: botInfo.username });
      return botInfo;
    } catch (error) {
      logger.error('Failed to get bot info', error);
      throw new TelegramError('Помилка отримання інформації про бота');
    }
  }

  /**
   * Відправка повідомлення з кнопками
   */
  async sendInlineKeyboard(chatId, text, inlineKeyboard) {
    const keyboard = {
      inline_keyboard: inlineKeyboard
    };
    return this.sendMessage(chatId, text, keyboard);
  }

  /**
   * Відправка reply keyboard
   */
  async sendReplyKeyboard(chatId, text, replyKeyboard) {
    return this.sendMessage(chatId, text, replyKeyboard);
  }
}

module.exports = TelegramService;
