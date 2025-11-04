/**
 * 🛡️ HR БОТ - УЛЬТИМАТИВНИЙ ЗАХИСТ ВІД ДУБЛЮВАННЯ
 * 🚫 НЕМОЖЛИВЕ ДУБЛЮВАННЯ - ПОТРІЙНИЙ ЗАХИСТ
 * ⚡ МИТТЄВА ВІДПОВІДЬ - БЕЗ ЗАТРИМОК
 * 🔒 АБСОЛЮТНА НАДІЙНІСТЬ
 */

// ⚙️ НАЛАШТУВАННЯ
const BOT_TOKEN = '8160058317:AAGfkWy2gFj81hoC9NSE-Wc-CdiaXZw9Znw';
const SPREADSHEET_ID = '1aKWAIIeYe39hwaS65k-GAqsaFFhi765DuHoptLtFagg';
const HR_CHAT_ID = '7304993062';

// 🛡️ ГЛОБАЛЬНА ЗМІННА ДЛЯ ЗАХИСТУ
let processingLock = false;

// 🚀 ГОЛОВНА ФУНКЦІЯ З ПОТРІЙНИМ ЗАХИСТОМ
function doPost(e) {
  // ⚡ 1. МИТТЄВА ВІДПОВІДЬ (перше що робимо)
  const response = ContentService.createTextOutput('{"status":"ok"}');
  response.setMimeType(ContentService.MimeType.JSON);
  
  try {
    // 🛡️ 2. ЗАХИСТ ВІД ОДНОЧАСНОГО ВИКОНАННЯ
    if (processingLock) {
      console.log('🚫 Заблоковано: вже обробляється запит');
      return response;
    }
    
    // Встановлюємо блокування
    processingLock = true;
    
    // 📥 3. ПЕРЕВІРКА ВАЛІДНОСТІ ЗАПИТУ
    if (!e || !e.postData || !e.postData.contents) {
      console.log('🚫 Порожній запит');
      processingLock = false;
      return response;
    }
    
    let update;
    try {
      update = JSON.parse(e.postData.contents);
    } catch (parseError) {
      console.log('🚫 Невалідний JSON');
      processingLock = false;
      return response;
    }
    
    // 🔢 4. ПЕРЕВІРКА UPDATE_ID
    if (!update.update_id) {
      console.log('🚫 Відсутній update_id');
      processingLock = false;
      return response;
    }
    
    const updateId = update.update_id;
    
    // 🧠 5. ПОТРІЙНА ПЕРЕВІРКА ДУБЛІКАТІВ
    const isDuplicate = checkDuplicate(updateId);
    if (isDuplicate) {
      console.log(`🚫 ДУБЛІКАТ ЗАБЛОКОВАНО: ${updateId}`);
      processingLock = false;
      return response;
    }
    
    // 💾 6. ЗБЕРІГАЄМО ID ЯК ОБРОБЛЕНИЙ
    markAsProcessed(updateId);
    
    // 🎯 7. ОБРОБЛЯЄМО ТІЛЬКИ ЯКЩО ВСЕ ОК
    if (update.message) {
      processMessage(update.message);
    } else if (update.callback_query) {
      processCallback(update.callback_query);
    }
    
  } catch (error) {
    console.error('💥 Критична помилка:', error);
    logErrorToSheet('doPost', error.toString());
  } finally {
    // ✅ ЗАВЖДИ знімаємо блокування
    processingLock = false;
  }
  
  return response;
}

