/**
 * 📋 MIDDLEWARE USAGE EXAMPLES
 * Приклади використання middleware в Express додатку
 */

import express from 'express';
import { AuthMiddleware, requireRole, requirePermission, requireHR, requireManagement } from './auth';
import { LoggingMiddleware, audit, logging, security } from './logging';
import { RateLimitMiddleware, telegramWebhook, rateLimit } from './rate-limit';
import { Role, Permission, AuditAction } from './auth';

const app = express();

// 🔧 ІНІЦІАЛІЗАЦІЯ MIDDLEWARE
RateLimitMiddleware.initialize();

// 📝 GLOBAL MIDDLEWARE
app.use(express.json());
app.use(logging()); // Логування всіх запитів
app.use(security()); // Перевірка безпеки

// 🚦 GLOBAL RATE LIMITING
app.use(rateLimit('default'));

// 🏥 HEALTH CHECK (без rate limiting)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// 🔐 TELEGRAM WEBHOOK
app.post('/webhook', 
  telegramWebhook(), // Rate limiting для webhook
  audit(AuditAction.LOGIN), // Аудит входу
  AuthMiddleware.authenticate(), // Авторизація
  async (req, res) => {
    // Обробка Telegram webhook
    res.status(200).json({ status: 'ok' });
  }
);

// 👤 USER ENDPOINTS
app.get('/profile',
  AuthMiddleware.authenticate(), // Авторизація
  audit(AuditAction.VIEW_PROFILE), // Аудит
  (req, res) => {
    // Показати профіль користувача
    res.json({ user: (req as any).user });
  }
);

app.put('/profile',
  AuthMiddleware.authenticate(),
  audit(AuditAction.EDIT_PROFILE),
  (req, res) => {
    // Редагування профілю
    res.json({ message: 'Profile updated' });
  }
);

// 🏖️ VACATION ENDPOINTS
app.post('/vacations',
  rateLimit('vacations'), // Спеціальний rate limiting
  AuthMiddleware.authenticate(),
  requirePermission(Permission.REQUEST_VACATION), // Перевірка дозволу
  audit(AuditAction.REQUEST_VACATION),
  (req, res) => {
    // Створення заявки на відпустку
    res.json({ message: 'Vacation request created' });
  }
);

app.get('/vacations',
  AuthMiddleware.authenticate(),
  requirePermission(Permission.VIEW_OWN_VACATIONS),
  audit(AuditAction.VIEW_REPORTS),
  (req, res) => {
    // Перегляд відпусток користувача
    res.json({ vacations: [] });
  }
);

app.put('/vacations/:id/approve',
  AuthMiddleware.authenticate(),
  requireHR(), // Тільки HR може затверджувати
  requirePermission(Permission.APPROVE_VACATION),
  audit(AuditAction.APPROVE_VACATION),
  (req, res) => {
    // Затвердження відпустки
    res.json({ message: 'Vacation approved' });
  }
);

app.put('/vacations/:id/reject',
  AuthMiddleware.authenticate(),
  requireHR(),
  requirePermission(Permission.REJECT_VACATION),
  audit(AuditAction.REJECT_VACATION),
  (req, res) => {
    // Відхилення відпустки
    res.json({ message: 'Vacation rejected' });
  }
);

// 📊 REPORTS ENDPOINTS
app.get('/reports',
  rateLimit('reports'),
  AuthMiddleware.authenticate(),
  requirePermission(Permission.VIEW_OWN_REPORTS),
  audit(AuditAction.VIEW_REPORTS),
  (req, res) => {
    // Перегляд звітів
    res.json({ reports: [] });
  }
);

app.get('/reports/team',
  AuthMiddleware.authenticate(),
  requireManagement(), // Team Lead або HR
  requirePermission(Permission.VIEW_TEAM_REPORTS),
  audit(AuditAction.VIEW_REPORTS),
  (req, res) => {
    // Перегляд командних звітів
    res.json({ teamReports: [] });
  }
);

app.get('/reports/all',
  AuthMiddleware.authenticate(),
  requireHR(), // Тільки HR
  requirePermission(Permission.VIEW_ALL_REPORTS),
  audit(AuditAction.VIEW_REPORTS),
  (req, res) => {
    // Перегляд всіх звітів
    res.json({ allReports: [] });
  }
);

app.post('/reports/export',
  rateLimit('reports'),
  AuthMiddleware.authenticate(),
  requirePermission(Permission.EXPORT_REPORTS),
  audit(AuditAction.EXPORT_REPORTS),
  (req, res) => {
    // Експорт звітів
    res.json({ message: 'Reports exported' });
  }
);

// 💡 SUGGESTIONS ENDPOINTS
app.post('/suggestions',
  AuthMiddleware.authenticate(),
  requirePermission(Permission.SUBMIT_SUGGESTION),
  audit(AuditAction.SUBMIT_SUGGESTION),
  (req, res) => {
    // Подача пропозиції
    res.json({ message: 'Suggestion submitted' });
  }
);

