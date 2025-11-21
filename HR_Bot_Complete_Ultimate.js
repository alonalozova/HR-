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
const navigationStack = require('./utils/navigation');
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

// 🔄 RETRY ЛОГІКА ДЛЯ GOOGLE SHEETS
/**
 * Виконує функцію з повторними спробами при помилках
 * @param {Function} fn - Функція для виконання
 * @param {number} maxRetries - Максимальна кількість спроб (за замовчуванням 3)
 * @param {number} delay - Затримка між спробами в мс (за замовчуванням 1000)
 * @returns {Promise<any>} Результат виконання функції
 */
async function withRetry(fn, maxRetries = 3, delay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries;
      const isRetryable = error.message?.includes('rate limit') || 
                         error.message?.includes('quota') ||
                         error.message?.includes('timeout') ||
                         error.code === 'ECONNRESET' ||
                         error.code === 'ETIMEDOUT';
      
      if (isLastAttempt || !isRetryable) {
        logger.error(`Retry failed after ${attempt} attempts`, error);
        throw error;
      }
      
      const waitTime = delay * Math.pow(2, attempt - 1); // Exponential backoff
      logger.warn(`Retry attempt ${attempt}/${maxRetries} after ${waitTime}ms`, { error: error.message });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  throw lastError;
}

// ⏱️ МОНІТОРИНГ ПРОДУКТИВНОСТІ
/**
 * Вимірює час виконання функції та логує результат
 * @param {Function} fn - Функція для виконання
 * @param {string} operationName - Назва операції для логування
 * @param {Object} context - Контекст для логування
 * @returns {Promise<any>} Результат виконання функції
 */
