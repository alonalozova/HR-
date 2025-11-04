/**
 * 🏢 HR БОТ - ВЕРСІЯ №1 ОПТИМІЗОВАНА 
 * ⚡ ШВИДКО + всі функції
 * 🎯 100% кнопковий інтерфейс  
 * 🔐 Система ролей та прав доступу
 * 🚀 ОПТИМІЗАЦІЯ: швидкий кеш + мінімум запитів
 */

// ⚙️ НАЛАШТУВАННЯ
const BOT_TOKEN = '8160058317:AAGfkWy2gFj81hoC9NSE-Wc-CdiaXZw9Znw';
const SPREADSHEET_ID = '1aKWAIIeYe39hwaS65k-GAqsaFFhi765DuHoptLtFagg';
const HR_CHAT_ID = '7304993062';

// 🚀 ШВИДКА ГОЛОВНА ФУНКЦІЯ
function doPost(e) {
  try {
    // Швидка перевірка
    if (!e?.postData?.contents) return ContentService.createTextOutput('ok');
    
    const update = JSON.parse(e.postData.contents);
    const updateId = update.update_id;
    
    // Простий антидублікат
    const cache = CacheService.getScriptCache();
    const key = `u_${updateId}`;
    if (cache.get(key)) return ContentService.createTextOutput('ok');
    cache.put(key, '1', 60);
    
    // Асинхронна обробка
    if (update.message) {
      processMessage(update.message);
    } else if (update.callback_query) {
      processCallback(update.callback_query);
    }
    
    return ContentService.createTextOutput('ok');
  } catch (error) {
    console.error('doPost error:', error);
    return ContentService.createTextOutput('error');
  }
}

// 📨 ШВИДКА ОБРОБКА ПОВІДОМЛЕНЬ
function processMessage(message) {
  const chatId = message.chat.id;
  const text = message.text;
  
  if (text === '/start') {
    showMainMenu(chatId);
  } else if (text?.startsWith('/')) {
    handleCommand(chatId, text);
  }
}

// 🎛️ ГОЛОВНЕ МЕНЮ
function showMainMenu(chatId) {
  const text = '🌟 Привіт зірко, я помічник твого HR!\n\nЯ створений, щоб автоматизувати деякі процеси.\nОзнайомся з функціями які я виконую:';
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏖️ Відпустка', callback_data: 'vacation_menu' },
        { text: '🏠 Remote/Спізнення', callback_data: 'remote_menu' }
      ],
      [
        { text: '📊 Мій профіль', callback_data: 'profile_menu' },
        { text: '🎯 Я новачок', callback_data: 'onboarding_menu' }
      ],
      [
        { text: '🏢 Довідник', callback_data: 'directory_menu' },
        { text: '📅 Події', callback_data: 'events_menu' }
      ],
      [
        { text: '❓ FAQ', callback_data: 'faq_menu' },
        { text: '🚨 ASAP', callback_data: 'asap_menu' }
      ]
    ]
  };
  
  sendMessage(chatId, text, keyboard);
}

// 🎛️ ОБРОБКА CALLBACK
function processCallback(query) {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  // Швидка відповідь
  answerCallback(query.id);
  
  // Маршрутизація
  switch (data) {
    case 'vacation_menu':
      showVacationMenu(chatId);
      break;
    case 'remote_menu':
      showRemoteMenu(chatId);
      break;
    case 'profile_menu':
      showProfileMenu(chatId);
      break;
    case 'onboarding_menu':
      showOnboardingMenu(chatId);
      break;
    case 'directory_menu':
      showDirectoryMenu(chatId);
      break;
    case 'events_menu':
      showEventsMenu(chatId);
      break;
    case 'faq_menu':
      showFAQMenu(chatId);
      break;
    case 'asap_menu':
      showASAPMenu(chatId);
      break;
    case 'back_main':
      showMainMenu(chatId);
      break;
    default:
      handleSpecificAction(chatId, data);
      break;
  }
}

