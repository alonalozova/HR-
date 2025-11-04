/**
 * 🚦 RATE LIMITING MIDDLEWARE
 * Система обмеження швидкості запитів для HR бота
 */

import { Request, Response, NextFunction } from 'express';
import { TypeSafeHelpers } from '../utils/type-safe-helpers';

// 🎯 INTERFACES
interface RateLimitRule {
  windowMs: number; // Час вікна в мілісекундах
  maxRequests: number; // Максимальна кількість запитів
  skipSuccessfulRequests?: boolean; // Пропускати успішні запити
  skipFailedRequests?: boolean; // Пропускати невдалі запити
  keyGenerator?: (req: Request) => string; // Генератор ключів
  message?: string; // Повідомлення при перевищенні ліміту
  statusCode?: number; // HTTP статус код
}

interface RateLimitConfig {
  [endpoint: string]: RateLimitRule;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

// 🚦 RATE LIMITING MIDDLEWARE
export class RateLimitMiddleware {
  private static store = new Map<string, RateLimitEntry>();
  private static cleanupInterval: NodeJS.Timeout;

  // Конфігурація rate limiting
  private static readonly RATE_LIMIT_CONFIG: RateLimitConfig = {
    // Загальні обмеження
    'default': {
      windowMs: 15 * 60 * 1000, // 15 хвилин
      maxRequests: 100,
      message: 'Too many requests, please try again later.',
      statusCode: 429
    },

    // Webhook обмеження
    'webhook': {
      windowMs: 60 * 1000, // 1 хвилина
      maxRequests: 30,
      message: 'Too many webhook requests, please slow down.',
      statusCode: 429
    },

    // Авторизація
    'auth': {
      windowMs: 15 * 60 * 1000, // 15 хвилин
      maxRequests: 5,
      message: 'Too many authentication attempts, please try again later.',
      statusCode: 429
    },

    // Відпустки
    'vacations': {
      windowMs: 60 * 1000, // 1 хвилина
      maxRequests: 10,
      message: 'Too many vacation requests, please slow down.',
      statusCode: 429
    },

    // Звіти
    'reports': {
      windowMs: 5 * 60 * 1000, // 5 хвилин
      maxRequests: 20,
      message: 'Too many report requests, please try again later.',
      statusCode: 429
    },

    // API запити
    'api': {
      windowMs: 60 * 1000, // 1 хвилина
      maxRequests: 60,
      message: 'API rate limit exceeded, please slow down.',
      statusCode: 429
    },

    // Health check
    'health': {
      windowMs: 60 * 1000, // 1 хвилина
      maxRequests: 1000,
      message: 'Health check rate limit exceeded.',
      statusCode: 429
    }
  };

  // IP біллісти
  private static readonly WHITELIST_IPS = [
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1'
  ];

  // IP блокування
  private static readonly BLACKLIST_IPS = new Set<string>();

  /**
   * Ініціалізує rate limiting middleware
   */
  static initialize(): void {
    // Очищаємо застарілі записи кожні 5 хвилин
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Основне middleware для rate limiting
   */
  static rateLimit(endpoint: string = 'default') {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        const config = this.RATE_LIMIT_CONFIG[endpoint] || this.RATE_LIMIT_CONFIG['default'];
        const key = this.generateKey(req, config);
        
        // Перевіряємо IP біллісти
        if (this.isWhitelisted(req)) {
          return next();
        }

        // Перевіряємо IP блокування
        if (this.isBlacklisted(req)) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Your IP address is blocked.'
          });
        }

        // Отримуємо поточний стан
        const current = this.getCurrentState(key, config);
        
        // Перевіряємо ліміт
        if (current.count >= config.maxRequests) {
          // Логуємо перевищення ліміту
          this.logRateLimitExceeded(req, config, current);
          
          // Блокуємо IP при критичному перевищенні
          if (current.count >= config.maxRequests * 2) {
            this.blacklistIP(req.ip || 'unknown');
          }

          return res.status(config.statusCode || 429).json({
            error: 'Rate limit exceeded',
            message: config.message || 'Too many requests',
            retryAfter: Math.ceil((current.resetTime - Date.now()) / 1000)
          });
        }

        // Оновлюємо лічильник
        this.incrementCounter(key, config);

        // Додаємо заголовки відповіді
        res.set({
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': Math.max(0, config.maxRequests - current.count - 1).toString(),
          'X-RateLimit-Reset': new Date(current.resetTime).toISOString()
        });

