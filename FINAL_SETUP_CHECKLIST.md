# ✅ ФІНАЛЬНИЙ ЧЕКЛИСТ НАЛАШТУВАННЯ HR БОТА

## 🎯 ВАШ SERVICE ACCOUNT:
```
hr-bot-service@polynomial-coda-474619-h6.iam.gserviceaccount.com
```

---

## 📋 КРОК 1: НАДАЙТЕ ДОСТУП ДО GOOGLE SHEETS

### ⚠️ КРИТИЧНО ВАЖЛИВО!
Без цього кроку бот НЕ ЗМОЖЕ працювати з таблицями!

### Інструкція:
1. **Відкрийте вашу Google Sheets таблицю:**
   https://docs.google.com/spreadsheets/d/1aKWAIIeYe39hwaS65k-GAqsaFFhi765DuHoptLtFagg

2. **Натисніть кнопку "Share" (Поділитися)** в правому верхньому куті

3. **В поле "Add people and groups" вставте email:**
   ```
   hr-bot-service@polynomial-coda-474619-h6.iam.gserviceaccount.com
   ```

4. **Оберіть права доступу: "Editor"**

5. **ЗНІМІТЬ галочку "Notify people"** (щоб не надсилати email)

6. **Натисніть "Share" або "Done"**

### ✅ Перевірка:
Після цього в списку людей з доступом має з'явитись:
- `hr-bot-service@polynomial-coda-474619-h6.iam.gserviceaccount.com` (Editor)

---

## 📋 КРОК 2: НАЛАШТУВАННЯ RAILWAY

### 1. Перейдіть на Railway:
https://railway.app

### 2. Створіть новий проект:
- Натисніть **"New Project"**
- Оберіть **"Deploy from GitHub repo"**
- Підключіть GitHub (якщо ще не підключено)
- Оберіть репозиторій: **`alonalozova/HR-`**

### 3. Додайте Environment Variables:
В розділі **Variables** додайте (скопіюйте з файлу `RAILWAY_ENV_VARIABLES.txt`):

```env
BOT_TOKEN=8160058317:AAGfkWy2gFj81hoC9NSE-Wc-CdiaXZw9Znw
SPREADSHEET_ID=1aKWAIIeYe39hwaS65k-GAqsaFFhi765DuHoptLtFagg
GOOGLE_SERVICE_ACCOUNT_EMAIL=hr-bot-service@polynomial-coda-474619-h6.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCq93lBlL23AeVo\nHa6MJbDFyM7oYsIOzAen9UMiYvcTcuIA5RSogqQOy/l2YGDsMA99KfuxRbNZm3th\nU/9pJ/tEgU0ewKkMaeQB4idp9la8IptawHhS1vjiwYqd/VnUW9/zfwAPYvILtaRX\nbp5vx/9uuqYs2vdQvadpQlExBxK7lkE5aIPeJMCJiVNufL5zLr+xmi5+sOka2ekm\nQ449yklxc7K5J3TfaLKyv5TXiGO0ofuROP/Azl9P5ltBaubwXUMVFR45TOyOkOxo\nlYTfRs2TcYMfDC5uo8idyccF0yHYn2mg62wDqRV5PIOBAO8TGLcWlqZyGvSX+DIa\nY4/VkJjPAgMBAAECggEAVKxgR5StKRgtUBVzP0HjfPFpWDqhNcbi+9JCv6MYD2/U\ncvEB/DtHmXR4RqKRHijnYuwKFdAZdYXF43xAgQomLdWEJnjwwI8pN62UK6yvZFoX\nayjr7ss9VMDaMEkr1jryfZwmoXg1vIrnq83DdkUtQt/6MTj5R+nGIiGQKKICKxj8\nQ2MOkgdIDZVusuHkKI29wPh6S4rFPrs5V4615h+iSU/kUIgvshmWa2p1SP5lbM6y\nvBjpkHL0M2KniajqoQUJI6ytZ5CuHSeFRdezjdjaqh9N2akVv49vwSpUDrHMqzhw\nN6f+snz9ZqeZAX9ayGjG2MC2bhH0QPSBKIUH88TOMQKBgQDw+k95wyXeskbcJVIu\no5hKf1qWMeucNzJTA74tewyjnsxrJ3m7Q6k7rURn2K/aM/mgR+YQ8SHuXQKGj8gB\nKmYtFsKelw62EhklyifhVqEYNt0hpJaUoQ/gsNk25vo616aR+ETYDwjyMWX4wLu9\nKa5ambY+uBC+0yiw2K4YVIuy6wKBgQC1n+DJ9XhLufiPu77g7yskrdJpVv/xVu3U\nGwsp3BwFkKMKC9SPNHrLrH3mMHVUZaKqa2IgSMSuWu4Xs0n94HfxwSKtqTr3Q677\nd7HiBOHFznQ7rPoT09CkZC0sd3PHXlCxjCknfPb1xlbqVZIPgpIqYHRz6f2Sg5wU\nfDrRhW4QrQKBgEePreZU43wcqRpbIuqivmjxJO+RZ4x+f71TUTikX/5+++meUXIh\nB7KnI7dLC/3ajXjhoRrK4O6uRD+9lwFxm+Ir7iO2bDH5cepc/DbYyQIt2MFS5TzC\nD7sECZ1aPlkXDWovthILdPanYMbcRWRJanORTiOV+bMRdfX+gsTK5ql9AoGAM+bE\nLfJftgQm66wTF+RAx/KENmYOLcFRpVM1FXk46L40WSKYU3QDw0A/mhAu9zc0DM8y\n81bYHZsOfudVNZ93pzYx2r6Jgy9sSaAizRvoCMa+oG8F57SX4uJdpl9cTpS9Kn+L\nIyWqzQEoxT4+xv/hFQsLPDSZqczCRXhatpUSpuECgYA5l6MbsfF33UayEHeu1TXe\nO77qLjqvs+ajMbc974Oo/NQkhjGz2pnBFGonSSf5qU+l0Zscb4hdQOYBEYAWHIl6\nEsBWZ63/By3jQXZATtvBYFe/5VbtZxaA824X9ketwrXyyBQ3PDwEzoh8KepaOMXF\nqedyVNXmDt0fZOI+yFnDpg==\n-----END PRIVATE KEY-----\n
HR_CHAT_ID=7304993062
NODE_ENV=production
```

