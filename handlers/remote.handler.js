/**
 * 🏠 REMOTE HANDLER
 * Обробник UI для remote роботи
 */

const logger = require('../utils/logger');
const { getSheetValueByLanguage } = require('../utils/sheetsHelpers');

class RemoteHandler {
  constructor(dependencies) {
    this.sendMessage = dependencies.sendMessage;
    this.getUserInfo = dependencies.getUserInfo;
    this.navigationStack = dependencies.navigationStack;
    this.addBackButton = dependencies.addBackButton;
    this.registrationCache = dependencies.registrationCache;
    this.notificationService = dependencies.notificationService;
    this.doc = dependencies.doc;
    this.sheetsQueue = dependencies.sheetsQueue;
    this.formatDate = dependencies.formatDate;
    this.getPMForUser = dependencies.getPMForUser;
    this.processRemoteRequest = dependencies.processRemoteRequest;
    this.getRemoteStatsForCurrentMonth = dependencies.getRemoteStatsForCurrentMonth;
  }

  /**
   * Показує меню remote
   */
  async showRemoteMenu(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showMainMenu', {});
      
      const user = await this.getUserInfo(telegramId);
      if (!user) {
        logger.error('User not found in showRemoteMenu', null, { telegramId });
        await this.sendMessage(chatId, '❌ Користувач не знайдений. Пройдіть реєстрацію через /start');
        return;
      }
      
      const stats = await this.getRemoteStatsForCurrentMonth(telegramId);
      
      const text = `🏠 <b>Remote робота</b>

📊 <b>Статистика за поточний місяць:</b>
• Використано днів: ${stats.used}

<b>Правила:</b>
• Повідомляти до 19:00 дня передуючого залишенню вдома
• Автоматичне затвердження

Оберіть дію:`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🏠 Remote сьогодні', callback_data: 'remote_today' },
            { text: '📅 Календар Remote', callback_data: 'remote_calendar' }
          ],
          [
            { text: '📊 Статистика', callback_data: 'remote_stats' }
          ]
        ]
      };

      this.addBackButton(keyboard, telegramId, 'showRemoteMenu');
      await this.sendMessage(chatId, text, keyboard);
    } catch (error) {
      logger.error('Error in showRemoteMenu', error, { telegramId });
    }
  }

  /**
   * Встановлює remote на сьогодні
   */
  async setRemoteToday(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showRemoteMenu', {});
      
      const user = await this.getUserInfo(telegramId);
      if (!user) {
        await this.sendMessage(chatId, '❌ Користувач не знайдений.');
        return;
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      await this.processRemoteRequest(chatId, telegramId, { date: today });
    } catch (error) {
      logger.error('Error in setRemoteToday', error, { telegramId });
    }
  }

  /**
   * Показує календар remote
   */
  async showRemoteCalendar(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showRemoteMenu', {});
      
      const keyboard = this.addBackButton({ inline_keyboard: [] }, telegramId, 'showRemoteCalendar');
      await this.sendMessage(chatId, '📅 Календар Remote роботи в розробці.', keyboard);
    } catch (error) {
      logger.error('Error in showRemoteCalendar', error, { telegramId });
    }
  }

  /**
   * Показує статистику remote
   */
  async showRemoteStats(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showRemoteMenu', {});
      
      const stats = await this.getRemoteStatsForCurrentMonth(telegramId);
      const text = `📊 <b>Статистика Remote роботи за поточний місяць</b>\n\n🏠 <b>Використано днів:</b> ${stats.used}`;
      
      const keyboard = this.addBackButton({ inline_keyboard: [] }, telegramId, 'showRemoteStats');
      await this.sendMessage(chatId, text, keyboard);
    } catch (error) {
      logger.error('Error in showRemoteStats', error, { telegramId });
    }
  }

  /**
   * Обробляє процес введення даних для remote
   */
  async handleRemoteProcess(chatId, telegramId, text) {
    try {
      const regData = this.registrationCache.get(telegramId);
      if (!regData) return false;
      
      if (regData.step === 'remote_date') {
        const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
        const match = text.match(dateRegex);
        if (!match) {
          await this.sendMessage(chatId, '❌ Невірний формат дати. Використовуйте ДД.ММ.РРРР');
          return true;
        }
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = parseInt(match[3]);
        const date = new Date(year, month - 1, day);
        if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
          await this.sendMessage(chatId, '❌ Невірна дата.');
          return true;
        }
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        if (date < today) {
          await this.sendMessage(chatId, '⚠️ Не можна вказати дату в минулому.');
          return true;
        }
        
        if (date <= tomorrow) {
          const currentHour = now.getHours();
          if (currentHour >= 19 && date.getTime() === tomorrow.getTime()) {
            await this.sendMessage(chatId, '⚠️ Повідомлення про Remote на завтра має бути до 19:00 сьогодні.');
            return true;
          }
        }
        
        regData.data.date = date;
        await this.processRemoteRequest(chatId, telegramId, regData.data);
        this.registrationCache.delete(telegramId);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error in handleRemoteProcess', error, { telegramId });
      return false;
    }
  }

  /**
   * Показує статистику remote (для HR/CEO)
   */
  async showRemoteStatsReport(chatId, telegramId, targetTelegramId = null) {
    // Ця функція буде в основному файлі або в окремому handler для HR
    throw new Error('showRemoteStatsReport має бути в HR handler');
  }
}

module.exports = RemoteHandler;

