/**
 * Утиліти для валідації
 */

const { ValidationError } = require('./errors');

/**
 * Перевіряє чи дата валідна
 */
function isValidDate(dateString) {
  if (!dateString) return false;
  
  // Підтримуємо різні формати дат
  if (typeof dateString === 'object' && dateString instanceof Date) {
    return !isNaN(dateString.getTime());
  }
  
  if (typeof dateString !== 'string') return false;
  
  // Перевірка формату DD.MM.YYYY
  const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
  if (!dateRegex.test(dateString)) return false;
  
  const [, day, month, year] = dateString.match(dateRegex);
  const parsedDate = new Date(year, month - 1, day);
  
  return parsedDate.getDate() == day && 
         parsedDate.getMonth() == month - 1 && 
         parsedDate.getFullYear() == year;
}

/**
 * Форматує дату в формат DD.MM.YYYY
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
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

/**
 * Валідує Telegram ID
 */
function validateTelegramId(telegramId) {
  if (!telegramId || typeof telegramId !== 'number' || telegramId <= 0) {
    throw new ValidationError('Невірний Telegram ID', 'telegramId');
  }
  return true;
}

/**
 * Валідує текст повідомлення (пропускає команди та порожні повідомлення)
 */
function validateMessageText(text) {
  // Пропускаємо команди (починаються з /)
  if (text && text.trim().startsWith('/')) {
    return true;
  }
  
  // Пропускаємо порожні повідомлення (вони обробляються окремо)
  if (!text || text.trim().length === 0) {
    return true;
  }
  
  // Проста перевірка на XSS
  if (/<script|javascript:|onerror=/i.test(text)) {
    throw new ValidationError('Текст містить небезпечні символи');
  }
  
  return true;
}

/**
 * Валідує дані реєстрації
 */
function validateRegistrationData(data) {
  if (!data) throw new ValidationError('Дані для реєстрації відсутні', 'data');
  if (!data.name || data.name.trim().length < 2) throw new ValidationError('Ім\'я занадто коротке', 'name');
  if (!data.surname || data.surname.trim().length < 2) throw new ValidationError('Прізвище занадто коротке', 'surname');
  if (!data.department || data.department.trim().length < 2) throw new ValidationError('Відділ не вказано', 'department');
  if (!data.team || data.team.trim().length < 2) throw new ValidationError('Команда не вказана', 'team');
  if (!data.position || data.position.trim().length < 2) throw new ValidationError('Посада не вказана', 'position');
  if (!data.birthDate || !isValidDate(data.birthDate)) throw new ValidationError('Невірна дата народження', 'birthDate');
  if (!data.firstWorkDay || !isValidDate(data.firstWorkDay)) throw new ValidationError('Невірна дата початку роботи', 'firstWorkDay');
  return true;
}

/**
 * Валідує заявку на відпустку
 */
function validateVacationRequest(data) {
  if (!data) throw new ValidationError('Дані для заявки на відпустку відсутні', 'data');
  if (!data.startDate || !isValidDate(data.startDate)) throw new ValidationError('Невірна дата початку відпустки', 'startDate');
  const days = parseInt(data.days);
  if (isNaN(days) || days < 1 || days > 7) throw new ValidationError('Кількість днів має бути від 1 до 7', 'days');
  return true;
}

module.exports = {
  isValidDate,
  formatDate,
  parseDate,
  daysBetween,
  validateTelegramId,
  validateMessageText,
  validateRegistrationData,
  validateVacationRequest
};
