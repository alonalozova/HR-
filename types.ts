/**
 * 📋 TYPES - TypeScript інтерфейси для HR Bot
 * Забезпечує type safety та кращу читабельність коду
 */

// 👤 USER INTERFACES
export interface User {
  telegramId: number;
  fullName: string;
  department: string;
  team: string;
  position: string;
  birthDate: Date;
  firstWorkDay: Date;
  workMode: 'Hybrid' | 'Remote' | 'Office';
  isRegistered: boolean;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// ✅ Базова версія доступна в types/core.ts

export interface UserRole {
  level: 'employee' | 'team_lead' | 'hr_admin' | 'founder';
  permissions: Permission[];
}

export interface Permission {
  action: string;
  resource: string;
  allowed: boolean;
}

// 🏖️ VACATION INTERFACES
export interface VacationRequest {
  requestId: string;
  userId: number;
  startDate: Date;
  endDate: Date;
  days: number;
  status: VacationStatus;
  requestType: 'regular' | 'emergency' | 'sick_leave';
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
  approvedBy?: number;
  rejectedBy?: number;
  rejectionReason?: string;
}

export type VacationStatus = 'pending_pm' | 'pending_hr' | 'approved' | 'rejected' | 'cancelled';

export interface VacationBalance {
  userId: number;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  lastUpdated: Date;
}

// ⏰ ATTENDANCE INTERFACES
export interface LateRecord {
  recordId: string;
  userId: number;
  date: Date;
  time: string;
  reason?: string;
  createdAt: Date;
}

export interface RemoteRecord {
  recordId: string;
  userId: number;
  date: Date;
  workMode: 'remote' | 'hybrid' | 'office';
  reason?: string;
  createdAt: Date;
}

export interface SickRecord {
  recordId: string;
  userId: number;
  startDate: Date;
  endDate: Date;
  days: number;
  reason?: string;
  hasDocument: boolean;
  createdAt: Date;
}

// 📊 REPORTING INTERFACES
export interface MonthlyReport {
  userId: number;
  month: number;
  year: number;
  lateCount: number;
  remoteDays: number;
  sickDays: number;
  vacationDays: number;
  totalWorkingDays: number;
  createdAt: Date;
}

export interface HRReport {
  reportId: string;
  month: number;
  year: number;
  totalEmployees: number;
  totalLateCount: number;
  totalRemoteDays: number;
  totalSickDays: number;
  totalVacationDays: number;
  averageAttendance: number;
  createdAt: Date;
}

// 💬 COMMUNICATION INTERFACES
export interface Suggestion {
  suggestionId: string;
  userId: number;
  isAnonymous: boolean;
  title: string;
  description: string;
  category: 'workflow' | 'process' | 'environment' | 'other';
  status: 'pending' | 'reviewed' | 'implemented' | 'rejected';
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  reviewedBy?: number;
  reviewedAt?: Date;
}

export interface ASAPRequest {
  requestId: string;
  userId: number;
  title: string;
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  createdAt: Date;
  assignedTo?: number;
  resolvedAt?: Date;
}

// 🎂 EVENTS INTERFACES
export interface BirthdayReminder {
  userId: number;
  birthDate: Date;
  age: number;
  reminderDate: Date;
  isNotified: boolean;
  notificationCount: number;
}

export interface AnniversaryReminder {
  userId: number;
  workStartDate: Date;
  yearsInCompany: number;
  reminderDate: Date;
  isNotified: boolean;
  notificationCount: number;
}

// 📋 SURVEY INTERFACES
export interface Survey {
  surveyId: string;
  title: string;
  description: string;
  type: 'wellbeing' | 'satisfaction' | 'feedback' | 'custom';
  questions: SurveyQuestion[];
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  createdBy: number;
}

export interface SurveyQuestion {
  questionId: string;
  question: string;
  type: 'text' | 'multiple_choice' | 'rating' | 'boolean';
  options?: string[];
  required: boolean;
  order: number;
}

export interface SurveyResponse {
  responseId: string;
  surveyId: string;
  userId: number;
  answers: SurveyAnswer[];
  completedAt: Date;
  isAnonymous: boolean;
}

export interface SurveyAnswer {
  questionId: string;
  answer: string | number | boolean;
  answeredAt: Date;
}

// 🔧 CONFIGURATION INTERFACES
export interface BotConfig {
  botToken: string;
  hrChatId: string;
  sheetsId: string;
  serviceAccountEmail: string;
  privateKey: string;
  webhookUrl: string;
  environment: 'development' | 'staging' | 'production';
  features: FeatureConfig;
}

export interface FeatureConfig {
  enableVacations: boolean;
  enableAttendance: boolean;
  enableReports: boolean;
  enableSuggestions: boolean;
  enableSurveys: boolean;
  enableNotifications: boolean;
  enableAnalytics: boolean;
}

// 📱 TELEGRAM INTERFACES
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: {
    id: number;
    type: string;
  };
  date: number;
  text?: string;
  reply_markup?: any;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: any;
}

// 🗄️ DATABASE INTERFACES
export interface DatabaseConfig {
  type: 'google_sheets' | 'postgresql' | 'mongodb';
  connectionString?: string;
  sheetsConfig?: SheetsConfig;
}

export interface SheetsConfig {
  spreadsheetId: string;
  serviceAccountEmail: string;
  privateKey: string;
  sheets: {
    users: string;
    vacations: string;
    lates: string;
    remotes: string;
    sick: string;
    reports: string;
    suggestions: string;
    surveys: string;
  };
}

// 🔄 CACHE INTERFACES
export interface CacheConfig {
  type: 'memory' | 'redis' | 'file';
  ttl: number;
  maxSize: number;
  redisConfig?: {
    host: string;
    port: number;
    password?: string;
  };
}

// 📊 ANALYTICS INTERFACES
export interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  totalVacationRequests: number;
  approvedVacations: number;
  rejectedVacations: number;
  averageResponseTime: number;
  mostUsedFeatures: FeatureUsage[];
  monthlyStats: MonthlyStats[];
}

export interface FeatureUsage {
  feature: string;
  usageCount: number;
  uniqueUsers: number;
}

export interface MonthlyStats {
  month: string;
  year: number;
  totalRequests: number;
  totalApprovals: number;
  averageProcessingTime: number;
}

// 🚨 ERROR INTERFACES
export interface AppError extends Error {
  code: string;
  statusCode: number;
  isOperational: boolean;
  context?: any;
}

export interface ValidationError extends AppError {
  field: string;
  value: any;
  rule: string;
}

export interface DatabaseError extends AppError {
  query?: string;
  table?: string;
  operation: string;
}

// 📝 LOGGING INTERFACES
export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: any;
  userId?: number;
  requestId?: string;
}

// 🔐 SECURITY INTERFACES
export interface SecurityEvent {
  eventId: string;
  type: 'rate_limit' | 'suspicious_activity' | 'unauthorized_access' | 'data_breach';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  ipAddress: string;
  userAgent: string;
  userId?: number;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

// 🎯 UTILITY TYPES
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// 📅 DATE UTILITIES
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
}

// 🎨 UI INTERFACES
export interface KeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  switch_inline_query?: string;
}

export interface InlineKeyboard {
  inline_keyboard: KeyboardButton[][];
}

export interface ReplyKeyboard {
  keyboard: KeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  selective?: boolean;
}
