/**
 * 🛡️ SECURITY SERVICE
 * Комплексний захист від спаму, DDoS та зловживань
 */

const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/errors');

class SecurityService {
  constructor() {
    this.blockedIPs = new Map();
    this.suspiciousActivity = new Map();
    this.rateLimitConfigs = this.initializeRateLimits();
  }

  /**
   * Ініціалізація різних рівнів rate limiting
   */
  initializeRateLimits() {
    return {
      // 🚀 Webhook - основний endpoint
      webhook: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 хвилин
        max: 100, // максимум 100 запитів
        message: {
          error: 'Забагато запитів до webhook. Спробуйте пізніше.',
          retryAfter: '15 хвилин'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          logger.warn('Webhook rate limit exceeded', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.url
          });
          
          res.status(429).json({
            error: 'Забагато запитів до webhook. Спробуйте пізнише.',
            retryAfter: '15 хвилин',
            timestamp: new Date().toISOString()
          });
        }
      }),

      // 📊 API endpoints - більш строгий ліміт
      api: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 хвилин
        max: 50, // максимум 50 запитів
        message: {
          error: 'Забагато API запитів. Спробуйте пізніше.',
          retryAfter: '15 хвилин'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          logger.warn('API rate limit exceeded', {
            ip: req.ip,
            endpoint: req.path,
            method: req.method
          });
          
          res.status(429).json({
            error: 'Забагато API запитів. Спробуйте пізніше.',
            retryAfter: '15 хвилин',
            timestamp: new Date().toISOString()
          });
        }
      }),

      // 🔒 Критичні операції - дуже строгий ліміт
      critical: rateLimit({
        windowMs: 5 * 60 * 1000, // 5 хвилин
        max: 10, // максимум 10 запитів
        message: {
          error: 'Забагато критичних операцій. Спробуйте пізніше.',
          retryAfter: '5 хвилин'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          logger.error('Critical operation rate limit exceeded', {
            ip: req.ip,
            endpoint: req.path,
            method: req.method
          });
          
          // Додаємо IP до підозрілих
          this.markSuspiciousActivity(req.ip);
          
          res.status(429).json({
            error: 'Забагато критичних операцій. Ваш IP тимчасово заблокований.',
            retryAfter: '5 хвилин',
            timestamp: new Date().toISOString()
          });
        }
      }),

      // 🏥 Health check - ліберальний ліміт
      health: rateLimit({
        windowMs: 1 * 60 * 1000, // 1 хвилина
        max: 60, // максимум 60 запитів
        message: {
          error: 'Забагато health check запитів.',
          retryAfter: '1 хвилина'
        },
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
          // Пропускаємо Railway health checks
          return req.get('User-Agent')?.includes('Railway') || false;
        }
      }),

      // 📱 Telegram updates - середній ліміт
      telegram: rateLimit({
        windowMs: 10 * 60 * 1000, // 10 хвилин
        max: 200, // максимум 200 запитів
        message: {
          error: 'Забагато Telegram запитів. Спробуйте пізніше.',
          retryAfter: '10 хвилин'
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
          // Групуємо по Telegram chat ID якщо доступний
          const update = req.body;
          if (update?.message?.chat?.id) {
            return `telegram_${update.message.chat.id}`;
          }
          if (update?.callback_query?.from?.id) {
            return `telegram_${update.callback_query.from.id}`;
          }
          return req.ip;
        }
      })
    };
  }

  /**
   * Отримання rate limiter для конкретного типу
   */
  getRateLimiter(type) {
    const limiter = this.rateLimitConfigs[type];
    if (!limiter) {
      logger.error('Unknown rate limiter type', { type });
      return this.rateLimitConfigs.webhook; // fallback
    }
    return limiter;
  }

  /**
   * Перевірка підозрілої активності
   */
  isSuspiciousActivity(ip) {
    const activity = this.suspiciousActivity.get(ip);
    if (!activity) return false;
    
    // Очищаємо застарілі записи
    if (Date.now() - activity.timestamp > 60 * 60 * 1000) { // 1 година
      this.suspiciousActivity.delete(ip);
      return false;
    }
    
    return activity.count > 5; // більше 5 порушень за годину
  }

  /**
   * Позначення підозрілої активності
   */
  markSuspiciousActivity(ip) {
    const existing = this.suspiciousActivity.get(ip);
    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
    } else {
      this.suspiciousActivity.set(ip, {
        count: 1,
        timestamp: Date.now(),
        lastSeen: Date.now()
      });
    }
    
    logger.warn('Suspicious activity detected', {
      ip,
      count: this.suspiciousActivity.get(ip).count
    });
  }

  /**
   * Блокування IP адреси
   */
  blockIP(ip, reason = 'Suspicious activity') {
    this.blockedIPs.set(ip, {
      reason,
      timestamp: Date.now(),
      expires: Date.now() + 24 * 60 * 60 * 1000 // 24 години
    });
    
    logger.error('IP blocked', { ip, reason });
  }

  /**
   * Перевірка чи IP заблокований
   */
  isIPBlocked(ip) {
    const blockInfo = this.blockedIPs.get(ip);
    if (!blockInfo) return false;
    
    // Очищаємо застарілі блокування
    if (Date.now() > blockInfo.expires) {
      this.blockedIPs.delete(ip);
      return false;
    }
    
    return true;
  }

  /**
   * Middleware для перевірки заблокованих IP
   */
  checkBlockedIP(req, res, next) {
    const ip = req.ip;
    
    if (this.isIPBlocked(ip)) {
      const blockInfo = this.blockedIPs.get(ip);
      logger.warn('Blocked IP attempted access', { ip, reason: blockInfo.reason });
      
      return res.status(403).json({
        error: 'Ваш IP тимчасово заблокований',
        reason: blockInfo.reason,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  }

  /**
   * Middleware для логування підозрілої активності
   */
  logSuspiciousActivity(req, res, next) {
    const ip = req.ip;
    const userAgent = req.get('User-Agent');
    const url = req.url;
    const method = req.method;
    
    // Перевіряємо підозрілі паттерни
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /\.exe$/i,
      /\.bat$/i,
      /\.cmd$/i,
      /eval\(/i,
      /script/i,
      /javascript:/i
    ];
    
    const isSuspicious = suspiciousPatterns.some(pattern => 
      pattern.test(userAgent) || pattern.test(url)
    );
    
    if (isSuspicious) {
      logger.warn('Suspicious request detected', {
        ip,
        userAgent,
        url,
        method,
        timestamp: new Date().toISOString()
      });
      
      this.markSuspiciousActivity(ip);
    }
    
    next();
  }

  /**
   * Middleware для захисту від brute force
   */
  bruteForceProtection(req, res, next) {
    const ip = req.ip;
    const key = `brute_force_${ip}`;
    
    // Простий лічильник спроб
    const attempts = this.suspiciousActivity.get(key) || { count: 0, timestamp: Date.now() };
    
    // Збільшуємо лічильник при підозрілих запитах
    if (req.url.includes('admin') || req.url.includes('login') || req.url.includes('auth')) {
      attempts.count++;
      attempts.timestamp = Date.now();
      this.suspiciousActivity.set(key, attempts);
      
      if (attempts.count > 10) { // більше 10 спроб
        this.blockIP(ip, 'Brute force attempt');
        return res.status(403).json({
          error: 'Забагато спроб доступу. IP заблокований.',
          timestamp: new Date().toISOString()
        });
      }
    }
    
    next();
  }

  /**
   * Отримання статистики безпеки
   */
  getSecurityStats() {
    const now = Date.now();
    
    // Очищаємо застарілі записи
    for (const [ip, info] of this.suspiciousActivity.entries()) {
      if (now - info.timestamp > 60 * 60 * 1000) { // 1 година
        this.suspiciousActivity.delete(ip);
      }
    }
    
    for (const [ip, info] of this.blockedIPs.entries()) {
      if (now > info.expires) {
        this.blockedIPs.delete(ip);
      }
    }
    
    return {
      blockedIPs: this.blockedIPs.size,
      suspiciousActivity: this.suspiciousActivity.size,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Очищення всіх блокувань (тільки для адміністратора)
   */
  clearAllBlocks() {
    this.blockedIPs.clear();
    this.suspiciousActivity.clear();
    logger.info('All security blocks cleared');
  }
}

module.exports = SecurityService;