async function withPerformanceMonitor(fn, operationName, context = {}) {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    logger.info(`Performance: ${operationName}`, { 
      duration: `${duration}ms`,
      ...context 
    });
    
    // Попередження якщо операція занадто довга
    if (duration > 5000) {
      logger.warn(`Slow operation detected: ${operationName} took ${duration}ms`, context);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Performance: ${operationName} failed`, error, { 
      duration: `${duration}ms`,
      ...context 
    });
    throw error;
  }
}

// 🔄 КОМБІНОВАНИЙ HELPER: RETRY + PERFORMANCE MONITORING
/**
 * Виконує функцію з retry та моніторингом продуктивності
 * @param {Function} fn - Функція для виконання
 * @param {string} operationName - Назва операції
 * @param {Object} options - Опції (maxRetries, delay, context)
 * @returns {Promise<any>} Результат виконання
 */
async function executeWithRetryAndMonitor(fn, operationName, options = {}) {
  const { maxRetries = 3, delay = 1000, context = {} } = options;
  
  return withPerformanceMonitor(
    () => withRetry(fn, maxRetries, delay),
    operationName,
    context
  );
}

// 🏗️ СТРУКТУРА КОМАНДИ
const DEPARTMENTS = {
  'Marketing': {
    'PPC': ['PPC', 'PM PPC'],
    'Target/Kris team': ['Team lead', 'PM target', 'Target specialist', 'Target manager'],
    'Target/Lera team': ['Team lead', 'PM target', 'Target specialist', 'Target manager']
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

// 📊 ІНІЦІАЛІЗАЦІЯ ВСІХ ВКЛАДОК З УКРАЇНСЬКИМИ НАЗВАМИ
async function initSheets() {
  try {
    if (!doc) return;
    
    await doc.loadInfo();
    
    // 1. Працівники - загальна інформація
    if (!doc.sheetsByTitle['Працівники']) {
      await doc.addSheet({
        title: 'Працівники',
        headerValues: [
          'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 'Посада', 
          'Дата народження', 'Перший робочий день', 'Режим роботи', 'Дата реєстрації'
        ]
      });
      console.log('✅ Створено вкладку: Працівники');
    }
    
    // 2. Дати початку роботи
    if (!doc.sheetsByTitle['Дати початку роботи']) {
      await doc.addSheet({
        title: 'Дати початку роботи',
        headerValues: [
          'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 'Посада', 
          'Перший робочий день', 'Дата додавання'
        ]
      });
      console.log('✅ Створено вкладку: Дати початку роботи');
    }
    
    // 3. Відпустки
    if (!doc.sheetsByTitle['Відпустки']) {
      await doc.addSheet({
        title: 'Відпустки',
        headerValues: [
          'ID заявки', 'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 'PM',
          'Дата початку', 'Дата закінчення', 'Кількість днів', 'Статус', 
          'Тип заявки', 'Причина', 'Дата створення', 'Затверджено ким', 'Дата затвердження',
          'Баланс до', 'Баланс після'
        ]
      });
      console.log('✅ Створено вкладку: Відпустки');
    }
    
    // 4. Лікарняні
    if (!doc.sheetsByTitle['Лікарняні']) {
      await doc.addSheet({
        title: 'Лікарняні',
        headerValues: [
          'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 
          'Дата початку', 'Дата закінчення', 'Термін (днів)', 'Причина', 'Дата створення'
        ]
      });
      console.log('✅ Створено вкладку: Лікарняні');
    }
    
    // 5. Спізнення
    if (!doc.sheetsByTitle['Спізнення']) {
      await doc.addSheet({
        title: 'Спізнення',
        headerValues: [
          'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 
          'Дата', 'Час', 'Причина', 'Дата створення'
        ]
      });
      console.log('✅ Створено вкладку: Спізнення');
    }
    
    // 6. Remote (залишаємо англійську назву для сумісності, але можна змінити)
    if (!doc.sheetsByTitle['Remotes']) {
      await doc.addSheet({
        title: 'Remotes',
        headerValues: [
          'TelegramID', 'FullName', 'Department', 'Team', 'Date', 'CreatedAt'
        ]
      });
      console.log('✅ Створено вкладку: Remotes');
    }
    
    console.log('✅ Всі вкладки ініціалізовано');
  } catch (error) {
    console.error('❌ Помилка ініціалізації вкладок:', error);
  }
}

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
    
    // Ініціалізуємо всі необхідні вкладки з українськими назвами
    await initSheets();
    
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
    
    // Команда /stats для HR/CEO
    if (text === '/stats' || text === '/stats@' + (process.env.BOT_USERNAME || '')) {
      const role = await getUserRole(telegramId);
      if (role === 'HR' || role === 'CEO') {
        await showHRDashboardStats(chatId, telegramId);
      } else {
        await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR та CEO.');
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
      const handled = await handleRegistrationStep(chatId, telegramId, text);
      if (handled) {
        return; // Реєстрація оброблена, не показуємо загальне меню
      }
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
      'late_today': () => handleLateToday(chatId, telegramId),
      'late_other_date': () => handleLateOtherDate(chatId, telegramId),
      'late_add_reason': () => handleLateAddReason(chatId, telegramId),
      'late_skip_reason': () => handleLateSkipReason(chatId, telegramId),
      'sick_report': () => reportSick(chatId, telegramId),
      'sick_stats': () => showSickStats(chatId, telegramId),
      'stats_monthly': () => showMonthlyStats(chatId, telegramId),
      'stats_export': () => exportMyData(chatId, telegramId),
      'export_employee': async () => {
        const role = await getUserRole(telegramId);
        if (role === 'HR') {
          await showHRExportEmployee(chatId, telegramId);
        } else if (role === 'CEO') {
          await showCEOExportEmployee(chatId, telegramId);
        } else {
          await sendMessage(chatId, '❌ Доступ обмежено.');
        }
      },
      'export_department': async () => {
        const role = await getUserRole(telegramId);
        if (role === 'HR') {
          await showHRExportDepartment(chatId, telegramId);
        } else if (role === 'CEO') {
          await showCEOExportDepartment(chatId, telegramId);
        } else {
          await sendMessage(chatId, '❌ Доступ обмежено.');
        }
      },
      'onboarding_new': () => showNewEmployeeMenu(chatId, telegramId),
      'onboarding_notion': () => showNotionLink(chatId, telegramId),
      'onboarding_quiz': () => showOnboardingQuiz(chatId, telegramId),
      'oneonone_policy': () => showOneOnOnePolicy(chatId, telegramId),
      'oneonone_employee': () => showOneOnOneEmployee(chatId, telegramId),
      'oneonone_manager': () => showOneOnOneManager(chatId, telegramId),
      'suggestions_anonymous': () => showAnonymousSuggestionsForm(chatId, telegramId),
      'suggestions_named': () => showNamedSuggestionsForm(chatId, telegramId),
      'suggestions_view': () => showMySuggestions(chatId, telegramId),
      'asap_menu': () => showASAPMenu(chatId, telegramId),
      'asap_category_conflict': () => showASAPCategoryForm(chatId, telegramId, 'conflict'),
      'asap_category_health': () => showASAPCategoryForm(chatId, telegramId, 'health'),
      'asap_category_finance': () => showASAPCategoryForm(chatId, telegramId, 'finance'),
      'asap_category_legal': () => showASAPCategoryForm(chatId, telegramId, 'legal'),
      'asap_category_workplace': () => showASAPCategoryForm(chatId, telegramId, 'workplace'),
      'asap_category_team': () => showASAPCategoryForm(chatId, telegramId, 'team'),
      'asap_category_security': () => showASAPCategoryForm(chatId, telegramId, 'security'),
      'asap_category_other': () => showASAPCategoryForm(chatId, telegramId, 'other'),
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
      'back': async () => {
        // Отримуємо попередній стан
        const previousState = navigationStack.popState(telegramId);
        
        if (previousState) {
          // Відновлюємо попередній стан
          const { state, context } = previousState;
          
          // Очищаємо кеш реєстрації/форм якщо повертаємося до меню
          if (state.includes('Menu') || state.includes('Panel')) {
            if (registrationCache.has(telegramId)) {
              registrationCache.delete(telegramId);
            }
          }
          
          // Викликаємо функцію попереднього стану
          const stateFunctions = {
            'showMainMenu': () => showMainMenu(chatId, telegramId),
            'showVacationMenu': () => showVacationMenu(chatId, telegramId),
            'showRemoteMenu': () => showRemoteMenu(chatId, telegramId),
            'showLateMenu': () => showLateMenu(chatId, telegramId),
            'showSickMenu': () => showSickMenu(chatId, telegramId),
            'showStatsMenu': () => showStatsMenu(chatId, telegramId),
            'showOnboardingMenu': () => showOnboardingMenu(chatId, telegramId),
            'showFAQMenu': () => showFAQMenu(chatId, telegramId),
            'showOneOnOneMenu': () => showOneOnOneMenu(chatId, telegramId),
            'showOneOnOnePolicy': () => showOneOnOnePolicy(chatId, telegramId),
            'showOneOnOneEmployee': () => showOneOnOneEmployee(chatId, telegramId),
            'showOneOnOneManager': () => showOneOnOneManager(chatId, telegramId),
            'showSuggestionsMenu': () => showSuggestionsMenu(chatId, telegramId),
            'showASAPMenu': () => showASAPMenu(chatId, telegramId),
            'showApprovalsMenu': () => showApprovalsMenu(chatId, telegramId),
            'showAnalyticsMenu': () => showAnalyticsMenu(chatId, telegramId),
            'showHRPanel': () => showHRPanel(chatId, telegramId),
            'showCEOPanel': () => showCEOPanel(chatId, telegramId),
            'showMailingsMenu': () => showMailingsMenu(chatId, telegramId),
            'showHRExportMenu': () => showHRExportMenu(chatId, telegramId),
            'showCEOExportMenu': () => showCEOExportMenu(chatId, telegramId),
            'showVacationForm': () => showVacationForm(chatId, telegramId),
            'showEmergencyVacationForm': () => showEmergencyVacationForm(chatId, telegramId),
            'showVacationBalance': () => showVacationBalance(chatId, telegramId),
            'showMyVacationRequests': () => showMyVacationRequests(chatId, telegramId)
          };
          
          if (stateFunctions[state]) {
            await stateFunctions[state]();
          } else {
            // Fallback на головне меню
            await showMainMenu(chatId, telegramId);
          }
        } else {
          // Якщо немає попереднього стану, повертаємося до головного меню
          if (registrationCache.has(telegramId)) {
            registrationCache.delete(telegramId);
          }
          await showMainMenu(chatId, telegramId);
        }
      },
      'back_to_main': async () => {
        // Очищаємо історію навігації та кеш реєстрації/форм
        navigationStack.clearHistory(telegramId);
        if (registrationCache.has(telegramId)) {
          registrationCache.delete(telegramId);
        }
        await showMainMenu(chatId, telegramId);
      }
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
    } else if (data.startsWith('stats_lates_month_')) {
      // Обробка вибору місяця для звіту по спізненнях
      const parts = data.replace('stats_lates_month_', '').split('_');
      if (parts.length === 2) {
        const month = parseInt(parts[0]);
        const year = parseInt(parts[1]);
        await showLatesStatsReport(chatId, telegramId, null, month, year);
      }
    } else if (data === 'emergency_vacation_confirm_yes') {
      const regData = registrationCache.get(telegramId);
      if (regData && regData.step === 'emergency_vacation_confirm_past_date') {
        regData.step = 'emergency_vacation_days';
        await sendMessage(chatId, `📅 <b>Дата початку:</b> ${formatDate(regData.data.startDate)}\n\n📊 <b>Вкажіть кількість днів відпустки</b>\n\nВведіть кількість днів (1-7):`);
      }
    } else if (data === 'emergency_vacation_confirm_no') {
      await sendMessage(chatId, '❌ Заявку скасовано. Почніть спочатку.');
      registrationCache.delete(telegramId);
    }
    
  } catch (error) {
    console.error('❌ Помилка processCallback:', error);
  }
}

// 🧭 HELPER: Додавання кнопки "Назад" до клавіатури
function addBackButton(keyboard, telegramId, previousState = 'main_menu') {
  if (!keyboard || !keyboard.inline_keyboard) {
    keyboard = { inline_keyboard: [] };
  }
  
  // Перевіряємо чи є попередній стан
  const hasPrevious = navigationStack.hasPreviousState(telegramId);
  
  // Додаємо кнопку "Назад" тільки якщо є попередній стан або це не головне меню
  if (hasPrevious || previousState !== 'main_menu') {
    // Перевіряємо чи вже немає кнопки "Назад"
    const hasBackButton = keyboard.inline_keyboard.some(row => 
      row.some(button => button.callback_data === 'back' || button.callback_data === 'back_to_main')
    );
    
    if (!hasBackButton) {
      keyboard.inline_keyboard.push([
        { text: '⬅️ Назад', callback_data: 'back' }
      ]);
    }
  }
  
  return keyboard;
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
    // Перевіряємо кеш (CacheWithTTL сам перевіряє TTL)
    if (userCache.has(telegramId)) {
      const cached = userCache.get(telegramId);
      console.log(`✅ Користувач ${telegramId} знайдено в кеші: ${cached?.fullName || 'без імені'}`);
      return cached;
    }
    
    if (!doc) {
      console.warn(`⚠️ Google Sheets не підключено для користувача ${telegramId}`);
      return null;
    }
    
    await doc.loadInfo();
    // Спробуємо спочатку українську назву, потім англійську для сумісності
    const sheet = doc.sheetsByTitle['Працівники'] || doc.sheetsByTitle['Employees'];
    if (!sheet) {
      console.warn(`⚠️ Лист Працівники/Employees не знайдено для користувача ${telegramId}`);
      return null;
    }
    
    const rows = await sheet.getRows();
    console.log(`🔍 Шукаємо користувача ${telegramId} в ${rows.length} рядках`);
    
    // Перевіряємо як число та як рядок для надійності
    const user = rows.find(row => {
      const rowTelegramID = row.get('TelegramID');
      const matches = rowTelegramID == telegramId || 
             parseInt(rowTelegramID) === parseInt(telegramId) ||
             String(rowTelegramID) === String(telegramId);
      if (matches) {
        console.log(`✅ Знайдено збіг: rowTelegramID=${rowTelegramID}, telegramId=${telegramId}`);
      }
      return matches;
    });
    
    if (user) {
      // Визначаємо, яка таблиця використовується (українська чи англійська)
      const isUkrainianSheet = sheet.title === 'Працівники';
      
      const userData = {
        telegramId: parseInt(user.get('TelegramID')),
        fullName: user.get(isUkrainianSheet ? 'Ім\'я та прізвище' : 'FullName') || 
                  user.get('FullName') || 
                  user.get('Ім\'я та прізвище'),
        department: user.get(isUkrainianSheet ? 'Відділ' : 'Department') || 
                    user.get('Department') || 
                    user.get('Відділ'),
        team: user.get(isUkrainianSheet ? 'Команда' : 'Team') || 
              user.get('Team') || 
              user.get('Команда'),
        position: user.get(isUkrainianSheet ? 'Посада' : 'Position') || 
                  user.get('Position') || 
                  user.get('Посада'),
        birthDate: user.get(isUkrainianSheet ? 'Дата народження' : 'BirthDate') || 
                   user.get('BirthDate') || 
                   user.get('Дата народження'),
        firstWorkDay: user.get(isUkrainianSheet ? 'Перший робочий день' : 'FirstWorkDay') || 
                      user.get('FirstWorkDay') || 
                      user.get('Перший робочий день'),
        workMode: user.get(isUkrainianSheet ? 'Режим роботи' : 'WorkMode') || 
                  user.get('WorkMode') || 
                  user.get('Режим роботи') || 
                  'Hybrid',
        pm: user.get('PM') || null
      };
      
      // Зберігаємо дані в кеш (CacheWithTTL сам додає timestamp)
      userCache.set(telegramId, userData);
      console.log(`✅ Користувач ${telegramId} (${userData.fullName}) завантажено з Google Sheets та додано в кеш`);
      return userData;
    }
    
    console.warn(`⚠️ Користувач ${telegramId} не знайдено в Google Sheets`);
    return null;
  } catch (error) {
    console.error(`❌ Помилка getUserInfo для користувача ${telegramId}:`, error);
    console.error('❌ Stack:', error.stack);
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
    if (!doc) {
      // Якщо Google Sheets не підключено, спробуємо визначити роль за посадою з кешу
      const user = userCache.get(telegramId);
      if (user && user.position) {
        return determineRoleByPosition(user.position);
      }
      return 'EMP';
    }
    
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['Roles'];
    
    // Якщо таблиця Roles не існує, створюємо її
    if (!sheet) {
      sheet = await doc.addSheet({
        title: 'Roles',
        headerValues: ['TelegramID', 'Role', 'Position', 'Department', 'UpdatedAt']
      });
      console.log('✅ Створено таблицю Roles');
    }
    
    const rows = await sheet.getRows();
    const roleRow = rows.find(row => row.get('TelegramID') == telegramId);
    
    if (roleRow) {
      return roleRow.get('Role') || 'EMP';
    }
    
    // Якщо ролі немає в таблиці, спробуємо визначити за посадою
    const user = await getUserInfo(telegramId);
    if (user && user.position) {
      const determinedRole = determineRoleByPosition(user.position);
      // Зберігаємо визначену роль в таблицю
      await saveUserRole(telegramId, determinedRole, user.position, user.department);
      return determinedRole;
    }
    
    return 'EMP';
  } catch (error) {
    console.error('❌ Помилка getUserRole:', error);
    return 'EMP';
  }
}

// 🔍 ВИЗНАЧЕННЯ РОЛІ ЗА ПОСАДОЮ
function determineRoleByPosition(position) {
  if (!position) return 'EMP';
  
  const posLower = position.toLowerCase();
  
  // CEO
  if (posLower.includes('ceo') || posLower.includes('founder') || posLower.includes('засновник')) {
    return 'CEO';
  }
  
  // HR
  if (posLower.includes('hr') || posLower.includes('human resources')) {
    return 'HR';
  }
  
  // Team Lead
  if (posLower.includes('team lead') || posLower.includes('teamlead') || 
      posLower.includes('lead') || posLower.includes('керівник')) {
    return 'TL';
  }
  
  // За замовчуванням - працівник
  return 'EMP';
}

// 💾 ЗБЕРЕЖЕННЯ РОЛІ КОРИСТУВАЧА
async function saveUserRole(telegramId, role, position, department) {
  try {
    if (!doc) return;
    
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['Roles'];
    
    if (!sheet) {
      sheet = await doc.addSheet({
        title: 'Roles',
        headerValues: ['TelegramID', 'Role', 'Position', 'Department', 'UpdatedAt']
      });
    }
    
    const rows = await sheet.getRows();
    const existingRow = rows.find(row => row.get('TelegramID') == telegramId);
    
    if (existingRow) {
      // Оновлюємо існуючу роль
      existingRow.set('Role', role);
      existingRow.set('Position', position || '');
      existingRow.set('Department', department || '');
      existingRow.set('UpdatedAt', new Date().toISOString());
      await existingRow.save();
      console.log(`✅ Оновлено роль для ${telegramId}: ${role}`);
    } else {
      // Додаємо нову роль
      await sheet.addRow({
        TelegramID: telegramId,
        Role: role,
        Position: position || '',
        Department: department || '',
        UpdatedAt: new Date().toISOString()
      });
      console.log(`✅ Додано роль для ${telegramId}: ${role}`);
    }
  } catch (error) {
    console.error('❌ Помилка saveUserRole:', error);
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
    const employeesSheet = doc.sheetsByTitle['Працівники'] || doc.sheetsByTitle['Employees'];
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
    // Очищаємо історію навігації при поверненні до головного меню
    navigationStack.clearHistory(telegramId);
    
    const role = await getUserRole(telegramId);
    const user = await getUserInfo(telegramId);
    
    // Отримуємо ім'я користувача для персоналізованого привітання
    const userName = user?.fullName || 'колега';
    
    let welcomeText = `👋 <b>Привіт, ${userName}!</b>

Чим можу допомогти?`;

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
      // Тет (1:1)
      [
        { text: '📋 Тет' }
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
      '📋 Тет': showOneOnOneMenu,
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
    // Формуємо ім'я з firstName та lastName, якщо вони є
    let userName = firstName || 'колега';
    if (firstName && lastName) {
      userName = `${firstName} ${lastName}`;
    } else if (lastName) {
      userName = lastName;
    }
    
    const welcomeText = `👋 <b>Привіт, ${userName}!</b>

Чим можу допомогти?

Я бот-помічник розроблений твоїм HR. Вона створила мене, щоб полегшити і автоматизувати процеси. Я точно стану тобі в нагоді.

Почну з того, що прошу тебе зареєструватися. Це потрібно, аби надалі я міг допомагати тобі.

<b>Що я вмію робити:</b>

🏖️ <b>Відпустки:</b> подача заявок, перевірка балансу, календар
🏠 <b>Remote:</b> фіксація віддаленої роботи, ліміти
⏰ <b>Спізнення:</b> повідомлення про запізнення
🏥 <b>Лікарняний:</b> фіксація хвороби, повідомлення HR
📊 <b>Статистика:</b> особистий звіт за місяць
🎯 <b>Онбординг:</b> матеріали для нових співробітників
📋 <b>Тет:</b> матеріали про проведення тетів (1:1)
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
    
    // Перевіряємо, чи є команда в структурі
    if (DEPARTMENTS[department] && DEPARTMENTS[department][team]) {
      const positions = DEPARTMENTS[department][team];
      
      // Перевіряємо, чи positions - це масив
      if (Array.isArray(positions)) {
        for (const position of positions) {
          keyboard.inline_keyboard.push([
            { text: position, callback_data: `position_${position}` }
          ]);
        }
      } else {
        console.warn(`⚠️ Посади для команди ${team} не є масивом`);
      }
    } else {
      console.warn(`⚠️ Команда ${team} не знайдена в відділі ${department}`);
      await sendMessage(chatId, `❌ Помилка: команда "${team}" не знайдена. Спробуйте ще раз.`);
      return;
    }

    // Якщо немає кнопок, показуємо помилку
    if (keyboard.inline_keyboard.length === 0) {
      console.warn(`⚠️ Немає посад для команди ${team} в відділі ${department}`);
      await sendMessage(chatId, `❌ Помилка: немає доступних посад для команди "${team}". Зверніться до HR.`);
      return;
    }

    await sendMessage(chatId, `✅ Команда: <b>${team}</b>\n\nОберіть посаду:`, keyboard);
  } catch (error) {
    console.error('❌ Помилка handleTeamSelection:', error);
    await sendMessage(chatId, '❌ Помилка обробки вибору команди. Спробуйте ще раз.');
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
    if (!regData) return false;

    switch (regData.step) {
      case 'name':
        regData.data.name = text;
        regData.step = 'surname';
        registrationCache.set(telegramId, regData);
        await sendMessage(chatId, `✅ Ім'я: <b>${text}</b>\n\n📝 Введіть ваше прізвище:`);
        return true;

      case 'surname':
        regData.data.surname = text;
        regData.step = 'birthdate';
        registrationCache.set(telegramId, regData);
        await sendMessage(chatId, `✅ Прізвище: <b>${text}</b>\n\n📅 Введіть дату народження (ДД.ММ.РРРР):`);
        return true;

      case 'birthdate':
        if (!isValidDate(text)) {
          await sendMessage(chatId, '❌ Неправильний формат дати. Використовуйте ДД.ММ.РРРР');
          return true; // Повертаємо true, щоб не показувати загальне меню
        }
        regData.data.birthDate = text;
        regData.step = 'firstworkday';
        registrationCache.set(telegramId, regData);
        await sendMessage(chatId, `✅ Дата народження: <b>${text}</b>\n\n📅 Введіть перший робочий день (ДД.ММ.РРРР):`);
        return true;

      case 'firstworkday':
        if (!isValidDate(text)) {
          await sendMessage(chatId, '❌ Неправильний формат дати. Використовуйте ДД.ММ.РРРР');
          return true; // Повертаємо true, щоб не показувати загальне меню
        }
        regData.data.firstWorkDay = text;
        registrationCache.set(telegramId, regData);
        await completeRegistration(chatId, telegramId, regData.data);
        return true;

      case 'asap_message':
        // Обробка ASAP запиту з категорією
        const category = regData.category || 'other';
        await processASAPRequest(chatId, telegramId, text, category);
        // Очищаємо кеш після обробки
        registrationCache.delete(telegramId);
        return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Помилка handleRegistrationStep:', error);
    return false;
  }
}

// ✅ ЗАВЕРШЕННЯ РЕЄСТРАЦІЇ
async function completeRegistration(chatId, telegramId, data) {
  try {
    const fullName = `${data.name} ${data.surname}`;
    
    // Створюємо об'єкт користувача для кешу
    const userData = {
      telegramId: parseInt(telegramId),
      fullName: fullName,
      department: data.department,
      team: data.team,
      position: data.position,
      birthDate: data.birthDate,
      firstWorkDay: data.firstWorkDay,
      workMode: 'Hybrid',
      pm: null
    };
    
    // Збереження в Google Sheets
    if (doc) {
      await doc.loadInfo();
      
      // 1. Зберігаємо в "Працівники"
      let employeesSheet = doc.sheetsByTitle['Працівники'];
      if (!employeesSheet) {
        employeesSheet = await doc.addSheet({
          title: 'Працівники',
          headerValues: [
            'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 'Посада', 
            'Дата народження', 'Перший робочий день', 'Режим роботи', 'Дата реєстрації'
          ]
        });
      }
      
      // Перевіряємо, чи користувач вже існує
      const existingRows = await employeesSheet.getRows();
      const existingUser = existingRows.find(row => row.get('TelegramID') == telegramId);
      
      if (existingUser) {
        // Оновлюємо існуючого користувача
        existingUser.set('Ім\'я та прізвище', fullName);
        existingUser.set('Відділ', data.department);
        existingUser.set('Команда', data.team);
        existingUser.set('Посада', data.position);
        existingUser.set('Дата народження', data.birthDate);
        existingUser.set('Перший робочий день', data.firstWorkDay);
        existingUser.set('Режим роботи', 'Hybrid');
        existingUser.set('Дата реєстрації', new Date().toISOString());
        await existingUser.save();
        console.log(`✅ Оновлено користувача ${telegramId} (${fullName}) в Google Sheets`);
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
          'Режим роботи': 'Hybrid',
          'Дата реєстрації': new Date().toISOString()
        });
        console.log(`✅ Додано користувача ${telegramId} (${fullName}) в Google Sheets`);
      }
      
      // 3. Визначаємо та зберігаємо роль на основі посади
      const determinedRole = determineRoleByPosition(data.position);
      await saveUserRole(telegramId, determinedRole, data.position, data.department);
      console.log(`✅ Визначено роль для ${telegramId}: ${determinedRole} (на основі посади: ${data.position})`);
      
      // 2. Зберігаємо в "Дати початку роботи"
      let workStartSheet = doc.sheetsByTitle['Дати початку роботи'];
      if (!workStartSheet) {
        workStartSheet = await doc.addSheet({
          title: 'Дати початку роботи',
          headerValues: [
            'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 'Посада', 
            'Перший робочий день', 'Дата додавання'
          ]
        });
      }
      
      // Перевіряємо, чи запис вже існує
      const workStartRows = await workStartSheet.getRows();
      const existingWorkStart = workStartRows.find(row => 
        row.get('TelegramID') == telegramId && row.get('Перший робочий день') == data.firstWorkDay
      );
      
      if (!existingWorkStart) {
        await workStartSheet.addRow({
          'TelegramID': telegramId,
          'Ім\'я та прізвище': fullName,
          'Відділ': data.department,
          'Команда': data.team,
          'Посада': data.position,
          'Перший робочий день': data.firstWorkDay,
          'Дата додавання': new Date().toISOString()
        });
        console.log(`✅ Додано дату початку роботи для ${telegramId} (${fullName})`);
      }
    }

    // Очищаємо кеш реєстрації
    registrationCache.delete(telegramId);
    
    // Очищаємо старий кеш користувача (якщо є)
    if (userCache.has(telegramId)) {
      userCache.delete(telegramId);
    }
    
    // Додаємо користувача в кеш одразу після реєстрації
    userCache.set(telegramId, userData);
    console.log(`✅ Користувач ${telegramId} (${fullName}) додано в кеш`);

    // Показуємо головне меню з персоналізованим привітанням
    await showMainMenu(chatId, telegramId);
  } catch (error) {
    console.error('❌ Помилка completeRegistration:', error);
    console.error('❌ Stack:', error.stack);
    await sendMessage(chatId, '❌ Помилка при завершенні реєстрації. Зверніться до HR.');
  }
}

