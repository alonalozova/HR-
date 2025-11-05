/**
 * 🏢 HR БОТ - ПОВНА КОМЕРЦІЙНА ВЕРСІЯ
 * Всі функції згідно з детальними вимогами користувача
 * Railway Deployment Ready
 */

// ✅ TYPESCRIPT TYPES ДЛЯ TYPE SAFETY (JSDoc)
/**
 * @typedef {Object} User
 * @property {number} telegramId - Telegram ID користувача
 * @property {string} fullName - Повне ім'я користувача
 * @property {string} department - Відділ (Marketing, Design, SMM, Sales, HR, CEO)
 * @property {string} team - Команда (PPC Team, Target/Kris Team, Target/Lera Team, etc.)
 * @property {string} position - Посада (PM, PPC Specialist, Designer, etc.)
 * @property {Date|string} birthDate - Дата народження
 * @property {Date|string} firstWorkDay - Перший робочий день
 * @property {'Hybrid'|'Remote'|'Office'} workMode - Режим роботи
 * @property {boolean} [isRegistered] - Чи зареєстрований користувач
 * @property {UserRole} [role] - Роль користувача
 * @property {Date} [createdAt] - Дата створення запису
 * @property {Date} [updatedAt] - Дата оновлення запису
 */

/**
 * @typedef {Object} VacationRequest
 * @property {string} requestId - Унікальний ID заявки
 * @property {number} userId - Telegram ID користувача
 * @property {Date|string} startDate - Дата початку відпустки
 * @property {Date|string} endDate - Дата закінчення відпустки
 * @property {number} days - Кількість днів відпустки (1-7)
 * @property {'pending_pm'|'pending_hr'|'approved'|'rejected'} status - Статус заявки
 * @property {'regular'|'emergency'|'sick_leave'} [requestType] - Тип заявки
 * @property {string} [reason] - Причина відпустки
 * @property {Date} [createdAt] - Дата створення заявки
 * @property {Date} [updatedAt] - Дата оновлення заявки
 * @property {number} [approvedBy] - Telegram ID хто затвердив
 * @property {number} [rejectedBy] - Telegram ID хто відхилив
 * @property {string} [rejectionReason] - Причина відхилення
 */

/**
 * @typedef {Object} UserRole
 * @property {'employee'|'team_lead'|'hr_admin'|'founder'} level - Рівень ролі
 * @property {Permission[]} [permissions] - Список дозволів
 */

/**
 * @typedef {Object} Permission
 * @property {string} action - Дія (approve, view, edit, delete)
 * @property {string} resource - Ресурс (vacation, reports, users)
 * @property {boolean} allowed - Чи дозволено
 */

/**
 * @typedef {'Hybrid'|'Remote'|'Office'} WorkMode
 */

/**
 * @typedef {'pending_pm'|'pending_hr'|'approved'|'rejected'|'cancelled'} VacationStatus
 */

require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
// const Groq = require('groq-sdk'); // Тимчасово відключено

// ✅ ПРОФЕСІЙНА ОБРОБКА ПОМИЛОК
class AppError extends Error {
  constructor(message, statusCode, isOperational = true, context = {}) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, true, { field });
    this.name = 'ValidationError';
  }
}

class DatabaseError extends AppError {
  constructor(message, operation = null) {
    super(message, 500, false, { operation });
    this.name = 'DatabaseError';
  }
}

class TelegramError extends AppError {
  constructor(message, chatId = null) {
    super(message, 500, true, { chatId });
    this.name = 'TelegramError';
  }
}

// 📊 ЛОГЕР ДЛЯ ПОМИЛОК
const logger = {
  info: (message, context = {}) => {
    console.log(`ℹ️ ${new Date().toISOString()} - ${message}`, context);
  },
  warn: (message, context = {}) => {
    console.warn(`⚠️ ${new Date().toISOString()} - ${message}`, context);
  },
  error: (message, error = null, context = {}) => {
    console.error(`❌ ${new Date().toISOString()} - ${message}`, error, context);
  },
  success: (message, context = {}) => {
    console.log(`✅ ${new Date().toISOString()} - ${message}`, context);
  }
};

// ⚙️ НАЛАШТУВАННЯ
const BOT_TOKEN = process.env.BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const HR_CHAT_ID = process.env.HR_CHAT_ID;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!BOT_TOKEN) {
  console.error('❌ Відсутній BOT_TOKEN!');
  process.exit(1);
}

// Попередження про відсутні змінні
if (!SPREADSHEET_ID) console.warn('⚠️ SPREADSHEET_ID не встановлено');
if (!HR_CHAT_ID) {
  console.warn('⚠️ HR_CHAT_ID не встановлено');
  console.warn('📝 Для отримання заявок на відпустку встановіть HR_CHAT_ID в Railway');
} else {
  console.log('✅ HR_CHAT_ID налаштовано:', HR_CHAT_ID);
}

