# 🔧 ВИПРАВЛЕННЯ ПОМИЛКИ RAILWAY

## ❌ **ПРОБЛЕМА:**
```
TypeError: doc.useServiceAccountAuth is not a function
```

## ✅ **РІШЕННЯ:**

### **ВАРІАНТ 1: Використовуйте server_fixed.js (РЕКОМЕНДОВАНО)**

1. **В Railway → Settings:**
   - Знайдіть **"Start Command"**
   - Змініть з `npm start` на:
   ```
   node server_fixed.js
   ```
   - Збережіть зміни
   - Railway автоматично перезапустить додаток

### **ВАРІАНТ 2: Оновіть package.json та перезавантажте**

1. **В GitHub репозиторії:**
   - Відкрийте файл `package.json`
   - Додайте в `dependencies`:
   ```json
   "google-auth-library": "^9.6.3"
   ```

2. **В Railway:**
   - Перейдіть в **Deployments**
   - Натисніть **"Redeploy"**
   - Дочекайтесь завершення

---

## 📋 **ПЕРЕВІРКА ПІСЛЯ ВИПРАВЛЕННЯ:**

### **1. Перевірте логи Railway:**
Має бути:
```
✅ Google Sheets підключено: [назва таблиці]
✅ Webhook встановлено: https://your-app.up.railway.app/webhook
🚀 HR Bot запущено на порту 3000
```

### **2. Перевірте Health Check:**
Відкрийте ваш Railway URL, має бути:
```json
{
  "status": "OK",
  "message": "HR Bot is running",
  "version": "1.0.1-fixed",
  "sheets_connected": true
}
```

### **3. Протестуйте бота:**
В Telegram напишіть `/start`

---

## 🔑 **ПЕРЕКОНАЙТЕСЬ ЩО ВСІ ENVIRONMENT VARIABLES ДОДАНО:**

```env
✅ BOT_TOKEN=8160058317:AAGfkWy2gFj81hoC9NSE-Wc-CdiaXZw9Znw
✅ SPREADSHEET_ID=1aKWAIIeYe39hwaS65k-GAqsaFFhi765DuHoptLtFagg
✅ GOOGLE_SERVICE_ACCOUNT_EMAIL=hr-bot-service@polynomial-coda-474619-h6.iam.gserviceaccount.com
✅ GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
✅ HR_CHAT_ID=7304993062
✅ NODE_ENV=production
✅ WEBHOOK_URL=https://your-app.up.railway.app
```

---

## ⚠️ **ВАЖЛИВО: ДОСТУП ДО GOOGLE SHEETS**

Переконайтесь що ви надали доступ Service Account:

1. Відкрийте таблицю: https://docs.google.com/spreadsheets/d/1aKWAIIeYe39hwaS65k-GAqsaFFhi765DuHoptLtFagg
2. Натисніть "Share"
3. Додайте: `hr-bot-service@polynomial-coda-474619-h6.iam.gserviceaccount.com`
4. Права: **Editor**

---

## 🎯 **ШВИДКЕ ВИПРАВЛЕННЯ:**

**В Railway → Settings → Start Command:**
```
node server_fixed.js
```

**Збережіть та дочекайтесь перезапуску (1-2 хвилини)**

**Готово! Бот має запрацювати! 🚀**

