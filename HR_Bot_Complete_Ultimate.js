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
const { HybridCache } = require('./utils/cache');
const logger = require('./utils/logger');
const { messageLimiter, callbackLimiter, registrationLimiter } = require('./utils/rateLimiter');
const { validateVacationRequest, validateRegistrationData, validateTelegramId } = require('./utils/validation');
const { getSheetValue, getSheetValueByLanguage, getTelegramId, matchesTelegramId } = require('./utils/sheetsHelpers');
const { handleError, withErrorHandling, errorHandlingMiddleware } = require('./utils/errorHandler');
const { batchAddRows, batchUpdateRows, getAllRowsPaginated } = require('./utils/sheetsBatch');
// const Groq = require('groq-sdk'); // Тимчасово відключено

// 📦 ІМПОРТ МОДУЛІВ (Services та Handlers)
const NotificationService = require('./services/notification.service');
const VacationService = require('./services/vacation.service');
const VacationHandler = require('./handlers/vacation.handler');
const RemoteHandler = require('./handlers/remote.handler');
const LateHandler = require('./handlers/late.handler');
const SickHandler = require('./handlers/sick.handler');
const RegistrationHandler = require('./handlers/registration.handler');
const ApprovalHandler = require('./handlers/approval.handler');

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

// ✅ ЛОГЕР ІМПОРТОВАНО З utils/logger.js (безпечний, не логує особисті дані)

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

// ✅ Використовуємо гібридний кеш (Redis + пам'ять)
// Якщо REDIS_URL встановлено - використовує Redis для персистентності
// Якщо ні - працює як звичайний кеш в пам'яті

// 🤖 ІНІЦІАЛІЗАЦІЯ
const bot = new TelegramBot(BOT_TOKEN);
const app = express();
let doc;
let BOT_USERNAME = null; // Буде заповнено при ініціалізації

// 🧠 AI Система (проста, але працює)
console.log('✅ AI система активна (проста база знань)');

// 🛡️ ОПТИМІЗОВАНИЙ ЗАХИСТ ВІД ДУБЛЮВАННЯ
const processedUpdates = new HybridCache('processed', 1000, 2 * 60 * 1000); // 1000 запитів, 2 хвилини

// 💾 ОПТИМІЗОВАНИЙ КЕШ З ПІДТРИМКОЮ REDIS
// Redis автоматично ініціалізується в конструкторі HybridCache
// Якщо REDIS_URL не встановлено - працює як звичайний кеш в пам'яті
const userCache = new HybridCache('users', 500, 10 * 60 * 1000); // 500 користувачів, 10 хвилин
const registrationCache = new HybridCache('registration', 100, 15 * 60 * 1000); // 100 реєстрацій, 15 хвилин
// Тимчасовий кеш для збережених заявок (для швидкого пошуку до синхронізації Google Sheets)
const vacationRequestsCache = new HybridCache('vacation_requests', 200, 5 * 60 * 1000); // 200 заявок, 5 хвилин

// 📊 МОНІТОРИНГ КЕШУ ТА ЧЕРГИ (кожні 10 хвилин)
setInterval(() => {
  console.log(`📊 Кеш статистика: userCache=${userCache.size()}, registrationCache=${registrationCache.size()}, processedUpdates=${processedUpdates.size()}, vacationRequestsCache=${vacationRequestsCache.size()}`);
  console.log(`🚦 Черга запитів: активні=${sheetsQueue.getRunningCount()}, в черзі=${sheetsQueue.getQueueLength()}`);
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

// 🚦 ЧЕРГА ЗАПИТІВ ДЛЯ ЗАПОБІГАННЯ RATE LIMIT
/**
 * Черга для обмеження одночасних запитів до Google Sheets API
 * Запобігає перевищенню rate limits та покращує стабільність
 */
class RequestQueue {
  constructor(maxConcurrent = 3, delayBetweenRequests = 100) {
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = maxConcurrent;
    this.delayBetweenRequests = delayBetweenRequests;
  }

  /**
   * Додає функцію до черги
   * @param {Function} fn - Асинхронна функція для виконання
   * @returns {Promise<any>} Результат виконання функції
   */
  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  /**
   * Обробляє чергу запитів
   * @private
   */
  async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    this.running++;
    const { fn, resolve, reject } = this.queue.shift();
    
    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      
      // Затримка перед наступним запитом
      if (this.queue.length > 0) {
        await new Promise(r => setTimeout(r, this.delayBetweenRequests));
      }
      
      this.process();
    }
  }

  /**
   * Отримує поточну кількість активних запитів
   * @returns {number}
   */
  getRunningCount() {
    return this.running;
  }

  /**
   * Отримує кількість запитів в черзі
   * @returns {number}
   */
  getQueueLength() {
    return this.queue.length;
  }
}

// Створюємо глобальну чергу для Google Sheets операцій
const sheetsQueue = new RequestQueue(3, 100); // Максимум 3 одночасні запити, затримка 100мс

// 🎯 ІНІЦІАЛІЗАЦІЯ SERVICES ТА HANDLERS (буде викликана після initGoogleSheets)
let notificationService;
let vacationService;
let vacationHandler;
let remoteHandler;
let lateHandler;
let sickHandler;
let registrationHandler;
let approvalHandler;

// Функція для ініціалізації всіх модулів (викликається після initGoogleSheets)
function initializeModules() {
  // Створюємо залежності для services та handlers
  const dependencies = {
    // Core dependencies
    bot,
    doc,
    sheetsQueue,
    userCache,
    registrationCache,
    vacationRequestsCache,
    navigationStack,
    HR_CHAT_ID,
    PAGE_SIZE: 5,
    
    // Helper functions (будуть передані як залежності)
    sendMessage,
    getUserInfo,
    getUserRole,
    getPMForUser,
    formatDate,
    logUserData,
    addBackButton,
    determineRoleByPositionAndDepartment,
    saveUserRole,
    processVacationRequest,
    processEmergencyVacationRequest,
    processRemoteRequest,
    processLateReport,
    processSickReport,
    getRemoteStatsForCurrentMonth,
    getLateStatsForCurrentMonth,
    getSickStatsForCurrentMonth,
    findVacationRowById,
    batchUpdateRows
  };
  
  // Ініціалізуємо services
  notificationService = new NotificationService(dependencies);
  vacationService = new VacationService(dependencies);
  
  // Ініціалізуємо handlers
  vacationHandler = new VacationHandler({
    ...dependencies,
    vacationService,
    notificationService
  });
  remoteHandler = new RemoteHandler({
    ...dependencies,
    notificationService
  });
  lateHandler = new LateHandler({
    ...dependencies,
    notificationService
  });
  sickHandler = new SickHandler({
    ...dependencies,
    notificationService
  });
  registrationHandler = new RegistrationHandler(dependencies);
  approvalHandler = new ApprovalHandler({
    ...dependencies,
    vacationService,
    notificationService
  });
  
  logger.info('All modules initialized successfully');
}

// 🔍 ІНДЕКС КОРИСТУВАЧІВ ДЛЯ ШВИДКОГО ПОШУКУ
/**
 * Індекс для швидкого пошуку користувачів за іменем
 * Використовується для inline query пошуку
 */
class UserIndex {
  constructor() {
    this.byTelegramId = new Map();
    this.byName = new Map();
    this.lastUpdate = null;
  }

  /**
   * Додає або оновлює користувача в індексі
   * @param {User} user - Об'єкт користувача
   */
  add(user) {
    if (!user || !user.telegramId || !user.fullName) return;
    
    this.byTelegramId.set(user.telegramId.toString(), user);
    
    // Індексуємо по імені (нижній регістр для пошуку)
    const nameKey = user.fullName.toLowerCase();
    if (!this.byName.has(nameKey)) {
      this.byName.set(nameKey, []);
    }
    const nameList = this.byName.get(nameKey);
    if (!nameList.find(u => u.telegramId === user.telegramId)) {
      nameList.push(user);
    }
    
    this.lastUpdate = Date.now();
  }

  /**
   * Видаляє користувача з індексу
   * @param {number|string} telegramId - Telegram ID
   */
  remove(telegramId) {
    const id = telegramId.toString();
    const user = this.byTelegramId.get(id);
    if (user) {
      this.byTelegramId.delete(id);
      const nameKey = user.fullName.toLowerCase();
      const nameList = this.byName.get(nameKey);
      if (nameList) {
        const index = nameList.findIndex(u => u.telegramId === user.telegramId);
        if (index !== -1) {
          nameList.splice(index, 1);
          if (nameList.length === 0) {
            this.byName.delete(nameKey);
          }
        }
      }
    }
  }

