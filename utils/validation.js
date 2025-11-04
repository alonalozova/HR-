/**
 * 🔍 ВАЛІДАЦІЯ ДАНИХ
 * Утиліти для перевірки та валідації
 */

const { ValidationError } = require('./errors');

/**
 * Валідація дати у форматі ДД.ММ.РРРР
 */
function validateDate(dateString) {
  const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
  const match = dateString.match(dateRegex);
  
  if (!match) {
    throw new ValidationError('Невірний формат дати. Використовуйте ДД.ММ.РРРР (наприклад: 11.11.2025)', 'date');
  }
  
  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  const year = parseInt(match[3]);
  
  // Перевіряємо валідність дати
  const date = new Date(year, month - 1, day);
  if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
    throw new ValidationError('Невірна дата. Перевірте правильність введених даних.', 'date');
  }
  
  // Перевіряємо, що дата не в минулому
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    throw new ValidationError('Дата не може бути в минулому.', 'date');
  }
  
  return date;
}

/**
 * Валідація кількості днів відпустки
 */
function validateVacationDays(days) {
  const numDays = parseInt(days);
  
  if (isNaN(numDays)) {
    throw new ValidationError('Кількість днів має бути числом.', 'days');
  }
  
  if (numDays < 1 || numDays > 7) {
    throw new ValidationError('Кількість днів має бути від 1 до 7.', 'days');
  }
  
  return numDays;
}

/**
 * Валідація Telegram ID
 */
function validateTelegramId(telegramId) {
  if (!telegramId || typeof telegramId !== 'string' && typeof telegramId !== 'number') {
    throw new ValidationError('Невірний Telegram ID.', 'telegramId');
  }
  
  return telegramId.toString();
}

/**
 * Форматування дати для відображення
 */
function formatDate(date) {
  if (!(date instanceof Date)) {
    return 'Невірна дата';
  }
  
  return date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Перевірка чи дата в минулому
 */
function isDateInPast(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

module.exports = {
  validateDate,
  validateVacationDays,
  validateTelegramId,
  formatDate,
  isDateInPast
};

