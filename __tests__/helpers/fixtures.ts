import { seedDefaultCategories, listCategories } from '@/db/repositories/categories';
import type { Db } from '@/db/types';
import type { Category, NewTransaction } from '@/types/domain';

import { openMigratedDb } from './testDb';

/** Fixed clock for every test that records a timestamp, so results are identical each run. */
export const FIXED_NOW = new Date('2025-06-15T12:00:00.000Z');

export async function seededDb(): Promise<{ db: Db; cats: Record<string, Category> }> {
  const db = await openMigratedDb();
  await seedDefaultCategories(db);
  const cats = Object.fromEntries((await listCategories(db)).map((c) => [c.name, c]));
  return { db, cats };
}

export function tx(
  partial: Partial<NewTransaction> & Pick<NewTransaction, 'categoryId'>,
): NewTransaction {
  return {
    amountCents: -1000,
    date: '2025-06-10',
    note: '',
    merchant: '',
    ...partial,
  };
}
