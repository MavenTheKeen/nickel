import { migrations as allMigrations, type Migration } from './migrations';
import type { Db } from './types';

export async function getSchemaVersion(db: Db): Promise<number> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Applies every migration newer than the database's user_version. Each
 * migration and its version bump commit together, so a failure leaves the
 * database at the last good version. Safe to run any number of times.
 */
export async function migrate(
  db: Db,
  migrations: readonly Migration[] = allMigrations,
): Promise<{ from: number; to: number }> {
  const from = await getSchemaVersion(db);
  const latest = migrations.at(-1)?.version ?? 0;
  if (from > latest) {
    throw new Error(`Database schema v${from} is newer than this app (v${latest})`);
  }
  for (const m of migrations) {
    if (m.version <= from) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      // user_version cannot be bound as a parameter; the value is an integer we control.
      await tx.exec(`PRAGMA user_version = ${Math.trunc(m.version)}`);
    });
  }
  return { from, to: await getSchemaVersion(db) };
}
