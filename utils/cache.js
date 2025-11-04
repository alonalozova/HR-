/**
 * 💾 ОПТИМІЗОВАНИЙ КЕШ З TTL
 * Централізований кеш для всього додатку
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

// 💾 КЕШІ
const userCache = new CacheWithTTL(500, 10 * 60 * 1000); // 500 користувачів, 10 хвилин
const registrationCache = new CacheWithTTL(100, 15 * 60 * 1000); // 100 реєстрацій, 15 хвилин
const processedUpdates = new CacheWithTTL(1000, 2 * 60 * 1000); // 1000 запитів, 2 хвилини

// 📊 МОНІТОРИНГ КЕШУ
setInterval(() => {
  console.log(`📊 Кеш статистика: userCache=${userCache.size()}, registrationCache=${registrationCache.size()}, processedUpdates=${processedUpdates.size()}`);
}, 10 * 60 * 1000);

module.exports = {
  CacheWithTTL,
  userCache,
  registrationCache,
  processedUpdates
};

