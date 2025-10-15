/**
 * 📝 LOGGING & AUDIT MIDDLEWARE
 * Система логування та аудиту для HR бота
 */

import { Request, Response, NextFunction } from 'express';
import { User, LogEntry, SecurityEvent } from '../types';
import { TypeSafeHelpers } from '../utils/type-safe-helpers';

// 🎯 LOG LEVELS
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SECURITY = 'security'
}

// 🎯 AUDIT ACTIONS
export enum AuditAction {
  // Аутентифікація
  LOGIN = 'login',
  LOGOUT = 'logout',
  AUTH_FAILED = 'auth_failed',
  
  // Профіль
  VIEW_PROFILE = 'view_profile',
  EDIT_PROFILE = 'edit_profile',
  
  // Відпустки
  REQUEST_VACATION = 'request_vacation',
  APPROVE_VACATION = 'approve_vacation',
  REJECT_VACATION = 'reject_vacation',
  CANCEL_VACATION = 'cancel_vacation',
  
  // Відвідуваність
  REPORT_LATE = 'report_late',
  REPORT_REMOTE = 'report_remote',
  REPORT_SICK = 'report_sick',
  
  // Звіти
  VIEW_REPORTS = 'view_reports',
  EXPORT_REPORTS = 'export_reports',
  
  // Пропозиції
  SUBMIT_SUGGESTION = 'submit_suggestion',
  VIEW_SUGGESTIONS = 'view_suggestions',
  MANAGE_SUGGESTIONS = 'manage_suggestions',
  
  // ASAP запити
  SUBMIT_ASAP = 'submit_asap',
  VIEW_ASAP = 'view_asap',
  MANAGE_ASAP = 'manage_asap',
  
  // Опитування
  PARTICIPATE_SURVEY = 'participate_survey',
  CREATE_SURVEY = 'create_survey',
  VIEW_SURVEY_RESULTS = 'view_survey_results',
  
  // Адміністрування
  MANAGE_USERS = 'manage_users',
  MANAGE_ROLES = 'manage_roles',
  VIEW_ANALYTICS = 'view_analytics',
  
  // Системні
  SYSTEM_ERROR = 'system_error',
  SECURITY_VIOLATION = 'security_violation'
}

// 🎯 INTERFACES
interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId?: number;
  userRole?: string;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

interface SecurityLogEntry extends SecurityEvent {
  id: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  resolvedAt?: Date;
}

interface LoggingRequest extends Request {
  auditLog?: AuditLogEntry;
  startTime?: number;
  user?: User;
}

// 📝 LOGGING MIDDLEWARE
export class LoggingMiddleware {
  private static logs: LogEntry[] = [];
  private static auditLogs: AuditLogEntry[] = [];
  private static securityLogs: SecurityLogEntry[] = [];
  private static readonly MAX_LOGS = 10000;

