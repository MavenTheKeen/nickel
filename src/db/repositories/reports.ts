import type { Db } from '@/db/types';
import { clampStartDay, lastNMonths, periodRange, periodShiftModifier } from '@/services/dates';
import { carryInto, type PeriodBudget } from '@/services/rollover';
import type { IsoMonth } from '@/types/domain';

// Read-only aggregate queries for Home, Budgets and Insights. Each one is
// shaped to use the (date) or (category_id, date) index.

export interface CategorySpend {
  categoryId: number;
  /** Net spending, positive. Refunds reduce it. */
  spentCents: number;
}

/** Net spending per expense category for a month. */
export async function spendingByCategory(
  db: Db,
  month: IsoMonth,
  startDay = 1,
): Promise<CategorySpend[]> {
  const { start, end } = periodRange(month, startDay);
  return db.all<CategorySpend>(
    `SELECT t.category_id AS categoryId, -SUM(t.amount_cents) AS spentCents
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.date BETWEEN ? AND ? AND c.is_income = 0
     GROUP BY t.category_id
     HAVING spentCents > 0
     ORDER BY spentCents DESC`,
    [start, end],
  );
}

export interface MonthTotals {
  month: IsoMonth;
  expenseCents: number;
  incomeCents: number;
}

/** Spending and income per month for the `count` months ending at `month`, zero-filled. */
export async function monthlyTotals(
  db: Db,
  month: IsoMonth,
  count = 12,
  startDay = 1,
): Promise<MonthTotals[]> {
  const months = lastNMonths(month, count);
  const first = months[0] ?? month;
  const rows = await db.all<MonthTotals>(
    `SELECT strftime('%Y-%m', t.date, ?) AS month,
            -SUM(CASE WHEN c.is_income = 0 THEN t.amount_cents ELSE 0 END) AS expenseCents,
            SUM(CASE WHEN c.is_income = 1 THEN t.amount_cents ELSE 0 END) AS incomeCents
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.date BETWEEN ? AND ?
     GROUP BY 1`,
    [
      periodShiftModifier(startDay),
      periodRange(first, startDay).start,
      periodRange(month, startDay).end,
    ],
  );
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map((m) => byMonth.get(m) ?? { month: m, expenseCents: 0, incomeCents: 0 });
}

export interface MerchantSpend {
  merchant: string;
  spentCents: number;
  count: number;
}

export async function topMerchants(
  db: Db,
  month: IsoMonth,
  limit = 5,
  startDay = 1,
): Promise<MerchantSpend[]> {
  const { start, end } = periodRange(month, startDay);
  return db.all<MerchantSpend>(
    `SELECT merchant, -SUM(amount_cents) AS spentCents, COUNT(*) AS count
     FROM transactions
     WHERE date BETWEEN ? AND ? AND amount_cents < 0 AND merchant <> ''
     GROUP BY merchant COLLATE NOCASE
     ORDER BY spentCents DESC
     LIMIT ?`,
    [start, end, limit],
  );
}

export interface LargeExpense {
  id: number;
  date: string;
  merchant: string;
  note: string;
  categoryId: number;
  amountCents: number;
}

export async function largestExpenses(
  db: Db,
  month: IsoMonth,
  limit = 5,
  startDay = 1,
): Promise<LargeExpense[]> {
  const { start, end } = periodRange(month, startDay);
  return db.all<LargeExpense>(
    `SELECT id, date, merchant, note, category_id AS categoryId, amount_cents AS amountCents
     FROM transactions
     WHERE date BETWEEN ? AND ? AND amount_cents < 0
     ORDER BY amount_cents ASC, id
     LIMIT ?`,
    [start, end, limit],
  );
}

export interface BudgetLine {
  categoryId: number;
  /** The limit to spend against this period: the set limit plus any carry. */
  limitCents: number;
  /** The limit as set for this period. */
  baseLimitCents: number;
  /** Carried in from earlier periods (rollover categories only); may be negative. */
  carryCents: number;
  rollover: boolean;
  spentCents: number;
}

/** Start and end of the period named `b.month`, as SQL date expressions. */
const PERIOD_START = "date(b.month || '-01', ?)";
const PERIOD_END = "date(b.month || '-01', '+1 month', ?, '-1 day')";

/**
 * Each budgeted category for the month with its net spending (0 if none).
 * Rollover categories also get what carried in from earlier periods.
 */
