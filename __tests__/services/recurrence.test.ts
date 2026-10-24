import {
  cadenceLabel,
  dueOccurrences,
  occurrenceAt,
  occurrencesBetween,
} from '@/services/recurrence';

describe('occurrenceAt', () => {
  it('steps weekly by seven days', () => {
    expect(occurrenceAt('2025-01-01', 'weekly', 0)).toBe('2025-01-01');
    expect(occurrenceAt('2025-01-01', 'weekly', 1)).toBe('2025-01-08');
    expect(occurrenceAt('2025-12-29', 'weekly', 1)).toBe('2026-01-05');
  });

  it('keeps a bill on the 31st at month end in 30-day months', () => {
    const dates = [0, 1, 2, 3, 4, 5].map((i) => occurrenceAt('2025-01-31', 'monthly', i));
    expect(dates).toEqual([
      '2025-01-31',
      '2025-02-28',
      '2025-03-31',
      '2025-04-30',
      '2025-05-31',
      '2025-06-30',
    ]);
  });

  it('uses Feb 29 in leap years for a monthly bill on the 30th', () => {
    expect(occurrenceAt('2024-01-30', 'monthly', 1)).toBe('2024-02-29');
    expect(occurrenceAt('2024-01-30', 'monthly', 2)).toBe('2024-03-30');
  });

  it('moves a Feb 29 yearly bill to Feb 28 in common years and back', () => {
    expect(occurrenceAt('2024-02-29', 'yearly', 1)).toBe('2025-02-28');
    expect(occurrenceAt('2024-02-29', 'yearly', 4)).toBe('2028-02-29');
  });

  it('rejects bad input', () => {
    expect(() => occurrenceAt('2025-02-30', 'monthly', 0)).toThrow();
    expect(() => occurrenceAt('2025-01-01', 'monthly', -1)).toThrow();
  });
});

describe('dueOccurrences', () => {
  it('lists everything due up to and including today', () => {
    expect(dueOccurrences('2025-01-15', 'monthly', 0, '2025-03-15')).toEqual([
      { index: 0, date: '2025-01-15' },
      { index: 1, date: '2025-02-15' },
      { index: 2, date: '2025-03-15' },
    ]);
  });

  it('starts from the given index', () => {
    expect(dueOccurrences('2025-01-15', 'monthly', 2, '2025-03-20')).toEqual([
      { index: 2, date: '2025-03-15' },
    ]);
  });

  it('returns nothing before the first due date', () => {
    expect(dueOccurrences('2025-05-01', 'weekly', 0, '2025-04-30')).toEqual([]);
  });

  it('caps catch-up work', () => {
    expect(dueOccurrences('2000-01-01', 'weekly', 0, '2025-01-01', 10)).toHaveLength(10);
  });
});

describe('occurrencesBetween', () => {
  it('finds bills in the next 7 days', () => {
    expect(occurrencesBetween('2025-01-03', 'weekly', 0, '2025-01-09', '2025-01-16')).toEqual([
      { index: 1, date: '2025-01-10' },
    ]);
  });
});

it('labels cadences', () => {
  expect(cadenceLabel('weekly')).toBe('Every week');
});
