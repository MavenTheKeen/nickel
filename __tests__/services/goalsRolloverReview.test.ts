import { goalProgress, monthsUntil } from '@/services/goalMath';
import { buildReview, reviewText, type ReviewInput } from '@/services/review';
import { carryInto } from '@/services/rollover';

describe('carryInto', () => {
  it('adds up what was left over in consecutive periods', () => {
    const history = [
      { month: '2025-04', limitCents: 10000, spentCents: 7000 },
      { month: '2025-05', limitCents: 10000, spentCents: 9000 },
    ];
    expect(carryInto(history, '2025-06')).toBe(4000);
  });

  it('carries overspending as a negative amount', () => {
    expect(carryInto([{ month: '2025-05', limitCents: 10000, spentCents: 13000 }], '2025-06')).toBe(
      -3000,
    );
  });

  it('starts fresh after a period without a limit', () => {
    const history = [
      { month: '2025-03', limitCents: 10000, spentCents: 0 },
      { month: '2025-05', limitCents: 10000, spentCents: 8000 },
    ];
    expect(carryInto(history, '2025-06')).toBe(2000);
    expect(carryInto(history.slice(0, 1), '2025-06')).toBe(0);
  });

  it('ignores the target period and later ones, in any order', () => {
    const history = [
      { month: '2025-07', limitCents: 1, spentCents: 0 },
      { month: '2025-06', limitCents: 5, spentCents: 0 },
      { month: '2025-05', limitCents: 100, spentCents: 40 },
      { month: '2025-04', limitCents: 100, spentCents: 90 },
    ];
    expect(carryInto(history, '2025-06')).toBe(70);
  });

  it('crosses year boundaries', () => {
    expect(carryInto([{ month: '2024-12', limitCents: 500, spentCents: 100 }], '2025-01')).toBe(
      400,
    );
  });
});

describe('goalProgress', () => {
  const base = { targetCents: 120000, createdAt: '2025-01-01T09:00:00.000Z' };

  it('counts the current month in the months left', () => {
    expect(monthsUntil('2025-06-15', '2025-08-01')).toBe(3);
    expect(monthsUntil('2025-06-15', '2025-06-30')).toBe(1);
    expect(monthsUntil('2025-06-15', '2025-05-01')).toBe(0);
  });

  it('works out the monthly amount, rounded up to the cent', () => {
    const p = goalProgress({ ...base, targetDate: '2025-12-31', savedCents: 70000 }, '2025-07-01');
    expect(p).toMatchObject({
      remainingCents: 50000,
      percent: 58,
      monthsLeft: 6,
      perMonthCents: 8334,
    });
  });

  it('is on track when savings are at or above a straight line from the start', () => {
    const target = { ...base, targetDate: '2026-01-01' };
    expect(goalProgress({ ...target, savedCents: 60000 }, '2025-07-02').status).toBe('on_track');
    expect(goalProgress({ ...target, savedCents: 20000 }, '2025-07-02').status).toBe('behind');
  });

  it('reports done, overdue and goals without a date', () => {
    expect(
      goalProgress({ ...base, targetDate: null, savedCents: 130000 }, '2025-06-01'),
    ).toMatchObject({ status: 'done', percent: 100, remainingCents: 0 });
    expect(goalProgress({ ...base, targetDate: null, savedCents: 0 }, '2025-06-01').status).toBe(
      'no_date',
    );
    expect(
      goalProgress({ ...base, targetDate: '2025-05-01', savedCents: 1000 }, '2025-06-01'),
    ).toMatchObject({ status: 'overdue', perMonthCents: 119000 });
  });

  it('treats a goal with net withdrawals as nothing saved', () => {
    expect(
      goalProgress({ ...base, targetDate: null, savedCents: -500 }, '2025-06-01').percent,
    ).toBe(0);
  });
});

describe('buildReview', () => {
  const input: ReviewInput = {
    month: '2025-06',
    spentCents: 150000,
    incomeCents: 260000,
    prevSpentCents: 120000,
    byCategory: [
      { categoryId: 1, spentCents: 60000 },
      { categoryId: 2, spentCents: 40000 },
    ],
    prevByCategory: [
      { categoryId: 1, spentCents: 30000 },
      { categoryId: 3, spentCents: 5000 },
    ],
    topMerchant: { merchant: 'Loblaws', spentCents: 30000, count: 6 },
    largest: { id: 7, merchant: '', note: 'Flights', categoryId: 2, amountCents: -40000 },
    budgets: [
      { categoryId: 1, limitCents: 50000, spentCents: 60000 },
      { categoryId: 2, limitCents: 50000, spentCents: 40000 },
    ],
    byWeekday: [100, 0, 0, 0, 0, 300, 600],
    goalContributedCents: 20000,
    transactionCount: 40,
  };

  it('builds every card that has something to say', () => {
    expect(buildReview(input)).toEqual([
      {
        kind: 'total',
        spentCents: 150000,
        incomeCents: 260000,
        netCents: 110000,
        changePercent: 25,
      },
      // Category 2 rose by 400.00 and category 1 by 300.00.
      { kind: 'change', categoryId: 2, nowCents: 40000, prevCents: 0, deltaCents: 40000 },
      { kind: 'merchant', merchant: 'Loblaws', spentCents: 30000, count: 6 },
      { kind: 'budgets', kept: 1, total: 2, overCategoryId: 1, overByCents: 10000 },
      { kind: 'weekday', weekday: 6, spentCents: 600, sharePercent: 60 },
      { kind: 'largest', id: 7, title: 'Flights', categoryId: 2, amountCents: -40000 },
      { kind: 'goals', contributedCents: 20000 },
    ]);
  });

  it('leaves out cards without data and is empty for an empty period', () => {
    const sparse = buildReview({
      ...input,
      prevSpentCents: null,
      topMerchant: null,
      largest: null,
      budgets: [],
      byWeekday: [0, 0, 0, 0, 0, 0, 0],
      goalContributedCents: 0,
    });
    expect(sparse.map((c) => c.kind)).toEqual(['total']);
    expect(sparse[0]).toMatchObject({ changePercent: null });
    expect(buildReview({ ...input, transactionCount: 0 })).toEqual([]);
  });

  it('skips the change card when no category moved by at least 10.00', () => {
    const cards = buildReview({
      ...input,
      byCategory: [{ categoryId: 1, spentCents: 30500 }],
      prevByCategory: [{ categoryId: 1, spentCents: 30000 }],
    });
    expect(cards.some((c) => c.kind === 'change')).toBe(false);
  });

  it('writes a plain-text summary for sharing', () => {
    const text = reviewText(buildReview(input), {
      period: 'June 2025',
      money: (c) => `$${(c / 100).toFixed(2)}`,
      category: (id) => `Cat${id}`,
      weekday: (d) =>
        ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]!,
    });
    expect(text.split('\n')).toEqual([
      'Nickel review: June 2025',
      'Spent $1500.00, 25% more than the period before.',
      'Cat2: $400.00 more than the period before.',
      'Top merchant: Loblaws, $300.00.',
      'Budgets kept: 1 of 2.',
      'Most spending on Saturdays (60%).',
      'Largest expense: Flights, $400.00.',
      'Put $200.00 towards goals.',
    ]);
  });
});
