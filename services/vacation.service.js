/**
 * 🏖️ VACATION SERVICE
 * Сервіс для роботи з відпустками (бізнес-логіка)
 */

const logger = require('../utils/logger');
const { ValidationError, DatabaseError } = require('../utils/errors');
const { getSheetValueByLanguage } = require('../utils/sheetsHelpers');

class VacationService {
  constructor(dependencies) {
    this.doc = dependencies.doc;
    this.sheetsQueue = dependencies.sheetsQueue;
    this.getUserInfo = dependencies.getUserInfo;
    this.formatDate = dependencies.formatDate;
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
   * Перевіряє конфлікти відпусток (пересічення з іншими відпустками)
   */
  async checkVacationConflicts(department, team, startDate, endDate, excludeUserId = null) {
    try {
      if (!this.doc) return [];
      
      return await this.sheetsQueue.add(async () => {
        await this.doc.loadInfo();
        let sheet = this.doc.sheetsByTitle['Відпустки'] || this.doc.sheetsByTitle['Vacations'];
        if (!sheet) return [];
      
        const rows = await sheet.getRows();
        const conflicts = [];
      
        for (const row of rows) {
          const rowTelegramId = row.get('TelegramID');
          if (excludeUserId && rowTelegramId == excludeUserId) continue;
        
          const rowDepartment = getSheetValueByLanguage(row, sheet.title, 'Відділ', 'Department');
          const rowTeam = getSheetValueByLanguage(row, sheet.title, 'Команда', 'Team');
          const rowStatus = getSheetValueByLanguage(row, sheet.title, 'Статус', 'Status');
          const rowStartDate = getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate');
          const rowEndDate = getSheetValueByLanguage(row, sheet.title, 'Дата закінчення', 'EndDate');
        
          // Перевіряємо тільки затверджені відпустки
          if (rowStatus !== 'approved' && rowStatus !== 'Approved' && rowStatus !== 'затверджено') continue;
        
          // Перевіряємо тільки відпустки в тій же команді
          if (rowDepartment !== department || rowTeam !== team) continue;
        
          if (!rowStartDate || !rowEndDate) continue;
        
          const conflictStart = new Date(rowStartDate);
          const conflictEnd = new Date(rowEndDate);
        
          // Перевіряємо пересічення
          if (
            (startDate >= conflictStart && startDate <= conflictEnd) ||
            (endDate >= conflictStart && endDate <= conflictEnd) ||
            (startDate <= conflictStart && endDate >= conflictEnd)
          ) {
            const fullName = getSheetValueByLanguage(row, sheet.title, 'Ім\'я та прізвище', 'FullName');
            conflicts.push({
              telegramId: rowTelegramId,
              fullName: fullName || 'Невідомо',
              department: rowDepartment,
              team: rowTeam,
              startDate: this.formatDate(conflictStart),
              endDate: this.formatDate(conflictEnd)
            });
          }
        }
      
        return conflicts;
      });
    } catch (error) {
      logger.error('Error in checkVacationConflicts', error, { department, team });
      return [];
    }
  }

  /**
   * Отримує дати робочого року
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

  /**
   * Перевіряє, чи дата входить в робочий рік
   */
  isInWorkYear(date, firstWorkDay) {
    if (!firstWorkDay) return false;
    const yearDates = this.getWorkYearDates(firstWorkDay);
    if (!yearDates) return false;
    return date >= yearDates.start && date <= yearDates.end;
  }
}

module.exports = VacationService;