// 🏖️ МЕНЮ ВІДПУСТОК
async function showVacationMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан перед показом меню
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showVacationMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showVacationMenu:', error);
  }
}

// 📊 БАЛАНС ВІДПУСТОК
async function getVacationBalance(telegramId) {
  try {
    if (!doc) return { used: 0, total: 24, available: 24 };
    
    const user = await getUserInfo(telegramId);
    if (!user) return { used: 0, total: 24, available: 24 };
    
    await doc.loadInfo();
    // Спробуємо спочатку українську назву, потім англійську для сумісності
    let sheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
    if (!sheet) return { used: 0, total: 24, available: 24, annual: 24, remaining: 24 };
    
    const rows = await sheet.getRows();
    const workYearDates = getWorkYearDates(user.firstWorkDay);
    
    // Фільтруємо відпустки за робочий рік (або календарний рік, якщо немає дати першого робочого дня)
    const userVacations = rows.filter(row => {
      const rowTelegramId = row.get('TelegramID');
      const rowStatus = row.get('Статус') || row.get('Status');
      const rowStartDate = row.get('Дата початку') || row.get('StartDate');
      
      if (rowTelegramId != telegramId) return false;
      // Враховуємо тільки затверджені відпустки
      if (rowStatus !== 'approved' && rowStatus !== 'Approved' && rowStatus !== 'затверджено') return false;
      if (!rowStartDate) return false;
      
      const startDate = new Date(rowStartDate);
      
      // Якщо є дата першого робочого дня, використовуємо робочий рік
      if (workYearDates) {
        return isInWorkYear(startDate, user.firstWorkDay);
      }
      
      // Інакше використовуємо календарний рік
      return startDate.getFullYear() === new Date().getFullYear();
    });
    
    const usedDays = userVacations.reduce((total, row) => {
      const start = new Date(row.get('Дата початку') || row.get('StartDate'));
      const end = new Date(row.get('Дата закінчення') || row.get('EndDate'));
      const days = parseInt(row.get('Кількість днів') || row.get('Days') || 0);
      return total + (days || Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    }, 0);
    
    const annual = 24; // 24 календарних дні на рік
    const remaining = Math.max(0, annual - usedDays);
    
    return {
      used: usedDays,
      total: annual,
      annual: annual,
      available: remaining,
      remaining: remaining
    };
  } catch (error) {
    console.error('❌ Помилка getVacationBalance:', error);
    return { used: 0, total: 24, available: 24 };
  }
}

// 📊 ПОКАЗАТИ БАЛАНС ВІДПУСТОК
async function showVacationBalance(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан (меню відпусток)
    navigationStack.pushState(telegramId, 'showVacationMenu', {});
    
    const balance = await getVacationBalance(telegramId);
    const user = await getUserInfo(telegramId);
    
    const text = `📊 <b>Детальний баланс відпусток</b>

💰 <b>Використано:</b> ${balance.used} днів
📅 <b>Доступно:</b> ${balance.available} днів
📊 <b>Загальний ліміт:</b> ${balance.total} днів

${user?.firstWorkDay ? `📆 <b>Перший робочий день:</b> ${formatDate(new Date(user.firstWorkDay))}` : ''}
${user?.firstWorkDay ? `⏰ <b>Можна брати відпустку після:</b> ${formatDate(new Date(new Date(user.firstWorkDay).setMonth(new Date(user.firstWorkDay).getMonth() + 3)))}` : ''}`;
    
    const keyboard = { inline_keyboard: [] };
    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showVacationBalance');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showVacationBalance:', error);
    await sendMessage(chatId, '❌ Помилка завантаження балансу.');
  }
}

// 📄 МОЇ ЗАЯВКИ НА ВІДПУСТКУ
async function showMyVacationRequests(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан (меню відпусток)
    navigationStack.pushState(telegramId, 'showVacationMenu', {});
    
    if (!doc) {
      await sendMessage(chatId, '❌ Google Sheets не підключено.');
      return;
    }
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
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
    
    const keyboard = { inline_keyboard: [] };
    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showMyVacationRequests');
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
    // Зберігаємо попередній стан (меню відпусток)
    navigationStack.pushState(telegramId, 'showVacationMenu', {});
    
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

    // Додаємо кнопку "Назад"
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'showEmergencyVacationForm');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showEmergencyVacationForm:', error);
  }
}

// 🏠 МЕНЮ REMOTE
async function showRemoteMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
    const user = await getUserInfo(telegramId);
    if (!user) {
      console.error(`❌ Користувач ${telegramId} не знайдений в showRemoteMenu`);
      await sendMessage(chatId, '❌ Користувач не знайдений. Пройдіть реєстрацію через /start');
      return;
    }
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showRemoteMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showRemoteMenu:', error);
  }
}

// ⏰ МЕНЮ СПІЗНЕНЬ
async function showLateMenu(chatId, telegramId) {
  try {
    // Перевіряємо, чи користувач існує
    const user = await getUserInfo(telegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений. Пройдіть реєстрацію через /start');
      return;
    }
    
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showLateMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showLateMenu:', error);
  }
}

// 🏥 МЕНЮ ЛІКАРНЯНИХ
async function showSickMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showSickMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showSickMenu:', error);
  }
}

// 📊 МЕНЮ СТАТИСТИКИ
async function showStatsMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showStatsMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showStatsMenu:', error);
    await sendMessage(chatId, '❌ Помилка завантаження меню статистики.');
  }
}

// 📅 ЗВІТ ЗА МІСЯЦЬ
async function showMonthlyStats(chatId, telegramId) {
  try {
    navigationStack.pushState(telegramId, 'showStatsMenu', {});
    
    const user = await getUserInfo(telegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений. Пройдіть реєстрацію.');
      return;
    }
    
    const now = new Date();
    const monthName = now.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    
    // Отримуємо статистику
    const vacationBalance = await getVacationBalance(telegramId);
    
    // Отримуємо статистику Remote за місяць
    let remoteCount = 0;
    if (doc) {
      try {
        await doc.loadInfo();
        const remotesSheet = doc.sheetsByTitle['Remotes'];
        if (remotesSheet) {
          const rows = await remotesSheet.getRows();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();
          remoteCount = rows.filter(row => {
            if (row.get('TelegramID') != telegramId) return false;
            const date = new Date(row.get('Date'));
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
          }).length;
        }
      } catch (error) {
        console.error('Помилка отримання Remote статистики:', error);
      }
    }
    
    // Отримуємо статистику спізнень за місяць
    let lateCount = 0;
    if (doc) {
      try {
        await doc.loadInfo();
        const latesSheet = doc.sheetsByTitle['Спізнення'] || doc.sheetsByTitle['Lates'];
        if (latesSheet) {
          const rows = await latesSheet.getRows();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();
          lateCount = rows.filter(row => {
            if (row.get('TelegramID') != telegramId) return false;
            const date = new Date(row.get('Date'));
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
          }).length;
        }
      } catch (error) {
        console.error('Помилка отримання статистики спізнень:', error);
      }
    }
    
    let text = `📊 <b>Моя статистика за ${monthName}</b>\n\n`;
    text += `👤 <b>${user.fullName}</b>\n`;
    if (user.position) text += `💼 ${user.position}\n`;
    if (user.department) {
      text += `🏢 ${user.department}`;
      if (user.team) text += ` / ${user.team}`;
      text += `\n`;
    }
    text += `\n`;
    
    text += `🏖️ <b>Відпустки:</b>\n`;
    const annual = vacationBalance.annual || vacationBalance.total || 24;
    const remaining = vacationBalance.remaining || vacationBalance.available || 0;
    const used = vacationBalance.used || 0;
    text += `💰 Баланс: ${remaining}/${annual} днів\n`;
    text += `📅 Використано: ${used} днів\n\n`;
    
    text += `📈 <b>Статистика за ${monthName}:</b>\n`;
    text += `🏠 Remote: ${remoteCount} днів`;
    if (user.workMode && user.workMode !== 'Онлайн') {
      text += ` (ліміт: 14)`;
    }
    text += `\n`;
    text += `⏰ Спізнення: ${lateCount} разів`;
    if (lateCount >= 7) {
      text += ` ⚠️`;
    }
    
    const keyboard = {
      inline_keyboard: []
    };
    
    addBackButton(keyboard, telegramId, 'showMonthlyStats');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showMonthlyStats:', error);
    await sendMessage(chatId, '❌ Помилка завантаження статистики.');
  }
}

