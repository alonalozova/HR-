/**
 * 🔐 AUTHENTICATION & AUTHORIZATION MIDDLEWARE
 * Система авторизації та контролю доступу для HR бота
 */

import { Request, Response, NextFunction } from 'express';
import { User, UserRole } from '../types';
import { TypeSafeHelpers } from '../utils/type-safe-helpers';

// 🎯 РОЛІ ТА ДОЗВОЛИ
export enum Role {
  EMPLOYEE = 'employee',
  TEAM_LEAD = 'team_lead', 
  HR_ADMIN = 'hr_admin',
  FOUNDER = 'founder'
}

export enum Permission {
  // Профіль
  VIEW_OWN_PROFILE = 'view_own_profile',
  EDIT_OWN_PROFILE = 'edit_own_profile',
  
  // Відпустки
  REQUEST_VACATION = 'request_vacation',
  VIEW_OWN_VACATIONS = 'view_own_vacations',
  APPROVE_VACATION = 'approve_vacation',
  REJECT_VACATION = 'reject_vacation',
  VIEW_ALL_VACATIONS = 'view_all_vacations',
  
  // Відвідуваність
  REPORT_LATE = 'report_late',
  REPORT_REMOTE = 'report_remote',
  REPORT_SICK = 'report_sick',
  VIEW_OWN_ATTENDANCE = 'view_own_attendance',
  VIEW_TEAM_ATTENDANCE = 'view_team_attendance',
  VIEW_ALL_ATTENDANCE = 'view_all_attendance',
  
  // Звіти
  VIEW_OWN_REPORTS = 'view_own_reports',
  VIEW_TEAM_REPORTS = 'view_team_reports',
  VIEW_ALL_REPORTS = 'view_all_reports',
  EXPORT_REPORTS = 'export_reports',
  
  // Пропозиції
  SUBMIT_SUGGESTION = 'submit_suggestion',
  VIEW_SUGGESTIONS = 'view_suggestions',
  MANAGE_SUGGESTIONS = 'manage_suggestions',
  
  // ASAP запити
  SUBMIT_ASAP_REQUEST = 'submit_asap_request',
  VIEW_ASAP_REQUESTS = 'view_asap_requests',
  MANAGE_ASAP_REQUESTS = 'manage_asap_requests',
  
  // Опитування
  PARTICIPATE_SURVEYS = 'participate_surveys',
  VIEW_SURVEY_RESULTS = 'view_survey_results',
  CREATE_SURVEYS = 'create_surveys',
  
  // Адміністрування
  MANAGE_USERS = 'manage_users',
  MANAGE_ROLES = 'manage_roles',
  VIEW_ANALYTICS = 'view_analytics',
  SYSTEM_ADMIN = 'system_admin'
}

// 📋 МАТРИЦЯ ДОЗВОЛІВ
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.EMPLOYEE]: [
    Permission.VIEW_OWN_PROFILE,
    Permission.EDIT_OWN_PROFILE,
    Permission.REQUEST_VACATION,
    Permission.VIEW_OWN_VACATIONS,
    Permission.REPORT_LATE,
    Permission.REPORT_REMOTE,
    Permission.REPORT_SICK,
    Permission.VIEW_OWN_ATTENDANCE,
    Permission.VIEW_OWN_REPORTS,
    Permission.SUBMIT_SUGGESTION,
    Permission.SUBMIT_ASAP_REQUEST,
    Permission.PARTICIPATE_SURVEYS
  ],
  
  [Role.TEAM_LEAD]: [
    Permission.VIEW_OWN_PROFILE,
    Permission.EDIT_OWN_PROFILE,
    Permission.REQUEST_VACATION,
    Permission.VIEW_OWN_VACATIONS,
    Permission.REPORT_LATE,
    Permission.REPORT_REMOTE,
    Permission.REPORT_SICK,
    Permission.VIEW_OWN_ATTENDANCE,
    Permission.VIEW_TEAM_ATTENDANCE,
    Permission.VIEW_OWN_REPORTS,
    Permission.VIEW_TEAM_REPORTS,
    Permission.EXPORT_REPORTS,
    Permission.SUBMIT_SUGGESTION,
    Permission.VIEW_SUGGESTIONS,
    Permission.SUBMIT_ASAP_REQUEST,
    Permission.VIEW_ASAP_REQUESTS,
    Permission.PARTICIPATE_SURVEYS,
    Permission.VIEW_SURVEY_RESULTS
  ],
  
  [Role.HR_ADMIN]: [
    Permission.VIEW_OWN_PROFILE,
    Permission.EDIT_OWN_PROFILE,
    Permission.REQUEST_VACATION,
    Permission.VIEW_OWN_VACATIONS,
    Permission.APPROVE_VACATION,
    Permission.REJECT_VACATION,
    Permission.VIEW_ALL_VACATIONS,
    Permission.REPORT_LATE,
    Permission.REPORT_REMOTE,
    Permission.REPORT_SICK,
    Permission.VIEW_OWN_ATTENDANCE,
    Permission.VIEW_ALL_ATTENDANCE,
    Permission.VIEW_ALL_REPORTS,
    Permission.EXPORT_REPORTS,
    Permission.SUBMIT_SUGGESTION,
    Permission.VIEW_SUGGESTIONS,
    Permission.MANAGE_SUGGESTIONS,
    Permission.SUBMIT_ASAP_REQUEST,
    Permission.VIEW_ASAP_REQUESTS,
    Permission.MANAGE_ASAP_REQUESTS,
    Permission.PARTICIPATE_SURVEYS,
    Permission.VIEW_SURVEY_RESULTS,
    Permission.CREATE_SURVEYS,
    Permission.MANAGE_USERS,
    Permission.VIEW_ANALYTICS
  ],
  
  [Role.FOUNDER]: [
    // Всі дозволи
    ...Object.values(Permission)
  ]
};