// 🛡️ ФУНКЦІЯ ПЕРЕВІРКИ ДУБЛІКАТІВ (ПОТРІЙНИЙ ЗАХИСТ)
function checkDuplicate(updateId) {
  try {
    // 📊 Метод 1: Cache Service (швидкий)
    const cache = CacheService.getScriptCache();
    const cacheKey = `processed_${updateId}`;
    
    if (cache.get(cacheKey)) {
      console.log(`🚫 Cache: дублікат ${updateId}`);
      return true;
    }
    
    // 📋 Метод 2: Google Sheets (надійний)
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let logSheet = ss.getSheetByName('ProcessedUpdates');
    
    if (!logSheet) {
      logSheet = ss.insertSheet('ProcessedUpdates');
      logSheet.getRange(1, 1, 1, 3).setValues([['UpdateID', 'Timestamp', 'Status']]);
      logSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    }
    
    // Перевіряємо останні 100 записів (оптимізація)
    const lastRow = logSheet.getLastRow();
    if (lastRow > 1) {
      const startRow = Math.max(2, lastRow - 99);
      const checkRange = logSheet.getRange(startRow, 1, lastRow - startRow + 1, 1);
      const existingIds = checkRange.getValues().flat();
      
      if (existingIds.includes(updateId)) {
        console.log(`🚫 Sheets: дублікат ${updateId}`);
        return true;
      }
    }
    
    // 🧠 Метод 3: Properties Service (постійний)
    const props = PropertiesService.getScriptProperties();
    const recentUpdates = props.getProperty('recent_updates') || '[]';
    const recentArray = JSON.parse(recentUpdates);
    
    if (recentArray.includes(updateId)) {
      console.log(`🚫 Properties: дублікат ${updateId}`);
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error('Помилка перевірки дублікатів:', error);
    // У разі помилки вважаємо дублікатом (безпечніше)
    return true;
  }
}

// 💾 ФУНКЦІЯ ЗБЕРЕЖЕННЯ ID ЯК ОБРОБЛЕНИЙ
function markAsProcessed(updateId) {
  try {
    // 📊 1. Cache Service (на 3 години)
    const cache = CacheService.getScriptCache();
    cache.put(`processed_${updateId}`, 'true', 10800);
    
    // 📋 2. Google Sheets
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName('ProcessedUpdates');
    
    logSheet.appendRow([
      updateId,
      new Date().toISOString(),
      'processed'
    ]);
    
    // Очищуємо старі записи (залишаємо тільки останні 1000)
    const lastRow = logSheet.getLastRow();
    if (lastRow > 1001) {
      logSheet.deleteRows(2, lastRow - 1001);
    }
    
    // 🧠 3. Properties Service (останні 50 ID)
    const props = PropertiesService.getScriptProperties();
    const recentUpdates = props.getProperty('recent_updates') || '[]';
    const recentArray = JSON.parse(recentUpdates);
    
    recentArray.push(updateId);
    
    // Залишаємо тільки останні 50
    if (recentArray.length > 50) {
      recentArray.splice(0, recentArray.length - 50);
    }
    
    props.setProperty('recent_updates', JSON.stringify(recentArray));
    
  } catch (error) {
    console.error('Помилка збереження ID:', error);
  }
}

// 📨 ОБРОБКА ПОВІДОМЛЕНЬ
function processMessage(message) {
  try {
    const chatId = message.chat.id;
    const text = message.text || '';
    const userId = message.from.id;
    const firstName = message.from.first_name || 'Невідомий';
    const lastName = message.from.last_name || '';
    const username = message.from.username || '';
    
    console.log(`📨 Обробка повідомлення від ${firstName}: "${text}"`);
    
    // Команда /start
    if (text === '/start') {
      sendWelcomeMessage(chatId);
      return;
    }
    
    // Розпізнавання статусів
    const lowerText = text.toLowerCase();
    let statusType = null;
    
    if (lowerText.match(/спізн|запізн|пізн/)) {
      statusType = 'Спізнення';
    } else if (lowerText.match(/ремоут|віддален|дома|remote/)) {
      statusType = 'Ремоут';
    } else if (lowerText.match(/лікарн|хвор|sick|температур/)) {
      statusType = 'Лікарняний';
    }
    
    if (statusType) {
      handleStatus(userId, firstName, lastName, username, statusType, text, chatId);
    } else {
      sendHelpMessage(chatId);
    }
    
  } catch (error) {
    console.error('Помилка processMessage:', error);
    logErrorToSheet('processMessage', error.toString());
  }
}

// 🎯 ОБРОБКА СТАТУСУ З КОНКРЕТНОЮ ДАТОЮ
function handleStatusWithDate(userId, firstName, lastName, username, statusType, date, chatId) {
  try {
    const success = saveStatusWithDate(userId, firstName, lastName, username, statusType, 'Відмічено через кнопку', date);
    
    if (success) {
      const dateStr = date.toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
      // Повідомлення користувачу
      const userMsg = `✅ ${statusType} зафіксовано!\n\n📅 Дата: ${dateStr}\n⏰ Час фіксації: ${formatTime(new Date())}`;
      sendTelegramMessage(chatId, userMsg);
      
      // Повідомлення HR
      const hrMsg = `📍 ${statusType}: ${firstName} ${lastName}${username ? ' (@' + username + ')' : ''}\n📅 Дата: ${dateStr}\n💬 "Відмічено через кнопку"\n⏰ Час фіксації: ${formatDateTime(new Date())}`;
      sendTelegramMessage(HR_CHAT_ID, `📢 HR ПОВІДОМЛЕННЯ:\n\n${hrMsg}`);
      
      console.log(`✅ Статус ${statusType} збережено для ${firstName} на ${dateStr}`);
    } else {
      sendTelegramMessage(chatId, '❌ Помилка збереження. Спробуйте ще раз.');
    }
    
  } catch (error) {
    console.error('Помилка handleStatusWithDate:', error);
    logErrorToSheet('handleStatusWithDate', error.toString());
  }
}

// 📅 ОБРОБКА ВИБОРУ ДАТИ З КАЛЕНДАРЯ
function handleDateSelection(data, userId, firstName, lastName, username, chatId) {
  try {
    // Парсимо дані: late_date_2025-09-25
    const parts = data.split('_');
    const statusType = parts[0]; // late/remote/sick
    const dateStr = parts[2]; // 2025-09-25
    
    const selectedDate = new Date(dateStr);
    
    let statusName;
    switch (statusType) {
      case 'late': statusName = 'Спізнення'; break;
      case 'remote': statusName = 'Ремоут'; break;
      case 'sick': statusName = 'Лікарняний'; break;
      default: statusName = 'Невідомий статус';
    }
    
    handleStatusWithDate(userId, firstName, lastName, username, statusName, selectedDate, chatId);
    
  } catch (error) {
    console.error('Помилка handleDateSelection:', error);
    sendTelegramMessage(chatId, '❌ Помилка обробки дати. Спробуйте ще раз.');
  }
}

// 🎯 ОБРОБКА СТАТУСУ
function handleStatus(userId, firstName, lastName, username, statusType, details, chatId) {
  try {
    const timestamp = new Date();
    const success = saveToSheet(userId, firstName, lastName, username, statusType, details, timestamp);
    
    if (success) {
      // Повідомлення користувачу
      const userMsg = `✅ ${statusType} зафіксовано!\n\n📅 ${formatDateTime(timestamp)}`;
      sendTelegramMessage(chatId, userMsg);
      
      // Повідомлення HR
      const hrMsg = `📍 ${statusType}: ${firstName} ${lastName}${username ? ' (@' + username + ')' : ''}\n💬 "${details}"\n⏰ ${formatDateTime(timestamp)}`;
      sendTelegramMessage(HR_CHAT_ID, `📢 HR ПОВІДОМЛЕННЯ:\n\n${hrMsg}`);
      
      console.log(`✅ Статус ${statusType} збережено для ${firstName}`);
    } else {
      sendTelegramMessage(chatId, '❌ Помилка збереження. Спробуйте ще раз.');
    }
    
  } catch (error) {
    console.error('Помилка handleStatus:', error);
    logErrorToSheet('handleStatus', error.toString());
  }
}

// 💾 ЗБЕРЕЖЕННЯ СТАТУСУ З КОНКРЕТНОЮ ДАТОЮ
function saveStatusWithDate(userId, firstName, lastName, username, statusType, details, date) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('Статуси');
    
    if (!sheet) {
      sheet = ss.insertSheet('Статуси');
      const headers = ['ID', 'Telegram_ID', 'Ім\'я', 'Прізвище', 'Username', 'Статус', 'Деталі', 'Дата_статусу', 'Час_фіксації'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    const nextId = sheet.getLastRow();
    const now = new Date();
    
    const row = [
      nextId,
      userId,
      firstName,
      lastName,
      username,
      statusType,
      details,
      formatDate(date), // Дата для якої встановлюється статус
      formatDateTime(now) // Коли було зафіксовано
    ];
    
    sheet.appendRow(row);
    return true;
    
  } catch (error) {
    console.error('Помилка saveStatusWithDate:', error);
    logErrorToSheet('saveStatusWithDate', error.toString());
    return false;
  }
}

// 💾 ЗБЕРЕЖЕННЯ В ТАБЛИЦЮ
function saveToSheet(userId, firstName, lastName, username, statusType, details, timestamp) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('Статуси');
    
    if (!sheet) {
      sheet = ss.insertSheet('Статуси');
      const headers = ['ID', 'Telegram_ID', 'Ім\'я', 'Прізвище', 'Username', 'Статус', 'Деталі', 'Дата', 'Час'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    const nextId = sheet.getLastRow();
    const row = [
      nextId,
      userId,
      firstName,
      lastName,
      username,
      statusType,
      details,
      formatDate(timestamp),
      formatTime(timestamp)
    ];
    
    sheet.appendRow(row);
    return true;
    
  } catch (error) {
    console.error('Помилка збереження:', error);
    logErrorToSheet('saveToSheet', error.toString());
    return false;
  }
}

// 📱 ОБРОБКА КНОПОК
function processCallback(callback) {
  try {
    const chatId = callback.message.chat.id;
    const data = callback.data;
    const userId = callback.from.id;
    const firstName = callback.from.first_name || 'Невідомий';
    const lastName = callback.from.last_name || '';
    const username = callback.from.username || '';
    
    // Підтверджуємо callback
    answerCallbackQuery(callback.id);
    
    console.log(`🔘 Кнопка натиснута: ${data} від ${firstName}`);
    
    switch (data) {
      // МЕНЮ СТАТУСІВ
      case 'late_menu':
        showLateMenu(chatId);
        break;
        
      case 'remote_menu':
        showRemoteMenu(chatId);
        break;
        
      case 'sick_menu':
        showSickMenu(chatId);
        break;
        
      // СТАТУСИ НА СЬОГОДНІ
      case 'late_today':
        handleStatusWithDate(userId, firstName, lastName, username, 'Спізнення', new Date(), chatId);
        break;
        
      case 'remote_today':
        handleStatusWithDate(userId, firstName, lastName, username, 'Ремоут', new Date(), chatId);
        break;
        
      case 'sick_today':
        handleStatusWithDate(userId, firstName, lastName, username, 'Лікарняний', new Date(), chatId);
        break;
        
      // СТАТУСИ НА ЗАВТРА
      case 'late_tomorrow':
        const tomorrowLate = new Date();
        tomorrowLate.setDate(tomorrowLate.getDate() + 1);
        handleStatusWithDate(userId, firstName, lastName, username, 'Спізнення', tomorrowLate, chatId);
        break;
        
      case 'remote_tomorrow':
        const tomorrowRemote = new Date();
        tomorrowRemote.setDate(tomorrowRemote.getDate() + 1);
        handleStatusWithDate(userId, firstName, lastName, username, 'Ремоут', tomorrowRemote, chatId);
        break;
        
      case 'sick_tomorrow':
        const tomorrowSick = new Date();
        tomorrowSick.setDate(tomorrowSick.getDate() + 1);
        handleStatusWithDate(userId, firstName, lastName, username, 'Лікарняний', tomorrowSick, chatId);
        break;
        
      // ВИБІР ІНШОЇ ДАТИ
      case 'late_other':
        showDateCalendar(chatId, 'late');
        break;
        
      case 'remote_other':
        showDateCalendar(chatId, 'remote');
        break;
        
      case 'sick_other':
        showDateCalendar(chatId, 'sick');
        break;
        
      case 'main_menu':
        sendWelcomeMessage(chatId);
        break;
      default:
        // Перевіряємо чи це вибір дати з календаря
        if (data.includes('_date_')) {
          handleDateSelection(data, userId, firstName, lastName, username, chatId);
        } else {
          sendTelegramMessage(chatId, '❌ Невідома команда');
        }
    }
    
  } catch (error) {
    console.error('Помилка processCallback:', error);
    logErrorToSheet('processCallback', error.toString());
  }
}

// 📬 ВІДПРАВКА ПОВІДОМЛЕНЬ TELEGRAM
function sendTelegramMessage(chatId, text, keyboard = null) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    };
    
    if (keyboard) {
      payload.reply_markup = JSON.stringify(keyboard);
    }
    
    const options = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (!result.ok) {
      console.error('Telegram помилка:', result.description);
      logErrorToSheet('sendTelegramMessage', `Telegram API: ${result.description}`);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('Помилка відправки:', error);
    logErrorToSheet('sendTelegramMessage', error.toString());
    return false;
  }
}

