/**
 * 🧪 TEST SETUP
 * Налаштування для тестування HR бота
 */

// Mock console methods to reduce noise during testing
const originalConsole = global.console;

global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock process.env for tests
process.env.NODE_ENV = 'test';
process.env.BOT_TOKEN = 'test-bot-token';
process.env.HR_CHAT_ID = '123456789';
process.env.GOOGLE_SHEET_ID = 'test-sheet-id';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@example.com';
process.env.GOOGLE_PRIVATE_KEY = 'test-private-key';

// Global test utilities
global.testUtils = {
  // Mock user data
  createMockUser: (overrides = {}) => ({
    telegramId: 123456789,
    fullName: 'Test User',
    department: 'Marketing',
    team: 'PPC Team',
    position: 'PPC Specialist',
    birthDate: new Date('1990-01-01'),
    firstWorkDay: new Date('2024-01-01'),
    workMode: 'Office',
    isRegistered: true,
    role: {
      level: 'employee',
      permissions: []
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  // Mock vacation data
  createMockVacation: (overrides = {}) => ({
    requestId: 'REQ_123',
    userId: 123456789,
    startDate: new Date('2025-02-15'),
    endDate: new Date('2025-02-19'),
    days: 5,
    status: 'pending_pm',
    requestType: 'regular',
    reason: 'Personal vacation',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  // Mock request data
  createMockRequest: (overrides = {}) => ({
    body: { message: { from: { id: 123456789 } } },
    headers: { 'User-Agent': 'Test Agent' },
    ip: '127.0.0.1',
    params: {},
    query: {},
    ...overrides
  }),

  // Mock response data
  createMockResponse: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis()
    };
    return res;
  },

  // Mock next function
  createMockNext: () => jest.fn(),

  // Wait for async operations
  waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Mock date
  mockDate: (dateString) => {
    const mockDate = new Date(dateString);
    global.Date = class extends Date {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate;
        }
        return new (Date.bind.apply(Date, [null, ...args]))();
      }
    };
    global.Date.now = () => mockDate.getTime();
  },

  // Restore date
  restoreDate: () => {
    global.Date = Date;
  },

  // Mock Google Sheets response
  createMockSheetRows: (data = []) => data.map((item, index) => ({
    get: (column) => item[column] || '',
    set: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    rowIndex: index + 1,
    ...item
  })),

  // Mock Telegram message
  createMockTelegramMessage: (overrides = {}) => ({
    message_id: 123,
    from: {
      id: 123456789,
      is_bot: false,
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser'
    },
    chat: {
      id: 123456789,
      type: 'private'
    },
    date: Math.floor(Date.now() / 1000),
    text: '/start',
    ...overrides
  }),

  // Assert vacation conflict
  assertVacationConflict: (conflicts, expectedUserId) => {
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].userId).toBe(expectedUserId);
  },

  // Assert vacation approval
  assertVacationApproval: (result, expectedStatus) => {
    expect(result.status).toBe(expectedStatus);
    expect(result).toHaveProperty('requestId');
    expect(result).toHaveProperty('timestamp');
  },

  // Assert error response
  assertErrorResponse: (res, expectedStatus, expectedMessage) => {
    expect(res.status).toHaveBeenCalledWith(expectedStatus);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(String),
        message: expect.stringContaining(expectedMessage)
      })
    );
  },

  // Assert success response
  assertSuccessResponse: (res, expectedData) => {
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining(expectedData)
    );
  }
};

// Mock external services
jest.mock('../services/sheets.service', () => ({
  initGoogleSheets: jest.fn().mockResolvedValue(true),
  getSheetRows: jest.fn().mockResolvedValue([]),
  addRow: jest.fn().mockResolvedValue({ id: 'new_row_id' }),
  updateRow: jest.fn().mockResolvedValue(true),
  deleteRow: jest.fn().mockResolvedValue(true)
}));

jest.mock('../services/telegram.service', () => ({
  sendMessage: jest.fn().mockResolvedValue(true),
  sendPhoto: jest.fn().mockResolvedValue(true),
  sendDocument: jest.fn().mockResolvedValue(true),
  editMessage: jest.fn().mockResolvedValue(true),
  deleteMessage: jest.fn().mockResolvedValue(true),
  notifyHR: jest.fn().mockResolvedValue(true),
  notifyPM: jest.fn().mockResolvedValue(true),
  setWebhook: jest.fn().mockResolvedValue(true),
  deleteWebhook: jest.fn().mockResolvedValue(true)
}));

jest.mock('../services/user.service', () => ({
  getUser: jest.fn().mockResolvedValue(global.testUtils.createMockUser()),
  createUser: jest.fn().mockResolvedValue(global.testUtils.createMockUser()),
  updateUser: jest.fn().mockResolvedValue(true),
  deleteUser: jest.fn().mockResolvedValue(true)
}));

jest.mock('../services/vacation.service', () => ({
  processVacationRequest: jest.fn().mockResolvedValue({
    status: 'pending_pm',
    message: 'Request processed successfully'
  }),
  checkVacationConflicts: jest.fn().mockResolvedValue([]),
  validateVacationData: jest.fn().mockResolvedValue({
    isValid: true,
    errors: []
  }),
  approveVacationRequest: jest.fn().mockResolvedValue({
    status: 'approved',
    message: 'Vacation approved'
  }),
  rejectVacationRequest: jest.fn().mockResolvedValue({
    status: 'rejected',
    message: 'Vacation rejected'
  })
}));

// Global test hooks
beforeAll(() => {
  // Setup before all tests
  console.log('🧪 Setting up test environment...');
});

afterAll(() => {
  // Cleanup after all tests
  console.log('🧪 Cleaning up test environment...');
  
  // Restore console
  global.console = originalConsole;
});

beforeEach(() => {
  // Setup before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
  // Restore any global mocks
  global.testUtils.restoreDate();
});

// Custom error matchers
expect.extend({
  toBeValidDate(received) {
    const isValid = received instanceof Date && !isNaN(received.getTime());
    return {
      message: () => `expected ${received} to be a valid date`,
      pass: isValid
    };
  },
  
  toBeValidTelegramId(received) {
    const isValid = typeof received === 'number' && received > 0;
    return {
      message: () => `expected ${received} to be a valid Telegram ID`,
      pass: isValid
    };
  },
  
  toBeValidVacationDays(received) {
    const isValid = typeof received === 'number' && received >= 1 && received <= 7;
    return {
      message: () => `expected ${received} to be valid vacation days (1-7)`,
      pass: isValid
    };
  }
});

// Export test utilities
module.exports = {
  testUtils: global.testUtils
};