// 🔧 ДОПОМІЖНІ ФУНКЦІЇ ДЛЯ РОБОЧОГО РОКУ
/**
 * Отримує дати початку та кінця робочого року для користувача
 * Робочий рік = 12 місяців від першого робочого дня
 */
function getWorkYearDates(firstWorkDay) {
  if (!firstWorkDay) return null;
  
  // Парсимо дату першого робочого дня (формат ДД.ММ.РРРР або Date)
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
  
  // Знаходимо початок поточного робочого року
  // Робочий рік = 12 місяців від першого робочого дня
  // Наприклад: 06.06.2023 - 05.06.2024 (включно)
  let workYearStart = new Date(firstDay);
  workYearStart.setFullYear(now.getFullYear());
  
  // Якщо поточна дата раніше за річницю в цьому році, беремо попередній робочий рік
  if (now < workYearStart) {
    workYearStart.setFullYear(now.getFullYear() - 1);
  }
  
  // Кінець робочого року = початок + 12 місяців - 1 день (включно)
  const workYearEnd = new Date(workYearStart);
  workYearEnd.setMonth(workYearEnd.getMonth() + 12);
  workYearEnd.setDate(workYearEnd.getDate() - 1);
  
  return { start: workYearStart, end: workYearEnd };
}

/**
 * Перевіряє, чи дата входить в робочий рік користувача
 */
function isInWorkYear(date, firstWorkDay) {
  if (!firstWorkDay) return false;
  const yearDates = getWorkYearDates(firstWorkDay);
  if (!yearDates) return false;
  return date >= yearDates.start && date <= yearDates.end;
}

// 🏖️ ЗВІТ ПО ВІДПУСТКАХ
async function showVacationStatsReport(chatId, telegramId, targetTelegramId = null) {
  try {
    // Перевірка доступу
    const role = await getUserRole(telegramId);
    const isHRorCEO = role === 'HR' || role === 'CEO';
    
    // Якщо не HR/CEO, можна бачити тільки свою статистику
    const reportTelegramId = targetTelegramId && isHRorCEO ? targetTelegramId : telegramId;
    
    if (targetTelegramId && !isHRorCEO) {
      await sendMessage(chatId, '❌ Доступ обмежено. Ви можете переглядати тільки свою статистику.');
      return;
    }
    
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showStatsMenu', {});
    
    const user = await getUserInfo(reportTelegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений.');
      return;
    }
    
    // Перевіряємо та перепідключаємося до Google Sheets
    if (!doc) {
      console.warn('⚠️ Google Sheets не підключено в showVacationStatsReport, спробуємо перепідключитися...');
      const reconnected = await initGoogleSheets();
      if (!reconnected || !doc) {
        await sendMessage(chatId, '❌ Google Sheets не підключено. Спробуйте пізніше або зверніться до HR.');
        return;
      }
      console.log('✅ Google Sheets перепідключено успішно в showVacationStatsReport');
    }
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
    if (!sheet) {
      await sendMessage(chatId, '❌ Таблиця відпусток не знайдена.');
      return;
    }
    
    const rows = await sheet.getRows();
    const workYearDates = getWorkYearDates(user.firstWorkDay);
    
    // Фільтруємо відпустки користувача за робочий рік
    const userVacations = rows.filter(row => {
      const rowTelegramId = row.get('TelegramID');
      if (rowTelegramId != reportTelegramId) return false;
      
      const startDateStr = row.get('StartDate');
      if (!startDateStr) return false;
      
      const startDate = new Date(startDateStr);
      if (workYearDates) {
        return isInWorkYear(startDate, user.firstWorkDay);
      }
      // Якщо немає дати першого робочого дня, використовуємо календарний рік
      return startDate.getFullYear() === new Date().getFullYear();
    });
    
    // Обчислюємо статистику
    const approvedVacations = userVacations.filter(v => 
      v.get('Status') === 'approved' || v.get('Status') === 'Approved'
    );
    
    let usedDays = 0;
    const vacationList = [];
    
    approvedVacations.forEach(v => {
      const days = parseInt(v.get('Days')) || 0;
      usedDays += days;
      const startDate = new Date(v.get('StartDate'));
      const endDate = new Date(v.get('EndDate'));
      vacationList.push({
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        days: days
      });
    });
    
    const totalDays = 24; // Стандартний ліміт
    const availableDays = Math.max(0, totalDays - usedDays);
    
    // Формуємо звіт
    let report = `🏖️ <b>Звіт по відпустках</b>\n\n`;
    report += `👤 <b>Співробітник:</b> ${user.fullName}\n`;
    if (workYearDates) {
      report += `📅 <b>Робочий рік:</b> ${formatDate(workYearDates.start)} - ${formatDate(workYearDates.end)}\n`;
    }
    report += `\n`;
    report += `💰 <b>Використано:</b> ${usedDays} днів\n`;
    report += `📊 <b>Залишилось:</b> ${availableDays} днів\n`;
    report += `📈 <b>Загальний ліміт:</b> ${totalDays} днів\n\n`;
    
    if (vacationList.length > 0) {
      report += `📋 <b>Взяті відпустки:</b>\n`;
      vacationList.forEach((vac, index) => {
        report += `${index + 1}. ${vac.startDate} - ${vac.endDate} (${vac.days} дн.)\n`;
      });
    } else {
      report += `ℹ️ Відпустки ще не брались у поточному робочому році.\n`;
    }
    
    const keyboard = { inline_keyboard: [] };
    addBackButton(keyboard, telegramId, 'showVacationStatsReport');
    await sendMessage(chatId, report, keyboard);
  } catch (error) {
    console.error('❌ Помилка showVacationStatsReport:', error);
    await sendMessage(chatId, '❌ Помилка завантаження звіту по відпустках.');
  }
}

// 🏠 ЗВІТ ПО REMOTE РОБОТІ
async function showRemoteStatsReport(chatId, telegramId, targetTelegramId = null) {
  try {
    // Перевірка доступу
    const role = await getUserRole(telegramId);
    const isHRorCEO = role === 'HR' || role === 'CEO';
    
    const reportTelegramId = targetTelegramId && isHRorCEO ? targetTelegramId : telegramId;
    
    if (targetTelegramId && !isHRorCEO) {
      await sendMessage(chatId, '❌ Доступ обмежено. Ви можете переглядати тільки свою статистику.');
      return;
    }
    
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showStatsMenu', {});
    
    const user = await getUserInfo(reportTelegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений.');
      return;
    }
    
    // Перевіряємо та перепідключаємося до Google Sheets
    if (!doc) {
      console.warn('⚠️ Google Sheets не підключено в showRemoteStatsReport, спробуємо перепідключитися...');
      const reconnected = await initGoogleSheets();
      if (!reconnected || !doc) {
        await sendMessage(chatId, '❌ Google Sheets не підключено. Спробуйте пізніше або зверніться до HR.');
        return;
      }
      console.log('✅ Google Sheets перепідключено успішно в showRemoteStatsReport');
    }
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Remotes'];
    if (!sheet) {
      await sendMessage(chatId, '❌ Таблиця Remote не знайдена.');
      return;
    }
    
    const rows = await sheet.getRows();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const workYearDates = getWorkYearDates(user.firstWorkDay);
    
    // Фільтруємо Remote дні
    const allRemoteDays = rows.filter(row => {
      if (row.get('TelegramID') != reportTelegramId) return false;
      const dateStr = row.get('Date');
      if (!dateStr) return false;
      return true;
    });
    
    // Remote дні за поточний місяць
    const currentMonthRemote = allRemoteDays.filter(row => {
      const date = new Date(row.get('Date'));
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    
    // Remote дні за робочий рік
    const workYearRemote = workYearDates 
      ? allRemoteDays.filter(row => {
          const date = new Date(row.get('Date'));
          return isInWorkYear(date, user.firstWorkDay);
        })
      : allRemoteDays.filter(row => {
          const date = new Date(row.get('Date'));
          return date.getFullYear() === currentYear;
        });
    
    // Формуємо звіт
    let report = `🏠 <b>Звіт по Remote роботі</b>\n\n`;
    report += `👤 <b>Співробітник:</b> ${user.fullName}\n`;
    if (workYearDates) {
      report += `📅 <b>Робочий рік:</b> ${formatDate(workYearDates.start)} - ${formatDate(workYearDates.end)}\n`;
    }
    report += `\n`;
    report += `📊 <b>За поточний місяць:</b> ${currentMonthRemote.length} днів\n`;
    report += `📈 <b>За робочий рік:</b> ${workYearRemote.length} днів\n\n`;
    
    if (currentMonthRemote.length > 0) {
      report += `📅 <b>Remote дні в поточному місяці:</b>\n`;
      currentMonthRemote.slice(0, 10).forEach((row, index) => {
        const date = new Date(row.get('Date'));
        report += `${index + 1}. ${formatDate(date)}\n`;
      });
      if (currentMonthRemote.length > 10) {
        report += `... та ще ${currentMonthRemote.length - 10} днів\n`;
      }
    }
    
    const keyboard = { inline_keyboard: [] };
    addBackButton(keyboard, telegramId, 'showRemoteStatsReport');
    await sendMessage(chatId, report, keyboard);
  } catch (error) {
    console.error('❌ Помилка showRemoteStatsReport:', error);
    await sendMessage(chatId, '❌ Помилка завантаження звіту по Remote роботі.');
  }
}

// ⏰ ЗВІТ ПО СПІЗНЕННЯХ
async function showLatesStatsReport(chatId, telegramId, targetTelegramId = null, month = null, year = null) {
  try {
    // Перевірка доступу
    const role = await getUserRole(telegramId);
    const isHRorCEO = role === 'HR' || role === 'CEO';
    
    const reportTelegramId = targetTelegramId && isHRorCEO ? targetTelegramId : telegramId;
    
    if (targetTelegramId && !isHRorCEO) {
      await sendMessage(chatId, '❌ Доступ обмежено. Ви можете переглядати тільки свою статистику.');
      return;
    }
    
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showStatsMenu', {});
    
    const user = await getUserInfo(reportTelegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений.');
      return;
    }
    
    // Перевіряємо та перепідключаємося до Google Sheets
    if (!doc) {
      console.warn('⚠️ Google Sheets не підключено в showLatesStatsReport, спробуємо перепідключитися...');
      const reconnected = await initGoogleSheets();
      if (!reconnected || !doc) {
        await sendMessage(chatId, '❌ Google Sheets не підключено. Спробуйте пізніше або зверніться до HR.');
        return;
      }
      console.log('✅ Google Sheets перепідключено успішно в showLatesStatsReport');
    }
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Спізнення'] || doc.sheetsByTitle['Lates'];
    if (!sheet) {
      await sendMessage(chatId, '❌ Таблиця спізнень не знайдена.');
      return;
    }
    
    const rows = await sheet.getRows();
    const now = new Date();
    
    // Визначаємо місяць та рік для звіту
    const reportMonth = month !== null ? month : now.getMonth();
    const reportYear = year !== null ? year : now.getFullYear();
    
    // Фільтруємо спізнення за вибраний місяць
    const monthLates = rows.filter(row => {
      if (row.get('TelegramID') != reportTelegramId) return false;
      const dateStr = row.get('Date');
      if (!dateStr) return false;
      const date = new Date(dateStr);
      return date.getMonth() === reportMonth && date.getFullYear() === reportYear;
    });
    
    // Формуємо звіт
    const monthName = new Date(reportYear, reportMonth).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    let report = `⏰ <b>Звіт по спізненнях</b>\n\n`;
    report += `👤 <b>Співробітник:</b> ${user.fullName}\n`;
    report += `📅 <b>Період:</b> ${monthName}\n\n`;
    report += `📊 <b>Кількість спізнень:</b> ${monthLates.length}\n\n`;
    
    if (monthLates.length > 0) {
      report += `📋 <b>Дати спізнень:</b>\n`;
      monthLates.forEach((row, index) => {
        const date = new Date(row.get('Date'));
        const reason = row.get('Reason') || 'Не вказано';
        report += `${index + 1}. ${formatDate(date)} - ${reason}\n`;
      });
      
      if (monthLates.length >= 7) {
        report += `\n⚠️ <b>Увага!</b> Кількість спізнень перевищує 7 за місяць.`;
      }
    } else {
      report += `✅ Спізнень не було в цьому місяці.`;
    }
    
    const keyboard = { inline_keyboard: [] };
    
    // Додаємо кнопки для вибору місяця (тільки для поточного користувача або HR/CEO)
    if (reportTelegramId === telegramId || isHRorCEO) {
      // Можна додати кнопки для вибору іншого місяця
      const prevMonth = reportMonth === 0 ? 11 : reportMonth - 1;
      const prevYear = reportMonth === 0 ? reportYear - 1 : reportYear;
      const nextMonth = reportMonth === 11 ? 0 : reportMonth + 1;
      const nextYear = reportMonth === 11 ? reportYear + 1 : reportYear;
      
      keyboard.inline_keyboard.push([
        { text: '⬅️ Попередній місяць', callback_data: `stats_lates_month_${prevMonth}_${prevYear}` },
        { text: 'Наступний місяць ➡️', callback_data: `stats_lates_month_${nextMonth}_${nextYear}` }
      ]);
    }
    
    addBackButton(keyboard, telegramId, 'showLatesStatsReport');
    await sendMessage(chatId, report, keyboard);
  } catch (error) {
    console.error('❌ Помилка showLatesStatsReport:', error);
    await sendMessage(chatId, '❌ Помилка завантаження звіту по спізненнях.');
  }
}

// 📤 ЕКСПОРТ ДАНИХ
async function exportMyData(chatId, telegramId) {
  try {
    // Перевірка доступу - тільки HR/CEO можуть експортувати дані
    const role = await getUserRole(telegramId);
    if (role !== 'HR' && role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено. Експорт даних доступний тільки для HR та CEO.');
      return;
    }
    
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showStatsMenu', {});
    
    const text = `📤 <b>Експорт даних</b>

Оберіть тип експорту:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '👤 По співробітнику', callback_data: 'export_employee' }
        ],
        [
          { text: '🏢 По відділу', callback_data: 'export_department' }
        ]
      ]
    };
    
    addBackButton(keyboard, telegramId, 'exportMyData');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка exportMyData:', error);
    await sendMessage(chatId, '❌ Помилка завантаження меню експорту.');
  }
}

// 🎯 МЕНЮ ОНБОРДИНГУ
async function showOnboardingMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showOnboardingMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showOnboardingMenu:', error);
  }
}

// ❓ МЕНЮ FAQ
async function showFAQMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showFAQMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showFAQMenu:', error);
  }
}

// 📋 МЕНЮ ТЕТ (1:1)
async function showOneOnOneMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
    const text = `📋 <b>Тет (1:1)</b>

Тут зібрана інформація про проведення тетів (1:1) в компанії.

Оберіть категорію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📄 Політика проведення', callback_data: 'oneonone_policy' }
        ],
        [
          { text: '👤 Для працівника', callback_data: 'oneonone_employee' }
        ],
        [
          { text: '👔 Для керівників', callback_data: 'oneonone_manager' }
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showOneOnOneMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showOneOnOneMenu:', error);
  }
}

// 📄 ПОКАЗАТИ ПОЛІТИКУ ПРОВЕДЕННЯ ТЕТІВ
async function showOneOnOnePolicy(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showOneOnOneMenu', {});
    
    const text = `📄 <b>Політика проведення тетів (1:1)</b>

Ось посилання на політику проведення тетів:

🔗 https://docs.google.com/document/d/1TgND-pt6SlL3DJ67th7woy0WGcXzL8DuFOCUBu18APo/edit?usp=sharing`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔗 Відкрити документ', url: 'https://docs.google.com/document/d/1TgND-pt6SlL3DJ67th7woy0WGcXzL8DuFOCUBu18APo/edit?usp=sharing' }
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showOneOnOnePolicy');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showOneOnOnePolicy:', error);
  }
}

