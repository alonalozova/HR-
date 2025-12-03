/**
 * Утиліти для роботи з Google Sheets
 * Централізовані функції для отримання значень з рядків
 */

/**
 * Отримує значення з рядка Google Sheets з підтримкою української та англійської назв колонок
 * @param {Object} row - Рядок з Google Sheets
 * @param {string} uaKey - Українська назва колонки
 * @param {string} enKey - Англійська назва колонки
 * @param {any} defaultValue - Значення за замовчуванням
 * @returns {any} Значення з рядка
 */
function getSheetValue(row, uaKey, enKey, defaultValue = '') {
  if (!row || !row.get) return defaultValue;
  
  try {
    // Спробуємо отримати значення за українською назвою
    const uaValue = row.get(uaKey);
    if (uaValue !== undefined && uaValue !== null && uaValue !== '') {
      return uaValue;
    }
    
    // Якщо не знайдено, спробуємо англійську
    const enValue = row.get(enKey);
    if (enValue !== undefined && enValue !== null && enValue !== '') {
      return enValue;
    }
    
    return defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

/**
 * Отримує значення з рядка з урахуванням мови листа
 * @param {Object} row - Рядок з Google Sheets
 * @param {string} sheetTitle - Назва листа ('Працівники' або 'Employees')
 * @param {string} uaKey - Українська назва колонки
 * @param {string} enKey - Англійська назва колонки
 * @param {any} defaultValue - Значення за замовчуванням
 * @returns {any} Значення з рядка
 */
function getSheetValueByLanguage(row, sheetTitle, uaKey, enKey, defaultValue = '') {
  if (!row || !row.get) return defaultValue;
  
  const isUkrainianSheet = sheetTitle === 'Працівники' || sheetTitle === 'Відпустки' || 
                          sheetTitle === 'Remotes' || sheetTitle === 'Спізнення' ||
                          sheetTitle === 'Лікарняні' || sheetTitle === 'Вихідні';
  
  try {
    // Спочатку пробуємо за мовою листа
    const primaryKey = isUkrainianSheet ? uaKey : enKey;
    const primaryValue = row.get(primaryKey);
    if (primaryValue !== undefined && primaryValue !== null && primaryValue !== '') {
      return primaryValue;
    }
    
    // Якщо не знайдено, пробуємо альтернативну мову
    const secondaryKey = isUkrainianSheet ? enKey : uaKey;
    const secondaryValue = row.get(secondaryKey);
    if (secondaryValue !== undefined && secondaryValue !== null && secondaryValue !== '') {
      return secondaryValue;
    }
    
    return defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

/**
 * Безпечно отримує Telegram ID з рядка
 * @param {Object} row - Рядок з Google Sheets
 * @returns {number|string|null} Telegram ID або null
 */
function getTelegramId(row) {
  if (!row || !row.get) return null;
  
  try {
    const rawTelegramId = row.get('TelegramID');
    if (!rawTelegramId) return null;
    
    const parsed = parseInt(rawTelegramId, 10);
    return Number.isNaN(parsed) ? rawTelegramId.toString() : parsed;
  } catch (error) {
    return null;
  }
}

/**
 * Перевіряє чи рядок має валідний Telegram ID
 * @param {Object} row - Рядок з Google Sheets
 * @param {number|string} telegramId - Telegram ID для перевірки
 * @returns {boolean} true якщо ID збігається
 */
function matchesTelegramId(row, telegramId) {
  const rowTelegramId = getTelegramId(row);
  if (!rowTelegramId) return false;
  
  return String(rowTelegramId) === String(telegramId);
}

module.exports = {
  getSheetValue,
  getSheetValueByLanguage,
  getTelegramId,
  matchesTelegramId
};

