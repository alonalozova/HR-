/**
 * 🔐 AUTHENTICATION TESTS
 * Тести для системи авторизації та контролю доступу
 */

const { AuthMiddleware, Role, Permission } = require('../middleware/auth');
const { TypeSafeHelpers } = require('../utils/type-safe-helpers');

// Mock Express
const mockReq = (overrides = {}) => ({
  body: { message: { from: { id: 123 } } },
  headers: {},
  ip: '127.0.0.1',
  ...overrides
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

// Mock user service
jest.mock('../services/user.service', () => ({
  getUser: jest.fn()
}));

describe('Authentication Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Role-based Access Control', () => {
    it('should allow access for required role', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'hr_admin' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.requireRole(Role.HR_ADMIN);
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.userRole).toBe(Role.HR_ADMIN);
    });

    it('should deny access for insufficient role', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'employee' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.requireRole(Role.HR_ADMIN);
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: expect.stringContaining('Access denied'),
        userRole: Role.EMPLOYEE
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow access for multiple roles', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'team_lead' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.requireRole(Role.TEAM_LEAD, Role.HR_ADMIN);
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.userRole).toBe(Role.TEAM_LEAD);
    });

    it('should handle user not found', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue(null);

      const middleware = AuthMiddleware.requireRole(Role.HR_ADMIN);
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User not found or not registered'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Permission-based Access Control', () => {
    it('should allow access for required permission', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'hr_admin' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.requirePermission(Permission.APPROVE_VACATION);
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.permissions).toContain(Permission.APPROVE_VACATION);
    });

    it('should deny access for missing permission', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'employee' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.requirePermission(Permission.APPROVE_VACATION);
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: expect.stringContaining('Required permissions'),
        userPermissions: expect.any(Array)
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow access for multiple permissions', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'hr_admin' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.requirePermission(
        Permission.APPROVE_VACATION, 
        Permission.VIEW_ALL_VACATIONS
      );
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Specialized Middleware', () => {
    it('should allow HR access', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'hr_admin' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.requireHR();
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow management access', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'team_lead' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.requireManagement();
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow founder access', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'founder' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.requireFounder();
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Self Access Control', () => {
    it('should allow self access', async () => {
      const middleware = AuthMiddleware.allowSelfOrRole(Role.HR_ADMIN);
      const req = mockReq();
      req.params = { userId: '123' };
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow role access for others', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 456,
        role: { level: 'hr_admin' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.allowSelfOrRole(Role.HR_ADMIN);
      const req = mockReq();
      req.params = { userId: '456' };
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access without role for others', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 456,
        role: { level: 'employee' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.allowSelfOrRole(Role.HR_ADMIN);
      const req = mockReq();
      req.params = { userId: '456' };
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Team Access Control', () => {
    it('should allow team member access', async () => {
      const { getUser } = require('../services/user.service');
      getUser
        .mockResolvedValueOnce({
          telegramId: 123,
          team: 'PPC Team',
          department: 'Marketing',
          role: { level: 'team_lead' },
          isRegistered: true
        })
        .mockResolvedValueOnce({
          telegramId: 456,
          team: 'PPC Team',
          department: 'Marketing',
          isRegistered: true
        });

      const middleware = AuthMiddleware.requireTeamAccess();
      const req = mockReq();
      req.params = { userId: '456' };
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny cross-team access', async () => {
      const { getUser } = require('../services/user.service');
      getUser
        .mockResolvedValueOnce({
          telegramId: 123,
          team: 'PPC Team',
          department: 'Marketing',
          role: { level: 'employee' },
          isRegistered: true
        })
        .mockResolvedValueOnce({
          telegramId: 456,
          team: 'Design Team',
          department: 'Marketing',
          isRegistered: true
        });

      const middleware = AuthMiddleware.requireTeamAccess();
      const req = mockReq();
      req.params = { userId: '456' };
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Access denied. Team members only.'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing telegram ID', async () => {
      const middleware = AuthMiddleware.requireRole(Role.HR_ADMIN);
      const req = mockReq({ body: {} }); // No telegram ID
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Telegram ID not found in request'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle unregistered user', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        isRegistered: false
      });

      const middleware = AuthMiddleware.requireRole(Role.HR_ADMIN);
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User not found or not registered'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockRejectedValue(new Error('Database connection failed'));

      const middleware = AuthMiddleware.requireRole(Role.HR_ADMIN);
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Authentication failed'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle invalid role determination', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'invalid_role' },
        position: 'Unknown Position',
        isRegistered: true
      });

      const middleware = AuthMiddleware.requireRole(Role.HR_ADMIN);
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Caching and Performance', () => {
    it('should cache user authentication data', async () => {
      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'hr_admin' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.requireRole(Role.HR_ADMIN);
      const req1 = mockReq();
      const req2 = mockReq();
      const res = mockRes();

      // First request
      await middleware(req1, res, mockNext);
      expect(getUser).toHaveBeenCalledTimes(1);

      // Second request should use cache
      await middleware(req2, res, mockNext);
      expect(getUser).toHaveBeenCalledTimes(1); // Still 1, used cache
    });

    it('should clear cache when requested', () => {
      AuthMiddleware.clearUserCache(123);
      const stats = AuthMiddleware.getCacheStats();
      expect(stats.entries).not.toContain('123');
    });

    it('should handle cache expiration', async () => {
      // Mock expired cache
      const expiredTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      AuthMiddleware.userCache.set('123', {
        user: { telegramId: 123, role: { level: 'hr_admin' } },
        role: Role.HR_ADMIN,
        permissions: [Permission.APPROVE_VACATION],
        timestamp: expiredTime
      });

      const { getUser } = require('../services/user.service');
      getUser.mockResolvedValue({
        telegramId: 123,
        role: { level: 'hr_admin' },
        isRegistered: true
      });

      const middleware = AuthMiddleware.requireRole(Role.HR_ADMIN);
      const req = mockReq();
      const res = mockRes();

      await middleware(req, res, mockNext);

      // Should fetch fresh data due to cache expiration
      expect(getUser).toHaveBeenCalled();
    });
  });

  describe('Role and Permission Mapping', () => {
    it('should correctly map employee permissions', () => {
      const user = {
        role: { level: 'employee' }
      };
      const role = AuthMiddleware.determineRole(user);
      const permissions = ROLE_PERMISSIONS[role];

      expect(permissions).toContain(Permission.REQUEST_VACATION);
      expect(permissions).toContain(Permission.VIEW_OWN_VACATIONS);
      expect(permissions).not.toContain(Permission.APPROVE_VACATION);
      expect(permissions).not.toContain(Permission.MANAGE_USERS);
    });

    it('should correctly map team lead permissions', () => {
      const user = {
        role: { level: 'team_lead' }
      };
      const role = AuthMiddleware.determineRole(user);
      const permissions = ROLE_PERMISSIONS[role];

      expect(permissions).toContain(Permission.VIEW_TEAM_ATTENDANCE);
      expect(permissions).toContain(Permission.VIEW_TEAM_REPORTS);
      expect(permissions).not.toContain(Permission.APPROVE_VACATION);
      expect(permissions).not.toContain(Permission.MANAGE_USERS);
    });

    it('should correctly map HR admin permissions', () => {
      const user = {
        role: { level: 'hr_admin' }
      };
      const role = AuthMiddleware.determineRole(user);
      const permissions = ROLE_PERMISSIONS[role];

      expect(permissions).toContain(Permission.APPROVE_VACATION);
      expect(permissions).toContain(Permission.VIEW_ALL_VACATIONS);
      expect(permissions).toContain(Permission.MANAGE_USERS);
      expect(permissions).toContain(Permission.VIEW_ANALYTICS);
    });

    it('should correctly map founder permissions', () => {
      const user = {
        role: { level: 'founder' }
      };
      const role = AuthMiddleware.determineRole(user);
      const permissions = ROLE_PERMISSIONS[role];

      // Founder should have all permissions
      expect(permissions).toContain(Permission.APPROVE_VACATION);
      expect(permissions).toContain(Permission.MANAGE_USERS);
      expect(permissions).toContain(Permission.SYSTEM_ADMIN);
      expect(permissions.length).toBeGreaterThan(20); // Many permissions
    });
  });
});

