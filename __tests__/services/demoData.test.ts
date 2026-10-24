import { DEFAULT_CATEGORIES } from '@/db/repositories/categories';
import { generateDemoTransactions, seededRandom } from '@/services/demoData';
import { transactionSchema } from '@/types/schemas';
import type { Category } from '@/types/domain';

const categories: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({
  ...c,
  id: i + 1,
  archived: false,
  sortOrder: i,
  rollover: false,
}));

describe('demo data', () => {
  it('is deterministic for a seed', () => {
    const a = generateDemoTransactions({ categories, today: '2025-06-30', count: 50, seed: 7 });
    const b = generateDemoTransactions({ categories, today: '2025-06-30', count: 50, seed: 7 });
    const c = generateDemoTransactions({ categories, today: '2025-06-30', count: 50, seed: 8 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('produces rows that pass the same validation as user input', () => {
    const schema = transactionSchema('2025-06-30');
    const rows = generateDemoTransactions({ categories, today: '2025-06-30', count: 500 });
    expect(rows.every((r) => schema.safeParse(r).success)).toBe(true);
    expect(rows.every((r) => r.date <= '2025-06-30' && r.date > '2024-06-30')).toBe(true);
  });

  it('includes a salary every two weeks', () => {
    const rows = generateDemoTransactions({ categories, today: '2025-06-30', count: 0, days: 28 });
    expect(rows.map((r) => r.date)).toEqual(['2025-06-30', '2025-06-16']);
  });

  it('gives values in [0, 1)', () => {
    const r = seededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('demo subscriptions', () => {
  it('adds monthly charges that bill detection can find', () => {
    const rows = generateDemoTransactions({
      categories,
      today: '2025-06-30',
      count: 0,
      days: 120,
      subscriptions: true,
    });
    const netflix = rows.filter((r) => r.merchant === 'NETFLIX.COM').map((r) => r.date);
    expect(netflix).toEqual(['2025-03-03', '2025-04-03', '2025-05-03', '2025-06-03']);
  });
});
