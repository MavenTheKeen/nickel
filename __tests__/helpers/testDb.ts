import { DatabaseSync } from 'node:sqlite';

import { migrate } from '@/db/migrate';
import type { Migration } from '@/db/migrations';
import { createSerialDb } from '@/db/serialDb';
import type { Db, SqlParam } from '@/db/types';

/** An in-memory SQLite database behind the same Db interface the app uses. */
export function openTestDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const params = (p: readonly SqlParam[]) => p as SqlParam[];
  const db = createSerialDb({
    exec: async (sql) => {
      raw.exec(sql);
    },
    run: async (sql, p) => {
      const r = raw.prepare(sql).run(...params(p));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    all: async <T>(sql: string, p: readonly SqlParam[]) =>
      raw
        .prepare(sql)
        .all(...params(p))
        .map((row) => ({ ...row })) as T[],
    first: async <T>(sql: string, p: readonly SqlParam[]) => {
      const row = raw.prepare(sql).get(...params(p));
      return (row ? { ...row } : null) as T | null;
    },
  });
  return Object.assign(db, { raw });
}

export async function openMigratedDb(migrations?: readonly Migration[]) {
  const db = openTestDb();
  await migrate(db, migrations);
  return db;
}