**⚠️ ВАЖЛИВО:** Копіюйте `GOOGLE_PRIVATE_KEY` **ПОВНІСТЮ** з усіма `\n`

### 4. Дочекайтесь деплою:
Railway автоматично збере та запустить ваш додаток (2-5 хвилин)

### 5. Отримайте Railway URL:
Після успішного деплою в розділі **Settings** → **Domains** ви побачите URL типу:
```
https://hr-bot-production-XXXX.up.railway.app
```

### 6. Додайте WEBHOOK_URL:
Поверніться в **Variables** та додайте:
```env
WEBHOOK_URL=https://your-actual-railway-url.up.railway.app
```

Railway автоматично перезапустить додаток.

---

## 📋 КРОК 3: ТЕСТУВАННЯ БОТА

### 1. Перевірте Health Check:
Відкрийте ваш Railway URL в браузері.
Має з'явитись:
```json
{
  "status": "OK",
  "message": "HR Bot is running",
  "timestamp": "2025-01-09T...",
  "version": "1.0.0"
}
```

### 2. Перевірте логи в Railway:
В розділі **Deployments** → **View Logs** має бути:
```
✅ Google Sheets підключено: [назва вашої таблиці]
✅ Webhook встановлено: [ваш URL]/webhook
🚀 HR Bot запущено на порту 3000
```

### 3. Протестуйте в Telegram:
1. Знайдіть вашого бота в Telegram
2. Напишіть `/start`
3. Має з'явитись привітальне повідомлення з кнопками

---

## ✅ ФІНАЛЬНИЙ ЧЕКЛИСТ:

- [ ] ✅ Service Account створено
- [ ] ✅ JSON ключ завантажено
- [ ] ✅ Доступ до Google Sheets надано
- [ ] ✅ GitHub репозиторій готовий
- [ ] ✅ Railway проект створено
- [ ] ✅ Environment Variables додано
- [ ] ✅ WEBHOOK_URL налаштовано
- [ ] ✅ Деплой успішний
- [ ] ✅ Health check працює
- [ ] ✅ Бот відповідає в Telegram

---

## 🎉 ГОТОВО!

Якщо всі пункти виконано - ваш HR бот готовий до роботи!

**GitHub:** https://github.com/alonalozova/HR-
**Railway:** https://railway.app (ваш проект)
**Google Sheets:** https://docs.google.com/spreadsheets/d/1aKWAIIeYe39hwaS65k-GAqsaFFhi765DuHoptLtFagg

---

## 🆘 ДОПОМОГА:

### Якщо бот не відповідає:
1. Перевірте логи в Railway
2. Перевірте чи правильно додано GOOGLE_PRIVATE_KEY (з \n)
3. Перевірте чи надано доступ Service Account до таблиці
4. Перевірте чи правильний WEBHOOK_URL

### Якщо помилки з Google Sheets:
1. Перевірте чи Service Account має права Editor
2. Перевірте чи правильний SPREADSHEET_ID
3. Перевірте чи увімкнено Google Sheets API

**Всі ключі та інструкції готові! 🚀**

