# ⚡ ШВИДКЕ ВИПРАВЛЕННЯ RAILWAY

## 🎯 ПРОБЛЕМА:
Railway не може підключитись до Google Sheets через старий метод аутентифікації.

## ✅ РІШЕННЯ (2 ХВИЛИНИ):

### **ВАРІАНТ 1: ЗМІНА START COMMAND (НАЙШВИДШИЙ)**

1. **Відкрийте ваш проект в Railway**
2. **Перейдіть: Settings → Deploy**
3. **Знайдіть "Start Command"**
4. **Змініть з:**
   ```
   npm start
   ```
   **НА:**
   ```
   node server_fixed.js
   ```
5. **Збережіть (Save/Deploy)**
6. **Дочекайтесь перезапуску (1-2 хв)**

---

### **ВАРІАНТ 2: ОНОВЛЕННЯ server.js В GITHUB**

1. **Перейдіть на GitHub:**
   https://github.com/alonalozova/HR-/blob/main/server.js

2. **Натисніть "Edit" (олівець)**

3. **Знайдіть рядки 31-48** (функція `initGoogleSheets`)

4. **ЗАМІНІТЬ:**
```javascript
// 📊 ІНІЦІАЛІЗАЦІЯ GOOGLE SHEETS
let doc;
async function initGoogleSheets() {
  try {
    doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    
    // Аутентифікація через service account
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
    
    await doc.loadInfo();
    console.log('✅ Google Sheets підключено:', doc.title);
    
    // Створюємо таблиці якщо їх немає
    await ensureAllSheets();
    
  } catch (error) {
    console.error('❌ Помилка підключення до Google Sheets:', error);
    process.exit(1);
  }
}
```

**НА:**
```javascript
// 📊 ІНІЦІАЛІЗАЦІЯ GOOGLE SHEETS
let doc;
async function initGoogleSheets() {
  try {
    const { JWT } = require('google-auth-library');
    
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
```

5. **Commit changes:** "Fix Google Sheets authentication"

6. **Railway автоматично перезапустить** додаток

---

### **ВАРІАНТ 3: ОНОВЛЕННЯ package.json**

Якщо варіанти 1-2 не спрацювали:

1. **GitHub:** https://github.com/alonalozova/HR-/blob/main/package.json

2. **Edit файл**

3. **В секції dependencies додайте:**
```json
"google-auth-library": "^9.6.3",
```

4. **Має бути:**
```json
"dependencies": {
  "express": "^4.18.2",
  "node-telegram-bot-api": "^0.64.0",
  "google-spreadsheet": "^4.1.2",
  "google-auth-library": "^9.6.3",
  "dotenv": "^16.3.1"
}
```

5. **Commit changes**

6. **Railway перезапустить додаток**

---

## ✅ ПЕРЕВІРКА ПІСЛЯ ВИПРАВЛЕННЯ:

### Логи Railway мають показати:
```
✅ Google Sheets підключено: HR_Статуси
✅ Webhook встановлено
🚀 HR Bot запущено на порту 3000
```

### Тестування:
1. Відкрийте Railway URL в браузері
2. Має бути: `{"status":"OK","sheets_connected":true}`
3. В Telegram напишіть `/start`

---

## 🎯 РЕКОМЕНДАЦІЯ:

**ВИКОРИСТАЙТЕ ВАРІАНТ 1** - найшвидший та найпростіший!

Просто змініть Start Command на `node server_fixed.js` і все запрацює! 🚀

