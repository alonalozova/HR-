/**
 * 🚀 HR BOT TYPESCRIPT VERSION
 * Повна версія з type safety та сучасною архітектурою
 */

import { 
  User, 
  VacationRequest, 
  VacationStatus, 
  LateRecord, 
  RemoteRecord, 
  SickRecord,
  MonthlyReport,
  HRReport,
  Suggestion,
  ASAPRequest,
  BirthdayReminder,
  AnniversaryReminder,
  Survey,
  SurveyResponse,
  BotConfig,
  TelegramUpdate,
  TelegramMessage,
  TelegramUser,
  AppError,
  ValidationError,
  DatabaseError,
  LogEntry,
  SecurityEvent,
  KeyboardButton,
  InlineKeyboard,
  ReplyKeyboard,
  DateRange
} from './types';

// 🔧 CONFIGURATION
const config: BotConfig = {
  botToken: process.env.BOT_TOKEN || '',
  hrChatId: process.env.HR_CHAT_ID || '',
  sheetsId: process.env.SHEETS_ID || '',
  serviceAccountEmail: process.env.SERVICE_ACCOUNT_EMAIL || '',
  privateKey: process.env.PRIVATE_KEY || '',
  webhookUrl: process.env.WEBHOOK_URL || '',
  environment: (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development',
  features: {
    enableVacations: true,
    enableAttendance: true,
    enableReports: true,
    enableSuggestions: true,
    enableSurveys: true,
    enableNotifications: true,
    enableAnalytics: true
  }
};

// 📚 IMPORTS
const TelegramBot = require('node-telegram-bot-api');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

// 🗄️ CACHE WITH TTL
class CacheWithTTL<T> {
  private cache = new Map<string, { value: T; expiry: number }>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number = 1000, ttl: number = 300000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  set(key: string, value: T): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttl
    });
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    
    return item.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// 🚨 ERROR CLASSES
class AppError extends Error implements AppError {
  public code: string;
  public statusCode: number;
  public isOperational: boolean;
  public context?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'APP_ERROR', context?: any) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError implements ValidationError {
  public field: string;
  public value: any;
  public rule: string;

  constructor(field: string, value: any, rule: string, message?: string) {
    super(message || `Validation failed for field '${field}': ${rule}`, 400, 'VALIDATION_ERROR');
    this.field = field;
    this.value = value;
    this.rule = rule;
  }
}

class DatabaseError extends AppError implements DatabaseError {
  public query?: string;
  public table?: string;
  public operation: string;

  constructor(operation: string, message: string, query?: string, table?: string) {
    super(message, 500, 'DATABASE_ERROR');
    this.operation = operation;
    this.query = query;
    this.table = table;
  }
}

// 📝 LOGGER
class Logger {
  private logs: LogEntry[] = [];

  debug(message: string, context?: any): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: any): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: any): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: any): void {
    this.log('error', message, context);
  }

  private log(level: LogEntry['level'], message: string, context?: any): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context
    };
    
    this.logs.push(logEntry);
    console.log(`[${logEntry.timestamp.toISOString()}] ${level.toUpperCase()}: ${message}`, context || '');
    
    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }
  }

  getLogs(level?: LogEntry['level']): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }
}

// 🎯 MAIN CLASS
class HRBot {
  private bot: any;
  private app: any;
  private doc: any;
  private userCache: CacheWithTTL<User>;
  private registrationCache: CacheWithTTL<any>;
  private processedUpdates: CacheWithTTL<boolean>;
  private logger: Logger;
  private PORT: number;

  constructor() {
    this.PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    this.userCache = new CacheWithTTL<User>(1000, 300000); // 5 minutes
    this.registrationCache = new CacheWithTTL(100, 600000); // 10 minutes
    this.processedUpdates = new CacheWithTTL<boolean>(10000, 60000); // 1 minute
    this.logger = new Logger();
    
    this.initializeBot();
    this.initializeServer();
  }

