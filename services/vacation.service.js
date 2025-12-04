/**
 * 🏖️ VACATION SERVICE
 * Сервіс для бізнес-логіки відпусток
 */

const logger = require('../utils/logger');
const { DatabaseError, ValidationError } = require('../utils/errors');
const { formatDate } = require('../utils/validation');
const { batchAddRows, batchUpdateRows } = require('../utils/sheetsBatch');
const { getSheetValueByLanguage } = require('../utils/sheetsHelpers');

class VacationService {
  constructor(dependencies) {
    // Залежності з основного файлу
    this.doc = dependencies.doc;
    this.sheetsQueue = dependencies.sheetsQueue;
    this.getUserInfo = dependencies.getUserInfo;
    this.executeWithRetryAndMonitor = dependencies.executeWithRetryAndMonitor;
    this.vacationRequestsCache = dependencies.vacationRequestsCache;
  }

  /**
   * Отримує баланс відпусток користувача
   */
  async getVacationBalance(telegramId) {
    try {
      if (!this.doc) return { used: 0, total: 24, available: 24 };
      
      const user = await this.getUserInfo(telegramId);
      if (!user) return { used: 0, total: 24, available: 24 };
      
      return await this.sheetsQueue.add(async () => {
        await this.doc.loadInfo();
        let sheet = this.doc.sheetsByTitle['Відпустки'] || this.doc.sheetsByTitle['Vacations'];
        if (!sheet) return { used: 0, total: 24, available: 24, annual: 24, remaining: 24 };
        
        const rows = await sheet.getRows();
        const workYearDates = this.getWorkYearDates(user.firstWorkDay);
        
        const userVacations = rows.filter(row => {
          const rowTelegramId = row.get('TelegramID');
          const rowStatus = getSheetValueByLanguage(row, sheet.title, 'Статус', 'Status');
          const rowStartDate = getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate');
          
          if (rowTelegramId != telegramId) return false;
          if (rowStatus !== 'approved' && rowStatus !== 'Approved' && rowStatus !== 'затверджено') return false;
          if (!rowStartDate) return false;
          
          const startDate = new Date(rowStartDate);
          
          if (workYearDates) {
            return this.isInWorkYear(startDate, user.firstWorkDay);
          }
          
          return startDate.getFullYear() === new Date().getFullYear();
        });
        
        const usedDays = userVacations.reduce((total, row) => {
          const start = new Date(getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate'));
          const end = new Date(getSheetValueByLanguage(row, sheet.title, 'Дата закінчення', 'EndDate'));
          const days = parseInt(getSheetValueByLanguage(row, sheet.title, 'Кількість днів', 'Days') || 0);
          return total + (days || Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
        }, 0);
        
        const annual = 24;
        const remaining = Math.max(0, annual - usedDays);
        
        return {
          used: usedDays,
          total: annual,
          annual: annual,
          available: remaining,
          remaining: remaining
        };
      });
    } catch (error) {
      logger.error('Error in getVacationBalance', error, { telegramId });
      return { used: 0, total: 24, available: 24 };
    }
  }

  /**
   * Перевіряє конфлікти відпусток
   */
  async checkVacationConflicts(department, team, startDate, endDate, excludeUserId = null) {
    try {
      if (!this.doc) return [];
      
      return await this.sheetsQueue.add(async () => {
        await this.doc.loadInfo();
        let sheet = this.doc.sheetsByTitle['Vacations'] || this.doc.sheetsByTitle['Відпустки'];
        if (!sheet) return [];
        
        const rows = await sheet.getRows();
        const conflicts = [];
        
        for (const row of rows) {
          const rowTelegramId = row.get('TelegramID');
          if (excludeUserId && rowTelegramId == excludeUserId) continue;
          
          const rowStatus = getSheetValueByLanguage(row, sheet.title, 'Статус', 'Status');
          if (rowStatus !== 'approved' && rowStatus !== 'pending_pm' && rowStatus !== 'pending_hr') continue;
          
          const rowDepartment = getSheetValueByLanguage(row, sheet.title, 'Відділ', 'Department');
          const rowTeam = getSheetValueByLanguage(row, sheet.title, 'Команда', 'Team');
          if (rowDepartment !== department || rowTeam !== team) continue;
          
          const rowStartDateStr = getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate');
          const rowEndDateStr = getSheetValueByLanguage(row, sheet.title, 'Дата закінчення', 'EndDate');
          if (!rowStartDateStr || !rowEndDateStr) continue;
          
          const rowStartDate = new Date(rowStartDateStr);
          const rowEndDate = new Date(rowEndDateStr);
          
          if (startDate <= rowEndDate && endDate >= rowStartDate) {
            conflicts.push({
              fullName: getSheetValueByLanguage(row, sheet.title, 'Ім\'я та прізвище', 'FullName'),
              department: rowDepartment,
              team: rowTeam,
              startDate: formatDate(rowStartDate),
              endDate: formatDate(rowEndDate)
            });
          }
        }
        
        return conflicts;
      });
    } catch (error) {
      logger.error('Error in checkVacationConflicts', error);
      return [];
    }
  }

  /**
   * Зберігає заявку на відпустку
   */
  async saveVacationRequest(telegramId, user, startDate, endDate, days, status = 'pending_pm', pm = null, requestType = 'regular', reason = '') {
    return this.executeWithRetryAndMonitor(
      async () => {
        if (!this.doc) {
          throw new DatabaseError('Google Sheets не підключено', 'save_vacation');
        }
        
        return await this.sheetsQueue.add(async () => {
          await this.doc.loadInfo();
          let sheet = this.doc.sheetsByTitle['Відпустки'] || this.doc.sheetsByTitle['Vacations'];
          if (!sheet) {
            logger.info('Creating new Vacations sheet');
            sheet = await this.doc.addSheet({
              title: 'Відпустки',
              headerValues: [
                'ID заявки', 'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 'PM',
                'Дата початку', 'Дата закінчення', 'Кількість днів', 'Статус', 
                'Тип заявки', 'Причина', 'Дата створення', 'Затверджено ким', 'Дата затвердження',
                'Відхилено ким', 'Причина відхилення', 'Баланс до', 'Баланс після', 'Дата оновлення'
              ]
            });
          }
          
          const requestId = `VAC_${Date.now()}_${telegramId}`;
          const pmName = pm ? pm.fullName : (user.pm || 'Не призначено');
          
          const balanceBefore = await this.getVacationBalance(telegramId);
          const balanceAfter = {
            remaining: Math.max(0, balanceBefore.remaining - days),
            used: balanceBefore.used + days
          };
          
          const now = new Date().toISOString();
          const rowData = {
            'ID заявки': requestId,
            'TelegramID': telegramId,
            'Ім\'я та прізвище': user?.fullName || user?.FullName || 'Невідомо',
            'Відділ': user?.department || user?.Department || 'Невідомо',
            'Команда': user?.team || user?.Team || 'Невідомо',
            'PM': pmName,
            'Дата початку': startDate.toISOString().split('T')[0],
            'Дата закінчення': endDate.toISOString().split('T')[0],
            'Кількість днів': days,
            'Статус': status,
            'Тип заявки': requestType,
            'Причина': reason || '',
            'Дата створення': now,
            'Затверджено ким': '',
            'Дата затвердження': '',
            'Відхилено ким': '',
            'Причина відхилення': '',
            'Баланс до': balanceBefore.remaining,
            'Баланс після': balanceAfter.remaining,
            'Дата оновлення': now
          };
          
          logger.info('Saving vacation request', { requestId, telegramId });
          
          const savedRows = await batchAddRows(sheet, [rowData]);
          const savedRow = savedRows[0];
          
          if (!savedRow) {
            throw new DatabaseError('Не вдалося зберегти рядок в Google Sheets', 'save_vacation');
          }
          
          // Перевіряємо та виправляємо ID якщо потрібно
          const savedId = savedRow.get('ID заявки') || savedRow.get('RequestID');
          if (savedId !== requestId) {
            const isUkrainianSheet = sheet.title === 'Відпустки';
            if (isUkrainianSheet) {
              savedRow.set('ID заявки', requestId);
            } else {
              savedRow.set('RequestID', requestId);
            }
            await batchUpdateRows([savedRow]);
          }
          
          // Зберігаємо в кеш
          this.vacationRequestsCache.set(requestId, {
            requestId,
            telegramId,
            savedRow: savedRow,
            rowData: rowData,
            savedAt: Date.now()
          });
          
          logger.success('Vacation request saved', { requestId });
          
          return requestId;
        });
      },
      'saveVacationRequest',
      { telegramId, days }
    );
  }

  /**
   * Знаходить рядок заявки на відпустку за ID
   */
  async findVacationRowById(sheet, requestId) {
    const PAGE_SIZE = 500;
    const normalizedId = String(requestId).trim();
    let offset = 0;
    let sampleIds = [];
    
    try {
      await sheet.loadCells();
    } catch (error) {
      logger.warn('Failed to load cells', { error: error.message });
    }
    
    while (true) {
      const rows = await sheet.getRows({
        offset,
        limit: PAGE_SIZE
      });
      
      if (rows.length === 0) break;
      
      if (offset === 0) {
        sampleIds = rows.slice(0, 10).map(r => {
          const id = getSheetValueByLanguage(r, sheet.title, 'ID заявки', 'RequestID') || 'N/A';
          return String(id).trim();
        });
      }
      
      const foundRow = rows.find(row => {
        const rawId = getSheetValueByLanguage(row, sheet.title, 'ID заявки', 'RequestID') || '';
        const normalizedRowId = String(rawId).trim();
        return normalizedRowId === normalizedId;
      });
      
      if (foundRow) {
        return { row: foundRow, sampleIds };
      }
      
      offset += rows.length;
      if (rows.length < PAGE_SIZE) break;
    }
    
    return { row: null, sampleIds };
  }

  /**
   * Допоміжні функції для робочого року
   */
  getWorkYearDates(firstWorkDay) {
    if (!firstWorkDay) return null;
    
    let firstDay;
    if (typeof firstWorkDay === 'string') {
      const parts = firstWorkDay.split('.');
      if (parts.length === 3) {
        firstDay = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      } else {
        firstDay = new Date(firstWorkDay);
      }
    } else {
      firstDay = new Date(firstWorkDay);
    }
    
    if (isNaN(firstDay.getTime())) return null;
    
    const now = new Date();
    let workYearStart = new Date(firstDay);
    workYearStart.setFullYear(now.getFullYear());
    
    if (now < workYearStart) {
      workYearStart.setFullYear(now.getFullYear() - 1);
    }
    
    const workYearEnd = new Date(workYearStart);
    workYearEnd.setMonth(workYearEnd.getMonth() + 12);
    workYearEnd.setDate(workYearEnd.getDate() - 1);
    
    return { start: workYearStart, end: workYearEnd };
  }

  isInWorkYear(date, firstWorkDay) {
    if (!firstWorkDay) return false;
    const yearDates = this.getWorkYearDates(firstWorkDay);
    if (!yearDates) return false;
    return date >= yearDates.start && date <= yearDates.end;
  }
}

module.exports = VacationService;

