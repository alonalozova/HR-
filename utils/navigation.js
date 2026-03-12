/**
 * 🧭 NAVIGATION UTILITY
 * Система навігації для збереження попередніх станів меню
 */

const { HybridCache } = require('./cache');
const config = require('../config');

class NavigationStack {
  constructor() {
    // Кеш для збереження історії навігації (10 хвилин TTL, Redis-підтримка)
    this.navigationHistory = new HybridCache('navigation', 1000, 10 * 60 * 1000);
  }

  /**
   * Зберігає поточний стан меню перед переходом до нового
   * @param {number} telegramId - ID користувача
   * @param {string} currentState - Поточний стан (назва функції меню)
   * @param {Object} context - Контекст (параметри для відновлення стану)
   */
  pushState(telegramId, currentState, context = {}) {
    const key = `nav_${telegramId}`;
    let history = this.navigationHistory.get(key) || [];
    
    // Додаємо поточний стан до історії (якщо він не порожній)
    if (currentState && currentState !== 'main_menu') {
      history.push({
        state: currentState,
        context: context,
        timestamp: Date.now()
      });
      
      // Обмежуємо історію до 10 станів
      if (history.length > 10) {
        history = history.slice(-10);
      }
    }
    
    this.navigationHistory.set(key, history);
  }

  /**
   * Отримує попередній стан з історії
   * @param {number} telegramId - ID користувача
   * @returns {Object|null} Попередній стан або null
   */
  popState(telegramId) {
    const key = `nav_${telegramId}`;
    const history = this.navigationHistory.get(key) || [];
    
    if (history.length === 0) {
      return null;
    }
    
    // Видаляємо останній стан
    const previousState = history.pop();
    this.navigationHistory.set(key, history);
    
    return previousState;
  }

  /**
   * Отримує попередній стан без видалення
   * @param {number} telegramId - ID користувача
   * @returns {Object|null} Попередній стан або null
   */
  peekState(telegramId) {
    const key = `nav_${telegramId}`;
    const history = this.navigationHistory.get(key) || [];
    
    if (history.length === 0) {
      return null;
    }
    
    return history[history.length - 1];
  }

  /**
   * Очищає історію навігації для користувача
   * @param {number} telegramId - ID користувача
   */
  clearHistory(telegramId) {
    const key = `nav_${telegramId}`;
    this.navigationHistory.delete(key);
  }

  /**
   * Перевіряє чи є попередній стан
   * @param {number} telegramId - ID користувача
   * @returns {boolean}
   */
  hasPreviousState(telegramId) {
    const key = `nav_${telegramId}`;
    const history = this.navigationHistory.get(key) || [];
    return history.length > 0;
  }
}

// Експортуємо singleton
const navigationStack = new NavigationStack();

module.exports = navigationStack;

