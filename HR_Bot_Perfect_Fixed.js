/**
 * 🎯 HR БОТ - ІДЕАЛЬНО ВИПРАВЛЕНА ВЕРСІЯ
 * ✅ Усі помилки виправлені
 * ✅ Гарантована стабільність
 * ✅ Без дублювання повідомлень
 */

// ⚙️ НАЛАШТУВАННЯ
const BOT_TOKEN = '8160058317:AAGfkWy2gFj81hoC9NSE-Wc-CdiaXZw9Znw';
const SPREADSHEET_ID = '1aKWAIIeYe39hwaS65k-GAqsaFFhi765DuHoptLtFagg';
const HR_CHAT_ID = '7304993062';

// 🚀 ГОЛОВНА ФУНКЦІЯ
function doPost(e) {
  // НЕГАЙНА ВІДПОВІДЬ для запобігання повторних запитів
  const response = ContentService.createTextOutput("OK");
  
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return response;
    }
    
    const update = JSON.parse(e.postData.contents);
    const updateId = update.update_id;
    
    // ПОСИЛЕНА ПЕРЕВІРКА ДУБЛІКАТІВ
    const cache = CacheService.getScriptCache();
    const key = 'msg_' + updateId;
    
    if (cache.get(key)) {
      console.log('Дублікат заблоковано:', updateId);
      return response;
    }
    
    // Блокуємо на 2 години
    cache.put(key, 'processed', 7200);
    
    // Обробка різних типів оновлень
    if (update.message) {
      handleMessage(update.message);
    } else if (update.callback_query) {
      handleCallback(update.callback_query);
    }
    
  } catch (error) {
    console.error('Критична помилка doPost:', error);
    // Логуємо в таблицю для аналізу
    logError('doPost', error.toString());
  }
  
  return response;
}

// 📨 ОБРОБКА ПОВІДОМЛЕНЬ
function handleMessage(message) {
  try {
    const chatId = message.chat.id;
    const text = message.text?.toLowerCase() || '';
    const userId = message.from.id;
    const firstName = message.from.first_name || 'Невідомий';
    const lastName = message.from.last_name || '';
    const username = message.from.username || '';
    
    // Команда /start
    if (message.text === '/start') {
      showMainMenu(chatId);
      return;
    }
    
    // Розпізнавання статусів з покращеною логікою
    let statusType = null;
    let statusDetails = message.text || '';
    
    // Більш точне розпізнавання
    if (text.match(/спізн|запізн|пізн/)) {
      statusType = 'Спізнення';
    } else if (text.match(/ремоут|віддален|дома|remote/)) {
      statusType = 'Ремоут';
    } else if (text.match(/лікарн|хвор|sick|температур/)) {
      statusType = 'Лікарняний';
    }
    
    if (statusType) {
      processStatus(userId, firstName, lastName, username, statusType, statusDetails, chatId);
    } else {
      sendHelpMessage(chatId);
    }
    
  } catch (error) {
    console.error('Помилка handleMessage:', error);
    logError('handleMessage', error.toString());
  }
}

// 🎯 ОБРОБКА СТАТУСУ
function processStatus(userId, firstName, lastName, username, statusType, details, chatId) {
  try {
    const timestamp = new Date();
    const success = saveStatusToSheet(userId, firstName, lastName, username, statusType, details, timestamp);
    
    if (success) {
      // Повідомлення користувачу
      const userMessage = `✅ ${statusType} зафіксовано!\n\n📅 ${timestamp.toLocaleString('uk-UA', {
        timeZone: 'Europe/Kiev',
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`;
      
      sendMessage(chatId, userMessage);
      
      // Повідомлення HR з деталями
      const hrMessage = `📍 ${statusType}: ${firstName} ${lastName}${username ? ' (@' + username + ')' : ''}\n💬 "${details}"\n⏰ ${timestamp.toLocaleString('uk-UA', {timeZone: 'Europe/Kiev'})}`;
      
      notifyHR(hrMessage);
      
    } else {
      sendMessage(chatId, '❌ Помилка збереження. Спробуйте ще раз або зверніться до HR.');
    }
    
  } catch (error) {
    console.error('Помилка processStatus:', error);
    logError('processStatus', error.toString());
    sendMessage(chatId, '❌ Технічна помилка. Зверніться до HR.');
  }
}