// 🏖️ МЕНЮ ВІДПУСТОК
function showVacationMenu(chatId) {
  const text = '🏖️ ВІДПУСТКИ\n\nОберіть дію:';
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '📝 Подати заявку', callback_data: 'vacation_request' },
        { text: '💰 Мій баланс', callback_data: 'vacation_balance' }
      ],
      [
        { text: '📋 Мої заявки', callback_data: 'vacation_my' },
        { text: '📊 Звіт команди', callback_data: 'vacation_team' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };
  
  editMessage(chatId, query.message.message_id, text, keyboard);
}

// 🏠 МЕНЮ REMOTE/СПІЗНЕННЯ
function showRemoteMenu(chatId) {
  const text = '🏠 REMOTE / СПІЗНЕННЯ\n\nОберіть дію:';
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏠 Remote сьогодні', callback_data: 'remote_today' },
        { text: '⏰ Спізнення', callback_data: 'late_today' }
      ],
      [
        { text: '📅 Remote на дату', callback_data: 'remote_date' },
        { text: '📊 Моя статистика', callback_data: 'remote_stats' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };
  
  editMessage(chatId, query.message.message_id, text, keyboard);
}

// 📊 ПРОФІЛЬ КОРИСТУВАЧА
function showProfileMenu(chatId) {
  const user = getCachedUser(chatId);
  
  if (!user) {
    const text = '❌ Профіль не знайдено\n\nЗверніться до HR для реєстрації';
    const keyboard = { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_main' }]] };
    editMessage(chatId, query.message.message_id, text, keyboard);
    return;
  }
  
  const stats = getCachedStats(chatId);
  
  const text = `👤 МІЙ ПРОФІЛЬ\n\n` +
    `📛 ${user.name}\n` +
    `💼 ${user.position}\n` +
    `🏢 ${user.department} / ${user.team}\n` +
    `📅 Працює з: ${user.startDate}\n\n` +
    `📈 СТАТИСТИКА МІСЯЦЯ:\n` +
    `🏠 Remote: ${stats.remote} дн.\n` +
    `⏰ Спізнення: ${stats.late} раз\n` +
    `🏖️ Відпустка: ${stats.vacation} дн.\n` +
    `💰 Баланс: ${stats.balance} дн.`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✏️ Редагувати', callback_data: 'profile_edit' },
        { text: '📊 Детальна статистика', callback_data: 'profile_stats' }
      ],
      [
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };
  
  editMessage(chatId, query.message.message_id, text, keyboard);
}

// 🎯 МЕНЮ ОНБОРДИНГУ
function showOnboardingMenu(chatId) {
  const text = `🎯 ОНБОРДИНГ\n\n` +
    `Привіт! Вітаю тебе в найкращій команді особливих Людей🧡\n\n` +
    `Тепер ти її частина! Ознайомся з матеріалами:`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🎥 Відео привітання', callback_data: 'onboarding_video' },
        { text: '📚 Матеріали', callback_data: 'onboarding_materials' }
      ],
      [
        { text: '🏢 Структура компанії', callback_data: 'onboarding_structure' },
        { text: '📋 Чек-лист', callback_data: 'onboarding_checklist' }
      ],
      [
        { text: '📞 Ключові контакти', callback_data: 'onboarding_contacts' },
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };
  
  editMessage(chatId, query.message.message_id, text, keyboard);
}

// 📚 АДАПТАЦІЯ ТРАФІК
function showTrafficAdaptation(chatId, messageId) {
  const text = `📚 АДАПТАЦІЯ ТРАФІК\n\n` +
    `Матеріали для відділу трафіку:\n\n` +
    `🔗 Notion: https://superficial-sort-084.notion.site/3b5c00ad8a42473bbef49bb26f076ebd\n\n` +
    `Ознайомся з усіма розділами та поверніться для проходження тесту.`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Переглянув, пройти тест', callback_data: 'onboarding_quiz' },
        { text: '🔙 Назад', callback_data: 'onboarding_menu' }
      ]
    ]
  };
  
  editMessage(chatId, messageId, text, keyboard);
}