  /**
   * Шукає користувачів за терміном пошуку
   * @param {string} term - Термін пошуку
   * @returns {Array<User>} Масив користувачів, відсортований за релевантністю
   */
  search(term) {
    if (!term || term.length < 2) return [];
    
    const results = [];
    const lowerTerm = term.toLowerCase().trim();
    
    for (const user of this.byTelegramId.values()) {
      const score = this.calculateScore(user, lowerTerm);
      if (score > 0) {
        results.push({ ...user, score });
      }
    }
    
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Обчислює релевантність користувача для пошукового терміну
   * @param {User} user - Об'єкт користувача
   * @param {string} term - Термін пошуку (вже в нижньому регістрі)
   * @returns {number} Score релевантності (0 = не підходить)
   */
  calculateScore(user, term) {
    if (!user.fullName) return 0;
    
    let score = 0;
    const fullName = user.fullName.toLowerCase();
    
    // Точний збіг - найвищий score
    if (fullName === term) {
      score += 100;
    }
    
    // Початок імені
    if (fullName.startsWith(term)) {
      score += 50;
    }
    
    // Містить термін
    if (fullName.includes(term)) {
      score += 25;
    }
    
    // Fuzzy match (приблизний збіг по словах)
    const words = fullName.split(/\s+/);
    for (const word of words) {
      if (word.startsWith(term)) {
        score += 10;
      } else if (word.includes(term)) {
        score += 5;
      }
    }
    
    // Бонус за відділ/команду, якщо вони містять термін
    if (user.department && user.department.toLowerCase().includes(term)) {
      score += 3;
    }
    if (user.team && user.team.toLowerCase().includes(term)) {
      score += 3;
    }
    
    return score;
  }

  /**
   * Очищає індекс
   */
  clear() {
    this.byTelegramId.clear();
    this.byName.clear();
    this.lastUpdate = null;
  }

  /**
   * Отримує кількість користувачів в індексі
   * @returns {number}
   */
  size() {
    return this.byTelegramId.size;
  }

  /**
   * Отримує користувача за Telegram ID
   * @param {number|string} telegramId - Telegram ID
   * @returns {User|null}
   */
  get(telegramId) {
    return this.byTelegramId.get(telegramId.toString()) || null;
  }
}

// Створюємо глобальний індекс користувачів
const userIndex = new UserIndex();

// 🏗️ СТРУКТУРА КОМАНДИ
const DEPARTMENTS = {
  'Marketing': {
    'PPC': ['PPC', 'PM PPC'],
    'Target/Kris team': ['PM target', 'Target specialist', 'Team lead'],
    'Target/Lera team': ['PM target', 'Target specialist', 'Team lead']
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
    
    // Ініціалізуємо всі модулі після підключення Google Sheets
    try {
      if (typeof initializeModules === 'function') {
        initializeModules();
        console.log('✅ Модулі ініціалізовано');
      } else {
        console.warn('⚠️ initializeModules не знайдено, модулі не ініціалізовано');
      }
    } catch (moduleError) {
      console.error('❌ Помилка ініціалізації модулів:', moduleError);
      console.error('❌ Stack:', moduleError.stack);
      // Продовжуємо роботу без модулів (fallback на старі функції)
    }
    
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
    
    // Обробка inline query (асинхронно, неблокуюче)
    if (update.inline_query) {
      const inlineQuery = update.inline_query;
      console.log('🔍 Обробка inline query від:', inlineQuery.from?.id, 'запит:', inlineQuery.query?.substring(0, 50));
      
      // Обробляємо асинхронно, неблокуюче
      handleInlineQuery(inlineQuery).catch(error => {
        console.error('❌ Помилка обробки inline query:', error);
        console.error('❌ Stack:', error.stack);
      });
    } else if (update.message) {
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
  const chatId = message?.chat?.id;
  const telegramId = message?.from?.id;
  
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
    
    // Rate limiting
    if (!messageLimiter.canProceed(telegramId)) {
      logger.warn('Rate limit exceeded for message', { telegramId });
      await sendMessage(chatId, '⏳ Занадто багато запитів. Будь ласка, зачекайте трохи.');
      return;
    }
    
    // Обробка команди /start (до валідації, бо це системна команда)
    if (text === '/start' || text.startsWith('/start')) {
      logger.info('Processing /start command', { telegramId });
      try {
        // Очищаємо кеш для перезавантаження даних з Google Sheets
        if (userCache.has(telegramId)) {
          userCache.delete(telegramId);
          logger.debug('Cache cleared for user', { telegramId });
        }
        
        // Завантажуємо дані користувача з Google Sheets
        const user = await getUserInfo(telegramId);
        logger.info('User lookup result', { telegramId, found: !!user, hasName: !!user?.fullName });
        console.log(`🔍 /start: Перевірка користувача ${telegramId}, знайдено: ${!!user}`);
        
        if (!user) {
          logger.info('User not registered, showing welcome', { telegramId });
          console.log(`📝 Користувач ${telegramId} не знайдений, показуємо привітання з реєстрацією`);
          await showWelcomeMessage(chatId, telegramId, username, firstName, lastName);
        } else {
          console.log(`✅ Користувач ${telegramId} знайдений в системі, показуємо головне меню`);
          // Нормалізуємо дані користувача (підтримуємо обидва формати)
          const normalizedUser = {
            fullName: user.fullName || user.FullName || '',
            department: user.department || user.Department || '',
            team: user.team || user.Team || '',
            position: user.position || user.Position || '',
            birthDate: user.birthDate || user.BirthDate || '',
            firstWorkDay: user.firstWorkDay || user.FirstWorkDay || ''
          };
          
          logger.info('User registered, showing main menu', { telegramId, hasName: !!normalizedUser.fullName });
          
          // Перевіряємо, чи всі критичні дані на місці (ім'я, відділ, команда, посада)
          const hasAllCriticalData = normalizedUser.fullName && 
                                     normalizedUser.department && 
                                     normalizedUser.team && 
                                     normalizedUser.position;
          
          if (!hasAllCriticalData) {
            const missingFields = [];
            if (!normalizedUser.fullName) missingFields.push('ім\'я');
            if (!normalizedUser.department) missingFields.push('відділ');
            if (!normalizedUser.team) missingFields.push('команда');
            if (!normalizedUser.position) missingFields.push('посада');
            
            logger.warn('User missing some data', { telegramId, missingFields });
            console.log(`⚠️ Користувач ${telegramId} має неповні дані. Відсутні: ${missingFields.join(', ')}`);
            
            // Пропонуємо почати реєстрацію
            const keyboard = {
              inline_keyboard: [
                [
                  { text: '📝 Почати реєстрацію', callback_data: 'start_registration' }
                ]
              ]
            };
            
            await sendMessage(chatId, `⚠️ <b>Увага!</b> Деякі ваші дані відсутні в системі (${missingFields.join(', ')}). Будь ласка, пройдіть реєстрацію, натиснувши кнопку нижче:`, keyboard);
          } else {
            await showMainMenu(chatId, telegramId);
          }
        }
      } catch (error) {
        logger.error('Error processing /start', error, { telegramId });
        console.error('❌ Помилка обробки /start:', error);
        console.error('❌ Stack:', error.stack);
        try {
          await sendMessage(chatId, '❌ Помилка при обробці команди. Спробуйте ще раз.');
        } catch (sendError) {
          console.error('❌ Помилка відправки повідомлення про помилку:', sendError);
        }
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
    
    // Команда /myrole для перевірки поточної ролі
    if (text === '/myrole' || text === '/myrole@' + (process.env.BOT_USERNAME || '')) {
      const role = await getUserRole(telegramId);
      const user = await getUserInfo(telegramId);
      const roleNames = {
        'HR': 'HR',
        'CEO': 'CEO',
        'TL': 'Team Lead',
        'PM': 'Project Manager',
        'EMP': 'Працівник'
      };
      const roleName = roleNames[role] || role || 'не визначено';
      const msg = `🔍 <b>Ваша поточна роль:</b> ${roleName}\n\n` +
        `👤 Посада: ${user?.position || 'не вказано'}\n` +
        `🏢 Відділ: ${user?.department || 'не вказано'}\n\n` +
        `💡 <b>Якщо роль невірна:</b>\n` +
        `1. Перевірте, чи ваша посада або відділ містить "HR"\n` +
        `2. Якщо ви HR, але роль не визначена, зверніться до адміністратора`;
      await sendMessage(chatId, msg);
      return;
    }
    
    // Обробка Reply Keyboard кнопок
    if (await handleReplyKeyboard(chatId, telegramId, text)) {
      return;
    }
    
    // Перевіряємо, чи є активний процес в кеші (пріоритет над загальними командами)
    const regData = registrationCache.get(telegramId);
    logger.info('Processing message', { telegramId, text, hasRegData: !!regData, step: regData?.step, dataType: regData?.data?.type });
    console.log('🔍 processMessage: telegramId=', telegramId, 'text=', text, 'regData=', regData);
    
    // Обробка відпусток (пріоритет над реєстрацією)
    // Перевіряємо спочатку, чи це не процес відпустки
    if (regData && (regData.step?.startsWith('vacation_') || regData.step?.startsWith('emergency_vacation_'))) {
      logger.info('Vacation process detected in main cache', { telegramId, step: regData.step, dataType: regData.data?.type });
      console.log('✅ Виявлено процес відпустки в основному кеші:', regData.step);
      
      if (vacationHandler) {
        // Передаємо дані в handler, щоб він міг їх використати
        const handled = await vacationHandler.handleVacationProcess(chatId, telegramId, text);
        if (handled) {
          logger.info('Vacation process handled successfully', { telegramId, step: regData.step });
          console.log('✅ Процес відпустки успішно оброблено');
          return;
        } else {
          logger.warn('Vacation handler returned false', { telegramId, step: regData.step });
          console.log('⚠️ Handler повернув false для процесу відпустки');
        }
      }
    }
    
    // Спробуємо обробити через handler напряму (для сумісності, якщо дані в handler кеші)
    if (vacationHandler) {
      const handled = await vacationHandler.handleVacationProcess(chatId, telegramId, text);
      if (handled) {
        logger.info('Vacation process handled by handler directly', { telegramId });
        console.log('✅ Процес відпустки оброблено через handler');
        return;
      }
    }
    
    // Обробка спізнень
    if (regData && regData.step?.startsWith('late_')) {
      logger.debug('Late process detected', { telegramId, step: regData.step });
      if (lateHandler && await lateHandler.handleLateProcess(chatId, telegramId, text)) {
        logger.info('Late process handled', { telegramId });
        return;
      }
    } else if (lateHandler && await lateHandler.handleLateProcess(chatId, telegramId, text)) {
      logger.info('Late process handled by handler', { telegramId });
      return;
    }
    
    // Обробка Remote
    if (regData && regData.step?.startsWith('remote_')) {
      logger.debug('Remote process detected', { telegramId, step: regData.step });
      if (remoteHandler && await remoteHandler.handleRemoteProcess(chatId, telegramId, text)) {
        logger.info('Remote process handled', { telegramId });
        return;
      }
    } else if (remoteHandler && await remoteHandler.handleRemoteProcess(chatId, telegramId, text)) {
      logger.info('Remote process handled by handler', { telegramId });
      return;
    }
    
    // Обробка лікарняного
    if (regData && regData.step?.startsWith('sick_')) {
      logger.debug('Sick process detected', { telegramId, step: regData.step });
      if (sickHandler && await sickHandler.handleSickProcess(chatId, telegramId, text)) {
        logger.info('Sick process handled', { telegramId });
        return;
      }
    } else if (sickHandler && await sickHandler.handleSickProcess(chatId, telegramId, text)) {
      logger.info('Sick process handled by handler', { telegramId });
      return;
    }
    
    // Обробка реєстрації (тільки якщо це не інший процес)
    if (regData && (regData.step === 'department' || regData.step === 'team' || regData.step === 'position' || 
        regData.step === 'name' || regData.step === 'surname' || regData.step === 'birthdate' || 
        regData.step === 'firstworkday')) {
      logger.debug('Registration process detected', { telegramId, step: regData.step });
      const handled = await handleRegistrationStep(chatId, telegramId, text);
      if (handled) {
        logger.info('Registration step handled', { telegramId, step: regData.step });
        return; // Реєстрація оброблена, не показуємо загальне меню
      }
    }
    
    // Обробка розсилки HR
    if (await handleHRMailing(chatId, telegramId, text)) {
      return;
    }
    
    // AI помічник видалено
    
    // Якщо нічого не оброблено, показуємо загальне повідомлення
    logger.debug('No process matched, showing default message', { telegramId, text });
    await sendMessage(chatId, '❓ Оберіть дію з меню нижче.');
    
  } catch (error) {
    logger.error('Error in processMessage', error, { telegramId: message?.from?.id });
    console.error('❌ Помилка processMessage:', error);
    console.error('❌ Stack:', error.stack);
    
    // Спробуємо відправити повідомлення про помилку
    try {
      const chatId = message?.chat?.id;
      if (chatId) {
        await sendMessage(chatId, '❌ Виникла помилка при обробці повідомлення. Спробуйте ще раз або зверніться до HR.');
      }
    } catch (sendError) {
      console.error('❌ Помилка відправки повідомлення про помилку:', sendError);
    }
  }
}

// 🔘 ОБРОБКА CALLBACK QUERY
async function processCallback(callbackQuery) {
  const chatId = callbackQuery?.message?.chat?.id;
  const telegramId = callbackQuery?.from?.id;
  
  try {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    // Rate limiting для callback'ів
    if (!callbackLimiter.canProceed(telegramId)) {
      logger.warn('Rate limit exceeded for callback', { telegramId });
      await bot.answerCallbackQuery(callbackQuery.id, { text: '⏳ Занадто багато запитів. Зачекайте трохи.' });
      return;
    }
    
    // Валідація callback data
    if (!data || typeof data !== 'string' || data.length > 64) {
      logger.warn('Invalid callback data', { telegramId, dataLength: data?.length });
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Невірні дані.' });
      return;
    }
    
    logger.info('Callback received', { telegramId, callbackData: data.substring(0, 30) });
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
    // Маршрутизація callback'ів
    const routes = {
      'vacation_apply': () => vacationHandler ? vacationHandler.showVacationForm(chatId, telegramId) : showVacationForm(chatId, telegramId),
      'vacation_balance': () => vacationHandler ? vacationHandler.showVacationBalance(chatId, telegramId) : showVacationBalance(chatId, telegramId),
      'vacation_requests': () => vacationHandler ? vacationHandler.showMyVacationRequests(chatId, telegramId) : showMyVacationRequests(chatId, telegramId),
      'vacation_emergency': () => vacationHandler ? vacationHandler.showEmergencyVacationForm(chatId, telegramId) : showEmergencyVacationForm(chatId, telegramId),
      'remote_today': () => remoteHandler ? remoteHandler.setRemoteToday(chatId, telegramId) : setRemoteToday(chatId, telegramId),
      'quick_remote_today': () => remoteHandler ? remoteHandler.setRemoteToday(chatId, telegramId) : setRemoteToday(chatId, telegramId),
      'remote_calendar': () => remoteHandler ? remoteHandler.showRemoteCalendar(chatId, telegramId) : showRemoteCalendar(chatId, telegramId),
      'remote_stats': () => remoteHandler ? remoteHandler.showRemoteStats(chatId, telegramId) : showRemoteStats(chatId, telegramId),
      'late_report': () => lateHandler ? lateHandler.reportLate(chatId, telegramId) : reportLate(chatId, telegramId),
      'quick_late_today': () => lateHandler ? lateHandler.handleLateToday(chatId, telegramId) : handleLateToday(chatId, telegramId),
      'late_stats': () => lateHandler ? lateHandler.showLateStats(chatId, telegramId) : showLateStats(chatId, telegramId),
      'late_today': () => lateHandler ? lateHandler.handleLateToday(chatId, telegramId) : handleLateToday(chatId, telegramId),
      'late_other_date': () => lateHandler ? lateHandler.handleLateOtherDate(chatId, telegramId) : handleLateOtherDate(chatId, telegramId),
      'late_add_reason': () => lateHandler ? lateHandler.handleLateAddReason(chatId, telegramId) : handleLateAddReason(chatId, telegramId),
      'late_skip_reason': () => lateHandler ? lateHandler.handleLateSkipReason(chatId, telegramId) : handleLateSkipReason(chatId, telegramId),
      'sick_report': () => sickHandler ? sickHandler.reportSick(chatId, telegramId) : reportSick(chatId, telegramId),
      'sick_stats': () => sickHandler ? sickHandler.showSickStats(chatId, telegramId) : showSickStats(chatId, telegramId),
      'stats_monthly': () => showMonthlyStats(chatId, telegramId),
      'stats_export': () => exportMyData(chatId, telegramId),
      'quick_review_requests': () => showApprovalsMenu(chatId, telegramId),
      'quick_approve_requests': () => showApprovalsMenu(chatId, telegramId),
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
      'approvals_vacations': () => approvalHandler ? approvalHandler.showApprovalVacations(chatId, telegramId) : showApprovalVacations(chatId, telegramId),
      'approval_vacations': () => approvalHandler ? approvalHandler.showApprovalVacations(chatId, telegramId) : showApprovalVacations(chatId, telegramId), // Альтернативний callback
      'approvals_remote': () => approvalHandler ? approvalHandler.showApprovalRemote(chatId, telegramId) : showApprovalRemote(chatId, telegramId),
      'analytics_hr': () => showAnalyticsMenu(chatId, telegramId),
      'analytics_ceo': () => showCEOAnalytics(chatId, telegramId),
      'hr_panel': () => showHRPanel(chatId, telegramId),
      'hr_users': () => showHRUsersMenu(chatId, telegramId),
      'hr_reports': () => showHRReportsMenu(chatId, telegramId),
      'hr_settings': () => showHRSettingsMenu(chatId, telegramId),
      'hr_dashboard': () => showHRDashboardStats(chatId, telegramId),
      'hr_reports_vacations': async () => {
        logger.info('HR reports vacations callback', { telegramId, chatId });
        console.log('📊 HR reports vacations callback:', { telegramId, chatId });
        console.log('📊 approvalHandler доступний:', !!approvalHandler);
        console.log('📊 showApprovalVacations доступна:', typeof showApprovalVacations === 'function');
        try {
          if (approvalHandler && typeof approvalHandler.showApprovalVacations === 'function') {
            console.log('✅ Використовуємо approvalHandler.showApprovalVacations');
            await approvalHandler.showApprovalVacations(chatId, telegramId);
            console.log('✅ approvalHandler.showApprovalVacations виконано');
          } else {
            console.log('✅ Використовуємо showApprovalVacations напряму');
            await showApprovalVacations(chatId, telegramId);
            console.log('✅ showApprovalVacations виконано');
          }
        } catch (error) {
          logger.error('Error in hr_reports_vacations', error, { telegramId });
          console.error('❌ Помилка в hr_reports_vacations:', error);
          console.error('❌ Stack:', error.stack);
          try {
            await sendMessage(chatId, `❌ Помилка завантаження звіту по відпустках: ${error.message || 'невідома помилка'}. Спробуйте пізніше.`);
          } catch (sendError) {
            console.error('❌ Не вдалося відправити повідомлення про помилку:', sendError);
          }
        }
      },
      'hr_reports_remote': async () => {
        logger.info('HR reports remote callback', { telegramId, chatId });
        console.log('📊 HR reports remote callback:', { telegramId, chatId });
        console.log('📊 approvalHandler доступний:', !!approvalHandler);
        console.log('📊 showApprovalRemote доступна:', typeof showApprovalRemote === 'function');
        try {
          if (approvalHandler && typeof approvalHandler.showApprovalRemote === 'function') {
            console.log('✅ Використовуємо approvalHandler.showApprovalRemote');
            await approvalHandler.showApprovalRemote(chatId, telegramId);
            console.log('✅ approvalHandler.showApprovalRemote виконано');
          } else {
            console.log('✅ Використовуємо showApprovalRemote напряму');
            await showApprovalRemote(chatId, telegramId);
            console.log('✅ showApprovalRemote виконано');
          }
        } catch (error) {
          logger.error('Error in hr_reports_remote', error, { telegramId });
          console.error('❌ Помилка в hr_reports_remote:', error);
          console.error('❌ Stack:', error.stack);
          try {
            await sendMessage(chatId, `❌ Помилка завантаження звіту по Remote: ${error.message || 'невідома помилка'}. Спробуйте пізніше.`);
          } catch (sendError) {
            console.error('❌ Не вдалося відправити повідомлення про помилку:', sendError);
          }
        }
      },
      'hr_reports_lates': async () => {
        logger.info('HR reports lates callback', { telegramId, chatId });
        console.log('📊 HR reports lates callback:', { telegramId, chatId });
        try {
          await showHRDashboardStats(chatId, telegramId);
        } catch (error) {
          logger.error('Error in hr_reports_lates', error, { telegramId });
          console.error('❌ Помилка в hr_reports_lates:', error);
          await sendMessage(chatId, `❌ Помилка завантаження звіту по спізненнях. Спробуйте пізніше.`);
        }
      },
      'hr_reports_sick': async () => {
        logger.info('HR reports sick callback', { telegramId, chatId });
        console.log('📊 HR reports sick callback:', { telegramId, chatId });
        try {
          await showHRDashboardStats(chatId, telegramId);
        } catch (error) {
          logger.error('Error in hr_reports_sick', error, { telegramId });
          console.error('❌ Помилка в hr_reports_sick:', error);
          await sendMessage(chatId, `❌ Помилка завантаження звіту по лікарняних. Спробуйте пізніше.`);
        }
      },
      'hr_users_list': () => showHRExportEmployeeList(chatId, telegramId),
      'hr_users_search': () => showHRExportEmployee(chatId, telegramId),
      'hr_users_add': () => sendMessage(chatId, '📝 Функція додавання працівника в розробці. Використовуйте реєстрацію через /start'),
      'hr_users_edit': () => sendMessage(chatId, '✏️ Функція редагування даних в розробці. Зверніться до адміністратора для змін.'),
      'hr_users_roles': () => sendMessage(chatId, '👑 Функція управління ролями в розробці. Ролі визначаються автоматично на основі посади та відділу.'),
      'hr_settings_notifications': () => sendMessage(chatId, '🔔 Налаштування сповіщень в розробці.'),
      'hr_settings_holidays': () => sendMessage(chatId, '📅 Календар свят в розробці.'),
      'hr_settings_rules': () => sendMessage(chatId, '📋 Бізнес-правила в розробці.'),
      'hr_settings_integrations': () => sendMessage(chatId, '🔗 Інтеграції в розробці.'),
      'hr_settings_security': () => sendMessage(chatId, '🔐 Налаштування безпеки в розробці.'),
      'hr_mailings': () => showMailingsMenu(chatId, telegramId),
      'hr_export': () => showHRExportMenu(chatId, telegramId),
      'hr_export_employee': () => showHRExportEmployee(chatId, telegramId),
      'hr_export_employee_list': () => showHRExportEmployeeList(chatId, telegramId),
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
            'showVacationMenu': () => vacationHandler ? vacationHandler.showVacationMenu(chatId, telegramId) : showVacationMenu(chatId, telegramId),
            'showRemoteMenu': () => remoteHandler ? remoteHandler.showRemoteMenu(chatId, telegramId) : showRemoteMenu(chatId, telegramId),
            'showLateMenu': () => lateHandler ? lateHandler.showLateMenu(chatId, telegramId) : showLateMenu(chatId, telegramId),
            'showSickMenu': () => sickHandler ? sickHandler.showSickMenu(chatId, telegramId) : showSickMenu(chatId, telegramId),
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
            'showHRUsersMenu': () => showHRUsersMenu(chatId, telegramId),
            'showHRReportsMenu': () => showHRReportsMenu(chatId, telegramId),
            'showHRSettingsMenu': () => showHRSettingsMenu(chatId, telegramId),
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
    
    // Обробка callback'ів
    logger.info('Processing callback', { telegramId, callbackData: data, hasRoute: !!routes[data] });
    console.log('🔍 processCallback: data=', data, 'telegramId=', telegramId, 'chatId=', chatId);
    console.log('🔍 Available routes:', Object.keys(routes).filter(k => k.includes('hr_reports')));
    
    if (routes[data]) {
      try {
        logger.info('Executing callback route', { telegramId, callbackData: data });
        console.log('✅ Виконуємо callback route:', data);
        const routeFunction = routes[data];
        if (typeof routeFunction === 'function') {
          await routeFunction();
          logger.info('Callback route executed successfully', { telegramId, callbackData: data });
          console.log('✅ Callback route виконано успішно');
        } else {
          logger.error('Route is not a function', { telegramId, callbackData: data, routeType: typeof routeFunction });
          console.error('❌ Route не є функцією:', typeof routeFunction);
          await sendMessage(chatId, '❌ Помилка: маршрут не знайдено.');
        }
      } catch (routeError) {
        logger.error('Error in callback route', routeError, { telegramId, callbackData: data });
        console.error('❌ Помилка обробки callback:', routeError);
        console.error('❌ Stack:', routeError.stack);
        try {
          await sendMessage(chatId, `❌ Помилка при обробці запиту: ${routeError.message || 'невідома помилка'}. Спробуйте ще раз.`);
        } catch (sendError) {
          logger.error('Failed to send error message', sendError, { telegramId });
        }
      }
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
    } else if (data.startsWith('approve_vacation_')) {
      const requestId = data.replace('approve_vacation_', '');
      await handleHRVacationApproval(chatId, telegramId, requestId, true);
    } else if (data.startsWith('reject_vacation_')) {
      const requestId = data.replace('reject_vacation_', '');
      await handleHRVacationApproval(chatId, telegramId, requestId, false);
    } else if (data.startsWith('view_vacation_')) {
      const requestId = data.replace('view_vacation_', '');
      if (approvalHandler) {
        await approvalHandler.showVacationRequestDetails(chatId, telegramId, requestId);
      } else {
        await showVacationRequestDetails(chatId, telegramId, requestId);
      }
    } else if (data.startsWith('stats_lates_month_')) {
      // Обробка вибору місяця для звіту по спізненнях
      const parts = data.replace('stats_lates_month_', '').split('_');
      if (parts.length === 2) {
        const month = parseInt(parts[0]);
        const year = parseInt(parts[1]);
        await showLatesStatsReport(chatId, telegramId, null, month, year);
      }
    } else if (data.startsWith('vacation_requests_page_')) {
      // Обробка пагінації для списку заявок на відпустку
      const page = parseInt(data.replace('vacation_requests_page_', ''));
      if (!isNaN(page) && page >= 0) {
        if (vacationHandler) {
          await vacationHandler.showMyVacationRequests(chatId, telegramId, page);
        } else {
          await showMyVacationRequests(chatId, telegramId, page);
        }
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
    await handleError(error, chatId, telegramId, sendMessage);
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
    // Очищаємо текст від потенційно небезпечних HTML символів
    // Але зберігаємо валідні HTML теги
    if (text && typeof text === 'string') {
      // Перевіряємо, чи текст містить валідні HTML теги
      // Якщо є проблеми з HTML, спробуємо відправити без parse_mode
      const hasInvalidHtml = /<[^>]*>/g.test(text) && !/<\/?[bisu]>/gi.test(text.replace(/<\/?[bisu]>/gi, ''));
      
      const options = {};
      
      // Використовуємо HTML parse_mode тільки якщо текст містить валідні HTML теги
      if (text.includes('<b>') || text.includes('<i>') || text.includes('<u>') || text.includes('<s>') || text.includes('<code>') || text.includes('<pre>')) {
        options.parse_mode = 'HTML';
      }
      
      if (keyboard) {
        if (keyboard.inline_keyboard) {
          options.reply_markup = keyboard;
        } else {
          options.reply_markup = { keyboard: keyboard, resize_keyboard: true };
        }
      }
      
      try {
        await bot.sendMessage(chatId, text, options);
        logger.info('Message sent successfully', { chatId, textLength: text.length });
      } catch (htmlError) {
        // Якщо помилка з HTML, спробуємо без parse_mode
        if (htmlError.response?.statusCode === 400 && options.parse_mode === 'HTML') {
          logger.warn('HTML parse error, retrying without parse_mode', { chatId });
          delete options.parse_mode;
          try {
            await bot.sendMessage(chatId, text.replace(/<[^>]*>/g, ''), options);
            logger.info('Message sent without HTML', { chatId });
          } catch (retryError) {
            // Якщо і це не спрацювало, спробуємо з екрануванням HTML
            const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            await bot.sendMessage(chatId, escapedText, { ...options, parse_mode: 'HTML' });
            logger.info('Message sent with escaped HTML', { chatId });
          }
        } else {
          throw htmlError;
        }
      }
    } else {
      // Якщо текст не рядок, конвертуємо в рядок
      const textStr = String(text || '');
      const options = keyboard ? { reply_markup: keyboard.inline_keyboard ? keyboard : { keyboard: keyboard, resize_keyboard: true } } : {};
      await bot.sendMessage(chatId, textStr, options);
      logger.info('Message sent successfully', { chatId, textLength: textStr.length });
    }
    
  } catch (error) {
    if (error.response?.statusCode === 403) {
      logger.warn('Bot blocked by user', { chatId });
      // Не кидаємо помилку, щоб не ламати весь процес
      return;
    } else if (error.response?.statusCode === 400) {
      logger.warn('Invalid message format', { chatId, error: error.response.body });
      // Спробуємо відправити без HTML
      try {
        const plainText = typeof text === 'string' ? text.replace(/<[^>]*>/g, '') : String(text || '');
        const retryOptions = keyboard ? { reply_markup: keyboard.inline_keyboard ? keyboard : { keyboard: keyboard, resize_keyboard: true } } : {};
        await bot.sendMessage(chatId, plainText || 'Повідомлення', retryOptions);
        logger.info('Message sent as plain text after HTML error', { chatId });
      } catch (retryError) {
        logger.error('Failed to send message even as plain text', retryError, { chatId });
        // Не показуємо помилку користувачу, щоб не блокувати роботу
        // Просто логуємо помилку та продовжуємо
      }
    } else {
      logger.error('Failed to send message', error, { chatId });
      // Не кидаємо помилку, щоб не ламати весь процес
    }
  }
}

function mapRowToUserData(row, sheetTitle) {
  if (!row) return null;
  
  const telegramId = getTelegramId(row);
  if (!telegramId) return null;

  return {
    telegramId: telegramId,
    fullName: getSheetValueByLanguage(row, sheetTitle, 'Ім\'я та прізвище', 'FullName'),
    department: getSheetValueByLanguage(row, sheetTitle, 'Відділ', 'Department'),
    team: getSheetValueByLanguage(row, sheetTitle, 'Команда', 'Team'),
    position: getSheetValueByLanguage(row, sheetTitle, 'Посада', 'Position'),
    birthDate: getSheetValueByLanguage(row, sheetTitle, 'Дата народження', 'BirthDate'),
    firstWorkDay: getSheetValueByLanguage(row, sheetTitle, 'Перший робочий день', 'FirstWorkDay'),
    workMode: getSheetValueByLanguage(row, sheetTitle, 'Режим роботи', 'WorkMode', 'Hybrid'),
    pm: getSheetValue(row, 'PM', 'PM') || null
  };
}

// 👤 ОТРИМАННЯ КОРИСТУВАЧА
/**
 * Отримує інформацію про користувача з бази даних або кешу
 * @param {number} telegramId - Telegram ID користувача
 * @returns {Promise<User|null>} Інформація про користувача або null
 */
async function getUserInfo(telegramId) {
  try {
    logger.debug('getUserInfo called', { telegramId });
    
    // Перевіряємо кеш (CacheWithTTL сам перевіряє TTL)
    if (userCache.has(telegramId)) {
      const cached = userCache.get(telegramId);
      logger.info('User found in cache', { telegramId, fullName: cached?.fullName });
      console.log(`✅ Користувач ${telegramId} знайдено в кеші: ${cached?.fullName || 'без імені'}`);
      return cached;
      }
    
    if (!doc) {
      console.warn(`⚠️ Google Sheets не підключено для користувача ${telegramId}`);
      return null;
    }
    
    // Обгортаємо операції з Google Sheets в чергу для запобігання rate limit
    const result = await sheetsQueue.add(async () => {
    await doc.loadInfo();
      // Спробуємо спочатку українську назву, потім англійську для сумісності
      const sheet = doc.sheetsByTitle['Працівники'] || doc.sheetsByTitle['Employees'];
      if (!sheet) {
        console.warn(`⚠️ Лист Працівники/Employees не знайдено для користувача ${telegramId}`);
        return null;
      }
      
      const PAGE_SIZE = 500;
      let offset = 0;
      let batchIndex = 0;
      
      while (true) {
        const rows = await sheet.getRows({
          offset,
          limit: PAGE_SIZE
        });
        
        if (rows.length === 0) break;
        console.log(`🔍 Пошук користувача ${telegramId}: партія ${batchIndex + 1}, рядків=${rows.length}`);
        
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
          const userData = mapRowToUserData(user, sheet.title);
          if (userData) {
            // Зберігаємо дані в кеш (HybridCache сам додає timestamp)
            userCache.set(telegramId, userData);
            // Додаємо в індекс для швидкого пошуку
            userIndex.add(userData);
            logger.info('User loaded from Google Sheets and cached', { telegramId, fullName: userData.fullName });
            console.log(`✅ Користувач ${telegramId} (${userData.fullName}) завантажено з Google Sheets та додано в кеш`);
            return userData;
          }
        }
        
        offset += rows.length;
        batchIndex++;
        
        if (rows.length < PAGE_SIZE) {
          break;
        }
      }
      
      return null;
    });
    
    if (result) {
      return result;
    }
    
    console.warn(`⚠️ Користувач ${telegramId} не знайдено в Google Sheets`);
    return null;
  } catch (error) {
    console.error(`❌ Помилка getUserInfo для користувача ${telegramId}:`, error);
    console.error('❌ Stack:', error.stack);
    return null;
  }
}

/**
 * Отримує інформацію про декількох користувачів однією операцією
 * @param {Array<number|string>} telegramIds - Список Telegram ID
 * @returns {Promise<Record<string, User>>}
 */
async function getUsersInfoBatch(telegramIds = []) {
  try {
    if (!Array.isArray(telegramIds) || telegramIds.length === 0) {
      return {};
    }

    const normalizedIds = Array.from(new Set(
      telegramIds
        .filter(id => id !== undefined && id !== null && id !== '')
        .map(id => id.toString())
    ));

    if (normalizedIds.length === 0) {
      return {};
    }

    const result = {};
    const missingIds = [];

    for (const id of normalizedIds) {
      const cachedUser = await userCache.getAsync(id);
      if (cachedUser) {
        result[id] = cachedUser;
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length === 0) {
      return result;
    }

    if (!doc) {
      console.warn('⚠️ Google Sheets не підключено для getUsersInfoBatch');
      return result;
    }

    // Обгортаємо операції з Google Sheets в чергу для запобігання rate limit
    await sheetsQueue.add(async () => {
      await doc.loadInfo();
      const sheet = doc.sheetsByTitle['Працівники'] || doc.sheetsByTitle['Employees'];
      if (!sheet) {
        console.warn('⚠️ Таблиця Працівники/Employees не знайдена для batch-завантаження');
        return;
      }

      const PAGE_SIZE = 500;
      const missingSet = new Set(missingIds);
      let offset = 0;

      while (missingSet.size > 0) {
        const rows = await sheet.getRows({
          offset,
          limit: PAGE_SIZE
        });

        if (rows.length === 0) break;

        for (const row of rows) {
          if (missingSet.size === 0) break;

          const rowTelegramId = row.get('TelegramID');
          if (!rowTelegramId) continue;

          const normalizedRowId = rowTelegramId.toString();
          if (!missingSet.has(normalizedRowId)) continue;

          const userData = mapRowToUserData(row, sheet.title);
          if (userData) {
            result[normalizedRowId] = userData;
            userCache.set(normalizedRowId, userData);
            // Додаємо в індекс для швидкого пошуку
            userIndex.add(userData);
          }

          missingSet.delete(normalizedRowId);
        }

        offset += rows.length;
        if (rows.length < PAGE_SIZE) break;
      }

      if (missingSet.size > 0) {
        console.warn(`⚠️ Не вдалося знайти ${missingSet.size} користувачів у batch-запиті`);
      }
    });

    return result;
  } catch (error) {
    console.error('❌ Помилка getUsersInfoBatch:', error);
    return {};
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
      // Якщо Google Sheets не підключено, спробуємо визначити роль за посадою та відділом з кешу
      const user = userCache.get(telegramId);
      if (user) {
        return determineRoleByPositionAndDepartment(user.position, user.department);
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
    
    // Якщо ролі немає в таблиці, спробуємо визначити за посадою та відділом
    const user = await getUserInfo(telegramId);
    if (user) {
      const determinedRole = determineRoleByPositionAndDepartment(user.position, user.department);
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
  
  // HR - розширена перевірка
  if (posLower.includes('hr') || 
      posLower.includes('human resources') ||
      posLower.includes('hr manager') ||
      posLower.includes('hr specialist') ||
      posLower.includes('hr coordinator') ||
      posLower.includes('кадр') ||
      posLower.includes('персонал')) {
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

// 🔍 ВИЗНАЧЕННЯ РОЛІ ЗА ПОСАДОЮ ТА ВІДДІЛОМ
function determineRoleByPositionAndDepartment(position, department) {
  if (!position && !department) return 'EMP';
  
  const posLower = (position || '').toLowerCase();
  const deptLower = (department || '').toLowerCase();
  
  // CEO
  if (posLower.includes('ceo') || posLower.includes('founder') || posLower.includes('засновник')) {
    return 'CEO';
  }
  
  // HR - перевірка посади та відділу
  const isHRByPosition = posLower.includes('hr') || 
      posLower.includes('human resources') ||
      posLower.includes('hr manager') ||
      posLower.includes('hr specialist') ||
      posLower.includes('hr coordinator') ||
      posLower.includes('кадр') ||
      posLower.includes('персонал');
  
  const isHRByDepartment = deptLower.includes('hr') || 
      deptLower.includes('human resources') ||
      deptLower === 'hr';
  
  if (isHRByPosition || isHRByDepartment) {
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

// 📊 ДОПОМІЖНІ ФУНКЦІЇ ДЛЯ БЕЙДЖІВ МЕНЮ
/**
 * Отримує кількість термінових заявок для HR
 */
async function getUrgentRequestsCount() {
  try {
    if (!doc) return 0;
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
    if (!sheet) return 0;
    
    const rows = await sheet.getRows();
    const pendingCount = rows.filter(row => {
      const status = row.get('Status') || row.get('Статус');
      return status === 'pending_hr' || status === 'pending_pm';
    }).length;
    
    return pendingCount;
  } catch (error) {
    console.error('❌ Помилка getUrgentRequestsCount:', error);
    return 0;
  }
}

/**
 * Отримує кількість критичних алертів для CEO
 */
async function getCriticalAlertsCount() {
  try {
    if (!doc) return 0;
    
    await doc.loadInfo();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Критичні спізнення (>7 за місяць)
    const latesSheet = doc.sheetsByTitle['Спізнення'] || doc.sheetsByTitle['Lates'];
    if (!latesSheet) return 0;
    
    const latesRows = await latesSheet.getRows();
    const monthLates = latesRows.filter(row => {
      const dateStr = row.get('Date') || row.get('Дата');
      if (!dateStr) return false;
      const date = new Date(dateStr);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    
    // Групуємо по користувачах
    const userLatesCount = new Map();
    monthLates.forEach(row => {
      const userId = row.get('TelegramID');
      userLatesCount.set(userId, (userLatesCount.get(userId) || 0) + 1);
    });
    
    // Рахуємо користувачів з >7 спізнень
    let criticalCount = 0;
    userLatesCount.forEach(count => {
      if (count > 7) criticalCount++;
    });
    
    return criticalCount;
  } catch (error) {
    console.error('❌ Помилка getCriticalAlertsCount:', error);
    return 0;
  }
}

/**
 * Отримує кількість заявок на затвердження для PM
 */
async function getPendingApprovalsCount(telegramId) {
  try {
    if (!doc) return 0;
    
    const user = await getUserInfo(telegramId);
    if (!user || !user.team) return 0;
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
    if (!sheet) return 0;
    
    const rows = await sheet.getRows();
    const pendingCount = rows.filter(row => {
      const status = row.get('Status') || row.get('Статус');
      const rowTeam = row.get('Team') || row.get('Команда');
      return status === 'pending_pm' && rowTeam === user.team;
    }).length;
    
    return pendingCount;
  } catch (error) {
    console.error('❌ Помилка getPendingApprovalsCount:', error);
    return 0;
  }
}

/**
 * Перевіряє, чи користувач вже відмітив remote сьогодні
 */
async function checkRemoteToday(telegramId) {
  try {
    if (!doc) return false;
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Remotes'];
    if (!sheet) return false;
    
    const rows = await sheet.getRows();
    const todayStr = new Date().toISOString().split('T')[0];
    
    return rows.some(row => {
      const rowTelegramId = row.get('TelegramID');
      const rowDate = row.get('Date');
      if (!rowTelegramId || !rowDate) return false;
      const normalizedDate = new Date(rowDate).toISOString().split('T')[0];
      return rowTelegramId == telegramId && normalizedDate === todayStr;
    });
  } catch (error) {
    console.error('❌ Помилка checkRemoteToday:', error);
    return false;
  }
}

/**
 * Перевіряє, чи користувач вже повідомив про спізнення сьогодні
 */
async function checkLateToday(telegramId) {
  try {
    if (!doc) return false;
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Спізнення'] || doc.sheetsByTitle['Lates'];
    if (!sheet) return false;
    
    const rows = await sheet.getRows();
    const todayStr = new Date().toISOString().split('T')[0];
    
    return rows.some(row => {
      const rowTelegramId = row.get('TelegramID');
      const rowDate = row.get('Date') || row.get('Дата');
      if (!rowTelegramId || !rowDate) return false;
      const normalizedDate = new Date(rowDate).toISOString().split('T')[0];
      return rowTelegramId == telegramId && normalizedDate === todayStr;
    });
  } catch (error) {
    console.error('❌ Помилка checkLateToday:', error);
    return false;
  }
}

/**
 * Отримує останню активність користувача (плейсхолдер, для майбутніх сценаріїв)
 */
async function getRecentActivity(telegramId) {
  try {
    // TODO: Реалізувати детальний аналіз активності (з логів/таблиць)
    return {
      lastAction: null,
      lastActionDate: null
    };
  } catch (error) {
    console.error('❌ Помилка getRecentActivity:', error);
    return {
      lastAction: null,
      lastActionDate: null
    };
  }
}

/**
 * Показує контекстні швидкі дії (inline кнопки)
 */
async function showContextualQuickActions(chatId, telegramId) {
  try {
    const [role, user, recentActivity] = await Promise.all([
      getUserRole(telegramId),
      getUserInfo(telegramId),
      getRecentActivity(telegramId)
    ]);
    
    if (!user) return;
    
    const quickActions = [];
    const today = new Date();
    
    // Якщо сьогодні понеділок і ще не повідомив про remote
    if (today.getDay() === 1) {
      const remoteToday = await checkRemoteToday(telegramId);
      if (!remoteToday) {
        quickActions.push({
          text: '⚡ Remote сьогодні',
          callback_data: 'quick_remote_today',
          priority: 10
        });
      }
    }
    
    // Якщо пізно прийшов (після 10:21) і ще не повідомив про спізнення
    const currentHour = today.getHours();
    const currentMinute = today.getMinutes();
    if (currentHour > 10 || (currentHour === 10 && currentMinute > 21)) {
      const lateToday = await checkLateToday(telegramId);
      if (!lateToday) {
        quickActions.push({
          text: '⚡ Спізнення сьогодні',
          callback_data: 'quick_late_today',
          priority: 15
        });
      }
    }
    
    // Для HR: якщо є незатверджені заявки
    if (role === 'HR') {
      const pendingCount = await getUrgentRequestsCount();
      if (pendingCount > 0) {
        quickActions.push({
          text: `⚡ Переглянути ${pendingCount} заявок`,
          callback_data: 'quick_review_requests',
          priority: 20
        });
      }
    }
    
    // Для PM/TL: якщо є заявки на затвердження
    if (role === 'PM' || role === 'TL') {
      const myApprovals = await getPendingApprovalsCount(telegramId);
      if (myApprovals > 0) {
        quickActions.push({
          text: `⚡ Затвердити ${myApprovals} заявок`,
          callback_data: 'quick_approve_requests',
          priority: 20
        });
      }
    }
    
    if (quickActions.length === 0) return;
    
    // Сортуємо за пріоритетом та показуємо максимум 3 дії
    quickActions.sort((a, b) => b.priority - a.priority);
    
    const keyboard = {
      inline_keyboard: quickActions.slice(0, 3).map(action => [{
        text: action.text,
        callback_data: action.callback_data
      }])
    };
    
    await sendMessage(chatId, '⚡ <b>Швидкі дії:</b>', keyboard);
  } catch (error) {
    console.error('❌ Помилка showContextualQuickActions:', error);
  }
}

// 🏠 ГОЛОВНЕ МЕНЮ З ДИНАМІЧНИМИ ПРІОРИТЕТАМИ
async function showMainMenu(chatId, telegramId) {
  try {
    // Очищаємо історію навігації при поверненні до головного меню
    navigationStack.clearHistory(telegramId);
    
    // Паралельне завантаження даних для швидкості
    const [role, user] = await Promise.all([
      getUserRole(telegramId),
      getUserInfo(telegramId)
    ]);
    
    // Отримуємо ім'я користувача для персоналізованого привітання
    let userName = user?.fullName;
    
    // Якщо ім'я не знайдено в базі, спробуємо отримати з Telegram
    if (!userName || userName.trim() === '') {
      try {
        const chatMember = await bot.getChatMember(chatId, telegramId);
        if (chatMember && chatMember.user) {
          const firstName = chatMember.user.first_name || '';
          const lastName = chatMember.user.last_name || '';
          userName = firstName && lastName 
            ? `${firstName} ${lastName}` 
            : firstName || lastName || 'колега';
        } else {
          userName = 'колега';
        }
      } catch (error) {
        console.warn(`⚠️ Не вдалося отримати ім'я з Telegram для ${telegramId}:`, error);
        userName = 'колега';
      }
    }
    
    // Якщо все ще немає імені, використовуємо за замовчуванням
    if (!userName || userName.trim() === '') {
      userName = 'колега';
    }
    
    // Базові пункти меню для всіх (з пріоритетами)
    const baseMenuItems = [
      { text: '🏖️ Відпустки', priority: 10 },
      { text: '🏠 Remote', priority: 9 },
      { text: '⏰ Спізнення', priority: 8 },
      { text: '🏥 Лікарняний', priority: 7 },
      { text: '📊 Статистика', priority: 6 },
      { text: '🎯 Онбординг', priority: 5 },
      { text: '📋 Тет', priority: 4 },
      { text: '❓ FAQ', priority: 3 },
      { text: '💬 Пропозиції', priority: 2 },
      { text: '🚨 ASAP запит', priority: 1 }
    ];
    
    // Пункти меню залежно від ролі (з бейджами)
    let roleMenuItems = [];
    let urgentCount = 0;
    let criticalCount = 0;
    let pendingCount = 0;
    
    // Паралельно завантажуємо бейджі для ролей (тільки потрібні)
    const badgePromises = [];
    if (role === 'HR') {
      badgePromises.push(getUrgentRequestsCount().then(count => { urgentCount = count; }));
    } else if (role === 'CEO') {
      badgePromises.push(getCriticalAlertsCount().then(count => { criticalCount = count; }));
    } else if (role === 'PM' || role === 'TL') {
      badgePromises.push(getPendingApprovalsCount(telegramId).then(count => { pendingCount = count; }));
    }
    
    // Чекаємо на завантаження бейджів
    if (badgePromises.length > 0) {
      await Promise.all(badgePromises);
    }
    
    // Формуємо пункти меню залежно від ролі
    if (role === 'HR') {
      roleMenuItems = [
        { text: '👥 HR Панель', priority: 16 },
        { text: '📊 HR Дашборд', priority: 15 },
        { text: '📋 Затвердження', priority: 14, badge: urgentCount },
        { text: '📤 Масовий експорт', priority: 13 },
        { text: '📈 Аналітика', priority: 12 },
        { text: '📢 Розсилки', priority: 11 }
      ];
    } else if (role === 'CEO') {
      roleMenuItems = [
        { text: '🏢 CEO Панель', priority: 16 },
        { text: '📈 Аналітика компанії', priority: 15 },
        { text: '💼 Фінанси HR', priority: 14 },
        { text: '⚡ Критичні алерти', priority: 13, badge: criticalCount },
        { text: '📋 Затвердження', priority: 12 }
      ];
    } else if (role === 'PM' || role === 'TL') {
      roleMenuItems = [
        { text: '📋 На затвердження', priority: 12, badge: pendingCount },
        { text: '📈 Аналітика', priority: 11 }
      ];
    }
    
    // Об'єднуємо меню
    let menuItems = [...roleMenuItems, ...baseMenuItems];
    
    // Сортуємо за пріоритетом (вищі пріоритети спочатку)
    menuItems.sort((a, b) => b.priority - a.priority);
    
    // Формуємо клавіатуру (по 2 кнопки в рядку)
    const baseKeyboard = [];
    for (let i = 0; i < menuItems.length; i += 2) {
      const row = [];
      const item1 = menuItems[i];
      row.push({ 
        text: item1.badge && item1.badge > 0 
          ? `${item1.text} (${item1.badge})` 
          : item1.text 
      });
      
      if (i + 1 < menuItems.length) {
        const item2 = menuItems[i + 1];
        row.push({ 
          text: item2.badge && item2.badge > 0 
            ? `${item2.text} (${item2.badge})` 
            : item2.text 
        });
      }
      baseKeyboard.push(row);
    }
    
    // Формуємо персоналізоване привітання
    let welcomeText = `👋 <b>Привіт, ${userName}!</b>\n\n`;
    
    // Персоналізоване привітання залежно від ролі
    if (role === 'HR') {
      if (urgentCount > 0) {
        welcomeText += `🚨 <b>Увага!</b> ${urgentCount} ${urgentCount === 1 ? 'заявка' : 'заявок'} потребують уваги!\n\n`;
      } else {
        welcomeText += `✅ Всі заявки оброблені. Гарного дня!\n\n`;
      }
    } else if (role === 'CEO') {
      if (criticalCount > 0) {
        welcomeText += `⚡ <b>${criticalCount} критичних алертів</b>\n\n`;
      } else {
        welcomeText += `📊 Все під контролем\n\n`;
      }
    } else if ((role === 'PM' || role === 'TL') && pendingCount > 0) {
      welcomeText += `📋 ${pendingCount} ${pendingCount === 1 ? 'заявка' : 'заявок'} на затвердження\n\n`;
    }
    
    welcomeText += `Чим можу допомогти?`;

    await sendMessage(chatId, welcomeText, baseKeyboard);
    
    // Показуємо контекстні швидкі дії (якщо є)
    await showContextualQuickActions(chatId, telegramId);
    
    // Логування входу в головне меню
    await logUserData(telegramId, 'main_menu_access', { 
      role: role,
      urgentCount: urgentCount,
      criticalCount: criticalCount,
      pendingCount: pendingCount
    });
  } catch (error) {
    console.error('❌ Помилка showMainMenu:', error);
    await sendMessage(chatId, '❌ Помилка завантаження меню.');
  }
}

// 🔘 ОБРОБКА REPLY KEYBOARD
async function handleReplyKeyboard(chatId, telegramId, text) {
  try {
    const routes = {
      '🏖️ Відпустки': () => vacationHandler ? vacationHandler.showVacationMenu(chatId, telegramId) : showVacationMenu(chatId, telegramId),
      '🏠 Remote': () => remoteHandler ? remoteHandler.showRemoteMenu(chatId, telegramId) : showRemoteMenu(chatId, telegramId),
      '⏰ Спізнення': () => lateHandler ? lateHandler.showLateMenu(chatId, telegramId) : showLateMenu(chatId, telegramId),
      '🏥 Лікарняний': () => sickHandler ? sickHandler.showSickMenu(chatId, telegramId) : showSickMenu(chatId, telegramId),
      '📊 Статистика': showStatsMenu,
      '🎯 Онбординг': showOnboardingMenu,
      '📋 Тет': showOneOnOneMenu,
      '❓ FAQ': showFAQMenu,
      '💬 Пропозиції': showSuggestionsMenu,
      '🚨 ASAP запит': showASAPMenu,
      '📋 Затвердження': () => approvalHandler ? approvalHandler.showApprovalsMenu(chatId, telegramId) : showApprovalsMenu(chatId, telegramId),
      '📋 На затвердження': showApprovalsMenu, // Для PM/TL
      '📈 Аналітика': showAnalyticsMenu,
      '📈 Аналітика компанії': showAnalyticsMenu, // Для CEO
      '👥 HR Панель': showHRPanel,
      '📊 HR Дашборд': showHRDashboardStats, // Новий пункт для HR
      '📤 Масовий експорт': showHRExportMenu, // Новий пункт для HR
      '📢 Розсилки': showMailingsMenu,
      '🏢 CEO Панель': showCEOPanel,
      '💼 Фінанси HR': showHRPanel, // Поки що перенаправляємо на HR Панель
      '⚡ Критичні алерти': showCEOPanel // Поки що перенаправляємо на CEO Панель
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
    
    // Екрануємо HTML символи в імені користувача для безпеки
    const safeUserName = (userName || 'колега')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    const welcomeText = `👋 <b>Привіт, ${safeUserName}!</b>

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
    logger.info('Starting registration process', { telegramId, username, firstName, lastName });
    
    // Очищаємо попередні дані реєстрації
    if (registrationCache.has(telegramId)) {
      registrationCache.delete(telegramId);
      logger.debug('Cleared previous registration data', { telegramId });
    }
    
    const welcomeText = `🌟 <b>Привіт зірочка!</b>

Я бот-помічник розроблений твоїм HR. Вона створила мене, щоб полегшити і автоматизувати процеси. Я точно стану тобі в нагоді.

Почну з того, що прошу тебе зареєструватися. Це потрібно, аби надалі я міг допомагати тобі.

<b>Крок 1 з 7:</b> Оберіть відділ:`;

    // Зберігаємо дані реєстрації
    const regData = {
      step: 'department',
      data: {
        username: username || null,
        firstName: firstName || null,
        lastName: lastName || null
      },
      timestamp: Date.now()
    };
    
    registrationCache.set(telegramId, regData);
    logger.debug('Registration data saved', { telegramId, step: regData.step });

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
    logger.info('Registration welcome message sent', { telegramId });
  } catch (error) {
    logger.error('Error in startRegistration', error, { telegramId });
    console.error('❌ Помилка startRegistration:', error);
    console.error('❌ Stack:', error.stack);
    try {
      await sendMessage(chatId, '❌ Помилка при запуску реєстрації. Спробуйте ще раз через /start');
    } catch (sendError) {
      logger.error('Failed to send error message', sendError, { telegramId });
    }
  }
}

// 🏢 ВИБІР ВІДДІЛУ
async function handleDepartmentSelection(chatId, telegramId, department) {
  try {
    logger.info('Handling department selection', { telegramId, department });
    
    let regData = registrationCache.get(telegramId);
    if (!regData) {
      logger.warn('No registration data found, creating new', { telegramId });
      // Якщо немає даних реєстрації, створюємо нові
      regData = {
        step: 'department',
        data: {},
        timestamp: Date.now()
      };
      registrationCache.set(telegramId, regData);
    }

    regData.data.department = department;
    regData.step = 'team';
    registrationCache.set(telegramId, regData); // Зберігаємо зміни
    logger.debug('Department selected, moving to team selection', { telegramId, department });

    const keyboard = { inline_keyboard: [] };
    
    if (DEPARTMENTS[department]) {
      const teams = Object.keys(DEPARTMENTS[department]);
      logger.debug('Found teams for department', { telegramId, department, teamsCount: teams.length });
      
      for (const team of teams) {
        keyboard.inline_keyboard.push([
          { text: team, callback_data: `team_${team}` }
        ]);
      }
    } else {
      logger.warn('Department not found in DEPARTMENTS', { telegramId, department });
      await sendMessage(chatId, `❌ Помилка: відділ "${department}" не знайдено. Спробуйте ще раз.`);
      return;
    }

    if (keyboard.inline_keyboard.length === 0) {
      logger.warn('No teams found for department', { telegramId, department });
      await sendMessage(chatId, `❌ Помилка: немає доступних команд для відділу "${department}". Зверніться до HR.`);
      return;
    }

    await sendMessage(chatId, `✅ Відділ: <b>${department}</b>\n\n<b>Крок 2 з 7:</b> Оберіть команду:`, keyboard);
    logger.info('Team selection menu sent', { telegramId, department });
  } catch (error) {
    logger.error('Error in handleDepartmentSelection', error, { telegramId, department });
    console.error('❌ Помилка handleDepartmentSelection:', error);
    console.error('❌ Stack:', error.stack);
    try {
      await sendMessage(chatId, '❌ Помилка обробки вибору відділу. Спробуйте ще раз.');
    } catch (sendError) {
      logger.error('Failed to send error message', sendError, { telegramId });
    }
  }
}

// 👥 ВИБІР КОМАНДИ
async function handleTeamSelection(chatId, telegramId, team) {
  try {
    logger.info('Handling team selection', { telegramId, team });
    
    let regData = registrationCache.get(telegramId);
    if (!regData) {
      logger.warn('No registration data found for team selection', { telegramId, team });
      await sendMessage(chatId, '❌ Помилка: дані реєстрації не знайдені. Почніть реєстрацію спочатку через /start');
      return;
    }

    const department = regData.data.department;
    console.log(`🔍 Обробка вибору команди: department=${department}, team=${team}`);

    regData.data.team = team;
    regData.step = 'position';
    registrationCache.set(telegramId, regData);

    const keyboard = { inline_keyboard: [] };
    
    // Перевіряємо, чи є команда в структурі
    if (DEPARTMENTS[department] && DEPARTMENTS[department][team]) {
      const positions = DEPARTMENTS[department][team];
      console.log(`✅ Знайдено команду ${team}, посади:`, positions);
      
      // Перевіряємо, чи positions - це масив
      if (Array.isArray(positions)) {
      for (const position of positions) {
        keyboard.inline_keyboard.push([
          { text: position, callback_data: `position_${position}` }
        ]);
      }
        console.log(`✅ Додано ${positions.length} посад для команди ${team}`);
      } else {
        console.warn(`⚠️ Посади для команди ${team} не є масивом, тип:`, typeof positions);
      }
    } else {
      console.warn(`⚠️ Команда ${team} не знайдена в відділі ${department}`);
      console.warn(`⚠️ Доступні команди в ${department}:`, DEPARTMENTS[department] ? Object.keys(DEPARTMENTS[department]) : 'відділ не знайдено');
      await sendMessage(chatId, `❌ Помилка: команда "${team}" не знайдена в відділі "${department}". Спробуйте ще раз.`);
      return;
    }

    // Якщо немає кнопок, показуємо помилку
    if (keyboard.inline_keyboard.length === 0) {
      console.warn(`⚠️ Немає посад для команди ${team} в відділі ${department}`);
      await sendMessage(chatId, `❌ Помилка: немає доступних посад для команди "${team}". Зверніться до HR.`);
      return;
    }

    await sendMessage(chatId, `✅ Команда: <b>${team}</b>\n\n<b>Крок 3 з 7:</b> Оберіть посаду:`, keyboard);
    logger.info('Position selection menu sent', { telegramId, team, department: regData.data.department });
  } catch (error) {
    logger.error('Error in handleTeamSelection', error, { telegramId, team });
    console.error('❌ Помилка handleTeamSelection:', error);
    console.error('❌ Stack:', error.stack);
    try {
      await sendMessage(chatId, '❌ Помилка обробки вибору команди. Спробуйте ще раз.');
    } catch (sendError) {
      logger.error('Failed to send error message', sendError, { telegramId });
    }
  }
}

// 💼 ВИБІР ПОСАДИ
async function handlePositionSelection(chatId, telegramId, position) {
  try {
    logger.info('Handling position selection', { telegramId, position });
    
    let regData = registrationCache.get(telegramId);
    if (!regData) {
      logger.warn('No registration data found for position selection', { telegramId, position });
      // Якщо немає даних реєстрації, показуємо помилку та пропонуємо почати спочатку
      await sendMessage(chatId, '❌ Помилка: дані реєстрації не знайдені. Почніть реєстрацію спочатку через /start');
      return;
    }

    regData.data.position = position;
    regData.step = 'name';
    registrationCache.set(telegramId, regData); // Зберігаємо зміни
    logger.debug('Position selected, moving to name input', { telegramId, position });

    await sendMessage(chatId, `✅ Посада: <b>${position}</b>\n\n<b>Крок 4 з 7:</b> Введіть ваше ім'я:`);
    logger.info('Name input prompt sent', { telegramId, position });
  } catch (error) {
    logger.error('Error in handlePositionSelection', error, { telegramId, position });
    console.error('❌ Помилка handlePositionSelection:', error);
    console.error('❌ Stack:', error.stack);
    try {
      await sendMessage(chatId, '❌ Помилка обробки вибору посади. Спробуйте ще раз.');
    } catch (sendError) {
      logger.error('Failed to send error message', sendError, { telegramId });
    }
  }
}

// 📝 ОБРОБКА КРОКІВ РЕЄСТРАЦІЇ
async function handleRegistrationStep(chatId, telegramId, text) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) return false;

    switch (regData.step) {
      case 'name':
        regData.data.name = text.trim();
        regData.step = 'surname';
        registrationCache.set(telegramId, regData);
        logger.debug('Name entered, moving to surname', { telegramId, name: regData.data.name });
        await sendMessage(chatId, `✅ Ім'я: <b>${text}</b>\n\n<b>Крок 5 з 7:</b> Введіть ваше прізвище:`);
        return true;

      case 'surname':
        regData.data.surname = text.trim();
        regData.step = 'birthdate';
        registrationCache.set(telegramId, regData);
        logger.debug('Surname entered, moving to birthdate', { telegramId });
        await sendMessage(chatId, `✅ Прізвище: <b>${text}</b>\n\n<b>Крок 6 з 7:</b> Введіть дату народження (ДД.ММ.РРРР):`);
        return true;

      case 'birthdate':
        if (!isValidDate(text)) {
          logger.warn('Invalid birthdate format', { telegramId, text });
          await sendMessage(chatId, '❌ Неправильний формат дати. Використовуйте ДД.ММ.РРРР');
          return true; // Повертаємо true, щоб не показувати загальне меню
        }
        regData.data.birthDate = text.trim();
        regData.step = 'firstworkday';
        registrationCache.set(telegramId, regData);
        logger.debug('Birthdate entered, moving to first work day', { telegramId });
        await sendMessage(chatId, `✅ Дата народження: <b>${text}</b>\n\n<b>Крок 7 з 7:</b> Введіть перший робочий день (ДД.ММ.РРРР):`);
        return true;

      case 'firstworkday':
        if (!isValidDate(text)) {
          logger.warn('Invalid first work day format', { telegramId, text });
          await sendMessage(chatId, '❌ Неправильний формат дати. Використовуйте ДД.ММ.РРРР');
          return true; // Повертаємо true, щоб не показувати загальне меню
        }
        regData.data.firstWorkDay = text.trim();
        registrationCache.set(telegramId, regData);
        logger.info('All registration data collected, completing registration', { telegramId });
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

// 📥 ІМПОРТ ДАНИХ ПРО ДАТИ ПОЧАТКУ РОБОТИ (без TelegramID)
async function importWorkStartDates(workStartData) {
  /**
   * Імпортує дані про дати початку роботи без TelegramID
   * @param {Array<{month: number, day: number, year: number, name: string}>} workStartData
   */
  try {
    if (!doc) {
      await initGoogleSheets();
    }
    
    if (!doc) {
      throw new DatabaseError('Google Sheets не підключено');
    }
    
    await doc.loadInfo();
    
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
    
    const existingRows = await workStartSheet.getRows();
    let addedCount = 0;
    let updatedCount = 0;
    
    for (const record of workStartData) {
      const { month, day, year, name } = record;
      
      // Форматуємо дату як DD.MM.YYYY
      const firstWorkDay = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
      
      // Нормалізуємо ім'я (прибираємо зайві пробіли)
      const normalizedName = name.trim();
      
      // Перевіряємо, чи запис вже існує (за ім'ям та датою)
      const existingRecord = existingRows.find(row => {
        const rowName = (row.get('Ім\'я та прізвище') || row.get('FullName') || '').trim();
        const rowDate = row.get('Перший робочий день') || row.get('FirstWorkDay') || '';
        return rowName === normalizedName && rowDate === firstWorkDay;
      });
      
      if (existingRecord) {
        // Якщо запис існує, але не має TelegramID, оновлюємо інші поля
        const currentTelegramID = existingRecord.get('TelegramID');
        if (!currentTelegramID || currentTelegramID === '' || currentTelegramID === 'TEMP') {
          // Оновлюємо тільки якщо TelegramID відсутній
          existingRecord.set('Ім\'я та прізвище', normalizedName);
          await existingRecord.save();
          updatedCount++;
          console.log(`🔄 Оновлено запис для ${normalizedName} (${firstWorkDay})`);
        } else {
          console.log(`⏭️ Запис для ${normalizedName} (${firstWorkDay}) вже має TelegramID: ${currentTelegramID}`);
        }
      } else {
        // Додаємо новий запис без TelegramID
        await workStartSheet.addRow({
          'TelegramID': '', // Залишаємо пустим, буде заповнено при реєстрації
          'Ім\'я та прізвище': normalizedName,
          'Відділ': '', // Буде заповнено при реєстрації
          'Команда': '', // Буде заповнено при реєстрації
          'Посада': '', // Буде заповнено при реєстрації
          'Перший робочий день': firstWorkDay,
          'Дата додавання': new Date().toISOString()
        });
        addedCount++;
        console.log(`✅ Додано запис для ${normalizedName} (${firstWorkDay})`);
      }
    }
    
    console.log(`✅ Імпорт завершено: додано ${addedCount}, оновлено ${updatedCount} записів`);
    return { added: addedCount, updated: updatedCount };
  } catch (error) {
    console.error('❌ Помилка імпорту дат початку роботи:', error);
    throw error;
  }
}

// ✅ ЗАВЕРШЕННЯ РЕЄСТРАЦІЇ
async function completeRegistration(chatId, telegramId, data) {
  try {
    // Rate limiting для реєстрації
    if (!registrationLimiter.canProceed(telegramId)) {
      logger.warn('Rate limit exceeded for registration', { telegramId });
      await sendMessage(chatId, '⏳ Занадто багато спроб реєстрації. Будь ласка, зачекайте 5 хвилин.');
      return;
    }
    
    // Валідація даних реєстрації
    try {
      validateRegistrationData(data);
      validateTelegramId(telegramId);
    } catch (error) {
      logger.warn('Registration validation failed', { telegramId, error: error.message });
      await sendMessage(chatId, `❌ ${error.message}. Будь ласка, почніть реєстрацію спочатку через /start`);
      return;
    }
    
    const fullName = `${data.name} ${data.surname}`;
    
    logger.info('Completing registration', { telegramId, department: data.department, team: data.team, position: data.position });
    console.log(`   Команда: ${data.team}`);
    console.log(`   Посада: ${data.position}`);
    console.log(`   Дата народження: ${data.birthDate}`);
    console.log(`   Перший робочий день: ${data.firstWorkDay}`);
    
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
      
      // 3. Визначаємо та зберігаємо роль на основі посади та відділу
      const determinedRole = determineRoleByPositionAndDepartment(data.position, data.department);
      await saveUserRole(telegramId, determinedRole, data.position, data.department);
      console.log(`✅ Визначено роль для ${telegramId}: ${determinedRole} (на основі посади: ${data.position}, відділ: ${data.department})`);
      
      // 2. Зберігаємо в "Дати початку роботи" та прив'язуємо існуючі записи
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
      
      // Шукаємо існуючі записи за ім'ям та датою (без TelegramID)
      const workStartRows = await workStartSheet.getRows();
      const existingWorkStartByName = workStartRows.find(row => {
        const rowName = (row.get('Ім\'я та прізвище') || row.get('FullName') || '').trim();
        const rowDate = row.get('Перший робочий день') || row.get('FirstWorkDay') || '';
        const rowTelegramID = row.get('TelegramID');
        // Знаходимо запис з відповідним ім'ям та датою, але без TelegramID або з порожнім
        return rowName === fullName.trim() && 
               rowDate === data.firstWorkDay && 
               (!rowTelegramID || rowTelegramID === '' || rowTelegramID === 'TEMP');
      });
      
      if (existingWorkStartByName) {
        // Оновлюємо існуючий запис: додаємо TelegramID та інші дані
        existingWorkStartByName.set('TelegramID', telegramId);
        existingWorkStartByName.set('Ім\'я та прізвище', fullName);
        existingWorkStartByName.set('Відділ', data.department);
        existingWorkStartByName.set('Команда', data.team);
        existingWorkStartByName.set('Посада', data.position);
        await existingWorkStartByName.save();
        console.log(`✅ Прив'язано існуючий запис дати початку роботи для ${telegramId} (${fullName})`);
      } else {
        // Перевіряємо, чи запис вже існує з цим TelegramID
        const existingWorkStart = workStartRows.find(row => 
          row.get('TelegramID') == telegramId && row.get('Перший робочий день') == data.firstWorkDay
        );
        
        if (!existingWorkStart) {
          // Додаємо новий запис
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
    }

    // Очищаємо кеш реєстрації
    registrationCache.delete(telegramId);
    
    // Очищаємо старий кеш користувача (якщо є)
    if (userCache.has(telegramId)) {
      userCache.delete(telegramId);
    }
    
    // Додаємо користувача в кеш одразу після реєстрації
    userCache.set(telegramId, userData);
    logger.info('User added to cache after registration', { telegramId, fullName });
    console.log(`✅ Користувач ${telegramId} (${fullName}) додано в кеш`);
    
    // Додаємо в індекс для швидкого пошуку
    if (userIndex && typeof userIndex.add === 'function') {
      userIndex.add(userData);
    }
    
    // Невелика затримка для синхронізації Google Sheets
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Перевіряємо, чи дані правильно збережені
    const verifyUser = await getUserInfo(telegramId);
    if (!verifyUser || !verifyUser.fullName) {
      logger.warn('User not found immediately after registration, but continuing', { telegramId });
      console.warn(`⚠️ Попередження: користувач ${telegramId} не знайдено одразу після реєстрації, але продовжуємо...`);
      // Все одно показуємо меню, бо дані в кеші
    } else {
      logger.info('User verified after registration', { telegramId, fullName: verifyUser.fullName });
      console.log(`✅ Підтверджено: користувач ${telegramId} (${verifyUser.fullName}) знайдено в системі`);
    }

    // Показуємо повідомлення про успішну реєстрацію
    const successMessage = `🎉 <b>Реєстрацію завершено успішно!</b>\n\n` +
      `👤 <b>Ім'я:</b> ${fullName}\n` +
      `🏢 <b>Відділ:</b> ${data.department}\n` +
      `👥 <b>Команда:</b> ${data.team}\n` +
      `💼 <b>Посада:</b> ${data.position}\n` +
      `📅 <b>Дата народження:</b> ${data.birthDate}\n` +
      `📅 <b>Перший робочий день:</b> ${data.firstWorkDay}\n\n` +
      `✅ Всі ваші дані збережені в системі.\n` +
      `Тепер ви можете користуватися всіма функціями бота!`;
    
    await sendMessage(chatId, successMessage);
    
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
    const balance = await getVacationBalance(telegramId, user);
    
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
async function getVacationBalance(telegramId, existingUser = null) {
  try {
    if (!doc) return { used: 0, total: 24, available: 24 };
    
    const user = existingUser || await getUserInfo(telegramId);
    if (!user) return { used: 0, total: 24, available: 24 };
    
    // Обгортаємо операції з Google Sheets в чергу для запобігання rate limit
    return await sheetsQueue.add(async () => {
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
    });
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
    
    const user = await getUserInfo(telegramId);
    const balance = await getVacationBalance(telegramId, user);
    
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

// 📄 МОЇ ЗАЯВКИ НА ВІДПУСТКУ (З ПАГІНАЦІЄЮ)
async function showMyVacationRequests(chatId, telegramId, page = 0) {
  try {
    // Зберігаємо попередній стан (меню відпусток)
    navigationStack.pushState(telegramId, 'showVacationMenu', {});
    
    if (!doc) {
      await sendMessage(chatId, '❌ Google Sheets не підключено.');
      return;
    }
    
    const PAGE_SIZE = 5;
    
    // Обгортаємо операції з Google Sheets в чергу для запобігання rate limit
    await sheetsQueue.add(async () => {
    await doc.loadInfo();
      const sheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
    if (!sheet) {
      await sendMessage(chatId, '📋 У вас поки немає заявок на відпустку.');
      return;
    }
    
    const rows = await sheet.getRows();
      
    const userRequests = rows
        .filter(row => matchesTelegramId(row, telegramId))
        .map(row => {
          const startDateStr = getSheetValueByLanguage(row, sheet.title, 'Дата початку', 'StartDate');
          const startDate = startDateStr ? new Date(startDateStr) : new Date(0);
          return { row, startDate };
        })
        .sort((a, b) => b.startDate - a.startDate) // Сортуємо від нових до старих
        .map(item => item.row);
    
    if (userRequests.length === 0) {
      await sendMessage(chatId, '📋 У вас поки немає заявок на відпустку.');
      return;
    }
    
      // Розраховуємо пагінацію
      const totalPages = Math.ceil(userRequests.length / PAGE_SIZE);
      const currentPage = Math.max(0, Math.min(page, totalPages - 1));
      const start = currentPage * PAGE_SIZE;
      const end = start + PAGE_SIZE;
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
        statusText = 'Очікує HR';
        } else if (status === 'pending_pm' || status === 'Pending PM') {
        statusText = 'Очікує PM';
      }
      
        const typeText = requestType === 'emergency' || requestType === 'Екстрена' ? '🚨 Екстрена' : '📝 Звичайна';
        
        text += `${globalIndex}. ${statusEmoji} <b>${statusText}</b> ${typeText}\n`;
        text += `   📅 ${startDate} - ${endDate} (${days} днів)\n`;
        if (requestId) {
          text += `   🆔 ID: ${requestId}\n`;
        }
        text += `\n`;
      });
      
      const keyboard = { inline_keyboard: [] };
      
      // Кнопки навігації
      const navButtons = [];
      if (currentPage > 0) {
        navButtons.push({ 
          text: '◀️ Попередня', 
          callback_data: `vacation_requests_page_${currentPage - 1}` 
        });
      }
      if (currentPage < totalPages - 1) {
        navButtons.push({ 
          text: 'Наступна ▶️', 
          callback_data: `vacation_requests_page_${currentPage + 1}` 
        });
      }
      
      if (navButtons.length > 0) {
        keyboard.inline_keyboard.push(navButtons);
      }
      
      // Додаємо кнопку "Назад"
      addBackButton(keyboard, telegramId, 'showMyVacationRequests');
    
    await sendMessage(chatId, text, keyboard);
    });
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
    const cacheData = {
      step: 'emergency_vacation_start_date',
      data: { type: 'emergency_vacation' },
      timestamp: Date.now()
    };
    
    registrationCache.set(telegramId, cacheData);
    logger.info('Emergency vacation form cache set', { telegramId, step: cacheData.step });
    console.log('📝 showEmergencyVacationForm: Встановлено кеш для', telegramId, 'дані:', cacheData);
    console.log('📝 Перевірка кешу після встановлення:', registrationCache.get(telegramId));

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
    
    // Паралельне завантаження всієї статистики для швидкості
    const [vacationBalance, remoteStatsResult, lateStatsResult] = await Promise.allSettled([
      getVacationBalance(telegramId),
      getRemoteStatsForCurrentMonth(telegramId).catch(err => {
        console.error('Помилка отримання Remote статистики (showMonthlyStats):', err);
        return { used: 0 };
      }),
      getLateStatsForCurrentMonth(telegramId).catch(err => {
        console.error('Помилка отримання статистики спізнень (showMonthlyStats):', err);
        return { count: 0 };
      })
    ]);
    
    const balance = vacationBalance.status === 'fulfilled' ? vacationBalance.value : { used: 0, total: 24, available: 24, annual: 24, remaining: 24 };
    const remoteCount = remoteStatsResult.status === 'fulfilled' ? (remoteStatsResult.value.used || 0) : 0;
    const lateCount = lateStatsResult.status === 'fulfilled' ? (lateStatsResult.value.count || 0) : 0;
    
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
    const annual = balance.annual || balance.total || 24;
    const remaining = balance.remaining || balance.available || 0;
    const used = balance.used || 0;
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
    // Перевірка доступу та отримання даних паралельно
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
    
    // Отримуємо дані користувача (вже знаємо reportTelegramId)
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
    const user = await getUserInfo(telegramId);
    
    // Діагностика: логуємо роль та посаду для відлагодження
    console.log(`🔍 showApprovalsMenu: telegramId=${telegramId}, role=${role}, position=${user?.position}, department=${user?.department}`);
    
    // Перевіряємо роль, а також якщо посада або відділ містить HR - дозволяємо доступ
    const roleUpper = (role || '').toUpperCase();
    const isHRByRole = roleUpper === 'HR';
    const isHRByPosition = user?.position && user.position.toLowerCase().includes('hr');
    const isHRByDepartment = user?.department && user.department.toLowerCase().includes('hr');
    const isHR = isHRByRole || isHRByPosition || isHRByDepartment;
    const isPM = roleUpper === 'PM' || roleUpper === 'TL';
    const isCEO = roleUpper === 'CEO';
    
    if (!isHR && !isPM && !isCEO) {
      await sendMessage(chatId, `❌ Доступ обмежено. Тільки для PM, HR, CEO.\n\n🔍 Ваша роль: ${role || 'не визначено'}\n👤 Посада: ${user?.position || 'не вказано'}\n🏢 Відділ: ${user?.department || 'не вказано'}`);
      return;
    }
    
    // Якщо користувач має HR посаду/відділ, але роль не встановлена - встановлюємо роль
    if ((isHRByPosition || isHRByDepartment) && !isHRByRole) {
      console.log(`✅ Виявлено HR посаду/відділ для ${telegramId}, встановлюємо роль HR`);
      await saveUserRole(telegramId, 'HR', user.position, user.department);
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

// 🏖️ ЗАТВЕРДЖЕННЯ ВІДПУСТОК
async function showApprovalVacations(chatId, telegramId) {
  try {
    logger.info('showApprovalVacations called', { telegramId, chatId });
    console.log(`🔍 showApprovalVacations: telegramId=${telegramId}, chatId=${chatId}`);
    
    navigationStack.pushState(telegramId, 'showApprovalsMenu', {});
    
    const role = await getUserRole(telegramId);
    const user = await getUserInfo(telegramId);
    
    // Діагностика: логуємо роль та посаду для відлагодження
    console.log(`🔍 showApprovalVacations: telegramId=${telegramId}, role=${role}, position=${user?.position}, department=${user?.department}`);
    logger.info('showApprovalVacations user data', { telegramId, role, hasUser: !!user, position: user?.position, department: user?.department });
    
    // Перевіряємо роль, а також якщо посада або відділ містить HR - дозволяємо доступ
    const roleUpper = (role || '').toUpperCase();
    const isHRByRole = roleUpper === 'HR';
    const isHRByPosition = user?.position && user.position.toLowerCase().includes('hr');
    const isHRByDepartment = user?.department && user.department.toLowerCase().includes('hr');
    const isHR = isHRByRole || isHRByPosition || isHRByDepartment;
    const isPM = roleUpper === 'PM' || roleUpper === 'TL';
    const isCEO = roleUpper === 'CEO';
    
    if (!isHR && !isPM && !isCEO) {
      await sendMessage(chatId, `❌ Доступ обмежено. Тільки для PM, HR, CEO.\n\n🔍 Ваша роль: ${role || 'не визначено'}\n👤 Посада: ${user?.position || 'не вказано'}\n🏢 Відділ: ${user?.department || 'не вказано'}`);
      return;
    }
    
    // Якщо користувач має HR посаду/відділ, але роль не встановлена - встановлюємо роль
    if ((isHRByPosition || isHRByDepartment) && !isHRByRole) {
      console.log(`✅ Виявлено HR посаду/відділ для ${telegramId}, встановлюємо роль HR`);
      await saveUserRole(telegramId, 'HR', user.position, user.department);
    }

    // Перевірка підключення до Google Sheets
    if (!doc) {
      console.warn('⚠️ Google Sheets не підключено в showApprovalVacations, спробуємо перепідключитися...');
      const reconnected = await initGoogleSheets();
      if (!reconnected || !doc) {
        await sendMessage(chatId, '❌ Google Sheets не підключено. Спробуйте пізніше або зверніться до адміністратора.');
        return;
      }
      console.log('✅ Google Sheets перепідключено успішно в showApprovalVacations');
    }

    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
    if (!sheet) {
      await sendMessage(chatId, '❌ Таблиця відпусток не знайдена.');
      return;
    }

    const rows = await sheet.getRows();
    
    // Фільтруємо заявки на затвердження
    const pendingRequests = [];
    const approvedHistory = [];
    const rejectedHistory = [];

    for (const row of rows) {
      const status = getSheetValue(row, 'Статус', 'Status') || row.get('Status') || '';
      const statusLower = status.toLowerCase();
      
      if (statusLower === 'pending_hr' || statusLower === 'pending_pm' || status === 'Очікує HR' || status === 'Очікує PM') {
        pendingRequests.push(row);
      } else if (statusLower === 'approved' || status === 'Затверджено') {
        approvedHistory.push(row);
      } else if (statusLower === 'rejected' || status === 'Відхилено') {
        rejectedHistory.push(row);
      }
    }

    // Сортуємо за датою створення (нові спочатку)
    pendingRequests.sort((a, b) => {
      const dateA = getValue(a, 'Дата створення', 'CreatedAt') || '';
      const dateB = getValue(b, 'Дата створення', 'CreatedAt') || '';
      const dateAObj = dateA ? new Date(dateA) : new Date(0);
      const dateBObj = dateB ? new Date(dateB) : new Date(0);
      return dateBObj - dateAObj;
    });

    approvedHistory.sort((a, b) => {
      const dateA = getValue(a, 'Дата затвердження', 'ApprovedDate') || '';
      const dateB = getValue(b, 'Дата затвердження', 'ApprovedDate') || '';
      const dateAObj = dateA ? new Date(dateA) : new Date(0);
      const dateBObj = dateB ? new Date(dateB) : new Date(0);
      return dateBObj - dateAObj;
    });

    // Формуємо повідомлення
    let text = `🏖️ <b>Затвердження відпусток</b>\n\n`;

    // Показуємо заявки на затвердження
    if (pendingRequests.length > 0) {
      text += `⏳ <b>Очікують затвердження (${pendingRequests.length}):</b>\n\n`;
      
      pendingRequests.slice(0, 10).forEach((row, index) => {
        const fullName = getSheetValue(row, 'Ім\'я та прізвище', 'FullName') || 'Невідомо';
        const startDate = getSheetValue(row, 'Дата початку', 'StartDate') || '';
        const endDate = getSheetValue(row, 'Дата закінчення', 'EndDate') || '';
        const days = getSheetValue(row, 'Кількість днів', 'Days') || '0';
        const requestId = getSheetValue(row, 'ID заявки', 'RequestID') || '';
        const status = getSheetValue(row, 'Статус', 'Status') || '';
        const createdAt = getSheetValue(row, 'Дата створення', 'CreatedAt') || '';
        const requestType = getSheetValue(row, 'Тип заявки', 'RequestType') || 'regular';
        const department = getSheetValue(row, 'Відділ', 'Department') || '';
        const team = getSheetValue(row, 'Команда', 'Team') || '';
        
        const statusEmoji = status.toLowerCase().includes('hr') ? '👥' : '👨‍💼';
        const typeEmoji = requestType.toLowerCase().includes('emergency') ? '🚨' : '📝';
        
        text += `${index + 1}. ${typeEmoji} <b>${fullName}</b>\n`;
        text += `   ${statusEmoji} ${status.toLowerCase().includes('hr') ? 'Очікує HR' : 'Очікує PM'}\n`;
        text += `   📅 ${startDate} - ${endDate} (${days} днів)\n`;
        text += `   🏢 ${department} / ${team}\n`;
        if (createdAt) {
          try {
            const createdDate = new Date(createdAt);
            if (!isNaN(createdDate.getTime())) {
              text += `   📆 Подано: ${formatDate(createdDate)}\n`;
            }
          } catch (e) {
            // Якщо дата не валідна, просто пропускаємо
          }
        }
        if (requestId) {
          text += `   🆔 ID: ${requestId.substring(0, 15)}...\n`;
        }
        text += `\n`;
      });

      if (pendingRequests.length > 10) {
        text += `\n... та ще ${pendingRequests.length - 10} заявок\n\n`;
      }
    } else {
      text += `✅ <b>Немає заявок на затвердження</b>\n\n`;
    }

    // Показуємо останні затверджені заявки (останні 5)
    if (approvedHistory.length > 0) {
      text += `✅ <b>Останні затверджені (${Math.min(5, approvedHistory.length)}):</b>\n\n`;
      
      approvedHistory.slice(0, 5).forEach((row, index) => {
        const fullName = getSheetValue(row, 'Ім\'я та прізвище', 'FullName') || 'Невідомо';
        const startDate = getSheetValue(row, 'Дата початку', 'StartDate') || '';
        const endDate = getSheetValue(row, 'Дата закінчення', 'EndDate') || '';
        const approvedDate = getSheetValue(row, 'Дата затвердження', 'ApprovedDate') || '';
        const approvedBy = getSheetValue(row, 'Затверджено ким', 'ApprovedBy') || '';
        
        text += `${index + 1}. ✅ <b>${fullName}</b>\n`;
        text += `   📅 ${startDate} - ${endDate}\n`;
        if (approvedDate) {
          try {
            const approvedDateObj = new Date(approvedDate);
            if (!isNaN(approvedDateObj.getTime())) {
              text += `   ✅ Затверджено: ${formatDate(approvedDateObj)}\n`;
            }
          } catch (e) {
            // Якщо дата не валідна, просто пропускаємо
          }
        }
        text += `\n`;
      });
    }

    // Формуємо клавіатуру з кнопками для кожної заявки
    const keyboard = {
      inline_keyboard: []
    };

    // Додаємо кнопки для заявок на затвердження (якщо є)
    if (pendingRequests.length > 0) {
      // Показуємо максимум 10 заявок на сторінку
      const requestsToShow = pendingRequests.slice(0, 10);
      
      requestsToShow.forEach((row) => {
        const requestId = getSheetValue(row, 'ID заявки', 'RequestID') || '';
        const fullName = getSheetValue(row, 'Ім\'я та прізвище', 'FullName') || 'Невідомо';
        const startDate = getSheetValue(row, 'Дата початку', 'StartDate') || '';
        const days = getSheetValue(row, 'Кількість днів', 'Days') || '0';
        
        if (requestId) {
          // Кнопка для перегляду деталей заявки
          keyboard.inline_keyboard.push([
            { 
              text: `👤 ${fullName} (${startDate}, ${days} дн.)`, 
              callback_data: `view_vacation_${requestId}` 
            }
          ]);
          
          // Кнопки підтвердження/відхилення
          keyboard.inline_keyboard.push([
            { 
              text: '✅ Підтвердити', 
              callback_data: `approve_vacation_${requestId}` 
            },
            { 
              text: '❌ Відхилити', 
              callback_data: `reject_vacation_${requestId}` 
            }
          ]);
        }
      });
      
      // Якщо заявок більше 10, додаємо кнопку "Показати ще"
      if (pendingRequests.length > 10) {
        keyboard.inline_keyboard.push([
          { 
            text: `📄 Показати ще (${pendingRequests.length - 10})`, 
            callback_data: `vacation_requests_page_1` 
          }
        ]);
      }
    }

    addBackButton(keyboard, telegramId, 'showApprovalVacations');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showApprovalVacations:', error);
    await sendMessage(chatId, '❌ Помилка завантаження заявок. Спробуйте пізніше.');
  }
}

// 🏠 ЗАТВЕРДЖЕННЯ REMOTE
async function showApprovalRemote(chatId, telegramId) {
  try {
    logger.info('showApprovalRemote called', { telegramId, chatId });
    console.log(`🔍 showApprovalRemote: telegramId=${telegramId}, chatId=${chatId}`);
    
    navigationStack.pushState(telegramId, 'showApprovalsMenu', {});
    
    const role = await getUserRole(telegramId);
    const user = await getUserInfo(telegramId);
    
    // Діагностика: логуємо роль та посаду для відлагодження
    console.log(`🔍 showApprovalRemote: telegramId=${telegramId}, role=${role}, position=${user?.position}, department=${user?.department}`);
    logger.info('showApprovalRemote user data', { telegramId, role, hasUser: !!user, position: user?.position, department: user?.department });
    
    // Перевіряємо роль, а також якщо посада або відділ містить HR - дозволяємо доступ
    const roleUpper = (role || '').toUpperCase();
    const isHRByRole = roleUpper === 'HR';
    const isHRByPosition = user?.position && user.position.toLowerCase().includes('hr');
    const isHRByDepartment = user?.department && user.department.toLowerCase().includes('hr');
    const isHR = isHRByRole || isHRByPosition || isHRByDepartment;
    const isPM = roleUpper === 'PM' || roleUpper === 'TL';
    const isCEO = roleUpper === 'CEO';
    
    if (!isHR && !isPM && !isCEO) {
      await sendMessage(chatId, `❌ Доступ обмежено. Тільки для PM, HR, CEO.\n\n🔍 Ваша роль: ${role || 'не визначено'}\n👤 Посада: ${user?.position || 'не вказано'}\n🏢 Відділ: ${user?.department || 'не вказано'}`);
      return;
    }
    
    // Якщо користувач має HR посаду/відділ, але роль не встановлена - встановлюємо роль
    if ((isHRByPosition || isHRByDepartment) && !isHRByRole) {
      console.log(`✅ Виявлено HR посаду/відділ для ${telegramId}, встановлюємо роль HR`);
      await saveUserRole(telegramId, 'HR', user.position, user.department);
    }

    // Перевірка підключення до Google Sheets
    if (!doc) {
      console.warn('⚠️ Google Sheets не підключено в showApprovalRemote, спробуємо перепідключитися...');
      const reconnected = await initGoogleSheets();
      if (!reconnected || !doc) {
        await sendMessage(chatId, '❌ Google Sheets не підключено. Спробуйте пізніше або зверніться до адміністратора.');
        return;
      }
      console.log('✅ Google Sheets перепідключено успішно в showApprovalRemote');
    }

    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Remotes'] || doc.sheetsByTitle['Remote'];
    if (!sheet) {
      await sendMessage(chatId, '❌ Таблиця Remote не знайдена.');
      return;
    }

    const rows = await sheet.getRows();
    
    // Фільтруємо заявки
    const recentRemotes = rows
      .filter(row => {
        const dateStr = getSheetValue(row, 'Дата', 'Date') || '';
        if (!dateStr) return false;
        const date = new Date(dateStr);
        const now = new Date();
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        return date >= monthAgo;
      })
      .sort((a, b) => {
        const dateA = new Date(getSheetValue(a, 'Дата', 'Date') || '');
        const dateB = new Date(getSheetValue(b, 'Дата', 'Date') || '');
        return dateB - dateA;
      })
      .slice(0, 20);

    // Формуємо повідомлення
    let text = `🏠 <b>Remote дні</b>\n\n`;

    if (recentRemotes.length > 0) {
      text += `📊 <b>Останні Remote дні (${recentRemotes.length}):</b>\n\n`;
      
      recentRemotes.forEach((row, index) => {
        const fullName = getSheetValue(row, 'Ім\'я та прізвище', 'FullName') || 'Невідомо';
        const date = getSheetValue(row, 'Дата', 'Date') || '';
        const department = getSheetValue(row, 'Відділ', 'Department') || '';
        const team = getSheetValue(row, 'Команда', 'Team') || '';
        
        text += `${index + 1}. 🏠 <b>${fullName}</b>\n`;
        text += `   📅 ${date}\n`;
        text += `   🏢 ${department} / ${team}\n\n`;
      });
    } else {
      text += `✅ <b>Немає Remote днів за останній місяць</b>\n\n`;
    }

    const keyboard = {
      inline_keyboard: []
    };

    addBackButton(keyboard, telegramId, 'showApprovalRemote');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showApprovalRemote:', error);
    await sendMessage(chatId, '❌ Помилка завантаження Remote днів. Спробуйте пізніше.');
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
    const user = await getUserInfo(telegramId);
    
    if (role !== 'HR') {
      const diagnosticMsg = `❌ Доступ обмежено. Тільки для HR.\n\n` +
        `🔍 <b>Діагностика:</b>\n` +
        `👤 Ваша роль: <b>${role || 'не визначено'}</b>\n` +
        `💼 Посада: ${user?.position || 'не вказано'}\n` +
        `🏢 Відділ: ${user?.department || 'не вказано'}\n\n` +
        `💡 <b>Якщо ви HR:</b>\n` +
        `1. Перевірте, чи ваша посада містить "HR", "Human Resources", "кадр" або "персонал"\n` +
        `2. Якщо ні, зверніться до адміністратора для встановлення ролі вручну`;
      await sendMessage(chatId, diagnosticMsg);
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
          { text: '🏖️ Подати заявку на відпустку', callback_data: 'vacation_apply' }
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

// 👥 МЕНЮ УПРАВЛІННЯ КОРИСТУВАЧАМИ (HR)
async function showHRUsersMenu(chatId, telegramId) {
  try {
    navigationStack.pushState(telegramId, 'showHRPanel', {});
    
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    const text = `👥 <b>Управління користувачами</b>

Оберіть дію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 Список всіх працівників', callback_data: 'hr_users_list' },
          { text: '🔍 Пошук працівника', callback_data: 'hr_users_search' }
        ],
        [
          { text: '➕ Додати працівника', callback_data: 'hr_users_add' },
          { text: '✏️ Редагувати дані', callback_data: 'hr_users_edit' }
        ],
        [
          { text: '👑 Управління ролями', callback_data: 'hr_users_roles' }
        ]
      ]
    };

    addBackButton(keyboard, telegramId, 'showHRUsersMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    logger.error('Error in showHRUsersMenu', error, { telegramId });
    await sendMessage(chatId, '❌ Помилка завантаження меню.');
  }
}

// 📊 МЕНЮ ЗВІТІВ (HR)
async function showHRReportsMenu(chatId, telegramId) {
  try {
    navigationStack.pushState(telegramId, 'showHRPanel', {});
    
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    const text = `📊 <b>Звіти</b>

Оберіть тип звіту:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📈 HR Дашборд', callback_data: 'hr_dashboard' },
          { text: '📊 Аналітика', callback_data: 'analytics_hr' }
        ],
        [
          { text: '🏖️ Звіт по відпустках', callback_data: 'hr_reports_vacations' },
          { text: '🏠 Звіт по Remote', callback_data: 'hr_reports_remote' }
        ],
        [
          { text: '⏰ Звіт по спізненнях', callback_data: 'hr_reports_lates' },
          { text: '🏥 Звіт по лікарняних', callback_data: 'hr_reports_sick' }
        ]
      ]
    };

    addBackButton(keyboard, telegramId, 'showHRReportsMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    logger.error('Error in showHRReportsMenu', error, { telegramId });
    await sendMessage(chatId, '❌ Помилка завантаження меню.');
  }
}

// ⚙️ МЕНЮ НАЛАШТУВАНЬ (HR)
async function showHRSettingsMenu(chatId, telegramId) {
  try {
    navigationStack.pushState(telegramId, 'showHRPanel', {});
    
    const role = await getUserRole(telegramId);
    if (role !== 'HR') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR.');
      return;
    }

    const text = `⚙️ <b>Налаштування</b>

Оберіть налаштування:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔔 Налаштування сповіщень', callback_data: 'hr_settings_notifications' },
          { text: '📅 Календар свят', callback_data: 'hr_settings_holidays' }
        ],
        [
          { text: '📋 Бізнес-правила', callback_data: 'hr_settings_rules' },
          { text: '🔗 Інтеграції', callback_data: 'hr_settings_integrations' }
        ],
        [
          { text: '🔐 Безпека', callback_data: 'hr_settings_security' }
        ]
      ]
    };

    addBackButton(keyboard, telegramId, 'showHRSettingsMenu');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    logger.error('Error in showHRSettingsMenu', error, { telegramId });
    await sendMessage(chatId, '❌ Помилка завантаження меню.');
  }
}

// 📢 МЕНЮ РОЗСИЛОК (HR)
async function showMailingsMenu(chatId, telegramId) {
  try {
    const role = await getUserRole(telegramId);
    const user = await getUserInfo(telegramId);
    
    if (role !== 'HR') {
      const diagnosticMsg = `❌ Доступ обмежено. Тільки для HR.\n\n` +
        `🔍 <b>Діагностика:</b>\n` +
        `👤 Ваша роль: <b>${role || 'не визначено'}</b>\n` +
        `💼 Посада: ${user?.position || 'не вказано'}\n` +
        `🏢 Відділ: ${user?.department || 'не вказано'}\n\n` +
        `💡 Використайте команду /myrole для детальної інформації`;
      await sendMessage(chatId, diagnosticMsg);
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

function personalizeMailingMessage(template, userData) {
  if (!template || typeof template !== 'string' || !userData) {
    return template;
  }

  const replacements = {
    name: userData.fullName || 'колего',
    department: userData.department || '',
    team: userData.team || '',
    position: userData.position || ''
  };

  let result = template;
  Object.entries(replacements).forEach(([token, value]) => {
    const regex = new RegExp(`{{\\s*${token}\\s*}}`, 'gi');
    result = result.replace(regex, value || '');
  });

  return result;
}

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

    const templateHasPlaceholders = /{{\s*(name|department|team|position)\s*}}/i.test(message);
    const usersInfo = templateHasPlaceholders ? await getUsersInfoBatch(recipients) : {};

    // Відправляємо повідомлення
    let successCount = 0;
    let failCount = 0;

    for (const recipientId of recipients) {
      try {
        const normalizedId = recipientId?.toString();
        const userData = templateHasPlaceholders ? usersInfo[normalizedId] : null;
        const personalizedBody = templateHasPlaceholders
          ? personalizeMailingMessage(message, userData)
          : message;

        if (templateHasPlaceholders && !userData) {
          console.warn(`⚠️ Дані користувача ${recipientId} не знайдені для персоналізації розсилки`);
        }

        const chatIdToSend = Number(recipientId) || recipientId;
        await bot.sendMessage(
          chatIdToSend,
          `📢 <b>Повідомлення від HR</b>\n\n${personalizedBody}`,
          { parse_mode: 'HTML' }
        );
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
    logger.info('Starting registration from callback', { telegramId });
    
    // Очищаємо попередні дані реєстрації
    if (registrationCache.has(telegramId)) {
      registrationCache.delete(telegramId);
      logger.debug('Cleared previous registration cache', { telegramId });
    }
    
    // Очищаємо кеш користувача, щоб дозволити повторну реєстрацію
    if (userCache.has(telegramId)) {
      userCache.delete(telegramId);
      logger.debug('Cleared user cache for re-registration', { telegramId });
    }
    
    // Отримуємо дані користувача з callback (якщо доступні)
    // Якщо ні - використовуємо null
    await startRegistration(chatId, telegramId, null, null, null);
    logger.info('Registration started successfully', { telegramId });
  } catch (error) {
    logger.error('Error in startRegistrationFromCallback', error, { telegramId });
    console.error('❌ Помилка startRegistrationFromCallback:', error);
    console.error('❌ Stack:', error.stack);
    // Fallback
    try {
      await startRegistration(chatId, telegramId, null, null, null);
    } catch (fallbackError) {
      logger.error('Fallback registration also failed', fallbackError, { telegramId });
      await sendMessage(chatId, '❌ Помилка при запуску реєстрації. Спробуйте ще раз через /start');
    }
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
    
    // Отримуємо дані користувача з обов'язковою перевіркою
    let user = await getUserInfo(telegramId);
    
    // Якщо не знайдено, спробуємо ще раз з очищенням кешу
    if (!user) {
      console.warn(`⚠️ Користувач ${telegramId} не знайдено, очищаємо кеш та шукаємо знову...`);
      userCache.delete(telegramId);
      await new Promise(resolve => setTimeout(resolve, 500)); // Невелика затримка
      user = await getUserInfo(telegramId);
    }
    
    if (!user) {
      console.error(`❌ КРИТИЧНА ПОМИЛКА: Користувач ${telegramId} не знайдено після повторного пошуку`);
      throw new ValidationError(`Ваші дані не знайдені в системі. Будь ласка, зверніться до HR для перевірки реєстрації або пройдіть реєстрацію через /start`, 'user_data_missing');
    }
    
    // Перевіряємо, чи є fullName
    if (!user.fullName && !user.FullName) {
      console.warn(`⚠️ КРИТИЧНО: Користувач ${telegramId} не має fullName!`);
      userCache.delete(telegramId);
      await new Promise(resolve => setTimeout(resolve, 500));
      user = await getUserInfo(telegramId);
      
      if (!user || (!user.fullName && !user.FullName)) {
        throw new ValidationError(`Ваші дані не знайдені в системі. Будь ласка, зверніться до HR для перевірки реєстрації або пройдіть реєстрацію через /start`, 'user_data_missing');
      }
    }
    
    const { startDate: startDateRaw, days, reason } = vacationData;
    
    // Переконуємося, що startDate є Date об'єктом
    let startDate;
    if (startDateRaw instanceof Date) {
      startDate = new Date(startDateRaw);
    } else if (typeof startDateRaw === 'string') {
      startDate = new Date(startDateRaw);
    } else {
      throw new ValidationError('Невірна дата початку відпустки.', 'startDate');
    }
    
    // Перевірка валідності дати
    if (isNaN(startDate.getTime())) {
      throw new ValidationError('Невірна дата початку відпустки.', 'startDate');
    }
    
    // Перевірка кількості днів
    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 7) {
      throw new ValidationError('Кількість днів має бути від 1 до 7.', 'days');
    }
    
    // Перевірка причини
    if (!reason || reason.trim().length < 10) {
      throw new ValidationError('Причина має бути мінімум 10 символів.', 'reason');
    }
    
    // Обчислюємо дату закінчення
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysNum - 1);
    
    // Перевірка валідності дати закінчення
    if (isNaN(endDate.getTime())) {
      throw new ValidationError('Невірна дата закінчення відпустки.', 'endDate');
    }
    
    // Зберігаємо заявку в таблицю з типом emergency
    const requestId = await saveVacationRequest(telegramId, user, startDate, endDate, daysNum, 'pending_hr', null, 'emergency', reason.trim());
    
    if (!requestId) {
      throw new DatabaseError('Не вдалося зберегти заявку на відпустку.', 'save_vacation');
    }
    
    // Відправляємо тільки HR з інформацією про екстрену відпустку
    await notifyHRAboutEmergencyVacation(user, requestId, startDate, endDate, daysNum, reason.trim());
    
    // Підтвердження користувачу
    await sendMessage(chatId, `✅ <b>Екстрена заявка на відпустку відправлена!</b>\n\n📅 <b>Період:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n📊 <b>Днів:</b> ${daysNum}\n\n⏳ Заявка відправлена напряму HR для розгляду. Ви отримаєте відповідь найближчим часом.`);
    
    // Логування
    await logUserData(telegramId, 'emergency_vacation_request', {
      requestId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days: daysNum,
      hasReason: !!reason,
      department: user.department,
      team: user.team
    });
    
    logger.success('Emergency vacation request processed successfully', { telegramId, requestId });
    
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.warn('Validation error in emergency vacation request', { telegramId, error: error.message });
      await sendMessage(chatId, `❌ ${error.message}`);
    } else if (error instanceof DatabaseError) {
      logger.error('Database error in emergency vacation request', error, { telegramId });
      await sendMessage(chatId, `❌ ${error.message}\n\nБудь ласка, спробуйте пізніше або зверніться до HR.`);
    } else {
      logger.error('Unexpected error in emergency vacation request', error, { 
        telegramId, 
        vacationData,
        errorMessage: error.message,
        errorStack: error.stack 
      });
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
    // Валідація даних заявки
    try {
      validateVacationRequest(vacationData);
      validateTelegramId(telegramId);
    } catch (error) {
      logger.warn('Vacation request validation failed', { telegramId, error: error.message });
      throw error;
    }
    
    logger.info('Processing vacation request', { telegramId });
    
    // Отримуємо дані користувача з обов'язковою перевіркою
    let user = await getUserInfo(telegramId);
    
    // Якщо не знайдено, спробуємо ще раз з очищенням кешу
    if (!user) {
      logger.warn('User not found, clearing cache and retrying', { telegramId });
      userCache.delete(telegramId);
      await new Promise(resolve => setTimeout(resolve, 500)); // Невелика затримка
      user = await getUserInfo(telegramId);
    }
    
    if (!user) {
      logger.error('User not found after retry', null, { telegramId });
      throw new ValidationError(`Ваші дані не знайдені в системі. Будь ласка, зверніться до HR для перевірки реєстрації або пройдіть реєстрацію через /start`, 'user_data_missing');
    }
    
    // КРИТИЧНО: Перевіряємо, чи є fullName, якщо немає - перезавантажуємо та виправляємо
    if (!user.fullName && !user.FullName) {
      console.warn(`⚠️ КРИТИЧНО: Користувач ${telegramId} не має fullName!`);
      console.warn(`📋 Поточні дані користувача:`, JSON.stringify(user, null, 2));
      
      // Очищаємо кеш та перезавантажуємо
      userCache.delete(telegramId);
      await new Promise(resolve => setTimeout(resolve, 500));
      user = await getUserInfo(telegramId);
      
      if (!user || (!user.fullName && !user.FullName)) {
        console.error(`❌ КРИТИЧНА ПОМИЛКА: Не вдалося отримати fullName для користувача ${telegramId}`);
        throw new ValidationError(`Ваші дані не знайдені в системі. Будь ласка, зверніться до HR для перевірки реєстрації або пройдіть реєстрацію через /start`, 'user_data_missing');
      }
    }
    
    // Нормалізуємо fullName (використовуємо той, що є)
    if (!user.fullName && user.FullName) {
      user.fullName = user.FullName;
    }
    if (!user.department && user.Department) {
      user.department = user.Department;
    }
    if (!user.team && user.Team) {
      user.team = user.Team;
    }
    
    // Детальна перевірка даних користувача
    console.log('📋 processVacationRequest - дані користувача після нормалізації:', {
      telegramId,
      fullName: user.fullName,
      department: user.department,
      team: user.team
    });
    
    // Фінальна перевірка - якщо все ще немає fullName, кидаємо помилку
    if (!user.fullName) {
      console.error(`❌ КРИТИЧНА ПОМИЛКА: fullName все ще відсутнє після нормалізації для користувача ${telegramId}`);
      throw new ValidationError(`Ваші дані некоректні в системі. Будь ласка, зверніться до HR.`, 'user_data_invalid');
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
    
    // Паралельно перевіряємо баланс (передаємо user, щоб не перезавантажувати) та отримуємо PM
    const [balance, pm] = await Promise.all([
      getVacationBalance(telegramId, user),
      getPMForUser(user)
    ]);
    
    if (balance.remaining < daysNum) {
      // Якщо днів немає або недостатньо - відмовляємо і повідомляємо HR
      const remainingText = balance.remaining === 0 
        ? 'У вас залишилось 0 днів відпустки' 
        : `У вас залишилось ${balance.remaining} днів відпустки`;
      
      await sendMessage(chatId, `❌ <b>Відпустку відмовлено</b>\n\n${remainingText}. Потрібно: ${daysNum} днів.\n\nЗверніться до HR для уточнення.`);
      
      // Одразу повідомляємо HR про спробу взяти відпустку без днів
      await notifyHRAboutVacationDenial(user, startDateObj, endDate, daysNum, balance.remaining);
      
      // Якщо днів 0, інформуємо про закінчення
      if (balance.remaining === 0) {
        await notifyAboutVacationDaysExhausted(telegramId, user);
      }
      return;
    }
    
    // Перевіряємо, чи залишилось мало днів (менше 3)
    if (balance.remaining <= 3 && balance.remaining > 0) {
      await sendMessage(chatId, `⚠️ <b>Увага!</b> У вас залишилось мало днів відпустки: ${balance.remaining}. Після цієї заявки залишиться ${balance.remaining - daysNum} днів.`);
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
    const hasPM = pm !== null;
    
    // Визначаємо статус заявки
    const initialStatus = hasPM ? 'pending_pm' : 'pending_hr';
    
    // Зберігаємо заявку в таблицю
    const requestId = await saveVacationRequest(telegramId, user, startDateObj, endDate, daysNum, initialStatus, pm);
    
    if (!requestId) {
      throw new DatabaseError('Не вдалося зберегти заявку на відпустку.', 'save_vacation');
    }
    
    // Невелика затримка, щоб заявка точно збереглася в Google Sheets перед пошуком
    // Збільшуємо затримку для надійності (Google Sheets API може мати затримку синхронізації)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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
    
    // Обгортаємо операції з Google Sheets в чергу для запобігання rate limit
    return await sheetsQueue.add(async () => {
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
    });
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
      
      // Обгортаємо операції з Google Sheets в чергу для запобігання rate limit
      return await sheetsQueue.add(async () => {
      await doc.loadInfo();
        // Спробуємо спочатку українську назву, потім англійську для сумісності
        let sheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
      if (!sheet) {
        console.log(`📋 Створюємо новий лист "Відпустки"...`);
        sheet = await doc.addSheet({
            title: 'Відпустки',
          headerValues: [
              'ID заявки', 'TelegramID', 'Ім\'я та прізвище', 'Відділ', 'Команда', 'PM',
              'Дата початку', 'Дата закінчення', 'Кількість днів', 'Статус', 
              'Тип заявки', 'Причина', 'Дата створення', 'Затверджено ким', 'Дата затвердження',
              'Відхилено ким', 'Причина відхилення', 'Баланс до', 'Баланс після', 'Дата оновлення'
          ]
        });
        console.log(`✅ Лист "Відпустки" створено`);
      } else {
        console.log(`📋 Використовуємо існуючий лист "${sheet.title}" (ID: ${sheet.sheetId})`);
      }
      
      const requestId = `VAC_${Date.now()}_${telegramId}`;
      const pmName = pm ? pm.fullName : (user.pm || 'Не призначено');
      
        // Отримуємо баланс до додавання відпустки
        const balanceBefore = await getVacationBalance(telegramId);
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
      
      console.log(`📝 Зберігаємо заявку ${requestId} в таблицю "${sheet.title}"...`);
      console.log(`📋 Дані для збереження:`, JSON.stringify(rowData, null, 2));
      
      // Використовуємо batch операцію для оптимізації
      const savedRows = await batchAddRows(sheet, [rowData]);
      const savedRow = savedRows[0];
      
      // Перевіряємо, чи рядок дійсно збережено
      if (!savedRow) {
        throw new DatabaseError('Не вдалося зберегти рядок в Google Sheets', 'save_vacation');
      }
      
      console.log(`✅ Рядок збережено, перевіряємо ID...`);
      
      // Перевіряємо, що ID заявки правильно збережено
      const savedId = savedRow.get('ID заявки') || savedRow.get('RequestID');
      console.log(`📋 ID заявки: очікувалось="${requestId}" (тип: ${typeof requestId}), збережено="${savedId}" (тип: ${typeof savedId}), співпадає=${savedId === requestId}`);
      
      if (savedId !== requestId) {
        console.warn(`⚠️ Увага: ID заявки не співпадає! Очікувалось: ${requestId}, збережено: ${savedId}`);
        // Спробуємо виправити ID
        try {
          const isUkrainianSheet = sheet.title === 'Відпустки';
          if (isUkrainianSheet) {
            savedRow.set('ID заявки', requestId);
          } else {
            savedRow.set('RequestID', requestId);
          }
          // Використовуємо batch операцію замість окремих save()
          await batchUpdateRows([savedRow]);
          console.log(`✅ ID заявки виправлено на: ${requestId}`);
        } catch (error) {
          console.error(`❌ Не вдалося виправити ID заявки:`, error);
        }
      }
      
      // Оновлюємо інформацію про лист для синхронізації
      await doc.loadInfo();
      await sheet.loadCells();
      
      // Перевіряємо, що рядок дійсно доступний
      const verifyId = savedRow.get('ID заявки') || savedRow.get('RequestID');
      console.log(`🔍 Після оновлення: ID в рядку="${verifyId}", співпадає=${verifyId === requestId}`);
      
      console.log(`✅ Збережено заявку на відпустку: ${requestId}, статус: ${status}, тип: ${requestType}`);
      console.log(`📋 Дані заявки:`, {
        requestId,
        savedId,
        telegramId,
        userName: rowData['Ім\'я та прізвище'],
        department: rowData['Відділ'],
        team: rowData['Команда'],
        startDate: rowData['Дата початку'],
        endDate: rowData['Дата закінчення'],
        days: rowData['Кількість днів'],
        status: rowData['Статус']
      });
      
      // Зберігаємо заявку в тимчасовий кеш для швидкого пошуку
      vacationRequestsCache.set(requestId, {
        requestId,
        telegramId,
        savedRow: savedRow,
        rowData: rowData,
        savedAt: Date.now()
      });
      console.log(`💾 Заявка ${requestId} збережена в тимчасовий кеш`);
      
      // Очікуємо, поки заявка з'явиться в таблиці (до 5 секунд)
      let foundInVerification = false;
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Оновлюємо інформацію про лист перед перевіркою
        await doc.loadInfo();
        const verificationSheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
        if (verificationSheet) {
          const verificationRow = await findVacationRowById(verificationSheet, requestId);
          if (verificationRow.row) {
            console.log(`✅ Перевірка: заявка ${requestId} знайдена в таблиці після ${i + 1} секунд(и)`);
            foundInVerification = true;
            break;
          }
        }
      }
      
      if (!foundInVerification) {
        console.warn(`⚠️ Увага: заявка ${requestId} не знайдена після 5 секунд очікування. Можлива затримка синхронізації Google Sheets. Але заявка збережена в кеші.`);
      }
      
      return requestId;
      });
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
    
    // Детальна перевірка та логування даних користувача
    if (!user) {
      console.error('❌ notifyHRAboutVacationRequest: user об\'єкт відсутній');
      return;
    }
    
    console.log('📋 notifyHRAboutVacationRequest - дані користувача:', {
      hasUser: !!user,
      fullName: user.fullName,
      FullName: user.FullName,
      department: user.department,
      team: user.team,
      telegramId: user.telegramId
    });
    
    // КРИТИЧНО: Перевіряємо та нормалізуємо дані користувача
    // Якщо fullName відсутнє, спробуємо перезавантажити дані
    if (!user.fullName && !user.FullName) {
      console.warn(`⚠️ КРИТИЧНО: Користувач ${user.telegramId} не має fullName в notifyHRAboutVacationRequest`);
      console.warn(`📋 Поточні дані:`, JSON.stringify(user, null, 2));
      
      // Очищаємо кеш та перезавантажуємо
      userCache.delete(user.telegramId);
      const refreshedUser = await getUserInfo(user.telegramId);
      if (refreshedUser && (refreshedUser.fullName || refreshedUser.FullName)) {
        Object.assign(user, refreshedUser);
        console.log(`✅ Дані користувача перезавантажено: ${refreshedUser.fullName || refreshedUser.FullName}`);
      }
    }
    
    // Нормалізуємо дані користувача
    if (!user.fullName && user.FullName) {
      user.fullName = user.FullName;
    }
    if (!user.department && user.Department) {
      user.department = user.Department;
    }
    if (!user.team && user.Team) {
      user.team = user.Team;
    }
    
    // Перевіряємо, чи є дані користувача з детальним fallback
    let userName = user.fullName || user.FullName;
    if (!userName || userName === 'undefined' || userName === '') {
      userName = 'Невідомо';
      console.error(`❌ КРИТИЧНА ПОМИЛКА: Користувач ${user.telegramId} не має імені після всіх спроб. Об'єкт user:`, JSON.stringify(user, null, 2));
    }
    
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
    if (!HR_CHAT_ID) {
      logger.warn('HR_CHAT_ID not set, cannot notify HR about emergency vacation', { requestId });
      throw new TelegramError('HR_CHAT_ID не встановлено. Неможливо відправити повідомлення HR.');
    }
    
    // Переконуємося, що дати є Date об'єктами
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
    
    logger.success('HR notified about emergency vacation', { 
      requestId, 
      hrChatId: HR_CHAT_ID,
      userTelegramId: user.telegramId 
    });
    
    // Логування
    await logUserData(user.telegramId, 'emergency_vacation_hr_notification', {
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
      hrChatId: HR_CHAT_ID 
    });
    // Прокидаємо помилку далі, щоб processEmergencyVacationRequest міг її обробити
    throw error;
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
    
    // Спочатку перевіряємо тимчасовий кеш - якщо там є збережений рядок, використовуємо його
    const cachedRequest = vacationRequestsCache.get(requestId);
    let requestRowData = null;
    let attempts = 0; // Ініціалізуємо attempts
    
    if (cachedRequest && cachedRequest.savedRow) {
      console.log(`💾 Заявка ${requestId} знайдена в тимчасовому кеші, використовуємо збережений рядок`);
      
      try {
        // Перевіряємо, чи рядок дійсно має правильний ID
        const cachedId = cachedRequest.savedRow.get('ID заявки') || cachedRequest.savedRow.get('RequestID');
        console.log(`🔍 Перевірка кешованого рядка: очікувалось="${requestId}", знайдено="${cachedId}"`);
        
        if (cachedId === requestId || String(cachedId).trim() === String(requestId).trim()) {
          // Отримуємо лист для подальшої роботи
          await doc.loadInfo();
          const sheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
          if (sheet) {
            // Перезавантажуємо рядок для актуальних даних
            try {
              await cachedRequest.savedRow.load();
            } catch (error) {
              console.warn(`⚠️ Не вдалося перезавантажити рядок з кешу:`, error);
            }
            
            requestRowData = {
              sheet: sheet,
              row: cachedRequest.savedRow,
              sampleIds: []
            };
            attempts = 1; // Встановлюємо attempts = 1, якщо знайшли в кеші
            console.log(`✅ Використовуємо збережений рядок з кешу для заявки ${requestId}`);
          }
        } else {
          console.warn(`⚠️ ID в кешованому рядку не співпадає: очікувалось ${requestId}, знайдено ${cachedId}`);
        }
      } catch (error) {
        console.error(`❌ Помилка при роботі з кешованим рядком:`, error);
        // Продовжуємо пошук в таблиці
      }
    }
    
    // Якщо не знайшли в кеші, шукаємо в таблиці з retry
    if (!requestRowData?.row) {
      const maxAttempts = 5; // Збільшуємо кількість спроб
      
      while (attempts < maxAttempts && !requestRowData?.row) {
        if (attempts > 0) {
          // Затримка перед повторною спробою (збільшуємо для кожної спроби)
          await new Promise(resolve => setTimeout(resolve, 1500 * attempts));
          console.log(`🔄 Повторна спроба знайти заявку ${requestId} (спроба ${attempts + 1}/${maxAttempts})`);
        }
        
        // Обгортаємо операції з Google Sheets в чергу для запобігання rate limit
        requestRowData = await sheetsQueue.add(async () => {
          // Оновлюємо інформацію про документ та лист для синхронізації
          await doc.loadInfo();
          
          // Спробуємо спочатку українську назву, потім англійську для сумісності
          const sheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
          if (!sheet) {
            return { sheet: null, row: null, sampleIds: [] };
          }

          // Оновлюємо клітинки листа для синхронізації
          await sheet.loadCells();
          
          // Отримуємо актуальну кількість рядків
          await sheet.loadHeaderRow();
          
          const result = await findVacationRowById(sheet, requestId);
          return { sheet, ...result };
        });
        
        attempts++;
      }
    }
    
    if (!requestRowData || !requestRowData.sheet) {
      await sendMessage(chatId, '❌ Помилка: Таблиця відпусток не знайдена.');
      return;
    }
    
    if (!requestRowData.row) {
      console.error(`❌ Заявка з ID ${requestId} не знайдена після ${attempts} спроб`);
      console.error(`📋 Деталі пошуку:`, {
        requestId,
        requestIdType: typeof requestId,
        requestIdLength: requestId?.length,
        normalizedRequestId: String(requestId).trim(),
        sheetTitle: requestRowData.sheet?.title,
        sampleIds: requestRowData.sampleIds
      });
      
      if (requestRowData.sampleIds && requestRowData.sampleIds.length > 0) {
        console.log(`📋 Приклади ID з таблиці (перші 10):`, requestRowData.sampleIds);
        console.log(`🔍 Шукаємо ID: "${requestId}" (тип: ${typeof requestId}, довжина: ${requestId?.length})`);
        
        // Перевіряємо, чи є схожі ID
        const similarIds = requestRowData.sampleIds.filter(sampleId => {
          const sampleStr = String(sampleId);
          const requestStr = String(requestId);
          return sampleStr.includes(requestStr.substring(0, 10)) || 
                 requestStr.includes(sampleStr.substring(0, 10));
        });
        
        if (similarIds.length > 0) {
          console.log(`🔍 Знайдено схожі ID:`, similarIds);
        }
        
        requestRowData.sampleIds.slice(0, 5).forEach((sampleId, idx) => {
          const sampleStr = String(sampleId);
          const requestStr = String(requestId);
          console.log(`   ${idx + 1}. "${sampleStr}" (тип: ${typeof sampleId}, довжина: ${sampleStr.length}, збіг: ${sampleStr === requestStr})`);
        });
      }
      
      await sendMessage(chatId, `❌ Заявка з ID ${requestId} не знайдена після ${attempts} спроб.\n\nМожливі причини:\n• Заявка ще не збереглася (спробуйте через кілька секунд)\n• Помилка синхронізації з Google Sheets\n\nСпробуйте пізніше або зверніться до техпідтримки.`);
      return;
    }
    
    console.log(`✅ Заявка ${requestId} знайдена після ${attempts} спроб`);
    
    const { row: foundRow, sheet } = requestRowData;
    const isUkrainianSheet = sheet.title === 'Відпустки';

    // Оновлюємо статус (підтримуємо обидва формати назв колонок)
    const newStatus = approved ? 'approved' : 'rejected';
    const now = new Date().toISOString();
    
    if (isUkrainianSheet) {
      foundRow.set('Статус', newStatus);
      if (approved) {
        foundRow.set('Затверджено ким', telegramId);
        foundRow.set('Дата затвердження', now);
        foundRow.set('Відхилено ким', '');
        foundRow.set('Причина відхилення', '');
      } else {
        foundRow.set('Відхилено ким', telegramId);
        foundRow.set('Причина відхилення', ''); // Можна додати поле для причини відхилення
        foundRow.set('Затверджено ким', '');
        foundRow.set('Дата затвердження', '');
      }
      foundRow.set('Дата оновлення', now);
    } else {
      foundRow.set('Status', newStatus);
      if (approved) {
        foundRow.set('ApprovedBy', telegramId);
        foundRow.set('ApprovedAt', now);
        foundRow.set('RejectedBy', '');
        foundRow.set('RejectionReason', '');
      } else {
        foundRow.set('RejectedBy', telegramId);
        foundRow.set('RejectionReason', ''); // Можна додати поле для причини відхилення
        foundRow.set('ApprovedBy', '');
        foundRow.set('ApprovedAt', '');
      }
      foundRow.set('UpdatedAt', now);
    }
    // Зберігаємо оновлення
    await foundRow.save();
    
    // Перевіряємо, що зміни збережені
    const savedStatus = isUkrainianSheet 
      ? foundRow.get('Статус') 
      : foundRow.get('Status');
    
    if (savedStatus !== newStatus) {
      console.error(`❌ Помилка: статус не оновлено! Очікувалось: ${newStatus}, збережено: ${savedStatus}`);
      // Не кидаємо помилку, але логуємо для діагностики
    } else {
      console.log(`✅ Статус заявки ${requestId} оновлено на "${newStatus}" та збережено в таблицю`);
    }
    
    // Отримуємо дані заявки
    const userTelegramId = getTelegramId(foundRow);
    const userFullName = getSheetValueByLanguage(foundRow, sheet.title, 'Ім\'я та прізвище', 'FullName');
    const startDate = getSheetValueByLanguage(foundRow, sheet.title, 'Дата початку', 'StartDate');
    const endDate = getSheetValueByLanguage(foundRow, sheet.title, 'Дата закінчення', 'EndDate');
    const daysRaw = getSheetValueByLanguage(foundRow, sheet.title, 'Кількість днів', 'Days');
    const days = parseInt(daysRaw);
    
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
    
    // Після затвердження/відхилення показуємо оновлений список заявок
    await new Promise(resolve => setTimeout(resolve, 1000)); // Невелика затримка для синхронізації
    await showApprovalVacations(chatId, telegramId);
    
  } catch (error) {
    console.error('❌ Помилка handleHRVacationApproval:', error);
    await sendMessage(chatId, '❌ Помилка обробки заявки. Спробуйте пізніше.');
  }
}

// 📋 ПЕРЕГЛЯД ДЕТАЛЕЙ ЗАЯВКИ НА ВІДПУСТКУ
async function showVacationRequestDetails(chatId, telegramId, requestId) {
  try {
    const role = await getUserRole(telegramId);
    if (role !== 'HR' && role !== 'CEO') {
      await sendMessage(chatId, '❌ Доступ обмежено. Тільки для HR та CEO.');
      return;
    }
    
    if (!doc) {
      await sendMessage(chatId, '❌ Помилка: Google Sheets не підключено.');
      return;
    }
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Відпустки'] || doc.sheetsByTitle['Vacations'];
    if (!sheet) {
      await sendMessage(chatId, '❌ Таблиця відпусток не знайдена.');
      return;
    }
    
    const rows = await sheet.getRows();
    
    const requestRow = rows.find(row => {
      const rowId = getSheetValueByLanguage(row, sheet.title, 'ID заявки', 'RequestID') || '';
      return rowId === requestId || String(rowId).trim() === String(requestId).trim();
    });
    
    if (!requestRow) {
      await sendMessage(chatId, `❌ Заявка з ID ${requestId} не знайдена.`);
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
      text += `💰 <b>Баланс:</b> ${balanceBefore} → ${balanceAfter}\n`;
    }
    
    if (createdAt) {
      try {
        const createdDate = new Date(createdAt);
        if (!isNaN(createdDate.getTime())) {
          text += `📆 <b>Подано:</b> ${formatDate(createdDate)}\n`;
        }
      } catch (e) {
        // Якщо дата не валідна, просто пропускаємо
      }
    }
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Підтвердити', callback_data: `approve_vacation_${requestId}` },
          { text: '❌ Відхилити', callback_data: `reject_vacation_${requestId}` }
        ],
        [
          { text: '⬅️ Назад до списку', callback_data: 'approval_vacations' }
        ]
      ]
    };
    
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showVacationRequestDetails:', error);
    await sendMessage(chatId, '❌ Помилка завантаження деталей заявки.');
  }
}

/**
 * Пошук рядка заявки за ID з підтримкою великих таблиць (пагінація)
 * @param {GoogleSpreadsheetWorksheet} sheet
 * @param {string} requestId
 * @returns {Promise<{row: GoogleSpreadsheetRow|null, sampleIds: string[]}>}
 */
async function findVacationRowById(sheet, requestId) {
  const PAGE_SIZE = 500;
  const normalizedId = String(requestId).trim();
  let offset = 0;
  let sampleIds = [];
  let totalRowsChecked = 0;
  
  console.log(`🔍 findVacationRowById: шукаємо ID "${normalizedId}" (тип: ${typeof requestId})`);
  
  // Оновлюємо інформацію про лист перед пошуком
  try {
    await sheet.loadCells();
  } catch (error) {
    console.warn('⚠️ Не вдалося оновити клітинки листа:', error);
  }
  
  while (true) {
    // Отримуємо рядки з актуальними даними
    const rows = await sheet.getRows({
      offset,
      limit: PAGE_SIZE
    });
    
    if (rows.length === 0) break;
    
    totalRowsChecked += rows.length;
    
    if (offset === 0) {
      sampleIds = rows.slice(0, 10).map(r => {
        const id = r.get('ID заявки') || r.get('RequestID') || 'N/A';
        return String(id).trim();
      });
      console.log(`📋 Перші 10 ID з таблиці:`, sampleIds);
    }
    
    const foundRow = rows.find(row => {
      const rawId = row.get('ID заявки') || row.get('RequestID') || '';
      const normalizedRowId = String(rawId).trim();
      
      // Детальне порівняння
      const matches = normalizedRowId === normalizedId;
      
      // Логування для перших 5 рядків першої сторінки
      if (offset === 0 && rows.indexOf(row) < 5) {
        console.log(`🔍 Порівняння: шукаємо="${normalizedId}", знайдено="${normalizedRowId}", збіг=${matches}`);
      }
      
      return matches;
    });
    
    if (foundRow) {
      const foundId = foundRow.get('ID заявки') || foundRow.get('RequestID');
      console.log(`✅ Заявка знайдена! ID: "${foundId}", перевірено ${totalRowsChecked} рядків`);
      return { row: foundRow, sampleIds };
    }
    
    offset += rows.length;
    
    // Якщо отримали менше ніж PAGE_SIZE, значить досягли кінця
    if (rows.length < PAGE_SIZE) {
      break;
    }
  }
  
  console.log(`❌ Заявка "${normalizedId}" не знайдена після перевірки ${totalRowsChecked} рядків`);
  return { row: null, sampleIds };
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
    
    // Показуємо підказку про inline пошук
    const botUsername = BOT_USERNAME || process.env.BOT_USERNAME || 'your_bot';
    const text = `👤 <b>Експорт даних по працівнику</b>\n\n` +
      `🔍 <b>Швидкий пошук:</b> Використовуйте inline пошук для швидкого знаходження працівників:\n` +
      `Введіть <code>@${botUsername} &lt;ім'я працівника&gt;</code> в будь-якому чаті\n\n` +
      `Або оберіть зі списку нижче:`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 Показати всіх працівників', callback_data: 'hr_export_employee_list' }
        ]
      ]
    };
    
    addBackButton(keyboard, telegramId, 'showHRExportEmployee');
    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showHRExportEmployee:', error);
    await sendMessage(chatId, '❌ Помилка завантаження списку працівників.');
  }
}

// 📋 Показ списку всіх працівників (для кнопки)
async function showHRExportEmployeeList(chatId, telegramId) {
  try {
    if (!doc) {
      await sendMessage(chatId, '❌ Google Sheets не підключено.');
      return;
    }
    
    // Обгортаємо в чергу для запобігання rate limit
    await sheetsQueue.add(async () => {
    await doc.loadInfo();
      const employeesSheet = doc.sheetsByTitle['Працівники'] || doc.sheetsByTitle['Employees'];
    if (!employeesSheet) {
      await sendMessage(chatId, '❌ Таблиця працівників не знайдена.');
      return;
    }
    
    const rows = await employeesSheet.getRows();
      const employees = rows.map(row => {
        const userData = mapRowToUserData(row, employeesSheet.title);
        if (userData) {
          // Додаємо в індекс для швидкого пошуку
          userIndex.add(userData);
        }
        return userData;
      }).filter(emp => emp && emp.telegramId);
    
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
    
      let text = `👤 <b>Список працівників</b>\n\n`;
    
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
    });
  } catch (error) {
    console.error('❌ Помилка showHRExportEmployeeList:', error);
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
    
    // Перевіряємо кількість спізнень за місяць
    const lateStats = await getLateStatsForCurrentMonth(telegramId);
    
    const pm = await getPMForUser(user);
    if (pm) {
      await notifyPMAboutLate(user, date, time, reason, pm);
    }
    await notifyHRAboutLate(user, date, time, reason, pm !== null);
    
    // Якщо спізнень >= 7, інформуємо CEO, HR та користувача
    if (lateStats.count >= 7) {
      await notifyAboutExcessiveLates(telegramId, user, lateStats.count);
    }
    
    await sendMessage(chatId, `✅ <b>Повідомлення про спізнення відправлено!</b>\n\n📅 <b>Дата:</b> ${formatDate(date)}\n⏰ <b>Час початку роботи:</b> ${time}\n📝 <b>Причина:</b> ${reason}${lateStats.count >= 7 ? '\n\n⚠️ <b>УВАГА!</b> Кількість спізнень перевищує 7 за місяць!' : ''}`);
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

async function notifyPMAboutLate(user, date, time, reason, existingPM = null) {
  try {
    const pm = existingPM || await getPMForUser(user);
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

// 🚨 ІНФОРМУВАННЯ ПРО ПЕРЕВИЩЕННЯ СПІЗНЕНЬ (>=7)
async function notifyAboutExcessiveLates(telegramId, user, lateCount) {
  try {
    const message = `🚨 <b>УВАГА! ПЕРЕВИЩЕННЯ ЛІМІТУ СПІЗНЕНЬ</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ:</b> ${user.department}\n👥 <b>Команда:</b> ${user.team}\n⏰ <b>Кількість спізнень за місяць:</b> ${lateCount}\n⚠️ <b>Ліміт:</b> 7 спізнень/місяць\n\nПотрібна увага!`;
    
    // Інформуємо користувача
    await sendMessage(telegramId, `🚨 <b>УВАГА!</b>\n\nКількість ваших спізнень за місяць перевищує ліміт (${lateCount} з 7). Будь ласка, зверніть увагу на своїй пунктуальності.`);
    
    // Інформуємо HR
    if (HR_CHAT_ID) {
      await sendMessage(HR_CHAT_ID, message);
    }
    
    // Інформуємо всіх CEO
    await notifyAllCEOAboutExcessiveLates(user, lateCount);
    
    console.log(`🚨 Інформовано про перевищення спізнень для ${user.fullName} (${lateCount} спізнень)`);
  } catch (error) {
    console.error('❌ Помилка notifyAboutExcessiveLates:', error);
  }
}

// 👑 ІНФОРМУВАННЯ ВСІХ CEO ПРО ПЕРЕВИЩЕННЯ СПІЗНЕНЬ
async function notifyAllCEOAboutExcessiveLates(user, lateCount) {
  try {
    if (!doc) return;
    
    await doc.loadInfo();
    let rolesSheet = doc.sheetsByTitle['Roles'];
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
          await sendMessage(ceoTelegramId, message);
        } catch (error) {
          console.error(`❌ Помилка відправки повідомлення CEO ${ceoTelegramId}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('❌ Помилка notifyAllCEOAboutExcessiveLates:', error);
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

// 🏖️ ІНФОРМУВАННЯ ПРО ЗАКІНЧЕННЯ ДНІВ ВІДПУСТКИ
async function notifyAboutVacationDaysExhausted(telegramId, user) {
  try {
    const message = `⚠️ <b>УВАГА! ЗАКІНЧИЛИСЬ ДНІ ВІДПУСТКИ</b>\n\n👤 <b>Співробітник:</b> ${user.fullName}\n🏢 <b>Відділ:</b> ${user.department}\n👥 <b>Команда:</b> ${user.team}\n\nУ співробітника залишилось 0 днів відпустки. Потрібна увага HR.`;
    
    // Інформуємо користувача
    await sendMessage(telegramId, `⚠️ <b>Увага!</b>\n\nУ вас закінчились дні відпустки. Будь ласка, зверніться до HR для уточнення.`);
    
    // Інформуємо HR
    if (HR_CHAT_ID) {
      await sendMessage(HR_CHAT_ID, message);
    }
    
    console.log(`⚠️ Інформовано про закінчення днів відпустки для ${user.fullName}`);
  } catch (error) {
    console.error('❌ Помилка notifyAboutVacationDaysExhausted:', error);
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
    
    const pm = await getPMForUser(user);
    if (pm) {
      await notifyPMAboutRemote(user, date, pm);
    }
    await notifyHRAboutRemote(user, date, pm !== null);
    
    await sendMessage(chatId, `✅ <b>Повідомлення про Remote роботу відправлено!</b>\n\n📅 <b>Дата:</b> ${formatDate(date)}`);
  } catch (error) {
    console.error('❌ Помилка processRemoteRequest:', error);
    await sendMessage(chatId, '❌ Помилка обробки Remote запиту.');
  }
}

async function notifyPMAboutRemote(user, date, existingPM = null) {
  try {
    const pm = existingPM || await getPMForUser(user);
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
    
    const pm = await getPMForUser(user);
    if (pm) {
      await notifyPMAboutSick(user, date, pm);
    }
    await notifyHRAboutSick(user, date, pm !== null);
    
    await sendMessage(chatId, `✅ <b>Повідомлення про лікарняний відправлено!</b>\n\n📅 <b>Дата:</b> ${formatDate(date)}\n\nОдужуйте! 🏥`);
  } catch (error) {
    console.error('❌ Помилка processSickReport:', error);
    await sendMessage(chatId, '❌ Помилка обробки лікарняного.');
  }
}

async function notifyPMAboutSick(user, date, existingPM = null) {
  try {
    const pm = existingPM || await getPMForUser(user);
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

// 📥 ЗАВАНТАЖЕННЯ КОРИСТУВАЧІВ В ІНДЕКС
/**
 * Завантажує всіх користувачів з Google Sheets в індекс для швидкого пошуку
 */
async function loadUsersIntoIndex() {
  try {
    if (!doc) {
      console.warn('⚠️ Google Sheets не підключено, пропускаємо завантаження індексу');
      return;
    }
    
    // Обгортаємо в чергу для запобігання rate limit
    await sheetsQueue.add(async () => {
      await doc.loadInfo();
      const sheet = doc.sheetsByTitle['Працівники'] || doc.sheetsByTitle['Employees'];
      if (!sheet) {
        console.warn('⚠️ Таблиця Працівники/Employees не знайдена для завантаження індексу');
        return;
      }
      
      const rows = await sheet.getRows();
      let loadedCount = 0;
      
      for (const row of rows) {
        const userData = mapRowToUserData(row, sheet.title);
        if (userData && userData.telegramId && userData.fullName) {
          userIndex.add(userData);
          loadedCount++;
        }
      }
      
      console.log(`✅ Завантажено ${loadedCount} користувачів в індекс`);
    });
  } catch (error) {
    console.error('❌ Помилка завантаження користувачів в індекс:', error);
  }
}

// 🔍 ОБРОБКА INLINE QUERY ДЛЯ ШВИДКОГО ПОШУКУ ПРАЦІВНИКІВ
/**
 * Обробляє inline query для швидкого пошуку працівників
 * @param {Object} query - Inline query об'єкт від Telegram
 */
async function handleInlineQuery(query) {
  try {
    const searchTerm = (query.query || '').trim();
    
    // Якщо запит занадто короткий, не показуємо результати
    if (searchTerm.length < 2) {
      await bot.answerInlineQuery(query.id, [], {
        cache_time: 30,
        is_personal: false
      });
      return;
    }
    
    // Перевіряємо роль користувача (тільки HR/CEO можуть шукати)
    const role = await getUserRole(query.from.id);
    if (role !== 'HR' && role !== 'CEO') {
      await bot.answerInlineQuery(query.id, [], {
        cache_time: 30,
        is_personal: false
      });
      return;
    }
    
    // Шукаємо в індексі
    const employees = userIndex.search(searchTerm);
    
    // Обмежуємо до 10 результатів (Telegram обмеження)
    const results = employees.slice(0, 10).map(emp => ({
      type: 'article',
      id: emp.telegramId.toString(),
      title: emp.fullName || 'Невідомо',
      description: `${emp.department || 'Невідомо'} / ${emp.team || 'Невідомо'}`,
      input_message_content: {
        message_text: `/export_employee ${emp.telegramId}`,
        parse_mode: 'HTML'
      }
    }));
    
    await bot.answerInlineQuery(query.id, results, {
      cache_time: 30, // Кешуємо на 30 секунд
      is_personal: false
    });
    
    console.log(`✅ Inline query оброблено: знайдено ${results.length} працівників для "${searchTerm}"`);
  } catch (error) {
    console.error('❌ Помилка обробки inline query:', error);
    // Відповідаємо порожнім результатом при помилці
    try {
      await bot.answerInlineQuery(query.id, [], {
        cache_time: 30,
        is_personal: false
      });
    } catch (answerError) {
      console.error('❌ Помилка відповіді на inline query:', answerError);
    }
  }
}

// 🚀 ЗАПУСК СЕРВЕРА
async function startServer() {
  try {
    // Отримуємо інформацію про бота для BOT_USERNAME
    try {
      const botInfo = await bot.getMe();
      BOT_USERNAME = botInfo.username;
      console.log(`✅ Бот ініціалізовано: @${BOT_USERNAME}`);
    } catch (error) {
      console.warn('⚠️ Не вдалося отримати інформацію про бота:', error.message);
      BOT_USERNAME = process.env.BOT_USERNAME || null;
    }
    
    // Запуск сервера НЕБЛОКУЮЧО
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 HR Bot Ultimate запущено на порту ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/`);
      console.log(`📨 Webhook: ${WEBHOOK_URL || 'не встановлено'}`);
      if (BOT_USERNAME) {
        console.log(`🔍 Inline пошук доступний: @${BOT_USERNAME}`);
      }
    });
    
    // Обробка помилок сервера
    server.on('error', (error) => {
      console.error('❌ Помилка сервера:', error);
    });
    
    // Ініціалізація Google Sheets в фоні (неблокуюче)
    initGoogleSheets().then(async () => {
      // Після успішної ініціалізації завантажуємо користувачів в індекс
      try {
        await loadUsersIntoIndex();
        console.log(`✅ Завантажено ${userIndex.size()} користувачів в індекс для швидкого пошуку`);
      } catch (error) {
        console.warn('⚠️ Помилка завантаження користувачів в індекс:', error.message);
      }
    }).catch(error => {
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
  getUsersInfoBatch,
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
  importWorkStartDates,
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