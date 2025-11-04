/**
 * 🧪 МІНІМАЛЬНИЙ ТЕСТОВИЙ БОТ
 * Тільки базовий функціонал для діагностики
 */

const BOT_TOKEN = '8160058317:AAGfkWy2gFj81hoC9NSE-Wc-CdiaXZw9Znw';
const HR_CHAT_ID = '7304993062';

// 🚀 ГОЛОВНА ФУНКЦІЯ
function doPost(e) {
  try {
    // Логуємо що прийшло
    console.log('📥 Отримано запит:', e.postData.contents);
    
    const update = JSON.parse(e.postData.contents);
    
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      
      console.log(`📨 Повідомлення від ${chatId}: "${text}"`);
      
      if (text === '/start') {
        sendSimpleMessage(chatId, '🎉 Мінімальний бот працює!\n\nЯкщо ви бачите це - webhook працює правильно!');
      } else {
        sendSimpleMessage(chatId, `📝 Ви написали: "${text}"`);
      }
    }
    
  } catch (error) {
    console.error('❌ Помилка:', error);
  }
  
  return ContentService.createTextOutput('OK');
}

// 📤 ВІДПРАВКА ПОВІДОМЛЕННЯ
function sendSimpleMessage(chatId, text) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
    
    console.log('✅ Повідомлення відправлено:', response.getContentText());
    return true;
    
  } catch (error) {
    console.error('❌ Помилка відправки:', error);
    return false;
  }
}

// 🔧 ВСТАНОВЛЕННЯ WEBHOOK
function setMinimalWebhook() {
  const webAppUrl = 'ВАШ_URL_ТУТ';
  
  if (webAppUrl === 'ВАШ_URL_ТУТ') {
    console.log('❌ Спочатку замініть URL!');
    return;
  }
  
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
    
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ url: webAppUrl })
    });
    
    const result = JSON.parse(response.getContentText());
    
    if (result.ok) {
      console.log('✅ Мінімальний webhook встановлено!');
    } else {
      console.log('❌ Помилка webhook:', result.description);
    }
    
  } catch (error) {
    console.error('❌ Критична помилка:', error);
  }
}

// 🧪 ТЕСТ
function testMinimalBot() {
  sendSimpleMessage(HR_CHAT_ID, '🧪 Тест мінімального бота!\n\nЯкщо бачите це - код працює.');
  console.log('Тест відправлено');
}