app.get('/suggestions',
  AuthMiddleware.authenticate(),
  requireManagement(),
  requirePermission(Permission.VIEW_SUGGESTIONS),
  audit(AuditAction.VIEW_SUGGESTIONS),
  (req, res) => {
    // Перегляд пропозицій
    res.json({ suggestions: [] });
  }
);

// 🚨 ASAP ENDPOINTS
app.post('/asap',
  AuthMiddleware.authenticate(),
  requirePermission(Permission.SUBMIT_ASAP_REQUEST),
  audit(AuditAction.SUBMIT_ASAP),
  (req, res) => {
    // Терміновий запит
    res.json({ message: 'ASAP request submitted' });
  }
);

app.get('/asap',
  AuthMiddleware.authenticate(),
  requireHR(),
  requirePermission(Permission.VIEW_ASAP_REQUESTS),
  audit(AuditAction.VIEW_ASAP),
  (req, res) => {
    // Перегляд ASAP запитів
    res.json({ asapRequests: [] });
  }
);

// 👥 ADMIN ENDPOINTS
app.get('/admin/users',
  AuthMiddleware.authenticate(),
  requireHR(),
  requirePermission(Permission.MANAGE_USERS),
  audit(AuditAction.MANAGE_USERS),
  (req, res) => {
    // Управління користувачами
    res.json({ users: [] });
  }
);

app.put('/admin/users/:id/role',
  AuthMiddleware.authenticate(),
  requireHR(),
  requirePermission(Permission.MANAGE_ROLES),
  audit(AuditAction.MANAGE_ROLES),
  (req, res) => {
    // Зміна ролі користувача
    res.json({ message: 'User role updated' });
  }
);

app.get('/admin/analytics',
  AuthMiddleware.authenticate(),
  requireHR(),
  requirePermission(Permission.VIEW_ANALYTICS),
  audit(AuditAction.VIEW_ANALYTICS),
  (req, res) => {
    // Аналітика
    res.json({ analytics: {} });
  }
);

// 📋 SURVEY ENDPOINTS
app.post('/surveys/:id/participate',
  AuthMiddleware.authenticate(),
  requirePermission(Permission.PARTICIPATE_SURVEYS),
  audit(AuditAction.PARTICIPATE_SURVEY),
  (req, res) => {
    // Участь в опитуванні
    res.json({ message: 'Survey participation recorded' });
  }
);

app.post('/surveys',
  AuthMiddleware.authenticate(),
  requireHR(),
  requirePermission(Permission.CREATE_SURVEYS),
  audit(AuditAction.CREATE_SURVEY),
  (req, res) => {
    // Створення опитування
    res.json({ message: 'Survey created' });
  }
);

app.get('/surveys/:id/results',
  AuthMiddleware.authenticate(),
  requireHR(),
  requirePermission(Permission.VIEW_SURVEY_RESULTS),
  audit(AuditAction.VIEW_SURVEY_RESULTS),
  (req, res) => {
    // Результати опитування
    res.json({ results: {} });
  }
);

// 🔍 API ENDPOINTS
app.get('/api/users/:id',
  rateLimit('api'),
  AuthMiddleware.authenticate(),
  AuthMiddleware.allowSelfOrRole(Role.HR_ADMIN, Role.FOUNDER),
  (req, res) => {
    // API для отримання користувача
    res.json({ user: {} });
  }
);

app.get('/api/team/:teamId/users',
  rateLimit('api'),
  AuthMiddleware.authenticate(),
  AuthMiddleware.requireTeamAccess(),
  (req, res) => {
    // API для отримання користувачів команди
    res.json({ users: [] });
  }
);

// 🚨 ERROR HANDLING
app.use(LoggingMiddleware.errorHandler());

// 📊 STATS ENDPOINTS (тільки для HR)
app.get('/admin/stats',
  AuthMiddleware.authenticate(),
  requireHR(),
  (req, res) => {
    const stats = {
      logs: LoggingMiddleware.getLogStats(),
      rateLimit: RateLimitMiddleware.getStats(),
      auth: AuthMiddleware.getCacheStats()
    };
    res.json(stats);
  }
);

// 🧹 CLEANUP ENDPOINTS
app.post('/admin/cleanup/logs',
  AuthMiddleware.authenticate(),
  requireHR(),
  (req, res) => {
    LoggingMiddleware.clearLogs();
    res.json({ message: 'Logs cleared' });
  }
);

app.post('/admin/cleanup/rate-limit',
  AuthMiddleware.authenticate(),
  requireHR(),
  (req, res) => {
    const { identifier } = req.body;
    RateLimitMiddleware.resetLimit(identifier);
    res.json({ message: `Rate limit reset for ${identifier}` });
  }
);

app.post('/admin/cleanup/auth-cache',
  AuthMiddleware.authenticate(),
  requireHR(),
  (req, res) => {
    const { userId } = req.body;
    AuthMiddleware.clearUserCache(userId);
    res.json({ message: 'Auth cache cleared' });
  }
);

// 🚀 START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 HR Bot API server running on port ${PORT}`);
  console.log(`📝 Logging enabled`);
  console.log(`🔐 Authentication enabled`);
  console.log(`🚦 Rate limiting enabled`);
});

export default app;