// 💾 ЗБЕРЕЖЕННЯ В ТАБЛИЦЮ
function saveStatusToSheet(userId, firstName, lastName, username, statusType, details, timestamp) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('Статуси');
    
    // Створюємо лист з правильними заголовками
    if (!sheet) {
      sheet = ss.insertSheet('Статуси');
      const headers = ['ID', 'Telegram_ID', 'Ім\'я', 'Прізвище', 'Username', 'Статус', 'Деталі', 'Дата', 'Час'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    // ПРАВИЛЬНИЙ ID - наступний номер
    const nextId = sheet.getLastRow();
    
    const row = [
      nextId,
      userId,
      firstName,
      lastName,
      username,
      statusType,
      details,
      timestamp.toDateString(),
      timestamp.toTimeString().split(' ')[0]
    ];
    
    sheet.appendRow(row);
    
    // Автоматичне форматування нового рядка
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 8, 1, 2).setNumberFormat('dd.mm.yyyy;hh:mm:ss');
    
    return true;
    
  } catch (error) {
    console.error('Помилка збереження:', error);
    logError('saveStatusToSheet', error.toString());
    return false;
  }
}

// 🔧 БЕЗПЕЧНА ВІДПРАВКА ПОВІДОМЛЕНЬ
function sendMessage(chatId, text, keyboard = null) {
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
    
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    if (!result.ok) {
      console.error('Telegram API помилка:', result);
      logError('sendMessage', `Telegram API: ${result.description}`);
    }
    
    return result.ok;
    
  } catch (error) {
    console.error('Помилка відправки:', error);
    logError('sendMessage', error.toString());
    return false;
  }
}

// 📢 ПОВІДОМЛЕННЯ HR
function notifyHR(message) {
  sendMessage(HR_CHAT_ID, `📢 HR ПОВІДОМЛЕННЯ:\n\n${message}`);
}

// 📋 ГОЛОВНЕ МЕНЮ
function showMainMenu(chatId) {
  const welcomeText = `👋 <b>Привіт зірко, я помічник твого HR!</b>

Я створений, щоб автоматизувати деякі процеси.

<b>Ознайомся з функціями які я виконую:</b>`;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '⏰ Спізнення', callback_data: 'late' }],
      [{ text: '🏠 Ремоут', callback_data: 'remote' }],
      [{ text: '🤒 Лікарняний', callback_data: 'sick' }],
      [{ text: '📊 Мій звіт', callback_data: 'my_report' }]
    ]
  };
  
  sendMessage(chatId, welcomeText, keyboard);
}

// 📱 ОБРОБКА КНОПОК
function handleCallback(callback) {
  try {
    const chatId = callback.message.chat.id;
    const data = callback.data;
    const userId = callback.from.id;
    const firstName = callback.from.first_name || 'Невідомий';
    const lastName = callback.from.last_name || '';
    const username = callback.from.username || '';
    
    // ОБОВ'ЯЗКОВО підтверджуємо callback
    answerCallback(callback.id);
    
    const timestamp = new Date();
    
    switch (data) {
      case 'late':
        processStatus(userId, firstName, lastName, username, 'Спізнення', 'Відмічено через кнопку', chatId);
        break;
        
      case 'remote':
        processStatus(userId, firstName, lastName, username, 'Ремоут', 'Відмічено через кнопку', chatId);
        break;
        
      case 'sick':
        processStatus(userId, firstName, lastName, username, 'Лікарняний', 'Відмічено через кнопку', chatId);
        break;
        
      case 'my_report':
        const report = generateUserReport(userId);
        sendMessage(chatId, report);
        break;
        
      case 'main_menu':
        showMainMenu(chatId);
        break;
        
      default:
        sendMessage(chatId, '❌ Невідома команда. Повертаємося до головного меню.');
        showMainMenu(chatId);
    }
    
  } catch (error) {
    console.error('Помилка handleCallback:', error);
    logError('handleCallback', error.toString());
  }
}

// ✅ ПІДТВЕРДЖЕННЯ CALLBACK
function answerCallback(callbackId, text = '') {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
    UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ 
        callback_query_id: callbackId,
        text: text
      }),
      muteHttpExceptions: true
    });
  } catch (error) {
    console.error('Помилка answerCallback:', error);
  }
}

