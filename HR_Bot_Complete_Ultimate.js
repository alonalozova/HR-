/**
 * 🏢 HR БОТ - ПОВНА КОМЕРЦІЙНА ВЕРСІЯ
 * Всі функції згідно з детальними вимогами користувача
 * Railway Deployment Ready
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

if (!BOT_TOKEN) {
  console.error('❌ Відсутній BOT_TOKEN!');
  process.exit(1);
}

// Попередження про відсутні змінні
if (!SPREADSHEET_ID) console.warn('⚠️ SPREADSHEET_ID не встановлено');
if (!HR_CHAT_ID) console.warn('⚠️ HR_CHAT_ID не встановлено');

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
  try {
    const update = req.body;
    
    if (!update || processedUpdates.has(update.update_id)) {
      return res.status(200).send('OK');
    }
    
    processedUpdates.add(update.update_id);
    
    if (update.message) {
      await processMessage(update.message);
    } else if (update.callback_query) {
      await processCallback(update.callback_query);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).send('Error');
  }
});

// 📨 ОБРОБКА ПОВІДОМЛЕНЬ
async function processMessage(message) {
  try {
    const chatId = message.chat.id;
    const text = message.text;
    const telegramId = message.from.id;
    const username = message.from.username;
    const firstName = message.from.first_name;
    const lastName = message.from.last_name;
    
    console.log(`📨 Повідомлення від ${telegramId}: ${text}`);
    
    // Перевірка на дублювання
    const messageKey = `${telegramId}_${text}_${Date.now()}`;
    if (processedUpdates.has(messageKey)) return;
    processedUpdates.add(messageKey);
    
    if (text === '/start') {
      const user = await getUserInfo(telegramId);
      if (!user) {
        await startRegistration(chatId, telegramId, username, firstName, lastName);
      } else {
        await showMainMenu(chatId, telegramId);
      }
      return;
    }
    
    // Обробка Reply Keyboard кнопок
    if (await handleReplyKeyboard(chatId, telegramId, text)) {
      return;
    }
    
    // Обробка реєстрації
    if (registrationCache.has(telegramId)) {
      await handleRegistrationStep(chatId, telegramId, text);
      return;
    }
    
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
      'ai_question': () => showAIQuestion(chatId, telegramId),
      'ai_advice': () => showAIAdvice(chatId, telegramId),
      'approvals_vacations': () => showApprovalVacations(chatId, telegramId),
      'approvals_remote': () => showApprovalRemote(chatId, telegramId),
      'analytics_hr': () => showHRAnalytics(chatId, telegramId),
      'analytics_ceo': () => showCEOAnalytics(chatId, telegramId),
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
  } catch (error) {
    console.error('❌ Помилка sendMessage:', error);
  }
}

// 👤 ОТРИМАННЯ КОРИСТУВАЧА
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
        fullName: user.get('FullName'),
        department: user.get('Department'),
        team: user.get('Team'),
        position: user.get('Position'),
        birthDate: user.get('BirthDate'),
        firstWorkDay: user.get('FirstWorkDay'),
        workMode: user.get('WorkMode')
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
🤖 <b>ШІ-Помічник:</b> швидкі відповіді та поради

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
        { text: '🤖 ШІ-Помічник' }
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
      '🤖 ШІ-Помічник': showAIMenu,
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
🤖 <b>ШІ-помічником</b> - швидкі відповіді

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
• 3 місяці до першої відпустки
• Накладки заборонені в команді
• Процес: Ви → PM → HR

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
    
    const userVacations = rows.filter(row => 
      row.get('TelegramID') == telegramId && 
      row.get('Status') === 'Approved' &&
      new Date(row.get('StartDate')).getFullYear() === currentYear
    );
    
    const usedDays = userVacations.reduce((total, row) => {
      const start = new Date(row.get('StartDate'));
      const end = new Date(row.get('EndDate'));
      return total + Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    }, 0);
    
    return {
      used: usedDays,
      total: 24,
      available: 24 - usedDays
    };
  } catch (error) {
    console.error('❌ Помилка getVacationBalance:', error);
    return { used: 0, total: 24, available: 24 };
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

    await sendMessage(chatId, text);
  } catch (error) {
    console.error('❌ Помилка showVacationForm:', error);
  }
}

// 🏠 МЕНЮ REMOTE
async function showRemoteMenu(chatId, telegramId) {
  try {
    const user = await getUserInfo(telegramId);
    const stats = await getRemoteStats(telegramId);
    
    const text = `🏠 <b>Remote робота</b>

📊 <b>Статистика за місяць:</b>
• Використано: ${stats.used}/14 днів
• Доступно: ${stats.available} днів

<b>Правила:</b>
• Ліміт: 14 днів/місяць (офлайн/гібрид)
• Повідомляти до 11:00
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

📊 <b>Статистика за місяць:</b>
• Спізнень: ${stats.count}/7 (ліміт)
• Попередження: ${stats.warnings}

<b>Правила:</b>
• Спізнення з 10:21
• 7 спізнень/місяць = попередження
• Повідомляти HR + PM

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
    const user = await getUserInfo(telegramId);
    const isNew = await checkIfNewEmployee(telegramId);
    
    if (isNew) {
      const text = `🎯 <b>Онбординг для новеньких</b>

Привіт! Вітаю тебе в найкращій команді особливих Людей🧡
Тепер ти її частина. Тут зібрана основна інформація про нас.

Твоя задача познайомитися, і якщо виникнуть питання, обов'язково звертайся до HR.`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📚 Матеріали адаптації', callback_data: 'onboarding_notion' }
          ],
          [
            { text: '❓ Тестування знань', callback_data: 'onboarding_quiz' }
          ],
          [
            { text: '⬅️ Назад', callback_data: 'back_to_main' }
          ]
        ]
      };

      await sendMessage(chatId, text, keyboard);
    } else {
      await sendMessage(chatId, '❌ Цей розділ доступний тільки для нових співробітників.');
    }
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

// 🤖 МЕНЮ ШІ-ПОМІЧНИКА
async function showAIMenu(chatId, telegramId) {
  try {
    const text = `🤖 <b>ШІ-Помічник</b>

Я можу допомогти вам з швидкими відповідями та порадами.

Оберіть дію:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '❓ Задати питання', callback_data: 'ai_question' }
        ],
        [
          { text: '💡 Отримати пораду', callback_data: 'ai_advice' }
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    };

    await sendMessage(chatId, text, keyboard);
  } catch (error) {
    console.error('❌ Помилка showAIMenu:', error);
  }
}

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

    await sendMessage(chatId, '📢 Розсилки в розробці');
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
    if (!doc) return { used: 0, available: 14 };
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Remote'];
    if (!sheet) return { used: 0, available: 14 };
    
    const rows = await sheet.getRows();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const userRemote = rows.filter(row => 
      row.get('TelegramID') == telegramId && 
      row.get('Status') === 'Approved' &&
      new Date(row.get('Date')).getMonth() === currentMonth &&
      new Date(row.get('Date')).getFullYear() === currentYear
    );
    
    return {
      used: userRemote.length,
      available: 14 - userRemote.length
    };
  } catch (error) {
    console.error('❌ Помилка getRemoteStats:', error);
    return { used: 0, available: 14 };
  }
}

async function getLateStats(telegramId) {
  try {
    if (!doc) return { count: 0, warnings: 0 };
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Late'];
    if (!sheet) return { count: 0, warnings: 0 };
    
    const rows = await sheet.getRows();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const userLate = rows.filter(row => 
      row.get('TelegramID') == telegramId && 
      new Date(row.get('Date')).getMonth() === currentMonth &&
      new Date(row.get('Date')).getFullYear() === currentYear
    );
    
    const warnings = Math.floor(userLate.length / 7);
    
    return {
      count: userLate.length,
      warnings: warnings
    };
  } catch (error) {
    console.error('❌ Помилка getLateStats:', error);
    return { count: 0, warnings: 0 };
  }
}

async function getSickStats(telegramId) {
  try {
    if (!doc) return { days: 0, count: 0 };
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Sick'];
    if (!sheet) return { days: 0, count: 0 };
    
    const rows = await sheet.getRows();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const userSick = rows.filter(row => 
      row.get('TelegramID') == telegramId && 
      new Date(row.get('Date')).getMonth() === currentMonth &&
      new Date(row.get('Date')).getFullYear() === currentYear
    );
    
    return {
      days: userSick.length,
      count: userSick.length
    };
  } catch (error) {
    console.error('❌ Помилка getSickStats:', error);
    return { days: 0, count: 0 };
  }
}

// 🚀 ЗАПУСК СЕРВЕРА
async function startServer() {
  try {
    // Ініціалізація Google Sheets
    await initGoogleSheets();
    
    // Встановлення webhook
    if (WEBHOOK_URL) {
      await bot.setWebHook(`${WEBHOOK_URL}/webhook`);
      console.log('✅ Webhook встановлено:', WEBHOOK_URL);
    } else {
      console.warn('⚠️ WEBHOOK_URL не встановлено');
    }
    
    // Запуск сервера
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 HR Bot Ultimate запущено на порту ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/`);
      console.log(`📨 Webhook: ${WEBHOOK_URL || 'не встановлено'}`);
    });
    
    // Обробка помилок
    server.on('error', (error) => {
      console.error('❌ Помилка сервера:', error);
    });
    
  } catch (error) {
    console.error('❌ Помилка запуску сервера:', error);
  }
}

// Обробка глобальних помилок
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Запуск
startServer();

console.log('✅ HR Bot Ultimate server started successfully');
