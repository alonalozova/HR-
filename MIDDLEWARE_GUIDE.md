# 🔐 MIDDLEWARE GUIDE - Посібник по middleware системі

## ✅ **КОМПЛЕКСНА СИСТЕМА БЕЗПЕКИ!**

### **🎯 СТВОРЕНА СИСТЕМА MIDDLEWARE:**
- ✅ **Authentication & Authorization** - авторизація та контроль доступу
- ✅ **Logging & Audit** - логування та аудит дій
- ✅ **Rate Limiting** - обмеження швидкості запитів
- ✅ **Security** - перевірка безпеки та виявлення загроз

---

## **🔐 AUTHENTICATION & AUTHORIZATION**

### **🎯 Ролі та дозволи:**
```typescript
enum Role {
  EMPLOYEE = 'employee',      // Звичайний працівник
  TEAM_LEAD = 'team_lead',    // Керівник команди
  HR_ADMIN = 'hr_admin',      // HR адміністратор
  FOUNDER = 'founder'         // Засновник/CEO
}

enum Permission {
  // Відпустки
  REQUEST_VACATION = 'request_vacation',
  APPROVE_VACATION = 'approve_vacation',
  VIEW_ALL_VACATIONS = 'view_all_vacations',
  
  // Звіти
  VIEW_OWN_REPORTS = 'view_own_reports',
  VIEW_TEAM_REPORTS = 'view_team_reports',
  EXPORT_REPORTS = 'export_reports',
  
  // Адміністрування
  MANAGE_USERS = 'manage_users',
  VIEW_ANALYTICS = 'view_analytics'
}
```

### **🔧 Використання middleware:**
```typescript
// Перевірка ролі
app.post('/webhook', requireRole('HR', 'CEO'), handler);

// Перевірка дозволу
app.get('/reports', requirePermission(Permission.VIEW_ALL_REPORTS), handler);

// HR тільки
app.put('/vacations/:id/approve', requireHR(), handler);

// Керівництво
app.get('/team/reports', requireManagement(), handler);

// Засновники
app.get('/admin/system', requireFounder(), handler);

// Доступ до власних даних або ролі
app.get('/users/:id', allowSelfOrRole(Role.HR_ADMIN), handler);

// Командний доступ
app.get('/team/users', requireTeamAccess(), handler);
```

---

## **📝 LOGGING & AUDIT**

### **🎯 Рівні логування:**
```typescript
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SECURITY = 'security'
}
```

### **🎯 Аудит дій:**
```typescript
enum AuditAction {
  LOGIN = 'login',
  REQUEST_VACATION = 'request_vacation',
  APPROVE_VACATION = 'approve_vacation',
  VIEW_REPORTS = 'view_reports',
  MANAGE_USERS = 'manage_users'
}
```

### **🔧 Використання middleware:**
```typescript
// Глобальне логування
app.use(logging());

// Аудит конкретної дії
app.post('/vacations', audit(AuditAction.REQUEST_VACATION), handler);

// Перевірка безпеки
app.use(security());

// Обробка помилок
app.use(LoggingMiddleware.errorHandler());
```

### **📊 Отримання логів:**
```typescript
// Всі логи
const allLogs = LoggingMiddleware.getLogs();

// Логи за рівнем
const errorLogs = LoggingMiddleware.getLogs(LogLevel.ERROR);

// Логи аудиту
const auditLogs = LoggingMiddleware.getAuditLogs();

// Логи безпеки
const securityLogs = LoggingMiddleware.getSecurityLogs();

// Статистика
const stats = LoggingMiddleware.getLogStats();
```

---

## **🚦 RATE LIMITING**

### **🎯 Конфігурація обмежень:**
```typescript
const RATE_LIMIT_CONFIG = {
  'default': {
    windowMs: 15 * 60 * 1000, // 15 хвилин
    maxRequests: 100
  },
  'webhook': {
    windowMs: 60 * 1000, // 1 хвилина
    maxRequests: 30
  },
  'auth': {
    windowMs: 15 * 60 * 1000, // 15 хвилин
    maxRequests: 5
  },
  'vacations': {
    windowMs: 60 * 1000, // 1 хвилина
    maxRequests: 10
  }
};
```

### **🔧 Використання middleware:**
```typescript
// Глобальне обмеження
app.use(rateLimit('default'));

// Спеціальні обмеження
app.post('/webhook', telegramWebhook(), handler);
app.post('/login', auth(), handler);
app.post('/vacations', rateLimit('vacations'), handler);

// Адаптивне обмеження
app.use(adaptive()); // Зменшує ліміт при підозрілій активності
```