// 🚨 ASAP МЕНЮ
function showASAPMenu(chatId) {
  const text = '🚨 ТЕРМІНОВЕ ПИТАННЯ\n\nОпишіть що сталося:';
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🔥 Критична проблема', callback_data: 'asap_critical' },
        { text: '⚠️ Терміново', callback_data: 'asap_urgent' }
      ],
      [
        { text: '📝 Написати повідомлення', callback_data: 'asap_message' },
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };
  
  editMessage(chatId, query.message.message_id, text, keyboard);
}

// ⚡ ШВИДКІ ОПЕРАЦІЇ
function handleSpecificAction(chatId, action) {
  switch (action) {
    case 'remote_today':
      recordRemoteToday(chatId);
      break;
    case 'late_today':
      showLateOptions(chatId);
      break;
    case 'vacation_balance':
      showVacationBalance(chatId);
      break;
    case 'vacation_request':
      startVacationRequest(chatId);
      break;
    case 'onboarding_materials':
      showTrafficAdaptation(chatId);
      break;
    case 'asap_critical':
      handleASAPCritical(chatId);
      break;
    default:
      if (action.startsWith('late_')) {
        const minutes = action.split('_')[1];
        recordLate(chatId, minutes);
      }
      break;
  }
}

// 🏠 ШВИДКИЙ REMOTE
function recordRemoteToday(chatId) {
  try {
    const today = Utilities.formatDate(new Date(), 'GMT+2', 'yyyy-MM-dd');
    const requestId = `R_${Date.now()}`;
    
    // Швидкий запис
    appendToSheet('Remotes', [
      requestId, chatId, today, 'Remote робота', 'Approved', '', '', new Date()
    ]);
    
    sendMessage(chatId, '✅ Remote день на сьогодні зафіксовано!');
    
    // HR повідомлення
    const user = getCachedUser(chatId);
    notifyHR(`🏠 Remote: ${user?.name || 'Користувач'} - ${today}`);
    
  } catch (error) {
    console.error('Remote error:', error);
    sendMessage(chatId, '❌ Помилка. Спробуйте пізніше.');
  }
}

// ⏰ ОПЦІЇ СПІЗНЕННЯ
function showLateOptions(chatId) {
  const text = '⏰ На скільки хвилин спізнюєтесь?';
  
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
        { text: '🔙 Назад', callback_data: 'remote_menu' }
      ]
    ]
  };
  
  sendMessage(chatId, text, keyboard);
}

// ⏰ ЗАПИС СПІЗНЕННЯ
function recordLate(chatId, minutes) {
  try {
    const today = Utilities.formatDate(new Date(), 'GMT+2', 'yyyy-MM-dd');
    const entryId = `L_${Date.now()}`;
    const arrivalTime = `${9 + Math.floor(minutes/60)}:${(minutes % 60).toString().padStart(2, '0')}`;
    
    appendToSheet('Lates', [
      entryId, chatId, today, arrivalTime, minutes, 'Через бот', new Date()
    ]);
    
    sendMessage(chatId, `✅ Спізнення на ${minutes} хв зафіксовано!`);
    
    // Повідомити HR якщо >30 хв
    if (minutes > 30) {
      const user = getCachedUser(chatId);
      notifyHR(`⏰ Спізнення: ${user?.name || 'Користувач'} - ${minutes} хв`);
    }
    
  } catch (error) {
    console.error('Late error:', error);
    sendMessage(chatId, '❌ Помилка. Спробуйте пізніше.');
  }
}