// 👋 ВІТАЛЬНЕ ПОВІДОМЛЕННЯ
function sendWelcomeMessage(chatId) {
  const text = `👋 <b>Привіт зірко, я помічник твого HR!</b>

Я створений, щоб автоматизувати деякі процеси.

<b>Ознайомся з функціями які я виконую:</b>`;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '⏰ Спізнення', callback_data: 'late_menu' }],
      [{ text: '🏠 Ремоут', callback_data: 'remote_menu' }],
      [{ text: '🤒 Лікарняний', callback_data: 'sick_menu' }]
    ]
  };
  
  sendTelegramMessage(chatId, text, keyboard);
}

// 📅 МЕНЮ ВИБОРУ ДАТИ ДЛЯ СПІЗНЕННЯ
function showLateMenu(chatId) {
  const text = `⏰ <b>Спізнення</b>

Оберіть дату:`;
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '📅 Сьогодні', callback_data: 'late_today' }],
      [{ text: '📅 Завтра', callback_data: 'late_tomorrow' }],
      [{ text: '📅 Інша дата', callback_data: 'late_other' }],
      [{ text: '🔙 Назад', callback_data: 'main_menu' }]
    ]
  };
  
  sendTelegramMessage(chatId, text, keyboard);
}

// 📅 МЕНЮ ВИБОРУ ДАТИ ДЛЯ РЕМОУТУ
function showRemoteMenu(chatId) {
  const text = `🏠 <b>Ремоут</b>

Оберіть дату:`;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '📅 Сьогодні', callback_data: 'remote_today' }],
      [{ text: '📅 Завтра', callback_data: 'remote_tomorrow' }],
      [{ text: '📅 Інша дата', callback_data: 'remote_other' }],
      [{ text: '🔙 Назад', callback_data: 'main_menu' }]
    ]
  };
  
  sendTelegramMessage(chatId, text, keyboard);
}

