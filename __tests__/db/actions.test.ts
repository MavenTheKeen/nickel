/**
 * @jest-environment node
 */
import { setBudget } from '@/db/repositories/budgets';
import { listCategories } from '@/db/repositories/categories';
import { allEvents, insertEvent } from '@/db/repositories/events';
import { listStoredFlags } from '@/db/repositories/flags';
import { importBatch } from '@/db/repositories/imports';
import { createRule } from '@/db/repositories/recurring';
import { updateSettings } from '@/db/repositories/settings';
import { allTransactions, countTransactions } from '@/db/repositories/transactions';
import { __testing, attachEventSink } from '@/events/track';
import { onboardingFlag } from '@/flags/definitions';
import {
  ensureInstallId,
  getVariant,
  listFlagStates,
  overrideVariant,
  resetInstallId,
} from '@/flags/store';
import {
  importRows,
  onAppStart,
  removeTransaction,
  rescheduleNotifications,
  saveTransaction,
  weeklySummary,
  type Effects,
} from '@/hooks/actions';
import { loadBudgets, loadHome, loadInsights, upcomingBills } from '@/hooks/loaders';
import { generateDemoTransactions } from '@/services/demoData';

import { seededDb, tx } from '../helpers/fixtures';

function fakeEffects() {
  const notified: { title: string; body: string }[] = [];
  const plans: number[] = [];
  const effects: Effects = {
    notifyNow: async (title, body) => {
      notified.push({ title, body });
    },
    applyPlan: async (plan) => {
      plans.push(plan.length);
      return plan.length;
    },
    requestPermission: async () => true,
  };
  return { effects, notified, plans };
}

