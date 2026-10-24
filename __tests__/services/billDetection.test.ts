import { detectBills, suggestionKey } from '@/services/billDetection';
import type { Transaction } from '@/types/domain';

let nextId = 1;
function t(date: string, merchant: string, amountCents: number, extra: Partial<Transaction> = {}) {
  return {
    id: nextId++,
    amountCents,
    date,
    categoryId: 5,
    note: '',
    merchant,
    recurringId: null,
    importBatchId: null,
    receipt: null,
    original: null,
    createdAt: 'x',
    ...extra,
  } satisfies Transaction;
}

const TODAY = '2025-06-20';
const none = { rules: [], dismissed: new Set<string>(), today: TODAY };

const netflix = [
  t('2025-03-03', 'NETFLIX.COM 866', -1649),
  t('2025-04-03', 'Netflix.com', -1649),
  t('2025-05-05', 'NETFLIX.COM', -1649),
  t('2025-06-03', 'NETFLIX.COM', -1799),
];

describe('detectBills', () => {
  it('finds a monthly bill and starts it at the next expected date', () => {
    const [s, ...rest] = detectBills({ ...none, transactions: netflix });
    expect(rest).toHaveLength(0);
    expect(s).toMatchObject({
      merchant: 'NETFLIX.COM',
      amountCents: -1799,
      cadence: 'monthly',
      lastDate: '2025-06-03',
      nextDate: '2025-07-03',
      occurrences: 4,
    });
  });

  it('finds weekly and yearly series', () => {
    const weekly = ['2025-05-23', '2025-05-30', '2025-06-06', '2025-06-13', '2025-06-20'].map((d) =>
      t(d, 'Cleaner', -6000),
    );
    const yearly = [
      t('2023-07-01', 'Domain renewal', -2000),
      t('2024-07-01', 'Domain renewal', -2000),
    ];
    const found = detectBills({ ...none, transactions: [...weekly, ...yearly] });
    expect(found.map((s) => [s.merchant, s.cadence, s.nextDate])).toEqual([
      ['Cleaner', 'weekly', '2025-06-27'],
      ['Domain renewal', 'yearly', '2025-07-01'],
    ]);
  });

  it('detects regular income separately from charges', () => {
    const pay = ['2025-04-01', '2025-05-01', '2025-06-01'].map((d) => t(d, 'Employer', 250000));
    const [s] = detectBills({ ...none, transactions: pay });
    expect(s).toMatchObject({ amountCents: 250000, key: 'employer|in' });
  });

  it('ignores irregular spending at the same shop', () => {
    const coffee = ['2025-05-01', '2025-05-02', '2025-05-19', '2025-06-11', '2025-06-12'].map((d) =>
      t(d, 'Cafe', -450),
    );
    expect(detectBills({ ...none, transactions: coffee })).toEqual([]);
  });

  it('ignores a series that has stopped', () => {
    const old = ['2025-01-10', '2025-02-10', '2025-03-10'].map((d) => t(d, 'Old gym', -4000));
    expect(detectBills({ ...none, transactions: old })).toEqual([]);
  });

  it('needs three monthly payments', () => {
    expect(detectBills({ ...none, transactions: netflix.slice(2) })).toEqual([]);
  });

  it('ignores one-off amounts that differ a lot from the usual charge', () => {
    const withExtra = [...netflix, t('2025-05-20', 'Netflix.com', -9000)];
    expect(detectBills({ ...none, transactions: withExtra })[0]?.occurrences).toBe(4);
  });

  it('skips merchants that already have a bill, were dismissed, or are linked to a bill', () => {
    const key = suggestionKey('NETFLIX.COM', -1);
    expect(
      detectBills({
        ...none,
        transactions: netflix,
        rules: [{ merchant: 'Netflix', amountCents: -1649 }],
      }),
    ).toEqual([]);
    expect(detectBills({ ...none, transactions: netflix, dismissed: new Set([key]) })).toEqual([]);
    const linked = netflix.map((x, i) => (i === 0 ? { ...x, recurringId: 3 } : x));
    expect(detectBills({ ...none, transactions: linked })).toEqual([]);
  });

  it('moves the start past today when the expected date has already gone by', () => {
    const late = [
      t('2025-03-10', 'Phone', -5000),
      t('2025-04-10', 'Phone', -5000),
      t('2025-05-10', 'Phone', -5000),
    ];
    expect(detectBills({ ...none, transactions: late })[0]?.nextDate).toBe('2025-07-10');
  });
});