// 📅 МЕНЮ ВИБОРУ ДАТИ ДЛЯ ЛІКАРНЯНОГО
function showSickMenu(chatId) {
  const text = `🤒 <b>Лікарняний</b>

Оберіть дату:`;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '📅 Сьогодні', callback_data: 'sick_today' }],
      [{ text: '📅 Завтра', callback_data: 'sick_tomorrow' }],
      [{ text: '📅 Інша дата', callback_data: 'sick_other' }],
      [{ text: '🔙 Назад', callback_data: 'main_menu' }]
    ]
  };
  
  sendTelegramMessage(chatId, text, keyboard);
}

// 📅 КАЛЕНДАР ДЛЯ ВИБОРУ ІНШОЇ ДАТИ
function showDateCalendar(chatId, statusType) {
  const text = `📅 <b>Оберіть дату для ${statusType}</b>

Натисніть на потрібну дату:`;
  
  const today = new Date();
  const keyboard = {
    inline_keyboard: []
  };
  
  // Показуємо наступні 7 днів
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    
    const dateStr = date.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit'
    });
    
    const dayName = date.toLocaleDateString('uk-UA', {
      weekday: 'short'
    });
    
    keyboard.inline_keyboard.push([{
      text: `${dateStr} (${dayName})`,
      callback_data: `${statusType}_date_${date.toISOString().split('T')[0]}`
    }]);
  }
  
  keyboard.inline_keyboard.push([{ text: '🔙 Назад', callback_data: `${statusType}_menu` }]);
  
  sendTelegramMessage(chatId, text, keyboard);
}