### **📊 Управління rate limiting:**
```typescript
// Статистика
const stats = RateLimitMiddleware.getStats();

// Скидання ліміту
RateLimitMiddleware.resetLimit('user_123');

// Білліста IP
RateLimitMiddleware.whitelistIP('192.168.1.1');

// Розблокування IP
RateLimitMiddleware.unwhitelistIP('192.168.1.1');
```

---

## **🛡️ SECURITY FEATURES**

### **✅ Автоматичне виявлення загроз:**
- **Підозрілі User-Agent** - боти, краулери
- **Часті запити** - DDoS атаки
- **Підозрілі шляхи** - спроби доступу до адмін панелі
- **IP блокування** - автоматичне блокування при критичному перевищенні

### **✅ Захист від атак:**
- **Rate limiting** - обмеження кількості запитів
- **IP whitelist/blacklist** - контроль доступу по IP
- **Adaptive limits** - динамічне зменшення лімітів
- **Security logging** - детальне логування підозрілих дій

---

## **📋 ПРИКЛАДИ ВИКОРИСТАННЯ**

### **✅ Повний приклад endpoint:**
```typescript
app.post('/vacations',
  rateLimit('vacations'),                    // Обмеження швидкості
  AuthMiddleware.authenticate(),             // Авторизація
  requirePermission(Permission.REQUEST_VACATION), // Перевірка дозволу
  audit(AuditAction.REQUEST_VACATION),       // Аудит дії
  async (req, res) => {
    // Логіка обробки заявки на відпустку
    res.json({ message: 'Vacation request created' });
  }
);
```

### **✅ HR endpoints:**
```typescript
// Затвердження відпустки
app.put('/vacations/:id/approve',
  requireHR(),                              // Тільки HR
  requirePermission(Permission.APPROVE_VACATION),
  audit(AuditAction.APPROVE_VACATION),
  handler
);

// Управління користувачами
app.get('/admin/users',
  requireHR(),
  requirePermission(Permission.MANAGE_USERS),
  audit(AuditAction.MANAGE_USERS),
  handler
);
```

### **✅ Командний доступ:**
```typescript
// Перегляд командних звітів
app.get('/reports/team',
  requireManagement(),                      // Team Lead або HR
  requirePermission(Permission.VIEW_TEAM_REPORTS),
  audit(AuditAction.VIEW_REPORTS),
  handler
);

// Доступ до користувачів команди
app.get('/team/users',
  requireTeamAccess(),                      // Тільки члени команди
  handler
);
```

### **✅ API з контролем доступу:**
```typescript
// Доступ до власних даних або HR
app.get('/api/users/:id',
  rateLimit('api'),
  allowSelfOrRole(Role.HR_ADMIN, Role.FOUNDER),
  handler
);
```

---

## **📊 МОНІТОРИНГ ТА СТАТИСТИКА**

### **✅ Отримання статистики:**
```typescript
app.get('/admin/stats',
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
```

### **✅ Управління системою:**
```typescript
// Очищення логів
app.post('/admin/cleanup/logs', requireHR(), (req, res) => {
  LoggingMiddleware.clearLogs();
  res.json({ message: 'Logs cleared' });
});

// Скидання rate limit
app.post('/admin/cleanup/rate-limit', requireHR(), (req, res) => {
  const { identifier } = req.body;
  RateLimitMiddleware.resetLimit(identifier);
  res.json({ message: `Rate limit reset for ${identifier}` });
});

// Очищення auth кешу
app.post('/admin/cleanup/auth-cache', requireHR(), (req, res) => {
  const { userId } = req.body;
  AuthMiddleware.clearUserCache(userId);
  res.json({ message: 'Auth cache cleared' });
});
```

---

## **🎯 ПЕРЕВАГИ СИСТЕМИ**

### **✅ Безпека:**
- **Повний контроль доступу** - ролі та дозволи
- **Захист від атак** - rate limiting та security checks
- **Аудит дій** - повне логування всіх операцій
- **Автоматичне виявлення загроз** - підозріла активність

### **✅ Масштабованість:**
- **Кешування** - швидкий доступ до даних авторизації
- **Адаптивні ліміти** - динамічне налаштування
- **Модульна архітектура** - легко розширювати
- **Статистика** - моніторинг продуктивності

### **✅ Зручність:**
- **Простий API** - легке використання
- **Гнучка конфігурація** - налаштування під потреби
- **Детальна документація** - зрозумілі приклади
- **TypeScript підтримка** - type safety

---

## **🚀 ГОТОВНІСТЬ ДО ПРОДАКШЕНУ**

**Middleware система забезпечує:**
- ✅ **Enterprise-рівень безпеки**
- ✅ **Повний контроль доступу**
- ✅ **Детальний аудит дій**
- ✅ **Захист від атак**
- ✅ **Моніторинг та статистика**
- ✅ **Легке масштабування**

**Готова для використання в продакшені!** 🔐✨
