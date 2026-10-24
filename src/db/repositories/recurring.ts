import type { Db } from '@/db/types';
import { dueOccurrences, occurrenceAt } from '@/services/recurrence';
import type { Cadence, IsoDate, RecurringRule } from '@/types/domain';

import { insertTransactionTx } from './transactions';

interface RuleRow {
  id: number;
  amount_cents: number;
  category_id: number;
  cadence: Cadence;
  anchor_date: string;
  next_index: number;
  next_due: string;
  note: string;
  merchant: string;
  active: number;
}

const COLUMNS =
  'id, amount_cents, category_id, cadence, anchor_date, next_index, next_due, note, merchant, active';

const toRule = (r: RuleRow): RecurringRule => ({
  id: r.id,
  amountCents: r.amount_cents,
  categoryId: r.category_id,
  cadence: r.cadence,
  anchorDate: r.anchor_date,
  nextIndex: r.next_index,
  nextDue: r.next_due,
  note: r.note,
  merchant: r.merchant,
  active: r.active === 1,
});

export type RuleInput = Pick<
  RecurringRule,
  'amountCents' | 'categoryId' | 'cadence' | 'anchorDate' | 'note' | 'merchant'
>;

export async function listRules(db: Db): Promise<RecurringRule[]> {
  const rows = await db.all<RuleRow>(
    `SELECT ${COLUMNS} FROM recurring_rules WHERE active = 1 ORDER BY next_due, id`,
  );
  return rows.map(toRule);
}

export async function getRule(db: Db, id: number): Promise<RecurringRule | null> {
  const row = await db.first<RuleRow>(`SELECT ${COLUMNS} FROM recurring_rules WHERE id = ?`, [id]);
  return row ? toRule(row) : null;
}

export async function createRule(db: Db, input: RuleInput): Promise<number> {
  return db.transaction(async (tx) => {
    const r = await tx.run(
      `INSERT INTO recurring_rules (amount_cents, category_id, cadence, anchor_date, next_index, next_due, note, merchant)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        input.amountCents,
        input.categoryId,
        input.cadence,
        input.anchorDate,
        input.anchorDate,
        input.note,
        input.merchant,
      ],
    );
    return r.lastInsertRowId;
  });
}

/** Changing the schedule restarts it from the new anchor date. */
export async function updateRule(db: Db, id: number, input: RuleInput): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx.first<RuleRow>(
      `SELECT ${COLUMNS} FROM recurring_rules WHERE id = ?`,
      [id],
    );
    if (!existing) throw new Error(`Rule ${id} not found`);
    const scheduleChanged =
      existing.anchor_date !== input.anchorDate || existing.cadence !== input.cadence;
    await tx.run(
      `UPDATE recurring_rules SET amount_cents = ?, category_id = ?, cadence = ?, anchor_date = ?,
         note = ?, merchant = ?, next_index = ?, next_due = ? WHERE id = ?`,
      [
        input.amountCents,
        input.categoryId,
        input.cadence,
        input.anchorDate,
        input.note,
        input.merchant,
        scheduleChanged ? 0 : existing.next_index,
        scheduleChanged ? input.anchorDate : existing.next_due,
        id,
      ],
    );
  });
}

/** Stops a rule. Transactions it already created stay, with their link cleared on delete. */
export async function deleteRule(db: Db, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM recurring_rules WHERE id = ?', [id]);
  });
}

async function advance(tx: Db, rule: RuleRow, toIndex: number): Promise<void> {
  await tx.run('UPDATE recurring_rules SET next_index = ?, next_due = ? WHERE id = ?', [
    toIndex,
    occurrenceAt(rule.anchor_date, rule.cadence, toIndex),
    rule.id,
  ]);
}

/**
 * Creates a transaction for every occurrence due on or before `today` and
 * moves each rule forward. Runs on app start. Inserts and the rule update
 * commit together, so a crash part-way can never create the same bill twice.
 * Returns the number of transactions created.
 */
export async function generateDueTransactions(
  db: Db,
  today: IsoDate,
  now = new Date(),
): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx.all<RuleRow>(
      `SELECT ${COLUMNS} FROM recurring_rules WHERE active = 1 AND next_due <= ?`,
      [today],
    );
    let created = 0;
    for (const rule of rows) {
      const due = dueOccurrences(rule.anchor_date, rule.cadence, rule.next_index, today);
      for (const occ of due) {
        await insertTransactionTx(
          tx,
          {
            amountCents: rule.amount_cents,
            date: occ.date,
            categoryId: rule.category_id,
            note: rule.note,
            merchant: rule.merchant,
            recurringId: rule.id,
          },
          now,
        );
        created++;
      }
      const last = due.at(-1);
      if (last) await advance(tx, rule, last.index + 1);
    }
    return created;
  });
}

/** Records the next occurrence as paid today (before its due date) and moves on. */
export async function markNextPaid(
  db: Db,
  id: number,
  today: IsoDate,
  now = new Date(),
): Promise<number> {
  return db.transaction(async (tx) => {
    const rule = await tx.first<RuleRow>(`SELECT ${COLUMNS} FROM recurring_rules WHERE id = ?`, [
      id,
    ]);
    if (!rule) throw new Error(`Rule ${id} not found`);
    const txId = await insertTransactionTx(
      tx,
      {
        amountCents: rule.amount_cents,
        date: today,
        categoryId: rule.category_id,
        note: rule.note,
        merchant: rule.merchant,
        recurringId: rule.id,
      },
      now,
    );
    await advance(tx, rule, rule.next_index + 1);
    return txId;
  });
}

/** Skips the next occurrence without creating a transaction. */
export async function skipNext(db: Db, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const rule = await tx.first<RuleRow>(`SELECT ${COLUMNS} FROM recurring_rules WHERE id = ?`, [
      id,
    ]);
    if (!rule) throw new Error(`Rule ${id} not found`);
    await advance(tx, rule, rule.next_index + 1);
  });
}

/** Merchant keys whose bill suggestion the user turned down. */
export async function listDismissedSuggestions(db: Db): Promise<Set<string>> {
  const rows = await db.all<{ merchant_key: string }>(
    'SELECT merchant_key FROM dismissed_suggestions',
  );
  return new Set(rows.map((r) => r.merchant_key));
}

export async function dismissSuggestion(
  db: Db,
  merchantKey: string,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run(
      'INSERT OR IGNORE INTO dismissed_suggestions (merchant_key, dismissed_at) VALUES (?, ?)',
      [merchantKey, now.toISOString()],
    );
  });
}