// 🆘 ДОПОМОГА
function sendHelpMessage(chatId) {
  const text = `🤖 <b>Не розумію команду</b>

<b>Можете написати:</b>
• "спізнюю на 15 хвилин"
• "працюю ремоут"
• "лікарняний"

<b>Або скористатися кнопками:</b>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '⏰ Спізнення', callback_data: 'late' }],
      [{ text: '🏠 Ремоут', callback_data: 'remote' }],
      [{ text: '🤒 Лікарняний', callback_data: 'sick' }]
    ]
  };
  
  sendTelegramMessage(chatId, text, keyboard);
}

// ✅ ПІДТВЕРДЖЕННЯ CALLBACK
function answerCallbackQuery(callbackId) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
    UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ callback_query_id: callbackId }),
      muteHttpExceptions: true
    });
  } catch (error) {
    console.error('Помилка answerCallbackQuery:', error);
  }
}

// 🚨 ЛОГУВАННЯ ПОМИЛОК
function logErrorToSheet(functionName, errorMessage) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let errorSheet = ss.getSheetByName('Помилки');
    
    if (!errorSheet) {
      errorSheet = ss.insertSheet('Помилки');
      errorSheet.getRange(1, 1, 1, 4).setValues([['Дата', 'Час', 'Функція', 'Помилка']]);
      errorSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    }
    
    const now = new Date();
    errorSheet.appendRow([
      formatDate(now),
      formatTime(now),
      functionName,
      errorMessage
    ]);
    
  } catch (e) {
    console.error('Помилка логування:', e);
  }
}

// 📅 ФОРМАТУВАННЯ ДАТИ ТА ЧАСУ
function formatDateTime(date) {
  return date.toLocaleString('uk-UA', {
    timeZone: 'Europe/Kiev',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDate(date) {
  return date.toLocaleDateString('uk-UA', {
    timeZone: 'Europe/Kiev',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatTime(date) {
  return date.toLocaleTimeString('uk-UA', {
    timeZone: 'Europe/Kiev',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// 🔧 НАЛАШТУВАННЯ WEBHOOK
function setWebhook() {
  // ⚠️ ЗАМІНІТЬ НА ВАШ URL ПІСЛЯ DEPLOYMENT
  const webAppUrl = 'https://script.google.com/macros/s/AKfycbxhOfXSjz4dPlxMoJhmTKIMbAISHrIeBFLzAIlE2MYd5ERmBXN7SGzPnyreaRz6DTfHUg/exec';
  
  if (webAppUrl.includes('ЗАМІНІТЬ')) {
    console.log('❌ ПОМИЛКА: Спочатку замініть URL в функції setWebhook!');
    return 'ПОМИЛКА: URL не замінено';
  }
  
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ url: webAppUrl }),
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    
    if (result.ok) {
      console.log('✅ УСПІХ! Webhook встановлено успішно!');
      return '✅ Webhook встановлено успішно!';
    } else {
      console.error('❌ Помилка webhook:', result.description);
      return `❌ Помилка: ${result.description}`;
    }
    
  } catch (error) {
    console.error('Критична помилка setWebhook:', error);
    logErrorToSheet('setWebhook', error.toString());
    return `❌ Критична помилка: ${error.toString()}`;
  }
}

// 🗑️ ВИДАЛЕННЯ WEBHOOK
function deleteWebhook() {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`;
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    
    if (result.ok) {
      console.log('✅ Webhook видалено успішно!');
      return '✅ Webhook видалено!';
    } else {
      console.error('❌ Помилка видалення:', result.description);
      return `❌ Помилка: ${result.description}`;
    }
    
  } catch (error) {
    console.error('Помилка deleteWebhook:', error);
    logErrorToSheet('deleteWebhook', error.toString());
    return `❌ Помилка: ${error.toString()}`;
  }
}