  /**
   * Основне middleware для логування
   */
  static logging() {
    return (req: LoggingRequest, res: Response, next: NextFunction) => {
      req.startTime = Date.now();
      
      // Логуємо початок запиту
      this.log(LogLevel.INFO, `Request started: ${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      // Перехоплюємо відповідь
      const originalSend = res.send;
      res.send = function(data) {
        const duration = req.startTime ? Date.now() - req.startTime : 0;
        
        // Логуємо завершення запиту
        LoggingMiddleware.log(LogLevel.INFO, `Request completed: ${req.method} ${req.path}`, {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip,
          userId: req.user?.telegramId
        });

        return originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Middleware для аудиту дій
   */
  static audit(action: AuditAction, resource?: string) {
    return (req: LoggingRequest, res: Response, next: NextFunction) => {
      const auditEntry: AuditLogEntry = {
        id: this.generateId(),
        timestamp: new Date(),
        userId: req.user?.telegramId,
        userRole: req.user?.role?.level,
        action,
        resource,
        resourceId: req.params.id || req.body.id,
        details: this.extractRequestDetails(req),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: true
      };

      req.auditLog = auditEntry;

      // Перехоплюємо відповідь для логування результату
      const originalSend = res.send;
      res.send = function(data) {
        auditEntry.success = res.statusCode < 400;
        if (!auditEntry.success) {
          auditEntry.errorMessage = data.toString();
        }

        LoggingMiddleware.addAuditLog(auditEntry);
        return originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Middleware для безпеки
   */
  static security() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Перевіряємо підозрілу активність
      const suspiciousActivity = this.detectSuspiciousActivity(req);
      
      if (suspiciousActivity) {
        this.logSecurityEvent(suspiciousActivity, req);
        
        if (suspiciousActivity.severity === 'critical') {
          return res.status(403).json({ 
            error: 'Access denied',
            message: 'Suspicious activity detected'
          });
        }
      }

      next();
    };
  }

  /**
   * Middleware для помилок
   */
  static errorHandler() {
    return (error: Error, req: Request, res: Response, next: NextFunction) => {
      const errorLog: AuditLogEntry = {
        id: this.generateId(),
        timestamp: new Date(),
        userId: (req as any).user?.telegramId,
        action: AuditAction.SYSTEM_ERROR,
        details: {
          error: error.message,
          stack: error.stack,
          path: req.path,
          method: req.method
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        errorMessage: error.message
      };

      this.addAuditLog(errorLog);
      this.log(LogLevel.ERROR, `System error: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });

      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    };
  }

  /**
   * Логування повідомлення
   */
  static log(level: LogLevel, message: string, context?: any): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context
    };

    this.logs.push(logEntry);
    
    // Обмежуємо кількість логів
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS);
    }

    // Виводимо в консоль
    const timestamp = logEntry.timestamp.toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`);
  }

  /**
   * Додає запис аудиту
   */
  static addAuditLog(entry: AuditLogEntry): void {
    this.auditLogs.push(entry);
    
    // Обмежуємо кількість записів
    if (this.auditLogs.length > this.MAX_LOGS) {
      this.auditLogs = this.auditLogs.slice(-this.MAX_LOGS);
    }
  }

  /**
   * Логує подію безпеки
   */
  static logSecurityEvent(event: Partial<SecurityLogEntry>, req: Request): void {
    const securityEntry: SecurityLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      type: event.type || 'suspicious_activity',
      severity: event.severity || 'medium',
      description: event.description || 'Suspicious activity detected',
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      userId: (req as any).user?.telegramId,
      resolved: false,
      ...event
    };

    this.securityLogs.push(securityEntry);
    
    // Обмежуємо кількість записів
    if (this.securityLogs.length > this.MAX_LOGS) {
      this.securityLogs = this.securityLogs.slice(-this.MAX_LOGS);
    }

    this.log(LogLevel.SECURITY, `Security event: ${securityEntry.description}`, {
      type: securityEntry.type,
      severity: securityEntry.severity,
      ip: securityEntry.ipAddress,
      userId: securityEntry.userId
    });
  }

  /**
   * Виявляє підозрілу активність
   */
  private static detectSuspiciousActivity(req: Request): Partial<SecurityLogEntry> | null {
    const ip = req.ip;
    const userAgent = req.get('User-Agent') || '';
    const path = req.path;
    const method = req.method;

    // Підозрілі User-Agent
    if (userAgent.includes('bot') || userAgent.includes('crawler') || userAgent.includes('spider')) {
      return {
        type: 'suspicious_activity',
        severity: 'medium',
        description: 'Bot-like user agent detected'
      };
    }

    // Підозрілі шляхи
    const suspiciousPaths = ['/admin', '/config', '/.env', '/api/keys'];
    if (suspiciousPaths.some(path => req.path.includes(path))) {
      return {
        type: 'unauthorized_access',
        severity: 'high',
        description: 'Attempted access to sensitive path'
      };
    }

    // Часті запити (rate limiting)
    // TODO: Реалізувати rate limiting логіку

    return null;
  }

  /**
   * Витягує деталі запиту
   */
  private static extractRequestDetails(req: Request): any {
    return {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body ? Object.keys(req.body) : undefined, // Не логуємо чутливі дані
      headers: {
        'content-type': req.get('Content-Type'),
        'user-agent': req.get('User-Agent')
      }
    };
  }

  /**
   * Генерує унікальний ID
   */
  private static generateId(): string {
    return `LOG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Отримує логи за рівнем
   */
  static getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }

  /**
   * Отримує логи аудиту
   */
  static getAuditLogs(userId?: number, action?: AuditAction): AuditLogEntry[] {
    let logs = [...this.auditLogs];

    if (userId) {
      logs = logs.filter(log => log.userId === userId);
    }

    if (action) {
      logs = logs.filter(log => log.action === action);
    }

    return logs;
  }

  /**
   * Отримує логи безпеки
   */
  static getSecurityLogs(severity?: string, resolved?: boolean): SecurityLogEntry[] {
    let logs = [...this.securityLogs];

    if (severity) {
      logs = logs.filter(log => log.severity === severity);
    }

    if (resolved !== undefined) {
      logs = logs.filter(log => log.resolved === resolved);
    }

    return logs;
  }

  /**
   * Очищає логи
   */
  static clearLogs(): void {
    this.logs = [];
    this.auditLogs = [];
    this.securityLogs = [];
  }

  /**
   * Отримує статистику логів
   */
  static getLogStats(): {
    totalLogs: number;
    totalAuditLogs: number;
    totalSecurityLogs: number;
    logsByLevel: Record<string, number>;
    auditLogsByAction: Record<string, number>;
    securityLogsBySeverity: Record<string, number>;
  } {
    const logsByLevel = this.logs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const auditLogsByAction = this.auditLogs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const securityLogsBySeverity = this.securityLogs.reduce((acc, log) => {
      acc[log.severity] = (acc[log.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalLogs: this.logs.length,
      totalAuditLogs: this.auditLogs.length,
      totalSecurityLogs: this.securityLogs.length,
      logsByLevel,
      auditLogsByAction,
      securityLogsBySeverity
    };
  }
}

// 🎯 ЗРУЧНІ ФУНКЦІЇ
export const logging = () => LoggingMiddleware.logging();
export const audit = (action: AuditAction, resource?: string) => LoggingMiddleware.audit(action, resource);
export const security = () => LoggingMiddleware.security();
export const errorHandler = () => LoggingMiddleware.errorHandler();

export default LoggingMiddleware;
