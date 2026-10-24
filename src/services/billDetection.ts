import type { Cadence, IsoDate, RecurringRule, Transaction } from '@/types/domain';

import { daysBetween } from './dates';
import { keyContains, merchantKey } from './merchant';
import { occurrenceAt } from './recurrence';
import { median } from './stats';

// Finds bills hiding in past transactions: the same merchant, a similar
// amount, at a regular interval, and still happening. Each finding is a
// suggestion the user confirms; nothing is created automatically.

export interface BillSuggestion {
  /** Merchant key plus the sign, so a refund series is never merged with charges. */
  key: string;
  merchant: string;
  /** The latest amount, signed like a transaction. */
  amountCents: number;
  categoryId: number;
  cadence: Cadence;
  lastDate: IsoDate;
  /** First expected date after today: where a new bill would start. */
  nextDate: IsoDate;
  occurrences: number;
}

interface CadenceSpec {
  cadence: Cadence;
  /** Gaps in days that count as one period. Wide enough for weekends and short months. */
  minGap: number;
  maxGap: number;
  /** Payments in an unbroken run needed before suggesting. */
  minRun: number;
}

const SPECS: readonly CadenceSpec[] = [
  { cadence: 'weekly', minGap: 6, maxGap: 8, minRun: 4 },
  { cadence: 'monthly', minGap: 26, maxGap: 35, minRun: 3 },
  { cadence: 'yearly', minGap: 355, maxGap: 375, minRun: 2 },
];

/** Amounts count as the same bill within 15% or $2 of the median, whichever is larger. */
function similarAmounts(txs: readonly Transaction[]): Transaction[] {
  const mid = median(txs.map((t) => Math.abs(t.amountCents))) ?? 0;
  const tolerance = Math.max(200, Math.round(mid * 0.15));
  return txs.filter((t) => Math.abs(Math.abs(t.amountCents) - mid) <= tolerance);
}

/** Length of the unbroken run of fitting gaps that ends at the latest payment. */
function trailingRun(dates: readonly IsoDate[], spec: CadenceSpec): number {
  let run = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    const gap = daysBetween(dates[i - 1]!, dates[i]!);
    if (gap < spec.minGap || gap > spec.maxGap) break;
    run++;
  }
  return run;
}

function mostCommon(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}

export function suggestionKey(merchant: string, amountCents: number): string {
  return `${merchantKey(merchant)}|${amountCents < 0 ? 'out' : 'in'}`;
}

export function detectBills(params: {
  transactions: readonly Transaction[];
  rules: readonly Pick<RecurringRule, 'merchant' | 'amountCents'>[];
  dismissed: ReadonlySet<string>;
  today: IsoDate;
}): BillSuggestion[] {
  const known = params.rules.map((r) => ({
    key: merchantKey(r.merchant),
    income: r.amountCents > 0,
  }));
  const groups = new Map<string, Transaction[]>();
  for (const t of params.transactions) {
    if (merchantKey(t.merchant) === '') continue;
    const key = suggestionKey(t.merchant, t.amountCents);
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }

  const out: BillSuggestion[] = [];
  for (const [key, all] of groups) {
    if (params.dismissed.has(key)) continue;
    // An existing bill covers other spellings of its merchant ("Netflix" and "NETFLIX.COM").
    const groupKey = merchantKey(all[0]!.merchant);
    const income = all[0]!.amountCents > 0;
    if (
      known.some(
        (k) =>
          k.income === income && (keyContains(groupKey, k.key) || keyContains(k.key, groupKey)),
      )
    )
      continue;
    // Already handled by a bill, even if the merchant was renamed since.
    if (all.some((t) => t.recurringId !== null)) continue;
    const txs = similarAmounts(all).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    const dates = [...new Set(txs.map((t) => t.date))];
    const last = txs.at(-1);
    if (!last || dates.length < 2) continue;

    for (const spec of SPECS) {
      const run = trailingRun(dates, spec);
      if (run < spec.minRun) continue;
      // Stopped: the last payment is more than one and a half periods ago.
      if (daysBetween(last.date, params.today) > spec.maxGap * 1.5) break;
      let index = 1;
      let next = occurrenceAt(last.date, spec.cadence, index);
      while (next <= params.today) next = occurrenceAt(last.date, spec.cadence, ++index);
      const runTxs = txs.filter((t) => t.date >= dates[dates.length - run]!);
      out.push({
        key,
        merchant: last.merchant,
        amountCents: last.amountCents,
        categoryId: mostCommon(runTxs.map((t) => t.categoryId)),
        cadence: spec.cadence,
        lastDate: last.date,
        nextDate: next,
        occurrences: run,
      });
      break;
    }
  }
  return out.sort((a, b) => (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0));
}