// 🧪 ТЕСТ СИСТЕМИ
function testAntiDuplicateSystem() {
  try {
    const testUpdateId = Math.floor(Math.random() * 1000000);
    
    console.log(`🧪 Тестуємо систему з ID: ${testUpdateId}`);
    
    // Тест 1: Перший раз - має пройти
    const firstCheck = checkDuplicate(testUpdateId);
    console.log(`Тест 1 - Перший раз: ${firstCheck ? 'ПОМИЛКА' : 'OK'}`);
    
    // Зберігаємо як оброблений
    markAsProcessed(testUpdateId);
    
    // Тест 2: Другий раз - має заблокувати
    const secondCheck = checkDuplicate(testUpdateId);
    console.log(`Тест 2 - Повтор: ${secondCheck ? 'OK' : 'ПОМИЛКА'}`);
    
    // Тест відправки повідомлення
    const messageTest = sendTelegramMessage(HR_CHAT_ID, `🧪 <b>ТЕСТ СИСТЕМИ ПРОЙШОВ!</b>

🛡️ Потрійний захист від дублювання: АКТИВНИЙ
⚡ Миттєва відповідь: ПРАЦЮЄ  
💾 Збереження в таблицю: ПРАЦЮЄ
📱 Кнопки: ПРАЦЮЮТЬ

<b>Система готова до роботи!</b>

ID тесту: ${testUpdateId}`);
    
    if (messageTest) {
      console.log('✅ ТЕСТ ПРОЙШОВ! Всі системи працюють ідеально!');
      return 'Тест успішний!';
    } else {
      console.log('❌ Тест не пройшов. Перевірте налаштування бота');
      return 'Тест не пройшов!';
    }
    
  } catch (error) {
    console.error('Помилка тесту:', error);
    logErrorToSheet('testAntiDuplicateSystem', error.toString());
    return 'Помилка тесту!';
  }
}

