import {
  clampStartDay,
  daysLeftInPeriod,
  periodLength,
  periodOf,
  periodRange,
  periodShiftModifier,
} from '@/services/dates';
import { formatPeriod, formatShortDate, numberFormatFrom } from '@/services/format';
import { safeToSpendToday } from '@/services/budgetMath';
import { formatCents, parseMoneyInput } from '@/services/money';

describe('budget periods', () => {
  it('are calendar months when they start on the 1st', () => {
    expect(periodRange('2025-02', 1)).toEqual({ start: '2025-02-01', end: '2025-02-28' });
    expect(periodOf('2025-02-28', 1)).toBe('2025-02');
  });

  it('run from the start day to the day before it next month', () => {
    expect(periodRange('2025-06', 15)).toEqual({ start: '2025-06-15', end: '2025-07-14' });
    expect(periodRange('2025-01', 28)).toEqual({ start: '2025-01-28', end: '2025-02-27' });
    expect(periodRange('2025-12', 25)).toEqual({ start: '2025-12-25', end: '2026-01-24' });
  });

  it('assign each date to exactly one period', () => {
    expect(periodOf('2025-06-14', 15)).toBe('2025-05');
    expect(periodOf('2025-06-15', 15)).toBe('2025-06');
    expect(periodOf('2026-01-10', 25)).toBe('2025-12');
    for (const date of ['2025-03-01', '2025-03-14', '2025-03-15', '2025-03-31']) {
      const p = periodOf(date, 15);
      const { start, end } = periodRange(p, 15);
      expect(date >= start && date <= end).toBe(true);
    }
  });

  it('count days left and period length', () => {
    expect(daysLeftInPeriod('2025-07-14', 15)).toBe(1);
    expect(daysLeftInPeriod('2025-06-15', 15)).toBe(30);
    expect(periodLength('2025-01', 15)).toBe(31);
    expect(periodLength('2025-02', 15)).toBe(28);
  });

  it('clamp the start day to 1-28 and build the SQL modifier', () => {
    expect(clampStartDay(0)).toBe(1);
    expect(clampStartDay(31)).toBe(28);
    expect(clampStartDay(Number.NaN)).toBe(1);
    expect(periodShiftModifier(15)).toBe('-14 days');
    expect(periodShiftModifier(1)).toBe('-0 days');
  });

  it('drive safe to spend', () => {
    // Period 15 Jun - 14 Jul; on 5 Jul there are 10 days left.
    expect(
      safeToSpendToday({
        totalLimitCents: 10000,
        totalSpentCents: 5000,
        today: '2025-07-05',
        startDay: 15,
      }),
    ).toBe(500);
  });
});

describe('locale formatting', () => {
  it('formats money with the device separators', () => {
    expect(formatCents(123456, { symbol: '€', decimal: ',', group: '.' })).toBe('€1.234,56');
    expect(formatCents(123456, { group: ' ' })).toBe('$1 234.56');
    expect(formatCents(123456, { group: '' })).toBe('$1234.56');
  });

  it('accepts both the locale decimal and a plain point when typing', () => {
    expect(parseMoneyInput('12,50', ',')).toBe(1250);
    expect(parseMoneyInput('12.50', ',')).toBe(1250);
    expect(parseMoneyInput('12,50', '.')).toBeNull();
  });

  it('normalises what the OS reports', () => {
    expect(numberFormatFrom(',', '.')).toEqual({ decimal: ',', group: '.' });
    expect(numberFormatFrom('.', '.')).toEqual({ decimal: '.', group: '' });
    expect(numberFormatFrom(undefined, undefined)).toEqual({ decimal: '.', group: ',' });
    expect(numberFormatFrom(',', '\u202f').group).toBe(' ');
  });

  it('formats dates and periods for the locale', () => {
    expect(formatShortDate('2026-06-05', 'en-US', 2026)).toBe('Jun 5');
    expect(formatShortDate('2025-06-05', 'en-US', 2026)).toBe('Jun 5, 2025');
    expect(formatShortDate('2026-06-05', 'de-DE', 2026)).toBe('5. Juni');
    expect(formatPeriod('2025-06', 1, 'en-US')).toBe('June 2025');
    expect(formatPeriod('2025-06', 15, 'en-GB')).toBe('15 Jun – 14 Jul 2025');
    expect(formatShortDate('not a date', 'en-US', 2026)).toBe('not a date');
  });
});
