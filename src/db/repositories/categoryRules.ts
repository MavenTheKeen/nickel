import type { Db } from '@/db/types';
import { keyContains, merchantKey, type MerchantCategoryCount } from '@/services/merchant';
import type { CategoryRule } from '@/types/domain';

interface RuleRow {
  id: number;
  pattern: string;
  category_id: number;
  created_at: string;
}

const toRule = (r: RuleRow): CategoryRule => ({
  id: r.id,
  pattern: r.pattern,
  categoryId: r.category_id,
  createdAt: r.created_at,
});

export async function listCategoryRules(db: Db): Promise<CategoryRule[]> {
  const rows = await db.all<RuleRow>(
    'SELECT id, pattern, category_id, created_at FROM category_rules ORDER BY pattern',
  );
  return rows.map(toRule);
}

export class EmptyPatternError extends Error {
  override name = 'EmptyPatternError';
  constructor() {
    super('The merchant name has no letters to match on');
  }
}

/**
 * Creates the rule, or moves an existing rule with the same pattern to the
 * new category. The pattern is normalised first. Returns the rule id.
 */
export async function saveCategoryRule(
  db: Db,
  pattern: string,
  categoryId: number,
  now = new Date(),
): Promise<number> {
  const key = merchantKey(pattern);
  if (key === '') throw new EmptyPatternError();
  return db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO category_rules (pattern, category_id, created_at) VALUES (?, ?, ?)
       ON CONFLICT (pattern) DO UPDATE SET category_id = excluded.category_id`,
      [key, categoryId, now.toISOString()],
    );
    const row = await tx.first<{ id: number }>('SELECT id FROM category_rules WHERE pattern = ?', [
      key,
    ]);
    return row!.id;
  });
}

export async function updateCategoryRule(
  db: Db,
  id: number,
  pattern: string,
  categoryId: number,
): Promise<void> {
  const key = merchantKey(pattern);
  if (key === '') throw new EmptyPatternError();
  await db.transaction(async (tx) => {
    await tx.run('UPDATE category_rules SET pattern = ?, category_id = ? WHERE id = ?', [
      key,
      categoryId,
      id,
    ]);
  });
}

export async function deleteCategoryRule(db: Db, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM category_rules WHERE id = ?', [id]);
  });
}

interface Candidate {
  id: number;
  merchant: string;
}

/**
 * Past transactions a rule would move: merchant matches, currently in a
 * different category of the same kind (an expense rule never moves income).
 */
async function candidates(db: Db, pattern: string, categoryId: number): Promise<Candidate[]> {
  const rows = await db.all<Candidate>(
    `SELECT t.id, t.merchant FROM transactions t
     JOIN categories cur ON cur.id = t.category_id
     JOIN categories target ON target.id = ?
     WHERE t.merchant <> '' AND t.category_id <> ? AND cur.is_income = target.is_income`,
    [categoryId, categoryId],
  );
  const key = merchantKey(pattern);
  return rows.filter((r) => keyContains(merchantKey(r.merchant), key));
}

export async function countRuleMatches(
  db: Db,
  pattern: string,
  categoryId: number,
): Promise<number> {
  return (await candidates(db, pattern, categoryId)).length;
}

/** Moves every matching past transaction into the rule's category. Returns how many moved. */
export async function applyRuleToHistory(
  db: Db,
  pattern: string,
  categoryId: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const ids = (await candidates(tx, pattern, categoryId)).map((c) => c.id);
    // Chunked to stay under SQLite's bound-parameter limit.
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await tx.run(
        `UPDATE transactions SET category_id = ? WHERE id IN (${chunk.map(() => '?').join(', ')})`,
        [categoryId, ...chunk],
      );
    }
    return ids.length;
  });
}

/** How often each merchant spelling was filed under each category. */
export async function merchantCategoryCounts(db: Db): Promise<MerchantCategoryCount[]> {
  return db.all<MerchantCategoryCount>(
    `SELECT merchant, category_id AS categoryId, COUNT(*) AS count FROM transactions
     WHERE merchant <> '' GROUP BY merchant COLLATE NOCASE, category_id`,
  );
}