// 👤 ПОКАЗАТИ МАТЕРІАЛИ ДЛЯ ПРАЦІВНИКА
async function showOneOnOneEmployee(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showOneOnOneMenu', {});
    
    const text = `👤 <b>Матеріали для працівника</b>

Ось посилання на матеріали для підготовки до тету (1:1):

🔗 <b>Підготовка до тету (1:1)</b>
https://docs.google.com/document/d/1rGdS1y9pgs0No3px9HNp88PEwMRzkOorVFCMVxtkzwU/edit?usp=sharing

🔗 <b>Положення про проведення тетів (1:1)</b>
https://docs.google.com/document/d/1W7F39MmgMo62GzmZ_9cYispsSfa3LQhnUJ7hpY_iP6Q/edit?usp=sharing`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Підготовка до тету', url: 'https://docs.google.com/document/d/1rGdS1y9pgs0No3px9HNp88PEwMRzkOorVFCMVxtkzwU/edit?usp=sharing' }
        ],
        [
          { text: '📄 Положення про тети', url: 'https://docs.google.com/document/d/1W7F39MmgMo62GzmZ_9cYispsSfa3LQhnUJ7hpY_iP6Q/edit?usp=sharing' }
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showOneOnOneEmployee');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showOneOnOneEmployee:', error);
  }
}

// 👔 ПОКАЗАТИ МАТЕРІАЛИ ДЛЯ КЕРІВНИКІВ
async function showOneOnOneManager(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showOneOnOneMenu', {});
    
    const text = `👔 <b>Матеріали для керівників</b>

Ось посилання на матеріали для керівників:

🔗 <b>Гайд для керівника</b>
https://docs.google.com/document/d/1oM8YDuZ1-F9y0VEbWPuQNLyYOOX-V0xf6ggYYIJAcQ0/edit?usp=sharing

🔗 <b>Для керівника. Фіксація зустрічі</b>
https://docs.google.com/spreadsheets/d/1GF8aDJhNAHy0EOjr2l_IbuIzU_IqrEmqu0pTrm3IpgY/edit?usp=sharing

🔗 <b>Документ 1</b>
https://docs.google.com/document/d/1gh77x0eASHSRTJGlOGdBylXk-t5FnImxogOIf-4oKwc/edit?usp=sharing

🔗 <b>Документ 2</b>
https://docs.google.com/document/d/18pS9puEazuqsnhb01ik0zjWpAFtko_UJOd1p6C4_mjw/edit?usp=sharing`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📘 Гайд для керівника', url: 'https://docs.google.com/document/d/1oM8YDuZ1-F9y0VEbWPuQNLyYOOX-V0xf6ggYYIJAcQ0/edit?usp=sharing' }
        ],
        [
          { text: '📊 Фіксація зустрічі', url: 'https://docs.google.com/spreadsheets/d/1GF8aDJhNAHy0EOjr2l_IbuIzU_IqrEmqu0pTrm3IpgY/edit?usp=sharing' }
        ],
        [
          { text: '📄 Документ 1', url: 'https://docs.google.com/document/d/1gh77x0eASHSRTJGlOGdBylXk-t5FnImxogOIf-4oKwc/edit?usp=sharing' }
        ],
        [
          { text: '📄 Документ 2', url: 'https://docs.google.com/document/d/18pS9puEazuqsnhb01ik0zjWpAFtko_UJOd1p6C4_mjw/edit?usp=sharing' }
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showOneOnOneManager');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showOneOnOneManager:', error);
  }
}

// AI помічник видалено

// 💬 МЕНЮ ПРОПОЗИЦІЙ
async function showSuggestionsMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showSuggestionsMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showSuggestionsMenu:', error);
  }
}

// 🚨 МЕНЮ ASAP
async function showASAPMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
    const text = `🚨 <b>ASAP запит</b>

Термінові питання, які потребують негайної уваги HR.

Оберіть категорію запиту:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '💼 Конфлікт/Проблема', callback_data: 'asap_category_conflict' },
          { text: '🏥 Здоров\'я/Медицина', callback_data: 'asap_category_health' }
        ],
        [
          { text: '💰 Фінанси/Зарплата', callback_data: 'asap_category_finance' },
          { text: '📋 Документи/Юридичне', callback_data: 'asap_category_legal' }
        ],
        [
          { text: '🏢 Робоче місце/Офіс', callback_data: 'asap_category_workplace' },
          { text: '👥 Стосунки в команді', callback_data: 'asap_category_team' }
        ],
        [
          { text: '🔒 Безпека/Конфіденційність', callback_data: 'asap_category_security' },
          { text: '❓ Інше', callback_data: 'asap_category_other' }
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showASAPMenu');

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showASAPMenu:', error);
  }
}

// 🚨 ВИБІР КАТЕГОРІЇ ASAP ЗАПИТУ
async function showASAPCategoryForm(chatId, telegramId, category) {
  try {
    // Зберігаємо попередній стан (меню ASAP)
    navigationStack.pushState(telegramId, 'showASAPMenu', {});
    
    const categoryNames = {
      'conflict': 'Конфлікт/Проблема',
      'health': 'Здоров\'я/Медицина',
      'finance': 'Фінанси/Зарплата',
      'legal': 'Документи/Юридичне',
      'workplace': 'Робоче місце/Офіс',
      'team': 'Стосунки в команді',
      'security': 'Безпека/Конфіденційність',
      'other': 'Інше'
    };
    
    const user = await getUserInfo(telegramId);
    const categoryName = categoryNames[category] || 'Інше';
    
    const text = `🚨 <b>ASAP Запит: ${categoryName}</b>

👤 ${user?.FullName || 'Користувач'}
🏢 ${user?.Department || ''}${user?.Team ? ' / ' + user.Team : ''}

📝 <b>Опишіть вашу проблему детально:</b>

<i>Напишіть повідомлення, і воно буде одразу відправлено HR для розгляду.</i>`;

    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'showASAPCategoryForm');
    await sendMessage(chatId, text, keyboard);
    
    // Встановлюємо крок для обробки тексту з категорією
    registrationCache.set(telegramId, {
      step: 'asap_message',
      category: category,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Помилка showASAPCategoryForm:', error);
  }
}

// 📋 МЕНЮ ЗАТВЕРДЖЕНЬ (PM/HR/CEO)
async function showApprovalsMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showApprovalsMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showApprovalsMenu:', error);
  }
}

// 📈 МЕНЮ АНАЛІТИКИ
async function showAnalyticsMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showAnalyticsMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showAnalyticsMenu:', error);
  }
}

// 👥 HR ПАНЕЛЬ
async function showHRPanel(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showHRPanel');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showHRPanel:', error);
  }
}

// 🏢 CEO ПАНЕЛЬ
async function showCEOPanel(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан
    navigationStack.pushState(telegramId, 'showMainMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showCEOPanel');
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
    // Зберігаємо попередній стан (меню розсилок)
    navigationStack.pushState(telegramId, 'showMailingsMenu', {});
    
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

    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'startMailingToAll');
    await sendMessage(chatId, `📢 <b>Розсилка всім співробітникам</b>

Введіть текст повідомлення:`, keyboard);
  } catch (error) {
    console.error('❌ Помилка startMailingToAll:', error);
  }
}

// Розсилка по відділу
async function startMailingToDepartment(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан (меню розсилок)
    navigationStack.pushState(telegramId, 'showMailingsMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'startMailingToDepartment');
    await sendMessage(chatId, `📢 <b>Розсилка по відділу</b>

Оберіть відділ:`, keyboard);
  } catch (error) {
    console.error('❌ Помилка startMailingToDepartment:', error);
  }
}

// Розсилка по команді
async function startMailingToTeam(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан (меню розсилок)
    navigationStack.pushState(telegramId, 'showMailingsMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'startMailingToTeam');
    await sendMessage(chatId, `📢 <b>Розсилка по команді</b>

Оберіть команду:`, keyboard);
  } catch (error) {
    console.error('❌ Помилка startMailingToTeam:', error);
  }
}

// Розсилка по ролі
async function startMailingToRole(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан (меню розсилок)
    navigationStack.pushState(telegramId, 'showMailingsMenu', {});
    
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
        ]
      ]
    };

    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'startMailingToRole');
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
    // Зберігаємо попередній стан (вибір відділу)
    navigationStack.pushState(telegramId, 'startMailingToDepartment', {});
    
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    registrationCache.set(telegramId, {
      step: 'mailing_message',
      data: { type: 'department', department: department }
    });

    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'startMailingToDepartmentSelected');
    await sendMessage(chatId, `📢 <b>Розсилка по відділу: ${department}</b>

Введіть текст повідомлення:`, keyboard);
  } catch (error) {
    console.error('❌ Помилка startMailingToDepartmentSelected:', error);
  }
}

// Обробка вибраної команди для розсилки
async function startMailingToTeamSelected(chatId, telegramId, team) {
  try {
    // Зберігаємо попередній стан (вибір команди)
    navigationStack.pushState(telegramId, 'startMailingToTeam', {});
    
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    registrationCache.set(telegramId, {
      step: 'mailing_message',
      data: { type: 'team', team: team }
    });

    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'startMailingToTeamSelected');
    await sendMessage(chatId, `📢 <b>Розсилка по команді: ${team}</b>

