/**
 * 📋 CORE TYPES - Базові TypeScript інтерфейси для HR Bot
 * Основні інтерфейси для type safety
 */

// 👤 USER INTERFACE
export interface User {
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

// 🏖️ VACATION REQUEST INTERFACE
export interface VacationRequest {
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

// 👥 USER ROLE INTERFACE
export interface UserRole {
  level: 'employee' | 'team_lead' | 'hr_admin' | 'founder';
  permissions?: Permission[];
}

// 🔐 PERMISSION INTERFACE
export interface Permission {
  action: string;
  resource: string;
  allowed: boolean;
}

// 📊 VACATION STATUS TYPE
export type VacationStatus = 'pending_pm' | 'pending_hr' | 'approved' | 'rejected' | 'cancelled';

// 🔄 WORK MODE TYPE
export type WorkMode = 'Hybrid' | 'Remote' | 'Office';

// 📅 DATE RANGE INTERFACE
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// ✅ EXPORT ALL CORE TYPES
export type {
  User,
  VacationRequest,
  UserRole,
  Permission,
  VacationStatus,
  WorkMode,
  DateRange
};

