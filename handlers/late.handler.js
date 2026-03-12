/**
 * ⏰ LATE HANDLER
 * Обробник UI для спізнень
 */

const logger = require('../utils/logger');
const { getSheetValueByLanguage } = require('../utils/sheetsHelpers');

class LateHandler {
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
    this.processLateReport = dependencies.processLateReport;
    this.getLateStatsForCurrentMonth = dependencies.getLateStatsForCurrentMonth;
  }

  /**
   * Показує меню спізнень
   */
  async showLateMenu(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showMainMenu', {});
      
      const stats = await this.getLateStatsForCurrentMonth(telegramId);
      
      const text = `⏰ <b>Спізнення</b>

📊 <b>Статистика за поточний місяць:</b>
• Кількість спізнень: ${stats.count}
• Ліміт: 7 спізнень/місяць

${stats.count >= 7 ? '⚠️ Досягнуто ліміт спізнень!' : `✅ Залишилось: ${7 - stats.count}`}

<b>Правила:</b>
• Повідомляти про спізнення обов'язково
• Причина спізнення обов'язкова

Оберіть дію:`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '⏰ Спізнення сьогодні', callback_data: 'late_today' },
            { text: '📅 Інша дата', callback_data: 'late_other_date' }
          ],
          [
            { text: '📊 Статистика', callback_data: 'late_stats' }
          ]
        ]
      };

      this.addBackButton(keyboard, telegramId, 'showLateMenu');
      await this.sendMessage(chatId, text, keyboard);
    } catch (error) {
      logger.error('Error in showLateMenu', error, { telegramId });
    }
  }

  /**
   * Показує форму для повідомлення про спізнення
   */
  async reportLate(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showLateMenu', {});
      
      const user = await this.getUserInfo(telegramId);
      if (!user) {
        await this.sendMessage(chatId, '❌ Користувач не знайдений.');
        return;
      }
      
      this.registrationCache.set(telegramId, {
        step: 'late_date',
        data: {}
      });
      
      const keyboard = this.addBackButton({ inline_keyboard: [] }, telegramId, 'reportLate');
      await this.sendMessage(chatId, '⏰ <b>Повідомлення про спізнення</b>\n\n📅 <b>Вкажіть дату спізнення</b> (ДД.ММ.РРРР):', keyboard);
    } catch (error) {
      logger.error('Error in reportLate', error, { telegramId });
    }
  }

  /**
   * Обробляє спізнення на сьогодні
   */
  async handleLateToday(chatId, telegramId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      this.registrationCache.set(telegramId, {
        step: 'late_time',
        data: { date: today }
      });
      
      await this.sendMessage(chatId, '⏰ <b>Спізнення сьогодні</b>\n\n🕐 <b>Вкажіть час початку роботи</b> (ГГ:ХХ, наприклад: 10:30):');
    } catch (error) {
      logger.error('Error in handleLateToday', error, { telegramId });
    }
  }

  /**
   * Обробляє спізнення на іншу дату
   */
  async handleLateOtherDate(chatId, telegramId) {
    try {
      this.registrationCache.set(telegramId, {
        step: 'late_date',
        data: {}
      });
      
      await this.sendMessage(chatId, '📅 <b>Інша дата спізнення</b>\n\n📅 <b>Вкажіть дату</b> (ДД.ММ.РРРР):');
    } catch (error) {
      logger.error('Error in handleLateOtherDate', error, { telegramId });
    }
  }

  /**
   * Обробляє процес введення даних для спізнень
   */
  async handleLateProcess(chatId, telegramId, text) {
    try {
      const regData = this.registrationCache.get(telegramId);
      if (!regData) return false;
      
      if (regData.step === 'late_date') {
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
        regData.data.date = date;
        regData.step = 'late_time';
        await this.sendMessage(chatId, `📅 <b>Дата:</b> ${text}\n\n🕐 <b>Вкажіть час початку роботи</b> (ГГ:ХХ, наприклад: 10:30):`);
        return true;
      }
      
      if (regData.step === 'late_time') {
        const timeRegex = /^(\d{1,2}):(\d{2})$/;
        const match = text.match(timeRegex);
        if (!match) {
          await this.sendMessage(chatId, '❌ Невірний формат часу. Використовуйте ГГ:ХХ (наприклад: 10:30)');
          return true;
        }
        const hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
          await this.sendMessage(chatId, '❌ Невірний час. Години: 0-23, хвилини: 0-59');
          return true;
        }
        regData.data.time = text;
        regData.step = 'late_reason';
        await this.sendMessage(chatId, `🕐 <b>Час:</b> ${text}\n\n📝 <b>Вкажіть причину спізнення:</b>`);
        return true;
      }
      
      if (regData.step === 'late_reason') {
        if (!text || text.trim().length < 3) {
          await this.sendMessage(chatId, '❌ Будь ласка, опишіть причину більш детально (мінімум 3 символи).');
          return true;
        }
        regData.data.reason = text.trim();
        await this.processLateReport(chatId, telegramId, regData.data);
        this.registrationCache.delete(telegramId);
        return true;
      }
      
      if (regData.step === 'late_skip_reason') {
        await this.processLateReport(chatId, telegramId, { ...regData.data, reason: 'Не вказано' });
        this.registrationCache.delete(telegramId);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error in handleLateProcess', error, { telegramId });
      return false;
    }
  }

  /**
   * Пропускає причину спізнення
   */
  async handleLateSkipReason(chatId, telegramId) {
    try {
      const regData = this.registrationCache.get(telegramId);
      if (!regData) return;
      
      await this.processLateReport(chatId, telegramId, { ...regData.data, reason: 'Не вказано' });
      this.registrationCache.delete(telegramId);
    } catch (error) {
      logger.error('Error in handleLateSkipReason', error, { telegramId });
    }
  }

  /**
   * Додає причину спізнення
   */
  async handleLateAddReason(chatId, telegramId) {
    try {
      const regData = this.registrationCache.get(telegramId);
      if (!regData) return;
      
      regData.step = 'late_reason';
      await this.sendMessage(chatId, '📝 <b>Вкажіть причину спізнення:</b>');
    } catch (error) {
      logger.error('Error in handleLateAddReason', error, { telegramId });
    }
  }

  /**
   * Показує статистику спізнень
   */
  async showLateStats(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showLateMenu', {});
      
      const stats = await this.getLateStatsForCurrentMonth(telegramId);
      const text = `📊 <b>Статистика спізнень за поточний місяць</b>\n\n⏰ <b>Кількість спізнень:</b> ${stats.count}\n⚠️ <b>Ліміт:</b> 7 спізнень/місяць\n\n${stats.count >= 7 ? '⚠️ Досягнуто ліміт спізнень!' : `✅ Залишилось: ${7 - stats.count}`}`;
      
      const keyboard = this.addBackButton({ inline_keyboard: [] }, telegramId, 'showLateStats');
      await this.sendMessage(chatId, text, keyboard);
    } catch (error) {
      logger.error('Error in showLateStats', error, { telegramId });
    }
  }

  /**
   * Показує статистику спізнень (для HR/CEO)
   */
  async showLatesStatsReport(chatId, telegramId, targetTelegramId = null, month = null, year = null) {
    // Ця функція буде в основному файлі або в окремому handler для HR
    throw new Error('showLatesStatsReport має бути в HR handler');
  }
}

module.exports = LateHandler;