// ✅ Оптимізований кеш з TTL та лімітами розміру
class CacheWithTTL {
  constructor(maxSize = 1000, ttl = 5 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
  
  set(key, value) {
    // Видаляємо найстаріший елемент, якщо досягли ліміту
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      data: value,
      timestamp: Date.now()
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // Перевіряємо TTL
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }
  
  has(key) {
    const item = this.cache.get(key);
    if (!item) return false;
    
    // Перевіряємо TTL
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
  
  delete(key) {
    return this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
  }
  
  size() {
    return this.cache.size;
  }
}

// 🤖 ІНІЦІАЛІЗАЦІЯ
const bot = new TelegramBot(BOT_TOKEN);
const app = express();
let doc;

// 🧠 AI Система (проста, але працює)
console.log('✅ AI система активна (проста база знань)');

// 🛡️ ОПТИМІЗОВАНИЙ ЗАХИСТ ВІД ДУБЛЮВАННЯ
const processedUpdates = new CacheWithTTL(1000, 2 * 60 * 1000); // 1000 запитів, 2 хвилини

// 💾 ОПТИМІЗОВАНИЙ КЕШ
const userCache = new CacheWithTTL(500, 10 * 60 * 1000); // 500 користувачів, 10 хвилин
const registrationCache = new CacheWithTTL(100, 15 * 60 * 1000); // 100 реєстрацій, 15 хвилин

// 📊 МОНІТОРИНГ КЕШУ (кожні 10 хвилин)
setInterval(() => {
  console.log(`📊 Кеш статистика: userCache=${userCache.size()}, registrationCache=${registrationCache.size()}, processedUpdates=${processedUpdates.size()}`);
}, 10 * 60 * 1000);

// 🏗️ СТРУКТУРА КОМАНДИ
const DEPARTMENTS = {
  'Marketing': {
    'PPC': ['PPC', 'PM PPC'],
    'Target': {
      'Kris team': ['Team lead', 'PM target'],
      'Lera team': ['Team lead', 'PM target']
    }
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

// 📊 ІНІЦІАЛІЗАЦІЯ GOOGLE SHEETS
async function initGoogleSheets() {
  try {
    if (!SPREADSHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.warn('⚠️ Google Sheets credentials не встановлено');
      return false;
    }
    
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    console.log('✅ Google Sheets підключено:', doc.title);
    return true;
  } catch (error) {
    console.warn('⚠️ Google Sheets недоступні:', error.message);
    doc = null;
    return false;
  }
}

// 🚀 EXPRESS
app.use(express.json());

// Health check endpoints
app.get('/', (req, res) => {
  // Тимчасово без rate limiting для Railway healthcheck
  const userAgent = req.get('User-Agent') || '';
  const isRailwayHealth = userAgent.includes('Railway') || userAgent.includes('railway');
  
  console.log('Health check request', { 
    userAgent, 
    isRailwayHealth, 
    ip: req.ip,
    url: req.url 
  });
  
  if (isRailwayHealth) {
    // Швидкий відгук для Railway без rate limiting
    console.log('Railway health check - bypassing rate limit');
    return res.status(200).json({
      status: 'OK',
      message: 'HR Bot Ultimate is running',
      timestamp: new Date().toISOString(),
      version: '3.0.0-ultimate-railway-fix',
      sheets_connected: doc ? true : false,
      uptime: process.uptime()
    });
  }
  
  // Для звичайних запитів
  console.log('Regular health check');
  res.status(200).json({
    status: 'OK',
    message: 'HR Bot Ultimate is running',
    timestamp: new Date().toISOString(),
    version: '3.0.0-ultimate',
    sheets_connected: doc ? true : false,
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  
  // Швидко відповідаємо Telegram, щоб він не повторював запит
  // ВАЖЛИВО: Відповідаємо ОДРАЗУ перед будь-якою обробкою
  res.status(200).send('OK');
  
  try {
    const update = req.body;
    
    // Перевірка наявності body
    if (!update || !update.update_id) {
      console.log('⚠️ Порожній або невалідний update');
      return;
    }
    
    // Логування для діагностики
    console.log('📨 Webhook отримано:', JSON.stringify({
      update_id: update.update_id,
      has_message: !!update.message,
      has_callback: !!update.callback_query,
      message_text: update.message?.text?.substring(0, 50),
      message_from_id: update.message?.from?.id,
      message_chat_id: update.message?.chat?.id
    }));
    
    // Перевірка на дублювання
    const updateIdStr = String(update.update_id);
    if (processedUpdates.has(updateIdStr)) {
      console.log('⚠️ Дублікат update_id:', updateIdStr);
      return;
    }
    
    // Додаємо в кеш (використовуємо set, а не add!)
    processedUpdates.set(updateIdStr, true);
    
    // Обробка повідомлення (асинхронно, неблокуюче)
    if (update.message) {
      const message = update.message;
      console.log('📝 Обробка повідомлення від:', message.from?.id, 'текст:', message.text?.substring(0, 50));
      
      // Обробляємо асинхронно, неблокуюче
      processMessage(message).catch(error => {
        console.error('❌ Помилка обробки повідомлення:', error);
        console.error('❌ Stack:', error.stack);
        console.error('❌ Message details:', JSON.stringify({
          chat_id: message.chat?.id,
          from_id: message.from?.id,
          text: message.text?.substring(0, 100)
        }));
      });
    } else if (update.callback_query) {
      const callback = update.callback_query;
      console.log('🔘 Обробка callback від:', callback.from?.id, 'data:', callback.data);
      
      // Обробляємо асинхронно, неблокуюче
      processCallback(callback).catch(error => {
        console.error('❌ Помилка обробки callback:', error);
        console.error('❌ Stack:', error.stack);
      });
    } else {
      console.log('⚠️ Невідомий тип update:', Object.keys(update));
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Webhook оброблено за ${duration}ms`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Webhook error:', error);
    console.error('❌ Stack:', error.stack);
    console.error(`❌ Помилка після ${duration}ms`);
    // Вже відправили OK, тому просто логуємо помилку
  }
});

// 📨 ОБРОБКА ПОВІДОМЛЕНЬ
async function processMessage(message) {
  try {
    // Перевірка наявності обов'язкових полів
    if (!message || !message.chat || !message.from) {
      console.error('❌ Невалідне повідомлення:', JSON.stringify(message));
      return;
    }
    
    const chatId = message.chat.id;
    const text = message.text || '';
    const telegramId = message.from.id;
    const username = message.from.username;
    const firstName = message.from.first_name;
    const lastName = message.from.last_name;
    
    console.log(`📨 Повідомлення від ${telegramId}: ${text.substring(0, 50)}`);
    
    // Перевірка на дублювання (використовуємо update_id з webhook, тут не потрібно)
    
    if (text === '/start') {
      console.log('🟢 Обробка команди /start для користувача:', telegramId);
      try {
        const user = await getUserInfo(telegramId);
        console.log('👤 Користувач знайдено:', user ? 'так' : 'ні');
        if (!user) {
          console.log('📝 Показуємо welcome message');
          await showWelcomeMessage(chatId, telegramId, username, firstName, lastName);
        } else {
          console.log('📋 Показуємо головне меню');
          await showMainMenu(chatId, telegramId);
        }
      } catch (error) {
        console.error('❌ Помилка обробки /start:', error);
        console.error('❌ Stack:', error.stack);
        await sendMessage(chatId, '❌ Помилка при обробці команди. Спробуйте ще раз.');
      }
      return;
    }
    
    // Обробка Reply Keyboard кнопок
    if (await handleReplyKeyboard(chatId, telegramId, text)) {
      return;
    }
    
    // Обробка відпусток (пріоритет над реєстрацією)
    console.log('🔍 processMessage: Перевіряємо handleVacationProcess для', telegramId, 'текст:', text);
    if (await handleVacationProcess(chatId, telegramId, text)) {
      console.log('✅ handleVacationProcess обробив повідомлення');
      return;
    }
    
    // Обробка спізнень
    if (await handleLateProcess(chatId, telegramId, text)) {
      return;
    }
    
    // Обробка Remote
    if (await handleRemoteProcess(chatId, telegramId, text)) {
      return;
    }
    
    // Обробка лікарняного
    if (await handleSickProcess(chatId, telegramId, text)) {
      return;
    }
    
    // Обробка реєстрації
    if (registrationCache.has(telegramId)) {
      await handleRegistrationStep(chatId, telegramId, text);
      return;
    }
    
    // Обробка розсилки HR
    if (await handleHRMailing(chatId, telegramId, text)) {
      return;
    }
    
    // AI помічник видалено
    
    await sendMessage(chatId, '❓ Оберіть дію з меню нижче.');
    
  } catch (error) {
    console.error('❌ Помилка processMessage:', error);
  }
}

// 🔘 ОБРОБКА CALLBACK QUERY
async function processCallback(callbackQuery) {
  try {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    console.log(`🎛️ Callback від ${telegramId}: ${data}`);
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
    // Маршрутизація callback'ів
    const routes = {
      'vacation_apply': () => showVacationForm(chatId, telegramId),
      'vacation_balance': () => showVacationBalance(chatId, telegramId),
      'vacation_requests': () => showMyVacationRequests(chatId, telegramId),
      'vacation_emergency': () => showEmergencyVacationForm(chatId, telegramId),
      'remote_today': () => setRemoteToday(chatId, telegramId),
      'remote_calendar': () => showRemoteCalendar(chatId, telegramId),
      'remote_stats': () => showRemoteStats(chatId, telegramId),
      'late_report': () => reportLate(chatId, telegramId),
      'late_stats': () => showLateStats(chatId, telegramId),
      'sick_report': () => reportSick(chatId, telegramId),
      'sick_stats': () => showSickStats(chatId, telegramId),
      'stats_monthly': () => showMonthlyStats(chatId, telegramId),
      'stats_export': () => exportMyData(chatId, telegramId),
      'onboarding_new': () => showNewEmployeeMenu(chatId, telegramId),
      'onboarding_notion': () => showNotionLink(chatId, telegramId),
      'onboarding_quiz': () => showOnboardingQuiz(chatId, telegramId),
      'suggestions_anonymous': () => showAnonymousSuggestionsForm(chatId, telegramId),
      'suggestions_named': () => showNamedSuggestionsForm(chatId, telegramId),
      'suggestions_view': () => showMySuggestions(chatId, telegramId),
      'asap_form': () => showASAPForm(chatId, telegramId),
      'faq_category': () => showFAQCategory(chatId, telegramId),
      // AI помічник видалено
      'approvals_vacations': () => showApprovalVacations(chatId, telegramId),
      'approvals_remote': () => showApprovalRemote(chatId, telegramId),
      'analytics_hr': () => showHRAnalytics(chatId, telegramId),
      'analytics_ceo': () => showCEOAnalytics(chatId, telegramId),
      'hr_mailings': () => showMailingsMenu(chatId, telegramId),
      'hr_export': () => showHRExportMenu(chatId, telegramId),
      'hr_export_employee': () => showHRExportEmployee(chatId, telegramId),
      'hr_export_department': () => showHRExportDepartment(chatId, telegramId),
      'ceo_export': () => showCEOExportMenu(chatId, telegramId),
      'ceo_export_employee': () => showCEOExportEmployee(chatId, telegramId),
      'ceo_export_department': () => showCEOExportDepartment(chatId, telegramId),
      'hr_mailing_all': () => startMailingToAll(chatId, telegramId),
      'hr_mailing_department': () => startMailingToDepartment(chatId, telegramId),
      'hr_mailing_team': () => startMailingToTeam(chatId, telegramId),
      'hr_mailing_role': () => startMailingToRole(chatId, telegramId),
      'start_registration': () => startRegistrationFromCallback(chatId, telegramId),
      'onboarding_notion': () => showNotionLink(chatId, telegramId),
      'onboarding_quiz': () => showOnboardingQuiz(chatId, telegramId),
      'onboarding_rules': () => showCompanyRules(chatId, telegramId),
      'onboarding_structure': () => showTeamStructure(chatId, telegramId),
      // AI помічник видалено
      'back_to_main': () => showMainMenu(chatId, telegramId)
    };
    
    if (routes[data]) {
      await routes[data]();
    } else if (data.startsWith('department_')) {
      const department = data.replace('department_', '');
      await handleDepartmentSelection(chatId, telegramId, department);
    } else if (data.startsWith('team_')) {
      const team = data.replace('team_', '');
      await handleTeamSelection(chatId, telegramId, team);
    } else if (data.startsWith('position_')) {
      const position = data.replace('position_', '');
      await handlePositionSelection(chatId, telegramId, position);
    } else if (data.startsWith('faq_')) {
      const faqId = data.replace('faq_', '');
      await showFAQAnswer(chatId, telegramId, faqId);
    } else if (data.startsWith('hr_export_emp_')) {
      const targetTelegramId = parseInt(data.replace('hr_export_emp_', ''));
      await exportEmployeeData(chatId, telegramId, targetTelegramId);
    } else if (data.startsWith('hr_export_dept_')) {
      const department = data.replace('hr_export_dept_', '');
      await exportDepartmentData(chatId, telegramId, department);
    } else if (data.startsWith('ceo_export_emp_')) {
      const targetTelegramId = parseInt(data.replace('ceo_export_emp_', ''));
      await exportEmployeeData(chatId, telegramId, targetTelegramId);
    } else if (data.startsWith('ceo_export_dept_')) {
      const department = data.replace('ceo_export_dept_', '');
      await exportDepartmentData(chatId, telegramId, department);
    } else if (data.startsWith('mailing_dept_')) {
      const department = data.replace('mailing_dept_', '');
      await startMailingToDepartmentSelected(chatId, telegramId, department);
    } else if (data.startsWith('mailing_team_')) {
      const team = data.replace('mailing_team_', '');
      await startMailingToTeamSelected(chatId, telegramId, team);
    } else if (data.startsWith('mailing_role_')) {
      const role = data.replace('mailing_role_', '');
      await startMailingToRoleSelected(chatId, telegramId, role);
    } else if (data.startsWith('vacation_hr_approve_')) {
      const requestId = data.replace('vacation_hr_approve_', '');
      await handleHRVacationApproval(chatId, telegramId, requestId, true);
    } else if (data.startsWith('vacation_hr_reject_')) {
      const requestId = data.replace('vacation_hr_reject_', '');
      await handleHRVacationApproval(chatId, telegramId, requestId, false);
    }
    
  } catch (error) {
    console.error('❌ Помилка processCallback:', error);
  }
}

// 📤 ВІДПРАВКА ПОВІДОМЛЕНЬ
async function sendMessage(chatId, text, keyboard = null) {
  try {
    const options = { parse_mode: 'HTML' };
    if (keyboard) {
      if (keyboard.inline_keyboard) {
        options.reply_markup = keyboard;
      } else {
        options.reply_markup = { keyboard: keyboard, resize_keyboard: true };
      }
    }
    
    await bot.sendMessage(chatId, text, options);
    logger.info('Message sent successfully', { chatId, textLength: text.length });
    
  } catch (error) {
    if (error.response?.statusCode === 403) {
      logger.warn('Bot blocked by user', { chatId });
      throw new TelegramError('Бот заблокований користувачем', chatId);
    } else if (error.response?.statusCode === 400) {
      logger.warn('Invalid message format', { chatId, error: error.response.body });
      throw new TelegramError('Невірний формат повідомлення', chatId);
    } else {
      logger.error('Failed to send message', error, { chatId });
      throw new TelegramError('Помилка відправки повідомлення', chatId);
    }
  }
}

// 👤 ОТРИМАННЯ КОРИСТУВАЧА
/**
 * Отримує інформацію про користувача з бази даних або кешу
 * @param {number} telegramId - Telegram ID користувача
 * @returns {Promise<User|null>} Інформація про користувача або null
 */
async function getUserInfo(telegramId) {
  try {
    if (userCache.has(telegramId)) {
      const cached = userCache.get(telegramId);
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return cached.data;
      }
    }
    
    if (!doc) return null;
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Employees'];
    if (!sheet) return null;
    
    const rows = await sheet.getRows();
    const user = rows.find(row => row.get('TelegramID') == telegramId);
    
    if (user) {
      const userData = {
        telegramId: parseInt(user.get('TelegramID')),
        fullName: user.get('FullName'),
        department: user.get('Department'),
        team: user.get('Team'),
        position: user.get('Position'),
        birthDate: user.get('BirthDate'),
        firstWorkDay: user.get('FirstWorkDay'),
        workMode: user.get('WorkMode'),
        pm: user.get('PM') || null
      };
      
      userCache.set(telegramId, { data: userData, timestamp: Date.now() });
      return userData;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Помилка getUserInfo:', error);
    return null;
  }
}

// 🔐 ОТРИМАННЯ РОЛІ
/**
 * Отримує роль користувача з бази даних
 * @param {number} telegramId - Telegram ID користувача
 * @returns {Promise<'EMP'|'TL'|'HR'|'CEO'>} Роль користувача
 */
async function getUserRole(telegramId) {
  try {
    if (!doc) return 'EMP';
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Roles'];
    if (!sheet) return 'EMP';
    
    const rows = await sheet.getRows();
    const role = rows.find(row => row.get('TelegramID') == telegramId);
    
    return role ? role.get('Role') : 'EMP';
  } catch (error) {
    console.error('❌ Помилка getUserRole:', error);
    return 'EMP';
  }
}

// 👤 ОТРИМАННЯ PM ДЛЯ КОРИСТУВАЧА
/**
 * Знаходить PM (Project Manager) для користувача
 * Перевіряє поле PM у користувача, або знаходить PM по градації (відділ/команда)
 * @param {User} user - Об'єкт користувача
 * @returns {Promise<{telegramId: number, fullName: string}|null>} PM або null якщо не знайдено
 */
async function getPMForUser(user) {
  try {
    if (!doc || !user) return null;
    
    // Перевіряємо чи є PM у полі користувача
    if (user.pm) {
      // Якщо PM вказаний як Telegram ID
      const pmId = parseInt(user.pm);
      if (!isNaN(pmId)) {
        const pmUser = await getUserInfo(pmId);
        if (pmUser) {
          return { telegramId: pmId, fullName: pmUser.fullName };
        }
      }
    }
    
    // Шукаємо PM по градації (відділ/команда)
    await doc.loadInfo();
    const employeesSheet = doc.sheetsByTitle['Employees'];
    if (!employeesSheet) return null;
    
    const rows = await employeesSheet.getRows();
    
    // Шукаємо PM в тому ж відділі/команді
    const pmRow = rows.find(row => {
      const department = row.get('Department');
      const team = row.get('Team');
      const position = row.get('Position');
      const telegramId = row.get('TelegramID');
      
      // Перевіряємо чи це PM в тому ж відділі/команді
      if (department === user.department && team === user.team) {
        // Перевіряємо чи посада містить PM
        if (position && (position.includes('PM') || position.includes('Project Manager'))) {
          return true;
        }
      }
      
      return false;
    });
    
    if (pmRow) {
      const pmTelegramId = parseInt(pmRow.get('TelegramID'));
      const pmFullName = pmRow.get('FullName');
      if (!isNaN(pmTelegramId) && pmFullName) {
        return { telegramId: pmTelegramId, fullName: pmFullName };
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Помилка getPMForUser:', error);
    return null;
  }
}

// 🏠 ГОЛОВНЕ МЕНЮ
async function showMainMenu(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    const user = await getUserInfo(telegramId);
    
    let welcomeText = `🌟 <b>Ласкаво просимо до HR Бота!</b>

🤖 <b>Що я вмію робити:</b>

🏖️ <b>Відпустки:</b> подача заявок, перевірка балансу, календар
🏠 <b>Remote:</b> фіксація віддаленої роботи, ліміти
⏰ <b>Спізнення:</b> повідомлення про запізнення
🏥 <b>Лікарняний:</b> фіксація хвороби, повідомлення HR
📊 <b>Статистика:</b> особистий звіт за місяць
🎯 <b>Онбординг:</b> матеріали для нових співробітників
💬 <b>Пропозиції:</b> анонімні та іменні ідеї
🚨 <b>ASAP:</b> термінові запити до HR

👋 <b>Привіт, ${user?.fullName || 'колега'}!</b>`;

    // Reply Keyboard (постійна клавіатура внизу)
    const baseKeyboard = [
      // Основні робочі функції (найважливіші)
      [
        { text: '🏖️ Відпустки' },
        { text: '🏠 Remote' }
      ],
      [
        { text: '⏰ Спізнення' },
        { text: '🏥 Лікарняний' }
      ],
      // Додаткові функції
      [
        { text: '📊 Статистика' },
        { text: '🎯 Онбординг' }
      ],
      // Довідка та допомога
      [
        { text: '❓ FAQ' },
      ],
      // Менше використовувані функції
      [
        { text: '💬 Пропозиції' },
        { text: '🚨 ASAP запит' }
      ]
    ];

    if (role === 'PM' || role === 'HR' || role === 'CEO') {
      baseKeyboard.push([
        { text: '📋 Затвердження' },
        { text: '📈 Аналітика' }
      ]);
    }

    if (role === 'HR') {
      baseKeyboard.push([
        { text: '👥 HR Панель' },
        { text: '📢 Розсилки' }
      ]);
    }

    if (role === 'CEO') {
      baseKeyboard.push([
        { text: '🏢 CEO Панель' }
      ]);
    }

    await sendMessage(chatId, welcomeText, baseKeyboard);
    
    // Логування входу в головне меню
    await logUserData(telegramId, 'main_menu_access', { role: role });
  } catch (error) {
    console.error('❌ Помилка showMainMenu:', error);
    await sendMessage(chatId, '❌ Помилка завантаження меню.');
  }
}

// 🔘 ОБРОБКА REPLY KEYBOARD
async function handleReplyKeyboard(chatId, telegramId, text) {
  try {
    const routes = {
      '🏖️ Відпустки': showVacationMenu,
      '🏠 Remote': showRemoteMenu,
      '⏰ Спізнення': showLateMenu,
      '🏥 Лікарняний': showSickMenu,
      '📊 Статистика': showStatsMenu,
      '🎯 Онбординг': showOnboardingMenu,
      '❓ FAQ': showFAQMenu,
      '💬 Пропозиції': showSuggestionsMenu,
      '🚨 ASAP запит': showASAPMenu,
      '📋 Затвердження': showApprovalsMenu,
      '📈 Аналітика': showAnalyticsMenu,
      '👥 HR Панель': showHRPanel,
      '📢 Розсилки': showMailingsMenu,
      '🏢 CEO Панель': showCEOPanel
    };
    
    if (routes[text]) {
      await routes[text](chatId, telegramId);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Помилка handleReplyKeyboard:', error);
    return false;
  }
}

// 👋 ВСТУПНЕ ПОВІДОМЛЕННЯ
async function showWelcomeMessage(chatId, telegramId, username, firstName, lastName) {
  try {
    const welcomeText = `🌟 <b>Привіт зірочка!</b>

Я бот-помічник розроблений твоїм HR. Вона створила мене, щоб полегшити і автоматизувати процеси. Я точно стану тобі в нагоді.

Почну з того, що прошу тебе зареєструватися. Це потрібно, аби надалі я міг допомагати тобі.

<b>Що я вмію робити:</b>

🏖️ <b>Відпустки:</b> подача заявок, перевірка балансу, календар
🏠 <b>Remote:</b> фіксація віддаленої роботи, ліміти
⏰ <b>Спізнення:</b> повідомлення про запізнення
🏥 <b>Лікарняний:</b> фіксація хвороби, повідомлення HR
📊 <b>Статистика:</b> особистий звіт за місяць
🎯 <b>Онбординг:</b> матеріали для нових співробітників
💬 <b>Пропозиції:</b> анонімні та іменні ідеї
🚨 <b>ASAP:</b> термінові запити до HR

Натисніть кнопку нижче, щоб почати реєстрацію!`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Почати реєстрацію', callback_data: 'start_registration' }
        ]
      ]
    };

    await sendMessage(chatId, welcomeText, keyboard);
  } catch (error) {
    console.error('❌ Помилка showWelcomeMessage:', error);
  }
}

// 📝 РЕЄСТРАЦІЯ КОРИСТУВАЧА
async function startRegistration(chatId, telegramId, username, firstName, lastName) {
  try {
    const welcomeText = `🌟 <b>Привіт зірочка!</b>

Я бот-помічник розроблений твоїм HR. Вона створила мене, щоб полегшити і автоматизувати процеси. Я точно стану тобі в нагоді.

Почну з того, що прошу тебе зареєструватися. Це потрібно, аби надалі я міг допомагати тобі.`;

    registrationCache.set(telegramId, {
      step: 'department',
      data: {
        username: username,
        firstName: firstName,
        lastName: lastName
      }
    });

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🏢 Marketing', callback_data: 'department_Marketing' },
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

    await sendMessage(chatId, welcomeText, keyboard);
  } catch (error) {
    console.error('❌ Помилка startRegistration:', error);
  }
}

// 🏢 ВИБІР ВІДДІЛУ
async function handleDepartmentSelection(chatId, telegramId, department) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) return;

    regData.data.department = department;
    regData.step = 'team';

    const keyboard = { inline_keyboard: [] };
    
    if (DEPARTMENTS[department]) {
      const teams = Object.keys(DEPARTMENTS[department]);
      for (const team of teams) {
        keyboard.inline_keyboard.push([
          { text: team, callback_data: `team_${team}` }
        ]);
      }
    }

    await sendMessage(chatId, `✅ Відділ: <b>${department}</b>\n\nОберіть команду:`, keyboard);
  } catch (error) {
    console.error('❌ Помилка handleDepartmentSelection:', error);
  }
}

// 👥 ВИБІР КОМАНДИ
async function handleTeamSelection(chatId, telegramId, team) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) return;

    regData.data.team = team;
    regData.step = 'position';

    const keyboard = { inline_keyboard: [] };
    const department = regData.data.department;
    
    if (DEPARTMENTS[department] && DEPARTMENTS[department][team]) {
      const positions = DEPARTMENTS[department][team];
      for (const position of positions) {
        keyboard.inline_keyboard.push([
          { text: position, callback_data: `position_${position}` }
        ]);
      }
    }

    await sendMessage(chatId, `✅ Команда: <b>${team}</b>\n\nОберіть посаду:`, keyboard);
  } catch (error) {
    console.error('❌ Помилка handleTeamSelection:', error);
  }
}

// 💼 ВИБІР ПОСАДИ
async function handlePositionSelection(chatId, telegramId, position) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) return;

    regData.data.position = position;
    regData.step = 'name';

    await sendMessage(chatId, `✅ Посада: <b>${position}</b>\n\n📝 Введіть ваше ім'я:`);
  } catch (error) {
    console.error('❌ Помилка handlePositionSelection:', error);
  }
}

// 📝 ОБРОБКА КРОКІВ РЕЄСТРАЦІЇ
async function handleRegistrationStep(chatId, telegramId, text) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) return;

    switch (regData.step) {
      case 'name':
        regData.data.name = text;
        regData.step = 'surname';
        await sendMessage(chatId, `✅ Ім'я: <b>${text}</b>\n\n📝 Введіть ваше прізвище:`);
        break;

      case 'surname':
        regData.data.surname = text;
        regData.step = 'birthdate';
        await sendMessage(chatId, `✅ Прізвище: <b>${text}</b>\n\n📅 Введіть дату народження (ДД.ММ.РРРР):`);
        break;

      case 'birthdate':
        if (!isValidDate(text)) {
          await sendMessage(chatId, '❌ Неправильний формат дати. Використовуйте ДД.ММ.РРРР');
          return;
        }
        regData.data.birthDate = text;
        regData.step = 'firstworkday';
        await sendMessage(chatId, `✅ Дата народження: <b>${text}</b>\n\n📅 Введіть перший робочий день (ДД.ММ.РРРР):`);
        break;

      case 'firstworkday':
        if (!isValidDate(text)) {
          await sendMessage(chatId, '❌ Неправильний формат дати. Використовуйте ДД.ММ.РРРР');
          return;
        }
        regData.data.firstWorkDay = text;
        await completeRegistration(chatId, telegramId, regData.data);
        break;
    }
  } catch (error) {
    console.error('❌ Помилка handleRegistrationStep:', error);
  }
}

// ✅ ЗАВЕРШЕННЯ РЕЄСТРАЦІЇ
async function completeRegistration(chatId, telegramId, data) {
  try {
    // Збереження в Google Sheets
    if (doc) {
      await doc.loadInfo();
      let sheet = doc.sheetsByTitle['Employees'];
      if (!sheet) {
        sheet = await doc.addSheet({ title: 'Employees', headerValues: ['TelegramID', 'FullName', 'Department', 'Team', 'Position', 'BirthDate', 'FirstWorkDay', 'WorkMode', 'RegistrationDate'] });
      }
      
      await sheet.addRow({
        TelegramID: telegramId,
        FullName: `${data.name} ${data.surname}`,
        Department: data.department,
        Team: data.team,
        Position: data.position,
        BirthDate: data.birthDate,
        FirstWorkDay: data.firstWorkDay,
        WorkMode: 'Hybrid',
        RegistrationDate: new Date().toISOString()
      });
    }

    registrationCache.delete(telegramId);

    const welcomeText = `🎉 <b>Супер, тепер ми знайомі трошки більше!</b>

Тепер ти можеш ознайомитися з моїм функціоналом. Я допоможу тобі з:

🏖️ <b>Відпустками</b> - подача заявок, перевірка балансу
🏠 <b>Remote роботою</b> - фіксація віддаленої роботи
⏰ <b>Спізненнями</b> - повідомлення про запізнення
🏥 <b>Лікарняними</b> - фіксація хвороби
📊 <b>Статистикою</b> - особисті звіти
🎯 <b>Онбордингом</b> - матеріали для нових
💬 <b>Пропозиціями</b> - ідеї для покращення
🚨 <b>ASAP запитами</b> - термінові питання

Оберіть потрібну функцію з меню нижче!`;

    await showMainMenu(chatId, telegramId);
  } catch (error) {
    console.error('❌ Помилка completeRegistration:', error);
  }
}

// 🏖️ МЕНЮ ВІДПУСТОК
async function showVacationMenu(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    const balance = await getVacationBalance(telegramId);
    
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
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showVacationMenu:', error);
  }
}

// 📊 БАЛАНС ВІДПУСТОК
async function getVacationBalance(telegramId) {
  try {
    if (!doc) return { used: 0, total: 24, available: 24 };
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Vacations'];
    if (!sheet) return { used: 0, total: 24, available: 24 };
    
    const rows = await sheet.getRows();
    const currentYear = new Date().getFullYear();
    
    const userVacations = rows.filter(row => {
      const rowTelegramId = row.get('TelegramID');
      const rowStatus = row.get('Status');
      const rowStartDate = row.get('StartDate');
      
      if (rowTelegramId != telegramId) return false;
      if (rowStatus !== 'approved' && rowStatus !== 'Approved') return false;
      if (!rowStartDate) return false;
      
      const startDate = new Date(rowStartDate);
      return startDate.getFullYear() === currentYear;
    });
    
    const usedDays = userVacations.reduce((total, row) => {
      const start = new Date(row.get('StartDate'));
      const end = new Date(row.get('EndDate'));
      const days = parseInt(row.get('Days')) || 0;
      return total + (days || Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    }, 0);
    
    return {
      used: usedDays,
      total: 24,
      available: Math.max(0, 24 - usedDays)
    };
  } catch (error) {
    console.error('❌ Помилка getVacationBalance:', error);
    return { used: 0, total: 24, available: 24 };
  }
}

// 📊 ПОКАЗАТИ БАЛАНС ВІДПУСТОК
async function showVacationBalance(chatId, telegramId) {
  try {
    const balance = await getVacationBalance(telegramId);
    const user = await getUserInfo(telegramId);
    
    const text = `📊 <b>Детальний баланс відпусток</b>

💰 <b>Використано:</b> ${balance.used} днів
📅 <b>Доступно:</b> ${balance.available} днів
📊 <b>Загальний ліміт:</b> ${balance.total} днів

${user?.firstWorkDay ? `📆 <b>Перший робочий день:</b> ${formatDate(new Date(user.firstWorkDay))}` : ''}
${user?.firstWorkDay ? `⏰ <b>Можна брати відпустку після:</b> ${formatDate(new Date(new Date(user.firstWorkDay).setMonth(new Date(user.firstWorkDay).getMonth() + 3)))}` : ''}`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '⬅️ Назад до відпусток', callback_data: 'vacation_apply' }]
      ]
    };
    
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showVacationBalance:', error);
    await sendMessage(chatId, '❌ Помилка завантаження балансу.');
  }
}

// 📄 МОЇ ЗАЯВКИ НА ВІДПУСТКУ
async function showMyVacationRequests(chatId, telegramId) {
  try {
    if (!doc) {
      await sendMessage(chatId, '❌ Google Sheets не підключено.');
      return;
    }
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Vacations'];
    if (!sheet) {
      await sendMessage(chatId, '📋 У вас поки немає заявок на відпустку.');
      return;
    }
    
    const rows = await sheet.getRows();
    const userRequests = rows
      .filter(row => row.get('TelegramID') == telegramId)
      .sort((a, b) => {
        const dateA = new Date(a.get('StartDate'));
        const dateB = new Date(b.get('StartDate'));
        return dateB - dateA; // Сортуємо від нових до старих
      })
      .slice(0, 10); // Показуємо останні 10 заявок
    
    if (userRequests.length === 0) {
      await sendMessage(chatId, '📋 У вас поки немає заявок на відпустку.');
      return;
    }
    
    let text = `📄 <b>Мої заявки на відпустку</b>\n\n`;
    
    userRequests.forEach((row, index) => {
      const status = row.get('Status');
      const startDate = row.get('StartDate');
      const endDate = row.get('EndDate');
      const days = row.get('Days');
      const requestType = row.get('RequestType') || 'regular';
      
      let statusEmoji = '⏳';
      let statusText = 'Очікує';
      if (status === 'approved') {
        statusEmoji = '✅';
        statusText = 'Затверджено';
      } else if (status === 'rejected') {
        statusEmoji = '❌';
        statusText = 'Відхилено';
      } else if (status === 'pending_hr') {
        statusText = 'Очікує HR';
      } else if (status === 'pending_pm') {
        statusText = 'Очікує PM';
      }
      
      const typeText = requestType === 'emergency' ? '🚨 Екстрена' : '📝 Звичайна';
      
      text += `${index + 1}. ${statusEmoji} <b>${statusText}</b> ${typeText}\n`;
      text += `   📅 ${startDate} - ${endDate} (${days} днів)\n\n`;
    });
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '⬅️ Назад до відпусток', callback_data: 'vacation_apply' }]
      ]
    };
    
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showMyVacationRequests:', error);
    await sendMessage(chatId, '❌ Помилка завантаження заявок.');
  }
}

