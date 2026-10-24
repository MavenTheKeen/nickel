import type { IsoDate } from '@/types/domain';

import { daysLeftInPeriod } from './dates';

export const WARN_THRESHOLD = 80;
export const OVER_THRESHOLD = 100;
export type Threshold = typeof WARN_THRESHOLD | typeof OVER_THRESHOLD;

export type BudgetLevel = 'ok' | 'warn' | 'over';

export interface BudgetProgress {
  limitCents: number;
  /** Spending as a positive number of cents. */
  spentCents: number;
  remainingCents: number;
  /** Whole percent used, floored: 79.9% is 79. */
  percent: number;
  level: BudgetLevel;
}

/**
 * Percent used, floored, computed in integers so 80% is reached at exactly
 * 80% and never one cent early through rounding.
 */
export function percentUsed(spentCents: number, limitCents: number): number {
  if (limitCents <= 0) return spentCents > 0 ? Infinity : 0;
  return Math.floor((Math.max(0, spentCents) * 100) / limitCents);
}

export function levelFor(percent: number): BudgetLevel {
  if (percent >= OVER_THRESHOLD) return 'over';
  if (percent >= WARN_THRESHOLD) return 'warn';
  return 'ok';
}

export function budgetProgress(spentCents: number, limitCents: number): BudgetProgress {
  const percent = percentUsed(spentCents, limitCents);
  return {
    limitCents,
    spentCents,
    remainingCents: limitCents - spentCents,
    percent,
    level: levelFor(percent),
  };
}

/**
 * Thresholds crossed by moving from `beforeCents` to `afterCents` of spending.
 * A single large expense can cross both at once.
 */
export function crossedThresholds(
  beforeCents: number,
  afterCents: number,
  limitCents: number,
): Threshold[] {
  const before = percentUsed(beforeCents, limitCents);
  const after = percentUsed(afterCents, limitCents);
  return ([WARN_THRESHOLD, OVER_THRESHOLD] as const).filter((t) => before < t && after >= t);
}

/**
 * "Safe to spend today": what is left of this month's total budget divided
 * evenly over the remaining days, today included. Never negative; floored
 * to whole cents so the daily figure never overstates what is available.
 */
export function safeToSpendToday(params: {
  totalLimitCents: number;
  totalSpentCents: number;
  today: IsoDate;
  /** First day of the budget period; 1 means calendar months. */
  startDay?: number;
}): number {
  const remaining = params.totalLimitCents - params.totalSpentCents;
  if (remaining <= 0) return 0;
  return Math.floor(remaining / daysLeftInPeriod(params.today, params.startDay));
}

/**
 * Net spending in an expense category as a positive number. Expenses are
 * stored negative; a refund (positive row) reduces spending but never
 * below zero.
 */
export function netSpent(amountsCents: readonly number[]): number {
  return Math.max(0, -amountsCents.reduce((sum, a) => sum + a, 0));
}
