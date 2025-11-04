# 📋 TYPESCRIPT TYPES GUIDE - Посібник по TypeScript інтерфейсах

## ✅ **TYPE SAFETY ЗАБЕЗПЕЧЕНО!**

### **🎯 СТВОРЕНІ TYPESCRIPT ІНТЕРФЕЙСИ:**
- ✅ **User** - інтерфейс користувача
- ✅ **VacationRequest** - інтерфейс заявки на відпустку
- ✅ **UserRole** - інтерфейс ролі користувача
- ✅ **Permission** - інтерфейс дозволів
- ✅ **WorkMode** - тип режиму роботи
- ✅ **VacationStatus** - тип статусу відпустки

---

## **👤 USER INTERFACE**

### **✅ Базовий інтерфейс:**
```typescript
interface User {
  telegramId: number;
  fullName: string;
  department: string;
  team: string;
  position: string;
  birthDate: Date;
  firstWorkDay: Date;
  workMode: 'Hybrid' | 'Remote' | 'Office';
  isRegistered?: boolean;
  role?: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}
```

### **✅ Приклад використання:**
```typescript
import { User } from './types/core';

// Створення користувача
const user: User = {
  telegramId: 123456789,
  fullName: 'Альона Лозова',
  department: 'HR',
  team: 'HR Team',
  position: 'HR Manager',
  birthDate: new Date('1990-01-15'),
  firstWorkDay: new Date('2024-01-01'),
  workMode: 'Hybrid',
  isRegistered: true,
  role: {
    level: 'hr_admin',
    permissions: []
  },
  createdAt: new Date(),
  updatedAt: new Date()
};
```

---

## **🏖️ VACATION REQUEST INTERFACE**

### **✅ Базовий інтерфейс:**
```typescript
interface VacationRequest {
  requestId: string;
  userId: number;
  startDate: Date;
  endDate: Date;
  days: number;
  status: 'pending_pm' | 'pending_hr' | 'approved' | 'rejected';
  requestType?: 'regular' | 'emergency' | 'sick_leave';
  reason?: string;
  createdAt?: Date;
  updatedAt?: Date;
  approvedBy?: number;
  rejectedBy?: number;
  rejectionReason?: string;
}
```

### **✅ Приклад використання:**
```typescript
import { VacationRequest } from './types/core';

// Створення заявки на відпустку
const vacationRequest: VacationRequest = {
  requestId: 'REQ_123456789',
  userId: 123456789,
  startDate: new Date('2025-02-15'),
  endDate: new Date('2025-02-19'),
  days: 5,
  status: 'pending_pm',
  requestType: 'regular',
  reason: 'Personal vacation',
  createdAt: new Date(),
  updatedAt: new Date()
};
```

---

## **👥 USER ROLE INTERFACE**

### **✅ Базовий інтерфейс:**
```typescript
interface UserRole {
  level: 'employee' | 'team_lead' | 'hr_admin' | 'founder';
  permissions?: Permission[];
}

interface Permission {
  action: string;
  resource: string;
  allowed: boolean;
}
```

### **✅ Приклад використання:**
```typescript
import { UserRole, Permission } from './types/core';

// Створення ролі користувача
const hrRole: UserRole = {
  level: 'hr_admin',
  permissions: [
    {
      action: 'approve',
      resource: 'vacation',
      allowed: true
    },
    {
      action: 'view',
      resource: 'reports',
      allowed: true
    }
  ]
};
```

---

## **🔄 WORK MODE TYPE**

### **✅ Тип режиму роботи:**
```typescript
type WorkMode = 'Hybrid' | 'Remote' | 'Office';
```

### **✅ Приклад використання:**
```typescript
import { WorkMode } from './types/core';

const workMode: WorkMode = 'Hybrid'; // ✅ Правильно
// const invalidMode: WorkMode = 'Invalid'; // ❌ Помилка типізації
```

---

## **📊 VACATION STATUS TYPE**

### **✅ Тип статусу відпустки:**
```typescript
type VacationStatus = 'pending_pm' | 'pending_hr' | 'approved' | 'rejected' | 'cancelled';
```

### **✅ Приклад використання:**
```typescript
import { VacationStatus } from './types/core';

const status: VacationStatus = 'pending_pm'; // ✅ Правильно
// const invalidStatus: VacationStatus = 'invalid'; // ❌ Помилка типізації
```

---

## **🛡️ ВАЛІДАЦІЯ З TYPE SAFETY**

