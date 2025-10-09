/**
 * 🏢 HR БОТ - ПОВНА RAILWAY ВЕРСІЯ З УСІЄЮ ЛОГІКОЮ
 * Портовано з HR_Bot_Complete_Final.js (Google Apps Script → Node.js)
 */

require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// ⚙️ НАЛАШТУВАННЯ
const BOT_TOKEN = process.env.BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const HR_CHAT_ID = process.env.HR_CHAT_ID;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!BOT_TOKEN || !SPREADSHEET_ID || !HR_CHAT_ID) {
  console.error('❌ Відсутні обов\'язкові environment variables!');
  process.exit(1);
}

// 🤖 ІНІЦІАЛІЗАЦІЯ
const bot = new TelegramBot(BOT_TOKEN);
const app = express();
let doc;

// 🛡️ ЗАХИСТ ВІД ДУБЛЮВАННЯ
const processedUpdates = new Set();
setInterval(() => processedUpdates.clear(), 5 * 60 * 1000);

// 💾 КЕШ ДЛЯ ОПТИМІЗАЦІЇ
const userCache = new Map();
const registrationCache = new Map();

// 📊 ІНІЦІАЛІЗАЦІЯ GOOGLE SHEETS
async function initGoogleSheets() {
  try {
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
    console.error('❌ Помилка підключення до Google Sheets:', error);
    return false;
  }
}

// 🚀 EXPRESS
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'HR Bot is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0-complete',
    sheets_connected: doc ? true : false
  });
});

app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    const updateId = update.update_id;
    
    res.status(200).send('OK');
    
    if (processedUpdates.has(updateId)) {
      console.log(`⚠️ Дублікат ${updateId}`);
      return;
    }
    
    processedUpdates.add(updateId);
    
    if (update.message) {
      await processMessage(update.message);
    } else if (update.callback_query) {
      await processCallback(update.callback_query);
    }
  } catch (error) {
    console.error('💥 Помилка webhook:', error);
  }
});

// 📨 ОБРОБКА ПОВІДОМЛЕНЬ
async function processMessage(message) {
  try {
    const chatId = message.chat.id;
    const text = message.text || '';
    const telegramId = message.from.id;
    const username = message.from.username || '';
    const firstName = message.from.first_name || '';
    const lastName = message.from.last_name || '';
    
    console.log(`📨 ${telegramId}: ${text}`);
    
    if (text === '/start') {
      const user = await getUserInfo(telegramId);
      if (!user) {
        await startRegistration(chatId, telegramId, username, firstName, lastName);
      } else {
        await showMainMenu(chatId, telegramId);
      }
      return;
    }
    
    await handleRegistrationInput(chatId, telegramId, text);
  } catch (error) {
    console.error('Помилка processMessage:', error);
  }
}

// 🎛️ ОБРОБКА CALLBACKS
async function processCallback(callback) {
  try {
    const chatId = callback.message.chat.id;
    const data = callback.data;
    const telegramId = callback.from.id;
    
    await bot.answerCallbackQuery(callback.id);
    
    const routes = {
      'vacation_menu': showVacationMenu,
      'remote_menu': showRemoteMenu,
      'late_menu': showLateMenu,
      'sick_menu': showSickMenu,
      'onboarding_menu': showOnboardingMenu,
      'my_stats': showMyStats,
      'faq_menu': showFAQMenu,
      'back_main': showMainMenu,
      'main_menu': showMainMenu,
      'start_command': showMainMenu,
      'start_registration': showRegistrationForm,
      'suggestions_menu': showSuggestionsMenu,
      'asap_request': showASAPForm,
      'ai_assistant': showAIAssistant,
      'analytics_menu': showAnalyticsMenu,
      'hr_panel': showHRPanel,
      'ceo_panel': showCEOPanel,
      'ai_vacation_help': showAIVacationHelp,
      'ai_remote_help': showAIRemoteHelp,
      'ai_late_help': showAILateHelp,
      'ai_sick_help': showAISickHelp,
      'ai_personal_tips': showAIPersonalTips,
    };
    
    if (routes[data]) {
      await routes[data](chatId, telegramId);
    } else {
      await handleSpecificAction(chatId, telegramId, data);
    }
  } catch (error) {
    console.error('Помилка processCallback:', error);
  }
}