// 📝 ФОРМА ЗАЯВКИ НА ВІДПУСТКУ
async function showVacationForm(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений. Пройдіть реєстрацію.');
      return;
    }

    const text = `📝 <b>Заявка на відпустку</b>

👤 <b>Співробітник:</b> ${user.fullName}
🏢 <b>Відділ:</b> ${user.department}
👥 <b>Команда:</b> ${user.team}

<b>Введіть дати відпустки:</b>

📅 <b>Дата початку</b> (ДД.ММ.РРРР):`;

    // Збережемо стан форми
    registrationCache.set(telegramId, {
      step: 'vacation_start_date',
      data: { type: 'vacation' }
    });
    
    console.log('📝 showVacationForm: Встановлено кеш для', telegramId, registrationCache.get(telegramId));

    await sendMessage(chatId, text);
  } catch (error) {
    console.error('❌ Помилка showVacationForm:', error);
  }
}

// 🚨 ФОРМА ЕКСТРЕНОЇ ВІДПУСТКИ
async function showEmergencyVacationForm(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений. Пройдіть реєстрацію.');
      return;
    }

    const text = `🚨 <b>Екстрена відпустка</b>

👤 <b>Співробітник:</b> ${user.fullName}
🏢 <b>Відділ:</b> ${user.department}
👥 <b>Команда:</b> ${user.team}

⚠️ <b>Увага!</b> Екстрена відпустка дозволяє взяти відпустку без попередження заздалегідь.

<b>Введіть дату початку відпустки:</b>
📅 <b>Дата початку</b> (ДД.ММ.РРРР):`;

    // Збережемо стан форми
    registrationCache.set(telegramId, {
      step: 'emergency_vacation_start_date',
      data: { type: 'emergency_vacation' }
    });

    await sendMessage(chatId, text);
  } catch (error) {
    console.error('❌ Помилка showEmergencyVacationForm:', error);
  }
}

// 🏠 МЕНЮ REMOTE
async function showRemoteMenu(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    const stats = await getRemoteStats(telegramId);
    
    const text = `🏠 <b>Remote робота</b>

📊 <b>Статистика за поточний місяць:</b>
• Використано днів: ${stats.used}

<b>Правила:</b>
• Повідомляти до 19:00 дня передуючого залишенню вдома
• Автоматичне затвердження

Оберіть дію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🏠 Remote сьогодні', callback_data: 'remote_today' },
          { text: '📅 Календар Remote', callback_data: 'remote_calendar' }
        ],
        [
          { text: '📊 Статистика', callback_data: 'remote_stats' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showRemoteMenu:', error);
  }
}

// ⏰ МЕНЮ СПІЗНЕНЬ
async function showLateMenu(chatId, telegramId) {
  try {
    const stats = await getLateStats(telegramId);
    
    const text = `⏰ <b>Спізнення</b>

📊 <b>Статистика за поточний місяць:</b>
• Спізнень: ${stats.count}/7 (ліміт)
• Попередження: ${stats.warnings}

<b>Правила:</b>
• Спізнення рахується з 11:01
• 7 спізнень/місяць = попередження
• Повідомляти PM і HR (якщо немає PM - одразу HR)

Оберіть дію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⏰ Повідомити про спізнення', callback_data: 'late_report' }
        ],
        [
          { text: '📊 Статистика спізнень', callback_data: 'late_stats' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showLateMenu:', error);
  }
}

// 🏥 МЕНЮ ЛІКАРНЯНИХ
async function showSickMenu(chatId, telegramId) {
  try {
    const stats = await getSickStats(telegramId);
    
    const text = `🏥 <b>Лікарняний</b>

📊 <b>Статистика за місяць:</b>
• Лікарняних днів: ${stats.days}
• Записів: ${stats.count}

<b>Правила:</b>
• Без лімітів
• Повідомляти HR + PM
• Автоматичне затвердження

Оберіть дію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🏥 Повідомити про лікарняний', callback_data: 'sick_report' }
        ],
        [
          { text: '📊 Статистика лікарняних', callback_data: 'sick_stats' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showSickMenu:', error);
  }
}

// 📊 МЕНЮ СТАТИСТИКИ
async function showStatsMenu(chatId, telegramId) {
  try {
    const text = `📊 <b>Моя статистика</b>

Тут ви можете переглянути ваші особисті звіти та дані.

Оберіть дію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📅 Звіт за місяць', callback_data: 'stats_monthly' }
        ],
        [
          { text: '📤 Експорт даних', callback_data: 'stats_export' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showStatsMenu:', error);
  }
}

// 🎯 МЕНЮ ОНБОРДИНГУ
async function showOnboardingMenu(chatId, telegramId) {
  try {
    const text = `🎯 <b>Онбординг та навчання</b>

Тут зібрана вся необхідна інформація для роботи в команді.

Оберіть дію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📚 Матеріали адаптації', callback_data: 'onboarding_notion' }
        ],
        [
          { text: '❓ Тестування знань', callback_data: 'onboarding_quiz' }
        ],
        [
          { text: '📖 Правила компанії', callback_data: 'onboarding_rules' }
        ],
        [
          { text: '👥 Структура команди', callback_data: 'onboarding_structure' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showOnboardingMenu:', error);
  }
}

// ❓ МЕНЮ FAQ
async function showFAQMenu(chatId, telegramId) {
  try {
    const text = `❓ <b>Часті питання</b>

Оберіть категорію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🏖️ Відпустки', callback_data: 'faq_vacations' },
          { text: '🏠 Remote', callback_data: 'faq_remote' }
        ],
        [
          { text: '⏰ Спізнення', callback_data: 'faq_late' },
          { text: '🏥 Лікарняний', callback_data: 'faq_sick' }
        ],
        [
          { text: '💼 Загальні', callback_data: 'faq_general' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showFAQMenu:', error);
  }
}

// AI помічник видалено

// 💬 МЕНЮ ПРОПОЗИЦІЙ
async function showSuggestionsMenu(chatId, telegramId) {
  try {
    const text = `💬 <b>Пропозиції</b>

Ваші ідеї важливі для нас! Можете поділитися пропозиціями щодо покращення робочих процесів.

Оберіть тип:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '👤 Іменна пропозиція', callback_data: 'suggestions_named' },
          { text: '🎭 Анонімна пропозиція', callback_data: 'suggestions_anonymous' }
        ],
        [
          { text: '📄 Мої пропозиції', callback_data: 'suggestions_view' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showSuggestionsMenu:', error);
  }
}

// 🚨 МЕНЮ ASAP
async function showASAPMenu(chatId, telegramId) {
  try {
    const text = `🚨 <b>ASAP запит</b>

Термінові питання, які потребують негайної уваги HR.

Оберіть дію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🚨 Надіслати ASAP запит', callback_data: 'asap_form' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showASAPMenu:', error);
  }
}

// 📋 МЕНЮ ЗАТВЕРДЖЕНЬ (PM/HR/CEO)
async function showApprovalsMenu(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    
    if (role !== 'PM' && role !== 'HR' && role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для PM, HR, CEO.');
      return;
    }

    const text = `📋 <b>Затвердження</b>

Оберіть тип затвердження:`;

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

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showApprovalsMenu:', error);
  }
}