Введіть текст повідомлення:`, keyboard);
  } catch (error) {
    console.error('❌ Помилка startMailingToTeamSelected:', error);
  }
}

// Обробка вибраної ролі для розсилки
async function startMailingToRoleSelected(chatId, telegramId, role) {
  try {
    // Зберігаємо попередній стан (вибір ролі)
    navigationStack.pushState(telegramId, 'startMailingToRole', {});
    
    const userRole = await getUserRole(telegramId);
    if (userRole !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    registrationCache.set(telegramId, {
      step: 'mailing_message',
      data: { type: 'role', role: role }
    });

    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'startMailingToRoleSelected');
    await sendMessage(chatId, `📢 <b>Розсилка по ролі: ${role}</b>

Введіть текст повідомлення:`, keyboard);
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
    const sheet = doc.sheetsByTitle['Працівники'] || doc.sheetsByTitle['Employees'];
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
    // Зберігаємо попередній стан (меню онбордингу)
    navigationStack.pushState(telegramId, 'showOnboardingMenu', {});
    
    const text = `❓ <b>Тестування знань</b>

Познайомився з матеріалами? Давай тепер пройдемо коротеньке опитування, і дізнаємося чи про все ти пам'ятаєш.

Воно не впливає на наше до тебе відношення) тож have fun)

🔗 https://forms.google.com/onboarding-quiz

Після завершення тесту, ти одразу побачиш кількість правильних відповідей та пояснення помилок.`;

    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'showOnboardingQuiz');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showOnboardingQuiz:', error);
  }
}

// Показати правила компанії
async function showCompanyRules(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан (меню онбордингу)
    navigationStack.pushState(telegramId, 'showOnboardingMenu', {});
    
    const text = `📖 <b>Правила компанії</b>

<b>Робочий режим:</b>
• Пн-Пт 10:00-18:00
• Спізнення з 11:01
• Remote до 19:00 дня передуючого залишенню вдома

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

    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'showCompanyRules');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showCompanyRules:', error);
  }
}

// Показати структуру команди
async function showTeamStructure(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан (меню онбордингу)
    navigationStack.pushState(telegramId, 'showOnboardingMenu', {});
    
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

    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'showTeamStructure');
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
      
      // Для екстреної відпустки дозволяємо дати в минулому (для ретроспективного оформлення)
      // Але попереджаємо користувача
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
        await sendMessage(chatId, `⚠️ <b>Увага!</b> Ви вказали дату в минулому (${text}). Екстрена відпустка може бути зафіксована ретроспективно. Продовжити?`, keyboard);
        regData.step = 'emergency_vacation_confirm_past_date';
        regData.data.startDate = startDate;
        return true;
      }
      
      regData.data.startDate = startDate;
      regData.step = 'emergency_vacation_days';
      await sendMessage(chatId, `📅 <b>Дата початку:</b> ${text}\n\n📊 <b>Вкажіть кількість днів відпустки</b>\n\nВведіть кількість днів (1-7):`);
      return true;
    }
    
    if (regData.step === 'emergency_vacation_confirm_past_date') {
      if (text.toLowerCase().includes('так') || text.toLowerCase().includes('yes') || text === '✅' || text === '1') {
        regData.step = 'emergency_vacation_days';
        await sendMessage(chatId, `📅 <b>Дата початку:</b> ${formatDate(regData.data.startDate)}\n\n📊 <b>Вкажіть кількість днів відпустки</b>\n\nВведіть кількість днів (1-7):`);
        return true;
      } else {
        await sendMessage(chatId, '❌ Заявку скасовано. Почніть спочатку.');
        registrationCache.delete(telegramId);
        return true;
      }
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
    
    // Перевіряємо та конвертуємо startDate в об'єкт Date
    let startDateObj;
    if (startDate instanceof Date) {
      startDateObj = new Date(startDate);
    } else if (typeof startDate === 'string') {
      startDateObj = new Date(startDate);
    } else {
      throw new ValidationError('Невірний формат дати початку відпустки.', 'startDate');
    }
    
    // Перевіряємо валідність дати
    if (isNaN(startDateObj.getTime())) {
      throw new ValidationError('Невірна дата початку відпустки.', 'startDate');
    }
    
    // Перевіряємо кількість днів
    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 7) {
      throw new ValidationError('Кількість днів має бути від 1 до 7.', 'days');
    }
    
    // Обчислюємо дату закінчення
    const endDate = new Date(startDateObj);
    endDate.setDate(endDate.getDate() + daysNum - 1);
    
    // Перевіряємо валідність дати закінчення
    if (isNaN(endDate.getTime())) {
      throw new ValidationError('Невірна дата закінчення відпустки.', 'endDate');
    }
    
    console.log(`📅 Обробка заявки: початок=${startDateObj.toISOString()}, кінець=${endDate.toISOString()}, днів=${daysNum}`);
    
    // Перевіряємо перетини з іншими відпустками
    const conflicts = await checkVacationConflicts(user.department, user.team, startDateObj, endDate, telegramId);
    
    if (conflicts.length > 0) {
      let conflictMessage = '⚠️ <b>Упс, твоя відпустка пересікається з Людинкою з твоєї команди:</b>\n\n';
      conflicts.forEach(conflict => {
        conflictMessage += `👤 ${conflict.fullName} (${conflict.department}/${conflict.team})\n`;
        conflictMessage += `📅 ${conflict.startDate} - ${conflict.endDate}\n\n`;
      });
      conflictMessage += 'Будь ласка, оберіть інші дати.';
      
      await sendMessage(chatId, conflictMessage);
      
      // Повідомляємо HR про конфлікт
      await notifyHRAboutConflict(user, conflicts, startDateObj, endDate);
      return;
    }
    
    // Перевіряємо баланс відпусток
    const balance = await getVacationBalance(telegramId);
    if (balance.remaining < daysNum) {
      // Якщо днів немає або недостатньо - відмовляємо і повідомляємо HR
      const remainingText = balance.remaining === 0 
        ? 'У вас залишилось 0 днів відпустки' 
        : `У вас залишилось ${balance.remaining} днів відпустки`;
      
      await sendMessage(chatId, `❌ <b>Відпустку відмовлено</b>\n\n${remainingText}. Потрібно: ${daysNum} днів.\n\nЗверніться до HR для уточнення.`);
      
      // Одразу повідомляємо HR про спробу взяти відпустку без днів
      await notifyHRAboutVacationDenial(user, startDateObj, endDate, daysNum, balance.remaining);
      return;
    }
    
    // Перевіряємо підключення до Google Sheets перед збереженням
    if (!doc) {
      console.warn('⚠️ Google Sheets не підключено, спробуємо перепідключитися...');
      // Спробуємо перепідключитися
      const reconnected = await initGoogleSheets();
      if (!reconnected || !doc) {
        throw new DatabaseError('Google Sheets не підключено. Зверніться до HR для налаштування.', 'save_vacation');
      }
      console.log('✅ Google Sheets перепідключено успішно');
    }
    
    // Перевіряємо чи є PM для користувача
    const pm = await getPMForUser(user);
    const hasPM = pm !== null;
    
    // Визначаємо статус заявки
    const initialStatus = hasPM ? 'pending_pm' : 'pending_hr';
    
    // Зберігаємо заявку в таблицю
    const requestId = await saveVacationRequest(telegramId, user, startDateObj, endDate, daysNum, initialStatus, pm);
    
    // Оновлюємо баланс відпусток (тільки після затвердження)
    // await updateVacationBalance(telegramId, user, days);
    
    if (hasPM) {
      // Якщо є PM - відправляємо PM, потім HR
      await notifyPMAboutVacationRequest(user, requestId, startDateObj, endDate, daysNum, pm);
      await notifyHRAboutVacationRequest(user, requestId, startDateObj, endDate, daysNum, conflicts, false);
      
      // Підтвердження користувачу
      await sendMessage(chatId, `✅ <b>Супер, твій запит відправляється далі!</b>\n\n📅 <b>Період:</b> ${formatDate(startDateObj)} - ${formatDate(endDate)}\n📊 <b>Днів:</b> ${daysNum}\n👤 <b>PM:</b> ${pm.fullName}\n\n⏳ Заявка відправлена на затвердження PM, після чого перейде до HR.`);
    } else {
      // Якщо немає PM - відправляємо одразу HR з можливістю підтвердження
      await notifyHRAboutVacationRequest(user, requestId, startDateObj, endDate, daysNum, conflicts, true);
      
      // Підтвердження користувачу
      await sendMessage(chatId, `✅ <b>Супер, твій запит відправляється далі!</b>\n\n📅 <b>Період:</b> ${formatDate(startDateObj)} - ${formatDate(endDate)}\n📊 <b>Днів:</b> ${daysNum}\n👤 <b>PM:</b> Не призначено\n\n⏳ Заявка відправлена одразу на затвердження HR.`);
    }
    
    // Логування
    await logUserData(telegramId, 'vacation_request', {
      requestId,
      startDate: startDateObj.toISOString(),
      endDate: endDate.toISOString(),
      days: daysNum,
      department: user.department,
      team: user.team
    });
    
  } catch (error) {
    console.error('❌ Помилка processVacationRequest:', error);
    console.error('❌ Stack:', error.stack);
    console.error('❌ Vacation data:', JSON.stringify(vacationData, null, 2));
    
    if (error instanceof ValidationError) {
      logger.warn('Validation error in vacation request', { telegramId, error: error.message });
      await sendMessage(chatId, `❌ ${error.message}`);
    } else if (error instanceof DatabaseError) {
      logger.error('Database error in vacation request', error, { telegramId });
      // Показуємо конкретне повідомлення про помилку, якщо воно є
      const errorMessage = error.message || 'Помилка збереження даних';
      await sendMessage(chatId, `❌ ${errorMessage}. Спробуйте пізніше або зверніться до HR.`);
    } else if (error instanceof TelegramError) {
      logger.error('Telegram error in vacation request', error, { telegramId });
      // Не відправляємо повідомлення, якщо бот заблокований
    } else {
      logger.error('Unexpected error in vacation request', error, { telegramId, vacationData });
      try {
        await sendMessage(chatId, `❌ Сталася неочікувана помилка: ${error.message || 'невідома помилка'}. Спробуйте пізніше або зверніться до HR.`);
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
  return executeWithRetryAndMonitor(
    async () => {
      if (!doc) {
        throw new DatabaseError('Google Sheets не підключено', 'save_vacation');
      }
      
      await doc.loadInfo();
      let sheet = doc.sheetsByTitle['Відпустки'];
      if (!sheet) {
        sheet = await doc.addSheet({
          title: 'Відпустки',
          headerValues: [
            'ID заявки', 'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 'PM',
            'Дата початку', 'Дата закінчення', 'Кількість днів', 'Статус', 
            'Тип заявки', 'Причина', 'Дата створення', 'Затверджено ким', 'Дата затвердження',
            'Баланс до', 'Баланс після'
          ]
        });
      }
      
      const requestId = `VAC_${Date.now()}_${telegramId}`;
      const pmName = pm ? pm.fullName : (user.pm || 'Не призначено');
      
      // Отримуємо баланс до додавання відпустки
      const balanceBefore = await getVacationBalance(telegramId);
      const balanceAfter = {
        remaining: Math.max(0, balanceBefore.remaining - days),
        used: balanceBefore.used + days
      };
      
      await sheet.addRow({
        'ID заявки': requestId,
        'TelegramID': telegramId,
        'Ім\'я та прізвище': user.fullName,
        'Відділ': user.department,
        'Команда': user.team,
        'PM': pmName,
        'Дата початку': startDate.toISOString().split('T')[0],
        'Дата закінчення': endDate.toISOString().split('T')[0],
        'Кількість днів': days,
        'Статус': status,
        'Тип заявки': requestType,
        'Причина': reason || '',
        'Дата створення': new Date().toISOString(),
        'Затверджено ким': '',
        'Дата затвердження': '',
        'Баланс до': balanceBefore.remaining,
        'Баланс після': balanceAfter.remaining
      });
      
      console.log(`✅ Збережено заявку на відпустку: ${requestId}, статус: ${status}, тип: ${requestType}`);
      return requestId;
    },
    'saveVacationRequest',
    { telegramId, requestType, status }
  ).catch(error => {
    logger.error('Failed to save vacation request after retries', error, { telegramId });
    throw error;
  });
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

// 🚨 ПОВІДОМЛЕННЯ HR ПРО ВІДМОВУ ВІДПУСТКИ (НЕДОСТАТНЬО ДНІВ)
async function notifyHRAboutVacationDenial(user, startDate, endDate, days, remainingDays) {
  try {
    if (!HR_CHAT_ID) return;
    
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
    
    await sendMessage(HR_CHAT_ID, message);
    
    // Логування
    await logUserData(user.telegramId, 'hr_vacation_denial_notification', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days,
      remainingDays,
      department: user.department,
      team: user.team
    });
  } catch (error) {
    console.error('❌ Помилка notifyHRAboutVacationDenial:', error);
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
  return executeWithRetryAndMonitor(
    async () => {
      if (!doc) throw new Error('Google Sheets не підключено');
      
      await doc.loadInfo();
      let sheet = doc.sheetsByTitle['Спізнення'];
      if (!sheet) {
        sheet = await doc.addSheet({
          title: 'Спізнення',
          headerValues: [
            'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 
            'Дата', 'Час', 'Причина', 'Дата створення'
          ]
        });
      }
      
      await sheet.addRow({
        'TelegramID': telegramId,
        'Ім\'я та прізвище': user.fullName,
        'Відділ': user.department,
        'Команда': user.team,
        'Дата': date.toISOString().split('T')[0],
        'Час': time,
        'Причина': reason,
        'Дата створення': new Date().toISOString()
      });
      
      console.log(`✅ Збережено спізнення: ${user.fullName} - ${date.toISOString().split('T')[0]} ${time}`);
    },
    'saveLateRecord',
    { telegramId, date: date.toISOString().split('T')[0] }
  ).catch(error => {
    logger.error('Failed to save late record after retries', error, { telegramId });
    throw error;
  });
}

// Збереження remote запису
async function saveRemoteRecord(telegramId, user, date, type = 'remote') {
  return executeWithRetryAndMonitor(
    async () => {
      if (!doc) throw new Error('Google Sheets не підключено');
      
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
    },
    'saveRemoteRecord',
    { telegramId, date: date.toISOString().split('T')[0], type }
  ).catch(error => {
    logger.error('Failed to save remote record after retries', error, { telegramId });
    throw error;
  });
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
    // Зберігаємо попередній стан (HR панель)
    navigationStack.pushState(telegramId, 'showHRPanel', {});
    
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
        ]
      ]
    };
    
    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showHRExportMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showHRExportMenu:', error);
  }
}

