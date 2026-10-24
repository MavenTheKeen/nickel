import { z } from 'zod';

import { getSchemaVersion } from './migrate';
import type { Db, SqlParam } from './types';

// A full backup of the user's data as JSON. Analytics (events, flags) and the
// install id are left out: they describe this install, not the user's money.
// Restoring replaces all data in one transaction and keeps original ids, so
// links between rows (category, bill, import batch) survive.

export const BACKUP_FORMAT = 'nickel-backup';
export const BACKUP_VERSION = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int();
const bit = z.union([z.literal(0), z.literal(1)]);

const tableSchemas = {
  categories: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(40),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    icon: z.string().min(1).max(40),
    is_income: bit,
    archived: bit,
    sort_order: z.number().int(),
    // Added in schema 3; older backups default to off.
    rollover: bit.default(0),
  }),
  import_batches: z.object({
    id: z.number().int().positive(),
    filename: z.string().max(255),
    imported_at: z.string(),
    row_count: z.number().int().min(0),
    error_count: z.number().int().min(0),
  }),
  recurring_rules: z.object({
    id: z.number().int().positive(),
    amount_cents: cents.refine((v) => v !== 0),
    category_id: z.number().int().positive(),
    cadence: z.enum(['weekly', 'monthly', 'yearly']),
    anchor_date: isoDate,
    next_index: z.number().int().min(0),
    next_due: isoDate,
    note: z.string().max(500),
    merchant: z.string().max(120),
    active: bit,
  }),
  transactions: z.object({
    id: z.number().int().positive(),
    amount_cents: cents.refine((v) => v !== 0),
    date: isoDate,
    category_id: z.number().int().positive(),
    note: z.string().max(500),
    merchant: z.string().max(120),
    recurring_id: z.number().int().positive().nullable(),
    import_batch_id: z.number().int().positive().nullable(),
    // Added in schema 3. Only the file name is backed up, not the photo.
    receipt: z
      .string()
      .regex(/^[\w-]+\.jpg$/)
      .nullable()
      .default(null),
    // Added in schema 4.
    original_minor: cents
      .refine((v) => v !== 0)
      .nullable()
      .default(null),
    original_currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .default(null),
    fx_rate_micros: z.number().int().positive().nullable().default(null),
    created_at: z.string(),
  }),
  budgets: z.object({
    id: z.number().int().positive(),
    category_id: z.number().int().positive(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    limit_cents: cents.positive(),
  }),
  settings: z.object({ key: z.string().regex(/^[a-zA-Z]+$/), value: z.string().max(100) }),
  budget_warnings: z.object({
    category_id: z.number().int().positive(),
    month: z.string(),
    threshold: z.union([z.literal(80), z.literal(100)]),
    sent_at: z.string(),
  }),
  category_rules: z.object({
    id: z.number().int().positive(),
    pattern: z.string().min(1).max(120),
    category_id: z.number().int().positive(),
    created_at: z.string(),
  }),
  goals: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(60),
    target_cents: cents.positive(),
    target_date: isoDate.nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    icon: z.string().min(1).max(40),
    created_at: z.string(),
    archived: bit,
  }),
  goal_contributions: z.object({
    id: z.number().int().positive(),
    goal_id: z.number().int().positive(),
    amount_cents: cents.refine((v) => v !== 0),
    date: isoDate,
    note: z.string().max(500),
  }),
  dismissed_suggestions: z.object({
    merchant_key: z.string().min(1).max(120),
    dismissed_at: z.string(),
  }),
} as const;

type TableName = keyof typeof tableSchemas;

/** Insert order respects foreign keys; deletes run in reverse. */
const TABLE_ORDER: readonly TableName[] = [
  'categories',
  'import_batches',
  'recurring_rules',
  'transactions',
  'budgets',
  'settings',
  'budget_warnings',
  'category_rules',
  'goals',
  'goal_contributions',
  'dismissed_suggestions',
];

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  tables: z.object({
    categories: z.array(tableSchemas.categories),
    import_batches: z.array(tableSchemas.import_batches),
    recurring_rules: z.array(tableSchemas.recurring_rules),
    transactions: z.array(tableSchemas.transactions),
    budgets: z.array(tableSchemas.budgets),
    settings: z.array(tableSchemas.settings).default([]),
    budget_warnings: z.array(tableSchemas.budget_warnings).default([]),
    // Tables added in schema 3; absent from older backups.
    category_rules: z.array(tableSchemas.category_rules).default([]),
    goals: z.array(tableSchemas.goals).default([]),
    goal_contributions: z.array(tableSchemas.goal_contributions).default([]),
    dismissed_suggestions: z.array(tableSchemas.dismissed_suggestions).default([]),
  }),
});

export type Backup = z.infer<typeof backupSchema>;
export type BackupCounts = Record<TableName, number>;

export async function createBackup(db: Db, now = new Date()): Promise<Backup> {
  const tables = {} as Record<TableName, unknown[]>;
  await db.transaction(async (tx) => {
    for (const t of TABLE_ORDER) {
      // Settings keys starting with "_" are per-install internals such as the install id.
      const where = t === 'settings' ? " WHERE key NOT LIKE '\\_%' ESCAPE '\\'" : '';
      tables[t] = await tx.all(`SELECT * FROM ${t}${where} ORDER BY rowid`);
    }
  });
  return backupSchema.parse({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schemaVersion: await getSchemaVersion(db),
    exportedAt: now.toISOString(),
    tables,
  });
}

export function countRows(backup: Backup): BackupCounts {
  return Object.fromEntries(TABLE_ORDER.map((t) => [t, backup.tables[t].length])) as BackupCounts;
}

export class BackupError extends Error {
  override name = 'BackupError';
}

/** Parses and validates a backup file without touching the database. */
export function parseBackup(text: string, currentSchemaVersion: number): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not a Nickel backup (it is not valid JSON).');
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BackupError(
      `This file is not a valid Nickel backup (${issue?.path.join('.') || 'file'}: ${issue?.message ?? 'invalid'}).`,
    );
  }
  if (parsed.data.schemaVersion > currentSchemaVersion) {
    throw new BackupError(
      'This backup was made by a newer version of Nickel. Update the app first.',
    );
  }
  return parsed.data;
}

/**
 * Replaces all user data with the backup. One transaction: if any row is
 * rejected (for example a transaction pointing at a missing category), the
 * database is left exactly as it was.
 */
export async function restoreBackup(db: Db, backup: Backup): Promise<BackupCounts> {
  await db.transaction(async (tx) => {
    for (const t of [...TABLE_ORDER].reverse()) {
      await tx.run(
        t === 'settings'
          ? "DELETE FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'"
          : `DELETE FROM ${t}`,
      );
    }
    for (const t of TABLE_ORDER) {
      for (const row of backup.tables[t] as Record<string, SqlParam>[]) {
        const cols = Object.keys(row);
        await tx.run(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => row[c] ?? null),
        );
      }
    }
    const fk = await tx.all<{ table: string }>('PRAGMA foreign_key_check');
    if (fk.length > 0)
      throw new BackupError(`The backup has rows that refer to missing data (${fk[0]!.table}).`);
  });
  return countRows(backup);
}
