import type { Db } from '@/db/types';

export interface StoredFlag {
  key: string;
  variant: string;
  assignedAt: string;
  overridden: boolean;
}

interface FlagRow {
  key: string;
  variant: string;
  assigned_at: string;
  overridden: number;
}

const toFlag = (r: FlagRow): StoredFlag => ({
  key: r.key,
  variant: r.variant,
  assignedAt: r.assigned_at,
  overridden: r.overridden === 1,
});

export async function listStoredFlags(db: Db): Promise<StoredFlag[]> {
  const rows = await db.all<FlagRow>(
    'SELECT key, variant, assigned_at, overridden FROM flags ORDER BY key',
  );
  return rows.map(toFlag);
}

export async function getStoredFlag(db: Db, key: string): Promise<StoredFlag | null> {
  const r = await db.first<FlagRow>(
    'SELECT key, variant, assigned_at, overridden FROM flags WHERE key = ?',
    [key],
  );
  return r ? toFlag(r) : null;
}

export async function storeFlag(
  db: Db,
  key: string,
  variant: string,
  overridden: boolean,
  now = new Date(),
): Promise<void> {
  await db.run(
    `INSERT INTO flags (key, variant, assigned_at, overridden) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET variant = excluded.variant, assigned_at = excluded.assigned_at,
       overridden = excluded.overridden`,
    [key, variant, now.toISOString(), overridden ? 1 : 0],
  );
}

export async function clearStoredFlags(db: Db): Promise<void> {
  await db.run('DELETE FROM flags');
}