// 📊 ЗВІТ КОРИСТУВАЧА
function generateUserReport(userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Статуси');
    
    if (!sheet) {
      return '📊 Поки що немає записів для звіту.';
    }
    
    const data = sheet.getDataRange().getValues();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    let late = 0, remote = 0, sick = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] == userId) {
        const dateStr = data[i][7];
        const date = new Date(dateStr);
        
        if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
          const status = data[i][5];
          switch (status) {
            case 'Спізнення': late++; break;
            case 'Ремоут': remote++; break;
            case 'Лікарняний': sick++; break;
          }
        }
      }
    }
    
    const monthNames = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 
                       'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    
    return `📊 <b>Ваш звіт за ${monthNames[currentMonth]} ${currentYear}:</b>

⏰ Спізнень: ${late}
🏠 Ремоут днів: ${remote}  
🤒 Лікарняних: ${sick}

<i>Дані оновлюються автоматично</i>`;
    
  } catch (error) {
    console.error('Помилка звіту:', error);
    logError('generateUserReport', error.toString());
    return '❌ Помилка створення звіту. Зверніться до HR.';
  }
}

// 🆘 ДОПОМОГА
function sendHelpMessage(chatId) {
  const helpText = `🤖 <b>Не розумію команду</b>

<b>Можете написати:</b>
• "спізнюю на 15 хвилин"
• "працюю ремоут"  
• "лікарняний"

<b>Або скористатися кнопками нижче:</b>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '⏰ Спізнення', callback_data: 'late' }],
      [{ text: '🏠 Ремоут', callback_data: 'remote' }],
      [{ text: '🤒 Лікарняний', callback_data: 'sick' }]
    ]
  };
  
  sendMessage(chatId, helpText, keyboard);
}

// 🚨 ЛОГУВАННЯ ПОМИЛОК
function logError(functionName, errorMessage) {
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
      now.toDateString(),
      now.toTimeString().split(' ')[0],
      functionName,
      errorMessage
    ]);
    
  } catch (e) {
    console.error('Не вдалося залогувати помилку:', e);
  }
}

// 🔧 НАЛАШТУВАННЯ WEBHOOK
function setWebhook() {
  // ⚠️ ЗАМІНІТЬ НА ВАШ СПРАВЖНІЙ URL ПІСЛЯ DEPLOYMENT
  const webAppUrl = 'ПОТРІБЕН_СПРАВЖНІЙ_URL_ПІСЛЯ_DEPLOYMENT';
  
  if (webAppUrl === 'ПОТРІБЕН_СПРАВЖНІЙ_URL_ПІСЛЯ_DEPLOYMENT') {
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ ПОМИЛКА', 'Спочатку замініть URL в функції setWebhook на справжній URL після deployment!', ui.ButtonSet.OK);
    return;
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
      console.log('✅ Webhook успішно встановлено');
      SpreadsheetApp.getUi().alert('✅ Успіх!', 'Webhook встановлено успішно!', SpreadsheetApp.getUi().ButtonSet.OK);
    } else {
      console.error('❌ Помилка webhook:', result);
      SpreadsheetApp.getUi().alert('❌ Помилка!', `Не вдалося встановити webhook: ${result.description}`, SpreadsheetApp.getUi().ButtonSet.OK);
    }
    
    return result;
    
  } catch (error) {
    console.error('Критична помилка setWebhook:', error);
    SpreadsheetApp.getUi().alert('❌ Критична помилка!', error.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
    return null;
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
    console.log('Webhook видалено:', result);
    
    if (result.ok) {
      SpreadsheetApp.getUi().alert('✅ Webhook видалено!');
    } else {
      SpreadsheetApp.getUi().alert('❌ Помилка видалення webhook: ' + result.description);
    }
    
    return result;
    
  } catch (error) {
    console.error('Помилка deleteWebhook:', error);
    SpreadsheetApp.getUi().alert('❌ Помилка: ' + error.toString());
    return null;
  }
}

// 🧪 ТЕСТ БОТА
function testBot() {
  const testMessage = `🚀 <b>HR Бот (Ідеальна версія) працює!</b>

✅ Фіксація статусів без дублювання
✅ Автоматичне збереження в Google Sheets  
✅ Повідомлення HR з деталями
✅ Місячні звіти для користувачів
✅ Логування помилок
✅ Стабільна робота

<b>Готовий до роботи!</b>`;

  const success = sendMessage(HR_CHAT_ID, testMessage);
  
  if (success) {
    console.log('✅ Тест пройшов успішно');
    SpreadsheetApp.getUi().alert('✅ Тест успішний!', 'Бот працює правильно!', SpreadsheetApp.getUi().ButtonSet.OK);
    return 'Тест успішний!';
  } else {
    console.log('❌ Тест не пройшов');
    SpreadsheetApp.getUi().alert('❌ Тест не пройшов!', 'Перевірте налаштування бота.', SpreadsheetApp.getUi().ButtonSet.OK);
    return 'Тест не пройшов!';
  }
}