// 📤 Меню експорту для CEO
async function showCEOExportMenu(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан (CEO панель)
    navigationStack.pushState(telegramId, 'showCEOPanel', {});
    
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
        ]
      ]
    };
    
    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showCEOExportMenu');
    
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showCEOExportMenu:', error);
  }
}

// 📤 Експорт даних по працівнику (HR)
async function showHRExportEmployee(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан (меню експорту)
    navigationStack.pushState(telegramId, 'showHRExportMenu', {});
    
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
    const employeesSheet = doc.sheetsByTitle['Працівники'] || doc.sheetsByTitle['Employees'];
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
    
    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showHRExportEmployee');
    
    // Розбиваємо на кілька повідомлень, якщо кнопок багато
    if (keyboard.inline_keyboard.length > 10) {
      await sendMessage(chatId, text.substring(0, 4000));
      // Відправляємо кнопки окремо
      const buttonsKeyboard = {
        inline_keyboard: keyboard.inline_keyboard.slice(0, 10)
      };
      addBackButton(buttonsKeyboard, telegramId, 'showHRExportEmployee');
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
    // Зберігаємо попередній стан (меню експорту)
    navigationStack.pushState(telegramId, 'showHRExportMenu', {});
    
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
    const employeesSheet = doc.sheetsByTitle['Працівники'] || doc.sheetsByTitle['Employees'];
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
    
    // Додаємо кнопку "Назад"
    addBackButton(keyboard, telegramId, 'showHRExportDepartment');
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
    // Зберігаємо попередній стан (список працівників)
    const role = await getUserRole(telegramId);
    const previousState = role === 'CEO' ? 'showCEOExportEmployee' : 'showHRExportEmployee';
    navigationStack.pushState(telegramId, previousState, {});
    
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
    const vacationsSheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
    const vacations = vacationsSheet ? (await vacationsSheet.getRows()).filter(row => 
      row.get('TelegramID') == targetTelegramId
    ) : [];
    
    // Збираємо дані про спізнення
    const lateSheet = doc.sheetsByTitle['Спізнення'] || doc.sheetsByTitle['Lates'];
    const lateRecords = lateSheet ? (await lateSheet.getRows()).filter(row => 
      row.get('TelegramID') == targetTelegramId
    ) : [];
    
    // Збираємо дані про Remote
    const remoteSheet = doc.sheetsByTitle['Remotes'];
    const remoteRecords = remoteSheet ? (await remoteSheet.getRows()).filter(row => 
      row.get('TelegramID') == targetTelegramId
    ) : [];
    
    // Збираємо дані про лікарняні
    const sickSheet = doc.sheetsByTitle['Лікарняні'] || doc.sheetsByTitle['Sick'];
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
    
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'exportEmployeeData');
    await sendMessage(chatId, 'Оберіть наступну дію:', keyboard);
    
  } catch (error) {
    console.error('❌ Помилка exportEmployeeData:', error);
    await sendMessage(chatId, '❌ Помилка експорту даних.');
  }
}

// 📊 Експорт даних по відділу
async function exportDepartmentData(chatId, telegramId, department) {
  try {
    // Зберігаємо попередній стан (список відділів)
    const role = await getUserRole(telegramId);
    const previousState = role === 'CEO' ? 'showCEOExportDepartment' : 'showHRExportDepartment';
    navigationStack.pushState(telegramId, previousState, {});
    
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
    const employeesSheet = doc.sheetsByTitle['Працівники'] || doc.sheetsByTitle['Employees'];
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
    const vacationsSheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
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
    const lateSheet = doc.sheetsByTitle['Lates'];
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
    const remoteSheet = doc.sheetsByTitle['Remotes'];
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
    
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'exportDepartmentData');
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
      regData.step = 'late_reason_choice';
      registrationCache.set(telegramId, regData);
      
      // Показуємо кнопки для вибору: додати причину або пропустити
      const keyboard = {
        inline_keyboard: [
          [
            { text: '📝 Додати причину', callback_data: 'late_add_reason' }
          ],
          [
            { text: '⏭️ Пропустити', callback_data: 'late_skip_reason' }
          ]
        ]
      };
      addBackButton(keyboard, telegramId, 'late_time');
      await sendMessage(chatId, '📝 <b>Чи хочете додати причину спізнення?</b>', keyboard);
      return true;
    }
    
    if (regData.step === 'late_reason_input') {
      if (!text || text.trim().length < 3) {
        await sendMessage(chatId, '❌ Будь ласка, вкажіть причину (мінімум 3 символи).');
        return true;
      }
      regData.data.reason = text.trim();
      registrationCache.set(telegramId, regData);
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
    // Зберігаємо попередній стан (меню спізнень)
    navigationStack.pushState(telegramId, 'showLateMenu', {});
    
    const user = await getUserInfo(telegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений.');
      return;
    }
    
    registrationCache.set(telegramId, {
      step: 'late_date_selection',
      data: {}
    });
    
    const today = new Date();
    const todayFormatted = formatDate(today);
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: `📅 Сьогодні (${todayFormatted})`, callback_data: 'late_today' }
        ],
        [
          { text: '📅 Інша дата', callback_data: 'late_other_date' }
        ]
      ]
    };
    
    addBackButton(keyboard, telegramId, 'reportLate');
    await sendMessage(chatId, '⏰ <b>Повідомлення про спізнення</b>\n\n📅 <b>Оберіть дату спізнення:</b>', keyboard);
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

// 📅 ОБРОБКА СПІЗНЕННЯ СЬОГОДНІ
async function handleLateToday(chatId, telegramId) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) {
      await sendMessage(chatId, '❌ Помилка. Спробуйте спочатку.');
      return;
    }
    
    const today = new Date();
    regData.data.date = today;
    regData.step = 'late_time';
    registrationCache.set(telegramId, regData);
    
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'late_today');
    await sendMessage(chatId, '⏰ <b>О котрій годині ви почнете працювати?</b>\n\nВведіть час у форматі ГГ:ХХ (наприклад: 12:30):', keyboard);
  } catch (error) {
    console.error('❌ Помилка handleLateToday:', error);
  }
}

// 📅 ОБРОБКА ІНШОЇ ДАТИ СПІЗНЕННЯ
async function handleLateOtherDate(chatId, telegramId) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) {
      await sendMessage(chatId, '❌ Помилка. Спробуйте спочатку.');
      return;
    }
    
    regData.step = 'late_date';
    registrationCache.set(telegramId, regData);
    
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'late_other_date');
    await sendMessage(chatId, '📅 <b>Вкажіть дату спізнення</b> (ДД.ММ.РРРР):', keyboard);
  } catch (error) {
    console.error('❌ Помилка handleLateOtherDate:', error);
  }
}

// 📝 ОБРОБКА ДОДАВАННЯ ПРИЧИНИ
async function handleLateAddReason(chatId, telegramId) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) {
      await sendMessage(chatId, '❌ Помилка. Спробуйте спочатку.');
      return;
    }
    
    regData.step = 'late_reason_input';
    registrationCache.set(telegramId, regData);
    
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'late_add_reason');
    await sendMessage(chatId, '📝 <b>Вкажіть причину спізнення:</b>', keyboard);
  } catch (error) {
    console.error('❌ Помилка handleLateAddReason:', error);
  }
}

// ⏭️ ОБРОБКА ПРОПУСКУ ПРИЧИНИ
async function handleLateSkipReason(chatId, telegramId) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) {
      await sendMessage(chatId, '❌ Помилка. Спробуйте спочатку.');
      return;
    }
    
    regData.data.reason = 'Не вказано';
    registrationCache.set(telegramId, regData);
    await processLateReport(chatId, telegramId, regData.data);
    registrationCache.delete(telegramId);
  } catch (error) {
    console.error('❌ Помилка handleLateSkipReason:', error);
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
    // Зберігаємо попередній стан (меню спізнень)
    navigationStack.pushState(telegramId, 'showLateMenu', {});
    
    const stats = await getLateStatsForCurrentMonth(telegramId);
    const text = `📊 <b>Статистика спізнень за поточний місяць</b>\n\n⏰ <b>Кількість спізнень:</b> ${stats.count}\n⚠️ <b>Ліміт:</b> 7 спізнень/місяць\n\n${stats.count >= 7 ? '⚠️ Досягнуто ліміт спізнень!' : `✅ Залишилось: ${7 - stats.count}`}`;
    
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'showLateStats');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showLateStats:', error);
  }
}

async function getLateStatsForCurrentMonth(telegramId) {
  try {
    if (!doc) return { count: 0 };
    await doc.loadInfo();
    // Спробуємо спочатку українську назву, потім англійську для сумісності
    const sheet = doc.sheetsByTitle['Спізнення'] || doc.sheetsByTitle['Lates'];
    if (!sheet) return { count: 0 };
    
    const rows = await sheet.getRows();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const userLate = rows.filter(row => {
      if (row.get('TelegramID') != telegramId) return false;
      // Підтримуємо обидва формати назв колонок
      const dateValue = row.get('Дата') || row.get('Date');
      if (!dateValue) return false;
      const rowDate = new Date(dateValue);
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
    // Зберігаємо попередній стан (меню remote)
    navigationStack.pushState(telegramId, 'showRemoteMenu', {});
    
    const user = await getUserInfo(telegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений.');
      return;
    }
    
    registrationCache.set(telegramId, {
      step: 'remote_date',
      data: { type: 'today' }
    });
    
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'setRemoteToday');
    await sendMessage(chatId, '🏠 <b>Remote робота</b>\n\n📅 <b>Вкажіть дату Remote роботи</b> (ДД.ММ.РРРР):\n\n⚠️ Повідомлення має бути до 19:00 дня передуючого залишенню вдома.', keyboard);
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
    // Зберігаємо попередній стан (меню remote)
    navigationStack.pushState(telegramId, 'showRemoteMenu', {});
    
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'showRemoteCalendar');
    await sendMessage(chatId, '📅 Календар Remote роботи в розробці.', keyboard);
  } catch (error) {
    console.error('❌ Помилка showRemoteCalendar:', error);
  }
}