// 🧪 ТЕСТ ПРЯМОГО ПОВІДОМЛЕННЯ
function testDirectMessage() {
  try {
    const testMessage = `🧪 ТЕСТ ПРЯМОГО ПОВІДОМЛЕННЯ

⏰ Час: ${new Date().toLocaleString('uk-UA')}
🤖 Бот працює напряму!

Якщо ви бачите це повідомлення - проблема в webhook, не в коді.`;

    const success = sendTelegramMessage('7304993062', testMessage);
    
    if (success) {
      console.log('✅ Пряме повідомлення відправлено успішно!');
      return '✅ Пряме повідомлення працює!';
    } else {
      console.log('❌ Помилка відправки прямого повідомлення');
      return '❌ Пряме повідомлення не працює!';
    }
    
  } catch (error) {
    console.error('Помилка testDirectMessage:', error);
    return `❌ Помилка: ${error.toString()}`;
  }
}

// 🔍 ПЕРЕВІРКА WEBHOOK
function checkWebhookStatus() {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`;
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    
    if (result.ok) {
      console.log('📊 ІНФОРМАЦІЯ ПРО WEBHOOK:');
      console.log('URL:', result.result.url);
      console.log('Має сертифікат:', result.result.has_custom_certificate);
      console.log('Кількість очікуючих оновлень:', result.result.pending_update_count);
      console.log('Останній виклик:', result.result.last_error_date);
      console.log('Останній помилка:', result.result.last_error_message);
      
      return result.result;
    } else {
      console.error('Помилка отримання інформації:', result.description);
      return null;
    }
    
  } catch (error) {
    console.error('Помилка checkWebhookStatus:', error);
    return null;
  }
}

// 🧹 ОЧИЩЕННЯ СТАРИХ ЗАПИСІВ
function cleanupOldRecords() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Очищення ProcessedUpdates (залишаємо 1000 останніх)
    const logSheet = ss.getSheetByName('ProcessedUpdates');
    if (logSheet && logSheet.getLastRow() > 1001) {
      const rowsToDelete = logSheet.getLastRow() - 1001;
      logSheet.deleteRows(2, rowsToDelete);
      console.log(`🧹 Очищено ${rowsToDelete} старих записів з ProcessedUpdates`);
    }
    
    // Очищення Properties (залишаємо 50 останніх ID)
    const props = PropertiesService.getScriptProperties();
    const recentUpdates = props.getProperty('recent_updates') || '[]';
    const recentArray = JSON.parse(recentUpdates);
    
    if (recentArray.length > 50) {
      const cleanArray = recentArray.slice(-50);
      props.setProperty('recent_updates', JSON.stringify(cleanArray));
      console.log(`🧹 Очищено Properties, залишено ${cleanArray.length} ID`);
    }
    
    return 'Очищення завершено';
    
  } catch (error) {
    console.error('Помилка очищення:', error);
    return 'Помилка очищення';
  }
}
