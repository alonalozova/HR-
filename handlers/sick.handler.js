/**
 * 🏥 SICK HANDLER
 * Обробник UI для лікарняних
 */

const logger = require('../utils/logger');

class SickHandler {
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
    this.processSickReport = dependencies.processSickReport;
    this.getSickStatsForCurrentMonth = dependencies.getSickStatsForCurrentMonth;
  }

  /**
   * Показує меню лікарняних
   */
  async showSickMenu(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showMainMenu', {});
      
      const stats = await this.getSickStatsForCurrentMonth(telegramId);
      
      const text = `🏥 <b>Лікарняний</b>

📊 <b>Статистика за поточний місяць:</b>
• Днів: ${stats.days}
• Записів: ${stats.count}

<b>Правила:</b>
• Повідомляти про лікарняний обов'язково
• Автоматичне затвердження

Оберіть дію:`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🏥 Повідомити про лікарняний', callback_data: 'sick_report' }
          ],
          [
            { text: '📊 Статистика', callback_data: 'sick_stats' }
          ]
        ]
      };

      this.addBackButton(keyboard, telegramId, 'showSickMenu');
      await this.sendMessage(chatId, text, keyboard);
    } catch (error) {
      logger.error('Error in showSickMenu', error, { telegramId });
    }
  }

  /**
   * Показує форму для повідомлення про лікарняний
   */
  async reportSick(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showSickMenu', {});
      
      const user = await this.getUserInfo(telegramId);
      if (!user) {
        await this.sendMessage(chatId, '❌ Користувач не знайдений.');
        return;
      }
      
      this.registrationCache.set(telegramId, {
        step: 'sick_date',
        data: {}
      });
      
      const keyboard = this.addBackButton({ inline_keyboard: [] }, telegramId, 'reportSick');
      await this.sendMessage(chatId, '🏥 <b>Лікарняний</b>\n\n📅 <b>Вкажіть дату лікарняного</b> (ДД.ММ.РРРР):', keyboard);
    } catch (error) {
      logger.error('Error in reportSick', error, { telegramId });
    }
  }

  /**
   * Обробляє процес введення даних для лікарняного
   */
  async handleSickProcess(chatId, telegramId, text) {
    try {
      const regData = this.registrationCache.get(telegramId);
      if (!regData) return false;
      
      if (regData.step === 'sick_date') {
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
        await this.processSickReport(chatId, telegramId, regData.data);
        this.registrationCache.delete(telegramId);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error in handleSickProcess', error, { telegramId });
      return false;
    }
  }

  /**
   * Показує статистику лікарняних
   */
  async showSickStats(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showSickMenu', {});
      
      const stats = await this.getSickStatsForCurrentMonth(telegramId);
      const text = `📊 <b>Статистика лікарняних за поточний місяць</b>\n\n🏥 <b>Днів:</b> ${stats.days}\n📝 <b>Записів:</b> ${stats.count}`;
      
      const keyboard = this.addBackButton({ inline_keyboard: [] }, telegramId, 'showSickStats');
      await this.sendMessage(chatId, text, keyboard);
    } catch (error) {
      logger.error('Error in showSickStats', error, { telegramId });
    }
  }
}

module.exports = SickHandler;


