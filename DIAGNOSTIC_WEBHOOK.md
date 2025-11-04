# 🔍 ДІАГНОСТИКА ПРОБЛЕМИ З WEBHOOK

## ❌ **ПРОБЛЕМА:** Бот не відповідає на повідомлення

---

## 🔍 **КРОК 1: ПЕРЕВІРКА LOGS В RAILWAY**

1. Відкрийте Railway Dashboard
2. Виберіть ваш проект HR Bot
3. Перейдіть до **Deployments** → **View Logs**

### ✅ **ЩО МАЄ БУТИ В ЛОГАХ:**

```
✅ Webhook встановлено: https://your-app.up.railway.app/webhook
🚀 HR Bot Ultimate запущено на порту 3000
```

### ❌ **ЯКЩО НЕМАЄ:**

```
⚠️ WEBHOOK_URL не встановлено
```

**РІШЕННЯ:** Додайте `WEBHOOK_URL` в Railway Environment Variables

---

## 🔍 **КРОК 2: ПЕРЕВІРКА ENVIRONMENT VARIABLES**

1. Railway → Settings → Environment
2. Перевірте наявність:

| Змінна | Значення | Статус |
|--------|----------|--------|
| `BOT_TOKEN` | `8160058317:AAG...` | ✅ Обов'язково |
| `WEBHOOK_URL` | `https://your-app.up.railway.app` | ✅ Обов'язково |
| `SPREADSHEET_ID` | `1aKWAII...` | ⚠️ Бажано |
| `HR_CHAT_ID` | `7304993062` | ⚠️ Бажано |

### ⚠️ **ВАЖЛИВО:**
- `WEBHOOK_URL` має бути **БЕЗ `/webhook`** в кінці
- Приклад: `https://hr-production-c51b.up.railway.app`
- **НЕ:** `https://hr-production-c51b.up.railway.app/webhook`

---

## 🔍 **КРОК 3: ОТРИМАННЯ ПРАВИЛЬНОГО URL**

### **Варіант 1: Через Railway Dashboard**
1. Settings → Networking → Domains
2. Скопіюйте публічний URL (типу `https://hr-production-XXXX.up.railway.app`)

### **Варіант 2: Через Environment Variables**
1. Railway автоматично створює `RAILWAY_PUBLIC_DOMAIN`
2. Додайте нову змінну:
   - **Name:** `WEBHOOK_URL`
   - **Value:** `https://${RAILWAY_PUBLIC_DOMAIN}` (або вставте URL напряму)

---

## 🔍 **КРОК 4: РУЧНЕ ВСТАНОВЛЕННЯ WEBHOOK**

Якщо автоматичне встановлення не спрацювало:

### **Через Telegram Bot API:**

```bash
curl -X POST "https://api.telegram.org/bot8160058317:AAGfkWy2gFj81hoC9NSE-Wc-CdiaXZw9Znw/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-app.up.railway.app/webhook"}'
```

**Замініть `your-app.up.railway.app` на ваш реальний Railway URL!**

### **Перевірка webhook:**

```bash
curl "https://api.telegram.org/bot8160058317:AAGfkWy2gFj81hoC9NSE-Wc-CdiaXZw9Znw/getWebhookInfo"
```

**Очікувана відповідь:**
```json
{
  "ok": true,
  "result": {
    "url": "https://your-app.up.railway.app/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

---

## 🔍 **КРОК 5: ПЕРЕВІРКА WEBHOOK ENDPOINT**

### **Тест через curl:**

```bash
curl -X POST https://your-app.up.railway.app/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123,
    "message": {
      "message_id": 1,
      "from": {"id": 123456789, "is_bot": false, "first_name": "Test"},
      "chat": {"id": 123456789, "type": "private"},
      "date": 1234567890,
      "text": "/start"
    }
  }'
```

**Очікувана відповідь:** `OK` (200)

---

## 🔧 **ШВИДКЕ ВИПРАВЛЕННЯ**

### **Якщо бот все ще не відповідає:**

1. **Перевірте Railway URL:**
   ```bash
   curl https://your-app.up.railway.app/
   ```
   Має повернути: `{"status":"OK",...}`

2. **Перевірте webhook URL:**
   ```bash
   curl https://api.telegram.org/bot8160058317:AAGfkWy2gFj81hoC9NSE-Wc-CdiaXZw9Znw/getWebhookInfo
   ```

3. **Перезапустіть Railway:**
   - Deployments → ⋮ → Redeploy

4. **Перевірте логи після перезапуску:**
   - Має з'явитись: `✅ Webhook встановлено`

---

## 📋 **ЧЕКЛИСТ:**

- [ ] ✅ Railway deployment успішний
- [ ] ✅ `BOT_TOKEN` встановлено в Railway
- [ ] ✅ `WEBHOOK_URL` встановлено в Railway (БЕЗ `/webhook`)
- [ ] ✅ Логи показують: `✅ Webhook встановлено`
- [ ] ✅ Health check працює: `curl https://your-app.up.railway.app/`
- [ ] ✅ Webhook endpoint працює: `curl -X POST https://your-app.up.railway.app/webhook ...`
- [ ] ✅ Telegram API показує правильний webhook: `getWebhookInfo`

---

## 🆘 **ЯКЩО НІЧОГО НЕ ДОПОМАГАЄ:**

1. Перевірте, чи правильно встановлено `BOT_TOKEN` (без зайвих пробілів)
2. Перевірте, чи Railway URL публічний (не `*.railway.internal`)
3. Спробуйте видалити та встановити webhook заново через Bot API
4. Перевірте, чи немає помилок в логах Railway

---

## ✅ **ПІСЛЯ ВИПРАВЛЕННЯ:**

Після успішного налаштування:
1. Напишіть `/start` боту в Telegram
2. Бот має відповісти з меню
3. Перевірте логи Railway - мають з'явитись запити на `/webhook`
