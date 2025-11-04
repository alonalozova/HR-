/**
 * 🛡️ TYPE SAFE HELPERS - Безпечні допоміжні функції
 * Забезпечує безпечну роботу з даними та запобігає помилкам типів
 */

import { User, VacationRequest, LateRecord, RemoteRecord, SickRecord } from '../types';

// 🔢 NUMBER SAFETY
export class NumberSafety {
  /**
   * Безпечно парсить число з рядка
   */
  static safeParseInt(value: any, defaultValue: number = 0): number {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Безпечно порівнює два числа
   */
  static safeEquals(a: any, b: any): boolean {
    const numA = this.safeParseInt(a);
    const numB = this.safeParseInt(b);
    return numA === numB;
  }

  /**
   * Безпечно перевіряє чи число в межах
   */
  static isInRange(value: any, min: number, max: number): boolean {
    const num = this.safeParseInt(value);
    return num >= min && num <= max;
  }

  /**
   * Безпечно додає числа
   */
  static safeAdd(a: any, b: any): number {
    const numA = this.safeParseInt(a);
    const numB = this.safeParseInt(b);
    return numA + numB;
  }

  /**
   * Безпечно віднімає числа
   */
  static safeSubtract(a: any, b: any): number {
    const numA = this.safeParseInt(a);
    const numB = this.safeParseInt(b);
    return numA - numB;
  }
}

// 📅 DATE SAFETY
export class DateSafety {
  /**
   * Безпечно парсить дату з різних форматів
   */
  static safeParseDate(value: any): Date | null {
    if (!value) return null;
    
    try {
      // Спробуємо різні формати
      if (typeof value === 'string') {
        // Формат ДД.ММ.РРРР
        if (value.includes('.')) {
          const [day, month, year] = value.split('.').map(Number);
          if (day && month && year) {
            return new Date(year, month - 1, day);
          }
        }
        
        // ISO формат
        if (value.includes('T') || value.includes('-')) {
          const date = new Date(value);
          return isNaN(date.getTime()) ? null : date;
        }
      }
      
      // Date об'єкт
      if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
      }
      
      // Timestamp
      if (typeof value === 'number') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Безпечно порівнює дати
   */
  static safeEquals(a: any, b: any): boolean {
    const dateA = this.safeParseDate(a);
    const dateB = this.safeParseDate(b);
    
    if (!dateA || !dateB) return false;
    
    return dateA.getTime() === dateB.getTime();
  }

  /**
   * Безпечно перевіряє чи дата в межах
   */
  static isInRange(value: any, startDate: Date, endDate: Date): boolean {
    const date = this.safeParseDate(value);
    if (!date) return false;
    
    return date >= startDate && date <= endDate;
  }

  /**
   * Безпечно додає дні до дати
   */
  static addDays(date: any, days: number): Date | null {
    const baseDate = this.safeParseDate(date);
    if (!baseDate) return null;
    
    const result = new Date(baseDate);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Безпечно обчислює різницю в днях
   */
  static daysDifference(a: any, b: any): number | null {
    const dateA = this.safeParseDate(a);
    const dateB = this.safeParseDate(b);
    
    if (!dateA || !dateB) return null;
    
    const diffTime = Math.abs(dateA.getTime() - dateB.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

// 📝 STRING SAFETY
export class StringSafety {
  /**
   * Безпечно отримує рядок з будь-якого значення
   */
  static safeString(value: any, defaultValue: string = ''): string {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    return String(value).trim();
  }

  /**
   * Безпечно порівнює рядки (case-insensitive)
   */
  static safeEquals(a: any, b: any, caseSensitive: boolean = false): boolean {
    const strA = this.safeString(a);
    const strB = this.safeString(b);
    
    if (caseSensitive) {
      return strA === strB;
    }
    
    return strA.toLowerCase() === strB.toLowerCase();
  }

  /**
   * Безпечно перевіряє чи рядок не порожній
   */
  static isNotEmpty(value: any): boolean {
    return this.safeString(value).length > 0;
  }

  /**
   * Безпечно обрізає рядок до певної довжини
   */
  static safeTruncate(value: any, maxLength: number): string {
    const str = this.safeString(value);
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  }

  /**
   * Безпечно валідує email
   */
  static isValidEmail(value: any): boolean {
    const email = this.safeString(value);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// 🔍 ARRAY SAFETY
export class ArraySafety {
  /**
   * Безпечно знаходить елемент в масиві
   */
  static safeFind<T>(array: T[] | undefined | null, predicate: (item: T) => boolean): T | undefined {
    if (!Array.isArray(array)) return undefined;
    
    try {
      return array.find(predicate);
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Безпечно фільтрує масив
   */
  static safeFilter<T>(array: T[] | undefined | null, predicate: (item: T) => boolean): T[] {
    if (!Array.isArray(array)) return [];
    
    try {
      return array.filter(predicate);
    } catch (error) {
      return [];
    }
  }

  /**
   * Безпечно мапить масив
   */
  static safeMap<T, U>(array: T[] | undefined | null, mapper: (item: T) => U): U[] {
    if (!Array.isArray(array)) return [];
    
    try {
      return array.map(mapper);
    } catch (error) {
      return [];
    }
  }

  /**
   * Безпечно отримує довжину масиву
   */
  static safeLength(array: any): number {
    return Array.isArray(array) ? array.length : 0;
  }
}

// 🗄️ GOOGLE SHEETS SAFETY
export class SheetsSafety {
  /**
   * Безпечно отримує значення з рядка Google Sheets
   */
  static safeGet(row: any, column: string, defaultValue: any = ''): any {
    if (!row || !row.get) return defaultValue;
    
    try {
      const value = row.get(column);
      return value !== undefined && value !== null ? value : defaultValue;
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * Безпечно знаходить користувача за Telegram ID
   */
  static safeFindUser(rows: any[], telegramId: number): any | undefined {
    if (!Array.isArray(rows)) return undefined;
    
    return rows.find(row => {
      try {
        const rowTelegramId = NumberSafety.safeParseInt(
          this.safeGet(row, 'TelegramID', '')
        );
        return rowTelegramId === telegramId;
      } catch (error) {
        return false;
      }
    });
  }

  /**
   * Безпечно знаходить заявки на відпустку
   */
  static safeFindVacationRequests(
    rows: any[], 
    userId?: number, 
    status?: string
  ): any[] {
    if (!Array.isArray(rows)) return [];
    
    return rows.filter(row => {
      try {
        // Фільтр по користувачу
        if (userId !== undefined) {
          const rowUserId = NumberSafety.safeParseInt(
            this.safeGet(row, 'UserID', '')
          );
          if (rowUserId !== userId) return false;
        }
        
        // Фільтр по статусу
        if (status !== undefined) {
          const rowStatus = StringSafety.safeString(
            this.safeGet(row, 'Status', '')
          );
          if (!StringSafety.safeEquals(rowStatus, status)) return false;
        }
        
        return true;
      } catch (error) {
        return false;
      }
    });
  }

  /**
   * Безпечно перевіряє конфлікти відпусток
   */
  static safeCheckVacationConflicts(
    rows: any[],
    startDate: Date,
    endDate: Date,
    department: string,
    team: string,
    excludeUserId?: number
  ): any[] {
    if (!Array.isArray(rows)) return [];
    
    return rows.filter(row => {
      try {
        // Виключаємо поточного користувача
        if (excludeUserId !== undefined) {
          const rowUserId = NumberSafety.safeParseInt(
            this.safeGet(row, 'UserID', '')
          );
          if (rowUserId === excludeUserId) return false;
        }
        
        // Перевіряємо відділ та команду
        const rowDepartment = StringSafety.safeString(
          this.safeGet(row, 'Department', '')
        );
        const rowTeam = StringSafety.safeString(
          this.safeGet(row, 'Team', '')
        );
        
        if (!StringSafety.safeEquals(rowDepartment, department) ||
            !StringSafety.safeEquals(rowTeam, team)) {
          return false;
        }
        
        // Перевіряємо статус (тільки затверджені)
        const rowStatus = StringSafety.safeString(
          this.safeGet(row, 'Status', '')
        );
        if (!StringSafety.safeEquals(rowStatus, 'approved')) {
          return false;
        }
        
        // Перевіряємо перетин дат
        const rowStartDate = DateSafety.safeParseDate(
          this.safeGet(row, 'StartDate', '')
        );
        const rowEndDate = DateSafety.safeParseDate(
          this.safeGet(row, 'EndDate', '')
        );
        
        if (!rowStartDate || !rowEndDate) return false;
        
        // Перевіряємо чи є перетин
        return (startDate <= rowEndDate && endDate >= rowStartDate);
        
      } catch (error) {
        return false;
      }
    });
  }
}

// 🔐 OBJECT SAFETY
export class ObjectSafety {
  /**
   * Безпечно отримує значення з об'єкта
   */
  static safeGet(obj: any, path: string, defaultValue: any = undefined): any {
    if (!obj || typeof obj !== 'object') return defaultValue;
    
    try {
      const keys = path.split('.');
      let current = obj;
      
      for (const key of keys) {
        if (current === null || current === undefined) {
          return defaultValue;
        }
        current = current[key];
      }
      
      return current !== undefined ? current : defaultValue;
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * Безпечно встановлює значення в об'єкт
   */
  static safeSet(obj: any, path: string, value: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    
    try {
      const keys = path.split('.');
      let current = obj;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }
      
      current[keys[keys.length - 1]] = value;
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Безпечно перевіряє чи об'єкт має властивість
   */
  static safeHas(obj: any, path: string): boolean {
    return this.safeGet(obj, path, undefined) !== undefined;
  }
}

// 🎯 VALIDATION HELPERS
export class ValidationHelpers {
  /**
   * Валідує Telegram ID
   */
  static isValidTelegramId(value: any): boolean {
    const id = NumberSafety.safeParseInt(value);
    return id > 0 && id < Number.MAX_SAFE_INTEGER;
  }

  /**
   * Валідує дату відпустки
   */
  static isValidVacationDate(date: any): boolean {
    const parsedDate = DateSafety.safeParseDate(date);
    if (!parsedDate) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return parsedDate >= today;
  }

  /**
   * Валідує кількість днів відпустки
   */
  static isValidVacationDays(days: any): boolean {
    const numDays = NumberSafety.safeParseInt(days);
    return NumberSafety.isInRange(numDays, 1, 7);
  }

  /**
   * Валідує email
   */
  static isValidEmail(email: any): boolean {
    return StringSafety.isValidEmail(email);
  }

  /**
   * Валідує повне ім'я
   */
  static isValidFullName(name: any): boolean {
    const fullName = StringSafety.safeString(name);
    const words = fullName.split(/\s+/);
    return words.length >= 2 && words.every(word => word.length >= 2);
  }
}

// 🚨 ERROR SAFETY
export class ErrorSafety {
  /**
   * Безпечно виконує функцію з обробкою помилок
   */
  static safeExecute<T>(
    fn: () => T, 
    defaultValue: T, 
    onError?: (error: Error) => void
  ): T {
    try {
      return fn();
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
      return defaultValue;
    }
  }

  /**
   * Безпечно виконує асинхронну функцію
   */
  static async safeExecuteAsync<T>(
    fn: () => Promise<T>, 
    defaultValue: T, 
    onError?: (error: Error) => void
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
      return defaultValue;
    }
  }
}

// 📊 STATISTICS HELPERS
export class StatsHelpers {
  /**
   * Безпечно обчислює статистику
   */
  static safeCalculateStats(data: any[]): {
    total: number;
    valid: number;
    invalid: number;
    percentage: number;
  } {
    const total = ArraySafety.safeLength(data);
    const valid = ArraySafety.safeFilter(data, item => item != null).length;
    const invalid = total - valid;
    const percentage = total > 0 ? (valid / total) * 100 : 0;
    
    return { total, valid, invalid, percentage };
  }

  /**
   * Безпечно групує дані
   */
  static safeGroupBy<T>(data: T[], keyFn: (item: T) => string): { [key: string]: T[] } {
    if (!Array.isArray(data)) return {};
    
    const groups: { [key: string]: T[] } = {};
    
    for (const item of data) {
      try {
        const key = keyFn(item);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(item);
      } catch (error) {
        // Пропускаємо елементи з помилками
      }
    }
    
    return groups;
  }
}

// 🎯 EXPORT ALL HELPERS
export const TypeSafeHelpers = {
  Number: NumberSafety,
  Date: DateSafety,
  String: StringSafety,
  Array: ArraySafety,
  Sheets: SheetsSafety,
  Object: ObjectSafety,
  Validation: ValidationHelpers,
  Error: ErrorSafety,
  Stats: StatsHelpers
};

export default TypeSafeHelpers;

