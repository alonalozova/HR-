# 🏢 HR Bot Commercial

Комерційний HR бот для автоматизації HR процесів в компаніях. Створений для Люди.Digital.

## ✨ Особливості

- 🎯 **100% кнопковий інтерфейс** - зручність використання
- 🔐 **Система ролей** - HR, PM, CEO, Employee
- 📊 **Повна аналітика** - звіти та статистика
- 🤖 **ШІ-помічник** - персональні поради
- 🏖️ **Управління відпустками** - з перевіркою накладок
- 🏠 **Remote робота** - контроль лімітів
- ⏰ **Облік спізнень** - автоматичне відстеження
- 🏥 **Лікарняні** - без лімітів
- 💬 **Комунікації** - пропозиції та ASAP запити

## 🚀 Швидкий старт

### 1. Клонування репозиторію
```bash
git clone https://github.com/your-username/hr-bot-commercial.git
cd hr-bot-commercial
```

### 2. Встановлення залежностей
```bash
npm install
```

### 3. Налаштування environment variables
Скопіюйте `env.example` в `.env` та заповніть:

```bash
cp env.example .env
```

Заповніть файл `.env`:
```env
BOT_TOKEN=your_telegram_bot_token_here
SPREADSHEET_ID=your_google_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email_here
GOOGLE_PRIVATE_KEY=your_google_private_key_here
HR_CHAT_ID=your_hr_telegram_chat_id_here
```

### 4. Локальний запуск
```bash
npm start
```

## 🌐 Деплой на Railway

### 1. Підключіть GitHub репозиторій до Railway
1. Зайдіть на [Railway](https://railway.app)
2. Створіть новий проект
3. Підключіть ваш GitHub репозиторій

### 2. Налаштуйте Environment Variables в Railway
Додайте всі змінні з файлу `.env`:
- `BOT_TOKEN`
- `SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `HR_CHAT_ID`
- `PORT` (Railway встановить автоматично)
- `WEBHOOK_URL` (отримаєте після деплою)

### 3. Деплой
Railway автоматично задеплоїть ваш бот після push в GitHub.

## 📊 Структура проекту

```
hr-bot-commercial/
├── server.js              # Основний сервер
├── package.json           # Залежності
├── env.example            # Приклад environment variables
├── .gitignore            # Ігноровані файли
├── README.md             # Документація
└── HR_Bot_Complete_Final.js  # Оригінальний Google Apps Script код
```

## 🔧 Налаштування

### Telegram Bot
1. Створіть бота через [@BotFather](https://t.me/botfather)
2. Отримайте токен
3. Додайте токен в `.env`

### Google Sheets
1. Створіть Google Spreadsheet
2. Створіть Service Account в Google Cloud Console
3. Надайте доступ Service Account до таблиці
4. Додайте credentials в `.env`

### HR Chat ID
1. Додайте бота в чат з HR
2. Отримайте chat ID
3. Додайте в `.env`

## 🎯 Функціонал

### Для всіх користувачів:
- ✅ Реєстрація в системі
- 🏖️ Подача заявок на відпустку
- 🏠 Фіксація remote днів
- ⏰ Повідомлення про спізнення
- 🏥 Оформлення лікарняного
- 📊 Перегляд особистої статистики
- 💬 Пропозиції покращень
- 🚨 ASAP запити
- 🤖 ШІ-помічник

### Для PM:
- 📋 Затвердження заявок команди
- 📈 Аналітика команди
- 📊 Експорт даних

### Для HR:
- 👥 Управління всіма користувачами
- 📊 Повна аналітика
- 📢 Масові розсилки
- ⚙️ Налаштування системи

### Для CEO:
- 🏢 Стратегічна аналітика
- 💰 Фінансовий аналіз
- 📈 KPI дашборд

## 🔒 Безпека

- ✅ Environment variables для всіх секретних ключів
- ✅ Захист від дублювання повідомлень
- ✅ Система ролей та прав доступу
- ✅ Валідація всіх вхідних даних

## 📝 Ліцензія

MIT License - дивіться файл LICENSE для деталей.

## 🤝 Підтримка

Для питань та підтримки звертайтесь до команди Люди.Digital.

## 🚀 Версії

- **v1.0.0** - Повна комерційна версія з усіма функціями