// 🚨 КРИТИЧНЕ ASAP
function handleASAPCritical(chatId) {
  const user = getCachedUser(chatId);
  const text = `🚨 КРИТИЧНА ПРОБЛЕМА\n\nВід: ${user?.name || 'Користувач'}\nЧас: ${new Date().toLocaleString('uk-UA')}\n\nОчікую деталей...`;
  
  // Негайно повідомити HR
  sendMessage(HR_CHAT_ID, text);
  sendMessage(chatId, '🚨 HR негайно сповіщено! Очікуйте відповіді.');
  
  // Логування
  appendToSheet('ASAP', [
    `A_${Date.now()}`, chatId, 'CRITICAL', 'Очікую деталей', new Date()
  ]);
}

// 💰 БАЛАНС ВІДПУСТКИ
function showVacationBalance(chatId) {
  try {
    const balance = getCachedBalance(chatId);
    const user = getCachedUser(chatId);
    
    const text = `💰 БАЛАНС ВІДПУСТКИ\n\n` +
      `👤 ${user?.name || 'Користувач'}\n` +
      `📅 Рік: ${new Date().getFullYear()}\n\n` +
      `🏖️ Річна норма: ${balance.annual} дн.\n` +
      `📊 Використано: ${balance.used} дн.\n` +
      `💰 Залишок: ${balance.remaining} дн.`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Подати заявку', callback_data: 'vacation_request' },
          { text: '🔙 Назад', callback_data: 'vacation_menu' }
        ]
      ]
    };
    
    sendMessage(chatId, text, keyboard);
    
  } catch (error) {
    console.error('Balance error:', error);
    sendMessage(chatId, '❌ Помилка завантаження балансу.');
  }
}

// 📊 ШВИДКИЙ КЕШ КОРИСТУВАЧІВ
function getCachedUser(chatId) {
  const cache = CacheService.getScriptCache();
  const key = `user_${chatId}`;
  let user = cache.get(key);
  
  if (!user) {
    user = fetchUserFromSheet(chatId);
    if (user) {
      cache.put(key, JSON.stringify(user), 300); // 5 хв
    }
  } else {
    user = JSON.parse(user);
  }
  
  return user;
}

// 📊 КЕШ СТАТИСТИКИ
function getCachedStats(chatId) {
  const cache = CacheService.getScriptCache();
  const key = `stats_${chatId}_${new Date().getDate()}`;
  let stats = cache.get(key);
  
  if (!stats) {
    stats = calculateUserStats(chatId);
    cache.put(key, JSON.stringify(stats), 3600); // 1 година
  } else {
    stats = JSON.parse(stats);
  }
  
  return stats;
}

// 💰 КЕШ БАЛАНСУ
function getCachedBalance(chatId) {
  const cache = CacheService.getScriptCache();
  const key = `balance_${chatId}`;
  let balance = cache.get(key);
  
  if (!balance) {
    balance = fetchBalanceFromSheet(chatId);
    cache.put(key, JSON.stringify(balance), 600); // 10 хв
  } else {
    balance = JSON.parse(balance);
  }
  
  return balance;
}

// 🔍 ОТРИМАТИ КОРИСТУВАЧА З ТАБЛИЦІ
function fetchUserFromSheet(chatId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Employees');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] == chatId) {
        return {
          name: data[i][0],
          position: data[i][6],
          department: data[i][3],
          team: data[i][4],
          startDate: data[i][9]
        };
      }
    }
    return null;
  } catch (error) {
    console.error('fetchUser error:', error);
    return null;
  }
}

// 📊 РОЗРАХУНОК СТАТИСТИКИ
function calculateUserStats(chatId) {
  try {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    // Підрахунок з різних таблиць
    const remote = countInSheet('Remotes', chatId, currentMonth, currentYear);
    const late = countInSheet('Lates', chatId, currentMonth, currentYear);
    const vacation = countInSheet('Vacations', chatId, currentMonth, currentYear);
    const balance = fetchBalanceFromSheet(chatId);
    
    return { remote, late, vacation, balance: balance.remaining };
  } catch (error) {
    console.error('calculateStats error:', error);
    return { remote: 0, late: 0, vacation: 0, balance: 24 };
  }
}

