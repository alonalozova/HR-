/**
 * 🏢 HR БОТ - RAILWAY DEPLOYMENT VERSION (FIXED)
 * ⚡ Виправлена версія з правильною аутентифікацією Google Sheets
 */

require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// ⚙️ НАЛАШТУВАННЯ З ENVIRONMENT VARIABLES
const BOT_TOKEN = process.env.BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const HR_CHAT_ID = process.env.HR_CHAT_ID;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Перевірка обов'язкових змінних
if (!BOT_TOKEN || !SPREADSHEET_ID || !HR_CHAT_ID) {
  console.error('❌ Відсутні обов\'язкові environment variables!');
  process.exit(1);
}

// 🤖 ІНІЦІАЛІЗАЦІЯ БОТА
const bot = new TelegramBot(BOT_TOKEN);
const app = express();

// 📊 ІНІЦІАЛІЗАЦІЯ GOOGLE SHEETS (ВИПРАВЛЕНО)
let doc;
async function initGoogleSheets() {
  try {
    // Створюємо JWT client для аутентифікації
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });
    
    // Ініціалізуємо документ з аутентифікацією
    doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    
    await doc.loadInfo();
    console.log('✅ Google Sheets підключено:', doc.title);
    
    return true;
    
  } catch (error) {
    console.error('❌ Помилка підключення до Google Sheets:', error);
    return false;
  }
}

// 🛡️ ЗАХИСТ ВІД ДУБЛЮВАННЯ
const processedUpdates = new Set();
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 хвилин

// Очищення кешу кожні 5 хвилин
setInterval(() => {
  processedUpdates.clear();
  console.log('🧹 Кеш очищено');
}, CACHE_CLEANUP_INTERVAL);

// 🚀 EXPRESS MIDDLEWARE
app.use(express.json());

// 📍 HEALTH CHECK ENDPOINT
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'HR Bot is running',
    timestamp: new Date().toISOString(),
    version: '1.0.1-fixed',
    sheets_connected: doc ? true : false
  });
});

// 📨 WEBHOOK ENDPOINT
app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    const updateId = update.update_id;
    
    // Швидка відповідь Telegram
    res.status(200).send('OK');
    
    // Перевірка дублікатів
    if (processedUpdates.has(updateId)) {
      console.log(`⚠️ Дублікат update ${updateId} проігноровано`);
      return;
    }
    
    processedUpdates.add(updateId);
    
    // Обробка повідомлення
    if (update.message) {
      await processMessage(update.message);
    } else if (update.callback_query) {
      await processCallback(update.callback_query);
    }
    
  } catch (error) {
    console.error('💥 Помилка обробки webhook:', error);
  }
});

// 📨 ОБРОБКА ПОВІДОМЛЕНЬ
async function processMessage(message) {
  try {
    const chatId = message.chat.id;
    const text = message.text || '';
    const telegramId = message.from.id;
    
    console.log(`📨 Повідомлення від ${telegramId}: ${text}`);
    
    if (text === '/start') {
      await showMainMenu(chatId, telegramId);
      return;
    }
    
  } catch (error) {
    console.error('Помилка processMessage:', error);
    await sendMessage(chatId, '❌ Виникла помилка. Спробуйте пізніше.');
  }
}

// 🎛️ ОБРОБКА CALLBACK ЗАПИТІВ
async function processCallback(callback) {
  try {
    const chatId = callback.message.chat.id;
    const data = callback.data;
    const telegramId = callback.from.id;
    
    console.log(`🎛️ Callback від ${telegramId}: ${data}`);
    
    // Підтверджуємо callback
    await bot.answerCallbackQuery(callback.id);
    
    // Маршрутизація
    if (data === 'main_menu' || data === 'start_command' || data === 'back_main') {
      await showMainMenu(chatId, telegramId);
    } else {
      await sendMessage(chatId, `Функція "${data}" в розробці. Повний функціонал буде додано найближчим часом! 🚀`);
    }
    
  } catch (error) {
    console.error('Помилка processCallback:', error);
  }
}

// 📤 ВІДПРАВКА ПОВІДОМЛЕННЯ
async function sendMessage(chatId, text, keyboard = null) {
  try {
    const options = {
      parse_mode: 'HTML'
    };
    
    if (keyboard) {
      options.reply_markup = keyboard;
    }
    
    await bot.sendMessage(chatId, text, options);
    
  } catch (error) {
    console.error('Помилка sendMessage:', error);
  }
}

// 📋 ГОЛОВНЕ МЕНЮ
async function showMainMenu(chatId, telegramId) {
  const welcomeText = `👋 <b>Привіт!</b>

🌟 Я твій HR помічник. Оберіть категорію:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏖️ Відпустки', callback_data: 'vacation_menu' },
        { text: '🏠 Remote', callback_data: 'remote_menu' }
      ],
      [
        { text: '⏰ Спізнення', callback_data: 'late_menu' },
        { text: '🏥 Лікарняний', callback_data: 'sick_menu' }
      ],
      [
        { text: '📊 Моя статистика', callback_data: 'my_stats' },
        { text: '🎯 Онбординг', callback_data: 'onboarding_menu' }
      ],
      [
        { text: '💬 Пропозиції', callback_data: 'suggestions_menu' },
        { text: '🚨 ASAP запит', callback_data: 'asap_request' }
      ],
      [
        { text: '❓ FAQ', callback_data: 'faq_menu' },
        { text: '🤖 ШІ-Помічник', callback_data: 'ai_assistant' }
      ],
      [
        { text: '🏠 /start', callback_data: 'start_command' },
        { text: '🔄 Оновити меню', callback_data: 'main_menu' }
      ]
    ]
  };

  await sendMessage(chatId, welcomeText, keyboard);
}

// 🚀 ЗАПУСК СЕРВЕРА
async function startServer() {
  try {
    // Ініціалізуємо Google Sheets
    const sheetsConnected = await initGoogleSheets();
    
    if (sheetsConnected) {
      console.log('✅ Google Sheets успішно підключено');
    } else {
      console.log('⚠️ Google Sheets не підключено, але сервер продовжує роботу');
    }
    
    // Встановлюємо webhook
    if (WEBHOOK_URL) {
      await bot.setWebHook(`${WEBHOOK_URL}/webhook`);
      console.log('✅ Webhook встановлено:', `${WEBHOOK_URL}/webhook`);
    }
    
    // Запускаємо сервер
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 HR Bot запущено на порту ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/`);
      console.log(`📨 Webhook: ${WEBHOOK_URL}/webhook`);
    });
    
  } catch (error) {
    console.error('❌ Помилка запуску сервера:', error);
    process.exit(1);
  }
}

// Обробка помилок
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Запуск
startServer();

