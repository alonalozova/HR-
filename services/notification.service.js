/**
 * 📢 NOTIFICATION SERVICE
 * Сервіс для відправки всіх сповіщень (notify* функції)
 */

const logger = require('../utils/logger');
const { TelegramError, ValidationError } = require('../utils/errors');
const { formatDate } = require('../utils/validation');

class NotificationService {
  constructor(dependencies) {
    // Залежності з основного файлу
    this.sendMessage = dependencies.sendMessage;
    this.getUserInfo = dependencies.getUserInfo;
    this.getUserRole = dependencies.getUserRole;
    this.getPMForUser = dependencies.getPMForUser;
    this.logUserData = dependencies.logUserData;
    this.HR_CHAT_ID = dependencies.HR_CHAT_ID;
    this.userCache = dependencies.userCache;
    this.doc = dependencies.doc;
  }

  /**
   * Повідомляє PM про нову заявку на відпустку
   */
  async notifyPMAboutVacationRequest(user, requestId, startDate, endDate, days, pm) {
    try {
      if (!pm || !pm.telegramId) return;
      
      const message = `📋 <b>Нова заявка на відпустку</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ/Команда:</b> ${user.department}/${user.team}\n📅 <b>Період:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n📊 <b>Днів:</b> ${days}\n🆔 <b>ID заявки:</b> ${requestId}\n\n⏳ <b>Потребує підтвердження PM</b>`;
      
      await this.sendMessage(pm.telegramId, message);
      
      // Логування
      await this.logUserData(user.telegramId, 'pm_notification', {
        requestId,
        pm: pm.fullName,
        pmTelegramId: pm.telegramId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        days
      });
    } catch (error) {
      logger.error('Error in notifyPMAboutVacationRequest', error, { requestId });
    }
  }

  /**
   * Повідомляє HR про нову заявку на відпустку
   */
  async notifyHRAboutVacationRequest(user, requestId, startDate, endDate, days, conflicts = [], canApprove = false) {
    try {
      if (!this.HR_CHAT_ID) return;
      
      if (!user) {
        logger.error('notifyHRAboutVacationRequest: user об\'єкт відсутній');
        return;
      }
      
      // Нормалізуємо дані користувача
      if (!user.fullName && !user.FullName) {
        logger.warn('User missing fullName, refreshing', { telegramId: user.telegramId });
        this.userCache.delete(user.telegramId);
        const refreshedUser = await this.getUserInfo(user.telegramId);
        if (refreshedUser && (refreshedUser.fullName || refreshedUser.FullName)) {
          Object.assign(user, refreshedUser);
        }
      }
      
      if (!user.fullName && user.FullName) {
        user.fullName = user.FullName;
      }
      if (!user.department && user.Department) {
        user.department = user.Department;
      }
      if (!user.team && user.Team) {
        user.team = user.Team;
      }
      
      const userName = user.fullName || user.FullName || 'Невідомо';
      const userDepartment = (user.department || user.Department || 'Невідомо').toString();
      const userTeam = (user.team || user.Team || 'Невідомо').toString();
      const userPM = (user.pm || user.PM || 'Не призначено').toString();
      
      let message = `📋 <b>НОВА ЗАЯВКА НА ВІДПУСТКУ</b>\n\n`;
      message += `👤 <b>Співробітник:</b> ${userName}\n`;
      message += `🏢 <b>Відділ:</b> ${userDepartment}\n`;
      message += `👥 <b>Команда:</b> ${userTeam}\n`;
      message += `📅 <b>Період:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n`;
      message += `📊 <b>Днів:</b> ${days}\n`;
      message += `👤 <b>PM:</b> ${userPM}\n`;
      message += `🆔 <b>ID заявки:</b> ${requestId}\n\n`;
      
      if (conflicts && conflicts.length > 0) {
        message += `⚠️ <b>ПЕРЕСІЧЕННЯ З ІНШИМИ ВІДПУСТКАМИ:</b>\n\n`;
        conflicts.forEach((conflict, index) => {
          message += `${index + 1}. 👤 <b>${conflict.fullName}</b>\n`;
          message += `   🏢 ${conflict.department}/${conflict.team}\n`;
          message += `   📅 ${conflict.startDate} - ${conflict.endDate}\n\n`;
        });
      } else {
        message += `✅ <b>Пересічень з іншими відпустками немає</b>\n\n`;
      }
      
      if (canApprove) {
        message += `🔄 <b>Процес:</b> Користувач → HR (без PM)\n`;
        message += `⏳ <b>Статус:</b> Очікує підтвердження HR`;
      } else {
        message += `🔄 <b>Процес:</b> Користувач → PM → HR\n`;
        message += `⏳ <b>Статус:</b> Очікує підтвердження PM`;
      }
      
      const keyboard = {
        inline_keyboard: []
      };
      
      if (canApprove) {
        keyboard.inline_keyboard.push([
          { text: '✅ Підтвердити', callback_data: `vacation_hr_approve_${requestId}` },
          { text: '❌ Відхилити', callback_data: `vacation_hr_reject_${requestId}` }
        ]);
      }
      
      await this.sendMessage(this.HR_CHAT_ID, message, keyboard);
      
      await this.logUserData(user.telegramId, 'hr_notification', {
        requestId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        days,
        department: user.department,
        team: user.team,
        hasConflicts: conflicts.length > 0,
        conflictsCount: conflicts.length,
        canApprove
      });
    } catch (error) {
      logger.error('Error in notifyHRAboutVacationRequest', error, { requestId });
    }
  }

