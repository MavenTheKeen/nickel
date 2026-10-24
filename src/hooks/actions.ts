import { setBudget } from '@/db/repositories/budgets';
import { listCategories } from '@/db/repositories/categories';
import { importBatch } from '@/db/repositories/imports';
import { generateDueTransactions, listRules } from '@/db/repositories/recurring';
import { budgetLines, categorySpent, spentBetween } from '@/db/repositories/reports';
import { getSettings, recordBudgetWarning, type Settings } from '@/db/repositories/settings';
import {
  addTransaction,
  deleteTransaction,
  updateTransaction,
} from '@/db/repositories/transactions';
import type { Db } from '@/db/types';
import { timed, track } from '@/events/track';
import {
  planNotifications,
  weeklyBudgetShare,
  type PlannedNotification,
} from '@/notifications/plan';
import { crossedThresholds } from '@/services/budgetMath';
import { addDays, dayOfWeek, periodLength, periodOf } from '@/services/dates';
import { formatCents } from '@/services/money';
import type { ForeignAmount, IsoDate, IsoMonth, NewTransaction, Transaction } from '@/types/domain';
import type { TransactionInput } from '@/types/schemas';

// Write paths that touch more than one part of the app: the database, the
// event log and notifications. Side effects are passed in, so tests can run
// these against a real SQLite database with fake notifications.

export interface Effects {
  notifyNow: (title: string, body: string, data?: Record<string, unknown>) => Promise<void>;
  applyPlan: (plan: readonly PlannedNotification[]) => Promise<number | null>;
  /** Asks for notification permission; resolves false if declined. */
  requestPermission: () => Promise<boolean>;
}

export const noEffects: Effects = {
  notifyNow: async () => undefined,
  applyPlan: async () => null,
  requestPermission: async () => false,
};

/**
 * Sends the 80% / 100% warning for a category if this change crossed it and
 * it has not been sent this month. Returns the thresholds notified.
 */
export async function checkBudgetWarnings(
  db: Db,
  effects: Effects,
  params: { categoryId: number; month: IsoMonth; beforeCents: number; settings: Settings },
): Promise<number[]> {
  if (!params.settings.notifyBudget) return [];
  // The limit includes any rollover carry, so warnings match the Budgets screen.
  const budget = (await budgetLines(db, params.month, params.settings.periodStartDay)).find(
    (b) => b.categoryId === params.categoryId,
  );
  if (!budget) return [];
  const after = await categorySpent(
    db,
    params.categoryId,
    params.month,
    params.settings.periodStartDay,
  );
  const crossed = crossedThresholds(params.beforeCents, after, budget.limitCents);
  // Only the highest threshold is shown if one expense crosses both.
  const sent: number[] = [];
  for (const t of crossed) {
    if (await recordBudgetWarning(db, params.categoryId, params.month, t)) sent.push(t);
  }
  const top = sent.at(-1);
  if (top !== undefined) {
    const name = (await listCategories(db, { includeArchived: true })).find(
      (c) => c.id === params.categoryId,
    )?.name;
    const money = (c: number) => formatCents(c, { symbol: params.settings.currencySymbol });
    await effects.notifyNow(
      top === 100 ? `${name} is over budget` : `${name} is at ${top}% of budget`,
      `${money(after)} of ${money(budget.limitCents)} spent this month`,
      { kind: 'budget', categoryId: params.categoryId },
    );
  }
  return sent;
}

export async function saveTransaction(
  db: Db,
  effects: Effects,
  input: TransactionInput & { receipt?: string | null; original?: ForeignAmount | null },
  opts: { id?: number; today: IsoDate; source?: 'manual' | 'onboarding' | 'quick_add' },
): Promise<number> {
  const settings = await getSettings(db);
  const month = periodOf(input.date, settings.periodStartDay);
  const beforeCents = await categorySpent(db, input.categoryId, month, settings.periodStartDay);
  let id: number;
  if (opts.id !== undefined) {
    await updateTransaction(db, opts.id, input);
    id = opts.id;
  } else {
    id = await addTransaction(db, input);
    track('transaction_added', {
      kind: input.amountCents < 0 ? 'expense' : 'income',
      source: opts.source ?? 'manual',
      hasNote: input.note !== '',
    });
  }
  await checkBudgetWarnings(db, effects, {
    categoryId: input.categoryId,
    month,
    beforeCents,
    settings,
  });
  await rescheduleNotifications(db, effects, opts.today);
  return id;
}

export async function removeTransaction(
  db: Db,
  effects: Effects,
  id: number,
  today: IsoDate,
): Promise<Transaction | null> {
  const deleted = await deleteTransaction(db, id);
  await rescheduleNotifications(db, effects, today);
  return deleted;
}

export async function saveBudget(db: Db, categoryId: number, month: IsoMonth, limitCents: number) {
  await setBudget(db, categoryId, month, limitCents);
  track('budget_set', { month, limitCents });
}

export async function importRows(
  db: Db,
  effects: Effects,
  params: {
    filename: string;
    rows: readonly NewTransaction[];
    errorCount: number;
    totalRows: number;
    today: IsoDate;
  },
): Promise<number> {
  try {
    const batchId = await timed('import_duration', () => importBatch(db, params), {
      rows: params.rows.length,
    });
    track('import_completed', {
      rows: params.rows.length,
      errors: params.errorCount,
      total: params.totalRows,
    });
    await rescheduleNotifications(db, effects, params.today);
    return batchId;
  } catch (error) {
    track('import_failed', { reason: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/** Monday-to-today spending and a prorated week of the monthly budget. */
export async function weeklySummary(db: Db, today: IsoDate) {
  const weekStart = addDays(today, -((dayOfWeek(today) + 6) % 7));
  const { periodStartDay } = await getSettings(db);
  const month = periodOf(today, periodStartDay);
  const limit = (await budgetLines(db, month, periodStartDay)).reduce(
    (s, l) => s + l.limitCents,
    0,
  );
  return {
    spentCents: await spentBetween(db, weekStart, today),
    budgetCents: weeklyBudgetShare(limit, periodLength(month, periodStartDay)),
  };
}

export async function rescheduleNotifications(
  db: Db,
  effects: Effects,
  today: IsoDate,
  nowMinutes = minutesNow(),
): Promise<number | null> {
  const [settings, rules, categories] = await Promise.all([
    getSettings(db),
    listRules(db),
    listCategories(db, { includeArchived: true }),
  ]);
  const plan = planNotifications({
    today,
    nowMinutes,
    rules,
    categoryNames: new Map(categories.map((c) => [c.id, c.name])),
    currencySymbol: settings.currencySymbol,
    notifyBills: settings.notifyBills,
    notifyWeekly: settings.notifyWeekly,
    weekly: settings.notifyWeekly ? await weeklySummary(db, today) : null,
  });
  return effects.applyPlan(plan);
}

function minutesNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Work done on every app start after migrations. */
export async function onAppStart(
  db: Db,
  effects: Effects,
  today: IsoDate,
): Promise<{ generated: number }> {
  const generated = await generateDueTransactions(db, today);
  await rescheduleNotifications(db, effects, today).catch(() => null);
  return { generated };
}
