import type { HomeData } from '@/hooks/loaders';
import { widgetSummary } from '@/widget/summary';

const home = (over: Partial<HomeData> = {}): HomeData => ({
  month: '2025-06',
  hasBudgets: true,
  totalLimitCents: 30000,
  budgetedSpentCents: 10000,
  monthExpenseCents: 14000,
  monthIncomeCents: 0,
  safeToSpendCents: 2000,
  recent: [],
  upcoming: [],
  ...over,
});

const money = { symbol: '$' };

describe('widget summary', () => {
  it('shows safe to spend with progress', () => {
    expect(widgetSummary(home(), { locked: false, money })).toEqual({
      label: 'Safe to spend today',
      value: '$20.00',
      detail: '$100.00 of $300.00 spent',
      problem: false,
    });
  });

  it('marks nothing left as a problem', () => {
    expect(widgetSummary(home({ safeToSpendCents: 0 }), { locked: false, money }).problem).toBe(
      true,
    );
  });

  it('shows spending when there is no budget', () => {
    expect(widgetSummary(home({ hasBudgets: false }), { locked: false, money })).toMatchObject({
      label: 'Spent this month',
      value: '$140.00',
    });
  });

  it('hides amounts when the app lock is on', () => {
    const s = widgetSummary(home(), { locked: true, money });
    expect(s.value).toBe('Locked');
    expect(JSON.stringify(s)).not.toMatch(/\$/);
  });

  it('uses the device number format', () => {
    const s = widgetSummary(home({ safeToSpendCents: 123456 }), {
      locked: false,
      money: { symbol: '€', decimal: ',', group: '.' },
    });
    expect(s.value).toBe('€1.234,56');
  });
});