  /**
   * Повідомляє HR про відмову відпустки (недостатньо днів)
   */
  async notifyHRAboutVacationDenial(user, startDate, endDate, days, remainingDays) {
    try {
      if (!this.HR_CHAT_ID) return;
      
      let message = `🚨 <b>СПРОБА ВЗЯТИ ВІДПУСТКУ БЕЗ ДОСТАТНЬОЇ КІЛЬКОСТІ ДНІВ</b>\n\n`;
      message += `👤 <b>Співробітник:</b> ${user.fullName}\n`;
      message += `🏢 <b>Відділ:</b> ${user.department}\n`;
      if (user.team) message += `👥 <b>Команда:</b> ${user.team}\n`;
      message += `📅 <b>Запитуваний період:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n`;
      message += `📊 <b>Запитано днів:</b> ${days}\n`;
      message += `💰 <b>Залишилось днів:</b> ${remainingDays}\n\n`;
      message += `⚠️ <b>Відпустку автоматично відмовлено.</b>\n`;
      message += `Користувачу відправлено повідомлення з проханням звернутися до HR.\n\n`;
      message += `💡 <b>Рекомендація:</b> Перевірте баланс відпусток та можливість надання додаткових днів.`;
      
      await this.sendMessage(this.HR_CHAT_ID, message);
      
      await this.logUserData(user.telegramId, 'hr_vacation_denial_notification', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        days,
        remainingDays,
        department: user.department,
        team: user.team
      });
    } catch (error) {
      logger.error('Error in notifyHRAboutVacationDenial', error);
    }
  }

  /**
   * Повідомляє HR про екстрену відпустку
   */
  async notifyHRAboutEmergencyVacation(user, requestId, startDate, endDate, days, reason) {
    try {
      if (!this.HR_CHAT_ID) {
        logger.warn('HR_CHAT_ID not set, cannot notify HR about emergency vacation', { requestId });
        throw new TelegramError('HR_CHAT_ID не встановлено. Неможливо відправити повідомлення HR.');
      }
      
      const startDateObj = startDate instanceof Date ? startDate : new Date(startDate);
      const endDateObj = endDate instanceof Date ? endDate : new Date(endDate);
      
      if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        throw new ValidationError('Невірні дати для екстреної відпустки.', 'dates');
      }
      
      let message = `🚨 <b>ЕКСТРЕНА ВІДПУСТКА</b>\n\n`;
      message += `👤 <b>Співробітник:</b> ${user.fullName || 'Невідомо'}\n`;
      message += `🏢 <b>Відділ:</b> ${user.department || 'Невідомо'}\n`;
      message += `👥 <b>Команда:</b> ${user.team || 'Невідомо'}\n`;
      message += `📅 <b>Період:</b> ${formatDate(startDateObj)} - ${formatDate(endDateObj)}\n`;
      message += `📊 <b>Днів:</b> ${days}\n`;
      message += `🆔 <b>ID заявки:</b> ${requestId}\n\n`;
      message += `🔒 <b>КОНФІДЕНЦІЙНА ІНФОРМАЦІЯ</b>\n`;
      message += `📝 <b>Причина:</b> ${reason || 'Не вказано'}\n\n`;
      message += `⚠️ Ця інформація доступна тільки HR і CEO агенції.\n\n`;
      message += `⏳ <b>Потребує негайного розгляду</b>`;
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Підтвердити', callback_data: `vacation_hr_approve_${requestId}` },
            { text: '❌ Відхилити', callback_data: `vacation_hr_reject_${requestId}` }
          ]
        ]
      };
      
      await this.sendMessage(this.HR_CHAT_ID, message, keyboard);
      
      logger.success('HR notified about emergency vacation', { 
        requestId, 
        hrChatId: this.HR_CHAT_ID,
        userTelegramId: user.telegramId 
      });
      
      await this.logUserData(user.telegramId, 'emergency_vacation_hr_notification', {
        requestId,
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
        days,
        hasReason: !!reason
      });
    } catch (error) {
      logger.error('Error in notifyHRAboutEmergencyVacation', error, { 
        requestId, 
        userTelegramId: user?.telegramId,
        hrChatId: this.HR_CHAT_ID 
      });
      throw error;
    }
  }

  /**
   * Повідомляє HR про конфлікт відпусток
   */
  async notifyHRAboutConflict(user, conflicts, startDate, endDate) {
    try {
      if (!this.HR_CHAT_ID) return;
      
      let message = `⚠️ <b>КОНФЛІКТ ВІДПУСТОК</b>\n\n👤 <b>Співробітник:</b> ${user.fullName} (${user.department}/${user.team})\n📅 <b>Запитувана дата:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n\n🔄 <b>Перетини з:</b>\n`;
      
      conflicts.forEach(conflict => {
        message += `• ${conflict.fullName} (${conflict.department}/${conflict.team}): ${conflict.startDate} - ${conflict.endDate}\n`;
      });
      
      await this.sendMessage(this.HR_CHAT_ID, message);
    } catch (error) {
      logger.error('Error in notifyHRAboutConflict', error);
    }
  }

  /**
   * Повідомляє PM про спізнення
   */
  async notifyPMAboutLate(user, date, time, reason) {
    try {
      const pm = await this.getPMForUser(user);
      if (!pm || !pm.telegramId) return;
      
      const message = `⏰ <b>Спізнення</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ/Команда:</b> ${user.department}/${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}\n⏰ <b>Час початку:</b> ${time}\n📝 <b>Причина:</b> ${reason}`;
      await this.sendMessage(pm.telegramId, message);
    } catch (error) {
      logger.error('Error in notifyPMAboutLate', error);
    }
  }

  /**
   * Повідомляє HR про спізнення
   */
  async notifyHRAboutLate(user, date, time, reason, hasPM) {
    try {
      if (!this.HR_CHAT_ID) return;
      
      const message = `⏰ <b>ПОВІДОМЛЕННЯ ПРО СПІЗНЕННЯ</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ:</b> ${user.department}\n👥 <b>Команда:</b> ${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}\n⏰ <b>Час початку роботи:</b> ${time}\n📝 <b>Причина:</b> ${reason}\n\n${hasPM ? '✅ PM вже повідомлено' : '⚠️ PM не призначено'}`;
      await this.sendMessage(this.HR_CHAT_ID, message);
    } catch (error) {
      logger.error('Error in notifyHRAboutLate', error);
    }
  }

  /**
   * Повідомляє про перевищення спізнень (>=7)
   */
  async notifyAboutExcessiveLates(telegramId, user, lateCount) {
    try {
      const message = `🚨 <b>УВАГА! ПЕРЕВИЩЕННЯ ЛІМІТУ СПІЗНЕНЬ</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ:</b> ${user.department}\n👥 <b>Команда:</b> ${user.team}\n⏰ <b>Кількість спізнень за місяць:</b> ${lateCount}\n⚠️ <b>Ліміт:</b> 7 спізнень/місяць\n\nПотрібна увага!`;
      
      await this.sendMessage(telegramId, `🚨 <b>УВАГА!</b>\n\nКількість ваших спізнень за місяць перевищує ліміт (${lateCount} з 7). Будь ласка, зверніть увагу на своїй пунктуальності.`);
      
      if (this.HR_CHAT_ID) {
        await this.sendMessage(this.HR_CHAT_ID, message);
      }
      
      await this.notifyAllCEOAboutExcessiveLates(user, lateCount);
      
      logger.info('Excessive lates notified', { telegramId, lateCount });
    } catch (error) {
      logger.error('Error in notifyAboutExcessiveLates', error);
    }
  }

  /**
   * Повідомляє всіх CEO про перевищення спізнень
   */
  async notifyAllCEOAboutExcessiveLates(user, lateCount) {
    try {
      if (!this.doc) return;
      
      await this.doc.loadInfo();
      let rolesSheet = this.doc.sheetsByTitle['Roles'];
      if (!rolesSheet) return;
      
      const rows = await rolesSheet.getRows();
      const ceoRows = rows.filter(row => {
        const role = row.get('Role');
        return role === 'CEO';
      });
      
      const message = `🚨 <b>УВАГА! ПЕРЕВИЩЕННЯ ЛІМІТУ СПІЗНЕНЬ</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ:</b> ${user.department}\n👥 <b>Команда:</b> ${user.team}\n⏰ <b>Кількість спізнень за місяць:</b> ${lateCount}\n⚠️ <b>Ліміт:</b> 7 спізнень/місяць\n\nПотрібна увага!`;
      
      for (const ceoRow of ceoRows) {
        const ceoTelegramId = parseInt(ceoRow.get('TelegramID'));
        if (ceoTelegramId && !isNaN(ceoTelegramId)) {
          try {
            await this.sendMessage(ceoTelegramId, message);
          } catch (error) {
            logger.error('Error sending message to CEO', error, { ceoTelegramId });
          }
        }
      }
    } catch (error) {
      logger.error('Error in notifyAllCEOAboutExcessiveLates', error);
    }
  }

  /**
   * Повідомляє про закінчення днів відпустки
   */
  async notifyAboutVacationDaysExhausted(telegramId, user) {
    try {
      const message = `⚠️ <b>УВАГА! ЗАКІНЧИЛИСЬ ДНІ ВІДПУСТКИ</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ:</b> ${user.department}\n👥 <b>Команда:</b> ${user.team}\n\nУ співробітника залишилось 0 днів відпустки. Потрібна увага HR.`;
      
      await this.sendMessage(telegramId, `⚠️ <b>Увага!</b>\n\nУ вас закінчились дні відпустки. Будь ласка, зверніться до HR для уточнення.`);
      
      if (this.HR_CHAT_ID) {
        await this.sendMessage(this.HR_CHAT_ID, message);
      }
      
      logger.info('Vacation days exhausted notified', { telegramId });
    } catch (error) {
      logger.error('Error in notifyAboutVacationDaysExhausted', error);
    }
  }

  /**
   * Повідомляє PM про Remote роботу
   */
  async notifyPMAboutRemote(user, date) {
    try {
      const pm = await this.getPMForUser(user);
      if (!pm || !pm.telegramId) return;
      
      const message = `🏠 <b>Remote робота</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ/Команда:</b> ${user.department}/${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}`;
      await this.sendMessage(pm.telegramId, message);
    } catch (error) {
      logger.error('Error in notifyPMAboutRemote', error);
    }
  }

  /**
   * Повідомляє HR про Remote роботу
   */
  async notifyHRAboutRemote(user, date, hasPM) {
    try {
      if (!this.HR_CHAT_ID) return;
      
      const message = `🏠 <b>REMOTE РОБОТА</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ:</b> ${user.department}\n👥 <b>Команда:</b> ${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}\n\n${hasPM ? '✅ PM вже повідомлено' : '⚠️ PM не призначено'}`;
      await this.sendMessage(this.HR_CHAT_ID, message);
    } catch (error) {
      logger.error('Error in notifyHRAboutRemote', error);
    }
  }

  /**
   * Повідомляє PM про лікарняний
   */
  async notifyPMAboutSick(user, date) {
    try {
      const pm = await this.getPMForUser(user);
      if (!pm || !pm.telegramId) return;
      
      const message = `🏥 <b>Лікарняний</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ/Команда:</b> ${user.department}/${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}`;
      await this.sendMessage(pm.telegramId, message);
    } catch (error) {
      logger.error('Error in notifyPMAboutSick', error);
    }
  }

  /**
   * Повідомляє HR про лікарняний
   */
  async notifyHRAboutSick(user, date, hasPM) {
    try {
      if (!this.HR_CHAT_ID) return;
      
      const message = `🏥 <b>ЛІКАРНЯНИЙ</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ:</b> ${user.department}\n👥 <b>Команда:</b> ${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}\n\n${hasPM ? '✅ PM вже повідомлено' : '⚠️ PM не призначено'}`;
      await this.sendMessage(this.HR_CHAT_ID, message);
    } catch (error) {
      logger.error('Error in notifyHRAboutSick', error);
    }
  }
}

module.exports = NotificationService;