// 🎯 INTERFACES
interface AuthenticatedRequest extends Request {
  user?: User;
  userRole?: Role;
  permissions?: Permission[];
}

interface AuthMiddlewareOptions {
  requireAuth?: boolean;
  roles?: Role[];
  permissions?: Permission[];
  allowSelf?: boolean; // Дозволити доступ до власних даних
}

// 🔐 AUTHENTICATION MIDDLEWARE
export class AuthMiddleware {
  private static userCache = new Map<number, { user: User; role: Role; permissions: Permission[]; timestamp: number }>();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 хвилин

  /**
   * Основна функція авторизації
   */
  static authenticate(options: AuthMiddlewareOptions = {}) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const telegramId = this.extractTelegramId(req);
        
        if (!telegramId) {
          if (options.requireAuth !== false) {
            return res.status(401).json({ 
              error: 'Unauthorized',
              message: 'Telegram ID not found in request'
            });
          }
          return next();
        }

        // Отримуємо користувача та його роль
        const authData = await this.getUserAuthData(telegramId);
        if (!authData) {
          return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'User not found or not registered'
          });
        }

        // Додаємо дані користувача до запиту
        req.user = authData.user;
        req.userRole = authData.role;
        req.permissions = authData.permissions;

        // Перевіряємо роль
        if (options.roles && !options.roles.includes(authData.role)) {
          return res.status(403).json({ 
            error: 'Forbidden',
            message: `Access denied. Required roles: ${options.roles.join(', ')}`,
            userRole: authData.role
          });
        }

        // Перевіряємо дозволи
        if (options.permissions) {
          const hasPermission = options.permissions.some(permission => 
            authData.permissions.includes(permission)
          );
          
          if (!hasPermission) {
            return res.status(403).json({ 
              error: 'Forbidden',
              message: `Access denied. Required permissions: ${options.permissions.join(', ')}`,
              userPermissions: authData.permissions
            });
          }
        }

        next();
      } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ 
          error: 'Internal Server Error',
          message: 'Authentication failed'
        });
      }
    };
  }

  /**
   * Middleware для перевірки ролей
   */
  static requireRole(...roles: Role[]) {
    return this.authenticate({ roles, requireAuth: true });
  }

  /**
   * Middleware для перевірки дозволів
   */
  static requirePermission(...permissions: Permission[]) {
    return this.authenticate({ permissions, requireAuth: true });
  }

  /**
   * Middleware для HR адміністраторів
   */
  static requireHR() {
    return this.authenticate({ 
      roles: [Role.HR_ADMIN, Role.FOUNDER],
      requireAuth: true 
    });
  }

  /**
   * Middleware для керівництва
   */
  static requireManagement() {
    return this.authenticate({ 
      roles: [Role.TEAM_LEAD, Role.HR_ADMIN, Role.FOUNDER],
      requireAuth: true 
    });
  }

  /**
   * Middleware для засновників
   */
  static requireFounder() {
    return this.authenticate({ 
      roles: [Role.FOUNDER],
      requireAuth: true 
    });
  }

  /**
   * Middleware для доступу до власних даних
   */
  static allowSelfOrRole(...roles: Role[]) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const telegramId = this.extractTelegramId(req);
      const targetUserId = TypeSafeHelpers.Number.safeParseInt(req.params.userId || req.body.userId);
      
      // Дозволити доступ до власних даних
      if (telegramId === targetUserId) {
        return next();
      }
      
      // Перевірити роль
      return this.authenticate({ roles, requireAuth: true })(req, res, next);
    };
  }

  /**
   * Middleware для командного доступу
   */
  static requireTeamAccess() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const telegramId = this.extractTelegramId(req);
      const targetUserId = TypeSafeHelpers.Number.safeParseInt(req.params.userId || req.body.userId);
      
      // Дозволити доступ до власних даних
      if (telegramId === targetUserId) {
        return next();
      }
      
      const user = req.user;
      const targetUser = await this.getUser(targetUserId);
      
      if (!user || !targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Перевірити чи користувачі в одній команді
      if (user.team === targetUser.team && user.department === targetUser.department) {
        // Дозволити якщо поточний користувач - Team Lead
        if (req.userRole === Role.TEAM_LEAD || req.userRole === Role.HR_ADMIN || req.userRole === Role.FOUNDER) {
          return next();
        }
      }
      
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Access denied. Team members only.'
      });
    };
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
    
    // Query parameter
    if (req.query.telegramId) {
      return TypeSafeHelpers.Number.safeParseInt(req.query.telegramId as string);
    }
    
    // Body parameter
    if (req.body?.telegramId) {
      return TypeSafeHelpers.Number.safeParseInt(req.body.telegramId);
    }
    
    return null;
  }

  /**
   * Отримує дані авторизації користувача
   */
  private static async getUserAuthData(telegramId: number): Promise<{ user: User; role: Role; permissions: Permission[] } | null> {
    // Перевіряємо кеш
    const cached = this.userCache.get(telegramId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return {
        user: cached.user,
        role: cached.role,
        permissions: cached.permissions
      };
    }

    // Отримуємо користувача з бази даних
    const user = await this.getUser(telegramId);
    if (!user || !user.isRegistered) {
      return null;
    }

    // Визначаємо роль
    const role = this.determineRole(user);
    const permissions = ROLE_PERMISSIONS[role] || [];

    // Кешуємо результат
    this.userCache.set(telegramId, {
      user,
      role,
      permissions,
      timestamp: Date.now()
    });

    return { user, role, permissions };
  }

  /**
   * Визначає роль користувача
   */
  private static determineRole(user: User): Role {
    if (user.role?.level) {
      switch (user.role.level) {
        case 'founder': return Role.FOUNDER;
        case 'hr_admin': return Role.HR_ADMIN;
        case 'team_lead': return Role.TEAM_LEAD;
        case 'employee': return Role.EMPLOYEE;
        default: return Role.EMPLOYEE;
      }
    }

    // Fallback: визначаємо роль за посадою
    const position = user.position.toLowerCase();
    
    if (position.includes('ceo') || position.includes('founder')) {
      return Role.FOUNDER;
    }
    
    if (position.includes('hr') || position.includes('manager')) {
      return Role.HR_ADMIN;
    }
    
    if (position.includes('lead') || position.includes('head')) {
      return Role.TEAM_LEAD;
    }
    
    return Role.EMPLOYEE;
  }

  /**
   * Отримує користувача з бази даних (заглушка)
   */
  private static async getUser(telegramId: number): Promise<User | null> {
    // TODO: Реалізувати отримання користувача з Google Sheets
    // Поки що повертаємо заглушку
    return {
      telegramId,
      fullName: 'Test User',
      department: 'Test Department',
      team: 'Test Team',
      position: 'Test Position',
      birthDate: new Date(),
      firstWorkDay: new Date(),
      workMode: 'Office',
      isRegistered: true,
      role: {
        level: 'employee',
        permissions: []
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Очищує кеш користувача
   */
  static clearUserCache(telegramId?: number): void {
    if (telegramId) {
      this.userCache.delete(telegramId);
    } else {
      this.userCache.clear();
    }
  }

  /**
   * Отримує статистику кешу
   */
  static getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.userCache.size,
      entries: Array.from(this.userCache.keys()).map(String)
    };
  }
}

// 🎯 ЗРУЧНІ ФУНКЦІЇ
export const requireRole = (...roles: Role[]) => AuthMiddleware.requireRole(...roles);
export const requirePermission = (...permissions: Permission[]) => AuthMiddleware.requirePermission(...permissions);
export const requireHR = () => AuthMiddleware.requireHR();
export const requireManagement = () => AuthMiddleware.requireManagement();
export const requireFounder = () => AuthMiddleware.requireFounder();
export const allowSelfOrRole = (...roles: Role[]) => AuthMiddleware.allowSelfOrRole(...roles);
export const requireTeamAccess = () => AuthMiddleware.requireTeamAccess();
export const authenticate = (options?: AuthMiddlewareOptions) => AuthMiddleware.authenticate(options);

// 🎯 DECORATOR ФУНКЦІЇ
export function RequireRole(...roles: Role[]) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      // TODO: Реалізувати decorator логіку
      return method.apply(this, args);
    };
  };
}

export function RequirePermission(...permissions: Permission[]) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      // TODO: Реалізувати decorator логіку
      return method.apply(this, args);
    };
  };
}

export default AuthMiddleware;

