/**
 * 🏢 HR БОТ - МОДУЛЬНА ВЕРСІЯ
 * Оптимізована версія з розділенням на модулі для покращення продуктивності
 */

// Імпорт модулів
const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const CacheWithTTL = require('./utils/cache');
const { AppError } = require('./utils/errors');
const SheetsService = require('./services/sheets.service');
const TelegramService = require('./services/telegram.service');
const UserService = require('./services/user.service');

// Перевірка конфігурації
if (!config.BOT_TOKEN) {
  logger.error('BOT_TOKEN не встановлено!');
  process.exit(1);
}

// Ініціалізація сервісів
const telegramService = new TelegramService(config.BOT_TOKEN);
const sheetsService = new SheetsService();
const userService = new UserService(sheetsService);

// Кеші
const processedUpdates = new CacheWithTTL(
  config.CACHE.PROCESSED_UPDATES.maxSize,
  config.CACHE.PROCESSED_UPDATES.ttl
);
const registrationCache = new CacheWithTTL(
  config.CACHE.REGISTRATION_CACHE.maxSize,
  config.CACHE.REGISTRATION_CACHE.ttl
);

// Express app
const app = express();
app.use(express.json());

// Health check endpoints
app.get('/', (req, res) => {
  const userAgent = req.get('User-Agent') || '';
  const isRailwayHealth = userAgent.includes('Railway') || userAgent.includes('railway');
  
  logger.info('Health check request', { 
    userAgent, 
    isRailwayHealth, 
    ip: req.ip,
    url: req.url 
  });
  
  if (isRailwayHealth) {
    return res.status(200).json({
      status: 'OK',
      message: 'HR Bot Modular is running',
      timestamp: new Date().toISOString(),
      version: '3.0.0-modular',
      sheets_connected: sheetsService.isInitialized,
      uptime: process.uptime()
    });
  }
  
  res.status(200).json({
    status: 'OK',
    message: 'HR Bot Modular is running',
    timestamp: new Date().toISOString(),
    version: '3.0.0-modular',
    sheets_connected: sheetsService.isInitialized,
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Webhook endpoint - оптимізований для швидкої відповіді
app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  
  // Швидко відповідаємо Telegram
  res.status(200).send('OK');
  
  try {
    const update = req.body;
    
    if (!update || !update.update_id) {
      logger.warn('Порожній або невалідний update');
      return;
    }
    
    // Перевірка на дублювання
    const updateIdStr = String(update.update_id);
    if (processedUpdates.has(updateIdStr)) {
      logger.warn('Дублікат update_id', { updateId: updateIdStr });
      return;
    }
    
    processedUpdates.set(updateIdStr, true);
    
    // Ліниве завантаження handlers тільки коли потрібно
    let messageHandler, callbackHandler;
    
    // Обробка повідомлення (асинхронно, неблокуюче)
    if (update.message) {
      // Ліниве завантаження handler
      if (!messageHandler) {
        messageHandler = require('./handlers/message.handler');
      }
      
      const message = update.message;
      logger.info('Обробка повідомлення', { 
        from_id: message.from?.id,
        text: message.text?.substring(0, 50)
      });
      
      messageHandler.handleMessage(
        message,
        {
          telegramService,
          userService,
          sheetsService,
          registrationCache,
          config,
          bot: telegramService.bot
        }
      ).catch(error => {
        logger.error('Помилка обробки повідомлення', error, {
          chat_id: message.chat?.id,
          from_id: message.from?.id,
          text: message.text?.substring(0, 100)
        });
      });
    } else if (update.callback_query) {
      // Ліниве завантаження handler
      if (!callbackHandler) {
        callbackHandler = require('./handlers/callback.handler');
      }
      
      const callback = update.callback_query;
      logger.info('Обробка callback', { 
        from_id: callback.from?.id,
        data: callback.data
      });
      
      callbackHandler.handleCallback(
        callback,
        {
          telegramService,
          userService,
          sheetsService,
          registrationCache,
          config,
          bot: telegramService.bot
        }
      ).catch(error => {
        logger.error('Помилка обробки callback', error);
      });
    } else {
      logger.warn('Невідомий тип update', { keys: Object.keys(update) });
    }
    
    const duration = Date.now() - startTime;
    logger.info(`Webhook оброблено`, { duration: `${duration}ms` });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Webhook error', error, { duration: `${duration}ms` });
  }
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

// Запуск сервера
async function startServer() {
  try {
    // Запуск сервера
    const server = app.listen(config.PORT, '0.0.0.0', () => {
      logger.success(`HR Bot Modular запущено на порту ${config.PORT}`);
      logger.info(`Health check: http://localhost:${config.PORT}/`);
      logger.info(`Webhook: ${config.WEBHOOK_URL || 'не встановлено'}`);
    });
    
    server.on('error', (error) => {
      logger.error('Помилка сервера', error);
    });
    
    // Ініціалізація Google Sheets в фоні (неблокуюче)
    sheetsService.initialize().catch(error => {
      logger.error('Помилка ініціалізації Google Sheets', error);
      logger.info('Спробуємо знову через 30 секунд...');
      setTimeout(() => sheetsService.initialize(), 30000);
    });
    
    // Встановлення webhook в фоні (неблокуюче)
    if (config.WEBHOOK_URL) {
      const webhookUrl = `${config.WEBHOOK_URL}/webhook`;
      logger.info('Встановлення webhook', { webhookUrl });
      
      telegramService.setWebhook(webhookUrl)
        .then(() => {
          logger.success('Webhook встановлено успішно', { webhookUrl });
          return telegramService.getBotInfo();
        })
        .then(botInfo => {
          logger.info('Bot info', { username: botInfo.username });
        })
        .catch(error => {
          logger.error('Помилка встановлення webhook', error);
        });
    } else {
      logger.warn('WEBHOOK_URL не встановлено в environment variables!');
      logger.warn('Бот не зможе отримувати повідомлення без webhook!');
    }
    
    // Моніторинг кешу (кожні 10 хвилин)
    setInterval(() => {
      logger.info('Кеш статистика', {
        registrationCache: registrationCache.size(),
        processedUpdates: processedUpdates.size()
      });
    }, 10 * 60 * 1000);
    
  } catch (error) {
    logger.error('Помилка запуску сервера', error);
  }
}

// Глобальна обробка помилок
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', reason, { 
    promise: promise.toString(),
    stack: reason?.stack 
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception - Critical Error', error, {
    stack: error.stack,
    memory: process.memoryUsage()
  });
  
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Запуск
startServer();

logger.success('HR Bot Modular server started successfully');
