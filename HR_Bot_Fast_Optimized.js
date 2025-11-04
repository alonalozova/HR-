// 🚀 HR БОТ - ШВИДКА ОПТИМІЗОВАНА ВЕРСІЯ
// Версія: 2.0 Optimized
// Розробник: Кай для Альони (Люди.Digital)
// Дата: 30.09.2024

// 🔧 НАЛАШТУВАННЯ
const BOT_TOKEN = '8160058317:AAGfkWy2gFj81hoC9NSE-Wc-CdiaXZw9Znw';
const SPREADSHEET_ID = '1aKWAIIeYe39hwaS65k-GAqsaFFhi765DuHoptLtFagg';
const HR_CHAT_ID = '7304993062';

// 🎯 ГОЛОВНА ФУНКЦІЯ WEBHOOK
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    
    // Простий антидублікат
    const cache = CacheService.getScriptCache();
    const key = `msg_${update.update_id}`;
    if (cache.get(key)) return ContentService.createTextOutput('ok');
    cache.put(key, '1', 60);
    
    if (update.message) {
      handleMessage(update.message);
    } else if (update.callback_query) {
      handleCallback(update.callback_query);
    }
    
    return ContentService.createTextOutput('ok');
  } catch (error) {
    console.error('Помилка:', error);
    return ContentService.createTextOutput('error');
  }
}

// 📨 ОБРОБКА ПОВІДОМЛЕНЬ
function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text;
  
  if (text === '/start') {
    showMainMenu(chatId);
  }
}

// 🎛️ ГОЛОВНЕ МЕНЮ
function showMainMenu(chatId) {
  const text = '🌟 Привіт зірко, я помічник твого HR!\n\nЯ створений, щоб автоматизувати деякі процеси.\nОзнайомся з функціями які я виконую:';
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏖️ Відпустка', callback_data: 'vacation' },
        { text: '🏠 Ремоут', callback_data: 'remote' }
      ],
      [
        { text: '⏰ Спізнення', callback_data: 'late' },
        { text: '📊 Мій статус', callback_data: 'status' }
      ],
      [
        { text: '🎯 Я новачок', callback_data: 'newbie' },
        { text: '❓ FAQ', callback_data: 'faq' }
      ]
    ]
  };
  
  sendMessage(chatId, text, keyboard);
}

// 🏖️ ВІДПУСТКА
function handleVacation(chatId) {
  const text = '🏖️ Відпустка\n\nОберіть дію:';
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '📅 Подати заявку', callback_data: 'vacation_request' },
        { text: '💰 Мій баланс', callback_data: 'vacation_balance' }
      ],
      [
        { text: '📋 Мої заявки', callback_data: 'vacation_my' },
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };
  
  sendMessage(chatId, text, keyboard);
}

// 🏠 РЕМОУТ
function handleRemote(chatId) {
  const text = '🏠 Remote робота\n\nОберіть дату:';
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '📅 Сьогодні', callback_data: 'remote_today' },
        { text: '📆 Інша дата', callback_data: 'remote_date' }
      ],
      [
        { text: '📋 Мої remote дні', callback_data: 'remote_my' },
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };
  
  sendMessage(chatId, text, keyboard);
}

// ⏰ СПІЗНЕННЯ
function handleLate(chatId) {
  const text = '⏰ Спізнення\n\nНа скільки хвилин спізнюєтесь?';
  
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
        { text: '📋 Моя статистика', callback_data: 'late_stats' },
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };
  
  sendMessage(chatId, text, keyboard);
}

// 📊 СТАТУС
function handleStatus(chatId) {
  const user = getUserInfo(chatId);
  if (!user) {
    sendMessage(chatId, '❌ Користувач не знайдений. Зверніться до HR.');
    return;
  }
  
  const stats = getUserStats(chatId);
  
  const text = `📊 Ваш статус:\n\n` +
    `👤 ${user.name}\n` +
    `💼 ${user.position}\n` +
    `🏢 ${user.department}\n\n` +
    `📈 Статистика цього місяця:\n` +
    `🏠 Remote: ${stats.remote} днів\n` +
    `⏰ Спізнення: ${stats.late} разів\n` +
    `🏖️ Відпустка: ${stats.vacation} днів\n` +
    `💰 Баланс відпустки: ${stats.vacationBalance} днів`;
  
  const keyboard = {
    inline_keyboard: [[
      { text: '🔙 Назад', callback_data: 'back_main' }
    ]]
  };
  
  sendMessage(chatId, text, keyboard);
}

