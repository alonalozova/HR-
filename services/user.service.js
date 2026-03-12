/**
 * 👤 USER SERVICE
 * Сервіс для роботи з користувачами
 */

const SheetsService = require('./sheets.service');
const { HybridCache } = require('../utils/cache');
const config = require('../config');
const logger = require('../utils/logger');
const { executeWithRetryAndMonitor } = require('../utils/retry');

class UserService {
  constructor(sheetsService) {
    this.sheetsService = sheetsService;
    this.userCache = new HybridCache(
      'users',
      config.CACHE.USER_CACHE.maxSize,
      config.CACHE.USER_CACHE.ttl
    );
  }

  /**
   * Отримує інформацію про користувача
   */
  async getUserInfo(telegramId) {
    try {
      // Перевірка кешу
      const cached = this.userCache.get(telegramId);
      if (cached) {
        return cached;
      }

      const user = await executeWithRetryAndMonitor(
        async () => {
          const sheet = await this.sheetsService.getSheet('Employees');
          const rows = await sheet.getRows();
          const userRow = rows.find(row => row.get('TelegramID') == telegramId);

          if (!userRow) return null;

          return {
            telegramId: parseInt(userRow.get('TelegramID')),
            fullName: userRow.get('FullName'),
            department: userRow.get('Department'),
            team: userRow.get('Team'),
            position: userRow.get('Position'),
            birthDate: userRow.get('BirthDate'),
            firstWorkDay: userRow.get('FirstWorkDay'),
            workMode: userRow.get('WorkMode'),
            pm: userRow.get('PM') || null
          };
        },
        'getUserInfo',
        { telegramId }
      );

      if (user) {
        this.userCache.set(telegramId, user);
      }

      return user;
    } catch (error) {
      logger.error('Failed to get user info', error, { telegramId });
      return null;
    }
  }

  /**
   * Отримує роль користувача
   */
  async getUserRole(telegramId) {
    try {
      return await executeWithRetryAndMonitor(
        async () => {
          const sheet = await this.sheetsService.getSheet('Roles');
          const rows = await sheet.getRows();
          const roleRow = rows.find(row => row.get('TelegramID') == telegramId);

          return roleRow ? roleRow.get('Role') : 'EMP';
        },
        'getUserRole',
        { telegramId }
      );
    } catch (error) {
      logger.error('Failed to get user role', error, { telegramId });
      return 'EMP';
    }
  }

  /**
   * Знаходить PM для користувача
   */
  async getPMForUser(user) {
    try {
      if (!user) return null;

      // Перевіряємо чи є PM у полі користувача
      if (user.pm) {
        const pmId = parseInt(user.pm);
        if (!isNaN(pmId)) {
          const pmUser = await this.getUserInfo(pmId);
          if (pmUser) {
            return { telegramId: pmId, fullName: pmUser.fullName };
          }
        }
      }

      // Шукаємо PM по градації (відділ/команда)
      return await executeWithRetryAndMonitor(
        async () => {
          const sheet = await this.sheetsService.getSheet('Employees');
          const rows = await sheet.getRows();

          // Шукаємо PM в тому ж відділі/команді
          const pmRow = rows.find(row => {
            const department = row.get('Department');
            const team = row.get('Team');
            const position = row.get('Position');
            const rowTelegramId = row.get('TelegramID');

            // Перевіряємо чи це PM в тому ж відділі/команді
            if (position && position.toLowerCase().includes('pm')) {
              if (user.department && department === user.department) {
                if (user.team && team === user.team) {
                  return true;
                }
                if (!user.team) {
                  return true;
                }
              }
            }
            return false;
          });

          if (pmRow) {
            const pmId = parseInt(pmRow.get('TelegramID'));
            const pmUser = await this.getUserInfo(pmId);
            if (pmUser) {
              return { telegramId: pmId, fullName: pmUser.fullName };
            }
          }

          return null;
        },
        'getPMForUser',
        { userId: user.telegramId }
      );
    } catch (error) {
      logger.error('Failed to get PM for user', error, { userId: user?.telegramId });
      return null;
    }
  }

  /**
   * Перевіряє чи є користувач новим співробітником
   */
  async checkIfNewEmployee(telegramId) {
    try {
      const user = await this.getUserInfo(telegramId);
      if (!user || !user.firstWorkDay) return false;

      const firstWorkDay = new Date(user.firstWorkDay);
      const now = new Date();
      const daysSinceStart = Math.floor((now - firstWorkDay) / (1000 * 60 * 60 * 24));

      return daysSinceStart <= 30; // Перші 30 днів
    } catch (error) {
      logger.error('Failed to check if new employee', error, { telegramId });
      return false;
    }
  }

  /**
   * Очищує кеш користувача
   */
  clearUserCache(telegramId) {
    if (telegramId) {
      this.userCache.delete(telegramId);
    } else {
      this.userCache.clear();
    }
  }
}

module.exports = UserService;