// 📈 МЕНЮ АНАЛІТИКИ
async function showAnalyticsMenu(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    
    if (role !== 'HR' && role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR та CEO.');
      return;
    }

    const text = `📈 <b>Аналітика</b>

Оберіть тип аналітики:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '👥 HR Аналітика', callback_data: 'analytics_hr' },
          { text: '🏢 CEO Аналітика', callback_data: 'analytics_ceo' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showAnalyticsMenu:', error);
  }
}

// 👥 HR ПАНЕЛЬ
async function showHRPanel(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    const text = `👥 <b>HR Панель</b>

Оберіть дію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '👥 Управління користувачами', callback_data: 'hr_users' },
          { text: '📊 Звіти', callback_data: 'hr_reports' }
        ],
        [
          { text: '📢 Розсилки', callback_data: 'hr_mailings' },
          { text: '📤 Експорт даних', callback_data: 'hr_export' }
        ],
        [
          { text: '⚙️ Налаштування', callback_data: 'hr_settings' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showHRPanel:', error);
  }
}

// 🏢 CEO ПАНЕЛЬ
async function showCEOPanel(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    
    if (role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для CEO.');
      return;
    }

    const text = `🏢 <b>CEO Панель</b>

Оберіть дію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📊 Загальна аналітика', callback_data: 'ceo_analytics' },
          { text: '👥 Команда', callback_data: 'ceo_team' }
        ],
        [
          { text: '💼 Бізнес метрики', callback_data: 'ceo_metrics' },
          { text: '📈 Експорт даних', callback_data: 'ceo_export' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showCEOPanel:', error);
  }
}

// 📢 МЕНЮ РОЗСИЛОК (HR)
async function showMailingsMenu(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    const text = `📢 <b>Розсилки</b>

Оберіть тип розсилки:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '👥 Всім співробітникам', callback_data: 'hr_mailing_all' },
          { text: '🏢 По відділу', callback_data: 'hr_mailing_department' }
        ],
        [
          { text: '👥 По команді', callback_data: 'hr_mailing_team' },
          { text: '👑 По ролі', callback_data: 'hr_mailing_role' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showMailingsMenu:', error);
  }
}

// 🔧 ДОПОМІЖНІ ФУНКЦІЇ
function isValidDate(dateString) {
  const regex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  if (!regex.test(dateString)) return false;
  
  const [, day, month, year] = dateString.match(regex);
  const date = new Date(year, month - 1, day);
  
  return date.getDate() == day && date.getMonth() == month - 1 && date.getFullYear() == year;
}

async function checkIfNewEmployee(telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    if (!user) return false;
    
    const firstWorkDay = new Date(user.firstWorkDay);
    const now = new Date();
    const diffTime = now - firstWorkDay;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays <= 30; // Новий співробітник до 30 днів
  } catch (error) {
    console.error('❌ Помилка checkIfNewEmployee:', error);
    return false;
  }
}

async function getRemoteStats(telegramId) {
  try {
    return await getRemoteStatsForCurrentMonth(telegramId);
  } catch (error) {
    console.error('❌ Помилка getRemoteStats:', error);
    return { used: 0 };
  }
}

async function getLateStats(telegramId) {
  try {
    const stats = await getLateStatsForCurrentMonth(telegramId);
    const warnings = Math.floor(stats.count / 7);
    return { count: stats.count, warnings };
  } catch (error) {
    console.error('❌ Помилка getLateStats:', error);
    return { count: 0, warnings: 0 };
  }
}

async function getSickStats(telegramId) {
  try {
    return await getSickStatsForCurrentMonth(telegramId);
  } catch (error) {
    console.error('❌ Помилка getSickStats:', error);
    return { days: 0, count: 0 };
  }
}

// 📢 ФУНКЦІЇ РОЗСИЛКИ HR

// Розсилка всім співробітникам
async function startMailingToAll(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    // Зберігаємо стан розсилки
    registrationCache.set(telegramId, {
      step: 'mailing_message',
      data: { type: 'all', recipients: 'all' }
    });

    await sendMessage(chatId, `📢 <b>Розсилка всім співробітникам</b>

Введіть текст повідомлення:`);
  } catch (error) {
    console.error('❌ Помилка startMailingToAll:', error);
  }
}

// Розсилка по відділу
async function startMailingToDepartment(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🏢 Marketing', callback_data: 'mailing_dept_Marketing' },
          { text: '🎨 Design', callback_data: 'mailing_dept_Design' }
        ],
        [
          { text: '📱 SMM', callback_data: 'mailing_dept_SMM' },
          { text: '💼 Sales', callback_data: 'mailing_dept_Sales and communication' }
        ],
        [
          { text: '👥 HR', callback_data: 'mailing_dept_HR' },
          { text: '👑 CEO', callback_data: 'mailing_dept_CEO' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'hr_mailings' }
        ]
      ]
    };

    await sendMessage(chatId, `📢 <b>Розсилка по відділу</b>

Оберіть відділ:`, keyboard);
  } catch (error) {
    console.error('❌ Помилка startMailingToDepartment:', error);
  }
}

// Розсилка по команді
async function startMailingToTeam(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: 'PPC', callback_data: 'mailing_team_PPC' },
          { text: 'Target/Kris', callback_data: 'mailing_team_Target/Kris team' }
        ],
        [
          { text: 'Target/Lera', callback_data: 'mailing_team_Target/Lera team' },
          { text: 'Design', callback_data: 'mailing_team_Design' }
        ],
        [
          { text: 'SMM', callback_data: 'mailing_team_SMM' },
          { text: 'Sales', callback_data: 'mailing_team_Sales and communication' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'hr_mailings' }
        ]
      ]
    };

    await sendMessage(chatId, `📢 <b>Розсилка по команді</b>

Оберіть команду:`, keyboard);
  } catch (error) {
    console.error('❌ Помилка startMailingToTeam:', error);
  }
}

// Розсилка по ролі
async function startMailingToRole(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '👑 CEO', callback_data: 'mailing_role_CEO' },
          { text: '👥 HR', callback_data: 'mailing_role_HR' }
        ],
        [
          { text: '👨‍💼 PM', callback_data: 'mailing_role_PM' },
          { text: '👤 Employee', callback_data: 'mailing_role_EMP' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'hr_mailings' }
        ]
      ]
    };

    await sendMessage(chatId, `📢 <b>Розсилка по ролі</b>

Оберіть роль:`, keyboard);
  } catch (error) {
    console.error('❌ Помилка startMailingToRole:', error);
  }
}

// Обробка розсилки HR
async function handleHRMailing(chatId, telegramId, text) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData || regData.step !== 'mailing_message') {
      return false;
    }

    // Відправляємо розсилку
    await sendMailing(chatId, telegramId, regData.data, text);
    registrationCache.delete(telegramId);
    return true;
  } catch (error) {
    console.error('❌ Помилка handleHRMailing:', error);
    return false;
  }
}

// Обробка вибраного відділу для розсилки
async function startMailingToDepartmentSelected(chatId, telegramId, department) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    registrationCache.set(telegramId, {
      step: 'mailing_message',
      data: { type: 'department', department: department }
    });

    await sendMessage(chatId, `📢 <b>Розсилка по відділу: ${department}</b>

Введіть текст повідомлення:`);
  } catch (error) {
    console.error('❌ Помилка startMailingToDepartmentSelected:', error);
  }
}

// Обробка вибраної команди для розсилки
async function startMailingToTeamSelected(chatId, telegramId, team) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    registrationCache.set(telegramId, {
      step: 'mailing_message',
      data: { type: 'team', team: team }
    });

    await sendMessage(chatId, `📢 <b>Розсилка по команді: ${team}</b>

Введіть текст повідомлення:`);
  } catch (error) {
    console.error('❌ Помилка startMailingToTeamSelected:', error);
  }
}

// Обробка вибраної ролі для розсилки
async function startMailingToRoleSelected(chatId, telegramId, role) {
  try {
    const userRole = await getUserRole(telegramId);
    if (userRole !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    registrationCache.set(telegramId, {
      step: 'mailing_message',
      data: { type: 'role', role: role }
    });

    await sendMessage(chatId, `📢 <b>Розсилка по ролі: ${role}</b>

Введіть текст повідомлення:`);
  } catch (error) {
    console.error('❌ Помилка startMailingToRoleSelected:', error);
  }
}

// Відправка розсилки
async function sendMailing(chatId, telegramId, mailingData, message) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    let recipients = [];
    
    if (!doc) {
      await sendMessage(chatId, '❌ Google Sheets не підключено. Розсилка недоступна.');
      return;
    }

    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Employees'];
    if (!sheet) {
      await sendMessage(chatId, '❌ Таблиця співробітників не знайдена.');
      return;
    }

    const rows = await sheet.getRows();
    
    switch (mailingData.type) {
      case 'all':
        recipients = rows.map(row => row.get('TelegramID')).filter(id => id);
        break;
      case 'department':
        recipients = rows
          .filter(row => row.get('Department') === mailingData.department)
          .map(row => row.get('TelegramID'))
          .filter(id => id);
        break;
      case 'team':
        recipients = rows
          .filter(row => row.get('Team') === mailingData.team)
          .map(row => row.get('TelegramID'))
          .filter(id => id);
        break;
      case 'role':
        // Отримуємо ролі з таблиці Roles
        const rolesSheet = doc.sheetsByTitle['Roles'];
        if (rolesSheet) {
          const roleRows = await rolesSheet.getRows();
          const roleUsers = roleRows
            .filter(row => row.get('Role') === mailingData.role)
            .map(row => row.get('TelegramID'))
            .filter(id => id);
          recipients = roleUsers;
        }
        break;
    }

    if (recipients.length === 0) {
      await sendMessage(chatId, '❌ Отримувачі не знайдені.');
      return;
    }

    // Відправляємо повідомлення
    let successCount = 0;
    let failCount = 0;

    for (const recipientId of recipients) {
      try {
        await bot.sendMessage(recipientId, `📢 <b>Повідомлення від HR</b>\n\n${message}`, { parse_mode: 'HTML' });
        successCount++;
      } catch (error) {
        console.error(`❌ Помилка відправки до ${recipientId}:`, error);
        failCount++;
      }
    }

    // Підтвердження HR
    const resultText = `✅ <b>Розсилка завершена!</b>

📊 <b>Результат:</b>
• Відправлено: ${successCount}
• Помилок: ${failCount}
• Всього отримувачів: ${recipients.length}

<b>Повідомлення:</b>
${message}`;

    await sendMessage(chatId, resultText);

  } catch (error) {
    console.error('❌ Помилка sendMailing:', error);
    await sendMessage(chatId, '❌ Помилка відправки розсилки.');
  }
}

// 📝 ДОДАТКОВІ ФУНКЦІЇ

// Початок реєстрації з callback
async function startRegistrationFromCallback(chatId, telegramId) {
  try {
    const user = await bot.getChatMember(chatId, telegramId);
    await startRegistration(chatId, telegramId, user.user.username, user.user.first_name, user.user.last_name);
  } catch (error) {
    console.error('❌ Помилка startRegistrationFromCallback:', error);
    await startRegistration(chatId, telegramId, null, null, null);
  }
}

// Показати Notion посилання
async function showNotionLink(chatId, telegramId) {
  try {
    const text = `📚 <b>Матеріали адаптації</b>

Ось посилання на файл з адаптацією для відділу трафіку:

🔗 https://superficial-sort-084.notion.site/3b5c00ad8a42473bbef49bb26f076ebd

Після перегляду матеріалів, поверніться сюди для проходження тестування!`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showNotionLink:', error);
  }
}

// Показати тестування
async function showOnboardingQuiz(chatId, telegramId) {
  try {
    const text = `❓ <b>Тестування знань</b>

Познайомився з матеріалами? Давай тепер пройдемо коротеньке опитування, і дізнаємося чи про все ти пам'ятаєш.

Воно не впливає на наше до тебе відношення) тож have fun)

🔗 https://forms.google.com/onboarding-quiz

Після завершення тесту, ти одразу побачиш кількість правильних відповідей та пояснення помилок.`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showOnboardingQuiz:', error);
  }
}

// Показати правила компанії
async function showCompanyRules(chatId, telegramId) {
  try {
    const text = `📖 <b>Правила компанії</b>

<b>Робочий режим:</b>
• Пн-Пт 10:00-18:00
• Спізнення з 10:21
• Remote до 10:30 (ліміт 14 днів/міс для офлайн/гібрид)

<b>Відпустки:</b>
• Мін 1 день, макс 7 календарних днів за раз
• 3 місяці до першої відпустки
• Накладки заборонені в межах підкоманд
• Процес: Користувач → PM → HR
• Ліміт 24 дні/рік

<b>Лікарняний:</b>
• Без лімітів
• Повідомляє HR + PM

<b>Нагадування:</b>
• Дні народження за 10+7 днів тільки HR
• Відпустка за 5 робочих днів всім
• Спізнення 7 разів/міс = попередження`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showCompanyRules:', error);
  }
}

// Показати структуру команди
async function showTeamStructure(chatId, telegramId) {
  try {
    const text = `👥 <b>Структура команди</b>

<b>Marketing:</b>
• PPC
• Target/Kris team
• Target/Lera team

<b>Design:</b>
• Head of Design + Motion Designer
• Static designer
• Video designer
• SMM designer

<b>SMM:</b>
• Head of SMM
• SMM specialist
• Producer
• PM

<b>Sales and communication:</b>
• Sales and communication manager

<b>HR:</b>
• HR

<b>CEO:</b>
• CEO

Target керує CEO прямо.`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showTeamStructure:', error);
  }
}

