/**
 * 📊 GOOGLE SHEETS SERVICE
 * Сервіс для роботи з Google Sheets
 */

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { DatabaseError, logger } = require('../utils/errors');

class SheetsService {
  constructor() {
    this.doc = null;
    this.isInitialized = false;
  }

  /**
   * Ініціалізація підключення до Google Sheets
   */
  async initialize() {
    try {
      const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
      const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

      if (!SPREADSHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        throw new DatabaseError('Google Sheets credentials не встановлено');
      }
      
      const serviceAccountAuth = new JWT({
        email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      
      this.doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
      await this.doc.loadInfo();
      
      this.isInitialized = true;
      logger.success('Google Sheets initialized', { title: this.doc.title });
      
      return true;
    } catch (error) {
      this.isInitialized = false;
      logger.error('Failed to initialize Google Sheets', error);
      throw new DatabaseError('Помилка ініціалізації Google Sheets');
    }
  }

  /**
   * Перевірка чи сервіс ініціалізований
   */
  ensureInitialized() {
    if (!this.isInitialized || !this.doc) {
      throw new DatabaseError('Google Sheets не ініціалізовано');
    }
  }

  /**
   * Отримання аркуша за назвою
   */
  async getSheet(sheetName) {
    this.ensureInitialized();
    
    try {
      await this.doc.loadInfo();
      let sheet = this.doc.sheetsByTitle[sheetName];
      
      if (!sheet) {
        throw new DatabaseError(`Аркуш '${sheetName}' не знайдено`);
      }
      
      return sheet;
    } catch (error) {
      logger.error(`Failed to get sheet: ${sheetName}`, error);
      throw new DatabaseError(`Помилка отримання аркуша '${sheetName}'`);
    }
  }

  /**
   * Створення аркуша якщо не існує
   */
  async getOrCreateSheet(sheetName, headers = []) {
    this.ensureInitialized();
    
    try {
      await this.doc.loadInfo();
      let sheet = this.doc.sheetsByTitle[sheetName];
      
      if (!sheet) {
        sheet = await this.doc.addSheet({
          title: sheetName,
          headerValues: headers
        });
        logger.info(`Created new sheet: ${sheetName}`);
      }
      
      return sheet;
    } catch (error) {
      logger.error(`Failed to get or create sheet: ${sheetName}`, error);
      throw new DatabaseError(`Помилка створення аркуша '${sheetName}'`);
    }
  }

  /**
   * Додавання рядка до аркуша
   */
  async addRow(sheetName, rowData) {
    try {
      const sheet = await this.getSheet(sheetName);
      await sheet.addRow(rowData);
      logger.info(`Row added to sheet: ${sheetName}`);
    } catch (error) {
      logger.error(`Failed to add row to sheet: ${sheetName}`, error);
      throw new DatabaseError(`Помилка додавання рядка до '${sheetName}'`);
    }
  }

  /**
   * Отримання всіх рядків аркуша
   */
  async getRows(sheetName) {
    try {
      const sheet = await this.getSheet(sheetName);
      return await sheet.getRows();
    } catch (error) {
      logger.error(`Failed to get rows from sheet: ${sheetName}`, error);
      throw new DatabaseError(`Помилка отримання рядків з '${sheetName}'`);
    }
  }

  /**
   * Пошук рядка за умовою
   */
  async findRow(sheetName, condition) {
    try {
      const rows = await this.getRows(sheetName);
      return rows.find(condition);
    } catch (error) {
      logger.error(`Failed to find row in sheet: ${sheetName}`, error);
      throw new DatabaseError(`Помилка пошуку рядка в '${sheetName}'`);
    }
  }

  /**
   * Оновлення рядка
   */
  async updateRow(row, data) {
    try {
      Object.assign(row, data);
      await row.save();
      logger.info('Row updated successfully');
    } catch (error) {
      logger.error('Failed to update row', error);
      throw new DatabaseError('Помилка оновлення рядка');
    }
  }
}

module.exports = SheetsService;