async function showRemoteStats(chatId, telegramId) {
  try {
    // Зберігаємо попередній стан (меню remote)
    navigationStack.pushState(telegramId, 'showRemoteMenu', {});
    
    const stats = await getRemoteStatsForCurrentMonth(telegramId);
    const text = `📊 <b>Статистика Remote роботи за поточний місяць</b>\n\n🏠 <b>Використано днів:</b> ${stats.used}`;
    
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'showRemoteStats');
    await sendMessage(chatId, text, keyboard);
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
    // Зберігаємо попередній стан (меню лікарняних)
    navigationStack.pushState(telegramId, 'showSickMenu', {});
    
    const user = await getUserInfo(telegramId);
    if (!user) {
      await sendMessage(chatId, '❌ Користувач не знайдений.');
      return;
    }
    
    registrationCache.set(telegramId, {
      step: 'sick_date',
      data: {}
    });
    
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'reportSick');
    await sendMessage(chatId, '🏥 <b>Лікарняний</b>\n\n📅 <b>Вкажіть дату лікарняного</b> (ДД.ММ.РРРР):', keyboard);
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
    const dateObj = new Date(date);
    await saveSickRecord(telegramId, user, dateObj);
    
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
    // Зберігаємо попередній стан (меню лікарняних)
    navigationStack.pushState(telegramId, 'showSickMenu', {});
    
    const stats = await getSickStatsForCurrentMonth(telegramId);
    const text = `📊 <b>Статистика лікарняних за поточний місяць</b>\n\n🏥 <b>Днів:</b> ${stats.days}\n📝 <b>Записів:</b> ${stats.count}`;
    
    const keyboard = addBackButton({ inline_keyboard: [] }, telegramId, 'showSickStats');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showSickStats:', error);
  }
}

// 🚨 ОБРОБКА ASAP ЗАПИТУ
/**
 * Обробляє ASAP запит від користувача з категорією
 * @param {number} chatId - ID чату
 * @param {number} telegramId - Telegram ID користувача
 * @param {string} message - Текст запиту
 * @param {string} category - Категорія запиту (conflict, health, finance, legal, workplace, team, security, other)
 * @returns {Promise<void>}
 */
async function processASAPRequest(chatId, telegramId, message, category = 'other') {
  return executeWithRetryAndMonitor(
    async () => {
      if (!doc) throw new Error('Google Sheets не підключено');
      
      const user = await getUserInfo(telegramId);
      if (!user) {
        throw new Error('Користувач не знайдено');
      }
      
      // Мапінг категорій на назви таблиць
      const categoryToSheet = {
        'conflict': 'ASAP_Конфлікти',
        'health': 'ASAP_Здоров\'я',
        'finance': 'ASAP_Фінанси',
        'legal': 'ASAP_Документи',
        'workplace': 'ASAP_РобочеМісце',
        'team': 'ASAP_Команда',
        'security': 'ASAP_Безпека',
        'other': 'ASAP_Інше'
      };
      
      const categoryNames = {
        'conflict': 'Конфлікт/Проблема',
        'health': 'Здоров\'я/Медицина',
        'finance': 'Фінанси/Зарплата',
        'legal': 'Документи/Юридичне',
        'workplace': 'Робоче місце/Офіс',
        'team': 'Стосунки в команді',
        'security': 'Безпека/Конфіденційність',
        'other': 'Інше'
      };
      
      const sheetName = categoryToSheet[category] || categoryToSheet['other'];
      const categoryName = categoryNames[category] || 'Інше';
      
      await doc.loadInfo();
      
      // 1. Головна таблиця з усіма ASAP запитами
      let mainSheet = doc.sheetsByTitle['ASAP_Requests'];
      if (!mainSheet) {
        mainSheet = await doc.addSheet({
          title: 'ASAP_Requests',
          headerValues: [
            'RequestID', 'TelegramID', 'FullName', 'Department', 'Team', 'Category', 'Message', 'CreatedAt', 'Status'
          ]
        });
      }
      
      // 2. Окрема таблиця по категорії
      let categorySheet = doc.sheetsByTitle[sheetName];
      if (!categorySheet) {
        categorySheet = await doc.addSheet({
          title: sheetName,
          headerValues: [
            'RequestID', 'TelegramID', 'FullName', 'Department', 'Team', 'Category', 'Message', 'CreatedAt', 'Status'
          ]
        });
      }
      
      const requestId = `ASAP_${category.toUpperCase()}_${Date.now()}_${telegramId}`;
      const now = new Date();
      
      const rowData = {
        RequestID: requestId,
        TelegramID: telegramId,
        FullName: user.fullName || user.FullName || 'Невідомо',
        Department: user.department || user.Department || 'Невідомо',
        Team: user.team || user.Team || 'Невідомо',
        Category: categoryName,
        Message: message,
        CreatedAt: now.toISOString(),
        Status: 'pending'
      };
      
      // Зберігаємо в обидві таблиці
      await mainSheet.addRow(rowData);
      await categorySheet.addRow(rowData);
      
      console.log(`✅ Збережено ASAP запит: ${requestId} в таблицю ${sheetName} та в головну таблицю ASAP_Requests`);
      
      // Підтвердження користувачу
      await sendMessage(chatId, `✅ <b>ASAP запит відправлено!</b>\n\n📂 <b>Категорія:</b> ${categoryName}\n📝 <b>Ваше повідомлення:</b>\n"${message}"\n\n⏰ HR отримає повідомлення негайно.`);
      
      // Негайне повідомлення HR
      if (HR_CHAT_ID) {
        const hrMessage = `🚨 <b>ASAP ЗАПИТ</b>\n\n📂 <b>Категорія:</b> ${categoryName}\n\n👤 <b>Співробітник:</b> ${user.fullName || user.FullName || 'Невідомо'}\n🏢 <b>Відділ:</b> ${user.department || user.Department || 'Невідомо'}\n👥 <b>Команда:</b> ${user.team || user.Team || 'Невідомо'}\n\n📝 <b>Повідомлення:</b>\n${message}\n\n⏰ <b>Час:</b> ${now.toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' })}\n\n🆔 <b>ID запиту:</b> ${requestId}\n📊 <b>Таблиця:</b> ${sheetName}`;
        await sendMessage(HR_CHAT_ID, hrMessage);
        console.log(`✅ Відправлено ASAP запит HR: ${requestId}`);
      }
    },
    'processASAPRequest',
    { telegramId, category }
  ).catch(error => {
    logger.error('Failed to process ASAP request after retries', error, { telegramId, category });
    sendMessage(chatId, '❌ Помилка відправки ASAP запиту. Спробуйте пізніше.');
    throw error;
  });
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

async function saveSickRecord(telegramId, user, startDate, endDate = null) {
  return executeWithRetryAndMonitor(
    async () => {
      if (!doc) throw new Error('Google Sheets не підключено');
      await doc.loadInfo();
      let sheet = doc.sheetsByTitle['Лікарняні'];
      if (!sheet) {
        sheet = await doc.addSheet({
          title: 'Лікарняні',
          headerValues: [
            'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 
            'Дата початку', 'Дата закінчення', 'Термін (днів)', 'Причина', 'Дата створення'
          ]
        });
      }
      
      // Якщо endDate не вказано, вважаємо що це один день
      const endDateObj = endDate || startDate;
      const daysCount = Math.ceil((endDateObj - startDate) / (1000 * 60 * 60 * 24)) + 1;
      
      await sheet.addRow({
        'TelegramID': telegramId,
        'Ім\'я та прізвище': user.fullName,
        'Відділ': user.department,
        'Команда': user.team,
        'Дата початку': startDate.toISOString().split('T')[0],
        'Дата закінчення': endDateObj.toISOString().split('T')[0],
        'Термін (днів)': daysCount,
        'Причина': '',
        'Дата створення': new Date().toISOString()
      });
      
      console.log(`✅ Збережено лікарняний: ${user.fullName} - ${startDate.toISOString().split('T')[0]} (${daysCount} днів)`);
    },
    'saveSickRecord',
    { telegramId, startDate: startDate.toISOString().split('T')[0] }
  ).catch(error => {
    logger.error('Failed to save sick record after retries', error, { telegramId });
    throw error;
  });
}

// 📊 ДАШБОРД СТАТИСТИКИ ДЛЯ HR/CEO
/**
 * Показує загальну статистику для HR та CEO
 * @param {number} chatId - ID чату
 * @param {number} telegramId - Telegram ID користувача
 * @returns {Promise<void>}
 */
async function showHRDashboardStats(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR' && role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR та CEO.');
      return;
    }

    if (!doc) {
      await sendMessage(chatId, '❌ Google Sheets не підключено.');
      return;
    }

    return executeWithRetryAndMonitor(
      async () => {
        await doc.loadInfo();
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Отримуємо статистику по відпустках
        const vacationsSheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
        const allVacations = vacationsSheet ? await vacationsSheet.getRows() : [];
        
        const thisMonthVacations = allVacations.filter(v => {
          const date = new Date(v.get('CreatedAt') || v.get('StartDate'));
          return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });
        
        const pendingVacations = thisMonthVacations.filter(v => 
          v.get('Status') === 'pending_pm' || v.get('Status') === 'pending_hr'
        );
        
        const approvedVacations = thisMonthVacations.filter(v => 
          v.get('Status') === 'approved'
        );

        // Отримуємо статистику по спізненнях
        const latesSheet = doc.sheetsByTitle['Спізнення'] || doc.sheetsByTitle['Lates'];
        const allLates = latesSheet ? await latesSheet.getRows() : [];
        
        const thisMonthLates = allLates.filter(l => {
          const date = new Date(l.get('Date'));
          return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        // Отримуємо статистику по Remote
        const remotesSheet = doc.sheetsByTitle['Remotes'];
        const allRemotes = remotesSheet ? await remotesSheet.getRows() : [];
        
        const thisMonthRemotes = allRemotes.filter(r => {
          const date = new Date(r.get('Date'));
          return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        // Отримуємо статистику по лікарняних
        const sickSheet = doc.sheetsByTitle['Sick'];
        const allSick = sickSheet ? await sickSheet.getRows() : [];
        
        const thisMonthSick = allSick.filter(s => {
          const date = new Date(s.get('Date'));
          return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        // Отримуємо кількість працівників
        const employeesSheet = doc.sheetsByTitle['Працівники'] || doc.sheetsByTitle['Employees'];
        const allEmployees = employeesSheet ? await employeesSheet.getRows() : [];
        const totalEmployees = allEmployees.length;

        // Формуємо звіт
        let report = `📊 <b>ДАШБОРД СТАТИСТИКИ</b>\n\n`;
        report += `📅 <b>Період:</b> ${now.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })}\n`;
        report += `👥 <b>Всього працівників:</b> ${totalEmployees}\n\n`;

        report += `🏖️ <b>ВІДПУСТКИ</b>\n`;
        report += `• Заявок за місяць: ${thisMonthVacations.length}\n`;
        report += `• Очікують затвердження: ${pendingVacations.length}\n`;
        report += `• Затверджено: ${approvedVacations.length}\n\n`;

        report += `⏰ <b>СПІЗНЕННЯ</b>\n`;
        report += `• Записів за місяць: ${thisMonthLates.length}\n`;
        const criticalLates = thisMonthLates.length > 7 ? thisMonthLates.length : 0;
        if (criticalLates > 0) {
          report += `⚠️ <b>Критичних випадків (>7): ${criticalLates}</b>\n`;
        }
        report += `\n`;

        report += `🏠 <b>REMOTE</b>\n`;
        report += `• Днів за місяць: ${thisMonthRemotes.length}\n\n`;

        report += `🏥 <b>ЛІКАРНЯНІ</b>\n`;
        report += `• Днів за місяць: ${thisMonthSick.length}\n\n`;

        // Алерти
        if (pendingVacations.length > 0) {
          report += `⚠️ <b>Увага!</b> Є ${pendingVacations.length} заявок на відпустку, що очікують затвердження.\n`;
        }

        if (criticalLates > 0) {
          report += `🚨 <b>Критично!</b> ${criticalLates} працівників мають більше 7 спізнень за місяць.\n`;
        }

        await sendMessage(chatId, report);

        const keyboard = {
          inline_keyboard: [
            [
              { text: '📤 Експорт даних', callback_data: role === 'CEO' ? 'ceo_export' : 'hr_export' },
              { text: '📋 Детальні звіти', callback_data: role === 'CEO' ? 'ceo_panel' : 'hr_panel' }
            ],
            [
              { text: '⬅️ Головне меню', callback_data: 'back_to_main' }
            ]
          ]
        };
        await sendMessage(chatId, 'Оберіть дію:', keyboard);
      },
      'showHRDashboardStats',
      { telegramId, role }
    );
  } catch (error) {
    logger.error('Failed to show HR dashboard stats', error, { telegramId });
    await sendMessage(chatId, '❌ Помилка завантаження статистики. Спробуйте пізніше.');
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

// Експорт функцій для використання в модульній структурі
module.exports = {
  processMessage,
  processCallback,
  sendMessage,
  getUserInfo,
  getUserRole,
  getPMForUser,
  showMainMenu,
  showWelcomeMessage,
  handleReplyKeyboard,
  handleVacationProcess,
  handleLateProcess,
  handleRemoteProcess,
  handleSickProcess,
  handleRegistrationStep,
  handleHRMailing,
  showHRDashboardStats,
  formatDate,
  isValidDate,
  // Експортуємо змінні для доступу
  bot,
  doc,
  userCache,
  registrationCache,
  processedUpdates
};

// Запуск сервера тільки якщо файл запускається напряму
if (require.main === module) {
  startServer();
  console.log('✅ HR Bot Ultimate server started successfully');
}