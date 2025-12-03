/**
 * Утиліти для валідації
 */

const { ValidationError } = require('./errors');

/**
 * Перевіряє чи дата валідна
 */
function isValidDate(dateString) {
  if (!dateString) return false;
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return false;
  
  // Перевірка формату DD.MM.YYYY
  const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  if (!dateRegex.test(dateString)) return false;
  
  const [, day, month, year] = dateString.match(dateRegex);
  const parsedDate = new Date(year, month - 1, day);
  
  return parsedDate.getDate() == day && 
         parsedDate.getMonth() == month - 1 && 
         parsedDate.getFullYear() == year;
}

/**
 * Валідує заявку на відпустку
 */
function validateVacationRequest(data) {
  if (!data) {
    throw new ValidationError('Дані заявки відсутні');
  }
  
  if (!data.startDate) {
    throw new ValidationError('Дата початку відпустки обов\'язкова', 'startDate');
  }
  
  if (!isValidDate(data.startDate)) {
    throw new ValidationError('Невірний формат дати початку. Використовуйте ДД.ММ.РРРР', 'startDate');
  }
  
  if (data.days !== undefined) {
    const days = parseInt(data.days);
    if (isNaN(days) || days < 1 || days > 7) {
      throw new ValidationError('Кількість днів має бути від 1 до 7', 'days');
    }
  }
  
  // Перевірка, що дата не в минулому
  const startDate = parseDate(data.startDate);
  if (startDate && startDate < new Date(new Date().setHours(0, 0, 0, 0))) {
    throw new ValidationError('Дата початку відпустки не може бути в минулому', 'startDate');
  }
  
  return true;
}

/**
 * Валідує дані реєстрації
 */
function validateRegistrationData(data) {
  if (!data) {
    throw new ValidationError('Дані реєстрації відсутні');
  }
  
  const required = ['name', 'surname', 'department', 'team', 'position', 'birthDate', 'firstWorkDay'];
  const missing = required.filter(field => !data[field]);
  
  if (missing.length > 0) {
    throw new ValidationError(`Відсутні обов'язкові поля: ${missing.join(', ')}`, missing[0]);
  }
  
  // Валідація імені
  if (data.name.length < 2 || data.name.length > 50) {
    throw new ValidationError('Ім\'я має бути від 2 до 50 символів', 'name');
  }
  
  // Валідація прізвища
  if (data.surname.length < 2 || data.surname.length > 50) {
    throw new ValidationError('Прізвище має бути від 2 до 50 символів', 'surname');
  }
  
  // Валідація дати народження
  if (!isValidDate(data.birthDate)) {
    throw new ValidationError('Невірний формат дати народження. Використовуйте ДД.ММ.РРРР', 'birthDate');
  }
  
  // Валідація дати початку роботи
  if (!isValidDate(data.firstWorkDay)) {
    throw new ValidationError('Невірний формат дати початку роботи. Використовуйте ДД.ММ.РРРР', 'firstWorkDay');
  }
  
  return true;
}

/**
 * Валідує Telegram ID
 */
function validateTelegramId(telegramId) {
  if (!telegramId) {
    throw new ValidationError('Telegram ID відсутній');
  }
  
  const id = parseInt(telegramId);
  if (isNaN(id) || id <= 0) {
    throw new ValidationError('Невірний формат Telegram ID');
  }
  
  return id;
}

/**
 * Валідує текст повідомлення
 */
function validateMessageText(text, maxLength = 4096) {
  if (!text || typeof text !== 'string') {
    throw new ValidationError('Текст повідомлення відсутній або невалідний');
  }
  
  if (text.length > maxLength) {
    throw new ValidationError(`Текст повідомлення занадто довгий (максимум ${maxLength} символів)`);
  }
  
  // Перевірка на небезпечні символи (базова захист від injection)
  if (/<script|javascript:|onerror=/i.test(text)) {
    throw new ValidationError('Текст містить небезпечні символи');
  }
  
  return true;
}

/**
 * Форматує дату в формат DD.MM.YYYY
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Парсить дату з формату DD.MM.YYYY
 */
function parseDate(dateString) {
  if (!isValidDate(dateString)) return null;
  
  const [day, month, year] = dateString.split('.');
  return new Date(year, month - 1, day);
}

/**
 * Обчислює різницю в днях між двома датами
 */
function daysBetween(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000;
  const firstDate = new Date(date1);
  const secondDate = new Date(date2);
  return Math.round(Math.abs((firstDate - secondDate) / oneDay));
}

module.exports = {
  isValidDate,
  formatDate,
  parseDate,
  daysBetween,
  validateVacationRequest,
  validateRegistrationData,
  validateTelegramId,
  validateMessageText
};
