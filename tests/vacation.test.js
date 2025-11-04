/**
 * 🧪 VACATION SERVICE TESTS
 * Тести для сервісу обробки відпусток
 */

const { processVacationRequest, checkVacationConflicts, validateVacationData } = require('../services/vacation.service');
const { TypeSafeHelpers } = require('../utils/type-safe-helpers');

// Mock Google Sheets
jest.mock('../services/sheets.service', () => ({
  getSheetRows: jest.fn(),
  addRow: jest.fn(),
  updateRow: jest.fn()
}));

// Mock Telegram service
jest.mock('../services/telegram.service', () => ({
  sendMessage: jest.fn(),
  notifyHR: jest.fn(),
  notifyPM: jest.fn()
}));

describe('Vacation Request Processing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateVacationData', () => {
    it('should validate correct vacation data', () => {
      const validData = {
        startDate: new Date('2025-02-15'),
        days: 5,
        userId: 123
      };

      const result = validateVacationData(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject vacation with too many days', () => {
      const invalidData = {
        startDate: new Date('2025-02-15'),
        days: 10, // Максимум 7 днів
        userId: 123
      };

      const result = validateVacationData(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Максимум 7 днів відпустки за раз');
    });

    it('should reject vacation with too few days', () => {
      const invalidData = {
        startDate: new Date('2025-02-15'),
        days: 0, // Мінімум 1 день
        userId: 123
      };

      const result = validateVacationData(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Мінімум 1 день відпустки');
    });

    it('should reject past dates', () => {
      const invalidData = {
        startDate: new Date('2024-01-01'), // Минула дата
        days: 3,
        userId: 123
      };

      const result = validateVacationData(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Дата має бути в майбутньому');
    });

    it('should reject weekends', () => {
      const invalidData = {
        startDate: new Date('2025-01-18'), // Субота
        days: 3,
        userId: 123
      };

      const result = validateVacationData(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Відпустка не може починатися у вихідні');
    });
  });

  describe('checkVacationConflicts', () => {
    it('should detect conflicts with team members', async () => {
      // Mock existing vacation data
      const mockExistingVacations = [
        {
          userId: 456,
          startDate: new Date('2025-01-15'),
          endDate: new Date('2025-01-19'),
          department: 'Marketing',
          team: 'PPC Team',
          status: 'approved'
        }
      ];

      const { getSheetRows } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue(mockExistingVacations);

      const newVacation = {
        startDate: new Date('2025-01-16'), // Перетинається
        endDate: new Date('2025-01-20'),
        department: 'Marketing',
        team: 'PPC Team'
      };

      const conflicts = await checkVacationConflicts(newVacation);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].userId).toBe(456);
    });

    it('should not detect conflicts with different teams', async () => {
      const mockExistingVacations = [
        {
          userId: 456,
          startDate: new Date('2025-01-15'),
          endDate: new Date('2025-01-19'),
          department: 'Marketing',
          team: 'Design Team', // Різна команда
          status: 'approved'
        }
      ];

      const { getSheetRows } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue(mockExistingVacations);

      const newVacation = {
        startDate: new Date('2025-01-16'),
        endDate: new Date('2025-01-20'),
        department: 'Marketing',
        team: 'PPC Team' // Різна команда
      };

      const conflicts = await checkVacationConflicts(newVacation);
      expect(conflicts).toHaveLength(0);
    });

    it('should not detect conflicts with pending requests', async () => {
      const mockExistingVacations = [
        {
          userId: 456,
          startDate: new Date('2025-01-15'),
          endDate: new Date('2025-01-19'),
          department: 'Marketing',
          team: 'PPC Team',
          status: 'pending_hr' // Не затверджена
        }
      ];

      const { getSheetRows } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue(mockExistingVacations);

      const newVacation = {
        startDate: new Date('2025-01-16'),
        endDate: new Date('2025-01-20'),
        department: 'Marketing',
        team: 'PPC Team'
      };

      const conflicts = await checkVacationConflicts(newVacation);
      expect(conflicts).toHaveLength(0);
    });

    it('should handle edge cases with exact date matches', async () => {
      const mockExistingVacations = [
        {
          userId: 456,
          startDate: new Date('2025-01-15'),
          endDate: new Date('2025-01-17'),
          department: 'Marketing',
          team: 'PPC Team',
          status: 'approved'
        }
      ];

      const { getSheetRows } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue(mockExistingVacations);

      // Exact end date match with start date
      const newVacation = {
        startDate: new Date('2025-01-17'), // Точне співпадіння
        endDate: new Date('2025-01-19'),
        department: 'Marketing',
        team: 'PPC Team'
      };

      const conflicts = await checkVacationConflicts(newVacation);
      expect(conflicts).toHaveLength(1);
    });
  });

  describe('processVacationRequest', () => {
    it('should reject vacation request with conflicts', async () => {
      const mockData = {
        startDate: new Date('2025-01-15'),
        days: 5,
        userId: 123
      };

      // Mock conflicts
      const mockConflicts = [
        {
          userId: 456,
          fullName: 'John Doe',
          startDate: new Date('2025-01-16'),
          endDate: new Date('2025-01-20')
        }
      ];

      const { getSheetRows } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue(mockConflicts);

      const result = await processVacationRequest(123, mockData);
      
      expect(result.status).toBe('rejected');
      expect(result.reason).toContain('пересікається з Людинкою з твоєї команди');
      expect(result.conflicts).toEqual(mockConflicts);
    });

    it('should approve vacation request without conflicts', async () => {
      const mockData = {
        startDate: new Date('2025-02-15'),
        days: 3,
        userId: 123
      };

      // Mock no conflicts
      const { getSheetRows } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue([]);

      const { addRow } = require('../services/sheets.service');
      addRow.mockResolvedValue({ id: 'new_row_id' });

      const result = await processVacationRequest(123, mockData);
      
      expect(result.status).toBe('pending_pm');
      expect(result.message).toContain('Супер, твій запит відправляється далі');
      expect(addRow).toHaveBeenCalled();
    });

    it('should check vacation balance before processing', async () => {
      const mockData = {
        startDate: new Date('2025-02-15'),
        days: 25, // Більше ніж залишок
        userId: 123
      };

      // Mock vacation balance
      const mockBalance = {
        remainingDays: 20,
        usedDays: 4,
        totalDays: 24
      };

      const { getSheetRows } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue([mockBalance]);

      const result = await processVacationRequest(123, mockData);
      
      expect(result.status).toBe('rejected');
      expect(result.reason).toContain('Недостатньо днів відпустки');
      expect(result.balance).toEqual(mockBalance);
    });

    it('should notify PM after successful request', async () => {
      const mockData = {
        startDate: new Date('2025-02-15'),
        days: 3,
        userId: 123
      };

      const { getSheetRows, addRow } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue([]);
      addRow.mockResolvedValue({ id: 'new_row_id' });

      const { notifyPM } = require('../services/telegram.service');
      notifyPM.mockResolvedValue(true);

      await processVacationRequest(123, mockData);
      
      expect(notifyPM).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 123,
          startDate: mockData.startDate,
          days: mockData.days
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      const mockData = {
        startDate: new Date('2025-02-15'),
        days: 3,
        userId: 123
      };

      const { getSheetRows } = require('../services/sheets.service');
      getSheetRows.mockRejectedValue(new Error('Database connection failed'));

      const result = await processVacationRequest(123, mockData);
      
      expect(result.status).toBe('error');
      expect(result.error).toContain('Database connection failed');
    });

    it('should validate probation period for new employees', async () => {
      const mockData = {
        startDate: new Date('2025-02-15'),
        days: 3,
        userId: 123
      };

      // Mock user with recent start date (less than 3 months)
      const mockUser = {
        firstWorkDay: new Date('2024-12-15'), // Менше 3 місяців
        department: 'Marketing',
        team: 'PPC Team'
      };

      const { getSheetRows } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue([mockUser]);

      const result = await processVacationRequest(123, mockData);
      
      expect(result.status).toBe('rejected');
      expect(result.reason).toContain('3 місяці випробувального періоду');
    });
  });

  describe('Vacation Approval Process', () => {
    it('should approve vacation by PM', async () => {
      const requestId = 'req_123';
      const pmId = 456;

      const { updateRow } = require('../services/sheets.service');
      updateRow.mockResolvedValue(true);

      const { notifyHR } = require('../services/telegram.service');
      notifyHR.mockResolvedValue(true);

      const result = await approveVacationRequest(requestId, pmId);
      
      expect(result.status).toBe('pending_hr');
      expect(result.pmApprovedBy).toBe(pmId);
      expect(updateRow).toHaveBeenCalledWith('Vacations', requestId, {
        status: 'pending_hr',
        pmApprovedBy: pmId,
        pmApprovedAt: expect.any(Date)
      });
      expect(notifyHR).toHaveBeenCalled();
    });

    it('should reject vacation by PM', async () => {
      const requestId = 'req_123';
      const pmId = 456;
      const reason = 'Критичний період проекту';

      const { updateRow } = require('../services/sheets.service');
      updateRow.mockResolvedValue(true);

      const { sendMessage } = require('../services/telegram.service');
      sendMessage.mockResolvedValue(true);

      const result = await rejectVacationRequest(requestId, pmId, reason);
      
      expect(result.status).toBe('rejected');
      expect(result.rejectedBy).toBe(pmId);
      expect(result.rejectionReason).toBe(reason);
      expect(updateRow).toHaveBeenCalledWith('Vacations', requestId, {
        status: 'rejected',
        rejectedBy: pmId,
        rejectionReason: reason,
        rejectedAt: expect.any(Date)
      });
    });

    it('should final approve vacation by HR', async () => {
      const requestId = 'req_123';
      const hrId = 789;

      const { updateRow } = require('../services/sheets.service');
      updateRow.mockResolvedValue(true);

      const { sendMessage } = require('../services/telegram.service');
      sendMessage.mockResolvedValue(true);

      const result = await finalApproveVacation(requestId, hrId);
      
      expect(result.status).toBe('approved');
      expect(result.hrApprovedBy).toBe(hrId);
      expect(updateRow).toHaveBeenCalledWith('Vacations', requestId, {
        status: 'approved',
        hrApprovedBy: hrId,
        hrApprovedAt: expect.any(Date)
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid date formats', () => {
      const invalidData = {
        startDate: 'invalid-date',
        days: 3,
        userId: 123
      };

      const result = validateVacationData(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Невірний формат дати');
    });

    it('should handle null or undefined data', () => {
      const result = validateVacationData(null);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Дані відпустки не надані');
    });

    it('should handle concurrent vacation requests', async () => {
      const mockData = {
        startDate: new Date('2025-01-15'),
        days: 3,
        userId: 123
      };

      // Simulate concurrent requests
      const { getSheetRows } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue([]);

      const promises = [
        processVacationRequest(123, mockData),
        processVacationRequest(123, mockData)
      ];

      const results = await Promise.all(promises);
      
      // One should succeed, one should fail
      const successCount = results.filter(r => r.status === 'pending_pm').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;
      
      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);
    });

    it('should handle timezone issues', () => {
      const mockData = {
        startDate: new Date('2025-01-15T23:59:59Z'),
        days: 3,
        userId: 123
      };

      const result = validateVacationData(mockData);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    it('should process vacation requests within acceptable time', async () => {
      const mockData = {
        startDate: new Date('2025-02-15'),
        days: 3,
        userId: 123
      };

      const { getSheetRows, addRow } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue([]);
      addRow.mockResolvedValue({ id: 'new_row_id' });

      const startTime = Date.now();
      await processVacationRequest(123, mockData);
      const endTime = Date.now();

      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(1000); // Less than 1 second
    });

    it('should handle large conflict datasets efficiently', async () => {
      // Mock large dataset
      const mockConflicts = Array.from({ length: 1000 }, (_, i) => ({
        userId: i,
        startDate: new Date('2025-01-15'),
        endDate: new Date('2025-01-19'),
        department: 'Marketing',
        team: 'PPC Team',
        status: 'approved'
      }));

      const { getSheetRows } = require('../services/sheets.service');
      getSheetRows.mockResolvedValue(mockConflicts);

      const startTime = Date.now();
      const conflicts = await checkVacationConflicts({
        startDate: new Date('2025-01-16'),
        endDate: new Date('2025-01-20'),
        department: 'Marketing',
        team: 'PPC Team'
      });
      const endTime = Date.now();

      expect(conflicts).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(500); // Less than 500ms
    });
  });
});