// Обробка відпусток
async function handleVacationProcess(chatId, telegramId, text) {
  try {
    const regData = registrationCache.get(telegramId);
    console.log('🔍 handleVacationProcess:', { telegramId, hasRegData: !!regData, step: regData?.step, text });
    if (!regData) return false;
    
    // Обробка екстреної відпустки
    if (regData.step === 'emergency_vacation_start_date') {
      const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
      const match = text.match(dateRegex);
      
      if (!match) {
        await sendMessage(chatId, '❌ Невірний формат дати. Використовуйте ДД.ММ.РРРР (наприклад: 11.11.2025)');
        return true;
      }
      
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const year = parseInt(match[3]);
      
      const startDate = new Date(year, month - 1, day);
      if (startDate.getDate() !== day || startDate.getMonth() !== month - 1 || startDate.getFullYear() !== year) {
        await sendMessage(chatId, '❌ Невірна дата. Перевірте правильність введених даних.');
        return true;
      }
      
      regData.data.startDate = startDate;
      regData.step = 'emergency_vacation_days';
      await sendMessage(chatId, `📅 <b>Дата початку:</b> ${text}\n\n📊 <b>Вкажіть кількість днів відпустки</b>\n\nВведіть кількість днів (1-7):`);
      return true;
    }
    
    if (regData.step === 'emergency_vacation_days') {
      const days = parseInt(text);
      
      if (isNaN(days) || days < 1 || days > 7) {
        await sendMessage(chatId, '❌ Кількість днів має бути від 1 до 7.');
        return true;
      }
      
      regData.data.days = days;
      regData.step = 'emergency_vacation_reason';
      await sendMessage(chatId, `📊 <b>Кількість днів:</b> ${days}\n\n🔒 <b>ВАЖЛИВО! Конфіденційна інформація</b>\n\n📝 <b>Опишіть причину екстреної відпустки:</b>\n\n⚠️ Ця інформація буде доступна тільки HR і CEO агенції.`);
      return true;
    }
    
    if (regData.step === 'emergency_vacation_reason') {
      if (!text || text.trim().length < 10) {
        await sendMessage(chatId, '❌ Будь ласка, опишіть причину більш детально (мінімум 10 символів).');
        return true;
      }
      
      regData.data.reason = text.trim();
      await processEmergencyVacationRequest(chatId, telegramId, regData.data);
      registrationCache.delete(telegramId);
      return true;
    }
    
    if (regData.step === 'vacation_start_date') {
      // Перевіряємо формат дати
      const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
      const match = text.match(dateRegex);
      
      if (!match) {
        await sendMessage(chatId, '❌ Невірний формат дати. Використовуйте ДД.ММ.РРРР (наприклад: 11.11.2025)');
        return true;
      }
      
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const year = parseInt(match[3]);
      
      // Перевіряємо валідність дати
      const startDate = new Date(year, month - 1, day);
      if (startDate.getDate() !== day || startDate.getMonth() !== month - 1 || startDate.getFullYear() !== year) {
        await sendMessage(chatId, '❌ Невірна дата. Перевірте правильність введених даних.');
        return true;
      }
      
      // Перевіряємо, що дата не в минулому
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) {
        await sendMessage(chatId, '❌ Дата початку відпустки не може бути в минулому.');
        return true;
      }
      
      // Зберігаємо дату початку і переходимо до кількості днів
      regData.data.startDate = startDate;
      regData.step = 'vacation_days';
      
      await sendMessage(chatId, `📅 <b>Дата початку:</b> ${text}\n\n📊 <b>Вкажіть кількість днів відпустки</b>\n\nВведіть кількість днів (1-7):`);
      return true;
    }
    
    if (regData.step === 'vacation_days') {
      const days = parseInt(text);
      
      if (isNaN(days) || days < 1 || days > 7) {
        await sendMessage(chatId, '❌ Кількість днів має бути від 1 до 7.');
        return true;
      }
      
      // Зберігаємо кількість днів і обробляємо заявку
      regData.data.days = days;
      
      await processVacationRequest(chatId, telegramId, regData.data);
      registrationCache.delete(telegramId);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Помилка handleVacationProcess:', error);
    return false;
  }
}

// Обробка екстреної відпустки
/**
 * Обробляє екстрену заявку на відпустку - відправляє тільки HR
 * @param {number} chatId - ID чату
 * @param {number} telegramId - Telegram ID користувача
 * @param {Partial<VacationRequest>} vacationData - Дані заявки (startDate, days, reason)
 * @returns {Promise<void>}
 */
async function processEmergencyVacationRequest(chatId, telegramId, vacationData) {
  try {
    logger.info('Processing emergency vacation request', { telegramId, vacationData });
    
    const user = await getUserInfo(telegramId);
    if (!user) {
      throw new ValidationError('Користувач не знайдений. Пройдіть реєстрацію.', 'user');
    }
    
    const { startDate, days, reason } = vacationData;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days - 1);
    
    // Зберігаємо заявку в таблицю з типом emergency
    const requestId = await saveVacationRequest(telegramId, user, startDate, endDate, days, 'pending_hr', null, 'emergency', reason);
    
    // Відправляємо тільки HR з інформацією про екстрену відпустку
    await notifyHRAboutEmergencyVacation(user, requestId, startDate, endDate, days, reason);
    
    // Підтвердження користувачу
    await sendMessage(chatId, `✅ <b>Екстрена заявка на відпустку відправлена!</b>\n\n📅 <b>Період:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n📊 <b>Днів:</b> ${days}\n\n⏳ Заявка відправлена напряму HR для розгляду. Ви отримаєте відповідь найближчим часом.`);
    
    // Логування
    await logUserData(telegramId, 'emergency_vacation_request', {
      requestId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days,
      hasReason: !!reason,
      department: user.department,
      team: user.team
    });
    
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.warn('Validation error in emergency vacation request', { telegramId, error: error.message });
      await sendMessage(chatId, `❌ ${error.message}`);
    } else {
      logger.error('Unexpected error in emergency vacation request', error, { telegramId });
      await sendMessage(chatId, '❌ Помилка обробки заявки. Спробуйте пізніше або зверніться до HR.');
    }
  }
}

// Обробка заявки на відпустку
/**
 * Обробляє заявку на відпустку з перевіркою конфліктів та балансу
 * @param {number} chatId - ID чату
 * @param {number} telegramId - Telegram ID користувача
 * @param {Partial<VacationRequest>} vacationData - Дані заявки на відпустку (startDate, days)
 * @returns {Promise<void>}
 */
async function processVacationRequest(chatId, telegramId, vacationData) {
  try {
    logger.info('Processing vacation request', { telegramId, vacationData });
    
    const user = await getUserInfo(telegramId);
    if (!user) {
      throw new ValidationError('Користувач не знайдений. Пройдіть реєстрацію.', 'user');
    }
    
    const { startDate, days } = vacationData;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days - 1);
    
    // Перевіряємо перетини з іншими відпустками
    const conflicts = await checkVacationConflicts(user.department, user.team, startDate, endDate, telegramId);
    
    if (conflicts.length > 0) {
      let conflictMessage = '⚠️ <b>Упс, твоя відпустка пересікається з Людинкою з твоєї команди:</b>\n\n';
      conflicts.forEach(conflict => {
        conflictMessage += `👤 ${conflict.fullName} (${conflict.department}/${conflict.team})\n`;
        conflictMessage += `📅 ${conflict.startDate} - ${conflict.endDate}\n\n`;
      });
      conflictMessage += 'Будь ласка, оберіть інші дати.';
      
      await sendMessage(chatId, conflictMessage);
      
      // Повідомляємо HR про конфлікт
      await notifyHRAboutConflict(user, conflicts, startDate, endDate);
      return;
    }
    
    // Перевіряємо баланс відпусток
    const balance = await getVacationBalance(telegramId);
    if (balance.available < days) {
      await sendMessage(chatId, `❌ Недостатньо днів відпустки. Доступно: ${balance.available} днів, потрібно: ${days} днів.`);
      return;
    }
    
    // Перевіряємо чи є PM для користувача
    const pm = await getPMForUser(user);
    const hasPM = pm !== null;
    
    // Визначаємо статус заявки
    const initialStatus = hasPM ? 'pending_pm' : 'pending_hr';
    
    // Зберігаємо заявку в таблицю
    const requestId = await saveVacationRequest(telegramId, user, startDate, endDate, days, initialStatus, pm);
    
    // Оновлюємо баланс відпусток (тільки після затвердження)
    // await updateVacationBalance(telegramId, user, days);
    
    if (hasPM) {
      // Якщо є PM - відправляємо PM, потім HR
      await notifyPMAboutVacationRequest(user, requestId, startDate, endDate, days, pm);
      await notifyHRAboutVacationRequest(user, requestId, startDate, endDate, days, conflicts, false);
      
      // Підтвердження користувачу
      await sendMessage(chatId, `✅ <b>Супер, твій запит відправляється далі!</b>\n\n📅 <b>Період:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n📊 <b>Днів:</b> ${days}\n👤 <b>PM:</b> ${pm.fullName}\n\n⏳ Заявка відправлена на затвердження PM, після чого перейде до HR.`);
    } else {
      // Якщо немає PM - відправляємо одразу HR з можливістю підтвердження
      await notifyHRAboutVacationRequest(user, requestId, startDate, endDate, days, conflicts, true);
      
      // Підтвердження користувачу
      await sendMessage(chatId, `✅ <b>Супер, твій запит відправляється далі!</b>\n\n📅 <b>Період:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n📊 <b>Днів:</b> ${days}\n👤 <b>PM:</b> Не призначено\n\n⏳ Заявка відправлена одразу на затвердження HR.`);
    }
    
    // Логування
    await logUserData(telegramId, 'vacation_request', {
      requestId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days,
      department: user.department,
      team: user.team
    });
    
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.warn('Validation error in vacation request', { telegramId, error: error.message });
      await sendMessage(chatId, `❌ ${error.message}`);
    } else if (error instanceof DatabaseError) {
      logger.error('Database error in vacation request', error, { telegramId });
      await sendMessage(chatId, '❌ Помилка збереження даних. Спробуйте пізніше або зверніться до HR.');
    } else if (error instanceof TelegramError) {
      logger.error('Telegram error in vacation request', error, { telegramId });
      // Не відправляємо повідомлення, якщо бот заблокований
    } else {
      logger.error('Unexpected error in vacation request', error, { telegramId });
      try {
        await sendMessage(chatId, '❌ Сталася неочікувана помилка. Спробуйте пізніше або зверніться до HR.');
      } catch (sendError) {
        logger.error('Failed to send error message', sendError, { telegramId });
      }
    }
  }
}

// Перевірка перетинів відпусток
async function checkVacationConflicts(department, team, startDate, endDate, excludeUserId = null) {
  try {
    if (!doc) return [];
    
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['Vacations'];
    if (!sheet) return [];
    
    const rows = await sheet.getRows();
    const conflicts = [];
    
    for (const row of rows) {
      const rowTelegramId = row.get('TelegramID');
      if (excludeUserId && rowTelegramId == excludeUserId) continue;
      
      const rowStatus = row.get('Status');
      // Перевіряємо тільки затверджені та очікуючі затвердження заявки
      if (rowStatus !== 'approved' && rowStatus !== 'pending_pm' && rowStatus !== 'pending_hr') continue;
      
      const rowDepartment = row.get('Department');
      const rowTeam = row.get('Team');
      if (rowDepartment !== department || rowTeam !== team) continue;
      
      const rowStartDateStr = row.get('StartDate');
      const rowEndDateStr = row.get('EndDate');
      if (!rowStartDateStr || !rowEndDateStr) continue;
      
      const rowStartDate = new Date(rowStartDateStr);
      const rowEndDate = new Date(rowEndDateStr);
      
      // Перевіряємо перетин дат
      if (startDate <= rowEndDate && endDate >= rowStartDate) {
        conflicts.push({
          fullName: row.get('FullName'),
          department: rowDepartment,
          team: rowTeam,
          startDate: formatDate(rowStartDate),
          endDate: formatDate(rowEndDate)
        });
      }
    }
    
    return conflicts;
  } catch (error) {
    console.error('❌ Помилка checkVacationConflicts:', error);
    return [];
  }
}

// Збереження заявки на відпустку
/**
 * Зберігає заявку на відпустку в Google Sheets
 * @param {number} telegramId - Telegram ID користувача
 * @param {User} user - Об'єкт користувача
 * @param {Date} startDate - Дата початку відпустки
 * @param {Date} endDate - Дата закінчення відпустки
 * @param {number} days - Кількість днів відпустки
 * @returns {Promise<string>} ID збереженої заявки
 */
async function saveVacationRequest(telegramId, user, startDate, endDate, days, status = 'pending_pm', pm = null, requestType = 'regular', reason = '') {
  try {
    if (!doc) throw new Error('Google Sheets не підключено');
    
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['Vacations'];
    if (!sheet) {
      sheet = await doc.addSheet({
        title: 'Vacations',
        headerValues: [
          'RequestID', 'TelegramID', 'FullName', 'Department', 'Team', 'PM',
          'StartDate', 'EndDate', 'Days', 'Status', 'RequestType', 'Reason', 'CreatedAt', 'ApprovedBy', 'ApprovedAt'
        ]
      });
    }
    
    const requestId = `VAC_${Date.now()}_${telegramId}`;
    const pmName = pm ? pm.fullName : (user.pm || 'Не призначено');
    
    await sheet.addRow({
      RequestID: requestId,
      TelegramID: telegramId,
      FullName: user.fullName,
      Department: user.department,
      Team: user.team,
      PM: pmName,
      StartDate: startDate.toISOString().split('T')[0],
      EndDate: endDate.toISOString().split('T')[0],
      Days: days,
      Status: status,
      RequestType: requestType,
      Reason: reason || '',
      CreatedAt: new Date().toISOString(),
      ApprovedBy: '',
      ApprovedAt: ''
    });
    
    console.log(`✅ Збережено заявку на відпустку: ${requestId}, статус: ${status}, тип: ${requestType}`);
    return requestId;
  } catch (error) {
    console.error('❌ Помилка saveVacationRequest:', error);
    throw error;
  }
}

// Повідомлення PM про заявку на відпустку
/**
 * Відправляє повідомлення PM про нову заявку на відпустку
 * @param {User} user - Об'єкт користувача
 * @param {string} requestId - ID заявки на відпустку
 * @param {Date} startDate - Дата початку відпустки
 * @param {Date} endDate - Дата закінчення відпустки
 * @param {number} days - Кількість днів відпустки
 * @param {{telegramId: number, fullName: string}} pm - PM для користувача
 * @returns {Promise<void>}
 */
async function notifyPMAboutVacationRequest(user, requestId, startDate, endDate, days, pm) {
  try {
    if (!pm || !pm.telegramId) return;
    
    const message = `📋 <b>Нова заявка на відпустку</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ/Команда:</b> ${user.department}/${user.team}\n📅 <b>Період:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n📊 <b>Днів:</b> ${days}\n🆔 <b>ID заявки:</b> ${requestId}\n\n⏳ <b>Потребує підтвердження PM</b>`;
    
    await sendMessage(pm.telegramId, message);
    
    // Логування
    await logUserData(user.telegramId, 'pm_notification', {
      requestId,
      pm: pm.fullName,
      pmTelegramId: pm.telegramId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days
    });
  } catch (error) {
    console.error('❌ Помилка notifyPMAboutVacationRequest:', error);
  }
}

