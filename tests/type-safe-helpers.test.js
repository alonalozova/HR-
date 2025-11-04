/**
 * 🛡️ TYPE SAFE HELPERS TESTS
 * Тести для безпечних допоміжних функцій
 */

const { TypeSafeHelpers } = require('../utils/type-safe-helpers');

describe('Type Safe Helpers', () => {
  describe('NumberSafety', () => {
    describe('safeParseInt', () => {
      it('should parse valid integers', () => {
        expect(TypeSafeHelpers.Number.safeParseInt('123')).toBe(123);
        expect(TypeSafeHelpers.Number.safeParseInt('0')).toBe(0);
        expect(TypeSafeHelpers.Number.safeParseInt('-456')).toBe(-456);
        expect(TypeSafeHelpers.Number.safeParseInt(789)).toBe(789);
      });

      it('should return default value for invalid inputs', () => {
        expect(TypeSafeHelpers.Number.safeParseInt('abc')).toBe(0);
        expect(TypeSafeHelpers.Number.safeParseInt('12.34')).toBe(12); // Truncates decimal
        expect(TypeSafeHelpers.Number.safeParseInt(null)).toBe(0);
        expect(TypeSafeHelpers.Number.safeParseInt(undefined)).toBe(0);
        expect(TypeSafeHelpers.Number.safeParseInt({})).toBe(0);
        expect(TypeSafeHelpers.Number.safeParseInt([])).toBe(0);
      });

      it('should use custom default value', () => {
        expect(TypeSafeHelpers.Number.safeParseInt('abc', 999)).toBe(999);
        expect(TypeSafeHelpers.Number.safeParseInt(null, -1)).toBe(-1);
        expect(TypeSafeHelpers.Number.safeParseInt(undefined, 42)).toBe(42);
      });
    });

    describe('safeEquals', () => {
      it('should compare numbers correctly', () => {
        expect(TypeSafeHelpers.Number.safeEquals(123, '123')).toBe(true);
        expect(TypeSafeHelpers.Number.safeEquals('456', 456)).toBe(true);
        expect(TypeSafeHelpers.Number.safeEquals(789, 789)).toBe(true);
        expect(TypeSafeHelpers.Number.safeEquals(123, 456)).toBe(false);
      });

      it('should handle invalid inputs', () => {
        expect(TypeSafeHelpers.Number.safeEquals('abc', 'def')).toBe(true); // Both default to 0
        expect(TypeSafeHelpers.Number.safeEquals(null, undefined)).toBe(true); // Both default to 0
        expect(TypeSafeHelpers.Number.safeEquals('123', null)).toBe(false); // 123 vs 0
      });
    });

    describe('isInRange', () => {
      it('should check if number is in range', () => {
        expect(TypeSafeHelpers.Number.isInRange(5, 1, 10)).toBe(true);
        expect(TypeSafeHelpers.Number.isInRange(1, 1, 10)).toBe(true);
        expect(TypeSafeHelpers.Number.isInRange(10, 1, 10)).toBe(true);
        expect(TypeSafeHelpers.Number.isInRange(0, 1, 10)).toBe(false);
        expect(TypeSafeHelpers.Number.isInRange(11, 1, 10)).toBe(false);
      });

      it('should handle invalid inputs', () => {
        expect(TypeSafeHelpers.Number.isInRange('abc', 1, 10)).toBe(false); // 0 not in range
        expect(TypeSafeHelpers.Number.isInRange(null, 1, 10)).toBe(false); // 0 not in range
      });
    });

    describe('safeAdd', () => {
      it('should add numbers safely', () => {
        expect(TypeSafeHelpers.Number.safeAdd(5, 3)).toBe(8);
        expect(TypeSafeHelpers.Number.safeAdd('10', '20')).toBe(30);
        expect(TypeSafeHelpers.Number.safeAdd(100, -50)).toBe(50);
      });

      it('should handle invalid inputs', () => {
        expect(TypeSafeHelpers.Number.safeAdd('abc', 'def')).toBe(0); // 0 + 0
        expect(TypeSafeHelpers.Number.safeAdd(null, undefined)).toBe(0); // 0 + 0
        expect(TypeSafeHelpers.Number.safeAdd('5', null)).toBe(5); // 5 + 0
      });
    });

    describe('safeSubtract', () => {
      it('should subtract numbers safely', () => {
        expect(TypeSafeHelpers.Number.safeSubtract(10, 3)).toBe(7);
        expect(TypeSafeHelpers.Number.safeSubtract('20', '5')).toBe(15);
        expect(TypeSafeHelpers.Number.safeSubtract(5, 10)).toBe(-5);
      });

      it('should handle invalid inputs', () => {
        expect(TypeSafeHelpers.Number.safeSubtract('abc', 'def')).toBe(0); // 0 - 0
        expect(TypeSafeHelpers.Number.safeSubtract(null, undefined)).toBe(0); // 0 - 0
        expect(TypeSafeHelpers.Number.safeSubtract('10', null)).toBe(10); // 10 - 0
      });
    });
  });

  describe('DateSafety', () => {
    describe('safeParseDate', () => {
      it('should parse valid dates', () => {
        const validDate = new Date('2025-01-15');
        expect(TypeSafeHelpers.Date.safeParseDate('15.01.2025')).toEqual(validDate);
        expect(TypeSafeHelpers.Date.safeParseDate('2025-01-15')).toEqual(validDate);
        expect(TypeSafeHelpers.Date.safeParseDate(validDate)).toEqual(validDate);
      });

      it('should return null for invalid dates', () => {
        expect(TypeSafeHelpers.Date.safeParseDate('invalid-date')).toBeNull();
        expect(TypeSafeHelpers.Date.safeParseDate('32.13.2025')).toBeNull();
        expect(TypeSafeHelpers.Date.safeParseDate(null)).toBeNull();
        expect(TypeSafeHelpers.Date.safeParseDate(undefined)).toBeNull();
        expect(TypeSafeHelpers.Date.safeParseDate({})).toBeNull();
      });

      it('should parse different date formats', () => {
        const expectedDate = new Date('2025-01-15');
        
        expect(TypeSafeHelpers.Date.safeParseDate('15.01.2025')).toEqual(expectedDate);
        expect(TypeSafeHelpers.Date.safeParseDate('2025-01-15T10:30:00Z')).toEqual(
          new Date('2025-01-15T10:30:00Z')
        );
        expect(TypeSafeHelpers.Date.safeParseDate(1736899200000)).toEqual(expectedDate);
      });
    });

    describe('safeEquals', () => {
      it('should compare dates correctly', () => {
        const date1 = new Date('2025-01-15');
        const date2 = new Date('2025-01-15');
        const date3 = new Date('2025-01-16');

        expect(TypeSafeHelpers.Date.safeEquals(date1, date2)).toBe(true);
        expect(TypeSafeHelpers.Date.safeEquals(date1, date3)).toBe(false);
        expect(TypeSafeHelpers.Date.safeEquals('15.01.2025', date1)).toBe(true);
      });

      it('should handle invalid dates', () => {
        expect(TypeSafeHelpers.Date.safeEquals('invalid', 'invalid')).toBe(false);
        expect(TypeSafeHelpers.Date.safeEquals(null, undefined)).toBe(false);
        expect(TypeSafeHelpers.Date.safeEquals('15.01.2025', null)).toBe(false);
      });
    });

    describe('isInRange', () => {
      it('should check if date is in range', () => {
        const startDate = new Date('2025-01-01');
        const endDate = new Date('2025-01-31');
        const testDate = new Date('2025-01-15');

        expect(TypeSafeHelpers.Date.isInRange(testDate, startDate, endDate)).toBe(true);
        expect(TypeSafeHelpers.Date.isInRange(startDate, startDate, endDate)).toBe(true);
        expect(TypeSafeHelpers.Date.isInRange(endDate, startDate, endDate)).toBe(true);
        expect(TypeSafeHelpers.Date.isInRange(new Date('2024-12-31'), startDate, endDate)).toBe(false);
        expect(TypeSafeHelpers.Date.isInRange(new Date('2025-02-01'), startDate, endDate)).toBe(false);
      });
    });

    describe('addDays', () => {
      it('should add days to date', () => {
        const baseDate = new Date('2025-01-15');
        const expectedDate = new Date('2025-01-20');

        expect(TypeSafeHelpers.Date.addDays(baseDate, 5)).toEqual(expectedDate);
        expect(TypeSafeHelpers.Date.addDays('15.01.2025', 5)).toEqual(expectedDate);
      });

      it('should handle invalid dates', () => {
        expect(TypeSafeHelpers.Date.addDays('invalid-date', 5)).toBeNull();
        expect(TypeSafeHelpers.Date.addDays(null, 5)).toBeNull();
        expect(TypeSafeHelpers.Date.addDays(undefined, 5)).toBeNull();
      });
    });

    describe('daysDifference', () => {
      it('should calculate days difference', () => {
        const date1 = new Date('2025-01-15');
        const date2 = new Date('2025-01-20');

        expect(TypeSafeHelpers.Date.daysDifference(date1, date2)).toBe(5);
        expect(TypeSafeHelpers.Date.daysDifference(date2, date1)).toBe(5); // Absolute difference
      });

      it('should handle invalid dates', () => {
        expect(TypeSafeHelpers.Date.daysDifference('invalid', 'invalid')).toBeNull();
        expect(TypeSafeHelpers.Date.daysDifference(null, undefined)).toBeNull();
      });
    });
  });

  describe('StringSafety', () => {
    describe('safeString', () => {
      it('should convert values to safe strings', () => {
        expect(TypeSafeHelpers.String.safeString(123)).toBe('123');
        expect(TypeSafeHelpers.String.safeString(true)).toBe('true');
        expect(TypeSafeHelpers.String.safeString('hello')).toBe('hello');
        expect(TypeSafeHelpers.String.safeString('  spaced  ')).toBe('spaced');
      });

      it('should handle null and undefined', () => {
        expect(TypeSafeHelpers.String.safeString(null)).toBe('');
        expect(TypeSafeHelpers.String.safeString(undefined)).toBe('');
        expect(TypeSafeHelpers.String.safeString(null, 'default')).toBe('default');
        expect(TypeSafeHelpers.String.safeString(undefined, 'fallback')).toBe('fallback');
      });
    });

    describe('safeEquals', () => {
      it('should compare strings case-insensitively by default', () => {
        expect(TypeSafeHelpers.String.safeEquals('Hello', 'hello')).toBe(true);
        expect(TypeSafeHelpers.String.safeEquals('WORLD', 'world')).toBe(true);
        expect(TypeSafeHelpers.String.safeEquals('Test', 'TEST')).toBe(true);
      });

      it('should compare strings case-sensitively when specified', () => {
        expect(TypeSafeHelpers.String.safeEquals('Hello', 'hello', true)).toBe(false);
        expect(TypeSafeHelpers.String.safeEquals('WORLD', 'world', true)).toBe(false);
        expect(TypeSafeHelpers.String.safeEquals('Test', 'Test', true)).toBe(true);
      });

      it('should handle null and undefined', () => {
        expect(TypeSafeHelpers.String.safeEquals(null, undefined)).toBe(true); // Both become ''
        expect(TypeSafeHelpers.String.safeEquals('test', null)).toBe(false); // 'test' vs ''
      });
    });

    describe('isNotEmpty', () => {
      it('should check if string is not empty', () => {
        expect(TypeSafeHelpers.String.isNotEmpty('hello')).toBe(true);
        expect(TypeSafeHelpers.String.isNotEmpty('  spaced  ')).toBe(true);
        expect(TypeSafeHelpers.String.isNotEmpty('')).toBe(false);
        expect(TypeSafeHelpers.String.isNotEmpty('   ')).toBe(false);
        expect(TypeSafeHelpers.String.isNotEmpty(null)).toBe(false);
        expect(TypeSafeHelpers.String.isNotEmpty(undefined)).toBe(false);
      });
    });

    describe('safeTruncate', () => {
      it('should truncate long strings', () => {
        const longString = 'This is a very long string that should be truncated';
        const truncated = TypeSafeHelpers.String.safeTruncate(longString, 20);
        
        expect(truncated).toBe('This is a very long ...');
        expect(truncated.length).toBeLessThanOrEqual(23); // 20 + '...'
      });

      it('should not truncate short strings', () => {
        const shortString = 'Short';
        const result = TypeSafeHelpers.String.safeTruncate(shortString, 20);
        
        expect(result).toBe('Short');
      });

      it('should handle null and undefined', () => {
        expect(TypeSafeHelpers.String.safeTruncate(null, 10)).toBe('');
        expect(TypeSafeHelpers.String.safeTruncate(undefined, 10)).toBe('');
      });
    });

    describe('isValidEmail', () => {
      it('should validate email addresses', () => {
        expect(TypeSafeHelpers.String.isValidEmail('test@example.com')).toBe(true);
        expect(TypeSafeHelpers.String.isValidEmail('user.name@domain.co.uk')).toBe(true);
        expect(TypeSafeHelpers.String.isValidEmail('admin@company.org')).toBe(true);
      });

      it('should reject invalid email addresses', () => {
        expect(TypeSafeHelpers.String.isValidEmail('invalid-email')).toBe(false);
        expect(TypeSafeHelpers.String.isValidEmail('test@')).toBe(false);
        expect(TypeSafeHelpers.String.isValidEmail('@domain.com')).toBe(false);
        expect(TypeSafeHelpers.String.isValidEmail('test.domain.com')).toBe(false);
        expect(TypeSafeHelpers.String.isValidEmail(null)).toBe(false);
        expect(TypeSafeHelpers.String.isValidEmail(undefined)).toBe(false);
      });
    });
  });

  describe('ArraySafety', () => {
    describe('safeFind', () => {
      it('should find elements in valid arrays', () => {
        const array = [1, 2, 3, 4, 5];
        const result = TypeSafeHelpers.Array.safeFind(array, x => x > 3);
        
        expect(result).toBe(4);
      });

      it('should return undefined for invalid inputs', () => {
        expect(TypeSafeHelpers.Array.safeFind(null, x => x > 0)).toBeUndefined();
        expect(TypeSafeHelpers.Array.safeFind(undefined, x => x > 0)).toBeUndefined();
        expect(TypeSafeHelpers.Array.safeFind('not-array', x => x > 0)).toBeUndefined();
      });

      it('should handle predicate errors', () => {
        const array = [1, 2, 3];
        const result = TypeSafeHelpers.Array.safeFind(array, x => x.nonExistentProperty);
        
        expect(result).toBeUndefined();
      });
    });

    describe('safeFilter', () => {
      it('should filter valid arrays', () => {
        const array = [1, 2, 3, 4, 5];
        const result = TypeSafeHelpers.Array.safeFilter(array, x => x % 2 === 0);
        
        expect(result).toEqual([2, 4]);
      });

      it('should return empty array for invalid inputs', () => {
        expect(TypeSafeHelpers.Array.safeFilter(null, x => x > 0)).toEqual([]);
        expect(TypeSafeHelpers.Array.safeFilter(undefined, x => x > 0)).toEqual([]);
        expect(TypeSafeHelpers.Array.safeFilter('not-array', x => x > 0)).toEqual([]);
      });
    });

    describe('safeMap', () => {
      it('should map valid arrays', () => {
        const array = [1, 2, 3];
        const result = TypeSafeHelpers.Array.safeMap(array, x => x * 2);
        
        expect(result).toEqual([2, 4, 6]);
      });

      it('should return empty array for invalid inputs', () => {
        expect(TypeSafeHelpers.Array.safeMap(null, x => x * 2)).toEqual([]);
        expect(TypeSafeHelpers.Array.safeMap(undefined, x => x * 2)).toEqual([]);
        expect(TypeSafeHelpers.Array.safeMap('not-array', x => x * 2)).toEqual([]);
      });
    });

    describe('safeLength', () => {
      it('should return length of valid arrays', () => {
        expect(TypeSafeHelpers.Array.safeLength([1, 2, 3])).toBe(3);
        expect(TypeSafeHelpers.Array.safeLength([])).toBe(0);
      });

      it('should return 0 for invalid inputs', () => {
        expect(TypeSafeHelpers.Array.safeLength(null)).toBe(0);
        expect(TypeSafeHelpers.Array.safeLength(undefined)).toBe(0);
        expect(TypeSafeHelpers.Array.safeLength('not-array')).toBe(0);
        expect(TypeSafeHelpers.Array.safeLength({})).toBe(0);
      });
    });
  });

  describe('ValidationHelpers', () => {
    describe('isValidTelegramId', () => {
      it('should validate valid Telegram IDs', () => {
        expect(TypeSafeHelpers.Validation.isValidTelegramId(123456789)).toBe(true);
        expect(TypeSafeHelpers.Validation.isValidTelegramId('987654321')).toBe(true);
        expect(TypeSafeHelpers.Validation.isValidTelegramId(1)).toBe(true);
      });

      it('should reject invalid Telegram IDs', () => {
        expect(TypeSafeHelpers.Validation.isValidTelegramId(0)).toBe(false);
        expect(TypeSafeHelpers.Validation.isValidTelegramId(-123)).toBe(false);
        expect(TypeSafeHelpers.Validation.isValidTelegramId('invalid')).toBe(false);
        expect(TypeSafeHelpers.Validation.isValidTelegramId(null)).toBe(false);
        expect(TypeSafeHelpers.Validation.isValidTelegramId(undefined)).toBe(false);
      });
    });

    describe('isValidVacationDate', () => {
      it('should validate future dates', () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        expect(TypeSafeHelpers.Validation.isValidVacationDate(tomorrow)).toBe(true);
        expect(TypeSafeHelpers.Validation.isValidVacationDate('16.01.2025')).toBe(true);
      });

      it('should reject past dates', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        expect(TypeSafeHelpers.Validation.isValidVacationDate(yesterday)).toBe(false);
        expect(TypeSafeHelpers.Validation.isValidVacationDate('01.01.2020')).toBe(false);
      });
    });

    describe('isValidVacationDays', () => {
      it('should validate vacation days within range', () => {
        expect(TypeSafeHelpers.Validation.isValidVacationDays(1)).toBe(true);
        expect(TypeSafeHelpers.Validation.isValidVacationDays(7)).toBe(true);
        expect(TypeSafeHelpers.Validation.isValidVacationDays('5')).toBe(true);
      });

      it('should reject vacation days outside range', () => {
        expect(TypeSafeHelpers.Validation.isValidVacationDays(0)).toBe(false);
        expect(TypeSafeHelpers.Validation.isValidVacationDays(8)).toBe(false);
        expect(TypeSafeHelpers.Validation.isValidVacationDays(-1)).toBe(false);
        expect(TypeSafeHelpers.Validation.isValidVacationDays('invalid')).toBe(false);
      });
    });

    describe('isValidEmail', () => {
      it('should validate email addresses', () => {
        expect(TypeSafeHelpers.Validation.isValidEmail('test@example.com')).toBe(true);
        expect(TypeSafeHelpers.Validation.isValidEmail('user.name@domain.co.uk')).toBe(true);
      });

      it('should reject invalid email addresses', () => {
        expect(TypeSafeHelpers.Validation.isValidEmail('invalid-email')).toBe(false);
        expect(TypeSafeHelpers.Validation.isValidEmail('test@')).toBe(false);
        expect(TypeSafeHelpers.Validation.isValidEmail(null)).toBe(false);
      });
    });

    describe('isValidFullName', () => {
      it('should validate full names', () => {
        expect(TypeSafeHelpers.Validation.isValidFullName('John Doe')).toBe(true);
        expect(TypeSafeHelpers.Validation.isValidFullName('Mary Jane Smith')).toBe(true);
        expect(TypeSafeHelpers.Validation.isValidFullName('Альона Лозова')).toBe(true);
      });

      it('should reject invalid full names', () => {
        expect(TypeSafeHelpers.Validation.isValidFullName('John')).toBe(false); // Single name
        expect(TypeSafeHelpers.Validation.isValidFullName('A B')).toBe(false); // Too short
        expect(TypeSafeHelpers.Validation.isValidFullName('')).toBe(false); // Empty
        expect(TypeSafeHelpers.Validation.isValidFullName(null)).toBe(false);
      });
    });
  });

  describe('ErrorSafety', () => {
    describe('safeExecute', () => {
      it('should execute function and return result', () => {
        const result = TypeSafeHelpers.Error.safeExecute(
          () => 'success',
          'default'
        );
        
        expect(result).toBe('success');
      });

      it('should return default value on error', () => {
        const result = TypeSafeHelpers.Error.safeExecute(
          () => { throw new Error('Test error'); },
          'default'
        );
        
        expect(result).toBe('default');
      });

      it('should call error handler on error', () => {
        const errorHandler = jest.fn();
        
        TypeSafeHelpers.Error.safeExecute(
          () => { throw new Error('Test error'); },
          'default',
          errorHandler
        );
        
        expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    describe('safeExecuteAsync', () => {
      it('should execute async function and return result', async () => {
        const result = await TypeSafeHelpers.Error.safeExecuteAsync(
          async () => 'async success',
          'default'
        );
        
        expect(result).toBe('async success');
      });

      it('should return default value on async error', async () => {
        const result = await TypeSafeHelpers.Error.safeExecuteAsync(
          async () => { throw new Error('Async error'); },
          'default'
        );
        
        expect(result).toBe('default');
      });

      it('should call error handler on async error', async () => {
        const errorHandler = jest.fn();
        
        await TypeSafeHelpers.Error.safeExecuteAsync(
          async () => { throw new Error('Async error'); },
          'default',
          errorHandler
        );
        
        expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
      });
    });
  });

  describe('StatsHelpers', () => {
    describe('safeCalculateStats', () => {
      it('should calculate statistics for valid data', () => {
        const data = [1, 2, 3, null, 5, undefined, 7];
        const stats = TypeSafeHelpers.Stats.safeCalculateStats(data);
        
        expect(stats.total).toBe(7);
        expect(stats.valid).toBe(5);
        expect(stats.invalid).toBe(2);
        expect(stats.percentage).toBeCloseTo(71.43, 2);
      });

      it('should handle empty data', () => {
        const stats = TypeSafeHelpers.Stats.safeCalculateStats([]);
        
        expect(stats.total).toBe(0);
        expect(stats.valid).toBe(0);
        expect(stats.invalid).toBe(0);
        expect(stats.percentage).toBe(0);
      });

      it('should handle invalid input', () => {
        const stats = TypeSafeHelpers.Stats.safeCalculateStats(null);
        
        expect(stats.total).toBe(0);
        expect(stats.valid).toBe(0);
        expect(stats.invalid).toBe(0);
        expect(stats.percentage).toBe(0);
      });
    });

    describe('safeGroupBy', () => {
      it('should group data by key function', () => {
        const data = [
          { category: 'A', value: 1 },
          { category: 'B', value: 2 },
          { category: 'A', value: 3 },
          { category: 'C', value: 4 }
        ];
        
        const groups = TypeSafeHelpers.Stats.safeGroupBy(data, item => item.category);
        
        expect(groups.A).toHaveLength(2);
        expect(groups.B).toHaveLength(1);
        expect(groups.C).toHaveLength(1);
        expect(groups.A[0].value).toBe(1);
        expect(groups.A[1].value).toBe(3);
      });

      it('should handle empty data', () => {
        const groups = TypeSafeHelpers.Stats.safeGroupBy([], item => item.category);
        expect(groups).toEqual({});
      });

      it('should handle invalid input', () => {
        const groups = TypeSafeHelpers.Stats.safeGroupBy(null, item => item.category);
        expect(groups).toEqual({});
      });

      it('should skip items with errors in key function', () => {
        const data = [
          { category: 'A', value: 1 },
          { invalid: true },
          { category: 'B', value: 2 }
        ];
        
        const groups = TypeSafeHelpers.Stats.safeGroupBy(data, item => item.category);
        
        expect(groups.A).toHaveLength(1);
        expect(groups.B).toHaveLength(1);
        expect(groups.undefined).toBeUndefined();
      });
    });
  });
});

