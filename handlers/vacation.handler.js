/**
 * 🏖️ VACATION HANDLER
 * Обробник UI для відпусток
 */

const logger = require('../utils/logger');
const { errorHandlingMiddleware } = require('../utils/errorHandler');

class VacationHandler {
  constructor(dependencies) {
    // Залежності
    this.sendMessage = dependencies.sendMessage;
    this.getUserInfo = dependencies.getUserInfo;
    this.getUserRole = dependencies.getUserRole;
    this.vacationService = dependencies.vacationService;
    this.notificationService = dependencies.notificationService;
    this.processVacationRequest = dependencies.processVacationRequest;
    this.processEmergencyVacationRequest = dependencies.processEmergencyVacationRequest;
    this.handleVacationProcess = dependencies.handleVacationProcess;
    this.navigationStack = dependencies.navigationStack;
    this.addBackButton = dependencies.addBackButton;
    this.formatDate = dependencies.formatDate;
    this.doc = dependencies.doc;
    this.sheetsQueue = dependencies.sheetsQueue;
    this.getSheetValueByLanguage = dependencies.getSheetValueByLanguage;
    this.matchesTelegramId = dependencies.matchesTelegramId;
  }

  /**
   * Показує меню відпусток
   */
  async showVacationMenu(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showMainMenu', {});
      
      const [user, balance] = await Promise.all([
        this.getUserInfo(telegramId),
        this.vacationService.getVacationBalance(telegramId)
      ]);
      
      const text = `🏖️ <b>Відпустки</b>

💰 <b>Ваш баланс:</b> ${balance.used}/${balance.total} днів
📅 <b>Доступно:</b> ${balance.available} днів

<b>Правила відпусток:</b>
• Мін: 1 день, Макс: 7 днів за раз
• Відпустка доступна після 3-х місяців від початку роботи
• Накладки заборонені в команді
• Процес: Ви → PM → HR (якщо немає PM, то одразу → HR)

Оберіть дію:`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📝 Подати заявку', callback_data: 'vacation_apply' },
            { text: '🚨 Екстрена відпустка', callback_data: 'vacation_emergency' }
          ],
          [
            { text: '📄 Мої заявки', callback_data: 'vacation_requests' },
            { text: '📊 Баланс деталі', callback_data: 'vacation_balance' }
          ]
        ]
      };

      this.addBackButton(keyboard, telegramId, 'showVacationMenu');
      await this.sendMessage(chatId, text, keyboard);
    } catch (error) {
      logger.error('Error in showVacationMenu', error, { telegramId });
      throw error;
    }
  }

  /**
   * Показує баланс відпусток
   */
  async showVacationBalance(chatId, telegramId) {
    try {
      this.navigationStack.pushState(telegramId, 'showVacationMenu', {});
      
      const balance = await this.vacationService.getVacationBalance(telegramId);
      const user = await this.getUserInfo(telegramId);
      
      const text = `📊 <b>Детальний баланс відпусток</b>

💰 <b>Використано:</b> ${balance.used} днів
📅 <b>Доступно:</b> ${balance.available} днів
📊 <b>Загальний ліміт:</b> ${balance.total} днів

${user?.firstWorkDay ? `📆 <b>Перший робочий день:</b> ${this.formatDate(new Date(user.firstWorkDay))}` : ''}
${user?.firstWorkDay ? `⏰ <b>Можна брати відпустку після:</b> ${this.formatDate(new Date(new Date(user.firstWorkDay).setMonth(new Date(user.firstWorkDay).getMonth() + 3)))}` : ''}`;
      
      const keyboard = { inline_keyboard: [] };
      this.addBackButton(keyboard, telegramId, 'showVacationBalance');
      await this.sendMessage(chatId, text, keyboard);
    } catch (error) {
      logger.error('Error in showVacationBalance', error, { telegramId });
      await this.sendMessage(chatId, '❌ Помилка завантаження балансу.');
    }
  }

  /**
   * Показує мої заявки на відпустку
   */
  async showMyVacationRequests(chatId, telegramId, page = 0) {
    try {
      this.navigationStack.pushState(telegramId, 'showVacationMenu', {});
      
      if (!this.doc) {
        await this.sendMessage(chatId, '❌ Google Sheets не підключено.');
        return;
      }

      const PAGE_SIZE = 5;
      
      return await this.sheetsQueue.add(async () => {
        await this.doc.loadInfo();
        const sheet = this.doc.sheetsByTitle['Відпустки'] || this.doc.sheetsByTitle['Vacations'];
        if (!sheet) {
          await this.sendMessage(chatId, '❌ Таблиця відпусток не знайдена.');
          return;
        }
        
        const rows = await sheet.getRows();
        
        const userRequests = rows
          .filter(row => this.matchesTelegramId(row, telegramId))
          .map(row => {
            const startDateStr = this.getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate');
            const startDate = startDateStr ? new Date(startDateStr) : new Date(0);
            return { row, startDate };
          })
          .sort((a, b) => b.startDate - a.startDate)
          .map(item => item.row);
        
        if (userRequests.length === 0) {
          await this.sendMessage(chatId, '📋 У вас поки немає заявок на відпустку.');
          return;
        }
        
        const totalPages = Math.ceil(userRequests.length / PAGE_SIZE);
        const currentPage = Math.max(0, Math.min(page, totalPages - 1));
        const start = currentPage * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const pageRequests = userRequests.slice(start, end);
        
        let text = `📄 <b>Мої заявки на відпустку</b>\n`;
        text += `📄 Сторінка ${currentPage + 1} з ${totalPages}\n\n`;
        
        pageRequests.forEach((row, index) => {
          const globalIndex = start + index + 1;
          const status = this.getSheetValueByLanguage(row, sheet.title, 'Статус', 'Status');
          const startDate = this.getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate');
          const endDate = this.getSheetValueByLanguage(row, sheet.title, 'Дата закінчення', 'EndDate');
          const days = this.getSheetValueByLanguage(row, sheet.title, 'Кількість днів', 'Days');
          const requestType = this.getSheetValueByLanguage(row, sheet.title, 'Тип заявки', 'RequestType', 'regular');
          const requestId = this.getSheetValueByLanguage(row, sheet.title, 'ID заявки', 'RequestID') || '';
        
          let statusEmoji = '⏳';
          let statusText = 'Очікує';
          if (status === 'approved' || status === 'Approved' || status === 'затверджено') {
            statusEmoji = '✅';
            statusText = 'Затверджено';
          } else if (status === 'rejected' || status === 'Rejected' || status === 'відхилено') {
            statusEmoji = '❌';
            statusText = 'Відхилено';
          } else if (status === 'pending_hr' || status === 'Pending HR') {
            statusEmoji = '👥';
            statusText = 'Очікує HR';
          } else if (status === 'pending_pm' || status === 'Pending PM') {
            statusEmoji = '👨‍💼';
            statusText = 'Очікує PM';
          }
        
          text += `${globalIndex}. ${statusEmoji} <b>${statusText}</b>\n`;
          text += `   📅 ${startDate} - ${endDate}\n`;
          text += `   📊 ${days} днів`;
          if (requestType.toLowerCase().includes('emergency')) {
            text += ` 🚨`;
          }
          text += `\n   🆔 ${requestId}\n\n`;
        });
        
        const keyboard = { inline_keyboard: [] };
        
        if (totalPages > 1) {
          const navButtons = [];
          if (currentPage > 0) {
            navButtons.push({ text: '⬅️ Попередня', callback_data: `vacation_requests_page_${currentPage - 1}` });
          }
          if (currentPage < totalPages - 1) {
            navButtons.push({ text: 'Наступна ➡️', callback_data: `vacation_requests_page_${currentPage + 1}` });
          }
          if (navButtons.length > 0) {
            keyboard.inline_keyboard.push(navButtons);
          }
        }
        
        this.addBackButton(keyboard, telegramId, 'showMyVacationRequests');
        await this.sendMessage(chatId, text, keyboard);
      });
    } catch (error) {
      logger.error('Error in showMyVacationRequests', error, { telegramId });
      await this.sendMessage(chatId, '❌ Помилка завантаження заявок.');
    }
  }

  /**
   * Показує форму заявки на відпустку
   */
  async showVacationForm(chatId, telegramId) {
    try {
      const user = await this.getUserInfo(telegramId);
      if (!user) {
        await this.sendMessage(chatId, '❌ Користувач не знайдений. Пройдіть реєстрацію.');
        return;
      }

      const text = `📝 <b>Заявка на відпустку</b>

👤 <b>Співробітник:</b> ${user.fullName}
🏢 <b>Відділ:</b> ${user.department}
👥 <b>Команда:</b> ${user.team}

<b>Введіть дати відпустки:</b>

📅 <b>Дата початку</b> (ДД.ММ.РРРР):`;

      const registrationCache = dependencies.registrationCache;
      registrationCache.set(telegramId, {
        step: 'vacation_start_date',
        data: { type: 'vacation' }
      });
      
      logger.debug('showVacationForm: Cache set', { telegramId });

      await this.sendMessage(chatId, text);
    } catch (error) {
      logger.error('Error in showVacationForm', error, { telegramId });
    }
  }

  /**
   * Показує форму екстреної відпустки
   */
  async showEmergencyVacationForm(chatId, telegramId) {
    try {
      const user = await this.getUserInfo(telegramId);
      if (!user) {
        await this.sendMessage(chatId, '❌ Користувач не знайдений. Пройдіть реєстрацію.');
        return;
      }

      const text = `🚨 <b>Екстрена відпустка</b>

👤 <b>Співробітник:</b> ${user.fullName}
🏢 <b>Відділ:</b> ${user.department}
👥 <b>Команда:</b> ${user.team}

⚠️ <b>ВАЖЛИВО:</b> Екстрена відпустка відправляється одразу HR без підтвердження PM.

<b>Введіть дати відпустки:</b>

📅 <b>Дата початку</b> (ДД.ММ.РРРР):`;

      const registrationCache = dependencies.registrationCache;
      registrationCache.set(telegramId, {
        step: 'emergency_vacation_start_date',
        data: { type: 'emergency_vacation' }
      });

      await this.sendMessage(chatId, text);
    } catch (error) {
      logger.error('Error in showEmergencyVacationForm', error, { telegramId });
    }
  }

  /**
   * Показує статистику відпусток
   */
  async showVacationStatsReport(chatId, telegramId, targetTelegramId = null) {
    try {
      const role = await this.getUserRole(telegramId);
      if (role !== 'HR' && role !== 'CEO') {
        await this.sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR та CEO.');
        return;
      }

      const userId = targetTelegramId || telegramId;
      const balance = await this.vacationService.getVacationBalance(userId);
      const user = await this.getUserInfo(userId);
      
      if (!user) {
        await this.sendMessage(chatId, '❌ Користувач не знайдений.');
        return;
      }

      const text = `📊 <b>Статистика відпусток</b>

👤 <b>Співробітник:</b> ${user.fullName}
🏢 <b>Відділ:</b> ${user.department}
👥 <b>Команда:</b> ${user.team}

💰 <b>Використано:</b> ${balance.used} днів
📅 <b>Доступно:</b> ${balance.available} днів
📊 <b>Загальний ліміт:</b> ${balance.total} днів`;

      await this.sendMessage(chatId, text);
    } catch (error) {
      logger.error('Error in showVacationStatsReport', error, { telegramId });
    }
  }
}

module.exports = VacationHandler;

