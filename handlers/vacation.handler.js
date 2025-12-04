/**
 * 🏖️ VACATION HANDLER
 * Обробник UI для відпусток
 */

const logger = require('../utils/logger');
const { ValidationError } = require('../utils/errors');
const { getSheetValueByLanguage } = require('../utils/sheetsHelpers');

class VacationHandler {
  constructor(dependencies) {
    // Залежності
    this.sendMessage = dependencies.sendMessage;
    this.getUserInfo = dependencies.getUserInfo;
    this.getUserRole = dependencies.getUserRole;
    this.navigationStack = dependencies.navigationStack;
    this.addBackButton = dependencies.addBackButton;
    this.registrationCache = dependencies.registrationCache;
    this.vacationService = dependencies.vacationService;
    this.notificationService = dependencies.notificationService;
    this.doc = dependencies.doc;
    this.sheetsQueue = dependencies.sheetsQueue;
    this.userCache = dependencies.userCache;
    this.formatDate = dependencies.formatDate;
    this.getPMForUser = dependencies.getPMForUser;
    this.saveVacationRequest = dependencies.saveVacationRequest;
    this.processEmergencyVacationRequest = dependencies.processEmergencyVacationRequest;
    this.PAGE_SIZE = dependencies.PAGE_SIZE || 5;
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
   * Показує форму для заявки на відпустку
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

      this.registrationCache.set(telegramId, {
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
   * Показує мої заявки на відпустку (з пагінацією)
   */
  async showMyVacationRequests(chatId, telegramId, page = 0) {
    try {
      if (!this.doc) {
        await this.sendMessage(chatId, '❌ Google Sheets не підключено.');
        return;
      }

      this.navigationStack.pushState(telegramId, 'showVacationMenu', {});

      return await this.sheetsQueue.add(async () => {
        await this.doc.loadInfo();
        const sheet = this.doc.sheetsByTitle['Відпустки'] || this.doc.sheetsByTitle['Vacations'];
        if (!sheet) {
          await this.sendMessage(chatId, '❌ Таблиця відпусток не знайдена.');
          return;
        }
        
        const rows = await sheet.getRows();
        
        const userRequests = rows
          .filter(row => {
            const rowTelegramId = row.get('TelegramID');
            return rowTelegramId == telegramId;
          })
          .map(row => {
            const startDateStr = getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate');
            const startDate = startDateStr ? new Date(startDateStr) : new Date(0);
            return { row, startDate };
          })
          .sort((a, b) => b.startDate - a.startDate)
          .map(item => item.row);
        
        if (userRequests.length === 0) {
          await this.sendMessage(chatId, '📋 У вас поки немає заявок на відпустку.');
          return;
        }
        
        const totalPages = Math.ceil(userRequests.length / this.PAGE_SIZE);
        const currentPage = Math.max(0, Math.min(page, totalPages - 1));
        const start = currentPage * this.PAGE_SIZE;
        const end = start + this.PAGE_SIZE;
        const pageRequests = userRequests.slice(start, end);
        
        let text = `📄 <b>Мої заявки на відпустку</b>\n`;
        text += `📄 Сторінка ${currentPage + 1} з ${totalPages}\n\n`;
        
        pageRequests.forEach((row, index) => {
          const globalIndex = start + index + 1;
          const status = getSheetValueByLanguage(row, sheet.title, 'Статус', 'Status');
          const startDate = getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate');
          const endDate = getSheetValueByLanguage(row, sheet.title, 'Дата закінчення', 'EndDate');
          const days = getSheetValueByLanguage(row, sheet.title, 'Кількість днів', 'Days');
          const requestType = getSheetValueByLanguage(row, sheet.title, 'Тип заявки', 'RequestType', 'regular');
          const requestId = getSheetValueByLanguage(row, sheet.title, 'ID заявки', 'RequestID') || '';
        
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
        
        // Кнопки пагінації
        if (totalPages > 1) {
          const paginationRow = [];
          if (currentPage > 0) {
            paginationRow.push({ text: '⬅️ Попередня', callback_data: `vacation_requests_page_${currentPage - 1}` });
          }
          if (currentPage < totalPages - 1) {
            paginationRow.push({ text: 'Наступна ➡️', callback_data: `vacation_requests_page_${currentPage + 1}` });
          }
          if (paginationRow.length > 0) {
            keyboard.inline_keyboard.push(paginationRow);
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
   * Обробляє процес введення даних для відпустки
   */
  async handleVacationProcess(chatId, telegramId, text) {
    try {
      const regData = this.registrationCache.get(telegramId);
      logger.debug('handleVacationProcess', { telegramId, hasRegData: !!regData, step: regData?.step, text });
      if (!regData) return false;
      
      // Обробка екстреної відпустки
      if (regData.step === 'emergency_vacation_start_date') {
        const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
        const match = text.match(dateRegex);
        
        if (!match) {
          await this.sendMessage(chatId, '❌ Невірний формат дати. Використовуйте ДД.ММ.РРРР (наприклад: 11.11.2025)');
          return true;
        }
        
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = parseInt(match[3]);
        
        const startDate = new Date(year, month - 1, day);
        if (startDate.getDate() !== day || startDate.getMonth() !== month - 1 || startDate.getFullYear() !== year) {
          await this.sendMessage(chatId, '❌ Невірна дата. Перевірте правильність введених даних.');
          return true;
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startDate.setHours(0, 0, 0, 0);
        
        if (startDate < today) {
          const keyboard = {
            inline_keyboard: [
              [
                { text: '✅ Так, продовжити', callback_data: 'emergency_vacation_confirm_yes' },
                { text: '❌ Ні, скасувати', callback_data: 'emergency_vacation_confirm_no' }
              ]
            ]
          };
          await this.sendMessage(chatId, `⚠️ <b>Увага!</b> Ви вказали дату в минулому (${text}). Екстрена відпустка може бути зафіксована ретроспективно. Продовжити?`, keyboard);
          regData.step = 'emergency_vacation_confirm_past_date';
          regData.data.startDate = startDate;
          return true;
        }
        
        regData.data.startDate = startDate;
        regData.step = 'emergency_vacation_days';
        await this.sendMessage(chatId, `📅 <b>Дата початку:</b> ${text}\n\n📊 <b>Вкажіть кількість днів відпустки</b>\n\nВведіть кількість днів (1-7):`);
        return true;
      }
      
      if (regData.step === 'emergency_vacation_confirm_past_date') {
        if (text.toLowerCase().includes('так') || text.toLowerCase().includes('yes') || text === '✅' || text === '1') {
          regData.step = 'emergency_vacation_days';
          await this.sendMessage(chatId, `📅 <b>Дата початку:</b> ${this.formatDate(regData.data.startDate)}\n\n📊 <b>Вкажіть кількість днів відпустки</b>\n\nВведіть кількість днів (1-7):`);
          return true;
        } else {
          await this.sendMessage(chatId, '❌ Заявку скасовано. Почніть спочатку.');
          this.registrationCache.delete(telegramId);
          return true;
        }
      }
      
      if (regData.step === 'emergency_vacation_days') {
        const days = parseInt(text);
        
        if (isNaN(days) || days < 1 || days > 7) {
          await this.sendMessage(chatId, '❌ Кількість днів має бути від 1 до 7.');
          return true;
        }
        
        regData.data.days = days;
        regData.step = 'emergency_vacation_reason';
        await this.sendMessage(chatId, `📊 <b>Кількість днів:</b> ${days}\n\n🔒 <b>ВАЖЛИВО! Конфіденційна інформація</b>\n\n📝 <b>Опишіть причину екстреної відпустки:</b>\n\n⚠️ Ця інформація буде доступна тільки HR і CEO агенції.`);
        return true;
      }
      
      if (regData.step === 'emergency_vacation_reason') {
        if (!text || text.trim().length < 10) {
          await this.sendMessage(chatId, '❌ Будь ласка, опишіть причину більш детально (мінімум 10 символів).');
          return true;
        }
        
        regData.data.reason = text.trim();
        await this.processEmergencyVacationRequest(chatId, telegramId, regData.data);
        this.registrationCache.delete(telegramId);
        return true;
      }
      
      if (regData.step === 'vacation_start_date') {
        const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
        const match = text.match(dateRegex);
        
        if (!match) {
          await this.sendMessage(chatId, '❌ Невірний формат дати. Використовуйте ДД.ММ.РРРР (наприклад: 11.11.2025)');
          return true;
        }
        
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = parseInt(match[3]);
        
        const startDate = new Date(year, month - 1, day);
        if (startDate.getDate() !== day || startDate.getMonth() !== month - 1 || startDate.getFullYear() !== year) {
          await this.sendMessage(chatId, '❌ Невірна дата. Перевірте правильність введених даних.');
          return true;
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (startDate < today) {
          await this.sendMessage(chatId, '❌ Дата початку відпустки не може бути в минулому.');
          return true;
        }
        
        regData.data.startDate = startDate;
        regData.step = 'vacation_days';
        
        await this.sendMessage(chatId, `📅 <b>Дата початку:</b> ${text}\n\n📊 <b>Вкажіть кількість днів відпустки</b>\n\nВведіть кількість днів (1-7):`);
        return true;
      }
      
      if (regData.step === 'vacation_days') {
        const days = parseInt(text);
        
        if (isNaN(days) || days < 1 || days > 7) {
          await this.sendMessage(chatId, '❌ Кількість днів має бути від 1 до 7.');
          return true;
        }
        
        regData.data.days = days;
        
        await this.processVacationRequest(chatId, telegramId, regData.data);
        this.registrationCache.delete(telegramId);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error in handleVacationProcess', error, { telegramId });
      return false;
    }
  }

  /**
   * Обробляє заявку на відпустку (викликається з processVacationRequest з основного файлу)
   */
  async processVacationRequest(chatId, telegramId, vacationData) {
    // Ця функція буде викликатися з основного файлу, який має всю логіку
    // Тут тільки обгортка для handler
    throw new Error('processVacationRequest має бути викликана з основного файлу');
  }

  /**
   * Обробляє екстрену відпустку (викликається з processEmergencyVacationRequest з основного файлу)
   */
  async processEmergencyVacationRequest(chatId, telegramId, vacationData) {
    // Ця функція буде викликатися з основного файлу
    throw new Error('processEmergencyVacationRequest має бути викликана з основного файлу');
  }

  /**
   * Показує форму для екстреної відпустки
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

<b>ВАЖЛИВО:</b>
• Екстрена відпустка відправляється одразу HR
• Потрібна причина (конфіденційна інформація)
• Може бути зафіксована ретроспективно

<b>Введіть дату початку відпустки</b> (ДД.ММ.РРРР):`;

      this.registrationCache.set(telegramId, {
        step: 'emergency_vacation_start_date',
        data: { type: 'emergency_vacation' }
      });

      await this.sendMessage(chatId, text);
    } catch (error) {
      logger.error('Error in showEmergencyVacationForm', error, { telegramId });
    }
  }

  /**
   * Показує статистику відпусток (для HR/CEO)
   */
  async showVacationStatsReport(chatId, telegramId, targetTelegramId = null) {
    // Ця функція буде в основному файлі або в окремому handler для HR
    throw new Error('showVacationStatsReport має бути в HR handler');
  }
}

module.exports = VacationHandler;
