import { addDays, dayOfWeek, parseIsoDate } from '@/services/dates';
import { formatCents } from '@/services/money';
import { occurrencesBetween } from '@/services/recurrence';
import type { IsoDate, RecurringRule } from '@/types/domain';

// Decides which local notifications should exist. Kept free of expo APIs so
// the rules are unit-tested; scheduler.ts turns the plan into real ones.

export const REMINDER_HOUR = 9;
export const WEEKLY_SUMMARY_HOUR = 18;
/** How far ahead bill reminders are scheduled. The plan is rebuilt on every app start. */
export const HORIZON_DAYS = 45;

export interface PlannedNotification {
  /** Stable id so rescheduling replaces rather than duplicates. */
  id: string;
  title: string;
  body: string;
  /** Local wall-clock time to fire. */
  at: { date: IsoDate; hour: number; minute: number };
  data: { kind: 'bill' | 'weekly'; ruleId?: number };
}

export interface PlanInput {
  today: IsoDate;
  /** Current local time of day, to drop reminders whose time already passed today. */
  nowMinutes: number;
  rules: readonly RecurringRule[];
  categoryNames: ReadonlyMap<number, string>;
  currencySymbol: string;
  notifyBills: boolean;
  notifyWeekly: boolean;
  weekly: { spentCents: number; budgetCents: number } | null;
}

function isFuture(
  date: IsoDate,
  hour: number,
  minute: number,
  today: IsoDate,
  nowMinutes: number,
): boolean {
  if (date > today) return true;
  return date === today && hour * 60 + minute > nowMinutes;
}

/** Next Sunday on or after today (today if it is Sunday). */
export function nextSunday(today: IsoDate): IsoDate {
  return addDays(today, (7 - dayOfWeek(today)) % 7);
}

export function planNotifications(input: PlanInput): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const money = (c: number) => formatCents(c, { symbol: input.currencySymbol });

  if (input.notifyBills) {
    const end = addDays(input.today, HORIZON_DAYS);
    for (const rule of input.rules) {
      if (!rule.active) continue;
      // Remind the day before each due date.
      for (const occ of occurrencesBetween(
        rule.anchorDate,
        rule.cadence,
        rule.nextIndex,
        input.today,
        end,
      )) {
        const remindOn = addDays(occ.date, -1);
        if (!isFuture(remindOn, REMINDER_HOUR, 0, input.today, input.nowMinutes)) continue;
        const name =
          rule.merchant || rule.note || input.categoryNames.get(rule.categoryId) || 'A bill';
        out.push({
          id: `bill-${rule.id}-${occ.date}`,
          title: `${name} is due tomorrow`,
          body: `${money(Math.abs(rule.amountCents))} on ${occ.date}`,
          at: { date: remindOn, hour: REMINDER_HOUR, minute: 0 },
          data: { kind: 'bill', ruleId: rule.id },
        });
      }
    }
  }

  if (input.notifyWeekly && input.weekly) {
    let sunday = nextSunday(input.today);
    if (!isFuture(sunday, WEEKLY_SUMMARY_HOUR, 0, input.today, input.nowMinutes))
      sunday = addDays(sunday, 7);
    const { spentCents, budgetCents } = input.weekly;
    const diff = budgetCents - spentCents;
    const budgetPart =
      budgetCents <= 0
        ? ''
        : diff >= 0
          ? `, ${money(diff)} under budget`
          : `, ${money(-diff)} over budget`;
    out.push({
      id: 'weekly-summary',
      title: 'Your week',
      body: `You spent ${money(spentCents)} this week${budgetPart}.`,
      at: { date: sunday, hour: WEEKLY_SUMMARY_HOUR, minute: 0 },
      data: { kind: 'weekly' },
    });
  }

  return out.sort((a, b) => (a.at.date < b.at.date ? -1 : a.at.date > b.at.date ? 1 : 0));
}

/** Local Date for a planned time; built from parts so the device time zone applies. */
export function toLocalDate(at: PlannedNotification['at']): Date {
  const ymd = parseIsoDate(at.date);
  if (!ymd) throw new Error(`Invalid date ${at.date}`);
  return new Date(ymd.y, ymd.m - 1, ymd.d, at.hour, at.minute, 0, 0);
}

/** A week's budget share: the month's total limit prorated to 7 days. */
export function weeklyBudgetShare(monthLimitCents: number, daysInMonth: number): number {
  return Math.floor((monthLimitCents * 7) / daysInMonth);
}
