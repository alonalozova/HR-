/**
 * Утиліти для валідації
 */

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
  daysBetween
};
