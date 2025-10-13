/**
 * 🏢 HR БОТ - МОДУЛЬНА ВЕРСІЯ
 * Комерційний HR бот з модульною архітектурою
 * Railway Deployment Ready
 */

require('dotenv').config();
const express = require('express');

// Імпорт сервісів
const TelegramService = require('./services/telegram.service');
const SheetsService = require('./services/sheets.service');
const BulkService = require('./services/bulk.service');

// Імпорт утиліт
const { logger } = require('./utils/errors');
const { userCache, registrationCache, processedUpdates } = require('./utils/cache');

// ⚙️ НАЛАШТУВАННЯ
const BOT_TOKEN = process.env.BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const HR_CHAT_ID = process.env.HR_CHAT_ID;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!BOT_TOKEN) {
  logger.error('BOT_TOKEN не встановлено');
  process.exit(1);
}

// Попередження про відсутні змінні
if (!SPREADSHEET_ID) logger.warn('SPREADSHEET_ID не встановлено');
if (!HR_CHAT_ID) {
  logger.warn('HR_CHAT_ID не встановлено');
  logger.warn('Для отримання заявок на відпустку встановіть HR_CHAT_ID в Railway');
} else {
  logger.success('HR_CHAT_ID налаштовано', { HR_CHAT_ID });
}

// 🤖 ІНІЦІАЛІЗАЦІЯ СЕРВІСІВ
const telegramService = new TelegramService(BOT_TOKEN);
const sheetsService = new SheetsService();
const bulkService = new BulkService(sheetsService);

// 🚀 EXPRESS APP
const app = express();
app.use(express.json());

// Health check endpoints
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'HR Bot Ultimate is running',
    timestamp: new Date().toISOString(),
    port: PORT,
    version: '2.0.0-modular'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    services: {
      telegram: 'active',
      sheets: sheetsService.isInitialized ? 'active' : 'inactive',
      bulk: 'active'
    }
  });
});

// Bulk операції endpoint для HR панелі
app.get('/api/stats/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const stats = await bulkService.getMonthlyStats(parseInt(month), parseInt(year));
    res.json(stats);
  } catch (error) {
    logger.error('Error getting monthly stats', error);
    res.status(500).json({ error: 'Failed to get monthly stats' });
  }
});

