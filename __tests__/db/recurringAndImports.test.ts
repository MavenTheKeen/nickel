/**
 * @jest-environment node
 */
import { allEvents, insertEvent, pruneEvents, recentEvents } from '@/db/repositories/events';
import {
  clearStoredFlags,
  getStoredFlag,
  listStoredFlags,
  storeFlag,
} from '@/db/repositories/flags';
import { importBatch, listBatches, undoBatch } from '@/db/repositories/imports';
import {
  createRule,
  deleteRule,
  generateDueTransactions,
  getRule,
  listRules,
  markNextPaid,
  skipNext,
  updateRule,
} from '@/db/repositories/recurring';
import {
  DEFAULT_SETTINGS,
  getInternal,
  getSettings,
  recordBudgetWarning,
  setInternal,
  updateSettings,
} from '@/db/repositories/settings';
import { allTransactions, countTransactions, getTransaction } from '@/db/repositories/transactions';

import { FIXED_NOW, seededDb, tx } from '../helpers/fixtures';

describe('recurring rules', () => {
  async function rent(anchorDate = '2025-01-31') {
    const { db, cats } = await seededDb();
    const id = await createRule(db, {
      amountCents: -150000,
      categoryId: cats.Rent!.id,
      cadence: 'monthly',
      anchorDate,
      note: 'Rent',
      merchant: 'Landlord',
    });
    return { db, cats, id };
  }

  it('generates every missed occurrence on the 31st, clamped in short months', async () => {
    const { db, id } = await rent();
    expect(await generateDueTransactions(db, '2025-05-01', FIXED_NOW)).toBe(4);
    expect((await allTransactions(db)).map((t) => t.date)).toEqual([
      '2025-01-31',
      '2025-02-28',
      '2025-03-31',
      '2025-04-30',
    ]);
    expect(await getRule(db, id)).toMatchObject({ nextIndex: 4, nextDue: '2025-05-31' });
  });

  it('does nothing when run again the same day', async () => {
    const { db } = await rent();
    await generateDueTransactions(db, '2025-03-01');
    expect(await generateDueTransactions(db, '2025-03-01')).toBe(0);
    expect(await countTransactions(db)).toBe(2);
  });

  it('handles a yearly bill on February 29', async () => {
    const { db, cats } = await seededDb();
    await createRule(db, {
      amountCents: -9900,
      categoryId: cats.Bills!.id,
      cadence: 'yearly',
      anchorDate: '2024-02-29',
      note: '',
      merchant: 'Domain',
    });
    await generateDueTransactions(db, '2028-03-01');
    expect((await allTransactions(db)).map((t) => t.date)).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });

  it('marks the next one paid today and moves on', async () => {
    const { db, id } = await rent('2025-02-10');
    const txId = await markNextPaid(db, id, '2025-02-05', FIXED_NOW);
    expect(await getTransaction(db, txId)).toMatchObject({ date: '2025-02-05', recurringId: id });
    expect(await getRule(db, id)).toMatchObject({ nextIndex: 1, nextDue: '2025-03-10' });
    // The paid occurrence is not generated again.
    expect(await generateDueTransactions(db, '2025-02-28')).toBe(0);
  });

  it('allows paying twice on the same day', async () => {
    const { db, id } = await rent('2025-02-10');
    await markNextPaid(db, id, '2025-02-05');
    await markNextPaid(db, id, '2025-02-05');
    expect(await countTransactions(db)).toBe(2);
  });

  it('skips once without a transaction', async () => {
    const { db, id } = await rent('2025-02-10');
    await skipNext(db, id);
    expect(await getRule(db, id)).toMatchObject({ nextDue: '2025-03-10' });
    expect(await countTransactions(db)).toBe(0);
  });

  it('restarts the schedule when the anchor changes and keeps it otherwise', async () => {
    const { db, cats, id } = await rent('2025-01-15');
    await generateDueTransactions(db, '2025-02-20');
    const base = {
      amountCents: -160000,
      categoryId: cats.Rent!.id,
      cadence: 'monthly' as const,
      note: '',
      merchant: '',
    };
    await updateRule(db, id, { ...base, anchorDate: '2025-01-15' });
    expect(await getRule(db, id)).toMatchObject({ nextIndex: 2, amountCents: -160000 });
    await updateRule(db, id, { ...base, anchorDate: '2025-03-01' });
    expect(await getRule(db, id)).toMatchObject({ nextIndex: 0, nextDue: '2025-03-01' });
  });

  it('keeps generated transactions when a rule is deleted', async () => {
    const { db, id } = await rent();
    await generateDueTransactions(db, '2025-02-28');
    await deleteRule(db, id);
    expect(await listRules(db)).toEqual([]);
    const all = await allTransactions(db);
    expect(all).toHaveLength(2);
    expect(all.every((t) => t.recurringId === null)).toBe(true);
  });
});