// 📤 ВІДПРАВКА ПОВІДОМЛЕННЯ
async function sendMessage(chatId, text, keyboard = null) {
  try {
    const options = { parse_mode: 'HTML' };
    if (keyboard) options.reply_markup = keyboard;
    await bot.sendMessage(chatId, text, options);
  } catch (error) {
    console.error('Помилка sendMessage:', error);
  }
}

// 👤 ОТРИМАННЯ КОРИСТУВАЧА З КЕШУВАННЯМ
async function getUserInfo(telegramId) {
  try {
    // Перевірка кешу
    if (userCache.has(telegramId)) {
      const cached = userCache.get(telegramId);
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return cached.data;
      }
    }
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Employees'];
    if (!sheet) return null;
    
    const rows = await sheet.getRows();
    const user = rows.find(row => row.get('TelegramID') == telegramId);
    
    if (user) {
      const userData = {
        fullName: user.get('FullName'),
        telegramID: user.get('TelegramID'),
        department: user.get('Department'),
        team: user.get('Team'),
        subteam: user.get('Subteam'),
        position: user.get('Position'),
        workFormat: user.get('WorkFormat'),
        birthday: user.get('Birthday'),
        startDate: user.get('StartDate')
      };
      
      userCache.set(telegramId, { data: userData, timestamp: Date.now() });
      return userData;
    }
    
    return null;
  } catch (error) {
    console.error('Помилка getUserInfo:', error);
    return null;
  }
}

// 🔐 ОТРИМАННЯ РОЛІ
async function getUserRole(telegramId) {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Roles'];
    if (!sheet) return 'EMP';
    
    const rows = await sheet.getRows();
    const role = rows.find(row => row.get('TelegramID') == telegramId);
    
    return role ? role.get('Role') : 'EMP';
  } catch (error) {
    console.error('Помилка getUserRole:', error);
    return 'EMP';
  }
}

// 🎯 ПОЧАТОК РЕЄСТРАЦІЇ
async function startRegistration(chatId, telegramId, username, firstName, lastName) {
  const welcomeText = `👋 <b>Привіт зірочка!</b> 🌟

🤖 Я бот-помічник розроблений твоїм HR. Вона створила мене, щоб полегшити і автоматизувати процеси. Я точно стану тобі в нагоді.

📝 Почну з того, що прошу тебе зареєструватися. Це потрібно, аби надалі я міг допомагати тобі.

Натисни кнопку нижче, щоб почати:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📝 Почати реєстрацію', callback_data: 'start_registration' }]
    ]
  };

  await sendMessage(chatId, welcomeText, keyboard);
  registrationCache.set(telegramId, { 
    step: 'start', 
    username, 
    firstName, 
    lastName,
    timestamp: Date.now()
  });
}

// 📋 ГОЛОВНЕ МЕНЮ
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
🤖 <b>ШІ-Помічник:</b> швидкі відповіді та поради

👋 <b>Привіт, ${user?.fullName || 'колега'}!</b>`;

    const baseKeyboard = [
      // Основні робочі функції (найважливіші)
      [
        { text: '🏖️ Відпустки', callback_data: 'vacation_menu' },
        { text: '🏠 Remote', callback_data: 'remote_menu' }
      ],
      [
        { text: '⏰ Спізнення', callback_data: 'late_menu' },
        { text: '🏥 Лікарняний', callback_data: 'sick_menu' }
      ],
      // Додаткові функції
      [
        { text: '📊 Моя статистика', callback_data: 'my_stats' },
        { text: '🎯 Онбординг', callback_data: 'onboarding_menu' }
      ],
      // Довідка та допомога
      [
        { text: '❓ FAQ', callback_data: 'faq_menu' },
        { text: '🤖 ШІ-Помічник', callback_data: 'ai_assistant' }
      ],
      // Менше використовувані функції
      [
        { text: '💬 Пропозиції', callback_data: 'suggestions_menu' },
        { text: '🚨 ASAP запит', callback_data: 'asap_request' }
      ]
    ];

    if (role === 'PM' || role === 'HR' || role === 'CEO') {
      baseKeyboard.push([
        { text: '📋 Затвердження', callback_data: 'approvals_menu' },
        { text: '📈 Аналітика', callback_data: 'analytics_menu' }
      ]);
    }

    if (role === 'HR') {
      baseKeyboard.push([
        { text: '👥 HR Панель', callback_data: 'hr_panel' },
        { text: '📢 Розсилки', callback_data: 'hr_broadcasts' }
      ]);
    }

    if (role === 'CEO') {
      baseKeyboard.push([
        { text: '🏢 CEO Панель', callback_data: 'ceo_panel' }
      ]);
    }

    // Кнопка оновлення прибрана за запитом користувача

    await sendMessage(chatId, welcomeText, { inline_keyboard: baseKeyboard });
  } catch (error) {
    console.error('Помилка showMainMenu:', error);
    await sendMessage(chatId, '❌ Помилка завантаження меню.');
  }
}

