import {
  budgetProgress,
  crossedThresholds,
  levelFor,
  netSpent,
  percentUsed,
  safeToSpendToday,
} from '@/services/budgetMath';

describe('percentUsed', () => {
  it('floors so 80% is not reported a cent early', () => {
    expect(percentUsed(7999, 10000)).toBe(79);
    expect(percentUsed(8000, 10000)).toBe(80);
    expect(percentUsed(10000, 10000)).toBe(100);
    expect(percentUsed(15000, 10000)).toBe(150);
  });

  it('treats negative spending (net refunds) as zero', () => {
    expect(percentUsed(-500, 10000)).toBe(0);
  });

  it('handles a zero limit', () => {
    expect(percentUsed(0, 0)).toBe(0);
    expect(percentUsed(1, 0)).toBe(Infinity);
  });
});

describe('levels', () => {
  it.each([
    [0, 'ok'],
    [79, 'ok'],
    [80, 'warn'],
    [99, 'warn'],
    [100, 'over'],
    [250, 'over'],
  ] as const)('%i%% is %s', (p, level) => {
    expect(levelFor(p)).toBe(level);
  });

  it('builds a progress summary', () => {
    expect(budgetProgress(8500, 10000)).toEqual({
      limitCents: 10000,
      spentCents: 8500,
      remainingCents: 1500,
      percent: 85,
      level: 'warn',
    });
    expect(budgetProgress(12000, 10000).remainingCents).toBe(-2000);
  });
});

describe('crossedThresholds', () => {
  it('reports a newly crossed 80%', () => {
    expect(crossedThresholds(7000, 8000, 10000)).toEqual([80]);
  });

  it('reports both when one expense jumps past 100%', () => {
    expect(crossedThresholds(5000, 11000, 10000)).toEqual([80, 100]);
  });

  it('reports nothing when already past or when spending falls', () => {
    expect(crossedThresholds(8500, 9000, 10000)).toEqual([]);
    expect(crossedThresholds(9000, 7000, 10000)).toEqual([]);
    expect(crossedThresholds(12000, 13000, 10000)).toEqual([]);
  });
});

describe('safeToSpendToday', () => {
  it('divides what is left over the remaining days, today included', () => {
    // 30-day month, the 21st: 10 days left including today.
    expect(
      safeToSpendToday({ totalLimitCents: 100000, totalSpentCents: 50000, today: '2025-06-21' }),
    ).toBe(5000);
  });

  it('gives the whole remainder on the last day', () => {
    expect(
      safeToSpendToday({ totalLimitCents: 100000, totalSpentCents: 99000, today: '2025-06-30' }),
    ).toBe(1000);
  });

  it('floors to whole cents', () => {
    expect(
      safeToSpendToday({ totalLimitCents: 1000, totalSpentCents: 0, today: '2025-06-28' }),
    ).toBe(333);
  });

  it('is zero when over budget or without a budget', () => {
    expect(
      safeToSpendToday({ totalLimitCents: 1000, totalSpentCents: 2000, today: '2025-06-01' }),
    ).toBe(0);
    expect(safeToSpendToday({ totalLimitCents: 0, totalSpentCents: 0, today: '2025-06-01' })).toBe(
      0,
    );
  });

  it('uses 29 days in a leap February', () => {
    expect(
      safeToSpendToday({ totalLimitCents: 2900, totalSpentCents: 0, today: '2024-02-01' }),
    ).toBe(100);
  });
});

describe('netSpent', () => {
  it('nets refunds against expenses, never below zero', () => {
    expect(netSpent([-5000, -3000, 1000])).toBe(7000);
    expect(netSpent([2000])).toBe(0);
    expect(netSpent([])).toBe(0);
  });
});
