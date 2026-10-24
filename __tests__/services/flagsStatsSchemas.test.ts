import { assignVariant, bucketFor, fnv1a } from '@/flags/assign';
import { onboardingFlag, type FlagDefinition } from '@/flags/definitions';
import { median, percentile, summarizeTimings } from '@/services/stats';
import { budgetLimitSchema, categorySchema, transactionFormSchema } from '@/types/schemas';

describe('flag assignment', () => {
  it('hashes stably (FNV-1a reference values)', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('gives the same install the same variant every time', () => {
    const v = assignVariant('install-123', onboardingFlag);
    for (let i = 0; i < 5; i++) expect(assignVariant('install-123', onboardingFlag)).toBe(v);
  });

  it('splits installs close to the configured weights', () => {
    let a = 0;
    for (let i = 0; i < 10000; i++) if (assignVariant(`id-${i}`, onboardingFlag) === 'A') a++;
    expect(a).toBeGreaterThan(4700);
    expect(a).toBeLessThan(5300);
  });

  it('assigns different flags independently', () => {
    const other = { ...onboardingFlag, key: 'other_flag' };
    let same = 0;
    for (let i = 0; i < 2000; i++) {
      if (assignVariant(`id-${i}`, onboardingFlag) === assignVariant(`id-${i}`, other)) same++;
    }
    expect(same).toBeGreaterThan(850);
    expect(same).toBeLessThan(1150);
  });

  it('keeps buckets in 0-99', () => {
    for (let i = 0; i < 500; i++) {
      const b = bucketFor(`x${i}`, 'k');
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  it('honours uneven weights and rejects bad definitions', () => {
    const all: FlagDefinition<'on' | 'off'> = {
      key: 'k',
      description: '',
      variants: ['on', 'off'],
      weights: [100, 0],
      defaultVariant: 'off',
    };
    expect(assignVariant('anything', all)).toBe('on');
    expect(() => assignVariant('x', { ...all, weights: [50, 40] })).toThrow();
  });
});

describe('stats', () => {
  it('computes median and nearest-rank p95', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(hundred, 95)).toBe(95);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([], 95)).toBeNull();
    expect(() => percentile([1], 101)).toThrow();
  });

  it('summarises timings by name', () => {
    expect(
      summarizeTimings([
        { name: 'cold_start', ms: 100 },
        { name: 'cold_start', ms: 300 },
        { name: 'insights_load', ms: 50 },
      ]),
    ).toEqual([
      { name: 'cold_start', count: 2, medianMs: 200, p95Ms: 300 },
      { name: 'insights_load', count: 1, medianMs: 50, p95Ms: 50 },
    ]);
  });
});

describe('transaction form schema', () => {
  const schema = transactionFormSchema('2025-06-15');
  const base = {
    amount: '12.50',
    kind: 'expense' as const,
    categoryId: 1,
    date: '2025-06-15',
    note: ' lunch ',
    merchant: '',
  };

  it('turns an expense into negative cents and trims text', () => {
    expect(schema.parse(base)).toEqual({
      amountCents: -1250,
      date: '2025-06-15',
      categoryId: 1,
      note: 'lunch',
      merchant: '',
    });
    expect(schema.parse({ ...base, kind: 'income' }).amountCents).toBe(1250);
  });

  it.each([
    [{ amount: '' }, 'Enter an amount'],
    [{ amount: 'abc' }, 'Enter an amount like 12.50'],
    [{ amount: '0' }, 'Amount cannot be zero'],
    [{ amount: '-5' }, 'Enter a positive amount and choose expense or income'],
    [{ date: '2026-06-16' }, 'Date is more than a year in the future'],
    [{ date: '2025-02-30' }, 'Enter a valid date'],
    [{ categoryId: 0 }, 'Choose a category'],
  ])('rejects %p with a clear message', (patch, message) => {
    const r = schema.safeParse({ ...base, ...patch });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(message);
  });

  it('accepts a date exactly one year ahead', () => {
    expect(schema.safeParse({ ...base, date: '2026-06-15' }).success).toBe(true);
  });
});

describe('other schemas', () => {
  it('parses budget limits', () => {
    expect(budgetLimitSchema().parse('400')).toBe(40000);
    expect(budgetLimitSchema().safeParse('0').success).toBe(false);
  });

  it('validates categories', () => {
    expect(
      categorySchema.safeParse({ name: ' ', color: '#000000', icon: 'x', isIncome: false }).success,
    ).toBe(false);
    expect(
      categorySchema.safeParse({ name: 'Pets', color: 'red', icon: 'x', isIncome: false }).success,
    ).toBe(false);
    expect(
      categorySchema.parse({ name: ' Pets ', color: '#AABBCC', icon: 'x', isIncome: false }).name,
    ).toBe('Pets');
  });
});
