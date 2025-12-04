/**
 * Rate Limiter для захисту від спаму та DDoS
 */

const { HybridCache } = require('./cache');

class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new HybridCache(1000, windowMs);
  }

  canProceed(identifier) {
    const key = String(identifier);
    const now = Date.now();
    const history = this.requests.get(key) || [];
    const recentRequests = history.filter(timestamp => now - timestamp < this.windowMs);
    
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }
    
    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    return true;
  }

  getRemaining(identifier) {
    const key = String(identifier);
    const now = Date.now();
    const history = this.requests.get(key) || [];
    const recentRequests = history.filter(timestamp => now - timestamp < this.windowMs);
    return Math.max(0, this.maxRequests - recentRequests.length);
  }

  reset(identifier) {
    const key = String(identifier);
    this.requests.delete(key);
  }
}

const messageLimiter = new RateLimiter(20, 60000);
const callbackLimiter = new RateLimiter(30, 60000);
const registrationLimiter = new RateLimiter(5, 300000);

module.exports = {
  RateLimiter,
  messageLimiter,
  callbackLimiter,
  registrationLimiter
};

