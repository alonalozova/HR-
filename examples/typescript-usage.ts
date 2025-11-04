/**
 * 📋 TYPESCRIPT USAGE EXAMPLES
 * Приклади використання TypeScript інтерфейсів для HR Bot
 */

import { User, VacationRequest, UserRole, WorkMode, VacationStatus } from '../types/core';

// ✅ ПРИКЛАД 1: Створення користувача
const createUser = (userData: Partial<User>): User => {
  const user: User = {
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

  return user;
};

// ✅ ПРИКЛАД 2: Створення заявки на відпустку
const createVacationRequest = (requestData: Partial<VacationRequest>): VacationRequest => {
  const request: VacationRequest = {
    requestId: requestData.requestId || `REQ_${Date.now()}`,
    userId: requestData.userId || 0,
    startDate: requestData.startDate || new Date(),
    endDate: requestData.endDate || new Date(),
    days: requestData.days || 1,
    status: requestData.status || 'pending_pm',
    requestType: requestData.requestType || 'regular',
    reason: requestData.reason,
    createdAt: requestData.createdAt || new Date(),
    updatedAt: requestData.updatedAt || new Date(),
    approvedBy: requestData.approvedBy,
    rejectedBy: requestData.rejectedBy,
    rejectionReason: requestData.rejectionReason
  };

  return request;
};

// ✅ ПРИКЛАД 3: Валідація користувача з type safety
const validateUser = (user: User): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!user.telegramId || user.telegramId <= 0) {
    errors.push('Invalid Telegram ID');
  }

  if (!user.fullName || user.fullName.trim().length < 2) {
    errors.push('Full name must be at least 2 characters');
  }

  if (!user.department || user.department.trim().length === 0) {
    errors.push('Department is required');
  }

  if (!user.team || user.team.trim().length === 0) {
    errors.push('Team is required');
  }

  if (!user.position || user.position.trim().length === 0) {
    errors.push('Position is required');
  }

  if (!user.birthDate || isNaN(user.birthDate.getTime())) {
    errors.push('Invalid birth date');
  }

  if (!user.firstWorkDay || isNaN(user.firstWorkDay.getTime())) {
    errors.push('Invalid first work day');
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

// ✅ ПРИКЛАД 4: Валідація заявки на відпустку з type safety
const validateVacationRequest = (request: VacationRequest): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!request.requestId || request.requestId.trim().length === 0) {
    errors.push('Request ID is required');
  }

  if (!request.userId || request.userId <= 0) {
    errors.push('User ID is required');
  }

  if (!request.startDate || isNaN(request.startDate.getTime())) {
    errors.push('Invalid start date');
  }

  if (!request.endDate || isNaN(request.endDate.getTime())) {
    errors.push('Invalid end date');
  }

  if (request.startDate > request.endDate) {
    errors.push('Start date must be before end date');
  }

  if (request.days < 1 || request.days > 7) {
    errors.push('Days must be between 1 and 7');
  }

  const validStatuses: VacationStatus[] = ['pending_pm', 'pending_hr', 'approved', 'rejected'];
  if (!validStatuses.includes(request.status as VacationStatus)) {
    errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  // Перевірка обчислених днів
  const calculatedDays = Math.ceil(
    (request.endDate.getTime() - request.startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  if (request.days !== calculatedDays) {
    errors.push(`Days mismatch. Calculated: ${calculatedDays}, provided: ${request.days}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// ✅ ПРИКЛАД 5: Обробка заявки на відпустку з type safety
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

  // Валідація користувача
  const userValidation = validateUser(user);
  if (!userValidation.isValid) {
    return {
      success: false,
      message: `User validation failed: ${userValidation.errors.join(', ')}`
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

// ✅ ПРИКЛАД 6: Фільтрація заявок з type safety
const filterVacationRequests = (
  requests: VacationRequest[],
  filters: {
    userId?: number;
    status?: VacationStatus;
    startDate?: Date;
    endDate?: Date;
  }
): VacationRequest[] => {
  return requests.filter(request => {
    if (filters.userId && request.userId !== filters.userId) {
      return false;
    }

    if (filters.status && request.status !== filters.status) {
      return false;
    }

    if (filters.startDate && request.startDate < filters.startDate) {
      return false;
    }

    if (filters.endDate && request.endDate > filters.endDate) {
      return false;
    }

    return true;
  });
};

// ✅ ПРИКЛАД 7: Створення користувача з роллю
const createUserWithRole = (
  userData: Omit<User, 'role'>,
  roleLevel: UserRole['level'],
  permissions: UserRole['permissions'] = []
): User => {
  const user = createUser(userData);
  user.role = {
    level: roleLevel,
    permissions: permissions || []
  };

  return user;
};

// ✅ ПРИКЛАД 8: Оновлення статусу заявки з type safety
const updateVacationStatus = (
  request: VacationRequest,
  newStatus: VacationStatus,
  approvedBy?: number,
  rejectedBy?: number,
  rejectionReason?: string
): VacationRequest => {
  const updatedRequest: VacationRequest = {
    ...request,
    status: newStatus,
    updatedAt: new Date()
  };

  if (newStatus === 'approved' && approvedBy) {
    updatedRequest.approvedBy = approvedBy;
  }

  if (newStatus === 'rejected' && rejectedBy) {
    updatedRequest.rejectedBy = rejectedBy;
    updatedRequest.rejectionReason = rejectionReason;
  }

  return updatedRequest;
};

// ✅ ПРИКЛАД 9: Перевірка ролі користувача з type safety
const hasRole = (user: User, requiredRole: UserRole['level']): boolean => {
  const roleHierarchy: Record<UserRole['level'], number> = {
    employee: 1,
    team_lead: 2,
    hr_admin: 3,
    founder: 4
  };

  const userRoleLevel = roleHierarchy[user.role?.level || 'employee'];
  const requiredRoleLevel = roleHierarchy[requiredRole];

  return userRoleLevel >= requiredRoleLevel;
};

// ✅ ПРИКЛАД 10: Групування заявок по статусу з type safety
const groupRequestsByStatus = (requests: VacationRequest[]): Record<VacationStatus, VacationRequest[]> => {
  const grouped: Record<VacationStatus, VacationRequest[]> = {
    pending_pm: [],
    pending_hr: [],
    approved: [],
    rejected: []
  };

  requests.forEach(request => {
    const status = request.status as VacationStatus;
    if (grouped[status]) {
      grouped[status].push(request);
    }
  });

  return grouped;
};

// ✅ ЕКСПОРТ ФУНКЦІЙ
export {
  createUser,
  createVacationRequest,
  validateUser,
  validateVacationRequest,
  processVacationRequest,
  filterVacationRequests,
  createUserWithRole,
  updateVacationStatus,
  hasRole,
  groupRequestsByStatus
};

// ✅ ПРИКЛАД ВИКОРИСТАННЯ:
/*
// Створення користувача
const user: User = createUser({
  telegramId: 123456789,
  fullName: 'Альона Лозова',
  department: 'HR',
  team: 'HR Team',
  position: 'HR Manager',
  birthDate: new Date('1990-01-15'),
  firstWorkDay: new Date('2024-01-01'),
  workMode: 'Hybrid'
});

// Створення заявки на відпустку
const vacationRequest: VacationRequest = createVacationRequest({
  userId: 123456789,
  startDate: new Date('2025-02-15'),
  endDate: new Date('2025-02-19'),
  days: 5,
  status: 'pending_pm'
});

// Валідація
const userValidation = validateUser(user);
const requestValidation = validateVacationRequest(vacationRequest);

// Обробка
const result = await processVacationRequest(vacationRequest, user);
*/

