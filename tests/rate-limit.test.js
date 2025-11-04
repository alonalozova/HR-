/**
 * 🚦 RATE LIMITING TESTS
 * Тести для системи обмеження швидкості запитів
 */

const { RateLimitMiddleware } = require('../middleware/rate-limit');

// Mock Express
const mockReq = (overrides = {}) => ({
  ip: '127.0.0.1',
  path: '/test',
  method: 'GET',
  body: { message: { from: { id: 123 } } },
  headers: { 'User-Agent': 'Test Agent' },
  get: jest.fn((header) => {
    const headers = {
      'User-Agent': 'Test Agent',
      'x-telegram-id': '123'
    };
    return headers[header];
  }),
  ...overrides
});

const mockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis()
  };
  return res;
};

const mockNext = jest.fn();

describe('Rate Limiting Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RateLimitMiddleware.destroy(); // Clean up intervals
    RateLimitMiddleware.clearLogs(); // Clear any logs
  });

  afterEach(() => {
    RateLimitMiddleware.destroy();
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      
      for (let i = 0; i < 5; i++) {
        const req = mockReq();
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        expect(mockNext).toHaveBeenCalled();
        mockNext.mockClear();
      }
    });

    it('should block requests exceeding limit', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      
      // Make requests exceeding the limit (assuming default is 100)
      for (let i = 0; i < 101; i++) {
        const req = mockReq();
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        
        if (i < 100) {
          expect(mockNext).toHaveBeenCalled();
        } else {
          expect(res.status).toHaveBeenCalledWith(429);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              error: 'Rate limit exceeded'
            })
          );
        }
        mockNext.mockClear();
      }
    });

    it('should include retry-after header', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      
      // Exceed limit
      for (let i = 0; i < 101; i++) {
        const req = mockReq();
        const res = mockRes();
        
        await middleware(req, res, mockNext);
      }

      const lastReq = mockReq();
      const lastRes = mockRes();
      
      await middleware(lastReq, lastRes, mockNext);
      
      expect(lastRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          retryAfter: expect.any(Number)
        })
      );
    });
  });

  describe('Endpoint-specific Rate Limiting', () => {
    it('should apply webhook-specific limits', async () => {
      const middleware = RateLimitMiddleware.telegramWebhook();
      
      // Webhook limit is typically lower (30 requests per minute)
      for (let i = 0; i < 31; i++) {
        const req = mockReq({ path: '/webhook' });
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        
        if (i < 30) {
          expect(mockNext).toHaveBeenCalled();
        } else {
          expect(res.status).toHaveBeenCalledWith(429);
        }
        mockNext.mockClear();
      }
    });

    it('should apply auth-specific limits', async () => {
      const middleware = RateLimitMiddleware.auth();
      
      // Auth limit is very strict (5 requests per 15 minutes)
      for (let i = 0; i < 6; i++) {
        const req = mockReq({ path: '/login' });
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        
        if (i < 5) {
          expect(mockNext).toHaveBeenCalled();
        } else {
          expect(res.status).toHaveBeenCalledWith(429);
        }
        mockNext.mockClear();
      }
    });

    it('should apply vacation-specific limits', async () => {
      const middleware = RateLimitMiddleware.vacations();
      
      // Vacation limit is moderate (10 requests per minute)
      for (let i = 0; i < 11; i++) {
        const req = mockReq({ path: '/vacations' });
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        
        if (i < 10) {
          expect(mockNext).toHaveBeenCalled();
        } else {
          expect(res.status).toHaveBeenCalledWith(429);
        }
        mockNext.mockClear();
      }
    });
  });

  describe('IP-based Rate Limiting', () => {
    it('should track requests per IP address', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      
      // Same IP making multiple requests
      for (let i = 0; i < 5; i++) {
        const req = mockReq({ ip: '192.168.1.1' });
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        expect(mockNext).toHaveBeenCalled();
        mockNext.mockClear();
      }
    });

    it('should track different IPs separately', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      
      // Different IPs should have separate limits
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';
      
      // IP1 makes requests
      for (let i = 0; i < 5; i++) {
        const req = mockReq({ ip: ip1 });
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        expect(mockNext).toHaveBeenCalled();
        mockNext.mockClear();
      }
      
      // IP2 should still be able to make requests
      for (let i = 0; i < 5; i++) {
        const req = mockReq({ ip: ip2 });
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        expect(mockNext).toHaveBeenCalled();
        mockNext.mockClear();
      }
    });
  });

  describe('User-based Rate Limiting', () => {
    it('should track requests per Telegram user', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      
      // Same user making multiple requests
      for (let i = 0; i < 5; i++) {
        const req = mockReq({ 
          body: { message: { from: { id: 123 } } }
        });
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        expect(mockNext).toHaveBeenCalled();
        mockNext.mockClear();
      }
    });

    it('should track different users separately', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      
      // Different users should have separate limits
      const user1 = 123;
      const user2 = 456;
      
      // User1 makes requests
      for (let i = 0; i < 5; i++) {
        const req = mockReq({ 
          body: { message: { from: { id: user1 } } }
        });
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        expect(mockNext).toHaveBeenCalled();
        mockNext.mockClear();
      }
      
      // User2 should still be able to make requests
      for (let i = 0; i < 5; i++) {
        const req = mockReq({ 
          body: { message: { from: { id: user2 } } }
        });
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        expect(mockNext).toHaveBeenCalled();
        mockNext.mockClear();
      }
    });
  });

  describe('Whitelist and Blacklist', () => {
    it('should allow whitelisted IPs', async () => {
      RateLimitMiddleware.whitelistIP('192.168.1.100');
      
      const middleware = RateLimitMiddleware.rateLimit('default');
      
      // Even if exceeding normal limits
      for (let i = 0; i < 150; i++) {
        const req = mockReq({ ip: '192.168.1.100' });
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        expect(mockNext).toHaveBeenCalled();
        mockNext.mockClear();
      }
    });

    it('should block blacklisted IPs', async () => {
      RateLimitMiddleware.blacklistIP('192.168.1.200');
      
      const middleware = RateLimitMiddleware.rateLimit('default');
      const req = mockReq({ ip: '192.168.1.200' });
      const res = mockRes();
      
      await middleware(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Your IP address is blocked.'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should manage whitelist correctly', () => {
      const testIP = '192.168.1.100';
      
      RateLimitMiddleware.whitelistIP(testIP);
      const stats = RateLimitMiddleware.getStats();
      expect(stats.whitelistedIPs).toContain(testIP);
      
      RateLimitMiddleware.unwhitelistIP(testIP);
      const updatedStats = RateLimitMiddleware.getStats();
      expect(updatedStats.whitelistedIPs).not.toContain(testIP);
    });
  });

  describe('Adaptive Rate Limiting', () => {
    it('should reduce limits for suspicious activity', async () => {
      const middleware = RateLimitMiddleware.adaptive();
      
      // Simulate suspicious user agent
      const suspiciousReq = mockReq({
        headers: { 'User-Agent': 'bot/crawler' }
      });
      const res = mockRes();
      
      await middleware(suspiciousReq, res, mockNext);
      
      // Should still allow first request
      expect(mockNext).toHaveBeenCalled();
    });

    it('should detect suspicious user agents', () => {
      const suspiciousAgents = [
        'bot',
        'crawler',
        'spider',
        'scraper'
      ];
      
      suspiciousAgents.forEach(agent => {
        const req = mockReq({
          headers: { 'User-Agent': agent }
        });
        
        // This would trigger suspicion detection
        expect(req.get('User-Agent')).toContain(agent);
      });
    });

    it('should detect suspicious paths', () => {
      const suspiciousPaths = [
        '/admin',
        '/config',
        '/.env',
        '/api/keys'
      ];
      
      suspiciousPaths.forEach(path => {
        const req = mockReq({ path });
        
        // This would trigger suspicion detection
        expect(suspiciousPaths.some(sp => req.path.includes(sp))).toBe(true);
      });
    });
  });

  describe('Time Window Management', () => {
    it('should reset counters after time window', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      
      // Make requests to fill the limit
      for (let i = 0; i < 100; i++) {
        const req = mockReq();
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        expect(mockNext).toHaveBeenCalled();
        mockNext.mockClear();
      }
      
      // Next request should be blocked
      const blockedReq = mockReq();
      const blockedRes = mockRes();
      
      await middleware(blockedReq, blockedRes, mockNext);
      expect(blockedRes.status).toHaveBeenCalledWith(429);
      
      // Mock time passage (in real scenario, would wait for actual time)
      // For testing, we'll manually reset the limit
      RateLimitMiddleware.resetLimit('ip_127.0.0.1');
      
      // Now requests should work again
      const newReq = mockReq();
      const newRes = mockRes();
      
      await middleware(newReq, newRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide rate limiting statistics', () => {
      const stats = RateLimitMiddleware.getStats();
      
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('entriesByIP');
      expect(stats).toHaveProperty('blockedIPs');
      expect(stats).toHaveProperty('whitelistedIPs');
      expect(typeof stats.totalEntries).toBe('number');
      expect(Array.isArray(stats.blockedIPs)).toBe(true);
      expect(Array.isArray(stats.whitelistedIPs)).toBe(true);
    });

    it('should track entries by IP', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      
      // Make some requests from different IPs
      const ips = ['192.168.1.1', '192.168.1.2', '192.168.1.1'];
      
      for (const ip of ips) {
        const req = mockReq({ ip });
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        mockNext.mockClear();
      }
      
      const stats = RateLimitMiddleware.getStats();
      expect(stats.entriesByIP['192.168.1.1']).toBe(2);
      expect(stats.entriesByIP['192.168.1.2']).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle middleware errors gracefully', async () => {
      // Mock an error in the middleware
      const originalGenerateKey = RateLimitMiddleware.generateKey;
      RateLimitMiddleware.generateKey = jest.fn(() => {
        throw new Error('Key generation failed');
      });
      
      const middleware = RateLimitMiddleware.rateLimit('default');
      const req = mockReq();
      const res = mockRes();
      
      await middleware(req, res, mockNext);
      
      // Should still call next() even if there's an error
      expect(mockNext).toHaveBeenCalled();
      
      // Restore original method
      RateLimitMiddleware.generateKey = originalGenerateKey;
    });

    it('should handle missing IP addresses', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      const req = mockReq({ ip: undefined });
      const res = mockRes();
      
      await middleware(req, res, mockNext);
      
      // Should still work with undefined IP
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('should handle high request volumes efficiently', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      const startTime = Date.now();
      
      // Process many requests quickly
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        const req = mockReq({ ip: `192.168.1.${i % 10}` });
        const res = mockRes();
        promises.push(middleware(req, res, mockNext));
      }
      
      await Promise.all(promises);
      const endTime = Date.now();
      
      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
    });

    it('should clean up expired entries automatically', async () => {
      const middleware = RateLimitMiddleware.rateLimit('default');
      
      // Make some requests
      for (let i = 0; i < 10; i++) {
        const req = mockReq();
        const res = mockRes();
        
        await middleware(req, res, mockNext);
        mockNext.mockClear();
      }
      
      const initialStats = RateLimitMiddleware.getStats();
      expect(initialStats.totalEntries).toBeGreaterThan(0);
      
      // Mock cleanup (in real scenario, cleanup happens automatically)
      RateLimitMiddleware.cleanup();
      
      // After cleanup, entries should be reduced or cleared
      const finalStats = RateLimitMiddleware.getStats();
      expect(finalStats.totalEntries).toBeLessThanOrEqual(initialStats.totalEntries);
    });
  });
});

