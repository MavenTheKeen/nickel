/**
 * @jest-environment node
 */
import { getSchemaVersion, migrate } from '@/db/migrate';
import { migrations } from '@/db/migrations';

import { openTestDb } from '../helpers/testDb';

const latest = migrations.at(-1)!.version;

describe('migrate', () => {
  it('brings an empty database to the latest version', async () => {
    const db = openTestDb();
    expect(await migrate(db)).toEqual({ from: 0, to: latest });
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual([
      'budget_warnings',
      'budgets',
      'categories',
      'category_rules',
      'dismissed_suggestions',
      'events',
      'flags',
      'fx_rates',
      'goal_contributions',
      'goals',
      'import_batches',
      'recurring_rules',
      'settings',
      'transactions',
    ]);
  });

  it('is a no-op when run twice', async () => {
    const db = openTestDb();
    await migrate(db);
    expect(await migrate(db)).toEqual({ from: latest, to: latest });
  });

  it('upgrades a v1 database with data and keeps the data', async () => {
    const db = openTestDb();
    await migrate(db, migrations.slice(0, 1));
    expect(await getSchemaVersion(db)).toBe(1);
    await db.run("INSERT INTO categories (name, color, icon) VALUES ('Food', '#000000', 'food')");
    await db.run(
      "INSERT INTO transactions (amount_cents, date, category_id, created_at) VALUES (-500, '2025-01-02', 1, 'x')",
    );
    await db.run("INSERT INTO flags (key, variant, assigned_at) VALUES ('f', 'A', 'x')");

    expect(await migrate(db)).toEqual({ from: 1, to: latest });
    expect(await db.first('SELECT amount_cents FROM transactions')).toEqual({ amount_cents: -500 });
    expect(await db.first('SELECT variant, overridden FROM flags')).toEqual({
      variant: 'A',
      overridden: 0,
    });
  });

  it('rolls back a failing migration and leaves the version unchanged', async () => {
    const db = openTestDb();
    const broken = [
      ...migrations,
      {
        version: latest + 1,
        name: 'broken',
        sql: 'CREATE TABLE ok_table (id INTEGER); NOT VALID SQL;',
      },
    ];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await getSchemaVersion(db)).toBe(latest);
    const t = await db.first("SELECT name FROM sqlite_master WHERE name = 'ok_table'");
    expect(t).toBeNull();
  });

  it('refuses to open a database from a newer app version', async () => {
    const db = openTestDb();
    await db.exec(`PRAGMA user_version = ${latest + 5}`);
    await expect(migrate(db)).rejects.toThrow(/newer than this app/);
  });

  it('has contiguous version numbers starting at 1', () => {
    migrations.forEach((m, i) => expect(m.version).toBe(i + 1));
  });
});

describe('schema rules', () => {
  async function setup() {
    const db = openTestDb();
    await migrate(db);
    await db.run("INSERT INTO categories (name, color, icon) VALUES ('Food', '#000000', 'food')");
    return db;
  }
  const insertTx = (amount: number | string, date = '2025-01-02', category = 1) =>
    [
      'INSERT INTO transactions (amount_cents, date, category_id, created_at) VALUES (?, ?, ?, ?)',
      [amount, date, category, 'x'],
    ] as const;

  it('rejects non-integer and zero amounts', async () => {
    const db = await setup();
    await expect(db.run(...insertTx(1.5))).rejects.toThrow(/CHECK/);
    await expect(db.run(...insertTx(0))).rejects.toThrow(/CHECK/);
    await expect(db.run(...insertTx('12abc'))).rejects.toThrow(/CHECK/);
  });

  it('rejects malformed dates', async () => {
    const db = await setup();
    await expect(db.run(...insertTx(-100, '2025/01/02'))).rejects.toThrow(/CHECK/);
  });

  it('enforces foreign keys', async () => {
    const db = await setup();
    await expect(db.run(...insertTx(-100, '2025-01-02', 99))).rejects.toThrow(/FOREIGN KEY/);
  });

  it('blocks deleting a category that has transactions', async () => {
    const db = await setup();
    await db.run(...insertTx(-100));
    await expect(db.run('DELETE FROM categories WHERE id = 1')).rejects.toThrow(/FOREIGN KEY/);
  });

  it('keeps one budget per category and month', async () => {
    const db = await setup();
    await db.run(
      "INSERT INTO budgets (category_id, month, limit_cents) VALUES (1, '2025-01', 100)",
    );
    await expect(
      db.run("INSERT INTO budgets (category_id, month, limit_cents) VALUES (1, '2025-01', 200)"),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('uses the date index for month queries', async () => {
    const db = await setup();
    const plan = await db.all<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT * FROM transactions WHERE date BETWEEN '2025-01-01' AND '2025-01-31' ORDER BY date DESC",
    );
    expect(plan.map((p) => p.detail).join(' ')).toMatch(/transactions_date/);
  });
});