        next();
      } catch (error) {
        console.error('Rate limit middleware error:', error);
        // При помилці пропускаємо запит
        next();
      }
    };
  }

  /**
   * Спеціальний rate limiter для Telegram webhook
   */
  static telegramWebhook() {
    return this.rateLimit('webhook');
  }

  /**
   * Спеціальний rate limiter для авторизації
   */
  static auth() {
    return this.rateLimit('auth');
  }

  /**
   * Спеціальний rate limiter для відпусток
   */
  static vacations() {
    return this.rateLimit('vacations');
  }

  /**
   * Спеціальний rate limiter для звітів
   */
  static reports() {
    return this.rateLimit('reports');
  }

  /**
   * Спеціальний rate limiter для API
   */
  static api() {
    return this.rateLimit('api');
  }

  /**
   * Спеціальний rate limiter для health check
   */
  static health() {
    return this.rateLimit('health');
  }

  /**
   * Адаптивний rate limiter (зменшує ліміт при підозрілій активності)
   */
  static adaptive() {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip || 'unknown';
      const userAgent = req.get('User-Agent') || '';
      
      // Визначаємо рівень підозри
      const suspicionLevel = this.calculateSuspicionLevel(req);
      
      // Адаптуємо конфігурацію
      const baseConfig = this.RATE_LIMIT_CONFIG['default'];
      const adaptiveConfig: RateLimitRule = {
        ...baseConfig,
        maxRequests: Math.max(1, Math.floor(baseConfig.maxRequests * (1 - suspicionLevel * 0.5))),
        windowMs: Math.max(60 * 1000, baseConfig.windowMs * (1 + suspicionLevel))
      };

      const key = this.generateKey(req, adaptiveConfig);
      const current = this.getCurrentState(key, adaptiveConfig);
      
      if (current.count >= adaptiveConfig.maxRequests) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Suspicious activity detected, rate limit reduced.',
          retryAfter: Math.ceil((current.resetTime - Date.now()) / 1000)
        });
      }

      this.incrementCounter(key, adaptiveConfig);
      next();
    };
  }

  /**
   * Генерує ключ для rate limiting
   */
  private static generateKey(req: Request, config: RateLimitRule): string {
    if (config.keyGenerator) {
      return config.keyGenerator(req);
    }

    const ip = req.ip || 'unknown';
    const telegramId = this.extractTelegramId(req);
    
    // Використовуємо Telegram ID якщо доступний, інакше IP
    const identifier = telegramId ? `user_${telegramId}` : `ip_${ip}`;
    const window = Math.floor(Date.now() / config.windowMs);
    
    return `${identifier}_${window}`;
  }

  /**
   * Витягує Telegram ID з запиту
   */
  private static extractTelegramId(req: Request): number | null {
    // Telegram webhook format
    if (req.body?.message?.from?.id) {
      return TypeSafeHelpers.Number.safeParseInt(req.body.message.from.id);
    }
    
    // API format
    if (req.headers['x-telegram-id']) {
      return TypeSafeHelpers.Number.safeParseInt(req.headers['x-telegram-id'] as string);
    }
    
    return null;
  }

  /**
   * Отримує поточний стан rate limiting
   */
  private static getCurrentState(key: string, config: RateLimitRule): RateLimitEntry {
    const now = Date.now();
    const existing = this.store.get(key);
    
    if (!existing || now >= existing.resetTime) {
      // Створюємо новий запис
      const newEntry: RateLimitEntry = {
        count: 0,
        resetTime: now + config.windowMs,
        firstRequest: now
      };
      this.store.set(key, newEntry);
      return newEntry;
    }
    
    return existing;
  }

  /**
   * Збільшує лічильник запитів
   */
  private static incrementCounter(key: string, config: RateLimitRule): void {
    const current = this.store.get(key);
    if (current) {
      current.count++;
      this.store.set(key, current);
    }
  }

  /**
   * Перевіряє чи IP в біллісті
   */
  private static isWhitelisted(req: Request): boolean {
    const ip = req.ip || 'unknown';
    return this.WHITELIST_IPS.includes(ip);
  }

  /**
   * Перевіряє чи IP в блокуванні
   */
  private static isBlacklisted(req: Request): boolean {
    const ip = req.ip || 'unknown';
    return this.BLACKLIST_IPS.has(ip);
  }

  /**
   * Блокує IP адресу
   */
  private static blacklistIP(ip: string): void {
    this.BLACKLIST_IPS.add(ip);
    console.warn(`IP ${ip} has been blacklisted due to excessive requests`);
    
    // Автоматично розблокуємо через 1 годину
    setTimeout(() => {
      this.BLACKLIST_IPS.delete(ip);
      console.info(`IP ${ip} has been unblacklisted`);
    }, 60 * 60 * 1000);
  }

  /**
   * Обчислює рівень підозри
   */
  private static calculateSuspicionLevel(req: Request): number {
    let suspicion = 0;
    
    // Підозрілий User-Agent
    const userAgent = req.get('User-Agent') || '';
    if (userAgent.includes('bot') || userAgent.includes('crawler')) {
      suspicion += 0.3;
    }
    
    // Часті запити з одного IP
    const ip = req.ip || 'unknown';
    const ipKey = `ip_${ip}`;
    const ipRequests = Array.from(this.store.keys())
      .filter(key => key.startsWith(ipKey))
      .length;
    
    if (ipRequests > 50) {
      suspicion += 0.4;
    }
    
    // Підозрілі шляхи
    const suspiciousPaths = ['/admin', '/config', '/.env'];
    if (suspiciousPaths.some(path => req.path.includes(path))) {
      suspicion += 0.5;
    }
    
    return Math.min(1, suspicion);
  }

  /**
   * Логує перевищення rate limit
   */
  private static logRateLimitExceeded(req: Request, config: RateLimitRule, current: RateLimitEntry): void {
    const ip = req.ip || 'unknown';
    const userAgent = req.get('User-Agent') || '';
    const telegramId = this.extractTelegramId(req);
    
    console.warn(`Rate limit exceeded:`, {
      ip,
      telegramId,
      userAgent,
      path: req.path,
      method: req.method,
      limit: config.maxRequests,
      current: current.count,
      resetTime: new Date(current.resetTime).toISOString()
    });
  }

  /**
   * Очищає застарілі записи
   */
  private static cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetTime) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.store.delete(key));
    
    if (keysToDelete.length > 0) {
      console.debug(`Cleaned up ${keysToDelete.length} expired rate limit entries`);
    }
  }

  /**
   * Отримує статистику rate limiting
   */
  static getStats(): {
    totalEntries: number;
    entriesByIP: Record<string, number>;
    blockedIPs: string[];
    whitelistedIPs: string[];
  } {
    const entriesByIP: Record<string, number> = {};
    
    for (const [key, entry] of this.store.entries()) {
      const ip = key.split('_')[1]; // Формат: type_ip_window
      entriesByIP[ip] = (entriesByIP[ip] || 0) + entry.count;
    }
    
    return {
      totalEntries: this.store.size,
      entriesByIP,
      blockedIPs: Array.from(this.BLACKLIST_IPS),
      whitelistedIPs: [...this.WHITELIST_IPS]
    };
  }

  /**
   * Скидає rate limit для конкретного користувача/IP
   */
  static resetLimit(identifier: string): void {
    const keysToDelete = Array.from(this.store.keys())
      .filter(key => key.includes(identifier));
    
    keysToDelete.forEach(key => this.store.delete(key));
    
    console.info(`Reset rate limit for ${identifier}, removed ${keysToDelete.length} entries`);
  }

  /**
   * Додає IP до біллісти
   */
  static whitelistIP(ip: string): void {
    if (!this.WHITELIST_IPS.includes(ip)) {
      this.WHITELIST_IPS.push(ip);
      console.info(`IP ${ip} added to whitelist`);
    }
  }

  /**
   * Видаляє IP з біллісти
   */
  static unwhitelistIP(ip: string): void {
    const index = this.WHITELIST_IPS.indexOf(ip);
    if (index > -1) {
      this.WHITELIST_IPS.splice(index, 1);
      console.info(`IP ${ip} removed from whitelist`);
    }
  }

  /**
   * Зупиняє cleanup interval
   */
  static destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// 🎯 ЗРУЧНІ ФУНКЦІЇ
export const rateLimit = (endpoint?: string) => RateLimitMiddleware.rateLimit(endpoint);
export const telegramWebhook = () => RateLimitMiddleware.telegramWebhook();
export const auth = () => RateLimitMiddleware.auth();
export const vacations = () => RateLimitMiddleware.vacations();
export const reports = () => RateLimitMiddleware.reports();
export const api = () => RateLimitMiddleware.api();
export const health = () => RateLimitMiddleware.health();
export const adaptive = () => RateLimitMiddleware.adaptive();

export default RateLimitMiddleware;

