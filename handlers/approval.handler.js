/**
 * ✅ APPROVAL HANDLER
 * Обробник UI для затвердження заявок (HR/CEO)
 */

const logger = require('../utils/logger');
const { getSheetValueByLanguage } = require('../utils/sheetsHelpers');

class ApprovalHandler {
  constructor(dependencies) {
    this.sendMessage = dependencies.sendMessage;
    this.getUserInfo = dependencies.getUserInfo;
    this.getUserRole = dependencies.getUserRole;
    this.navigationStack = dependencies.navigationStack;
    this.addBackButton = dependencies.addBackButton;
    this.doc = dependencies.doc;
    this.sheetsQueue = dependencies.sheetsQueue;
    this.formatDate = dependencies.formatDate;
    this.vacationRequestsCache = dependencies.vacationRequestsCache;
    this.findVacationRowById = dependencies.findVacationRowById;
    this.batchUpdateRows = dependencies.batchUpdateRows;
    this.logUserData = dependencies.logUserData;
  }

  /**
   * Показує меню затверджень
   */
  async showApprovalsMenu(chatId, telegramId) {
    try {
      const role = await this.getUserRole(telegramId);
      if (role !== 'HR' && role !== 'CEO') {
        await this.sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR та CEO.');
        return;
      }

      this.navigationStack.pushState(telegramId, 'showHRPanel', {});

      const text = `📋 <b>Затвердження заявок</b>

Оберіть тип заявок для перегляду:`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🏖️ Відпустки', callback_data: 'approvals_vacations' },
            { text: '🏠 Remote', callback_data: 'approvals_remote' }
          ],
          [
            { text: '⬅️ Назад', callback_data: 'back_to_main' }
          ]
        ]
      };

      await this.sendMessage(chatId, text, keyboard);
    } catch (error) {
      logger.error('Error in showApprovalsMenu', error, { telegramId });
    }
  }

  /**
   * Показує список заявок на відпустку для затвердження
   */
  async showApprovalVacations(chatId, telegramId) {
    try {
      const role = await this.getUserRole(telegramId);
      if (role !== 'HR' && role !== 'CEO') {
        await this.sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR та CEO.');
        return;
      }

      if (!this.doc) {
        logger.warn('Google Sheets not connected in showApprovalVacations');
        await this.sendMessage(chatId, '❌ Google Sheets не підключено. Спробуйте пізніше або зверніться до адміністратора.');
        return;
      }

      return await this.sheetsQueue.add(async () => {
        await this.doc.loadInfo();
        const sheet = this.doc.sheetsByTitle['Відпустки'] || this.doc.sheetsByTitle['Vacations'];
        if (!sheet) {
          await this.sendMessage(chatId, '❌ Таблиця відпусток не знайдена.');
          return;
        }

        const rows = await sheet.getRows();
        
        const pendingRequests = [];
        const approvedHistory = [];
        const rejectedHistory = [];

        for (const row of rows) {
          const status = getSheetValueByLanguage(row, sheet.title, 'Статус', 'Status') || row.get('Status') || '';
          const statusLower = status.toLowerCase();
          
          if (statusLower === 'pending_hr' || statusLower === 'pending_pm' || status === 'Очікує HR' || status === 'Очікує PM') {
            pendingRequests.push(row);
          } else if (statusLower === 'approved' || status === 'затверджено') {
            approvedHistory.push(row);
          } else if (statusLower === 'rejected' || status === 'відхилено') {
            rejectedHistory.push(row);
          }
        }

        let text = `📋 <b>Заявки на відпустку</b>\n\n`;

        if (pendingRequests.length > 0) {
          text += `⏳ <b>Очікують затвердження (${pendingRequests.length}):</b>\n\n`;
          pendingRequests.slice(0, 10).forEach((row, index) => {
            const fullName = getSheetValueByLanguage(row, sheet.title, 'Ім\'я та прізвище', 'FullName') || 'Невідомо';
            const startDate = getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate') || '';
            const endDate = getSheetValueByLanguage(row, sheet.title, 'Дата закінчення', 'EndDate') || '';
            const days = getSheetValueByLanguage(row, sheet.title, 'Кількість днів', 'Days') || '0';
            const requestId = getSheetValueByLanguage(row, sheet.title, 'ID заявки', 'RequestID') || '';
            const status = getSheetValueByLanguage(row, sheet.title, 'Статус', 'Status') || '';
            const createdAt = getSheetValueByLanguage(row, sheet.title, 'Дата створення', 'CreatedAt') || '';
            const requestType = getSheetValueByLanguage(row, sheet.title, 'Тип заявки', 'RequestType') || 'regular';
            const department = getSheetValueByLanguage(row, sheet.title, 'Відділ', 'Department') || '';
            const team = getSheetValueByLanguage(row, sheet.title, 'Команда', 'Team') || '';
            
            const statusEmoji = status.toLowerCase().includes('hr') ? '👥' : '👨‍💼';
            
            text += `${index + 1}. ${statusEmoji} <b>${fullName}</b>\n`;
            text += `   📅 ${startDate} - ${endDate} (${days} днів)\n`;
            text += `   🏢 ${department}/${team}\n`;
            if (requestType.toLowerCase().includes('emergency')) {
              text += `   🚨 Екстрена\n`;
            }
            text += `   🆔 ${requestId}\n\n`;
          });
        } else {
          text += `✅ <b>Немає заявок, що очікують затвердження</b>\n\n`;
        }

        if (approvedHistory.length > 0) {
          text += `✅ <b>Затверджені (останні 5):</b>\n\n`;
          approvedHistory.slice(0, 5).forEach((row, index) => {
            const fullName = getSheetValueByLanguage(row, sheet.title, 'Ім\'я та прізвище', 'FullName') || 'Невідомо';
            const startDate = getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate') || '';
            const endDate = getSheetValueByLanguage(row, sheet.title, 'Дата закінчення', 'EndDate') || '';
            const approvedDate = getSheetValueByLanguage(row, sheet.title, 'Дата затвердження', 'ApprovedDate') || '';
            const approvedBy = getSheetValueByLanguage(row, sheet.title, 'Затверджено ким', 'ApprovedBy') || '';
            
            text += `${index + 1}. ✅ <b>${fullName}</b>\n`;
            text += `   📅 ${startDate} - ${endDate}\n`;
            if (approvedDate) {
              text += `   ✅ Затверджено: ${approvedDate}\n`;
            }
            text += `\n`;
          });
        }

        const keyboard = { inline_keyboard: [] };
        
        if (pendingRequests.length > 0) {
          pendingRequests.slice(0, 5).forEach((row) => {
            const requestId = getSheetValueByLanguage(row, sheet.title, 'ID заявки', 'RequestID') || '';
            const fullName = getSheetValueByLanguage(row, sheet.title, 'Ім\'я та прізвище', 'FullName') || 'Невідомо';
            const startDate = getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate') || '';
            const days = getSheetValueByLanguage(row, sheet.title, 'Кількість днів', 'Days') || '0';
            
            if (requestId) {
              keyboard.inline_keyboard.push([
                { text: `📋 ${fullName} (${startDate}, ${days}д)`, callback_data: `view_vacation_details_${requestId}` }
              ]);
              keyboard.inline_keyboard.push([
                { text: '✅ Підтвердити', callback_data: `approve_vacation_${requestId}` },
                { text: '❌ Відхилити', callback_data: `reject_vacation_${requestId}` }
              ]);
            }
          });
        }
        
        this.addBackButton(keyboard, telegramId, 'showApprovalVacations');
        await this.sendMessage(chatId, text, keyboard);
      });
    } catch (error) {
      logger.error('Error in showApprovalVacations', error, { telegramId });
      await this.sendMessage(chatId, '❌ Помилка завантаження заявок.');
    }
  }

  /**
   * Показує деталі заявки на відпустку
   */
  async showVacationRequestDetails(chatId, telegramId, requestId) {
    try {
      const role = await this.getUserRole(telegramId);
      if (role !== 'HR' && role !== 'CEO') {
        await this.sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR та CEO.');
        return;
      }

      if (!this.doc) {
        await this.sendMessage(chatId, '❌ Google Sheets не підключено.');
        return;
      }

      return await this.sheetsQueue.add(async () => {
        await this.doc.loadInfo();
        const sheet = this.doc.sheetsByTitle['Відпустки'] || this.doc.sheetsByTitle['Vacations'];
        if (!sheet) {
          await this.sendMessage(chatId, '❌ Таблиця відпусток не знайдена.');
          return;
        }

        const rows = await sheet.getRows();
        
        const requestRow = rows.find(row => {
          const rowId = getSheetValueByLanguage(row, sheet.title, 'ID заявки', 'RequestID') || '';
          return rowId === requestId || String(rowId).trim() === String(requestId).trim();
        });
        
        if (!requestRow) {
          await this.sendMessage(chatId, `❌ Заявка з ID ${requestId} не знайдена.`);
          return;
        }
        
        const fullName = getSheetValueByLanguage(requestRow, sheet.title, 'Ім\'я та прізвище', 'FullName') || 'Невідомо';
        const startDate = getSheetValueByLanguage(requestRow, sheet.title, 'Дата початку', 'StartDate') || '';
        const endDate = getSheetValueByLanguage(requestRow, sheet.title, 'Дата закінчення', 'EndDate') || '';
        const days = getSheetValueByLanguage(requestRow, sheet.title, 'Кількість днів', 'Days') || '0';
        const status = getSheetValueByLanguage(requestRow, sheet.title, 'Статус', 'Status') || '';
        const department = getSheetValueByLanguage(requestRow, sheet.title, 'Відділ', 'Department') || '';
        const team = getSheetValueByLanguage(requestRow, sheet.title, 'Команда', 'Team') || '';
        const requestType = getSheetValueByLanguage(requestRow, sheet.title, 'Тип заявки', 'RequestType', 'regular');
        const reason = getSheetValueByLanguage(requestRow, sheet.title, 'Причина', 'Reason') || '';
        const createdAt = getSheetValueByLanguage(requestRow, sheet.title, 'Дата створення', 'CreatedAt') || '';
        const balanceBefore = getSheetValueByLanguage(requestRow, sheet.title, 'Баланс до', 'BalanceBefore') || '';
        const balanceAfter = getSheetValueByLanguage(requestRow, sheet.title, 'Баланс після', 'BalanceAfter') || '';
        
        let text = `📋 <b>Деталі заявки на відпустку</b>\n\n`;
        text += `🆔 <b>ID:</b> ${requestId}\n`;
        text += `👤 <b>Співробітник:</b> ${fullName}\n`;
        text += `🏢 <b>Відділ:</b> ${department}\n`;
        text += `👥 <b>Команда:</b> ${team}\n`;
        text += `📅 <b>Період:</b> ${startDate} - ${endDate}\n`;
        text += `📊 <b>Кількість днів:</b> ${days}\n`;
        text += `📝 <b>Тип:</b> ${requestType.toLowerCase().includes('emergency') ? '🚨 Термінова' : '📝 Звичайна'}\n`;
        text += `⏳ <b>Статус:</b> ${status}\n`;
        
        if (reason) {
          text += `💬 <b>Причина:</b> ${reason}\n`;
        }
        
        if (balanceBefore || balanceAfter) {
          text += `💰 <b>Баланс до:</b> ${balanceBefore}\n`;
          text += `💰 <b>Баланс після:</b> ${balanceAfter}\n`;
        }
        
        if (createdAt) {
          text += `📅 <b>Створено:</b> ${createdAt}\n`;
        }
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '✅ Підтвердити', callback_data: `approve_vacation_${requestId}` },
              { text: '❌ Відхилити', callback_data: `reject_vacation_${requestId}` }
            ],
            [
              { text: '⬅️ Назад до списку', callback_data: 'approvals_vacations' }
            ]
          ]
        };
        
        await this.sendMessage(chatId, text, keyboard);
      });
    } catch (error) {
      logger.error('Error in showVacationRequestDetails', error, { telegramId, requestId });
      await this.sendMessage(chatId, '❌ Помилка завантаження деталей заявки.');
    }
  }

  /**
   * Обробляє затвердження/відхилення відпустки HR
   */
  async handleHRVacationApproval(chatId, telegramId, requestId, approved) {
    // Ця функція має складну логіку з основного файлу
    // Буде викликатися з основного файлу
    throw new Error('handleHRVacationApproval має бути викликана з основного файлу');
  }

  /**
   * Показує список remote для затвердження
   */
  async showApprovalRemote(chatId, telegramId) {
    try {
      const role = await this.getUserRole(telegramId);
      if (role !== 'HR' && role !== 'CEO') {
        await this.sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR та CEO.');
        return;
      }

      if (!this.doc) {
        logger.warn('Google Sheets not connected in showApprovalRemote');
        await this.sendMessage(chatId, '❌ Google Sheets не підключено. Спробуйте пізніше або зверніться до адміністратора.');
        return;
      }

      return await this.sheetsQueue.add(async () => {
        await this.doc.loadInfo();
        const sheet = this.doc.sheetsByTitle['Remotes'] || this.doc.sheetsByTitle['Remote'];
        if (!sheet) {
          await this.sendMessage(chatId, '❌ Таблиця Remote не знайдена.');
          return;
        }

        const rows = await sheet.getRows();
        
        const recentRemotes = rows
          .filter(row => {
            const dateStr = getSheetValueByLanguage(row, sheet.title, 'Дата', 'Date') || '';
            if (!dateStr) return false;
            const date = new Date(dateStr);
            const now = new Date();
            const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
            return date >= monthAgo;
          })
          .sort((a, b) => {
            const dateA = new Date(getSheetValueByLanguage(a, sheet.title, 'Дата', 'Date') || '');
            const dateB = new Date(getSheetValueByLanguage(b, sheet.title, 'Дата', 'Date') || '');
            return dateB - dateA;
          })
          .slice(0, 20);

        let text = `🏠 <b>Remote дні</b>\n\n`;

        if (recentRemotes.length > 0) {
          text += `<b>Останні 20 записів:</b>\n\n`;
          recentRemotes.forEach((row, index) => {
            const fullName = getSheetValueByLanguage(row, sheet.title, 'Ім\'я та прізвище', 'FullName') || 'Невідомо';
            const date = getSheetValueByLanguage(row, sheet.title, 'Дата', 'Date') || '';
            const department = getSheetValueByLanguage(row, sheet.title, 'Відділ', 'Department') || '';
            const team = getSheetValueByLanguage(row, sheet.title, 'Команда', 'Team') || '';
            
            text += `${index + 1}. 🏠 <b>${fullName}</b>\n`;
            text += `   📅 ${date}\n`;
            text += `   🏢 ${department}/${team}\n\n`;
          });
        } else {
          text += `✅ <b>Немає записів за останній місяць</b>\n\n`;
        }

        const keyboard = this.addBackButton({ inline_keyboard: [] }, telegramId, 'showApprovalRemote');
        await this.sendMessage(chatId, text, keyboard);
      });
    } catch (error) {
      logger.error('Error in showApprovalRemote', error, { telegramId });
      await this.sendMessage(chatId, '❌ Помилка завантаження remote записів.');
    }
  }
}

module.exports = ApprovalHandler;