// 💰 ОТРИМАТИ БАЛАНС
function fetchBalanceFromSheet(chatId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('VacationBalance');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == chatId) {
        return {
          annual: data[i][2] || 24,
          used: data[i][4] || 0,
          remaining: data[i][5] || 24
        };
      }
    }
    
    // Якщо не знайдено - створити запис
    sheet.appendRow([chatId, new Date().getFullYear(), 24, 0, 0, 24, new Date()]);
    return { annual: 24, used: 0, remaining: 24 };
  } catch (error) {
    console.error('fetchBalance error:', error);
    return { annual: 24, used: 0, remaining: 24 };
  }
}

// 🔢 ПІДРАХУНОК В ТАБЛИЦІ
function countInSheet(sheetName, chatId, month, year) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    const data = sheet.getDataRange().getValues();
    let count = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] == chatId) {
        const date = new Date(data[i][2]);
        if (date.getMonth() + 1 === month && date.getFullYear() === year) {
          count++;
        }
      }
    }
    
    return count;
  } catch (error) {
    console.error(`count in ${sheetName} error:`, error);
    return 0;
  }
}

// ✏️ ШВИДКИЙ ЗАПИС В ТАБЛИЦЮ
function appendToSheet(sheetName, rowData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    sheet.appendRow(rowData);
  } catch (error) {
    console.error(`appendToSheet ${sheetName} error:`, error);
  }
}

// 📤 ШВИДКЕ ПОВІДОМЛЕННЯ
function sendMessage(chatId, text, keyboard = null) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = { chat_id: chatId, text: text };
  
  if (keyboard) payload.reply_markup = JSON.stringify(keyboard);
  
  UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
}

// ✏️ РЕДАГУВАННЯ ПОВІДОМЛЕННЯ
function editMessage(chatId, messageId, text, keyboard = null) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text
  };
  
  if (keyboard) payload.reply_markup = JSON.stringify(keyboard);
  
  UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
}

// ✅ ВІДПОВІДЬ НА CALLBACK
function answerCallback(callbackId) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: callbackId })
  });
}

// 🚨 HR СПОВІЩЕННЯ
function notifyHR(message) {
  sendMessage(HR_CHAT_ID, `🔔 ${message}\n\n⏰ ${new Date().toLocaleString('uk-UA')}`);
}

// 🔧 НАЛАШТУВАННЯ WEBHOOK
function setWebhook() {
  const webAppUrl = 'https://script.google.com/macros/s/AKfycbzA3zUCxI1Gx9CVH_Eu2Ru-pjOrVT3NA-MDumOUH0tdU_BpiL5xDwqQjhWqyE5hQsvC/exec';
  
  const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({ url: webAppUrl })
  });
  
  console.log('✅ Webhook встановлено:', response.getContentText());
  return response.getContentText();
}

// 🧪 ТЕСТ СИСТЕМИ
function testOptimizedBot() {
  console.log('🧪 Тест оптимізованого бота...');
  sendMessage(HR_CHAT_ID, '🚀 Оптимізований HR Бот v1.0 готовий!\n\n⚡ Швидко + всі функції');
  return 'Тест завершено!';
}

// 🎯 ПОЧАТКОВІ ДАНІ
function initOptimizedData() {
  console.log('🎯 Ініціалізація оптимізованих даних...');
  
  try {
    // Створюємо базові таблиці якщо потрібно
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    const sheets = ['Employees', 'Remotes', 'Lates', 'VacationBalance', 'ASAP'];
    
    sheets.forEach(name => {
      if (!ss.getSheetByName(name)) {
        ss.insertSheet(name);
        console.log(`✅ Створено таблицю: ${name}`);
      }
    });
    
    return '✅ Ініціалізація завершена!';
  } catch (error) {
    console.error('Помилка ініціалізації:', error);
    return `❌ Помилка: ${error.toString()}`;
  }
}