export async function budgetLines(db: Db, month: IsoMonth, startDay = 1): Promise<BudgetLine[]> {
  const { start, end } = periodRange(month, startDay);
  const rows = await db.all<{
    categoryId: number;
    limitCents: number;
    spentCents: number;
    rollover: number;
  }>(
    `SELECT b.category_id AS categoryId, b.limit_cents AS limitCents, c.rollover AS rollover,
            MAX(0, COALESCE((SELECT -SUM(t.amount_cents) FROM transactions t
                             WHERE t.category_id = b.category_id AND t.date BETWEEN ? AND ?), 0)) AS spentCents
     FROM budgets b JOIN categories c ON c.id = b.category_id
     WHERE b.month = ?
     ORDER BY b.category_id`,
    [start, end, month],
  );
  const rolloverIds = rows.filter((r) => r.rollover === 1).map((r) => r.categoryId);
  const history =
    rolloverIds.length > 0 ? await budgetHistory(db, rolloverIds, month, startDay) : [];
  return rows.map((r) => {
    const carryCents =
      r.rollover === 1
        ? carryInto(
            history.filter((h) => h.categoryId === r.categoryId),
            month,
          )
        : 0;
    return {
      categoryId: r.categoryId,
      limitCents: r.limitCents + carryCents,
      baseLimitCents: r.limitCents,
      carryCents,
      rollover: r.rollover === 1,
      spentCents: r.spentCents,
    };
  });
}

/** Limit and net spending for every budgeted period before `month` of the given categories. */
async function budgetHistory(
  db: Db,
  categoryIds: readonly number[],
  month: IsoMonth,
  startDay: number,
): Promise<(PeriodBudget & { categoryId: number })[]> {
  const shift = `+${clampStartDay(startDay) - 1} days`;
  return db.all(
    `SELECT b.category_id AS categoryId, b.month AS month, b.limit_cents AS limitCents,
            MAX(0, COALESCE((SELECT -SUM(t.amount_cents) FROM transactions t
                             WHERE t.category_id = b.category_id
                               AND t.date BETWEEN ${PERIOD_START} AND ${PERIOD_END}), 0)) AS spentCents
     FROM budgets b
     WHERE b.month < ? AND b.category_id IN (${categoryIds.map(() => '?').join(', ')})`,
    [shift, shift, month, ...categoryIds],
  );
}

/** Net spending in one category for a month; used to detect threshold crossings. */
export async function categorySpent(
  db: Db,
  categoryId: number,
  month: IsoMonth,
  startDay = 1,
): Promise<number> {
  const { start, end } = periodRange(month, startDay);
  const r = await db.first<{ spent: number }>(
    `SELECT MAX(0, COALESCE(-SUM(amount_cents), 0)) AS spent FROM transactions
     WHERE category_id = ? AND date BETWEEN ? AND ?`,
    [categoryId, start, end],
  );
  return r?.spent ?? 0;
}

/** Total expense spending between two dates, inclusive; used by the weekly summary. */
export async function spentBetween(db: Db, start: string, end: string): Promise<number> {
  const r = await db.first<{ spent: number }>(
    `SELECT COALESCE(-SUM(t.amount_cents), 0) AS spent
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.date BETWEEN ? AND ? AND c.is_income = 0`,
    [start, end],
  );
  return Math.max(0, r?.spent ?? 0);
}

/** Expense spending per weekday for a period; index 0 is Sunday. */
export async function spendingByWeekday(db: Db, month: IsoMonth, startDay = 1): Promise<number[]> {
  const { start, end } = periodRange(month, startDay);
  const rows = await db.all<{ weekday: string; spent: number }>(
    `SELECT strftime('%w', t.date) AS weekday, -SUM(t.amount_cents) AS spent
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.date BETWEEN ? AND ? AND c.is_income = 0
     GROUP BY 1`,
    [start, end],
  );
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) out[Number(r.weekday)] = Math.max(0, r.spent);
  return out;
}

export async function countTransactionsIn(db: Db, month: IsoMonth, startDay = 1): Promise<number> {
  const { start, end } = periodRange(month, startDay);
  const r = await db.first<{ n: number }>(
    'SELECT COUNT(*) AS n FROM transactions WHERE date BETWEEN ? AND ?',
    [start, end],
  );
  return r?.n ?? 0;
}