// 🎯 НОВАЧОК
function handleNewbie(chatId) {
  const text = `🎯 Привіт!\n\n` +
    `Вітаю тебе в найкращій команді особливих Людей🧡\n` +
    `Тепер ти її частина!\n\n` +
    `Тут зібрана основна інформація про нас.\n` +
    `Твоя задача познайомитися, і якщо виникнуть питання, обов'язково звертайся до HR.`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🎥 Відео привітання', callback_data: 'newbie_video' }
      ],
      [
        { text: '📚 Адаптація трафік', callback_data: 'newbie_traffic' }
      ],
      [
        { text: '🏢 Структура компанії', callback_data: 'newbie_structure' }
      ],
      [
        { text: '📋 Чек-лист', callback_data: 'newbie_checklist' },
        { text: '🔙 Назад', callback_data: 'back_main' }
      ]
    ]
  };
  
  sendMessage(chatId, text, keyboard);
}

// 🎥 АДАПТАЦІЯ ТРАФІК
function handleTrafficAdaptation(chatId) {
  const text = `📚 Адаптація для відділу трафіку\n\n` +
    `Ознайомся з матеріалами для твого відділу:\n\n` +
    `🔗 Посилання на Notion: https://superficial-sort-084.notion.site/3b5c00ad8a42473bbef49bb26f076ebd`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Переглянуто', callback_data: 'adaptation_done' },
        { text: '🔙 Назад', callback_data: 'newbie' }
      ]
    ]
  };
  
  sendMessage(chatId, text, keyboard);
}

// 📊 ОТРИМАТИ СТАТИСТИКУ КОРИСТУВАЧА
function getUserStats(chatId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    // Рахуємо remote дні
    const remoteSheet = ss.getSheetByName('Remotes');
    let remoteCount = 0;
    if (remoteSheet) {
      const remoteData = remoteSheet.getDataRange().getValues();
      for (let i = 1; i < remoteData.length; i++) {
        if (remoteData[i][1] == chatId) {
          const date = new Date(remoteData[i][2]);
          if (date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear) {
            remoteCount++;
          }
        }
      }
    }
    
    // Рахуємо спізнення
    const lateSheet = ss.getSheetByName('Lates');
    let lateCount = 0;
    if (lateSheet) {
      const lateData = lateSheet.getDataRange().getValues();
      for (let i = 1; i < lateData.length; i++) {
        if (lateData[i][1] == chatId) {
          const date = new Date(lateData[i][2]);
          if (date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear) {
            lateCount++;
          }
        }
      }
    }
    
    // Баланс відпустки
    const balanceSheet = ss.getSheetByName('VacationBalance');
    let balance = 24;
    if (balanceSheet) {
      const balanceData = balanceSheet.getDataRange().getValues();
      for (let i = 1; i < balanceData.length; i++) {
        if (balanceData[i][0] == chatId) {
          balance = balanceData[i][5] || 24;
          break;
        }
      }
    }
    
    return {
      remote: remoteCount,
      late: lateCount,
      vacation: 0,
      vacationBalance: balance
    };
  } catch (error) {
    console.error('Помилка getUserStats:', error);
    return { remote: 0, late: 0, vacation: 0, vacationBalance: 24 };
  }
}

// 👤 ОТРИМАТИ ІНФОРМАЦІЮ КОРИСТУВАЧА
function getUserInfo(chatId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const empSheet = ss.getSheetByName('Employees');
    
    if (!empSheet) return null;
    
    const data = empSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] == chatId) {
        return {
          name: data[i][0],
          position: data[i][6],
          department: data[i][3]
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Помилка getUserInfo:', error);
    return null;
  }
}

// 🎛️ ОБРОБКА CALLBACK КНОПОК
function handleCallback(query) {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  // Відповідь на callback
  answerCallback(query.id);
  
  switch (data) {
    case 'vacation':
      handleVacation(chatId);
      break;
    case 'remote':
      handleRemote(chatId);
      break;
    case 'late':
      handleLate(chatId);
      break;
    case 'status':
      handleStatus(chatId);
      break;
    case 'newbie':
      handleNewbie(chatId);
      break;
    case 'newbie_traffic':
      handleTrafficAdaptation(chatId);
      break;
    case 'back_main':
      showMainMenu(chatId);
      break;
    case 'remote_today':
      recordRemoteToday(chatId);
      break;
    default:
      if (data.startsWith('late_')) {
        const minutes = data.split('_')[1];
        recordLate(chatId, minutes);
      }
      break;
  }
}