describe('import batches', () => {
  it('imports all rows in one batch and undoes them together', async () => {
    const { db, cats } = await seededDb();
    await importBatch(db, {
      filename: 'old.csv',
      rows: [tx({ categoryId: cats.Fun!.id })],
      errorCount: 0,
    });
    const rows = Array.from({ length: 50 }, (_, i) =>
      tx({ categoryId: cats.Groceries!.id, amountCents: -(i + 1) }),
    );
    const batchId = await importBatch(db, { filename: 'bank.csv', rows, errorCount: 3 }, FIXED_NOW);
    expect(await countTransactions(db)).toBe(51);
    expect((await listBatches(db))[0]).toEqual({
      id: batchId,
      filename: 'bank.csv',
      importedAt: FIXED_NOW.toISOString(),
      rowCount: 50,
      errorCount: 3,
    });
    expect(await undoBatch(db, batchId)).toBe(50);
    expect(await countTransactions(db)).toBe(1);
    expect(await listBatches(db)).toHaveLength(1);
  });

  it('writes nothing if any row fails', async () => {
    const { db, cats } = await seededDb();
    const rows = [tx({ categoryId: cats.Fun!.id }), tx({ categoryId: 9999 })];
    await expect(importBatch(db, { filename: 'x.csv', rows, errorCount: 0 })).rejects.toThrow();
    expect(await countTransactions(db)).toBe(0);
    expect(await listBatches(db)).toEqual([]);
  });
});

describe('settings', () => {
  it('returns defaults and stores typed values', async () => {
    const { db } = await seededDb();
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
    await updateSettings(db, { currencySymbol: '€', notifyWeekly: false });
    expect(await getSettings(db)).toMatchObject({
      currencySymbol: '€',
      notifyWeekly: false,
      notifyBills: true,
    });
  });

  it('keeps internal values out of user settings', async () => {
    const { db } = await seededDb();
    await setInternal(db, 'install_id', 'abc');
    expect(await getInternal(db, 'install_id')).toBe('abc');
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('records each budget warning once per month', async () => {
    const { db, cats } = await seededDb();
    const g = cats.Groceries!.id;
    expect(await recordBudgetWarning(db, g, '2025-06', 80)).toBe(true);
    expect(await recordBudgetWarning(db, g, '2025-06', 80)).toBe(false);
    expect(await recordBudgetWarning(db, g, '2025-06', 100)).toBe(true);
    expect(await recordBudgetWarning(db, g, '2025-07', 80)).toBe(true);
  });
});

describe('events and flags', () => {
  it('appends events and reads newest first', async () => {
    const { db } = await seededDb();
    for (let i = 0; i < 5; i++) {
      await insertEvent(db, { name: 'e', props: { i }, ts: `t${i}`, sessionId: 's' });
    }
    const recent = await recentEvents(db, 2);
    expect(recent.map((e) => e.props.i)).toEqual([4, 3]);
    expect(await allEvents(db)).toHaveLength(5);
  });

  it('survives corrupt props json', async () => {
    const { db } = await seededDb();
    await db.run(
      "INSERT INTO events (name, props_json, ts, session_id) VALUES ('x', 'not json', 't', 's')",
    );
    expect((await recentEvents(db))[0]!.props).toEqual({});
  });

  it('prunes old events', async () => {
    const { db } = await seededDb();
    for (let i = 0; i < 10; i++)
      await insertEvent(db, { name: 'e', props: { i }, ts: 't', sessionId: 's' });
    expect(await pruneEvents(db, 3)).toBe(7);
    expect((await allEvents(db)).map((e) => e.props.i)).toEqual([7, 8, 9]);
  });

  it('stores, overrides and clears flags', async () => {
    const { db } = await seededDb();
    await storeFlag(db, 'onboarding_v1', 'A', false, FIXED_NOW);
    await storeFlag(db, 'onboarding_v1', 'B', true, FIXED_NOW);
    expect(await getStoredFlag(db, 'onboarding_v1')).toEqual({
      key: 'onboarding_v1',
      variant: 'B',
      assignedAt: FIXED_NOW.toISOString(),
      overridden: true,
    });
    await clearStoredFlags(db);
    expect(await listStoredFlags(db)).toEqual([]);
  });
});
