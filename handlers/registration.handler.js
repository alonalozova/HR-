/**
 * 📝 REGISTRATION HANDLER
 * Обробник UI для реєстрації користувачів
 */

const logger = require('../utils/logger');
const { ValidationError } = require('../utils/errors');
const { validateRegistrationData, validateTelegramId } = require('../utils/validation');
const { registrationLimiter } = require('../utils/rateLimiter');

class RegistrationHandler {
  constructor(dependencies) {
    this.sendMessage = dependencies.sendMessage;
    this.getUserInfo = dependencies.getUserInfo;
    this.getUserRole = dependencies.getUserRole;
    this.navigationStack = dependencies.navigationStack;
    this.registrationCache = dependencies.registrationCache;
    this.userCache = dependencies.userCache;
    this.doc = dependencies.doc;
    this.sheetsQueue = dependencies.sheetsQueue;
    this.formatDate = dependencies.formatDate;
    this.determineRoleByPositionAndDepartment = dependencies.determineRoleByPositionAndDepartment;
    this.saveUserRole = dependencies.saveUserRole;
    this.bot = dependencies.bot;
  }

  /**
   * Показує welcome повідомлення
   */
  async showWelcomeMessage(chatId, telegramId, username, firstName, lastName) {
    try {
      const text = `🌟 <b>Ласкаво просимо до HR Бота!</b>

👋 <b>Привіт, ${firstName || 'колега'}!</b>

Я допоможу вам:
🏖️ Подавати заявки на відпустку
🏠 Повідомляти про Remote роботу
⏰ Повідомляти про спізнення
🏥 Повідомляти про лікарняний
📊 Переглядати свою статистику

<b>Для початку роботи потрібна реєстрація.</b>

Натисніть кнопку нижче, щоб почати:`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📝 Почати реєстрацію', callback_data: 'start_registration' }
          ]
        ]
      };

      await this.sendMessage(chatId, text, keyboard);
    } catch (error) {
      logger.error('Error in showWelcomeMessage', error, { telegramId });
    }
  }

  /**
   * Починає процес реєстрації
   */
  async startRegistration(chatId, telegramId, username, firstName, lastName) {
    try {
      this.registrationCache.set(telegramId, {
        step: 'department',
        data: {
          username,
          firstName,
          lastName
        }
      });

      const text = `📝 <b>Реєстрація</b>

👋 <b>Привіт, ${firstName || 'колега'}!</b>

Для початку роботи з ботом потрібно заповнити ваші дані.

<b>Крок 1 з 7:</b> Оберіть відділ:`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📢 Marketing', callback_data: 'department_Marketing' },
            { text: '🎨 Design', callback_data: 'department_Design' }
          ],
          [
            { text: '📱 SMM', callback_data: 'department_SMM' },
            { text: '💼 Sales', callback_data: 'department_Sales and communication' }
          ],
          [
            { text: '👥 HR', callback_data: 'department_HR' },
            { text: '👑 CEO', callback_data: 'department_CEO' }
          ]
        ]
      };

      await this.sendMessage(chatId, text, keyboard);
    } catch (error) {
      logger.error('Error in startRegistration', error, { telegramId });
    }
  }

  /**
   * Обробляє вибір відділу
   */
  async handleDepartmentSelection(chatId, telegramId, department) {
    try {
      const regData = this.registrationCache.get(telegramId);
      if (!regData) {
        await this.sendMessage(chatId, '❌ Помилка: дані реєстрації не знайдені. Почніть спочатку через /start');
        return;
      }

      regData.data.department = department;
      regData.step = 'team';
      this.registrationCache.set(telegramId, regData);

      const teams = this.getTeamsForDepartment(department);
      
      const keyboard = {
        inline_keyboard: teams.map(team => [
          { text: team, callback_data: `team_${team}` }
        ])
      };

      await this.sendMessage(chatId, `✅ <b>Відділ:</b> ${department}\n\n<b>Крок 2 з 7:</b> Оберіть команду:`, keyboard);
    } catch (error) {
      logger.error('Error in handleDepartmentSelection', error, { telegramId });
    }
  }

  /**
   * Обробляє вибір команди
   */
  async handleTeamSelection(chatId, telegramId, team) {
    try {
      const regData = this.registrationCache.get(telegramId);
      if (!regData) {
        await this.sendMessage(chatId, '❌ Помилка: дані реєстрації не знайдені. Почніть спочатку через /start');
        return;
      }

      regData.data.team = team;
      regData.step = 'position';
      this.registrationCache.set(telegramId, regData);

      const positions = this.getPositionsForTeam(regData.data.department, team);
      
      const keyboard = {
        inline_keyboard: positions.map(position => [
          { text: position, callback_data: `position_${position}` }
        ])
      };

      await this.sendMessage(chatId, `✅ <b>Команда:</b> ${team}\n\n<b>Крок 3 з 7:</b> Оберіть посаду:`, keyboard);
    } catch (error) {
      logger.error('Error in handleTeamSelection', error, { telegramId });
    }
  }

  /**
   * Обробляє вибір посади
   */
  async handlePositionSelection(chatId, telegramId, position) {
    try {
      const regData = this.registrationCache.get(telegramId);
      if (!regData) {
        await this.sendMessage(chatId, '❌ Помилка: дані реєстрації не знайдені. Почніть спочатку через /start');
        return;
      }

      regData.data.position = position;
      regData.step = 'name';
      this.registrationCache.set(telegramId, regData);

      await this.sendMessage(chatId, `✅ <b>Посада:</b> ${position}\n\n<b>Крок 4 з 7:</b> Введіть ваше ім'я:`);
    } catch (error) {
      logger.error('Error in handlePositionSelection', error, { telegramId });
    }
  }

  /**
   * Завершує реєстрацію
   */
  async completeRegistration(chatId, telegramId, data) {
    try {
      // Rate limiting для реєстрації
      if (!registrationLimiter.canProceed(telegramId)) {
        logger.warn('Rate limit exceeded for registration', { telegramId });
        await this.sendMessage(chatId, '⏳ Занадто багато спроб реєстрації. Будь ласка, зачекайте 5 хвилин.');
        return;
      }
      
      // Валідація даних реєстрації
      try {
        validateRegistrationData(data);
        validateTelegramId(telegramId);
      } catch (error) {
        logger.warn('Registration validation failed', { telegramId, error: error.message });
        await this.sendMessage(chatId, `❌ ${error.message}. Будь ласка, почніть реєстрацію спочатку через /start`);
        return;
      }
      
      const fullName = `${data.name} ${data.surname}`;
      
      logger.info('Completing registration', { telegramId, department: data.department, team: data.team, position: data.position });
      
      // Зберігаємо дані в Google Sheets
      return await this.sheetsQueue.add(async () => {
        await this.doc.loadInfo();
        
        // Отримуємо або створюємо лист "Працівники"
        let employeesSheet = this.doc.sheetsByTitle['Працівники'] || this.doc.sheetsByTitle['Employees'];
        if (!employeesSheet) {
          employeesSheet = await this.doc.addSheet({
            title: 'Працівники',
            headerValues: ['TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 'Посада', 'Дата народження', 'Перший робочий день', 'Режим роботи', 'PM']
          });
        }
        
        const rows = await employeesSheet.getRows();
        const existingUser = rows.find(row => row.get('TelegramID') == telegramId);
        
        if (existingUser) {
          // Оновлюємо існуючого користувача
          existingUser.set('Ім\'я та прізвище', fullName);
          existingUser.set('Відділ', data.department);
          existingUser.set('Команда', data.team);
          existingUser.set('Посада', data.position);
          existingUser.set('Дата народження', data.birthDate);
          existingUser.set('Перший робочий день', data.firstWorkDay);
          await existingUser.save();
          logger.info('User updated in Google Sheets', { telegramId });
        } else {
          // Додаємо нового користувача
          await employeesSheet.addRow({
            'TelegramID': telegramId,
            'Ім\'я та прізвище': fullName,
            'Відділ': data.department,
            'Команда': data.team,
            'Посада': data.position,
            'Дата народження': data.birthDate,
            'Перший робочий день': data.firstWorkDay,
            'Режим роботи': 'Hybrid'
          });
          logger.info('User added to Google Sheets', { telegramId });
        }
        
        // Визначаємо та зберігаємо роль
        const determinedRole = this.determineRoleByPositionAndDepartment(data.position, data.department);
        await this.saveUserRole(telegramId, determinedRole, data.position, data.department);
        
        // Очищаємо кеш та завантажуємо дані
        this.userCache.delete(telegramId);
        this.registrationCache.delete(telegramId);
        
        // Невелика затримка для синхронізації
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const user = await this.getUserInfo(telegramId);
        if (user) {
          this.userCache.set(telegramId, user);
        }
        
        await this.sendMessage(chatId, `✅ <b>Реєстрацію завершено!</b>\n\n👤 <b>Ім'я:</b> ${fullName}\n🏢 <b>Відділ:</b> ${data.department}\n👥 <b>Команда:</b> ${data.team}\n💼 <b>Посада:</b> ${data.position}\n\nТепер ви можете користуватися всіма функціями бота!`);
      });
    } catch (error) {
      logger.error('Error in completeRegistration', error, { telegramId });
      await this.sendMessage(chatId, '❌ Помилка реєстрації. Спробуйте пізніше або зверніться до HR.');
    }
  }

  /**
   * Отримує список команд для відділу
   */
  getTeamsForDepartment(department) {
    const teamsMap = {
      'Marketing': ['PPC', 'Target/Kris team', 'Target/Lera team'],
      'Design': ['Head of Design', 'Motion Designer', 'Static designer', 'Video designer', 'SMM designer'],
      'SMM': ['Head of SMM', 'SMM specialist', 'Producer', 'PM'],
      'Sales and communication': ['Sales and communication manager'],
      'HR': ['HR'],
      'CEO': ['CEO']
    };
    return teamsMap[department] || [];
  }

  /**
   * Отримує список посад для команди
   */
  getPositionsForTeam(department, team) {
    const positionsMap = {
      'Marketing': {
        'PPC': ['PPC', 'PM PPC'],
        'Target/Kris team': ['Team lead', 'PM target'],
        'Target/Lera team': ['Team lead', 'PM target']
      },
      'Design': {
        'Head of Design': ['Head of Design'],
        'Motion Designer': ['Motion Designer'],
        'Static designer': ['Static designer'],
        'Video designer': ['Video designer'],
        'SMM designer': ['SMM designer']
      },
      'SMM': {
        'Head of SMM': ['Head of SMM'],
        'SMM specialist': ['SMM specialist'],
        'Producer': ['Producer'],
        'PM': ['PM']
      },
      'Sales and communication': {
        'Sales and communication manager': ['Sales and communication manager']
      },
      'HR': {
        'HR': ['HR']
      },
      'CEO': {
        'CEO': ['CEO']
      }
    };
    return positionsMap[department]?.[team] || [];
  }
}

module.exports = RegistrationHandler;

