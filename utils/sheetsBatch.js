/**
 * Утиліти для batch операцій з Google Sheets
 * Оптимізує роботу з множинними рядками
 */

const logger = require('./logger');
const { DatabaseError } = require('./errors');

/**
 * Зберігає кілька рядків одночасно (batch операція)
 * @param {Object} sheet - Google Sheets аркуш
 * @param {Array<Object>} rowsData - Масив об'єктів з даними для рядків
 * @returns {Promise<Array>} Масив збережених рядків
 */
async function batchAddRows(sheet, rowsData) {
  if (!sheet) {
    throw new DatabaseError('Sheet не надано', 'batchAddRows');
  }
  
  if (!rowsData || rowsData.length === 0) {
    logger.info('No rows to add', { sheetTitle: sheet.title });
    return [];
  }
  
  try {
    // Використовуємо addRows для batch операції
    const savedRows = await sheet.addRows(rowsData);
    
    logger.info('Batch rows added', { 
      sheetTitle: sheet.title, 
      count: rowsData.length 
    });
    
    return savedRows;
  } catch (error) {
    logger.error('Error in batchAddRows', error, { 
      sheetTitle: sheet.title, 
      rowsCount: rowsData.length 
    });
    throw new DatabaseError(`Помилка batch додавання рядків: ${error.message}`, 'batchAddRows');
  }
}

/**
 * Оновлює кілька рядків одночасно (batch операція)
 * @param {Array<Object>} rows - Масив рядків для оновлення
 * @returns {Promise<void>}
 */
async function batchUpdateRows(rows) {
  if (!rows || rows.length === 0) {
    logger.info('No rows to update');
    return;
  }
  
  try {
    // Зберігаємо всі рядки одночасно
    // Google Sheets API підтримує batch оновлення через saveUpdatedRows
    if (rows[0] && typeof rows[0].save === 'function') {
      // Якщо є метод saveUpdatedRows, використовуємо його
      if (rows[0].sheet && typeof rows[0].sheet.saveUpdatedRows === 'function') {
        await rows[0].sheet.saveUpdatedRows(rows);
      } else {
        // Інакше зберігаємо паралельно
        await Promise.all(rows.map(row => row.save()));
      }
    }
    
    logger.info('Batch rows updated', { count: rows.length });
  } catch (error) {
    logger.error('Error in batchUpdateRows', error, { rowsCount: rows.length });
    throw new DatabaseError(`Помилка batch оновлення рядків: ${error.message}`, 'batchUpdateRows');
  }
}

/**
 * Отримує рядки порціями (пагінація) для великих таблиць
 * @param {Object} sheet - Google Sheets аркуш
 * @param {Object} options - Опції (offset, limit, filter)
 * @returns {Promise<Array>} Масив рядків
 */
async function getRowsPaginated(sheet, options = {}) {
  const { offset = 0, limit = 1000, filter = null } = options;
  
  if (!sheet) {
    throw new DatabaseError('Sheet не надано', 'getRowsPaginated');
  }
  
  try {
    const rows = await sheet.getRows({ offset, limit });
    
    // Якщо є фільтр, застосовуємо його
    if (filter && typeof filter === 'function') {
      return rows.filter(filter);
    }
    
    return rows;
  } catch (error) {
    logger.error('Error in getRowsPaginated', error, { offset, limit });
    throw new DatabaseError(`Помилка отримання рядків: ${error.message}`, 'getRowsPaginated');
  }
}

/**
 * Отримує всі рядки з таблиці порціями (для великих таблиць)
 * @param {Object} sheet - Google Sheets аркуш
 * @param {Function} filter - Функція фільтрації (опціонально)
 * @param {number} pageSize - Розмір сторінки (за замовчуванням 1000)
 * @returns {Promise<Array>} Масив всіх рядків
 */
async function getAllRowsPaginated(sheet, filter = null, pageSize = 1000) {
  if (!sheet) {
    throw new DatabaseError('Sheet не надано', 'getAllRowsPaginated');
  }
  
  const allRows = [];
  let offset = 0;
  let hasMore = true;
  
  try {
    while (hasMore) {
      const rows = await getRowsPaginated(sheet, { offset, limit: pageSize, filter });
      
      if (rows.length === 0) {
        hasMore = false;
        break;
      }
      
      allRows.push(...rows);
      offset += pageSize;
      
      // Якщо отримано менше рядків, ніж pageSize, це остання сторінка
      if (rows.length < pageSize) {
        hasMore = false;
      }
    }
    
    logger.info('All rows retrieved', { 
      sheetTitle: sheet.title, 
      totalRows: allRows.length 
    });
    
    return allRows;
  } catch (error) {
    logger.error('Error in getAllRowsPaginated', error, { sheetTitle: sheet.title });
    throw new DatabaseError(`Помилка отримання всіх рядків: ${error.message}`, 'getAllRowsPaginated');
  }
}

module.exports = {
  batchAddRows,
  batchUpdateRows,
  getRowsPaginated,
  getAllRowsPaginated
};

