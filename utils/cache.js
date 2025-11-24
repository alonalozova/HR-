/**
 * Оптимізований кеш з TTL та лімітами розміру
 */

class CacheWithTTL {
  constructor(maxSize = 1000, ttl = 5 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
  
  set(key, value) {
    // Видаляємо найстаріший елемент, якщо досягли ліміту
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      data: value,
      timestamp: Date.now()
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // Перевіряємо TTL
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }
  
  has(key) {
    const item = this.cache.get(key);
    if (!item) return false;
    
    // Перевіряємо TTL
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
  
  delete(key) {
    return this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
  }
  
  size() {
    return this.cache.size;
  }
}

/**
 * Гібридний кеш з підтримкою Redis та fallback на пам'ять
 * Автоматично використовує Redis, якщо доступний, інакше - звичайний кеш
 */
class HybridCache {
  constructor(prefix = 'cache', maxSize = 1000, ttl = 5 * 60 * 1000) {
    this.prefix = prefix;
    this.maxSize = maxSize;
    this.ttl = ttl; // в мілісекундах для пам'яті, в секундах для Redis
    this.memoryCache = new CacheWithTTL(maxSize, ttl);
    this.redis = null;
    this.useRedis = false;
    this.initRedis();
  }

  initRedis() {
    // Асинхронна ініціалізація Redis (неблокуюча)
    (async () => {
      try {
        // Перевіряємо, чи є REDIS_URL в environment
        if (process.env.REDIS_URL) {
          const Redis = require('ioredis');
          this.redis = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
              const delay = Math.min(times * 50, 2000);
              return delay;
            },
            enableOfflineQueue: false,
            lazyConnect: true
          });

          // Обробка помилок Redis
          this.redis.on('error', (err) => {
            console.warn(`⚠️ Redis помилка (переходимо на пам'ять): ${err.message}`);
            this.useRedis = false;
          });

          this.redis.on('connect', () => {
            console.log(`✅ Redis підключено для кешу: ${this.prefix}`);
            this.useRedis = true;
          });

          // Пробуємо підключитися
          await this.redis.connect().catch(() => {
            console.warn(`⚠️ Redis недоступний, використовуємо пам'ять для: ${this.prefix}`);
            this.useRedis = false;
          });
        } else {
          console.log(`ℹ️ REDIS_URL не встановлено, використовуємо пам'ять для: ${this.prefix}`);
        }
      } catch (error) {
        console.warn(`⚠️ Помилка ініціалізації Redis (використовуємо пам'ять): ${error.message}`);
        this.useRedis = false;
      }
    })();
  }

  // Синхронний метод set з асинхронним fallback
  set(key, value) {
    if (this.useRedis && this.redis && this.redis.status === 'ready') {
      // Використовуємо Redis асинхронно, але не блокуємо
      const fullKey = `${this.prefix}:${key}`;
      const ttlSeconds = Math.floor(this.ttl / 1000);
      this.redis.setex(fullKey, ttlSeconds, JSON.stringify({
        data: value,
        timestamp: Date.now()
      })).catch(() => {
        // Якщо Redis не працює, зберігаємо в пам'ять
        this.memoryCache.set(key, value);
      });
      // Також зберігаємо в пам'ять для швидкого доступу
      this.memoryCache.set(key, value);
    } else {
      // Використовуємо пам'ять
      this.memoryCache.set(key, value);
    }
  }

  // Синхронний метод get
  get(key) {
    // Спочатку перевіряємо пам'ять (швидше)
    const memoryValue = this.memoryCache.get(key);
    if (memoryValue !== null) {
      return memoryValue;
    }

    // Якщо в пам'яті немає, але Redis доступний, повертаємо null
    // (Redis асинхронний, тому не можемо синхронно отримати)
    // На практиці це означає, що дані будуть завантажені з Google Sheets
    return null;
  }

  // Синхронний метод has
  has(key) {
    return this.memoryCache.has(key);
  }

  // Синхронний метод delete
  delete(key) {
    if (this.useRedis && this.redis && this.redis.status === 'ready') {
      const fullKey = `${this.prefix}:${key}`;
      this.redis.del(fullKey).catch(() => {
        // Якщо Redis не працює, видаляємо з пам'яті
        this.memoryCache.delete(key);
      });
    }
    return this.memoryCache.delete(key);
  }

  clear() {
    if (this.useRedis && this.redis && this.redis.status === 'ready') {
      // Видаляємо всі ключі з префіксом
      const stream = this.redis.scanStream({
        match: `${this.prefix}:*`,
        count: 100
      });
      stream.on('data', (keys) => {
        if (keys.length) {
          this.redis.del(...keys).catch(() => {});
        }
      });
    }
    this.memoryCache.clear();
  }

  size() {
    return this.memoryCache.size();
  }

  // Асинхронний метод для отримання з Redis (якщо потрібно)
  async getAsync(key) {
    // Спочатку перевіряємо пам'ять
    const memoryValue = this.memoryCache.get(key);
    if (memoryValue !== null) {
      return memoryValue;
    }

    // Якщо в пам'яті немає і Redis доступний, пробуємо отримати з Redis
    if (this.useRedis && this.redis && this.redis.status === 'ready') {
      try {
        const fullKey = `${this.prefix}:${key}`;
        const data = await this.redis.get(fullKey);
        if (data) {
          const parsed = JSON.parse(data);
          const value = parsed.data;
          // Зберігаємо в пам'ять для наступного разу
          this.memoryCache.set(key, value);
          return value;
        }
      } catch (error) {
        // Якщо помилка, повертаємо null
        return null;
      }
    }

    return null;
  }
}

module.exports = CacheWithTTL;
module.exports.HybridCache = HybridCache;
