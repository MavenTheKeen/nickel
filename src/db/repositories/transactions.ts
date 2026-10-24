import type { Db, SqlParam } from '@/db/types';
import { periodRange } from '@/services/dates';
import type { ForeignAmount, IsoMonth, NewTransaction, Transaction } from '@/types/domain';

interface TransactionRow {
  id: number;
  amount_cents: number;
  date: string;
  category_id: number;
  note: string;
  merchant: string;
  recurring_id: number | null;
  import_batch_id: number | null;
  receipt: string | null;
  original_minor: number | null;
  original_currency: string | null;
  fx_rate_micros: number | null;
  created_at: string;
}

const COLUMNS =
  'id, amount_cents, date, category_id, note, merchant, recurring_id, import_batch_id, receipt, original_minor, original_currency, fx_rate_micros, created_at';

export function toTransaction(r: TransactionRow): Transaction {
  return {
    id: r.id,
    amountCents: r.amount_cents,
    date: r.date,
    categoryId: r.category_id,
    note: r.note,
    merchant: r.merchant,
    recurringId: r.recurring_id,
    importBatchId: r.import_batch_id,
    receipt: r.receipt,
    original:
      r.original_minor !== null && r.original_currency !== null && r.fx_rate_micros !== null
        ? { minor: r.original_minor, currency: r.original_currency, rateMicros: r.fx_rate_micros }
        : null,
    createdAt: r.created_at,
  };
}

const INSERT_SQL = `INSERT INTO transactions
  (amount_cents, date, category_id, note, merchant, recurring_id, import_batch_id, receipt,
   original_minor, original_currency, fx_rate_micros, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function originalParams(o: ForeignAmount | null | undefined): SqlParam[] {
  return o ? [o.minor, o.currency, o.rateMicros] : [null, null, null];
}

function insertParams(t: NewTransaction, createdAt: string): SqlParam[] {
  return [
    t.amountCents,
    t.date,
    t.categoryId,
    t.note,
    t.merchant,
    t.recurringId ?? null,
    t.importBatchId ?? null,
    t.receipt ?? null,
    ...originalParams(t.original),
    createdAt,
  ];
}

/** Inside an existing transaction; used by imports and recurring rules. */
export async function insertTransactionTx(
  tx: Db,
  t: NewTransaction,
  now = new Date(),
): Promise<number> {
  const r = await tx.run(INSERT_SQL, insertParams(t, now.toISOString()));
  return r.lastInsertRowId;
}

export async function addTransaction(db: Db, t: NewTransaction, now = new Date()): Promise<number> {
  return db.transaction((tx) => insertTransactionTx(tx, t, now));
}

export async function updateTransaction(
  db: Db,
  id: number,
  t: Pick<Transaction, 'amountCents' | 'date' | 'categoryId' | 'note' | 'merchant'> & {
    receipt?: string | null;
    original?: ForeignAmount | null;
  },
): Promise<void> {
  // Leaving receipt or original out keeps what is stored; null clears it.
  const sets = ['amount_cents = ?', 'date = ?', 'category_id = ?', 'note = ?', 'merchant = ?'];
  const params: SqlParam[] = [t.amountCents, t.date, t.categoryId, t.note, t.merchant];
  if (t.receipt !== undefined) {
    sets.push('receipt = ?');
    params.push(t.receipt);
  }
  if (t.original !== undefined) {
    sets.push('original_minor = ?', 'original_currency = ?', 'fx_rate_micros = ?');
    params.push(...originalParams(t.original));
  }
  await db.transaction(async (tx) => {
    const r = await tx.run(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, [
      ...params,
      id,
    ]);
    if (r.changes !== 1) throw new Error(`Transaction ${id} not found`);
  });
}

/** Deletes and returns the row so the caller can offer undo. */
export async function deleteTransaction(db: Db, id: number): Promise<Transaction | null> {
  return db.transaction(async (tx) => {
    const row = await tx.first<TransactionRow>(`SELECT ${COLUMNS} FROM transactions WHERE id = ?`, [
      id,
    ]);
    if (!row) return null;
    await tx.run('DELETE FROM transactions WHERE id = ?', [id]);
    return toTransaction(row);
  });
}

/** Puts a deleted row back with its original id, for undo. */
export async function restoreTransaction(db: Db, t: Transaction): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO transactions (id, amount_cents, date, category_id, note, merchant, recurring_id,
         import_batch_id, receipt, original_minor, original_currency, fx_rate_micros, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id,
        t.amountCents,
        t.date,
        t.categoryId,
        t.note,
        t.merchant,
        t.recurringId,
        t.importBatchId,
        t.receipt,
        ...originalParams(t.original),
        t.createdAt,
      ],
    );
  });
}

export async function getTransaction(db: Db, id: number): Promise<Transaction | null> {
  const row = await db.first<TransactionRow>(`SELECT ${COLUMNS} FROM transactions WHERE id = ?`, [
    id,
  ]);
  return row ? toTransaction(row) : null;
}

export interface TransactionQuery {
  month: IsoMonth;
  search?: string;
  categoryId?: number | null;
  /** First day of the budget period; 1 means calendar months. */
  startDay?: number;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** A month's transactions, newest first, optionally filtered by text and category. */
export async function listTransactions(db: Db, q: TransactionQuery): Promise<Transaction[]> {
  const { start, end } = periodRange(q.month, q.startDay);
  const where = ['date BETWEEN ? AND ?'];
  const params: SqlParam[] = [start, end];
  const search = q.search?.trim();
  if (search) {
    where.push("(note LIKE ? ESCAPE '\\' OR merchant LIKE ? ESCAPE '\\')");
    const pattern = `%${escapeLike(search)}%`;
    params.push(pattern, pattern);
  }
  if (q.categoryId != null) {
    where.push('category_id = ?');
    params.push(q.categoryId);
  }
  const rows = await db.all<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC`,
    params,
  );
  return rows.map(toTransaction);
}

export async function recentTransactions(db: Db, limit = 10): Promise<Transaction[]> {
  const rows = await db.all<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions ORDER BY date DESC, id DESC LIMIT ?`,
    [limit],
  );
  return rows.map(toTransaction);
}

export async function allTransactions(db: Db): Promise<Transaction[]> {
  const rows = await db.all<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions ORDER BY date, id`,
  );
  return rows.map(toTransaction);
}

export async function countTransactions(db: Db): Promise<number> {
  const r = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM transactions');
  return r?.n ?? 0;
}

/** Receipt file names still referenced, so unreferenced photos can be removed. */
export async function referencedReceipts(db: Db): Promise<Set<string>> {
  const rows = await db.all<{ receipt: string }>(
    'SELECT receipt FROM transactions WHERE receipt IS NOT NULL',
  );
  return new Set(rows.map((r) => r.receipt));
}

/** Transactions with a merchant on or after `start`, oldest first; input for bill detection. */
export async function transactionsWithMerchantSince(db: Db, start: string): Promise<Transaction[]> {
  const rows = await db.all<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions WHERE date >= ? AND merchant <> '' ORDER BY date, id`,
    [start],
  );
  return rows.map(toTransaction);
}