// Повідомлення HR про нову заявку на відпустку
/**
 * Відправляє повідомлення HR про нову заявку на відпустку з інформацією про пересічення та кнопками підтвердження
 * @param {User} user - Об'єкт користувача
 * @param {string} requestId - ID заявки на відпустку
 * @param {Date} startDate - Дата початку відпустки
 * @param {Date} endDate - Дата закінчення відпустки
 * @param {number} days - Кількість днів відпустки
 * @param {Array} conflicts - Масив конфліктів (пересічень) з іншими відпустками
 * @param {boolean} canApprove - Чи може HR одразу підтвердити (якщо немає PM)
 * @returns {Promise<void>}
 */
async function notifyHRAboutVacationRequest(user, requestId, startDate, endDate, days, conflicts = [], canApprove = false) {
  try {
    if (!HR_CHAT_ID) return;
    
    let message = `📋 <b>НОВА ЗАЯВКА НА ВІДПУСТКУ</b>\n\n`;
    message += `👤 <b>Співробітник:</b> ${user.fullName}\n`;
    message += `🏢 <b>Відділ:</b> ${user.department}\n`;
    message += `👥 <b>Команда:</b> ${user.team}\n`;
    message += `📅 <b>Період:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n`;
    message += `📊 <b>Днів:</b> ${days}\n`;
    message += `👤 <b>PM:</b> ${user.pm || 'Не призначено'}\n`;
    message += `🆔 <b>ID заявки:</b> ${requestId}\n\n`;
    
    // Додаємо інформацію про пересічення
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
    
    // Створюємо клавіатуру з кнопками для HR
    const keyboard = {
      inline_keyboard: []
    };
    
    if (canApprove) {
      // Якщо немає PM - HR може одразу підтвердити або відхилити
      keyboard.inline_keyboard.push([
        { text: '✅ Підтвердити', callback_data: `vacation_hr_approve_${requestId}` },
        { text: '❌ Відхилити', callback_data: `vacation_hr_reject_${requestId}` }
      ]);
    }
    
    await sendMessage(HR_CHAT_ID, message, keyboard);
    
    // Логування
    await logUserData(user.telegramId, 'hr_notification', {
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
    console.error('❌ Помилка notifyHRAboutVacationRequest:', error);
  }
}

// Повідомлення HR про екстрену відпустку
/**
 * Відправляє повідомлення HR про екстрену відпустку з конфіденційною інформацією
 * @param {User} user - Об'єкт користувача
 * @param {string} requestId - ID заявки
 * @param {Date} startDate - Дата початку
 * @param {Date} endDate - Дата закінчення
 * @param {number} days - Кількість днів
 * @param {string} reason - Причина (конфіденційна)
 * @returns {Promise<void>}
 */
async function notifyHRAboutEmergencyVacation(user, requestId, startDate, endDate, days, reason) {
  try {
    if (!HR_CHAT_ID) return;
    
    let message = `🚨 <b>ЕКСТРЕНА ВІДПУСТКА</b>\n\n`;
    message += `👤 <b>Співробітник:</b> ${user.fullName}\n`;
    message += `🏢 <b>Відділ:</b> ${user.department}\n`;
    message += `👥 <b>Команда:</b> ${user.team}\n`;
    message += `📅 <b>Період:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n`;
    message += `📊 <b>Днів:</b> ${days}\n`;
    message += `🆔 <b>ID заявки:</b> ${requestId}\n\n`;
    message += `🔒 <b>КОНФІДЕНЦІЙНА ІНФОРМАЦІЯ</b>\n`;
    message += `📝 <b>Причина:</b> ${reason}\n\n`;
    message += `⚠️ Ця інформація доступна тільки HR і CEO агенції.\n\n`;
    message += `⏳ <b>Потребує негайного розгляду</b>`;
    
    // Створюємо клавіатуру з кнопками для HR
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Підтвердити', callback_data: `vacation_hr_approve_${requestId}` },
          { text: '❌ Відхилити', callback_data: `vacation_hr_reject_${requestId}` }
        ]
      ]
    };
    
    await sendMessage(HR_CHAT_ID, message, keyboard);
    
    // Логування
    await logUserData(user.telegramId, 'emergency_vacation_hr_notification', {
      requestId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days,
      hasReason: !!reason
    });
  } catch (error) {
    console.error('❌ Помилка notifyHRAboutEmergencyVacation:', error);
  }
}

// Повідомлення HR про конфлікт
async function notifyHRAboutConflict(user, conflicts, startDate, endDate) {
  try {
    if (!HR_CHAT_ID) return;
    
    let message = `⚠️ <b>КОНФЛІКТ ВІДПУСТОК</b>\n\n👤 <b>Співробітник:</b> ${user.fullName} (${user.department}/${user.team})\n📅 <b>Запитувана дата:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n\n🔄 <b>Перетини з:</b>\n`;
    
    conflicts.forEach(conflict => {
      message += `• ${conflict.fullName} (${conflict.department}/${conflict.team}): ${conflict.startDate} - ${conflict.endDate}\n`;
    });
    
    await sendMessage(HR_CHAT_ID, message);
  } catch (error) {
    console.error('❌ Помилка notifyHRAboutConflict:', error);
  }
}

// Обробка підтвердження/відхилення відпустки HR
/**
 * Обробляє підтвердження або відхилення відпустки від HR
 * @param {number} chatId - ID чату HR
 * @param {number} hrTelegramId - Telegram ID HR
 * @param {string} requestId - ID заявки на відпустку
 * @param {boolean} approved - true якщо підтверджено, false якщо відхилено
 * @returns {Promise<void>}
 */
async function handleHRVacationApproval(chatId, telegramId, requestId, approved) {
  try {
    // Перевіряємо чи це HR
    const role = await getUserRole(telegramId);
    if (role !== 'HR' && role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }
    
    if (!doc) {
      await sendMessage(chatId, '❌ Помилка: Google Sheets не підключено.');
      return;
    }
    
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['Vacations'];
    if (!sheet) {
      await sendMessage(chatId, '❌ Помилка: Таблиця відпусток не знайдена.');
      return;
    }
    
    // Шукаємо заявку
    const rows = await sheet.getRows();
    const requestRow = rows.find(row => row.get('RequestID') === requestId);
    
    if (!requestRow) {
      await sendMessage(chatId, `❌ Заявка з ID ${requestId} не знайдена.`);
      return;
    }
    
    // Оновлюємо статус
    const newStatus = approved ? 'approved' : 'rejected';
    requestRow.set('Status', newStatus);
    requestRow.set('ApprovedBy', telegramId);
    requestRow.set('ApprovedAt', new Date().toISOString());
    await requestRow.save();
    
    // Отримуємо дані заявки
    const userTelegramId = parseInt(requestRow.get('TelegramID'));
    const userFullName = requestRow.get('FullName');
    const startDate = requestRow.get('StartDate');
    const endDate = requestRow.get('EndDate');
    const days = requestRow.get('Days');
    
    // Повідомляємо HR про успіх
    const hrMessage = approved 
      ? `✅ <b>Заявку підтверджено!</b>\n\n👤 <b>Співробітник:</b> ${userFullName}\n📅 <b>Період:</b> ${startDate} - ${endDate}\n📊 <b>Днів:</b> ${days}\n🆔 <b>ID:</b> ${requestId}`
      : `❌ <b>Заявку відхилено</b>\n\n👤 <b>Співробітник:</b> ${userFullName}\n📅 <b>Період:</b> ${startDate} - ${endDate}\n📊 <b>Днів:</b> ${days}\n🆔 <b>ID:</b> ${requestId}`;
    
    await sendMessage(chatId, hrMessage);
    
    // Повідомляємо користувача про результат
    if (userTelegramId) {
      const userMessage = approved
        ? `✅ <b>Вашу заявку на відпустку підтверджено!</b>\n\n📅 <b>Період:</b> ${startDate} - ${endDate}\n📊 <b>Днів:</b> ${days}\n\nВідпочивайте! 🏖️`
        : `❌ <b>Вашу заявку на відпустку відхилено</b>\n\n📅 <b>Період:</b> ${startDate} - ${endDate}\n📊 <b>Днів:</b> ${days}\n\nБудь ласка, зверніться до HR для уточнення.`;
      
      try {
        await sendMessage(userTelegramId, userMessage);
      } catch (error) {
        console.error('❌ Помилка відправки повідомлення користувачу:', error);
      }
    }
    
    // Логування
    await logUserData(userTelegramId, 'hr_vacation_decision', {
      requestId,
      approved,
      hrTelegramId: telegramId,
      status: newStatus
    });
    
    console.log(`✅ Заявка ${requestId} ${approved ? 'підтверджена' : 'відхилена'} HR (${telegramId})`);
    
  } catch (error) {
    console.error('❌ Помилка handleHRVacationApproval:', error);
    await sendMessage(chatId, '❌ Помилка обробки заявки. Спробуйте пізніше.');
  }
}

// Збереження спізнення
async function saveLateRecord(telegramId, user, date, reason = '', time = '') {
  try {
    if (!doc) return;
    
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['Lates'];
    if (!sheet) {
      sheet = await doc.addSheet({
        title: 'Lates',
        headerValues: [
          'TelegramID', 'FullName', 'Department', 'Team', 'Date', 'Time', 'Reason', 'CreatedAt'
        ]
      });
    }
    
    await sheet.addRow({
      TelegramID: telegramId,
      FullName: user.fullName,
      Department: user.department,
      Team: user.team,
      Date: date.toISOString().split('T')[0],
      Time: time,
      Reason: reason,
      CreatedAt: new Date().toISOString()
    });
    
    console.log(`✅ Збережено спізнення: ${user.fullName} - ${date.toISOString().split('T')[0]} ${time}`);
  } catch (error) {
    console.error('❌ Помилка saveLateRecord:', error);
  }
}

