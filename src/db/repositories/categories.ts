import type { Db } from '@/db/types';
import type { Category } from '@/types/domain';

interface CategoryRow {
  id: number;
  name: string;
  color: string;
  icon: string;
  is_income: number;
  archived: number;
  sort_order: number;
  rollover: number;
}

const COLUMNS = 'id, name, color, icon, is_income, archived, sort_order, rollover';

function toCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    icon: r.icon,
    isIncome: r.is_income === 1,
    archived: r.archived === 1,
    sortOrder: r.sort_order,
    rollover: r.rollover === 1,
  };
}

export class CategoryInUseError extends Error {
  constructor(public readonly transactionCount: number) {
    super(`Category has ${transactionCount} transactions; archive it instead`);
    this.name = 'CategoryInUseError';
  }
}

export type CategoryInput = Pick<Category, 'name' | 'color' | 'icon' | 'isIncome'>;

export const DEFAULT_CATEGORIES: readonly CategoryInput[] = [
  { name: 'Groceries', color: '#2E7D32', icon: 'cart', isIncome: false },
  { name: 'Rent', color: '#5D4037', icon: 'home', isIncome: false },
  { name: 'Transport', color: '#1565C0', icon: 'bus', isIncome: false },
  { name: 'Eating out', color: '#E65100', icon: 'food', isIncome: false },
  { name: 'Bills', color: '#6A1B9A', icon: 'flash', isIncome: false },
  { name: 'Shopping', color: '#AD1457', icon: 'shopping', isIncome: false },
  { name: 'Health', color: '#00838F', icon: 'heart-pulse', isIncome: false },
  { name: 'Fun', color: '#F9A825', icon: 'star', isIncome: false },
  { name: 'Other', color: '#616161', icon: 'dots-horizontal', isIncome: false },
  { name: 'Salary', color: '#1B5E20', icon: 'cash', isIncome: true },
  { name: 'Other income', color: '#33691E', icon: 'cash-plus', isIncome: true },
];

export async function listCategories(
  db: Db,
  opts: { includeArchived?: boolean } = {},
): Promise<Category[]> {
  const rows = await db.all<CategoryRow>(
    `SELECT ${COLUMNS} FROM categories ${opts.includeArchived ? '' : 'WHERE archived = 0'}
     ORDER BY is_income, sort_order, name COLLATE NOCASE`,
  );
  return rows.map(toCategory);
}

export async function getCategory(db: Db, id: number): Promise<Category | null> {
  const row = await db.first<CategoryRow>(`SELECT ${COLUMNS} FROM categories WHERE id = ?`, [id]);
  return row ? toCategory(row) : null;
}

export async function createCategory(db: Db, input: CategoryInput): Promise<number> {
  return db.transaction(async (tx) => {
    const next = await tx.first<{ n: number }>(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories',
    );
    const r = await tx.run(
      'INSERT INTO categories (name, color, icon, is_income, sort_order) VALUES (?, ?, ?, ?, ?)',
      [input.name.trim(), input.color, input.icon, input.isIncome ? 1 : 0, next?.n ?? 0],
    );
    return r.lastInsertRowId;
  });
}

export async function updateCategory(db: Db, id: number, input: CategoryInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run(
      'UPDATE categories SET name = ?, color = ?, icon = ?, is_income = ? WHERE id = ?',
      [input.name.trim(), input.color, input.icon, input.isIncome ? 1 : 0, id],
    );
  });
}

export async function setCategoryArchived(db: Db, id: number, archived: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('UPDATE categories SET archived = ? WHERE id = ?', [archived ? 1 : 0, id]);
  });
}

export async function setCategoryRollover(db: Db, id: number, rollover: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('UPDATE categories SET rollover = ? WHERE id = ?', [rollover ? 1 : 0, id]);
  });
}

/**
 * Deletes a category only if nothing refers to it. Categories with history
 * must be archived so old transactions keep their category.
 */
export async function deleteCategory(db: Db, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const used = await tx.first<{ n: number }>(
      'SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?',
      [id],
    );
    if ((used?.n ?? 0) > 0) throw new CategoryInUseError(used?.n ?? 0);
    await tx.run('DELETE FROM budgets WHERE category_id = ?', [id]);
    await tx.run('DELETE FROM categories WHERE id = ?', [id]);
  });
}

/** Inserts the default categories when the table is empty. Returns how many were added. */
export async function seedDefaultCategories(db: Db): Promise<number> {
  return db.transaction(async (tx) => {
    const existing = await tx.first<{ n: number }>('SELECT COUNT(*) AS n FROM categories');
    if ((existing?.n ?? 0) > 0) return 0;
    for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
      await tx.run(
        'INSERT INTO categories (name, color, icon, is_income, sort_order) VALUES (?, ?, ?, ?, ?)',
        [c.name, c.color, c.icon, c.isIncome ? 1 : 0, i],
      );
    }
    return DEFAULT_CATEGORIES.length;
  });
}
