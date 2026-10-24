import type { Db } from '@/db/types';
import type { ImportBatch, NewTransaction } from '@/types/domain';

import { insertTransactionTx } from './transactions';

interface BatchRow {
  id: number;
  filename: string;
  imported_at: string;
  row_count: number;
  error_count: number;
}

const toBatch = (r: BatchRow): ImportBatch => ({
  id: r.id,
  filename: r.filename,
  importedAt: r.imported_at,
  rowCount: r.row_count,
  errorCount: r.error_count,
});

/**
 * Writes all valid rows and the batch record in one SQL transaction: either
 * the whole import lands or none of it does.
 */
export async function importBatch(
  db: Db,
  params: { filename: string; rows: readonly NewTransaction[]; errorCount: number },
  now = new Date(),
): Promise<number> {
  return db.transaction(async (tx) => {
    const batch = await tx.run(
      'INSERT INTO import_batches (filename, imported_at, row_count, error_count) VALUES (?, ?, ?, ?)',
      [params.filename, now.toISOString(), params.rows.length, params.errorCount],
    );
    const batchId = batch.lastInsertRowId;
    for (const row of params.rows) {
      await insertTransactionTx(tx, { ...row, importBatchId: batchId, recurringId: null }, now);
    }
    return batchId;
  });
}

export async function listBatches(db: Db): Promise<ImportBatch[]> {
  const rows = await db.all<BatchRow>(
    'SELECT id, filename, imported_at, row_count, error_count FROM import_batches ORDER BY id DESC',
  );
  return rows.map(toBatch);
}

/** Removes a batch and, through ON DELETE CASCADE, every transaction it created. */
export async function undoBatch(db: Db, batchId: number): Promise<number> {
  return db.transaction(async (tx) => {
    const n = await tx.first<{ n: number }>(
      'SELECT COUNT(*) AS n FROM transactions WHERE import_batch_id = ?',
      [batchId],
    );
    await tx.run('DELETE FROM import_batches WHERE id = ?', [batchId]);
    return n?.n ?? 0;
  });
}
