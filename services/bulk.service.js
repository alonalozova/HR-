/**
 * 🚀 BULK OPERATIONS SERVICE
 * Оптимізація запитів до Google Sheets для уникнення N+1 проблеми
 */

const { logger } = require('../utils/errors');

class BulkService {
  constructor(sheetsService) {
    this.sheetsService = sheetsService;
    this.cache = new Map(); // Кеш для bulk даних
    this.cacheTTL = 5 * 60 * 1000; // 5 хвилин
  }

  /**
   * Масове отримання інформації про користувачів
   */
  async getUsersInfo(telegramIds) {
    try {
      const cacheKey = `users_${telegramIds.sort().join(',')}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        logger.info('Users info served from cache', { count: cached.size });
        return cached;
      }

      const sheet = await this.sheetsService.getSheet('Employees');
      const rows = await sheet.getRows();
      
      const usersMap = new Map();
      
      rows.forEach(row => {
        const telegramId = row.get('TelegramID');
        if (telegramIds.includes(telegramId)) {
          usersMap.set(telegramId, {
            telegramId: telegramId,
            fullName: row.get('FullName'),
            department: row.get('Department'),
            team: row.get('Team'),
            position: row.get('Position'),
            pm: row.get('PM'),
            startDate: row.get('StartDate'),
            birthday: row.get('Birthday'),
            isActive: row.get('IsActive') === 'TRUE'
          });
        }
      });

      this.setCache(cacheKey, usersMap);
      logger.info('Users info loaded from sheets', { 
        requested: telegramIds.length, 
        found: usersMap.size 
      });
      
      return usersMap;
    } catch (error) {
      logger.error('Error in getUsersInfo', error, { telegramIds });
      throw error;
    }
  }

  /**
   * Масове отримання відпусток для перевірки конфліктів
   */
  async getVacationConflicts(department, team, startDate, endDate, excludeUserId = null) {
    try {
      const cacheKey = `vacations_${department}_${team}_${startDate.toISOString()}_${endDate.toISOString()}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return this.filterConflicts(cached, startDate, endDate, excludeUserId);
      }

      // Отримуємо всі активні відпустки одразу
      const sheet = await this.sheetsService.getSheet('Vacations');
      const rows = await sheet.getRows();
      
      const vacations = [];
      rows.forEach(row => {
        if (row.get('Status') === 'Approved' || row.get('Status') === 'Pending') {
          vacations.push({
            telegramId: row.get('TelegramID'),
            fullName: row.get('FullName'),
            department: row.get('Department'),
            team: row.get('Team'),
            startDate: new Date(row.get('StartDate')),
            endDate: new Date(row.get('EndDate')),
            days: parseInt(row.get('Days')),
            status: row.get('Status')
          });
        }
      });

      this.setCache(cacheKey, vacations);
      
      return this.filterConflicts(vacations, startDate, endDate, excludeUserId);
    } catch (error) {
      logger.error('Error in getVacationConflicts', error, { department, team });
      return [];
    }
  }

  /**
   * Фільтрація конфліктів з отриманих відпусток
   */
  filterConflicts(vacations, startDate, endDate, excludeUserId) {
    return vacations.filter(vacation => {
      // Виключаємо поточного користувача
      if (excludeUserId && vacation.telegramId === excludeUserId) {
        return false;
      }

      // Перевіряємо перетин дат
      const hasOverlap = !(vacation.endDate < startDate || vacation.startDate > endDate);
      
      return hasOverlap;
    });
  }

  /**
   * Масове збереження записів (спізнення, remote, лікарняні)
   */
  async bulkSaveRecords(records, sheetName) {
    try {
      if (!records || records.length === 0) {
        logger.info('No records to save', { sheetName });
        return [];
      }

      const sheet = await this.sheetsService.getOrCreateSheet(sheetName, [
        'TelegramID', 'FullName', 'Department', 'Team', 'Date', 'Type', 'Notes', 'Timestamp'
      ]);

      // Підготовка даних для bulk вставки
      const rowsData = records.map(record => ({
        TelegramID: record.telegramId,
        FullName: record.fullName,
        Department: record.department,
        Team: record.team,
        Date: record.date,
        Type: record.type,
        Notes: record.notes || '',
        Timestamp: new Date().toISOString()
      }));

      // Додаємо всі рядки одразу
      await sheet.addRows(rowsData);
      
      logger.info('Bulk save completed', { 
        sheetName, 
        recordsCount: records.length 
      });

      // Очищаємо кеш для цього аркуша
      this.clearSheetCache(sheetName);

      return rowsData.map((_, index) => `RECORD_${Date.now()}_${index}`);
    } catch (error) {
      logger.error('Error in bulkSaveRecords', error, { sheetName, recordsCount: records.length });
      throw error;
    }
  }

  /**
   * Масове оновлення балансів відпусток
   */
  async bulkUpdateVacationBalances(updates) {
    try {
      if (!updates || updates.length === 0) {
        logger.info('No vacation balance updates');
        return;
      }

      const sheet = await this.sheetsService.getOrCreateSheet('VacationBalance', [
        'TelegramID', 'FullName', 'Department', 'Team', 'UsedDays', 'RemainingDays', 'LastUpdated'
      ]);

      const rows = await sheet.getRows();
      const balanceMap = new Map();
      
      // Створюємо мапу існуючих балансів
      rows.forEach(row => {
        balanceMap.set(row.get('TelegramID'), row);
      });

      // Оновлюємо або створюємо нові записи
      const newRows = [];
      for (const update of updates) {
        const existingRow = balanceMap.get(update.telegramId);
        
        if (existingRow) {
          // Оновлюємо існуючий рядок
          existingRow.set('UsedDays', update.usedDays);
          existingRow.set('RemainingDays', update.remainingDays);
          existingRow.set('LastUpdated', new Date().toISOString());
          await existingRow.save();
        } else {
          // Додаємо новий рядок
          newRows.push({
            TelegramID: update.telegramId,
            FullName: update.fullName,
            Department: update.department,
            Team: update.team,
            UsedDays: update.usedDays,
            RemainingDays: update.remainingDays,
            LastUpdated: new Date().toISOString()
          });
        }
      }

      if (newRows.length > 0) {
        await sheet.addRows(newRows);
      }

      logger.info('Bulk vacation balance update completed', { 
        updatesCount: updates.length,
        newRowsCount: newRows.length
      });

      // Очищаємо кеш
      this.clearSheetCache('VacationBalance');
    } catch (error) {
      logger.error('Error in bulkUpdateVacationBalances', error, { updatesCount: updates.length });
      throw error;
    }
  }

  /**
   * Масове отримання статистики за місяць
   */
  async getMonthlyStats(month, year) {
    try {
      const cacheKey = `stats_${year}_${month}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        logger.info('Monthly stats served from cache', { month, year });
        return cached;
      }

      // Паралельно завантажуємо дані з різних аркушів
      const [lates, remotes, vacations, sick] = await Promise.all([
        this.getSheetDataByMonth('Lates', month, year),
        this.getSheetDataByMonth('Remotes', month, year),
        this.getSheetDataByMonth('Vacations', month, year),
        this.getSheetDataByMonth('Sick', month, year)
      ]);

      const stats = {
        month,
        year,
        lates,
        remotes,
        vacations,
        sick,
        summary: this.calculateSummary(lates, remotes, vacations, sick)
      };

      this.setCache(cacheKey, stats);
      logger.info('Monthly stats loaded', { month, year, totalRecords: stats.summary.totalRecords });
      
      return stats;
    } catch (error) {
      logger.error('Error in getMonthlyStats', error, { month, year });
      throw error;
    }
  }

  /**
   * Отримання даних з аркуша за місяць
   */
  async getSheetDataByMonth(sheetName, month, year) {
    try {
      const sheet = await this.sheetsService.getSheet(sheetName);
      const rows = await sheet.getRows();
      
      const monthStr = month.toString().padStart(2, '0');
      const yearMonth = `${year}-${monthStr}`;
      
      return rows.filter(row => {
        const date = row.get('Date');
        return date && date.startsWith(yearMonth);
      }).map(row => ({
        telegramId: row.get('TelegramID'),
        fullName: row.get('FullName'),
        department: row.get('Department'),
        team: row.get('Team'),
        date: row.get('Date'),
        type: row.get('Type'),
        notes: row.get('Notes')
      }));
    } catch (error) {
      logger.error(`Error getting ${sheetName} data`, error, { month, year });
      return [];
    }
  }

  /**
   * Розрахунок підсумкової статистики
   */
  calculateSummary(lates, remotes, vacations, sick) {
    const userStats = new Map();
    
    // Агрегуємо дані по користувачах
    [...lates, ...remotes, ...vacations, ...sick].forEach(record => {
      const userId = record.telegramId;
      if (!userStats.has(userId)) {
        userStats.set(userId, {
          telegramId: userId,
          fullName: record.fullName,
          department: record.department,
          team: record.team,
          lates: 0,
          remotes: 0,
          vacationDays: 0,
          sickDays: 0
        });
      }
      
      const user = userStats.get(userId);
      if (record.type === 'Late') user.lates++;
      else if (record.type === 'Remote') user.remotes++;
      else if (record.type === 'Vacation') user.vacationDays += parseInt(record.days || 1);
      else if (record.type === 'Sick') user.sickDays++;
    });

    return {
      totalUsers: userStats.size,
      totalRecords: lates.length + remotes.length + vacations.length + sick.length,
      users: Array.from(userStats.values())
    };
  }

  /**
   * Кешування з TTL
   */
  getFromCache(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Очищення кешу для конкретного аркуша
   */
  clearSheetCache(sheetName) {
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (key.includes(sheetName.toLowerCase())) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    logger.info('Sheet cache cleared', { sheetName, clearedKeys: keysToDelete.length });
  }

  /**
   * Повне очищення кешу
   */
  clearAllCache() {
    this.cache.clear();
    logger.info('All bulk cache cleared');
  }
}

module.exports = BulkService;