### **✅ Валідація користувача:**
```typescript
import { User, WorkMode } from './types/core';

const validateUser = (user: User): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!user.telegramId || user.telegramId <= 0) {
    errors.push('Invalid Telegram ID');
  }

  const validWorkModes: WorkMode[] = ['Hybrid', 'Remote', 'Office'];
  if (!validWorkModes.includes(user.workMode)) {
    errors.push(`Invalid work mode. Must be one of: ${validWorkModes.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
```

### **✅ Валідація заявки на відпустку:**
```typescript
import { VacationRequest, VacationStatus } from './types/core';

const validateVacationRequest = (request: VacationRequest): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (request.days < 1 || request.days > 7) {
    errors.push('Days must be between 1 and 7');
  }

  const validStatuses: VacationStatus[] = ['pending_pm', 'pending_hr', 'approved', 'rejected'];
  if (!validStatuses.includes(request.status as VacationStatus)) {
    errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
```

---

## **🎯 ПРИКЛАДИ ВИКОРИСТАННЯ**

### **✅ Створення користувача з type safety:**
```typescript
import { User, UserRole } from './types/core';

const createUser = (userData: Partial<User>): User => {
  return {
    telegramId: userData.telegramId || 0,
    fullName: userData.fullName || '',
    department: userData.department || '',
    team: userData.team || '',
    position: userData.position || '',
    birthDate: userData.birthDate || new Date(),
    firstWorkDay: userData.firstWorkDay || new Date(),
    workMode: userData.workMode || 'Office',
    isRegistered: userData.isRegistered ?? false,
    role: userData.role || {
      level: 'employee',
      permissions: []
    },
    createdAt: userData.createdAt || new Date(),
    updatedAt: userData.updatedAt || new Date()
  };
};
```

### **✅ Створення заявки на відпустку з type safety:**
```typescript
import { VacationRequest, VacationStatus } from './types/core';

const createVacationRequest = (requestData: Partial<VacationRequest>): VacationRequest => {
  return {
    requestId: requestData.requestId || `REQ_${Date.now()}`,
    userId: requestData.userId || 0,
    startDate: requestData.startDate || new Date(),
    endDate: requestData.endDate || new Date(),
    days: requestData.days || 1,
    status: requestData.status || 'pending_pm',
    requestType: requestData.requestType || 'regular',
    reason: requestData.reason,
    createdAt: requestData.createdAt || new Date(),
    updatedAt: requestData.updatedAt || new Date()
  };
};
```

### **✅ Обробка заявки з type safety:**
```typescript
import { VacationRequest, User, VacationStatus } from './types/core';

const processVacationRequest = async (
  request: VacationRequest,
  user: User
): Promise<{ success: boolean; message: string; request?: VacationRequest }> => {
  // Валідація заявки
  const validation = validateVacationRequest(request);
  if (!validation.isValid) {
    return {
      success: false,
      message: `Validation failed: ${validation.errors.join(', ')}`
    };
  }

  // Перевірка прав доступу
  if (user.role?.level !== 'hr_admin' && request.status === 'approved') {
    return {
      success: false,
      message: 'Only HR admins can approve vacation requests'
    };
  }

  // Обробка заявки
  request.updatedAt = new Date();

  return {
    success: true,
    message: 'Vacation request processed successfully',
    request
  };
};
```

---

## **📁 СТРУКТУРА ФАЙЛІВ**

### **✅ Основні файли:**
```
types/
├── core.ts              # Базові інтерфейси
├── types.ts             # Повні інтерфейси з розширеними полями
└── ...

examples/
└── typescript-usage.ts  # Приклади використання
```

### **✅ Імпорт інтерфейсів:**
```typescript
// Базові інтерфейси
import { User, VacationRequest } from './types/core';

// Повні інтерфейси
import { User, VacationRequest } from './types';
```

---

## **🎯 ПЕРЕВАГИ TYPE SAFETY**

### **✅ Безпека типів:**
- **Compile-time checking** - перевірка на етапі компіляції
- **Auto-completion** - автодоповнення в IDE
- **Refactoring safety** - безпечний рефакторинг
- **Documentation** - інтерфейси як документація

### **✅ Менше помилок:**
- **Type errors** - виявлення помилок типів на етапі розробки
- **Invalid values** - запобігання некоректним значенням
- **Null safety** - безпечна робота з null/undefined
- **API contracts** - чіткі контракти API

### **✅ Кращий DX (Developer Experience):**
- **IDE support** - підтримка в IDE
- **Better documentation** - краща документація
- **Easier debugging** - легше дебажити
- **Team collaboration** - краща співпраця команди

---

## **🚀 ГОТОВНІСТЬ ДО ВИКОРИСТАННЯ**

**TypeScript інтерфейси забезпечують:**
- ✅ **Повну type safety** для всіх основних типів
- ✅ **Валідацію даних** на рівні типів
- ✅ **Безпеку рефакторингу** з автоматичною перевіркою
- ✅ **Документацію** через інтерфейси
- ✅ **IDE підтримку** з автодоповненням

**Готово для використання в продакшені!** 📋✨

