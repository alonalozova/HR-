/**
 * Rate Limiter для захисту від спаму та DDoS
 */

const { HybridCache } = require('./cache');

class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests; // Максимум запитів
    this.windowMs = windowMs; // Вікно часу в мілісекундах
    this.requests = new HybridCache(1000, windowMs); // Кеш для зберігання запитів
  }

  /**
   * Перевіряє чи можна виконати запит
   * @param {string|number} identifier - Унікальний ідентифікатор (telegramId, IP, тощо)
   * @returns {boolean} true якщо можна, false якщо перевищено ліміт
   */
  canProceed(identifier) {
    const key = String(identifier);
    const now = Date.now();
    
    // Отримуємо історію запитів
    const history = this.requests.get(key) || [];
    
    // Фільтруємо запити в межах вікна
    const recentRequests = history.filter(timestamp => now - timestamp < this.windowMs);
    
    // Перевіряємо ліміт
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Додаємо поточний запит
    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    
    return true;
  }

  /**
   * Отримує кількість залишкових запитів
   * @param {string|number} identifier - Унікальний ідентифікатор
   * @returns {number} Кількість залишкових запитів
   */
  getRemaining(identifier) {
    const key = String(identifier);
    const now = Date.now();
    const history = this.requests.get(key) || [];
    const recentRequests = history.filter(timestamp => now - timestamp < this.windowMs);
    return Math.max(0, this.maxRequests - recentRequests.length);
  }

  /**
   * Очищає історію для ідентифікатора
   * @param {string|number} identifier - Унікальний ідентифікатор
   */
  reset(identifier) {
    const key = String(identifier);
    this.requests.delete(key);
  }
}

// Глобальні rate limiters для різних типів запитів
const messageLimiter = new RateLimiter(20, 60000); // 20 повідомлень на хвилину
const callbackLimiter = new RateLimiter(30, 60000); // 30 callback'ів на хвилину
const registrationLimiter = new RateLimiter(5, 300000); // 5 спроб реєстрації на 5 хвилин

module.exports = {
  RateLimiter,
  messageLimiter,
  callbackLimiter,
  registrationLimiter
};


