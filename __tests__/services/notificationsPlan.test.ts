import {
  nextSunday,
  planNotifications,
  toLocalDate,
  weeklyBudgetShare,
  type PlanInput,
} from '@/notifications/plan';
import type { RecurringRule } from '@/types/domain';

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 1,
  amountCents: -150000,
  categoryId: 2,
  cadence: 'monthly',
  anchorDate: '2025-01-31',
  nextIndex: 5,
  nextDue: '2025-06-30',
  note: '',
  merchant: 'Landlord',
  active: true,
  ...over,
});

const base: PlanInput = {
  today: '2025-06-20', // a Friday
  nowMinutes: 12 * 60,
  rules: [rule()],
  categoryNames: new Map([[2, 'Rent']]),
  currencySymbol: '$',
  notifyBills: true,
  notifyWeekly: true,
  weekly: { spentCents: 12000, budgetCents: 20000 },
};

describe('planNotifications', () => {
  it('reminds the day before each due date within the horizon', () => {
    const bills = planNotifications({ ...base, notifyWeekly: false });
    expect(bills.map((b) => b.at.date)).toEqual(['2025-06-29', '2025-07-30']);
    expect(bills[0]).toMatchObject({
      id: 'bill-1-2025-06-30',
      title: 'Landlord is due tomorrow',
      body: '$1,500.00 on 2025-06-30',
      at: { hour: 9, minute: 0 },
    });
  });

  it('skips a reminder whose time already passed today', () => {
    const plan = planNotifications({
      ...base,
      notifyWeekly: false,
      today: '2025-06-29',
      nowMinutes: 10 * 60,
    });
    expect(plan.map((p) => p.at.date)).toEqual(['2025-07-30']);
    const early = planNotifications({
      ...base,
      notifyWeekly: false,
      today: '2025-06-29',
      nowMinutes: 8 * 60,
    });
    expect(early[0]!.at.date).toBe('2025-06-29');
  });

  it('falls back to the category name when the bill has no name', () => {
    const plan = planNotifications({
      ...base,
      notifyWeekly: false,
      rules: [rule({ merchant: '' })],
    });
    expect(plan[0]!.title).toBe('Rent is due tomorrow');
  });

  it('respects the toggles and inactive rules', () => {
    expect(planNotifications({ ...base, notifyBills: false, notifyWeekly: false })).toEqual([]);
    expect(
      planNotifications({ ...base, notifyWeekly: false, rules: [rule({ active: false })] }),
    ).toEqual([]);
  });

  it('schedules the weekly summary on Sunday evening with the budget comparison', () => {
    const weekly = planNotifications({ ...base, notifyBills: false });
    expect(weekly).toEqual([
      expect.objectContaining({
        id: 'weekly-summary',
        body: 'You spent $120.00 this week, $80.00 under budget.',
        at: { date: '2025-06-22', hour: 18, minute: 0 },
      }),
    ]);
  });

  it('says over budget and omits the budget part without one', () => {
    const over = planNotifications({
      ...base,
      notifyBills: false,
      weekly: { spentCents: 30000, budgetCents: 20000 },
    });
    expect(over[0]!.body).toBe('You spent $300.00 this week, $100.00 over budget.');
    const none = planNotifications({
      ...base,
      notifyBills: false,
      weekly: { spentCents: 500, budgetCents: 0 },
    });
    expect(none[0]!.body).toBe('You spent $5.00 this week.');
  });

  it('moves the summary to next week once Sunday evening has passed', () => {
    const plan = planNotifications({
      ...base,
      notifyBills: false,
      today: '2025-06-22',
      nowMinutes: 19 * 60,
    });
    expect(plan[0]!.at.date).toBe('2025-06-29');
  });

  it('keeps ids stable so rescheduling replaces rather than duplicates', () => {
    const a = planNotifications(base).map((p) => p.id);
    const b = planNotifications(base).map((p) => p.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe('helpers', () => {
  it('finds the next Sunday', () => {
    expect(nextSunday('2025-06-20')).toBe('2025-06-22');
    expect(nextSunday('2025-06-22')).toBe('2025-06-22');
  });

  it('builds a local wall-clock Date, unaffected by daylight saving', () => {
    // 2025-03-09 is the spring-forward day in Toronto; 9:00 still means 9:00.
    const d = toLocalDate({ date: '2025-03-09', hour: 9, minute: 0 });
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2025, 3, 9, 9, 0,
    ]);
  });

  it('prorates a monthly budget to a week', () => {
    expect(weeklyBudgetShare(30000, 30)).toBe(7000);
    expect(weeklyBudgetShare(100, 31)).toBe(22);
  });
});