async function withEvents() {
  const ctx = await seededDb();
  __testing.reset();
  await attachEventSink((e) => insertEvent(ctx.db, e), 'test-session');
  return ctx;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('saveTransaction', () => {
  it('saves, tracks the event and sends a budget warning once', async () => {
    const { db, cats } = await withEvents();
    const g = cats.Groceries!.id;
    await setBudget(db, g, '2025-06', 10000);
    const { effects, notified } = fakeEffects();
    const input = {
      amountCents: -8500,
      date: '2025-06-10',
      categoryId: g,
      note: '',
      merchant: 'Loblaws',
    };

    await saveTransaction(db, effects, input, { today: '2025-06-10' });
    expect(notified).toEqual([
      { title: 'Groceries is at 80% of budget', body: '$85.00 of $100.00 spent this month' },
    ]);

    await saveTransaction(db, effects, { ...input, amountCents: -500 }, { today: '2025-06-10' });
    expect(notified).toHaveLength(1);

    await saveTransaction(db, effects, { ...input, amountCents: -2000 }, { today: '2025-06-10' });
    expect(notified[1]!.title).toBe('Groceries is over budget');

    await flush();
    const events = await allEvents(db);
    expect(events.filter((e) => e.name === 'transaction_added')).toHaveLength(3);
  });

  it('respects the budget warning setting', async () => {
    const { db, cats } = await seededDb();
    await setBudget(db, cats.Fun!.id, '2025-06', 1000);
    await updateSettings(db, { notifyBudget: false });
    const { effects, notified } = fakeEffects();
    await saveTransaction(
      db,
      effects,
      { amountCents: -5000, date: '2025-06-10', categoryId: cats.Fun!.id, note: '', merchant: '' },
      { today: '2025-06-10' },
    );
    expect(notified).toEqual([]);
  });

  it('updates an existing transaction without a new added event', async () => {
    const { db, cats } = await withEvents();
    const { effects } = fakeEffects();
    const base = {
      amountCents: -100,
      date: '2025-06-10',
      categoryId: cats.Fun!.id,
      note: '',
      merchant: '',
    };
    const id = await saveTransaction(db, effects, base, { today: '2025-06-10' });
    await saveTransaction(db, effects, { ...base, amountCents: -200 }, { id, today: '2025-06-10' });
    await flush();
    expect((await allTransactions(db))[0]!.amountCents).toBe(-200);
    expect((await allEvents(db)).filter((e) => e.name === 'transaction_added')).toHaveLength(1);
    expect(await removeTransaction(db, effects, id, '2025-06-10')).toMatchObject({ id });
  });
});

describe('imports and startup', () => {
  it('imports rows, logs completion and timing', async () => {
    const { db, cats } = await withEvents();
    const { effects } = fakeEffects();
    const rows = [tx({ categoryId: cats.Fun!.id }), tx({ categoryId: cats.Fun!.id })];
    await importRows(db, effects, {
      filename: 'a.csv',
      rows,
      errorCount: 1,
      totalRows: 3,
      today: '2025-06-10',
    });
    await flush();
    const names = (await allEvents(db)).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['import_completed', 'timing']));
  });

  it('logs a failed import and rethrows', async () => {
    const { db } = await withEvents();
    await expect(
      importRows(db, fakeEffects().effects, {
        filename: 'bad.csv',
        rows: [tx({ categoryId: 999 })],
        errorCount: 0,
        totalRows: 1,
        today: '2025-06-10',
      }),
    ).rejects.toThrow();
    await flush();
    expect((await allEvents(db)).some((e) => e.name === 'import_failed')).toBe(true);
  });

  it('generates due bills and reschedules on start', async () => {
    const { db, cats } = await seededDb();
    await createRule(db, {
      amountCents: -5000,
      categoryId: cats.Bills!.id,
      cadence: 'weekly',
      anchorDate: '2025-06-01',
      note: '',
      merchant: 'Gym',
    });
    const { effects, plans } = fakeEffects();
    expect(await onAppStart(db, effects, '2025-06-15')).toEqual({ generated: 3 });
    expect(plans).toHaveLength(1);
    expect(await countTransactions(db)).toBe(3);
  });

  it('builds a notification plan from stored rules and settings', async () => {
    const { db, cats } = await seededDb();
    await createRule(db, {
      amountCents: -5000,
      categoryId: cats.Bills!.id,
      cadence: 'monthly',
      anchorDate: '2025-07-01',
      note: '',
      merchant: 'Phone',
    });
    const { effects } = fakeEffects();
    expect(await rescheduleNotifications(db, effects, '2025-06-15', 600)).toBe(2); // the 07-01 bill (08-01 is past the horizon) + weekly
    await updateSettings(db, { notifyBills: false, notifyWeekly: false });
    expect(await rescheduleNotifications(db, effects, '2025-06-15', 600)).toBe(0);
  });

  it('summarises the week from Monday to today', async () => {
    const { db, cats } = await seededDb();
    // 2025-06-18 is a Wednesday; the week started on Monday 2025-06-16.
    await saveTransaction(
      db,
      fakeEffects().effects,
      { amountCents: -1000, date: '2025-06-15', categoryId: cats.Fun!.id, note: '', merchant: '' },
      { today: '2025-06-18' },
    );
    await saveTransaction(
      db,
      fakeEffects().effects,
      { amountCents: -2500, date: '2025-06-16', categoryId: cats.Fun!.id, note: '', merchant: '' },
      { today: '2025-06-18' },
    );
    await setBudget(db, cats.Fun!.id, '2025-06', 30000);
    expect(await weeklySummary(db, '2025-06-18')).toEqual({ spentCents: 2500, budgetCents: 7000 });
  });
});