// Збереження remote запису
async function saveRemoteRecord(telegramId, user, date, type = 'remote') {
  try {
    if (!doc) return;
    
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['Remotes'];
    if (!sheet) {
      sheet = await doc.addSheet({
        title: 'Remotes',
        headerValues: [
          'TelegramID', 'FullName', 'Department', 'Team', 'Date', 'Type', 'CreatedAt'
        ]
      });
    }
    
    await sheet.addRow({
      TelegramID: telegramId,
      FullName: user.fullName,
      Department: user.department,
      Team: user.team,
      Date: date.toISOString().split('T')[0],
      Type: type,
      CreatedAt: new Date().toISOString()
    });
    
    console.log(`✅ Збережено remote: ${user.fullName} - ${date.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error('❌ Помилка saveRemoteRecord:', error);
  }
}

// Оновлення балансу відпусток
async function updateVacationBalance(telegramId, user, usedDays) {
  try {
    if (!doc) return;
    
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['VacationBalance'];
    if (!sheet) {
      sheet = await doc.addSheet({
        title: 'VacationBalance',
        headerValues: [
          'TelegramID', 'FullName', 'Department', 'Team', 'TotalDays', 'UsedDays', 'AvailableDays', 'LastUpdated'
        ]
      });
    }
    
    // Знаходимо існуючий запис або створюємо новий
    const rows = await sheet.getRows();
    let existingRow = rows.find(row => row.TelegramID === telegramId.toString());
    
    if (existingRow) {
      existingRow.UsedDays = (parseInt(existingRow.UsedDays) || 0) + usedDays;
      existingRow.AvailableDays = existingRow.TotalDays - existingRow.UsedDays;
      existingRow.LastUpdated = new Date().toISOString();
      await existingRow.save();
    } else {
      await sheet.addRow({
        TelegramID: telegramId,
        FullName: user.fullName,
        Department: user.department,
        Team: user.team,
        TotalDays: 24,
        UsedDays: usedDays,
        AvailableDays: 24 - usedDays,
        LastUpdated: new Date().toISOString()
      });
    }
    
    console.log(`✅ Оновлено баланс відпусток: ${user.fullName} - використано ${usedDays} днів`);
  } catch (error) {
    console.error('❌ Помилка updateVacationBalance:', error);
  }
}

// Форматування дати
// 📤 ЕКСПОРТ ДАНИХ ДЛЯ HR/CEO

// 📤 Меню експорту для HR
async function showHRExportMenu(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR' && role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR та CEO.');
      return;
    }
    
    const text = `📤 <b>Експорт даних</b>

Оберіть тип експорту:`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '👤 По працівнику', callback_data: 'hr_export_employee' },
          { text: '🏢 По відділу', callback_data: 'hr_export_department' }
        ],
        [
          { text: '⬅️ Назад до HR панелі', callback_data: 'hr_panel' }
        ]
      ]
    };
    
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showHRExportMenu:', error);
  }
}

// 📤 Меню експорту для CEO
async function showCEOExportMenu(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для CEO.');
      return;
    }
    
    const text = `📤 <b>Експорт даних</b>

Оберіть тип експорту:`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '👤 По працівнику', callback_data: 'ceo_export_employee' },
          { text: '🏢 По відділу', callback_data: 'ceo_export_department' }
        ],
        [
          { text: '⬅️ Назад до CEO панелі', callback_data: 'ceo_panel' }
        ]
      ]
    };
    
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showCEOExportMenu:', error);
  }
}

// 📤 Експорт даних по працівнику (HR)
async function showHRExportEmployee(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR' && role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено.');
      return;
    }
    
    if (!doc) {
      await sendMessage(chatId, '❌ Google Sheets не підключено.');
      return;
    }
    
    await doc.loadInfo();
    const employeesSheet = doc.sheetsByTitle['Employees'];
    if (!employeesSheet) {
      await sendMessage(chatId, '❌ Таблиця працівників не знайдена.');
      return;
    }
    
    const rows = await employeesSheet.getRows();
    const employees = rows.map(row => ({
      telegramId: row.get('TelegramID'),
      fullName: row.get('FullName'),
      department: row.get('Department'),
      team: row.get('Team')
    })).filter(emp => emp.telegramId);
    
    if (employees.length === 0) {
      await sendMessage(chatId, '❌ Працівники не знайдені.');
      return;
    }
    
    // Групуємо по відділах для зручності
    const departments = {};
    employees.forEach(emp => {
      if (!departments[emp.department]) {
        departments[emp.department] = [];
      }
      departments[emp.department].push(emp);
    });
    
    let text = `👤 <b>Експорт даних по працівнику</b>\n\n`;
    text += `Оберіть працівника:\n\n`;
    
    const keyboard = {
      inline_keyboard: []
    };
    
    Object.keys(departments).forEach(dept => {
      text += `🏢 <b>${dept}</b>\n`;
      departments[dept].forEach(emp => {
        const callbackData = `hr_export_emp_${emp.telegramId}`;
        keyboard.inline_keyboard.push([
          { text: `👤 ${emp.fullName} (${emp.team})`, callback_data: callbackData }
        ]);
      });
      text += `\n`;
    });
    
    keyboard.inline_keyboard.push([
      { text: '⬅️ Назад', callback_data: 'hr_export' }
    ]);
    
    // Розбиваємо на кілька повідомлень, якщо кнопок багато
    if (keyboard.inline_keyboard.length > 10) {
      await sendMessage(chatId, text.substring(0, 4000));
      // Відправляємо кнопки окремо
      const buttonsKeyboard = {
        inline_keyboard: keyboard.inline_keyboard.slice(0, 10).concat([
          [{ text: '⬅️ Назад', callback_data: 'hr_export' }]
        ])
      };
      await sendMessage(chatId, 'Оберіть працівника:', buttonsKeyboard);
    } else {
      await sendMessage(chatId, text, keyboard);
    }
  } catch (error) {
    console.error('❌ Помилка showHRExportEmployee:', error);
    await sendMessage(chatId, '❌ Помилка завантаження списку працівників.');
  }
}

// 📤 Експорт даних по працівнику (CEO)
async function showCEOExportEmployee(chatId, telegramId) {
  // Використовуємо ту саму логіку, що й для HR
  await showHRExportEmployee(chatId, telegramId);
}

// 📤 Експорт даних по відділу (HR)
async function showHRExportDepartment(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR' && role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено.');
      return;
    }
    
    if (!doc) {
      await sendMessage(chatId, '❌ Google Sheets не підключено.');
      return;
    }
    
    await doc.loadInfo();
    const employeesSheet = doc.sheetsByTitle['Employees'];
    if (!employeesSheet) {
      await sendMessage(chatId, '❌ Таблиця працівників не знайдена.');
      return;
    }
    
    const rows = await employeesSheet.getRows();
    const departments = new Set();
    rows.forEach(row => {
      const dept = row.get('Department');
      if (dept) departments.add(dept);
    });
    
    if (departments.size === 0) {
      await sendMessage(chatId, '❌ Відділи не знайдені.');
      return;
    }
    
    let text = `🏢 <b>Експорт даних по відділу</b>\n\n`;
    text += `Оберіть відділ:\n\n`;
    
    const keyboard = {
      inline_keyboard: []
    };
    
    Array.from(departments).sort().forEach(dept => {
      keyboard.inline_keyboard.push([
        { text: `🏢 ${dept}`, callback_data: `hr_export_dept_${dept}` }
      ]);
    });
    
    keyboard.inline_keyboard.push([
      { text: '⬅️ Назад', callback_data: 'hr_export' }
    ]);
    
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showHRExportDepartment:', error);
    await sendMessage(chatId, '❌ Помилка завантаження списку відділів.');
  }
}

// 📤 Експорт даних по відділу (CEO)
async function showCEOExportDepartment(chatId, telegramId) {
  // Використовуємо ту саму логіку, що й для HR
  await showHRExportDepartment(chatId, telegramId);
}

// 📊 Експорт даних конкретного працівника
async function exportEmployeeData(chatId, telegramId, targetTelegramId) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR' && role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено.');
      return;
    }
    
    if (!doc) {
      await sendMessage(chatId, '❌ Google Sheets не підключено.');
      return;
    }
    
    const user = await getUserInfo(targetTelegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Працівник не знайдений.');
      return;
    }
    
    await doc.loadInfo();
    
    // Збираємо дані про відпустки
    const vacationsSheet = doc.sheetsByTitle['Vacations'];
    const vacations = vacationsSheet ? (await vacationsSheet.getRows()).filter(row => 
      row.get('TelegramID') == targetTelegramId
    ) : [];
    
    // Збираємо дані про спізнення
    const lateSheet = doc.sheetsByTitle['Late'];
    const lateRecords = lateSheet ? (await lateSheet.getRows()).filter(row => 
      row.get('TelegramID') == targetTelegramId
    ) : [];
    
    // Збираємо дані про Remote
    const remoteSheet = doc.sheetsByTitle['Remote'];
    const remoteRecords = remoteSheet ? (await remoteSheet.getRows()).filter(row => 
      row.get('TelegramID') == targetTelegramId
    ) : [];
    
    // Збираємо дані про лікарняні
    const sickSheet = doc.sheetsByTitle['Sick'];
    const sickRecords = sickSheet ? (await sickSheet.getRows()).filter(row => 
      row.get('TelegramID') == targetTelegramId
    ) : [];
    
    // Формуємо звіт
    let report = `📊 <b>Звіт по працівнику</b>\n\n`;
    report += `👤 <b>Працівник:</b> ${user.fullName}\n`;
    report += `🏢 <b>Відділ:</b> ${user.department}\n`;
    report += `👥 <b>Команда:</b> ${user.team}\n`;
    report += `💼 <b>Посада:</b> ${user.position || 'Не вказано'}\n\n`;
    
    report += `🏖️ <b>ВІДПУСТКИ</b>\n`;
    report += `Загалом заявок: ${vacations.length}\n`;
    const approvedVacations = vacations.filter(v => v.get('Status') === 'approved');
    const usedDays = approvedVacations.reduce((sum, v) => sum + (parseInt(v.get('Days')) || 0), 0);
    report += `Затверджено: ${approvedVacations.length}\n`;
    report += `Використано днів: ${usedDays}\n\n`;
    
    if (vacations.length > 0) {
      report += `Останні 5 заявок:\n`;
      vacations.slice(-5).reverse().forEach(v => {
        const status = v.get('Status');
        const statusEmoji = status === 'approved' ? '✅' : status === 'rejected' ? '❌' : '⏳';
        report += `${statusEmoji} ${v.get('StartDate')} - ${v.get('EndDate')} (${v.get('Days')} днів) - ${status}\n`;
      });
      report += `\n`;
    }
    
    report += `⏰ <b>СПІЗНЕННЯ</b>\n`;
    report += `Загалом записів: ${lateRecords.length}\n`;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const thisMonthLate = lateRecords.filter(r => {
      const date = new Date(r.get('Date'));
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    report += `У поточному місяці: ${thisMonthLate.length}\n\n`;
    
    report += `🏠 <b>REMOTE</b>\n`;
    report += `Загалом записів: ${remoteRecords.length}\n`;
    const thisMonthRemote = remoteRecords.filter(r => {
      const date = new Date(r.get('Date'));
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    report += `У поточному місяці: ${thisMonthRemote.length}\n\n`;
    
    report += `🏥 <b>ЛІКАРНЯНІ</b>\n`;
    report += `Загалом записів: ${sickRecords.length}\n`;
    const thisMonthSick = sickRecords.filter(r => {
      const date = new Date(r.get('Date'));
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    report += `У поточному місяці: ${thisMonthSick.length}\n`;
    
    // Розбиваємо на частини, якщо занадто довгий
    if (report.length > 4000) {
      const parts = report.match(/.{1,4000}/g) || [];
      for (const part of parts) {
        await sendMessage(chatId, part);
      }
    } else {
      await sendMessage(chatId, report);
    }
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '⬅️ Назад', callback_data: role === 'CEO' ? 'ceo_export' : 'hr_export' }]
      ]
    };
    await sendMessage(chatId, 'Оберіть наступну дію:', keyboard);
    
  } catch (error) {
    console.error('❌ Помилка exportEmployeeData:', error);
    await sendMessage(chatId, '❌ Помилка експорту даних.');
  }
}

// 📊 Експорт даних по відділу
async function exportDepartmentData(chatId, telegramId, department) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR' && role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено.');
      return;
    }
    
    if (!doc) {
      await sendMessage(chatId, '❌ Google Sheets не підключено.');
      return;
    }
    
    await doc.loadInfo();
    
    // Отримуємо всіх працівників відділу
    const employeesSheet = doc.sheetsByTitle['Employees'];
    if (!employeesSheet) {
      await sendMessage(chatId, '❌ Таблиця працівників не знайдена.');
      return;
    }
    
    const rows = await employeesSheet.getRows();
    const employees = rows.filter(row => row.get('Department') === department);
    
    if (employees.length === 0) {
      await sendMessage(chatId, `❌ У відділі ${department} немає працівників.`);
      return;
    }
    
    // Збираємо статистику
    let report = `📊 <b>Звіт по відділу: ${department}</b>\n\n`;
    report += `👥 <b>Кількість працівників:</b> ${employees.length}\n\n`;
    
    // Статистика по відпустках
    const vacationsSheet = doc.sheetsByTitle['Vacations'];
    const departmentVacations = vacationsSheet ? (await vacationsSheet.getRows()).filter(row => 
      row.get('Department') === department
    ) : [];
    
    report += `🏖️ <b>ВІДПУСТКИ</b>\n`;
    report += `Загалом заявок: ${departmentVacations.length}\n`;
    const approvedVac = departmentVacations.filter(v => v.get('Status') === 'approved');
    report += `Затверджено: ${approvedVac.length}\n`;
    const usedDays = approvedVac.reduce((sum, v) => sum + (parseInt(v.get('Days')) || 0), 0);
    report += `Використано днів: ${usedDays}\n\n`;
    
    // Статистика по спізненнях
    const lateSheet = doc.sheetsByTitle['Late'];
    const departmentLate = lateSheet ? (await lateSheet.getRows()).filter(row => {
      const empTelegramId = row.get('TelegramID');
      return employees.some(emp => emp.get('TelegramID') == empTelegramId);
    }) : [];
    
    report += `⏰ <b>СПІЗНЕННЯ</b>\n`;
    report += `Загалом записів: ${departmentLate.length}\n`;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const thisMonthLate = departmentLate.filter(r => {
      const date = new Date(r.get('Date'));
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    report += `У поточному місяці: ${thisMonthLate.length}\n\n`;
    
    // Статистика по Remote
    const remoteSheet = doc.sheetsByTitle['Remote'];
    const departmentRemote = remoteSheet ? (await remoteSheet.getRows()).filter(row => {
      const empTelegramId = row.get('TelegramID');
      return employees.some(emp => emp.get('TelegramID') == empTelegramId);
    }) : [];
    
    report += `🏠 <b>REMOTE</b>\n`;
    report += `Загалом записів: ${departmentRemote.length}\n`;
    const thisMonthRemote = departmentRemote.filter(r => {
      const date = new Date(r.get('Date'));
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    report += `У поточному місяці: ${thisMonthRemote.length}\n\n`;
    
    // Статистика по лікарняних
    const sickSheet = doc.sheetsByTitle['Sick'];
    const departmentSick = sickSheet ? (await sickSheet.getRows()).filter(row => {
      const empTelegramId = row.get('TelegramID');
      return employees.some(emp => emp.get('TelegramID') == empTelegramId);
    }) : [];
    
    report += `🏥 <b>ЛІКАРНЯНІ</b>\n`;
    report += `Загалом записів: ${departmentSick.length}\n`;
    const thisMonthSick = departmentSick.filter(r => {
      const date = new Date(r.get('Date'));
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    report += `У поточному місяці: ${thisMonthSick.length}\n`;
    
    // Розбиваємо на частини, якщо занадто довгий
    if (report.length > 4000) {
      const parts = report.match(/.{1,4000}/g) || [];
      for (const part of parts) {
        await sendMessage(chatId, part);
      }
    } else {
      await sendMessage(chatId, report);
    }
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '⬅️ Назад', callback_data: role === 'CEO' ? 'ceo_export' : 'hr_export' }]
      ]
    };
    await sendMessage(chatId, 'Оберіть наступну дію:', keyboard);
    
  } catch (error) {
    console.error('❌ Помилка exportDepartmentData:', error);
    await sendMessage(chatId, '❌ Помилка експорту даних.');
  }
}

function formatDate(date) {
  return date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// Логування даних користувачів
async function logUserData(telegramId, action, data = {}) {
  try {
    if (!doc) return;
    
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['UserLogs'];
    if (!sheet) {
      sheet = await doc.addSheet({ 
        title: 'UserLogs', 
        headerValues: ['Timestamp', 'TelegramID', 'Action', 'Data', 'UserInfo'] 
      });
    }
    
    const user = await getUserInfo(telegramId);
    const userInfo = user ? `${user.fullName} (${user.department}/${user.team})` : 'Unknown';
    
    await sheet.addRow({
      Timestamp: new Date().toISOString(),
      TelegramID: telegramId,
      Action: action,
      Data: JSON.stringify(data),
      UserInfo: userInfo
    });
    
    console.log(`📝 Logged: ${telegramId} - ${action}`);
  } catch (error) {
    console.error('❌ Помилка logUserData:', error);
  }
}

// ⏰ ОБРОБКА СПІЗНЕНЬ
async function handleLateProcess(chatId, telegramId, text) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) return false;
    
    if (regData.step === 'late_date') {
      const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
      const match = text.match(dateRegex);
      if (!match) {
        await sendMessage(chatId, '❌ Невірний формат дати. Використовуйте ДД.ММ.РРРР');
        return true;
      }
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const year = parseInt(match[3]);
      const date = new Date(year, month - 1, day);
      if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
        await sendMessage(chatId, '❌ Невірна дата.');
        return true;
      }
      regData.data.date = date;
      regData.step = 'late_time';
      await sendMessage(chatId, '⏰ <b>О котрій годині ви почнете працювати?</b>\n\nВведіть час у форматі ГГ:ХХ (наприклад: 12:30):');
      return true;
    }
    
    if (regData.step === 'late_time') {
      const timeRegex = /^(\d{1,2}):(\d{2})$/;
      const match = text.match(timeRegex);
      if (!match) {
        await sendMessage(chatId, '❌ Невірний формат часу. Використовуйте ГГ:ХХ (наприклад: 12:30)');
        return true;
      }
      regData.data.time = text;
      regData.step = 'late_reason';
      await sendMessage(chatId, '📝 <b>Вкажіть причину спізнення:</b>');
      return true;
    }
    
    if (regData.step === 'late_reason') {
      if (!text || text.trim().length < 3) {
        await sendMessage(chatId, '❌ Будь ласка, вкажіть причину (мінімум 3 символи).');
        return true;
      }
      regData.data.reason = text.trim();
      await processLateReport(chatId, telegramId, regData.data);
      registrationCache.delete(telegramId);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Помилка handleLateProcess:', error);
    return false;
  }
}

async function reportLate(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений.');
      return;
    }
    
    registrationCache.set(telegramId, {
      step: 'late_date',
      data: {}
    });
    
    await sendMessage(chatId, '⏰ <b>Повідомлення про спізнення</b>\n\n📅 <b>Вкажіть дату спізнення</b> (ДД.ММ.РРРР):\n\nЯкщо спізнення сьогодні, введіть сьогоднішню дату.');
  } catch (error) {
    console.error('❌ Помилка reportLate:', error);
  }
}

async function processLateReport(chatId, telegramId, lateData) {
  try {
    const user = await getUserInfo(telegramId);
    if (!user) {
      throw new ValidationError('Користувач не знайдений.', 'user');
    }
    
    const { date, time, reason } = lateData;
    const recordId = await saveLateRecord(telegramId, user, date, reason, time);
    
    // Перевіряємо чи є PM
    const pm = await getPMForUser(user);
    if (pm) {
      await notifyPMAboutLate(user, date, time, reason);
    }
    await notifyHRAboutLate(user, date, time, reason, pm !== null);
    
    await sendMessage(chatId, `✅ <b>Повідомлення про спізнення відправлено!</b>\n\n📅 <b>Дата:</b> ${formatDate(date)}\n⏰ <b>Час початку роботи:</b> ${time}\n📝 <b>Причина:</b> ${reason}`);
  } catch (error) {
    console.error('❌ Помилка processLateReport:', error);
    await sendMessage(chatId, '❌ Помилка обробки спізнення.');
  }
}

async function notifyPMAboutLate(user, date, time, reason) {
  try {
    const pm = await getPMForUser(user);
    if (!pm || !pm.telegramId) return;
    
    const message = `⏰ <b>Спізнення</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ/Команда:</b> ${user.department}/${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}\n⏰ <b>Час початку:</b> ${time}\n📝 <b>Причина:</b> ${reason}`;
    await sendMessage(pm.telegramId, message);
  } catch (error) {
    console.error('❌ Помилка notifyPMAboutLate:', error);
  }
}

async function notifyHRAboutLate(user, date, time, reason, hasPM) {
  try {
    if (!HR_CHAT_ID) return;
    
    const message = `⏰ <b>ПОВІДОМЛЕННЯ ПРО СПІЗНЕННЯ</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ:</b> ${user.department}\n👥 <b>Команда:</b> ${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}\n⏰ <b>Час початку роботи:</b> ${time}\n📝 <b>Причина:</b> ${reason}\n\n${hasPM ? '✅ PM вже повідомлено' : '⚠️ PM не призначено'}`;
    await sendMessage(HR_CHAT_ID, message);
  } catch (error) {
    console.error('❌ Помилка notifyHRAboutLate:', error);
  }
}

async function showLateStats(chatId, telegramId) {
  try {
    const stats = await getLateStatsForCurrentMonth(telegramId);
    const text = `📊 <b>Статистика спізнень за поточний місяць</b>\n\n⏰ <b>Кількість спізнень:</b> ${stats.count}\n⚠️ <b>Ліміт:</b> 7 спізнень/місяць\n\n${stats.count >= 7 ? '⚠️ Досягнуто ліміт спізнень!' : `✅ Залишилось: ${7 - stats.count}`}`;
    await sendMessage(chatId, text);
  } catch (error) {
    console.error('❌ Помилка showLateStats:', error);
  }
}

async function getLateStatsForCurrentMonth(telegramId) {
  try {
    if (!doc) return { count: 0 };
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Lates'];
    if (!sheet) return { count: 0 };
    
    const rows = await sheet.getRows();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const userLate = rows.filter(row => {
      if (row.get('TelegramID') != telegramId) return false;
      const rowDate = new Date(row.get('Date'));
      return rowDate.getMonth() === currentMonth && rowDate.getFullYear() === currentYear;
    });
    
    return { count: userLate.length };
  } catch (error) {
    console.error('❌ Помилка getLateStatsForCurrentMonth:', error);
    return { count: 0 };
  }
}

// 🏠 ОБРОБКА REMOTE
async function handleRemoteProcess(chatId, telegramId, text) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) return false;
    
    if (regData.step === 'remote_date') {
      const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
      const match = text.match(dateRegex);
      if (!match) {
        await sendMessage(chatId, '❌ Невірний формат дати. Використовуйте ДД.ММ.РРРР');
        return true;
      }
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const year = parseInt(match[3]);
      const date = new Date(year, month - 1, day);
      if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
        await sendMessage(chatId, '❌ Невірна дата.');
        return true;
      }
      
      // Перевірка: повідомлення має бути до 19:00 попереднього дня
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Якщо дата Remote сьогодні або в минулому - не дозволяємо
      if (date < today) {
        await sendMessage(chatId, '⚠️ Не можна вказати дату в минулому.');
        return true;
      }
      
      // Якщо дата Remote завтра або раніше - перевіряємо час
      if (date <= tomorrow) {
        const currentHour = now.getHours();
        if (currentHour >= 19 && date.getTime() === tomorrow.getTime()) {
          await sendMessage(chatId, '⚠️ Повідомлення про Remote на завтра має бути до 19:00 сьогодні.');
          return true;
        }
      }
      
      regData.data.date = date;
      await processRemoteRequest(chatId, telegramId, regData.data);
      registrationCache.delete(telegramId);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Помилка handleRemoteProcess:', error);
    return false;
  }
}

async function setRemoteToday(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений.');
      return;
    }
    
    registrationCache.set(telegramId, {
      step: 'remote_date',
      data: { type: 'today' }
    });
    
    await sendMessage(chatId, '🏠 <b>Remote робота</b>\n\n📅 <b>Вкажіть дату Remote роботи</b> (ДД.ММ.РРРР):\n\n⚠️ Повідомлення має бути до 19:00 дня передуючого залишенню вдома.');
  } catch (error) {
    console.error('❌ Помилка setRemoteToday:', error);
  }
}

async function processRemoteRequest(chatId, telegramId, remoteData) {
  try {
    const user = await getUserInfo(telegramId);
    if (!user) {
      throw new ValidationError('Користувач не знайдений.', 'user');
    }
    
    const { date } = remoteData;
    await saveRemoteRecord(telegramId, user, date);
    
    // Перевіряємо чи є PM
    const pm = await getPMForUser(user);
    if (pm) {
      await notifyPMAboutRemote(user, date);
    }
    await notifyHRAboutRemote(user, date, pm !== null);
    
    await sendMessage(chatId, `✅ <b>Повідомлення про Remote роботу відправлено!</b>\n\n📅 <b>Дата:</b> ${formatDate(date)}`);
  } catch (error) {
    console.error('❌ Помилка processRemoteRequest:', error);
    await sendMessage(chatId, '❌ Помилка обробки Remote запиту.');
  }
}

async function notifyPMAboutRemote(user, date) {
  try {
    const pm = await getPMForUser(user);
    if (!pm || !pm.telegramId) return;
    
    const message = `🏠 <b>Remote робота</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ/Команда:</b> ${user.department}/${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}`;
    await sendMessage(pm.telegramId, message);
  } catch (error) {
    console.error('❌ Помилка notifyPMAboutRemote:', error);
  }
}

async function notifyHRAboutRemote(user, date, hasPM) {
  try {
    if (!HR_CHAT_ID) return;
    
    const message = `🏠 <b>REMOTE РОБОТА</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ:</b> ${user.department}\n👥 <b>Команда:</b> ${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}\n\n${hasPM ? '✅ PM вже повідомлено' : '⚠️ PM не призначено'}`;
    await sendMessage(HR_CHAT_ID, message);
  } catch (error) {
    console.error('❌ Помилка notifyHRAboutRemote:', error);
  }
}

async function showRemoteCalendar(chatId, telegramId) {
  try {
    await sendMessage(chatId, '📅 Календар Remote роботи в розробці.');
  } catch (error) {
    console.error('❌ Помилка showRemoteCalendar:', error);
  }
}

async function showRemoteStats(chatId, telegramId) {
  try {
    const stats = await getRemoteStatsForCurrentMonth(telegramId);
    const text = `📊 <b>Статистика Remote роботи за поточний місяць</b>\n\n🏠 <b>Використано днів:</b> ${stats.used}`;
    await sendMessage(chatId, text);
  } catch (error) {
    console.error('❌ Помилка showRemoteStats:', error);
  }
}

async function getRemoteStatsForCurrentMonth(telegramId) {
  try {
    if (!doc) return { used: 0 };
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Remotes'];
    if (!sheet) return { used: 0 };
    
    const rows = await sheet.getRows();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const userRemote = rows.filter(row => {
      if (row.get('TelegramID') != telegramId) return false;
      const rowDate = new Date(row.get('Date'));
      return rowDate.getMonth() === currentMonth && rowDate.getFullYear() === currentYear;
    });
    
    return { used: userRemote.length };
  } catch (error) {
    console.error('❌ Помилка getRemoteStatsForCurrentMonth:', error);
    return { used: 0 };
  }
}

// 🏥 ОБРОБКА ЛІКАРНЯНОГО
async function handleSickProcess(chatId, telegramId, text) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) return false;
    
    if (regData.step === 'sick_date') {
      const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
      const match = text.match(dateRegex);
      if (!match) {
        await sendMessage(chatId, '❌ Невірний формат дати. Використовуйте ДД.ММ.РРРР');
        return true;
      }
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const year = parseInt(match[3]);
      const date = new Date(year, month - 1, day);
      if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
        await sendMessage(chatId, '❌ Невірна дата.');
        return true;
      }
      regData.data.date = date;
      await processSickReport(chatId, telegramId, regData.data);
      registrationCache.delete(telegramId);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Помилка handleSickProcess:', error);
    return false;
  }
}

async function reportSick(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений.');
      return;
    }
    
    registrationCache.set(telegramId, {
      step: 'sick_date',
      data: {}
    });
    
    await sendMessage(chatId, '🏥 <b>Лікарняний</b>\n\n📅 <b>Вкажіть дату лікарняного</b> (ДД.ММ.РРРР):');
  } catch (error) {
    console.error('❌ Помилка reportSick:', error);
  }
}

async function processSickReport(chatId, telegramId, sickData) {
  try {
    const user = await getUserInfo(telegramId);
    if (!user) {
      throw new ValidationError('Користувач не знайдений.', 'user');
    }
    
    const { date } = sickData;
    await saveSickRecord(telegramId, user, date);
    
    // Перевіряємо чи є PM
    const pm = await getPMForUser(user);
    if (pm) {
      await notifyPMAboutSick(user, date);
    }
    await notifyHRAboutSick(user, date, pm !== null);
    
    await sendMessage(chatId, `✅ <b>Повідомлення про лікарняний відправлено!</b>\n\n📅 <b>Дата:</b> ${formatDate(date)}\n\nОдужуйте! 🏥`);
  } catch (error) {
    console.error('❌ Помилка processSickReport:', error);
    await sendMessage(chatId, '❌ Помилка обробки лікарняного.');
  }
}

async function notifyPMAboutSick(user, date) {
  try {
    const pm = await getPMForUser(user);
    if (!pm || !pm.telegramId) return;
    
    const message = `🏥 <b>Лікарняний</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ/Команда:</b> ${user.department}/${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}`;
    await sendMessage(pm.telegramId, message);
  } catch (error) {
    console.error('❌ Помилка notifyPMAboutSick:', error);
  }
}

async function notifyHRAboutSick(user, date, hasPM) {
  try {
    if (!HR_CHAT_ID) return;
    
    const message = `🏥 <b>ЛІКАРНЯНИЙ</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ:</b> ${user.department}\n👥 <b>Команда:</b> ${user.team}\n📅 <b>Дата:</b> ${formatDate(date)}\n\n${hasPM ? '✅ PM вже повідомлено' : '⚠️ PM не призначено'}`;
    await sendMessage(HR_CHAT_ID, message);
  } catch (error) {
    console.error('❌ Помилка notifyHRAboutSick:', error);
  }
}

async function showSickStats(chatId, telegramId) {
  try {
    const stats = await getSickStatsForCurrentMonth(telegramId);
    const text = `📊 <b>Статистика лікарняних за поточний місяць</b>\n\n🏥 <b>Днів:</b> ${stats.days}\n📝 <b>Записів:</b> ${stats.count}`;
    await sendMessage(chatId, text);
  } catch (error) {
    console.error('❌ Помилка showSickStats:', error);
  }
}

async function getSickStatsForCurrentMonth(telegramId) {
  try {
    if (!doc) return { days: 0, count: 0 };
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Sick'];
    if (!sheet) return { days: 0, count: 0 };
    
    const rows = await sheet.getRows();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const userSick = rows.filter(row => {
      if (row.get('TelegramID') != telegramId) return false;
      const rowDate = new Date(row.get('Date'));
      return rowDate.getMonth() === currentMonth && rowDate.getFullYear() === currentYear;
    });
    
    return { days: userSick.length, count: userSick.length };
  } catch (error) {
    console.error('❌ Помилка getSickStatsForCurrentMonth:', error);
    return { days: 0, count: 0 };
  }
}

async function saveSickRecord(telegramId, user, date) {
  try {
    if (!doc) return;
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['Sick'];
    if (!sheet) {
      sheet = await doc.addSheet({
        title: 'Sick',
        headerValues: ['TelegramID', 'FullName', 'Department', 'Team', 'Date', 'CreatedAt']
      });
    }
    
    await sheet.addRow({
      TelegramID: telegramId,
      FullName: user.fullName,
      Department: user.department,
      Team: user.team,
      Date: date.toISOString().split('T')[0],
      CreatedAt: new Date().toISOString()
    });
    
    console.log(`✅ Збережено лікарняний: ${user.fullName} - ${date.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error('❌ Помилка saveSickRecord:', error);
  }
}

// 🚀 ЗАПУСК СЕРВЕРА
async function startServer() {
  try {
    // Запуск сервера НЕБЛОКУЮЧО
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 HR Bot Ultimate запущено на порту ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/`);
      console.log(`📨 Webhook: ${WEBHOOK_URL || 'не встановлено'}`);
    });
    
    // Обробка помилок сервера
    server.on('error', (error) => {
      console.error('❌ Помилка сервера:', error);
    });
    
    // Ініціалізація Google Sheets в фоні (неблокуюче)
    initGoogleSheets().catch(error => {
      console.error('❌ Помилка ініціалізації Google Sheets:', error);
      console.log('🔄 Спробуємо знову через 30 секунд...');
      setTimeout(() => initGoogleSheets(), 30000);
    });
    
    // Встановлення webhook в фоні (неблокуюче)
    if (WEBHOOK_URL) {
      const webhookUrl = `${WEBHOOK_URL}/webhook`;
      console.log('🔧 Встановлення webhook на URL:', webhookUrl);
      bot.setWebHook(webhookUrl)
        .then(() => {
          console.log('✅ Webhook встановлено успішно:', webhookUrl);
          // Перевірка webhook
          return bot.getWebHookInfo();
        })
        .then(info => {
          console.log('📊 Webhook info:', JSON.stringify(info, null, 2));
        })
        .catch(error => {
          console.error('❌ Помилка встановлення webhook:', error);
          console.error('❌ Stack:', error.stack);
        });
    } else {
      console.warn('⚠️ WEBHOOK_URL не встановлено в environment variables!');
      console.warn('⚠️ Бот не зможе отримувати повідомлення без webhook!');
    }
    
  } catch (error) {
    console.error('❌ Помилка запуску сервера:', error);
  }
}

// ✅ ГЛОБАЛЬНА ОБРОБКА ПОМИЛОК
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', reason, { 
    promise: promise.toString(),
    stack: reason?.stack 
  });
  
  // Не завершуємо процес для unhandled rejections
  // Краще логувати та продовжувати роботу
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception - Critical Error', error, {
    stack: error.stack,
    memory: process.memoryUsage()
  });
  
  // Для критичних помилок завершуємо процес
  setTimeout(() => {
    process.exit(1);
  }, 1000); // Даємо час на логування
});

// Обробка помилок Express
app.use((error, req, res, next) => {
  logger.error('Express error', error, {
    url: req.url,
    method: req.method,
    body: req.body
  });
  
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      timestamp: error.timestamp,
      context: error.context
    });
  } else {
    res.status(500).json({
      error: 'Internal Server Error',
      timestamp: new Date().toISOString()
    });
  }
});

// Запуск
startServer();

console.log('✅ HR Bot Ultimate server started successfully');