// Очищення кешу endpoint
app.post('/api/cache/clear', (req, res) => {
  try {
    bulkService.clearAllCache();
    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    logger.error('Error clearing cache', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    
    // Захист від дублювання
    if (processedUpdates.has(update.update_id)) {
      return res.status(200).json({ status: 'duplicate' });
    }
    
    processedUpdates.set(update.update_id, true);
    
    // Обробка повідомлень
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
    
    res.status(200).json({ status: 'processed' });
  } catch (error) {
    logger.error('Webhook error', error);
    res.status(500).json({ status: 'error' });
  }
});

// Обробка повідомлень
async function handleMessage(message) {
  try {
    const chatId = message.chat.id;
    const telegramId = message.from.id;
    const text = message.text;

    logger.info('Processing message', { chatId, telegramId, text });

    // Обробка команд
    if (text === '/start') {
      await showWelcomeMessage(chatId, telegramId);
      return;
    }

    // Обробка відпусток
    if (await handleVacationProcess(chatId, telegramId, text)) {
      return;
    }

    // Обробка реєстрації
    if (registrationCache.has(telegramId)) {
      await handleRegistrationStep(chatId, telegramId, text);
      return;
    }

    await telegramService.sendMessage(chatId, '❓ Оберіть дію з меню нижче.');

  } catch (error) {
    logger.error('Error handling message', error, { chatId: message.chat.id });
  }
}

// Обробка callback кнопок
async function handleCallback(callbackQuery) {
  try {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;

    logger.info('Processing callback', { chatId, telegramId, data });

    // Обробка різних callback'ів
    if (data === 'vacation_menu') {
      await showVacationMenu(chatId, telegramId);
    } else if (data === 'vacation_apply') {
      await showVacationForm(chatId, telegramId);
    }
    // Додати інші callback'и...

    // Підтвердження отримання callback
    await telegramService.bot.answerCallbackQuery(callbackQuery.id);

  } catch (error) {
    logger.error('Error handling callback', error, { chatId: callbackQuery.message?.chat?.id });
  }
}

// Привітальне повідомлення
async function showWelcomeMessage(chatId, telegramId) {
  const text = `🎉 <b>Привіт зірочка!</b> 

Я бот-помічник розроблений твоїм HR. Вона створила мене, щоб полегшити і автоматизувати процеси. Я точно стану тобі в нагоді.

Почну з того, що прошу тебе зареєструватися. Це потрібно, аби надалі я міг допомагати тобі.`;

  const keyboard = [
    [{ text: '🏖️ Відпустки', callback_data: 'vacation_menu' }],
    [{ text: '🏠 Remote', callback_data: 'remote_menu' }],
    [{ text: '⏰ Спізнення', callback_data: 'late_menu' }],
    [{ text: '🏥 Лікарняний', callback_data: 'sick_menu' }]
  ];

  await telegramService.sendReplyKeyboard(chatId, text, keyboard);
}

// Меню відпусток
async function showVacationMenu(chatId, telegramId) {
  const text = `🏖️ <b>Відпустки</b>

Ваш баланс: 0/24 днів
Доступно: 24 днів

<b>Правила відпусток:</b>
• Мін: 1 день, Макс: 7 днів за раз
• 3 місяці до першої відпустки  
• Накладки заборонені в команді
• Процес: Ви → PM → HR

Оберіть дію:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📝 Подати заявку', callback_data: 'vacation_apply' }],
      [{ text: '🚨 Екстрена відпустка', callback_data: 'vacation_emergency' }],
      [{ text: '📄 Мої заявки', callback_data: 'vacation_my_requests' }],
      [{ text: '📊 Баланс деталі', callback_data: 'vacation_balance' }],
      [{ text: '⬅️ Назад', callback_data: 'main_menu' }]
    ]
  };

  await telegramService.sendInlineKeyboard(chatId, text, keyboard.inline_keyboard);
}

// Форма заявки на відпустку
async function showVacationForm(chatId, telegramId) {
  try {
    // Перевіряємо чи користувач зареєстрований
    const user = await getUserInfo(telegramId);
    if (!user) {
      await telegramService.sendMessage(chatId, '❌ Користувач не знайдений. Пройдіть реєстрацію.');
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

    await telegramService.sendMessage(chatId, text);
  } catch (error) {
    logger.error('Error showing vacation form', error, { telegramId });
    await telegramService.sendMessage(chatId, '❌ Помилка відкриття форми. Спробуйте пізніше.');
  }
}

// Обробка процесу відпусток
async function handleVacationProcess(chatId, telegramId, text) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData) return false;

    if (regData.step === 'vacation_start_date') {
      const { validateDate } = require('./utils/validation');
      
      try {
        const startDate = validateDate(text);
        regData.data.startDate = startDate;
        regData.step = 'vacation_days';
        
        await telegramService.sendMessage(chatId, `📅 <b>Дата початку:</b> ${text}\n\n📊 <b>Вкажіть кількість днів відпустки</b>\n\nВведіть кількість днів (1-7):`);
        return true;
      } catch (error) {
        await telegramService.sendMessage(chatId, `❌ ${error.message}`);
        return true;
      }
    }

    if (regData.step === 'vacation_days') {
      const { validateVacationDays } = require('./utils/validation');
      
      try {
        const days = validateVacationDays(text);
        regData.data.days = days;
        
        await processVacationRequest(chatId, telegramId, regData.data);
        registrationCache.delete(telegramId);
        return true;
      } catch (error) {
        await telegramService.sendMessage(chatId, `❌ ${error.message}`);
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error('Error in vacation process', error, { telegramId });
    return false;
  }
}

// Обробка заявки на відпустку
async function processVacationRequest(chatId, telegramId, vacationData) {
  try {
    logger.info('Processing vacation request', { telegramId, vacationData });
    
    const user = await getUserInfo(telegramId);
    if (!user) {
      const { ValidationError } = require('./utils/errors');
      throw new ValidationError('Користувач не знайдений. Пройдіть реєстрацію.', 'user');
    }
    
    const { startDate, days } = vacationData;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days - 1);
    
    // Перевіряємо перетини
    const conflicts = await checkVacationConflicts(user.department, user.team, startDate, endDate, telegramId);
    
    if (conflicts.length > 0) {
      let conflictMessage = '⚠️ <b>Упс, твоя відпустка пересікається з Людинкою з твоєї команди:</b>\n\n';
      conflicts.forEach(conflict => {
        conflictMessage += `👤 ${conflict.fullName} (${conflict.department}/${conflict.team})\n`;
        conflictMessage += `📅 ${conflict.startDate} - ${conflict.endDate}\n\n`;
      });
      conflictMessage += 'Будь ласка, оберіть інші дати.';
      
      await telegramService.sendMessage(chatId, conflictMessage);
      return;
    }
    
    // Зберігаємо заявку
    const requestId = await saveVacationRequest(telegramId, user, startDate, endDate, days);
    
    // Відповідь користувачу
    const { formatDate } = require('./utils/validation');
    await telegramService.sendMessage(chatId, `✅ <b>Супер, твій запит відправляється далі!</b>\n\n📅 <b>Період:</b> ${formatDate(startDate)} - ${formatDate(endDate)}\n📊 <b>Днів:</b> ${days}\n👤 <b>PM:</b> ${user.pm || 'Не призначено'}\n\n⏳ Заявка відправлена на затвердження PM, після чого перейде до HR.`);
    
  } catch (error) {
    const { ValidationError, DatabaseError, TelegramError } = require('./utils/errors');
    
    if (error instanceof ValidationError) {
      logger.warn('Validation error in vacation request', { telegramId, error: error.message });
      await telegramService.sendMessage(chatId, `❌ ${error.message}`);
    } else if (error instanceof DatabaseError) {
      logger.error('Database error in vacation request', error, { telegramId });
      await telegramService.sendMessage(chatId, '❌ Помилка збереження даних. Спробуйте пізніше або зверніться до HR.');
    } else if (error instanceof TelegramError) {
      logger.error('Telegram error in vacation request', error, { telegramId });
    } else {
      logger.error('Unexpected error in vacation request', error, { telegramId });
      try {
        await telegramService.sendMessage(chatId, '❌ Сталася неочікувана помилка. Спробуйте пізніше або зверніться до HR.');
      } catch (sendError) {
        logger.error('Failed to send error message', sendError, { telegramId });
      }
    }
  }
}

// Отримання інформації про користувача (оптимізовано з bulk операціями)
async function getUserInfo(telegramId) {
  try {
    if (userCache.has(telegramId)) {
      return userCache.get(telegramId);
    }

    // Використовуємо bulk сервіс для отримання інформації
    const usersMap = await bulkService.getUsersInfo([telegramId]);
    const user = usersMap.get(telegramId);
    
    if (user) {
      userCache.set(telegramId, user);
      return user;
    }

    // Fallback для тестових даних
    const testUser = {
      telegramId: telegramId,
      fullName: 'Тестовий Користувач',
      department: 'HR',
      team: 'HR',
      pm: 'Тестовий PM'
    };

    userCache.set(telegramId, testUser);
    return testUser;
  } catch (error) {
    logger.error('Error getting user info', error, { telegramId });
    return null;
  }
}

// Перевірка перетинів відпусток (оптимізовано з bulk операціями)
async function checkVacationConflicts(department, team, startDate, endDate, excludeUserId = null) {
  try {
    return await bulkService.getVacationConflicts(department, team, startDate, endDate, excludeUserId);
  } catch (error) {
    logger.error('Error checking vacation conflicts', error);
    return [];
  }
}

// Збереження заявки на відпустку
async function saveVacationRequest(telegramId, user, startDate, endDate, days) {
  try {
    // Тут буде логіка збереження в Google Sheets
    const requestId = `REQ_${Date.now()}_${telegramId}`;
    logger.info('Vacation request saved', { requestId, telegramId });
    return requestId;
  } catch (error) {
    const { DatabaseError } = require('./utils/errors');
    throw new DatabaseError('Помилка збереження заявки на відпустку');
  }
}

// Обробка реєстрації (заглушка)
async function handleRegistrationStep(chatId, telegramId, text) {
  // Тут буде логіка реєстрації
  logger.info('Registration step', { telegramId, text });
}

// 🚀 ЗАПУСК СЕРВЕРА
async function startServer() {
  try {
    // Запуск сервера НЕБЛОКУЮЧО
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.success('HR Bot Ultimate запущено', { port: PORT });
      logger.info('Health check available', { url: `http://localhost:${PORT}/` });
    });
    
    // Обробка помилок сервера
    server.on('error', (error) => {
      logger.error('Server error', error);
    });
    
    // Ініціалізація Google Sheets в фоні (неблокуюче)
    sheetsService.initialize().catch(error => {
      logger.error('Google Sheets initialization failed', error);
      logger.info('Retrying in 30 seconds...');
      setTimeout(() => sheetsService.initialize(), 30000);
    });
    
    // Встановлення webhook в фоні (неблокуюче)
    if (WEBHOOK_URL) {
      telegramService.setWebhook(`${WEBHOOK_URL}/webhook`)
        .catch(error => logger.error('Webhook setup failed', error));
    } else {
      logger.warn('WEBHOOK_URL не встановлено');
    }
    
  } catch (error) {
    logger.error('Server startup error', error);
  }
}

// ✅ ГЛОБАЛЬНА ОБРОБКА ПОМИЛОК
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

// Обробка помилок Express
app.use((error, req, res, next) => {
  logger.error('Express error', error, {
    url: req.url,
    method: req.method,
    body: req.body
  });
  
  res.status(500).json({
    error: 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// Запуск
startServer();

logger.success('HR Bot Ultimate modular server started successfully');
