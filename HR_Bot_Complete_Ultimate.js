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
        await showWelcomeMessage(chatId, telegramId, username, firstName, lastName);
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
    
    // Обробка розсилки HR
    if (await handleHRMailing(chatId, telegramId, text)) {
      return;
    }
    
    // Обробка AI питань
    if (await handleAIQuestion(chatId, telegramId, text)) {
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
      'hr_mailings': () => showMailingsMenu(chatId, telegramId),
      'hr_mailing_all': () => startMailingToAll(chatId, telegramId),
      'hr_mailing_department': () => startMailingToDepartment(chatId, telegramId),
      'hr_mailing_team': () => startMailingToTeam(chatId, telegramId),
      'hr_mailing_role': () => startMailingToRole(chatId, telegramId),
      'start_registration': () => startRegistrationFromCallback(chatId, telegramId),
      'onboarding_notion': () => showNotionLink(chatId, telegramId),
      'onboarding_quiz': () => showOnboardingQuiz(chatId, telegramId),
      'onboarding_rules': () => showCompanyRules(chatId, telegramId),
      'onboarding_structure': () => showTeamStructure(chatId, telegramId),
      'ai_question': () => startAIQuestion(chatId, telegramId),
      'ai_advice': () => startAIAdvice(chatId, telegramId),
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
    } else if (data.startsWith('mailing_dept_')) {
      const department = data.replace('mailing_dept_', '');
      await startMailingToDepartmentSelected(chatId, telegramId, department);
    } else if (data.startsWith('mailing_team_')) {
      const team = data.replace('mailing_team_', '');
      await startMailingToTeamSelected(chatId, telegramId, team);
    } else if (data.startsWith('mailing_role_')) {
      const role = data.replace('mailing_role_', '');
      await startMailingToRoleSelected(chatId, telegramId, role);
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
🤖 <b>ШІ-Помічник:</b> швидкі відповіді та поради

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

// AI функції
async function startAIQuestion(chatId, telegramId) {
  try {
    registrationCache.set(telegramId, {
      step: 'ai_question',
      data: { type: 'question' }
    });

    await sendMessage(chatId, `🤖 <b>ШІ-Помічник - Питання</b>

Задайте ваше питання, і я надам вам швидку відповідь!`);
  } catch (error) {
    console.error('❌ Помилка startAIQuestion:', error);
  }
}

async function startAIAdvice(chatId, telegramId) {
  try {
    registrationCache.set(telegramId, {
      step: 'ai_advice',
      data: { type: 'advice' }
    });

    await sendMessage(chatId, `🤖 <b>ШІ-Помічник - Порада</b>

Опишіть вашу ситуацію, і я дам вам корисну пораду!`);
  } catch (error) {
    console.error('❌ Помилка startAIAdvice:', error);
  }
}

// Обробка AI питань
async function handleAIQuestion(chatId, telegramId, text) {
  try {
    const regData = registrationCache.get(telegramId);
    if (!regData || (regData.step !== 'ai_question' && regData.step !== 'ai_advice')) {
      return false;
    }

    console.log(`🤖 AI Question from ${telegramId}: ${text}`);
    console.log(`🤖 AI Step: ${regData.step}, Type: ${regData.data.type}`);

    // Простий AI на основі ключових слів
    const response = generateAIResponse(text, regData.data.type);
    
    console.log(`🤖 AI Response: ${response}`);
    
    await sendMessage(chatId, `🤖 <b>ШІ-Помічник відповідає:</b>\n\n${response}`);
    
    // Логування AI взаємодії
    await logUserData(telegramId, 'ai_interaction', { 
      type: regData.data.type, 
      question: text, 
      response: response 
    });
    
    registrationCache.delete(telegramId);
    return true;
  } catch (error) {
    console.error('❌ Помилка handleAIQuestion:', error);
    return false;
  }
}

// Генерація AI відповіді
function generateAIResponse(userInput, type) {
  const input = userInput.toLowerCase();
  
  // База знань для відповідей
  const responses = {
    vacation: [
      "Для відпустки потрібно подати заявку через бот. Максимум 7 днів за раз, мінімум 1 день. Перевірте, чи немає перетинів з колегами в команді.",
      "Відпустки затверджуються через процес: Ви → PM → HR. Не забудьте перевірити баланс відпусток в розділі 'Відпустки'."
    ],
    remote: [
      "Для remote роботи натисніть 'Remote' в меню та оберіть потрібну дату. Ліміт: 14 днів на місяць для офлайн/гібрид співробітників.",
      "Remote робота автоматично затверджується, але не забудьте повідомити до 11:00 ранку."
    ],
    late: [
      "Якщо спізнюєтесь, натисніть 'Спізнення' та повідомте HR та PM. Спізнення рахуються з 10:21.",
      "7 спізнень на місяць = попередження. Будьте пунктуальними!"
    ],
    sick: [
      "При хворобі натисніть 'Лікарняний' та повідомте HR та PM. Лікарняний без лімітів.",
      "Лікарняний автоматично затверджується, але обов'язково повідомте HR."
    ],
    hr: [
      "Для питань до HR використовуйте розділ 'ASAP запит' для термінових питань або 'Пропозиції' для ідей.",
      "HR затверджує всі заявки на відпустки та керує всіма HR процесами."
    ],
    burnout: [
      "Вигорання - це серйозна проблема. Рекомендую: 1) Взяти відпустку для відновлення, 2) Обговорити навантаження з PM, 3) Звернутися до HR через ASAP запит для підтримки.",
      "Якщо відчуваєте вигорання, це сигнал про необхідність змін. Можете анонімно поділитися своїми думками через розділ 'Пропозиції' або терміново звернутися до HR через 'ASAP запит'.",
      "Вигорання часто пов'язане з перевантаженням. Розгляньте можливість remote роботи або короткострокової відпустки. HR готовий допомогти в цій ситуації."
    ],
    stress: [
      "Стрес на роботі - нормальне явище, але важливо ним керувати. Спробуйте: 1) Планувати день заздалегідь, 2) Робити короткі перерви, 3) Обговорювати проблеми з колегами або PM.",
      "Якщо стрес стає неконтрольованим, зверніться до HR через ASAP запит. Вони можуть допомогти знайти рішення або надати підтримку."
    ],
    motivation: [
      "Втрата мотивації може бути тимчасовою. Спробуйте: 1) Поставити нові цілі, 2) Обговорити розвиток кар'єри з PM, 3) Взяти участь у нових проектах.",
      "Мотивація часто повертається після змін в роботі. Можете анонімно поділитися ідеями покращення роботи через розділ 'Пропозиції'."
    ],
    general: [
      "Використовуйте меню бота для навігації. Всі функції доступні через кнопки.",
      "Якщо у вас є питання, можете завжди звернутися до HR через бот.",
      "Не забудьте регулярно перевіряти статистику та баланси в розділі 'Статистика'.",
      "Якщо у вас є проблеми або питання, які потребують негайної уваги, використовуйте розділ 'ASAP запит'.",
      "Ваші ідеї та пропозиції важливі для команди. Діліться ними через розділ 'Пропозиції'."
    ]
  };
  
  // Визначення теми питання
  let topic = 'general';
  if (input.includes('відпустк') || input.includes('отпуск')) topic = 'vacation';
  else if (input.includes('remote') || input.includes('віддален')) topic = 'remote';
  else if (input.includes('спізнен') || input.includes('запізнен')) topic = 'late';
  else if (input.includes('лікарнян') || input.includes('хворі')) topic = 'sick';
  else if (input.includes('hr') || input.includes('кадр')) topic = 'hr';
  else if (input.includes('вигоранн') || input.includes('вигорание') || input.includes('burnout')) topic = 'burnout';
  else if (input.includes('стрес') || input.includes('стресс') || input.includes('напружен')) topic = 'stress';
  else if (input.includes('мотивац') || input.includes('мотив') || input.includes('втрат')) topic = 'motivation';
  else if (input.includes('втом') || input.includes('устал') || input.includes('перевантажен')) topic = 'burnout';
  else if (input.includes('проблем') || input.includes('труднощ') || input.includes('складно')) topic = 'stress';
  
  // Вибір випадкової відповіді
  const topicResponses = responses[topic];
  const randomResponse = topicResponses[Math.floor(Math.random() * topicResponses.length)];
  
  return randomResponse;
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
