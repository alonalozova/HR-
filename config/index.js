/**
 * Конфігурація бота
 */

require('dotenv').config();

module.exports = {
  // Telegram
  BOT_TOKEN: process.env.BOT_TOKEN,
  HR_CHAT_ID: process.env.HR_CHAT_ID,
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  
  // Google Sheets
  SPREADSHEET_ID: process.env.SPREADSHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
  
  // Server
  PORT: process.env.PORT || 3000,
  
  // Структура команди
  DEPARTMENTS: {
    'Marketing': {
      'PPC': ['PPC', 'PM PPC'],
      'Target': {
        'Kris team': ['Team lead', 'PM target'],
        'Lera team': ['Team lead', 'PM target']
      }
    },
    'Design': {
      'Head of Design': ['Head of Design'],
      'Motion Designer': ['Motion Designer'],
      'Static designer': ['Static designer'],
      'Video designer': ['Video designer'],
      'SMM designer': ['SMM designer']
    },
    'SMM': {
      'Head of SMM': ['Head of SMM'],
      'SMM specialist': ['SMM specialist'],
      'Producer': ['Producer'],
      'PM': ['PM']
    },
    'Sales and communication': {
      'Sales and communication manager': ['Sales and communication manager']
    },
    'HR': {
      'HR': ['HR']
    },
    'CEO': {
      'CEO': ['CEO']
    }
  },
  
  // Кеш налаштування
  CACHE: {
    PROCESSED_UPDATES: { maxSize: 1000, ttl: 2 * 60 * 1000 }, // 2 хвилини
    USER_CACHE: { maxSize: 500, ttl: 10 * 60 * 1000 }, // 10 хвилин
    REGISTRATION_CACHE: { maxSize: 100, ttl: 15 * 60 * 1000 } // 15 хвилин
  },
  
  // Retry налаштування
  RETRY: {
    MAX_RETRIES: 3,
    DELAY: 1000
  }
};