  private async initializeBot(): Promise<void> {
    try {
      this.bot = new TelegramBot(config.botToken, { polling: false });
      this.logger.info('Telegram bot initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Telegram bot', { error: error.message });
      throw new AppError('Bot initialization failed', 500, 'BOT_INIT_ERROR', error);
    }
  }

  private initializeServer(): void {
    this.app = express();
    this.app.use(express.json());
    
    // Health check endpoint
    this.app.get('/', (req: any, res: any) => {
      const userAgent = req.get('User-Agent') || '';
      const isRailwayHealth = userAgent.includes('Railway') || userAgent.includes('railway');
      
      this.logger.info('Health check request', { 
        userAgent, 
        isRailwayHealth, 
        ip: req.ip,
        url: req.url 
      });
      
      const response = {
        status: 'OK',
        message: 'HR Bot TypeScript is running',
        timestamp: new Date().toISOString(),
        version: '4.0.0-typescript',
        sheets_connected: !!this.doc,
        uptime: process.uptime(),
        cache_stats: {
          users: this.userCache.size(),
          registrations: this.registrationCache.size(),
          processed_updates: this.processedUpdates.size()
        }
      };
      
      res.status(200).json(response);
    });

    this.app.get('/health', (req: any, res: any) => {
      res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '4.0.0-typescript',
        uptime: process.uptime()
      });
    });

    // Webhook endpoint
    this.app.post('/webhook', (req: any, res: any) => {
      this.handleWebhookUpdate(req.body);
      res.status(200).json({ status: 'ok' });
    });

    this.app.listen(this.PORT, () => {
      this.logger.info(`🚀 HR Bot TypeScript server запущено на порту ${this.PORT}`);
    });
  }

  private async handleWebhookUpdate(update: TelegramUpdate): Promise<void> {
    const updateId = update.update_id.toString();
    
    if (this.processedUpdates.has(updateId)) {
      this.logger.debug('Duplicate update ignored', { updateId });
      return;
    }
    
    this.processedUpdates.set(updateId, true);
    
    try {
      if (update.message) {
        await this.processMessage(update.message);
      } else if (update.callback_query) {
        await this.processCallbackQuery(update.callback_query);
      }
    } catch (error) {
      this.logger.error('Error processing update', { 
        updateId, 
        error: error.message,
        update: update 
      });
    }
  }

  private async processMessage(message: TelegramMessage): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from.id;
    const text = message.text || '';

    this.logger.info('Processing message', { 
      chatId, 
      userId, 
      text: text.substring(0, 100) 
    });

    try {
      // Check if user is registered
      const user = await this.getUser(userId);
      
      if (!user || !user.isRegistered) {
        await this.handleRegistration(message);
        return;
      }

      // Process commands and buttons
      await this.handleUserCommands(message, user);
      
    } catch (error) {
      this.logger.error('Error processing message', { 
        chatId, 
        userId, 
        error: error.message 
      });
      
      await this.sendMessage(chatId, 'Вибачте, сталася помилка. Спробуйте пізніше.');
    }
  }

  private async handleRegistration(message: TelegramMessage): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from.id;
    const text = message.text || '';

    // Welcome message for new users
    if (text === '/start' || text === '🏠 Головна') {
      await this.sendWelcomeMessage(chatId);
      return;
    }

    // Handle registration steps
    const registrationData = this.registrationCache.get(userId.toString()) || {};
    
    if (!registrationData.step) {
      registrationData.step = 'name';
      registrationData.userId = userId;
      this.registrationCache.set(userId.toString(), registrationData);
      
      await this.sendMessage(chatId, 'Введіть ваше повне ім\'я (Ім\'я Прізвище):');
      return;
    }

    await this.processRegistrationStep(message, registrationData);
  }

  private async processRegistrationStep(message: TelegramMessage, data: any): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from.id;
    const text = message.text || '';

    try {
      switch (data.step) {
        case 'name':
          if (this.validateName(text)) {
            data.fullName = text.trim();
            data.step = 'department';
            this.registrationCache.set(userId.toString(), data);
            
            const keyboard = this.createDepartmentKeyboard();
            await this.sendMessage(chatId, 'Оберіть ваш відділ:', { reply_markup: keyboard });
          } else {
            await this.sendMessage(chatId, 'Будь ласка, введіть коректне ім\'я (мінімум 2 слова):');
          }
          break;

        case 'department':
          if (this.validateDepartment(text)) {
            data.department = text;
            data.step = 'team';
            this.registrationCache.set(userId.toString(), data);
            
            const keyboard = this.createTeamKeyboard(data.department);
            await this.sendMessage(chatId, 'Оберіть вашу команду:', { reply_markup: keyboard });
          } else {
            await this.sendMessage(chatId, 'Будь ласка, оберіть відділ зі списку:');
          }
          break;

        case 'team':
          if (this.validateTeam(text)) {
            data.team = text;
            data.step = 'position';
            this.registrationCache.set(userId.toString(), data);
            
            const keyboard = this.createPositionKeyboard(data.department);
            await this.sendMessage(chatId, 'Оберіть вашу посаду:', { reply_markup: keyboard });
          } else {
            await this.sendMessage(chatId, 'Будь ласка, оберіть команду зі списку:');
          }
          break;

        case 'position':
          if (this.validatePosition(text)) {
            data.position = text;
            data.step = 'birthDate';
            this.registrationCache.set(userId.toString(), data);
            
            await this.sendMessage(chatId, 'Введіть дату народження (ДД.ММ.РРРР):');
          } else {
            await this.sendMessage(chatId, 'Будь ласка, оберіть посаду зі списку:');
          }
          break;

        case 'birthDate':
          const birthDate = this.parseDate(text);
          if (birthDate) {
            data.birthDate = birthDate;
            data.step = 'firstWorkDay';
            this.registrationCache.set(userId.toString(), data);
            
            await this.sendMessage(chatId, 'Введіть дату початку роботи (ДД.ММ.РРРР):');
          } else {
            await this.sendMessage(chatId, 'Будь ласка, введіть коректну дату (ДД.ММ.РРРР):');
          }
          break;

        case 'firstWorkDay':
          const firstWorkDay = this.parseDate(text);
          if (firstWorkDay) {
            data.firstWorkDay = firstWorkDay;
            data.step = 'workMode';
            this.registrationCache.set(userId.toString(), data);
            
            const keyboard = this.createWorkModeKeyboard();
            await this.sendMessage(chatId, 'Оберіть режим роботи:', { reply_markup: keyboard });
          } else {
            await this.sendMessage(chatId, 'Будь ласка, введіть коректну дату (ДД.ММ.РРРР):');
          }
          break;

        case 'workMode':
          if (this.validateWorkMode(text)) {
            data.workMode = text;
            
            // Complete registration
            await this.completeRegistration(data);
            
            // Clear registration cache
            this.registrationCache.delete(userId.toString());
            
            // Send welcome message
            await this.sendRegisteredWelcomeMessage(chatId, data);
            
            // Show main menu
            await this.showMainMenu(chatId);
          } else {
            await this.sendMessage(chatId, 'Будь ласка, оберіть режим роботи зі списку:');
          }
          break;

        default:
          await this.sendMessage(chatId, 'Щось пішло не так. Почніть спочатку: /start');
      }
    } catch (error) {
      this.logger.error('Error in registration step', { 
        step: data.step, 
        error: error.message 
      });
      await this.sendMessage(chatId, 'Вибачте, сталася помилка. Спробуйте ще раз.');
    }
  }

  private async completeRegistration(data: any): Promise<void> {
    try {
      const user: User = {
        telegramId: data.userId,
        fullName: data.fullName,
        department: data.department,
        team: data.team,
        position: data.position,
        birthDate: data.birthDate,
        firstWorkDay: data.firstWorkDay,
        workMode: data.workMode,
        isRegistered: true,
        role: {
          level: 'employee',
          permissions: this.getDefaultPermissions()
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save to cache
      this.userCache.set(data.userId.toString(), user);
      
      // Save to Google Sheets if available
      if (this.doc) {
        await this.saveUserToSheets(user);
      }

      this.logger.info('User registration completed', { 
        userId: data.userId, 
        fullName: data.fullName 
      });
      
    } catch (error) {
      this.logger.error('Error completing registration', { 
        userId: data.userId, 
        error: error.message 
      });
      throw new DatabaseError('save_user', 'Failed to save user registration', undefined, 'users');
    }
  }

  private async handleUserCommands(message: TelegramMessage, user: User): Promise<void> {
    const chatId = message.chat.id;
    const text = message.text || '';

    try {
      switch (text) {
        case '/start':
        case '🏠 Головна':
          await this.showMainMenu(chatId);
          break;

        case '🏖️ Відпустка':
          await this.handleVacationRequest(message, user);
          break;

        case '⏰ Спізнення':
          await this.handleLateArrival(message, user);
          break;

        case '🏠 Remote':
          await this.handleRemoteWork(message, user);
          break;

        case '🏥 Лікарняний':
          await this.handleSickLeave(message, user);
          break;

        case '📊 Звіти':
          await this.handleReports(message, user);
          break;

        case '💡 Пропозиції':
          await this.handleSuggestions(message, user);
          break;

        case '🚨 ASAP':
          await this.handleASAPRequest(message, user);
          break;

        case '🎂 Дні народження':
          await this.handleBirthdays(message, user);
          break;

        case '📋 Опитування':
          await this.handleSurveys(message, user);
          break;

        case '👤 Профіль':
          await this.showUserProfile(chatId, user);
          break;

        case '🆘 Допомога':
          await this.showHelp(chatId);
          break;

        default:
          await this.handleVacationProcess(message, user);
          break;
      }
    } catch (error) {
      this.logger.error('Error handling user command', { 
        command: text, 
        userId: user.telegramId, 
        error: error.message 
      });
      await this.sendMessage(chatId, 'Вибачте, сталася помилка. Спробуйте пізніше.');
    }
  }

  // 🏖️ VACATION HANDLING
  private async handleVacationRequest(message: TelegramMessage, user: User): Promise<void> {
    const chatId = message.chat.id;
    
    const keyboard: InlineKeyboard = {
      inline_keyboard: [
        [{ text: '📅 Запланувати відпустку', callback_data: 'vacation_plan' }],
        [{ text: '📋 Мої заявки', callback_data: 'vacation_my_requests' }],
        [{ text: '⚡ Екстрена відпустка', callback_data: 'vacation_emergency' }],
        [{ text: '🏠 Головна', callback_data: 'main_menu' }]
      ]
    };

    await this.sendMessage(chatId, 
      '🏖️ **Управління відпустками**\n\n' +
      '• 📅 **Запланувати відпустку** - звичайна заявка\n' +
      '• 📋 **Мої заявки** - перегляд статусу\n' +
      '• ⚡ **Екстрена відпустка** - негайне звернення до HR\n\n' +
      '**Правила відпусток:**\n' +
      '• Мінімум 1 день, максимум 7 днів за раз\n' +
      '• 3 місяці до першої відпустки\n' +
      '• Накладки заборонені в межах команди',
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  }

  private async handleVacationProcess(message: TelegramMessage, user: User): Promise<void> {
    const chatId = message.chat.id;
    const text = message.text || '';
    
    // Check if user is in vacation process
    const vacationData = this.registrationCache.get(`vacation_${user.telegramId}`) || {};
    
    if (!vacationData.step) {
      // Start vacation process
      vacationData.step = 'startDate';
      vacationData.userId = user.telegramId;
      this.registrationCache.set(`vacation_${user.telegramId}`, vacationData);
      
      await this.sendMessage(chatId, 
        '📅 **Планування відпустки**\n\n' +
        'Введіть дату початку відпустки (ДД.ММ.РРРР):\n' +
        'Наприклад: 15.01.2024'
      );
      return;
    }

    try {
      switch (vacationData.step) {
        case 'startDate':
          const startDate = this.parseDate(text);
          if (startDate && this.validateVacationDate(startDate)) {
            vacationData.startDate = startDate;
            vacationData.step = 'days';
            this.registrationCache.set(`vacation_${user.telegramId}`, vacationData);
            
            await this.sendMessage(chatId, 'Вкажіть кількість днів відпустки (1-7):');
          } else {
            await this.sendMessage(chatId, 
              '❌ Невірна дата. Введіть коректну дату у форматі ДД.ММ.РРРР.\n' +
              'Дата має бути не раніше завтра.'
            );
          }
          break;

        case 'days':
          const days = parseInt(text);
          if (days >= 1 && days <= 7) {
            vacationData.days = days;
            
            // Calculate end date
            const endDate = new Date(vacationData.startDate);
            endDate.setDate(endDate.getDate() + days - 1);
            vacationData.endDate = endDate;
            
            // Process vacation request
            await this.processVacationRequest(vacationData, user);
            
            // Clear vacation cache
            this.registrationCache.delete(`vacation_${user.telegramId}`);
            
          } else {
            await this.sendMessage(chatId, 
              '❌ Невірна кількість днів. Введіть число від 1 до 7.'
            );
          }
          break;
      }
    } catch (error) {
      this.logger.error('Error in vacation process', { 
        step: vacationData.step, 
        userId: user.telegramId, 
        error: error.message 
      });
      await this.sendMessage(chatId, 'Вибачте, сталася помилка. Спробуйте ще раз.');
    }
  }

  private async processVacationRequest(vacationData: any, user: User): Promise<void> {
    const chatId = user.telegramId;
    
    try {
      // Check vacation conflicts
      const conflicts = await this.checkVacationConflicts(
        vacationData.startDate, 
        vacationData.endDate, 
        user.department, 
        user.team
      );
      
      if (conflicts.length > 0) {
        await this.sendMessage(chatId, 
          '❌ **Упс, твоя відпустка пересікається з Людинкою з твоєї команди**\n\n' +
          '**Конфлікти:**\n' +
          conflicts.map(c => `• ${c.fullName} (${c.startDate.toLocaleDateString()} - ${c.endDate.toLocaleDateString()})`).join('\n') +
          '\n\nБудь ласка, оберіть інші дати.'
        );
        return;
      }

      // Check vacation balance
      const balance = await this.getVacationBalance(user.telegramId);
      if (vacationData.days > balance.remainingDays) {
        await this.sendMessage(chatId, 
          `❌ **Недостатньо днів відпустки**\n\n` +
          `Доступно: ${balance.remainingDays} днів\n` +
          `Запитується: ${vacationData.days} днів`
        );
        return;
      }

      // Create vacation request
      const request: VacationRequest = {
        requestId: this.generateRequestId(),
        userId: user.telegramId,
        startDate: vacationData.startDate,
        endDate: vacationData.endDate,
        days: vacationData.days,
        status: 'pending_pm',
        requestType: 'regular',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save to Google Sheets
      if (this.doc) {
        await this.saveVacationRequest(request);
      }

      // Notify PM
      await this.notifyPMAboutVacationRequest(request, user);
      
      // Notify HR
      await this.notifyHRAboutVacationRequest(request, user);

      await this.sendMessage(chatId, 
        '✅ **Супер, твій запит відправляється далі!**\n\n' +
        `📅 **Дата початку:** ${vacationData.startDate.toLocaleDateString()}\n` +
        `📅 **Дата закінчення:** ${vacationData.endDate.toLocaleDateString()}\n` +
        `📊 **Кількість днів:** ${vacationData.days}\n\n` +
        '**Статус:** Очікує підтвердження PM\n' +
        'Ви отримаєте повідомлення про зміну статусу.'
      );

      this.logger.info('Vacation request processed', { 
        requestId: request.requestId, 
        userId: user.telegramId 
      });

    } catch (error) {
      this.logger.error('Error processing vacation request', { 
        userId: user.telegramId, 
        error: error.message 
      });
      throw new DatabaseError('save_vacation', 'Failed to save vacation request', undefined, 'vacations');
    }
  }

  // 🔧 UTILITY METHODS
  private async getUser(userId: number): Promise<User | undefined> {
    // Check cache first
    const cachedUser = this.userCache.get(userId.toString());
    if (cachedUser) {
      return cachedUser;
    }

    // Load from Google Sheets if available
    if (this.doc) {
      try {
        const user = await this.loadUserFromSheets(userId);
        if (user) {
          this.userCache.set(userId.toString(), user);
          return user;
        }
      } catch (error) {
        this.logger.error('Error loading user from sheets', { userId, error: error.message });
      }
    }

    return undefined;
  }

  private async sendMessage(chatId: number, text: string, options?: any): Promise<void> {
    try {
      await this.bot.sendMessage(chatId, text, options);
    } catch (error) {
      this.logger.error('Error sending message', { chatId, error: error.message });
      throw new AppError('Failed to send message', 500, 'SEND_MESSAGE_ERROR', error);
    }
  }

  // 📋 VALIDATION METHODS
  private validateName(name: string): boolean {
    const trimmed = name.trim();
    const words = trimmed.split(/\s+/);
    return words.length >= 2 && words.every(word => word.length >= 2);
  }

  private validateDepartment(department: string): boolean {
    const validDepartments = [
      'Marketing', 'PPC', 'Target/Kris', 'Target/Lera', 
      'Design', 'SMM', 'Sales', 'HR', 'CEO'
    ];
    return validDepartments.includes(department);
  }

  private validateTeam(team: string): boolean {
    const validTeams = [
      'PPC Team', 'Target/Kris Team', 'Target/Lera Team',
      'Design Team', 'SMM Team', 'Sales Team', 'HR Team', 'CEO'
    ];
    return validTeams.includes(team);
  }

  private validatePosition(position: string): boolean {
    const validPositions = [
      'PM', 'PPC Specialist', 'Targetologist', 'Designer', 
      'Head of Design', 'Motion Designer', 'Static Designer', 
      'Video Designer', 'SMM Designer', 'Sales Manager', 
      'HR Manager', 'CEO', 'SMM Head', 'SMM Specialist', 'Producer'
    ];
    return validPositions.includes(position);
  }

  private validateWorkMode(mode: string): boolean {
    return ['Hybrid', 'Remote', 'Office'].includes(mode);
  }

  private validateVacationDate(date: Date): boolean {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    return date >= tomorrow;
  }

  private parseDate(dateStr: string): Date | null {
    try {
      const [day, month, year] = dateStr.split('.').map(Number);
      if (day && month && year && year >= 1900 && year <= 2100) {
        return new Date(year, month - 1, day);
      }
    } catch (error) {
      // Invalid date format
    }
    return null;
  }

  private generateRequestId(): string {
    return `REQ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultPermissions(): any[] {
    return [
      { action: 'view_own_data', resource: 'profile', allowed: true },
      { action: 'request_vacation', resource: 'vacations', allowed: true },
      { action: 'report_late', resource: 'attendance', allowed: true },
      { action: 'report_remote', resource: 'attendance', allowed: true }
    ];
  }

  // 🎨 KEYBOARD CREATION
  private createDepartmentKeyboard(): ReplyKeyboard {
    return {
      keyboard: [
        ['Marketing'], ['PPC'], ['Target/Kris'], ['Target/Lera'],
        ['Design'], ['SMM'], ['Sales'], ['HR'], ['CEO']
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };
  }

  private createTeamKeyboard(department: string): ReplyKeyboard {
    const teams: { [key: string]: string[] } = {
      'Marketing': [['Marketing Team']],
      'PPC': [['PPC Team']],
      'Target/Kris': [['Target/Kris Team']],
      'Target/Lera': [['Target/Lera Team']],
      'Design': [['Design Team']],
      'SMM': [['SMM Team']],
      'Sales': [['Sales Team']],
      'HR': [['HR Team']],
      'CEO': [['CEO']]
    };

    return {
      keyboard: teams[department] || [['Unknown Team']],
      resize_keyboard: true,
      one_time_keyboard: true
    };
  }

  private createPositionKeyboard(department: string): ReplyKeyboard {
    const positions: { [key: string]: string[] } = {
      'Marketing': [['PM'], ['Marketing Specialist']],
      'PPC': [['PPC Specialist'], ['PPC Manager']],
      'Target/Kris': [['Targetologist'], ['Team Lead']],
      'Target/Lera': [['Targetologist'], ['Team Lead']],
      'Design': [['Designer'], ['Head of Design'], ['Motion Designer'], ['Static Designer'], ['Video Designer']],
      'SMM': [['SMM Designer'], ['SMM Head'], ['SMM Specialist'], ['Producer']],
      'Sales': [['Sales Manager'], ['Sales Specialist']],
      'HR': [['HR Manager'], ['HR Specialist']],
      'CEO': [['CEO']]
    };

    return {
      keyboard: positions[department] || [['Employee']],
      resize_keyboard: true,
      one_time_keyboard: true
    };
  }

  private createWorkModeKeyboard(): ReplyKeyboard {
    return {
      keyboard: [['Hybrid'], ['Remote'], ['Office']],
      resize_keyboard: true,
      one_time_keyboard: true
    };
  }

  // 📱 MESSAGE HANDLERS
  private async sendWelcomeMessage(chatId: number): Promise<void> {
    const keyboard: ReplyKeyboard = {
      keyboard: [['🚀 Почати реєстрацію']],
      resize_keyboard: true,
      one_time_keyboard: true
    };

    await this.sendMessage(chatId, 
      '🌟 **Привіт зірочка!**\n\n' +
      'Я бот-помічник розроблений твоїм HR. Вона створила мене, щоб полегшити і автоматизувати процеси. Я точно стану тобі в нагоді.\n\n' +
      'Почну з того, що прошу тебе зареєструватися. Це потрібно, аби надалі я міг допомагати тобі.',
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  }

  private async sendRegisteredWelcomeMessage(chatId: number, userData: any): Promise<void> {
    await this.sendMessage(chatId, 
      '🎉 **Супер, тепер ми знайомі трошки більше!**\n\n' +
      'Тепер ти можеш ознайомитися з моїм функціоналом. Я допоможу тобі з:\n\n' +
      '• 🏖️ Плануванням відпусток\n' +
      '• ⏰ Відміткою спізнень\n' +
      '• 🏠 Заявками на remote роботу\n' +
      '• 🏥 Лікарняними\n' +
      '• 📊 Переглядом звітів\n' +
      '• 💡 Подачею пропозицій\n' +
      '• 🚨 Терміновими запитами\n\n' +
      'Якщо будуть питання, звертайся до HR!'
    );
  }

  private async showMainMenu(chatId: number): Promise<void> {
    const keyboard: ReplyKeyboard = {
      keyboard: [
        ['🏖️ Відпустка', '⏰ Спізнення'],
        ['🏠 Remote', '🏥 Лікарняний'],
        ['📊 Звіти', '💡 Пропозиції'],
        ['🚨 ASAP', '🎂 Дні народження'],
        ['📋 Опитування', '👤 Профіль'],
        ['🆘 Допомога']
      ],
      resize_keyboard: true
    };

    await this.sendMessage(chatId, 
      '🏠 **Головне меню HR Бота**\n\n' +
      'Оберіть потрібну функцію:',
      { reply_markup: keyboard }
    );
  }

  // 🔧 PLACEHOLDER METHODS (to be implemented)
  private async handleLateArrival(message: TelegramMessage, user: User): Promise<void> {
    await this.sendMessage(message.chat.id, '⏰ Функція спізнень в розробці...');
  }

  private async handleRemoteWork(message: TelegramMessage, user: User): Promise<void> {
    await this.sendMessage(message.chat.id, '🏠 Функція remote роботи в розробці...');
  }

  private async handleSickLeave(message: TelegramMessage, user: User): Promise<void> {
    await this.sendMessage(message.chat.id, '🏥 Функція лікарняних в розробці...');
  }

  private async handleReports(message: TelegramMessage, user: User): Promise<void> {
    await this.sendMessage(message.chat.id, '📊 Функція звітів в розробці...');
  }

  private async handleSuggestions(message: TelegramMessage, user: User): Promise<void> {
    await this.sendMessage(message.chat.id, '💡 Функція пропозицій в розробці...');
  }

  private async handleASAPRequest(message: TelegramMessage, user: User): Promise<void> {
    await this.sendMessage(message.chat.id, '🚨 Функція ASAP запитів в розробці...');
  }

  private async handleBirthdays(message: TelegramMessage, user: User): Promise<void> {
    await this.sendMessage(message.chat.id, '🎂 Функція днів народження в розробці...');
  }

  private async handleSurveys(message: TelegramMessage, user: User): Promise<void> {
    await this.sendMessage(message.chat.id, '📋 Функція опитувань в розробці...');
  }

  private async showUserProfile(chatId: number, user: User): Promise<void> {
    await this.sendMessage(chatId, 
      `👤 **Ваш профіль**\n\n` +
      `**Ім'я:** ${user.fullName}\n` +
      `**Відділ:** ${user.department}\n` +
      `**Команда:** ${user.team}\n` +
      `**Посада:** ${user.position}\n` +
      `**Дата народження:** ${user.birthDate.toLocaleDateString()}\n` +
      `**Початок роботи:** ${user.firstWorkDay.toLocaleDateString()}\n` +
      `**Режим роботи:** ${user.workMode}`
    );
  }

  private async showHelp(chatId: number): Promise<void> {
    await this.sendMessage(chatId, 
      '🆘 **Допомога**\n\n' +
      'Якщо у вас виникли питання або проблеми, зверніться до HR менеджера.\n\n' +
      '**Основні команди:**\n' +
      '/start - Головне меню\n' +
      '🏠 Головна - Повернутися до головного меню'
    );
  }

  private async processCallbackQuery(callbackQuery: any): Promise<void> {
    // Handle callback queries from inline keyboards
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    try {
      switch (data) {
        case 'main_menu':
          await this.showMainMenu(chatId);
          break;
        case 'vacation_plan':
          await this.sendMessage(chatId, 'Введіть дату початку відпустки (ДД.ММ.РРРР):');
          break;
        default:
          await this.sendMessage(chatId, 'Функція в розробці...');
      }
    } catch (error) {
      this.logger.error('Error processing callback query', { data, error: error.message });
    }
  }

  // 🔧 GOOGLE SHEETS METHODS (placeholders)
  private async saveUserToSheets(user: User): Promise<void> {
    // Implementation for saving user to Google Sheets
    this.logger.info('User saved to sheets', { userId: user.telegramId });
  }

  private async loadUserFromSheets(userId: number): Promise<User | undefined> {
    // Implementation for loading user from Google Sheets
    return undefined;
  }

  private async saveVacationRequest(request: VacationRequest): Promise<void> {
    // Implementation for saving vacation request to Google Sheets
    this.logger.info('Vacation request saved to sheets', { requestId: request.requestId });
  }

  private async checkVacationConflicts(startDate: Date, endDate: Date, department: string, team: string): Promise<any[]> {
    // Implementation for checking vacation conflicts
    return [];
  }

  private async getVacationBalance(userId: number): Promise<any> {
    // Implementation for getting vacation balance
    return { remainingDays: 24, usedDays: 0, totalDays: 24 };
  }

  private async notifyPMAboutVacationRequest(request: VacationRequest, user: User): Promise<void> {
    // Implementation for notifying PM
    this.logger.info('PM notified about vacation request', { requestId: request.requestId });
  }

  private async notifyHRAboutVacationRequest(request: VacationRequest, user: User): Promise<void> {
    // Implementation for notifying HR
    this.logger.info('HR notified about vacation request', { requestId: request.requestId });
  }
}

// 🚀 START THE BOT
const hrBot = new HRBot();

// 🛡️ ERROR HANDLING
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

export default HRBot;
