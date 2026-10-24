import type { Goal, IsoDate } from '@/types/domain';

import { daysBetween, parseIsoDate } from './dates';

export type GoalStatus = 'done' | 'on_track' | 'behind' | 'overdue' | 'no_date';

export interface GoalProgress {
  remainingCents: number;
  /** Whole percent saved, floored, capped at 100. */
  percent: number;
  /** Whole months from today to the target date, counting the current month; null without a date. */
  monthsLeft: number | null;
  /** What to set aside each month to reach the target on time, rounded up to the cent. */
  perMonthCents: number | null;
  status: GoalStatus;
}

/**
 * Months still available to save, counting the current month: from
 * 2025-06-15 to 2025-08-01 is 3 (June, July and August).
 */
export function monthsUntil(today: IsoDate, target: IsoDate): number {
  const a = parseIsoDate(today)!;
  const b = parseIsoDate(target)!;
  return Math.max(0, (b.y - a.y) * 12 + (b.m - a.m) + 1);
}

/**
 * Progress against a goal. "On track" compares what is saved with a straight
 * line from the day the goal was created to its target date.
 */
export function goalProgress(
  goal: Pick<Goal, 'targetCents' | 'targetDate' | 'savedCents' | 'createdAt'>,
  today: IsoDate,
): GoalProgress {
  const saved = Math.max(0, goal.savedCents);
  const remainingCents = Math.max(0, goal.targetCents - saved);
  const percent = Math.min(100, Math.floor((saved * 100) / goal.targetCents));
  if (remainingCents === 0) {
    return { remainingCents, percent: 100, monthsLeft: null, perMonthCents: null, status: 'done' };
  }
  if (!goal.targetDate) {
    return { remainingCents, percent, monthsLeft: null, perMonthCents: null, status: 'no_date' };
  }
  if (goal.targetDate < today) {
    return {
      remainingCents,
      percent,
      monthsLeft: 0,
      perMonthCents: remainingCents,
      status: 'overdue',
    };
  }
  const monthsLeft = monthsUntil(today, goal.targetDate);
  const perMonthCents = Math.ceil(remainingCents / Math.max(1, monthsLeft));
  const start = goal.createdAt.slice(0, 10);
  const total = Math.max(1, daysBetween(start, goal.targetDate));
  const elapsed = Math.min(total, Math.max(0, daysBetween(start, today)));
  const expected = Math.floor((goal.targetCents * elapsed) / total);
  return {
    remainingCents,
    percent,
    monthsLeft,
    perMonthCents,
    status: saved >= expected ? 'on_track' : 'behind',
  };
}
