import type { Category, IsoDate, NewTransaction } from '@/types/domain';

import { addDays, addMonthsClamped } from './dates';

/** Mulberry32: tiny seeded PRNG so demo data is identical on every run. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MERCHANTS: Record<string, readonly string[]> = {
  Groceries: ['Loblaws', 'No Frills', 'Metro', 'FreshCo'],
  Transport: ['TTC', 'Presto', 'Uber', 'Shell'],
  'Eating out': ['Tim Hortons', 'Pizza Pizza', 'Sushi Bar', 'Cafe'],
  Shopping: ['Amazon', 'Winners', 'Indigo'],
  Health: ['Shoppers Drug Mart', 'Dentist'],
  Fun: ['Cineplex', 'Steam', 'Spotify'],
  Bills: ['Rogers', 'Toronto Hydro', 'Enbridge'],
  Other: ['Etsy', 'Post office'],
};

const RANGES: Record<string, [number, number]> = {
  Groceries: [800, 12000],
  Transport: [330, 4500],
  'Eating out': [400, 6000],
  Shopping: [1000, 15000],
  Health: [800, 20000],
  Fun: [500, 8000],
  Bills: [3000, 15000],
  Other: [200, 5000],
};

/** Monthly charges added when `subscriptions` is on, so bill detection has something to find. */
const SUBSCRIPTIONS: readonly { merchant: string; category: string; cents: number; day: number }[] =
  [
    { merchant: 'NETFLIX.COM', category: 'Fun', cents: -1649, day: 3 },
    { merchant: 'Spotify P0042', category: 'Fun', cents: -1199, day: 12 },
    { merchant: 'Rogers Wireless', category: 'Bills', cents: -6500, day: 20 },
  ];

/**
 * `count` realistic transactions spread over the `days` days ending at
 * `today`, plus a salary every two weeks and, optionally, monthly
 * subscriptions. Deterministic for a given seed.
 */
export function generateDemoTransactions(params: {
  categories: readonly Category[];
  today: IsoDate;
  count: number;
  days?: number;
  seed?: number;
  subscriptions?: boolean;
}): NewTransaction[] {
  const rand = seededRandom(params.seed ?? 42);
  const days = params.days ?? 365;
  const expense = params.categories.filter((c) => !c.isIncome && !c.archived && RANGES[c.name]);
  const salary = params.categories.find((c) => c.isIncome && !c.archived);
  if (expense.length === 0) return [];
  const out: NewTransaction[] = [];
  for (let i = 0; i < params.count; i++) {
    const cat = expense[Math.floor(rand() * expense.length)]!;
    const [lo, hi] = RANGES[cat.name]!;
    const merchants = MERCHANTS[cat.name] ?? [''];
    out.push({
      amountCents: -Math.round(lo + rand() * (hi - lo)),
      date: addDays(params.today, -Math.floor(rand() * days)),
      categoryId: cat.id,
      merchant: merchants[Math.floor(rand() * merchants.length)]!,
      note: '',
    });
  }
  if (salary) {
    for (let d = 0; d < days; d += 14) {
      out.push({
        amountCents: 260000,
        date: addDays(params.today, -d),
        categoryId: salary.id,
        merchant: 'Employer',
        note: 'Pay',
      });
    }
  }
  if (params.subscriptions) {
    const first = addDays(params.today, -days + 1);
    for (const sub of SUBSCRIPTIONS) {
      const cat = params.categories.find((c) => c.name === sub.category && !c.archived);
      if (!cat) continue;
      for (let m = -Math.ceil(days / 28); m <= 0; m++) {
        const date =
          addMonthsClamped(`${params.today.slice(0, 8)}01`, m, 1).slice(0, 8) +
          String(sub.day).padStart(2, '0');
        if (date < first || date > params.today) continue;
        out.push({
          amountCents: sub.cents,
          date,
          categoryId: cat.id,
          merchant: sub.merchant,
          note: '',
        });
      }
    }
  }
  return out;
}
