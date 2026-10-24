import {
  addDays,
  addMonthsClamped,
  addMonthsToMonth,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  daysLeftInMonth,
  isLeapYear,
  lastNMonths,
  monthOf,
  monthRange,
  parseIsoDate,
  parseIsoMonth,
  toIsoDate,
} from '@/services/dates';

describe('calendar basics', () => {
  it.each([
    [2024, true],
    [2023, false],
    [1900, false],
    [2000, true],
  ])('isLeapYear(%i) is %s', (y, leap) => {
    expect(isLeapYear(y)).toBe(leap);
  });

  it('knows month lengths including February', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 12)).toBe(31);
  });
});

describe('parseIsoDate', () => {
  it('accepts real dates', () => {
    expect(parseIsoDate('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
  });

  it.each(['2025-02-29', '2025-13-01', '2025-00-10', '2025-1-1', '20250101', '', '2025-04-31'])(
    'rejects %p',
    (s) => {
      expect(parseIsoDate(s)).toBeNull();
    },
  );
});

describe('month helpers', () => {
  it('parses months', () => {
    expect(parseIsoMonth('2025-07')).toEqual({ y: 2025, m: 7 });
    expect(parseIsoMonth('2025-13')).toBeNull();
  });

  it('adds months across year boundaries', () => {
    expect(addMonthsToMonth('2025-12', 1)).toBe('2026-01');
    expect(addMonthsToMonth('2025-01', -1)).toBe('2024-12');
    expect(addMonthsToMonth('2025-06', -18)).toBe('2023-12');
  });

  it('gives an inclusive month range', () => {
    expect(monthRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(monthRange('2025-11')).toEqual({ start: '2025-11-01', end: '2025-11-30' });
  });

  it('lists the last N months oldest first', () => {
    expect(lastNMonths('2025-02', 3)).toEqual(['2024-12', '2025-01', '2025-02']);
    expect(lastNMonths('2025-02', 12)).toHaveLength(12);
  });

  it('extracts the month of a date', () => {
    expect(monthOf('2025-03-09')).toBe('2025-03');
  });
});

describe('day arithmetic', () => {
  it('adds days across months, years and leap days', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
    expect(addDays('2025-03-01', 365)).toBe('2026-03-01');
  });

  it('is not shifted by a daylight saving change', () => {
    // Toronto springs forward on 2025-03-09 and falls back on 2025-11-02.
    expect(addDays('2025-03-08', 1)).toBe('2025-03-09');
    expect(addDays('2025-03-09', 1)).toBe('2025-03-10');
    expect(addDays('2025-11-01', 2)).toBe('2025-11-03');
    expect(daysBetween('2025-03-01', '2025-03-31')).toBe(30);
  });

  it('counts days between dates', () => {
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
    expect(daysBetween('2025-01-10', '2025-01-01')).toBe(-9);
  });

  it('knows the day of the week', () => {
    expect(dayOfWeek('2023-01-01')).toBe(0);
    expect(dayOfWeek('2026-10-20')).toBe(2);
  });

  it('counts days left in the month including today', () => {
    expect(daysLeftInMonth('2025-01-31')).toBe(1);
    expect(daysLeftInMonth('2025-01-01')).toBe(31);
    expect(daysLeftInMonth('2024-02-10')).toBe(20);
  });

  it('formats a local Date as its calendar day', () => {
    expect(toIsoDate(new Date(2025, 0, 5, 23, 59))).toBe('2025-01-05');
    expect(toIsoDate(new Date(2025, 0, 6, 0, 1))).toBe('2025-01-06');
  });
});

describe('addMonthsClamped', () => {
  it('clamps the 31st to short months', () => {
    expect(addMonthsClamped('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsClamped('2025-03-31', 1)).toBe('2025-04-30');
  });

  it('restores the anchor day after a short month when given one', () => {
    expect(addMonthsClamped('2025-02-28', 1, 31)).toBe('2025-03-31');
  });

  it('handles negative offsets', () => {
    expect(addMonthsClamped('2025-03-31', -1)).toBe('2025-02-28');
  });
});