// 🏠 ЗАПИСАТИ REMOTE СЬОГОДНІ
function recordRemoteToday(chatId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const remoteSheet = ss.getSheetByName('Remotes');
    
    if (!remoteSheet) {
      sendMessage(chatId, '❌ Помилка: таблиця не знайдена');
      return;
    }
    
    const today = new Date();
    const dateStr = Utilities.formatDate(today, 'GMT+2', 'yyyy-MM-dd');
    const requestId = `R${Date.now()}`;
    
    remoteSheet.appendRow([
      requestId,
      chatId,
      dateStr,
      'Робочий remote день',
      'Approved',
      '',
      '',
      new Date()
    ]);
    
    sendMessage(chatId, '✅ Remote день на сьогодні зафіксовано!');
    
    // Повідомляємо HR
    const user = getUserInfo(chatId);
    const hrText = `🏠 Remote день зафіксовано:\n\n👤 ${user ? user.name : 'Користувач'}\n📅 ${dateStr}`;
    sendMessage(HR_CHAT_ID, hrText);
    
  } catch (error) {
    console.error('Помилка recordRemoteToday:', error);
    sendMessage(chatId, '❌ Помилка запису. Зверніться до HR.');
  }
}

// ⏰ ЗАПИСАТИ СПІЗНЕННЯ
function recordLate(chatId, minutes) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const lateSheet = ss.getSheetByName('Lates');
    
    if (!lateSheet) {
      sendMessage(chatId, '❌ Помилка: таблиця не знайдена');
      return;
    }
    
    const today = new Date();
    const dateStr = Utilities.formatDate(today, 'GMT+2', 'yyyy-MM-dd');
    const entryId = `L${Date.now()}`;
    
    lateSheet.appendRow([
      entryId,
      chatId,
      dateStr,
      `${9 + parseInt(minutes/60)}:${(parseInt(minutes) % 60).toString().padStart(2, '0')}`,
      minutes,
      'Повідомлено через бот',
      new Date()
    ]);
    
    sendMessage(chatId, `✅ Спізнення на ${minutes} хвилин зафіксовано!`);
    
    // Повідомляємо HR якщо спізнення більше 30 хвилин
    if (parseInt(minutes) > 30) {
      const user = getUserInfo(chatId);
      const hrText = `⏰ Спізнення зафіксовано:\n\n👤 ${user ? user.name : 'Користувач'}\n📅 ${dateStr}\n⏱️ ${minutes} хвилин`;
      sendMessage(HR_CHAT_ID, hrText);
    }
    
  } catch (error) {
    console.error('Помилка recordLate:', error);
    sendMessage(chatId, '❌ Помилка запису. Зверніться до HR.');
  }
}

// 📤 ВІДПРАВИТИ ПОВІДОМЛЕННЯ
function sendMessage(chatId, text, keyboard = null) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  
  if (keyboard) {
    payload.reply_markup = JSON.stringify(keyboard);
  }
  
  UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
}

// ✅ ВІДПОВІДЬ НА CALLBACK
function answerCallback(callbackId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
  UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({
      callback_query_id: callbackId
    })
  });
}

// 🔧 НАЛАШТУВАННЯ WEBHOOK
function setWebhook() {
  const webAppUrl = 'https://script.google.com/macros/s/AKfycbzA3zUCxI1Gx9CVH_Eu2Ru-pjOrVT3NA-MDumOUH0tdU_BpiL5xDwqQjhWqyE5hQsvC/exec';
  
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
  const response = UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({
      url: webAppUrl
    })
  });
  
  console.log('Webhook встановлено:', response.getContentText());
  return response.getContentText();
}

// 🧪 ТЕСТ ФУНКЦІЙ
function testBot() {
  console.log('🧪 Тестування швидкого бота...');
  
  // Тест відправки повідомлення
  sendMessage(HR_CHAT_ID, '🧪 Тест швидкого HR бота!\n\nВсе працює коректно! ✅');
  
  return 'Тест завершено!';
}


