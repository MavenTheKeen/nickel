import type { Db } from '@/db/types';
import { addMonthsToMonth } from '@/services/dates';
import type { Budget, IsoMonth } from '@/types/domain';

interface BudgetRow {
  id: number;
  category_id: number;
  month: string;
  limit_cents: number;
}

const toBudget = (r: BudgetRow): Budget => ({
  id: r.id,
  categoryId: r.category_id,
  month: r.month,
  limitCents: r.limit_cents,
});

export async function listBudgets(db: Db, month: IsoMonth): Promise<Budget[]> {
  const rows = await db.all<BudgetRow>(
    'SELECT id, category_id, month, limit_cents FROM budgets WHERE month = ? ORDER BY category_id',
    [month],
  );
  return rows.map(toBudget);
}

/** Creates or replaces the limit for one category and month. */
export async function setBudget(
  db: Db,
  categoryId: number,
  month: IsoMonth,
  limitCents: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO budgets (category_id, month, limit_cents) VALUES (?, ?, ?)
       ON CONFLICT (category_id, month) DO UPDATE SET limit_cents = excluded.limit_cents`,
      [categoryId, month, limitCents],
    );
  });
}

export async function removeBudget(db: Db, categoryId: number, month: IsoMonth): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM budgets WHERE category_id = ? AND month = ?', [categoryId, month]);
  });
}

/**
 * Copies last month's limits into `month` for categories that have no limit
 * yet, skipping archived categories. Returns how many were copied.
 */
export async function copyBudgetsFromPreviousMonth(db: Db, month: IsoMonth): Promise<number> {
  const previous = addMonthsToMonth(month, -1);
  return db.transaction(async (tx) => {
    const r = await tx.run(
      `INSERT INTO budgets (category_id, month, limit_cents)
       SELECT b.category_id, ?, b.limit_cents
       FROM budgets b JOIN categories c ON c.id = b.category_id
       WHERE b.month = ? AND c.archived = 0
       ON CONFLICT (category_id, month) DO NOTHING`,
      [month, previous],
    );
    return r.changes;
  });
}
