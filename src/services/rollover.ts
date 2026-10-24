import type { IsoMonth } from '@/types/domain';

import { addMonthsToMonth } from './dates';

// Rollover budgets: what is left of a period's limit carries into the next
// period, and overspending is taken from it. A period without a limit breaks
// the chain, so a category that was unbudgeted for a while starts fresh.

export interface PeriodBudget {
  month: IsoMonth;
  limitCents: number;
  /** Net spending, positive. */
  spentCents: number;
}

/**
 * The amount carried into `month` from the unbroken run of budgeted periods
 * immediately before it. Positive is money left over; negative is
 * overspending to make up. `history` may be in any order and may include
 * periods on or after `month`, which are ignored.
 */
export function carryInto(history: readonly PeriodBudget[], month: IsoMonth): number {
  const before = history
    .filter((h) => h.month < month)
    .sort((a, b) => (a.month < b.month ? -1 : 1));
  let carry = 0;
  let prev: IsoMonth | null = null;
  for (const h of before) {
    if (prev !== null && addMonthsToMonth(prev, 1) !== h.month) carry = 0;
    carry += h.limitCents - h.spentCents;
    prev = h.month;
  }
  return prev === addMonthsToMonth(month, -1) ? carry : 0;
}