// 🏖️ МЕНЮ ВІДПУСТОК
async function showVacationMenu(chatId, telegramId) {
  try {
    const balance = await getVacationBalance(telegramId);
    const canTake = await canTakeVacation(telegramId);
    
    let text = `🏖️ <b>Відпустки</b>\n\n`;
    text += `💰 Ваш баланс: ${balance.remaining}/${balance.annual} днів\n`;
    
    if (!canTake.allowed) {
      text += `⚠️ ${canTake.reason}\n`;
    }
    
    text += `\nОберіть дію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Подати заявку', callback_data: canTake.allowed ? 'vacation_request' : 'vacation_blocked' },
          { text: '🚨 Екстрена відпустка', callback_data: 'vacation_emergency' }
        ],
        [
          { text: '📋 Мої заявки', callback_data: 'vacation_my_requests' },
          { text: '📊 Баланс деталі', callback_data: 'vacation_balance_details' }
        ],
        [
          { text: '🔙 Назад', callback_data: 'back_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('Помилка showVacationMenu:', error);
    await sendMessage(chatId, '❌ Помилка завантаження меню відпусток.');
  }
}

// 📊 ОТРИМАННЯ БАЛАНСУ ВІДПУСТКИ
async function getVacationBalance(telegramId) {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['VacationBalance'];
    if (!sheet) return { annual: 24, used: 0, remaining: 24 };
    
    const rows = await sheet.getRows();
    const currentYear = new Date().getFullYear();
    const balance = rows.find(row => 
      row.get('TelegramID') == telegramId && 
      row.get('Year') == currentYear
    );
    
    if (balance) {
      return {
        annual: parseInt(balance.get('AnnualQuota')) || 24,
        used: parseInt(balance.get('Used')) || 0,
        remaining: parseInt(balance.get('Remaining')) || 24
      };
    }
    
    return { annual: 24, used: 0, remaining: 24 };
  } catch (error) {
    console.error('Помилка getVacationBalance:', error);
    return { annual: 24, used: 0, remaining: 24 };
  }
}

// ✅ ПЕРЕВІРКА МОЖЛИВОСТІ ВІДПУСТКИ
async function canTakeVacation(telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    if (!user?.startDate) {
      return { allowed: false, reason: 'Дата початку роботи не вказана' };
    }
    
    const startDate = new Date(user.startDate);
    const threeMonthsLater = new Date(startDate);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
    
    const now = new Date();
    
    if (now < threeMonthsLater) {
      const daysLeft = Math.ceil((threeMonthsLater - now) / (1000 * 60 * 60 * 24));
      return { 
        allowed: false, 
        reason: `До першої відпустки залишилось ${daysLeft} днів (3 місяці з початку роботи)` 
      };
    }
    
    const balance = await getVacationBalance(telegramId);
    if (balance.remaining <= 0) {
      return { allowed: false, reason: 'Баланс відпустки вичерпано' };
    }
    
    return { allowed: true, reason: '' };
  } catch (error) {
    console.error('Помилка canTakeVacation:', error);
    return { allowed: false, reason: 'Помилка перевірки' };
  }
}

// 🏠 МЕНЮ REMOTE
async function showRemoteMenu(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    const monthStats = await getMonthRemoteStats(telegramId);
    
    let text = `🏠 <b>Remote робота</b>\n\n`;
    text += `👤 ${user?.fullName}\n`;
    text += `💼 Формат роботи: ${user?.workFormat || 'Не вказано'}\n`;
    text += `📊 Цього місяця: ${monthStats.count}/14 днів\n\n`;
    
    if (user?.workFormat === 'Онлайн') {
      text += `✅ Ви працюєте онлайн - remote без обмежень\n`;
    } else if (monthStats.count >= 14) {
      text += `⚠️ Ліміт remote днів вичерпано (14/міс)\n`;
    }
    
    text += `\nОберіть дію:`;

    const canRequestRemote = user?.workFormat === 'Онлайн' || monthStats.count < 14;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📅 Remote сьогодні', callback_data: canRequestRemote ? 'remote_today' : 'remote_limit_reached' },
          { text: '📆 Remote на дату', callback_data: canRequestRemote ? 'remote_date' : 'remote_limit_reached' }
        ],
        [
          { text: '📊 Моя статистика', callback_data: 'remote_my_stats' }
        ],
        [
          { text: '🔙 Назад', callback_data: 'back_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('Помилка showRemoteMenu:', error);
    await sendMessage(chatId, '❌ Помилка завантаження меню remote.');
  }
}

// 📊 СТАТИСТИКА REMOTE ЗА МІСЯЦЬ
async function getMonthRemoteStats(telegramId) {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Remotes'];
    if (!sheet) return { count: 0 };
    
    const rows = await sheet.getRows();
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    const monthRemotes = rows.filter(row => {
      if (row.get('TelegramID') != telegramId) return false;
      const date = new Date(row.get('Date'));
      return date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear;
    });
    
    return { count: monthRemotes.length };
  } catch (error) {
    console.error('Помилка getMonthRemoteStats:', error);
    return { count: 0 };
  }
}

// ⏰ МЕНЮ СПІЗНЕНЬ
async function showLateMenu(chatId, telegramId) {
  try {
    const monthStats = await getMonthLateStats(telegramId);
    
    let text = `⏰ <b>Спізнення</b>\n\n`;
    text += `📊 Цього місяця: ${monthStats.count} разів\n`;
    
    if (monthStats.count >= 7) {
      text += `⚠️ Увага! Перевищено норму спізнень (7/міс)\n`;
    }
    
    text += `\nНа скільки хвилин спізнюєтесь?`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '5 хв', callback_data: 'late_5' },
          { text: '10 хв', callback_data: 'late_10' },
          { text: '15 хв', callback_data: 'late_15' }
        ],
        [
          { text: '30 хв', callback_data: 'late_30' },
          { text: '60+ хв', callback_data: 'late_60' }
        ],
        [
          { text: '📊 Моя статистика', callback_data: 'late_my_stats' }
        ],
        [
          { text: '🔙 Назад', callback_data: 'back_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('Помилка showLateMenu:', error);
    await sendMessage(chatId, '❌ Помилка завантаження меню спізнень.');
  }
}

// 📊 СТАТИСТИКА СПІЗНЕНЬ ЗА МІСЯЦЬ
async function getMonthLateStats(telegramId) {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Lates'];
    if (!sheet) return { count: 0 };
    
    const rows = await sheet.getRows();
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    const monthLates = rows.filter(row => {
      if (row.get('TelegramID') != telegramId) return false;
      const date = new Date(row.get('Date'));
      return date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear;
    });
    
    return { count: monthLates.length };
  } catch (error) {
    console.error('Помилка getMonthLateStats:', error);
    return { count: 0 };
  }
}

// 🏥 МЕНЮ ЛІКАРНЯНОГО
async function showSickMenu(chatId, telegramId) {
  const text = `🏥 <b>Лікарняний</b>\n\nВи захворіли? Зафіксуємо це для HR та вашого PM.\n\nОберіть тип:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🤒 Захворів сьогодні', callback_data: 'sick_today' },
        { text: '📅 Лікарняний на період', callback_data: 'sick_period' }
      ],
      [
        { text: '✅ Одужав, виходжу', callback_data: 'sick_recovery' }
      ],
      [
        { text: '📊 Моя статистика', callback_data: 'sick_my_stats' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

// 📊 МОЯ СТАТИСТИКА
async function showMyStats(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    const vacationBalance = await getVacationBalance(telegramId);
    const remoteStats = await getMonthRemoteStats(telegramId);
    const lateStats = await getMonthLateStats(telegramId);
    
    const currentMonth = new Date().toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    
    let text = `📊 <b>Моя статистика</b>\n\n`;
    text += `👤 ${user?.fullName}\n`;
    text += `💼 ${user?.position}\n`;
    text += `🏢 ${user?.department}`;
    if (user?.team) text += ` / ${user?.team}`;
    text += `\n\n`;
    
    text += `🏖️ <b>Відпустки:</b>\n`;
    text += `💰 Баланс: ${vacationBalance.remaining}/${vacationBalance.annual} днів\n`;
    text += `📅 Використано: ${vacationBalance.used} днів\n\n`;
    
    text += `📈 <b>Статистика за ${currentMonth}:</b>\n`;
    text += `🏠 Remote: ${remoteStats.count} днів`;
    if (user?.workFormat !== 'Онлайн') text += ` (ліміт: 14)`;
    text += `\n`;
    text += `⏰ Спізнення: ${lateStats.count} разів`;
    if (lateStats.count >= 7) text += ` ⚠️`;
    text += `\n`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 Детальна статистика', callback_data: 'detailed_stats' }
        ],
        [
          { text: '🔙 Назад', callback_data: 'back_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('Помилка showMyStats:', error);
    await sendMessage(chatId, '❌ Помилка завантаження статистики.');
  }
}

// ДОДАТКОВІ МЕНЮ (продовжую далі...)
async function showOnboardingMenu(chatId, telegramId) {
  const text = `🎯 <b>Онбординг та навчання</b>

📚 Матеріали для адаптації:
• Notion файл з інформацією
• Відео привітання CEO
• Структура компанії

Оберіть розділ:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📖 Notion матеріали', url: 'https://superficial-sort-084.notion.site/3b5c00ad8a42473bbef49bb26f076ebd' }
      ],
      [
        { text: '🏢 Структура компанії', callback_data: 'company_structure' },
        { text: '📹 Відео матеріали', callback_data: 'onboarding_videos' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

async function showFAQMenu(chatId, telegramId) {
  const text = `❓ <b>FAQ - Часті питання</b>

Оберіть категорію:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏖️ Про відпустки', callback_data: 'faq_vacation' },
        { text: '🏠 Про remote', callback_data: 'faq_remote' }
      ],
      [
        { text: '⏰ Про спізнення', callback_data: 'faq_late' },
        { text: '🏥 Про лікарняний', callback_data: 'faq_sick' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

async function showRegistrationForm(chatId, telegramId) {
  const text = `📝 <b>Реєстрація в системі</b>

Будь ласка, заповніть всі поля для завершення реєстрації:

<b>Крок 1:</b> Введіть ваше прізвище`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Назад', callback_data: 'back_main' }]
    ]
  };

  await sendMessage(chatId, text, keyboard);
  registrationCache.set(telegramId, { 
    ...registrationCache.get(telegramId),
    step: 'surname',
    timestamp: Date.now()
  });
}

async function showSuggestionsMenu(chatId, telegramId) {
  const text = `💬 <b>Пропозиції для покращення</b>

Ваші ідеї важливі для нас! Оберіть тип пропозиції:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📝 Анонімна пропозиція', callback_data: 'suggestion_anonymous' },
        { text: '👤 Іменна пропозиція', callback_data: 'suggestion_named' }
      ],
      [
        { text: '📊 Мої пропозиції', callback_data: 'my_suggestions' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

async function showASAPForm(chatId, telegramId) {
  const user = await getUserInfo(telegramId);
  
  const text = `🚨 <b>ASAP Запит</b>

👤 ${user?.fullName || 'Користувач'}
🏢 ${user?.department || ''}${user?.team ? ' / ' + user.team : ''}

Опишіть вашу проблему, яка потребує негайного вирішення:

<i>Ваше повідомлення буде одразу відправлено HR для розгляду.</i>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Назад', callback_data: 'back_main' }]
    ]
  };

  await sendMessage(chatId, text, keyboard);
  registrationCache.set(telegramId, { 
    step: 'asap_message',
    timestamp: Date.now()
  });
}

async function showAIAssistant(chatId, telegramId) {
  const text = `🤖 <b>ШІ-Помічник</b>

Я можу допомогти вам з:

🔍 <b>Швидкі відповіді:</b>
• Правила відпусток
• Процедури remote роботи
• Політика спізнень
• Лікарняні процедури

💡 <b>Рекомендації:</b>
• Оптимальні дати відпустки
• Планування робочого графіку
• Поради по кар'єрі

❓ Задайте мені будь-яке питання!`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '❓ Про відпустки', callback_data: 'ai_vacation_help' },
        { text: '🏠 Про remote', callback_data: 'ai_remote_help' }
      ],
      [
        { text: '⏰ Про спізнення', callback_data: 'ai_late_help' },
        { text: '🏥 Про лікарняний', callback_data: 'ai_sick_help' }
      ],
      [
        { text: '💡 Персональні поради', callback_data: 'ai_personal_tips' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

async function showAnalyticsMenu(chatId, telegramId) {
  await sendMessage(chatId, '📈 Меню аналітики завантажується...');
}

async function showHRPanel(chatId, telegramId) {
  const role = await getUserRole(telegramId);
  
  if (role !== 'HR') {
    await sendMessage(chatId, '❌ Доступ заборонено. Тільки для HR.');
    return;
  }

  const text = `👥 <b>HR Панель управління</b>

🎛️ Доступні функції в розробці...`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Назад', callback_data: 'back_main' }]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

async function showCEOPanel(chatId, telegramId) {
  await sendMessage(chatId, '🏢 CEO панель в розробці...');
}

async function showAIVacationHelp(chatId, telegramId) {
  const balance = await getVacationBalance(telegramId);
  const canTake = await canTakeVacation(telegramId);
  
  let text = `🏖️ <b>ШІ-Помічник: Відпустки</b>\n\n`;
  text += `💰 Ваш баланс: ${balance.remaining}/${balance.annual} днів\n\n`;
  text += `📋 <b>Правила:</b>\n`;
  text += `• Мін: 1 день, Макс: 7 днів за раз\n`;
  text += `• Перша відпустка через 3 місяці\n`;
  text += `• Річний ліміт: 24 дні\n\n`;
  
  if (!canTake.allowed) {
    text += `⚠️ ${canTake.reason}`;
  }

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🔙 Назад до ШІ', callback_data: 'ai_assistant' },
        { text: '🏠 Головне меню', callback_data: 'main_menu' }
      ]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

async function showAIRemoteHelp(chatId, telegramId) {
  await sendMessage(chatId, '🏠 ШІ допомога по remote завантажується...');
}

async function showAILateHelp(chatId, telegramId) {
  await sendMessage(chatId, '⏰ ШІ допомога по спізненням завантажується...');
}

async function showAISickHelp(chatId, telegramId) {
  await sendMessage(chatId, '🏥 ШІ допомога по лікарняному завантажується...');
}

async function showAIPersonalTips(chatId, telegramId) {
  await sendMessage(chatId, '💡 ШІ персональні поради завантажуються...');
}

async function handleRegistrationInput(chatId, telegramId, text) {
  // В розробці
}

async function handleSpecificAction(chatId, telegramId, action) {
  try {
    if (action.startsWith('late_')) {
      const minutes = action.split('_')[1];
      await processLateReport(chatId, telegramId, minutes);
    } else if (action === 'remote_today') {
      await processRemoteToday(chatId, telegramId);
    } else if (action === 'remote_date') {
      await sendMessage(chatId, '📅 Вибор дати для remote в розробці');
    } else if (action === 'sick_today') {
      await processSickToday(chatId, telegramId);
    } else if (action === 'vacation_request') {
      await sendMessage(chatId, '📝 Подача заявки на відпустку в розробці');
    } else if (action === 'vacation_emergency') {
      await processEmergencyVacation(chatId, telegramId);
    } else {
      await sendMessage(chatId, `Функція "${action}" в розробці`);
    }
  } catch (error) {
    console.error('Помилка handleSpecificAction:', error);
    await sendMessage(chatId, '❌ Помилка обробки запиту');
  }
}

async function processLateReport(chatId, telegramId, minutes) {
  try {
    const user = await getUserInfo(telegramId);
    const today = new Date().toISOString().split('T')[0];
    
    // Записуємо в Google Sheets
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Lates'];
    if (sheet) {
      await sheet.addRow({
        EntryID: `L_${Date.now()}`,
        TelegramID: telegramId,
        FullName: user?.fullName,
        Department: user?.department,
        Team: user?.team,
        Date: today,
        MinutesLate: minutes,
        Reason: 'Повідомлено через бот',
        MonthCount: (await getMonthLateStats(telegramId)).count + 1,
        CreatedAt: new Date().toISOString()
      });
    }
    
    const monthStats = await getMonthLateStats(telegramId);
    let text = `✅ Спізнення на ${minutes} хв зафіксовано!\n`;
    text += `📊 Цього місяця: ${monthStats.count + 1} разів`;
    
    if (monthStats.count + 1 >= 7) {
      text += `\n⚠️ Увага! Перевищено норму спізнень (7/міс)`;
    }
    
    await sendMessage(chatId, text);
    
    // Повідомляємо HR
    const hrMessage = `⏰ <b>Спізнення</b>\n\n👤 ${user?.fullName}\n🏢 ${user?.department}\n📅 ${today}\n⏱️ ${minutes} хв\n📊 Цього місяця: ${monthStats.count + 1}`;
    await sendMessage(HR_CHAT_ID, hrMessage);
    
  } catch (error) {
    console.error('Помилка processLateReport:', error);
    await sendMessage(chatId, '❌ Помилка фіксації спізнення.');
  }
}

// 🏠 REMOTE СЬОГОДНІ
async function processRemoteToday(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    const today = new Date().toISOString().split('T')[0];
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Remotes'];
    if (sheet) {
      await sheet.addRow({
        EntryID: `R_${Date.now()}`,
        TelegramID: telegramId,
        FullName: user?.fullName,
        Department: user?.department,
        Team: user?.team,
        Date: today,
        CreatedAt: new Date().toISOString()
      });
    }
    
    await sendMessage(chatId, '✅ Remote робота на сьогодні зафіксована!');
    
    // Повідомляємо HR
    const hrMessage = `🏠 <b>Remote робота</b>\n\n👤 ${user?.fullName}\n🏢 ${user?.department}\n📅 ${today}`;
    await sendMessage(HR_CHAT_ID, hrMessage);
    
  } catch (error) {
    console.error('Помилка processRemoteToday:', error);
    await sendMessage(chatId, '❌ Помилка фіксації remote роботи.');
  }
}

// 🏥 ЛІКАРНЯНИЙ СЬОГОДНІ
async function processSickToday(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    const today = new Date().toISOString().split('T')[0];
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['SickDays'];
    if (sheet) {
      await sheet.addRow({
        EntryID: `S_${Date.now()}`,
        TelegramID: telegramId,
        FullName: user?.fullName,
        Department: user?.department,
        Team: user?.team,
        Date: today,
        CreatedAt: new Date().toISOString()
      });
    }
    
    await sendMessage(chatId, '✅ Лікарняний на сьогодні зафіксований!');
    
    // Повідомляємо HR та PM
    const hrMessage = `🏥 <b>Лікарняний</b>\n\n👤 ${user?.fullName}\n🏢 ${user?.department}\n📅 ${today}`;
    await sendMessage(HR_CHAT_ID, hrMessage);
    
  } catch (error) {
    console.error('Помилка processSickToday:', error);
    await sendMessage(chatId, '❌ Помилка фіксації лікарняного.');
  }
}

// 🚨 ЕКСТРЕНА ВІДПУСТКА
async function processEmergencyVacation(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    
    const text = `🚨 <b>Екстрена відпустка</b>

👤 ${user?.fullName}
🏢 ${user?.department}${user?.team ? ' / ' + user.team : ''}

Опишіть причину екстреної відпустки:

<i>Ваша заявка буде одразу передана HR для розгляду.</i>`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔙 Назад', callback_data: 'vacation_menu' }]
      ]
    };

    await sendMessage(chatId, text, keyboard);
    registrationCache.set(telegramId, { 
      step: 'emergency_vacation',
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Помилка processEmergencyVacation:', error);
    await sendMessage(chatId, '❌ Помилка створення екстреної заявки.');
  }
}

// 🚀 ЗАПУСК СЕРВЕРА
async function startServer() {
  try {
    await initGoogleSheets();
    
    if (WEBHOOK_URL) {
      await bot.setWebHook(`${WEBHOOK_URL}/webhook`);
      console.log('✅ Webhook встановлено:', `${WEBHOOK_URL}/webhook`);
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 HR Bot запущено на порту ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/`);
      console.log(`📨 Webhook: ${WEBHOOK_URL}/webhook`);
    });
  } catch (error) {
    console.error('❌ Помилка запуску:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (error) => { console.error('Uncaught Exception:', error); process.exit(1); });

startServer();
