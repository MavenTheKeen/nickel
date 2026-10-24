/**
 * @jest-environment node
 */
import { migrations } from '@/db/migrations';
import { BackupError, countRows, createBackup, parseBackup, restoreBackup } from '@/db/backup';
import { setBudget } from '@/db/repositories/budgets';
import { insertEvent } from '@/db/repositories/events';
import { importBatch } from '@/db/repositories/imports';
import { createRule, generateDueTransactions } from '@/db/repositories/recurring';
import { getInternal, getSettings, setInternal, updateSettings } from '@/db/repositories/settings';
import { allTransactions, countTransactions } from '@/db/repositories/transactions';

import { FIXED_NOW, seededDb, tx } from '../helpers/fixtures';

const SCHEMA = migrations.at(-1)!.version;

async function populated() {
  const ctx = await seededDb();
  const { db, cats } = ctx;
  await setBudget(db, cats.Groceries!.id, '2025-06', 40000);
  await createRule(db, {
    amountCents: -150000,
    categoryId: cats.Rent!.id,
    cadence: 'monthly',
    anchorDate: '2025-05-01',
    note: '',
    merchant: 'Landlord',
  });
  await generateDueTransactions(db, '2025-06-15');
  await importBatch(db, {
    filename: 'bank.csv',
    rows: [tx({ categoryId: cats.Fun!.id, note: 'say "hi", ok' })],
    errorCount: 2,
  });
  await updateSettings(db, { currencySymbol: '€', appLock: true });
  await setInternal(db, 'install_id', 'device-a');
  await insertEvent(db, { name: 'app_open', props: {}, ts: 't', sessionId: 's' });
  return ctx;
}

describe('backup', () => {
  it('round-trips all user data into an empty database with the same ids', async () => {
    const source = await populated();
    const backup = await createBackup(source.db, FIXED_NOW);
    const json = JSON.stringify(backup);

    const target = await seededDb();
    await setInternal(target.db, 'install_id', 'device-b');
    const counts = await restoreBackup(target.db, parseBackup(json, SCHEMA));

    expect(counts).toMatchObject({
      transactions: 3,
      budgets: 1,
      recurring_rules: 1,
      import_batches: 1,
    });
    expect(await allTransactions(target.db)).toEqual(await allTransactions(source.db));
    expect(await getSettings(target.db)).toMatchObject({ currencySymbol: '€', appLock: true });
  });

  it('leaves out analytics and the install id', async () => {
    const { db } = await populated();
    const backup = await createBackup(db);
    expect(Object.keys(backup.tables)).not.toContain('events');
    expect(backup.tables.settings.some((s) => s.key.startsWith('_'))).toBe(false);

    const target = await seededDb();
    await setInternal(target.db, 'install_id', 'device-b');
    await restoreBackup(target.db, backup);
    expect(await getInternal(target.db, 'install_id')).toBe('device-b');
  });

  it('rejects files that are not backups, with a readable reason', () => {
    expect(() => parseBackup('not json', SCHEMA)).toThrow(BackupError);
    expect(() => parseBackup('{"format":"other"}', SCHEMA)).toThrow(/not a valid Nickel backup/);
  });

  it('refuses a backup from a newer schema', async () => {
    const { db } = await populated();
    const backup = { ...(await createBackup(db)), schemaVersion: 99 };
    expect(() => parseBackup(JSON.stringify(backup), SCHEMA)).toThrow(/newer version/);
  });

  it('rejects invalid rows such as float amounts', async () => {
    const { db } = await populated();
    const backup = await createBackup(db);
    backup.tables.transactions[0]!.amount_cents = 12.5;
    expect(() => parseBackup(JSON.stringify(backup), SCHEMA)).toThrow(/amount_cents/);
  });

  it('changes nothing when a row refers to missing data', async () => {
    const { db } = await populated();
    const backup = await createBackup(db);
    backup.tables.transactions[0]!.category_id = 999;

    const target = await seededDb();
    await target.db.run(
      "INSERT INTO transactions (amount_cents, date, category_id, created_at) VALUES (-1, '2025-01-01', 1, 'x')",
    );
    await expect(restoreBackup(target.db, backup)).rejects.toThrow();
    expect(await countTransactions(target.db)).toBe(1);
  });

  it('accepts a backup without the optional tables', async () => {
    const { db } = await populated();
    const backup = await createBackup(db);
    const { settings: _s, budget_warnings: _w, ...rest } = backup.tables;
    const parsed = parseBackup(JSON.stringify({ ...backup, tables: rest }), SCHEMA);
    expect(countRows(parsed).settings).toBe(0);
  });
});