describe('loaders', () => {
  it('computes Home numbers from the database', async () => {
    const { db, cats } = await seededDb();
    const { effects } = fakeEffects();
    await setBudget(db, cats.Groceries!.id, '2025-06', 30000);
    await saveTransaction(
      db,
      effects,
      {
        amountCents: -10000,
        date: '2025-06-05',
        categoryId: cats.Groceries!.id,
        note: '',
        merchant: '',
      },
      { today: '2025-06-21' },
    );
    await saveTransaction(
      db,
      effects,
      { amountCents: -4000, date: '2025-06-06', categoryId: cats.Fun!.id, note: '', merchant: '' },
      { today: '2025-06-21' },
    );
    await saveTransaction(
      db,
      effects,
      {
        amountCents: 200000,
        date: '2025-06-01',
        categoryId: cats.Salary!.id,
        note: '',
        merchant: '',
      },
      { today: '2025-06-21' },
    );

    const home = await loadHome(db, '2025-06-21');
    expect(home).toMatchObject({
      hasBudgets: true,
      totalLimitCents: 30000,
      budgetedSpentCents: 10000,
      monthExpenseCents: 14000,
      monthIncomeCents: 200000,
      safeToSpendCents: 2000, // 20000 left over 10 days
    });
    expect(home.recent).toHaveLength(3);
  });

  it('matches the database after add, edit and delete', async () => {
    const { db, cats } = await seededDb();
    const { effects } = fakeEffects();
    await setBudget(db, cats.Fun!.id, '2025-06', 10000);
    const id = await saveTransaction(
      db,
      effects,
      { amountCents: -3000, date: '2025-06-10', categoryId: cats.Fun!.id, note: '', merchant: '' },
      { today: '2025-06-21' },
    );
    expect((await loadHome(db, '2025-06-21')).budgetedSpentCents).toBe(3000);
    await saveTransaction(
      db,
      effects,
      { amountCents: -5000, date: '2025-06-10', categoryId: cats.Fun!.id, note: '', merchant: '' },
      { id, today: '2025-06-21' },
    );
    expect((await loadHome(db, '2025-06-21')).budgetedSpentCents).toBe(5000);
    await removeTransaction(db, effects, id, '2025-06-21');
    expect((await loadHome(db, '2025-06-21')).budgetedSpentCents).toBe(0);
  });

  it('lists every expense category for budgets, budgeted first', async () => {
    const { db, cats } = await seededDb();
    await setBudget(db, cats.Fun!.id, '2025-06', 10000);
    const rows = await loadBudgets(db, '2025-06');
    expect(rows[0]!.category.name).toBe('Fun');
    expect(rows[0]!.progress).toMatchObject({ percent: 0, level: 'ok' });
    expect(rows.every((r) => !r.category.isIncome)).toBe(true);
    expect(rows[1]!.progress).toBeNull();
  });

  it('loads a year of insights for 10,000 transactions', async () => {
    const { db } = await seededDb();
    const rows = generateDemoTransactions({
      categories: await listCategories(db),
      today: '2025-06-30',
      count: 10000,
    });
    await importBatch(db, { filename: 'demo', rows, errorCount: 0 });
    const start = performance.now();
    const data = await loadInsights(db, '2025-06');
    const ms = performance.now() - start;
    expect(data.trend).toHaveLength(12);
    expect(data.trend.every((t) => t.expenseCents > 0)).toBe(true);
    expect(data.merchants.length).toBeGreaterThan(0);
    // Generous bound for slow CI machines; the measured figure goes in the README.
    expect(ms).toBeLessThan(1000);
  });

  it('lists upcoming bills in date order', () => {
    const r = (id: number, anchorDate: string) => ({
      id,
      amountCents: -1,
      categoryId: 1,
      cadence: 'monthly' as const,
      anchorDate,
      nextIndex: 0,
      nextDue: anchorDate,
      note: '',
      merchant: '',
      active: true,
    });
    expect(
      upcomingBills([r(1, '2025-06-25'), r(2, '2025-06-21'), r(3, '2025-07-10')], '2025-06-20').map(
        (u) => u.rule.id,
      ),
    ).toEqual([2, 1]);
  });
});

describe('flag store', () => {
  it('keeps the install id and the first assignment', async () => {
    const { db } = await withEvents();
    const id = await ensureInstallId(db, () => 'install-1');
    expect(await ensureInstallId(db, () => 'other')).toBe(id);
    const v = await getVariant(db, onboardingFlag, id);
    expect(await getVariant(db, onboardingFlag, 'a-different-id')).toBe(v);
    await flush();
    expect((await allEvents(db)).filter((e) => e.name === 'experiment_exposure')).toHaveLength(1);
  });

  it('overrides and resets', async () => {
    const { db } = await seededDb();
    await getVariant(db, onboardingFlag, 'x');
    await overrideVariant(db, onboardingFlag.key, 'B');
    expect((await listFlagStates(db))[0]).toMatchObject({ variant: 'B', overridden: true });
    await expect(overrideVariant(db, onboardingFlag.key, 'C')).rejects.toThrow();
    await resetInstallId(db, () => 'new-id');
    // Overrides survive a reset; automatic assignments are cleared.
    expect(await listStoredFlags(db)).toHaveLength(1);
  });
});
