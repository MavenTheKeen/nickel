/**
 * @jest-environment node
 */
import {
  copyBudgetsFromPreviousMonth,
  listBudgets,
  removeBudget,
  setBudget,
} from '@/db/repositories/budgets';
import { setCategoryArchived } from '@/db/repositories/categories';
import {
  budgetLines,
  categorySpent,
  largestExpenses,
  monthlyTotals,
  spendingByCategory,
  spentBetween,
  topMerchants,
} from '@/db/repositories/reports';
import { addTransaction } from '@/db/repositories/transactions';

import { seededDb, tx } from '../helpers/fixtures';

describe('budgets', () => {
  it('sets and replaces a limit', async () => {
    const { db, cats } = await seededDb();
    const g = cats.Groceries!.id;
    await setBudget(db, g, '2025-06', 40000);
    await setBudget(db, g, '2025-06', 45000);
    expect(await listBudgets(db, '2025-06')).toEqual([
      expect.objectContaining({ categoryId: g, limitCents: 45000 }),
    ]);
    await removeBudget(db, g, '2025-06');
    expect(await listBudgets(db, '2025-06')).toEqual([]);
  });

  it('copies last month without overwriting or copying archived categories', async () => {
    const { db, cats } = await seededDb();
    await setBudget(db, cats.Groceries!.id, '2025-05', 40000);
    await setBudget(db, cats.Fun!.id, '2025-05', 10000);
    await setBudget(db, cats.Rent!.id, '2025-05', 150000);
    await setBudget(db, cats.Fun!.id, '2025-06', 5000);
    await setCategoryArchived(db, cats.Rent!.id, true);

    expect(await copyBudgetsFromPreviousMonth(db, '2025-06')).toBe(1);
    const june = await listBudgets(db, '2025-06');
    expect(june.find((b) => b.categoryId === cats.Fun!.id)?.limitCents).toBe(5000);
    expect(june.find((b) => b.categoryId === cats.Groceries!.id)?.limitCents).toBe(40000);
    expect(june.some((b) => b.categoryId === cats.Rent!.id)).toBe(false);
  });

  it('copies across a year boundary', async () => {
    const { db, cats } = await seededDb();
    await setBudget(db, cats.Fun!.id, '2024-12', 1000);
    expect(await copyBudgetsFromPreviousMonth(db, '2025-01')).toBe(1);
  });
});

describe('reports', () => {
  async function sample() {
    const { db, cats } = await seededDb();
    const g = cats.Groceries!.id;
    const f = cats.Fun!.id;
    const s = cats.Salary!.id;
    await addTransaction(
      db,
      tx({ categoryId: g, amountCents: -5000, merchant: 'Loblaws', date: '2025-06-02' }),
    );
    await addTransaction(
      db,
      tx({ categoryId: g, amountCents: -3000, merchant: 'loblaws', date: '2025-06-09' }),
    );
    await addTransaction(
      db,
      tx({
        categoryId: g,
        amountCents: 1000,
        merchant: 'Loblaws',
        note: 'refund',
        date: '2025-06-10',
      }),
    );
    await addTransaction(
      db,
      tx({ categoryId: f, amountCents: -12000, merchant: 'Concert', date: '2025-06-15' }),
    );
    await addTransaction(
      db,
      tx({ categoryId: s, amountCents: 300000, merchant: 'Employer', date: '2025-06-01' }),
    );
    await addTransaction(db, tx({ categoryId: g, amountCents: -2000, date: '2025-04-03' }));
    return { db, g, f, s, health: cats.Health!.id };
  }

  it('sums net spending per expense category, refunds included', async () => {
    const { db, g, f } = await sample();
    expect(await spendingByCategory(db, '2025-06')).toEqual([
      { categoryId: f, spentCents: 12000 },
      { categoryId: g, spentCents: 7000 },
    ]);
  });

  it('gives 12 zero-filled months of totals', async () => {
    const { db } = await sample();
    const totals = await monthlyTotals(db, '2025-06', 12);
    expect(totals).toHaveLength(12);
    expect(totals[0]!.month).toBe('2024-07');
    expect(totals.at(-1)).toEqual({ month: '2025-06', expenseCents: 19000, incomeCents: 300000 });
    expect(totals.find((t) => t.month === '2025-04')).toEqual({
      month: '2025-04',
      expenseCents: 2000,
      incomeCents: 0,
    });
    expect(totals.find((t) => t.month === '2025-05')).toEqual({
      month: '2025-05',
      expenseCents: 0,
      incomeCents: 0,
    });
  });

  it('ranks top merchants ignoring case and income', async () => {
    const { db } = await sample();
    const top = await topMerchants(db, '2025-06');
    expect(top[0]).toMatchObject({ merchant: 'Concert', spentCents: 12000 });
    expect(top[1]).toMatchObject({ spentCents: 8000, count: 2 });
    expect(top.some((m) => m.merchant === 'Employer')).toBe(false);
  });

  it('lists the largest single expenses', async () => {
    const { db } = await sample();
    const big = await largestExpenses(db, '2025-06', 2);
    expect(big.map((b) => b.amountCents)).toEqual([-12000, -5000]);
  });

  it('joins budgets with spending, zero when nothing spent', async () => {
    const { db, g, f, health } = await sample();
    await setBudget(db, g, '2025-06', 10000);
    await setBudget(db, f, '2025-06', 10000);
    await setBudget(db, health, '2025-06', 5000);
    const lines = (await budgetLines(db, '2025-06')).map(
      ({ categoryId, limitCents, spentCents }) => ({ categoryId, limitCents, spentCents }),
    );
    expect(lines).toEqual(
      [
        { categoryId: g, limitCents: 10000, spentCents: 7000 },
        { categoryId: health, limitCents: 5000, spentCents: 0 },
        { categoryId: f, limitCents: 10000, spentCents: 12000 },
      ].sort((a, b) => a.categoryId - b.categoryId),
    );
  });

  it('reports spending for one category and a date range', async () => {
    const { db, g } = await sample();
    expect(await categorySpent(db, g, '2025-06')).toBe(7000);
    expect(await categorySpent(db, g, '2025-05')).toBe(0);
    expect(await spentBetween(db, '2025-06-01', '2025-06-10')).toBe(7000);
  });
});

describe('reports with a custom period start', () => {
  it('groups spending by period, not calendar month', async () => {
    const { db, cats } = await seededDb();
    const g = cats.Groceries!.id;
    await addTransaction(db, tx({ categoryId: g, amountCents: -1000, date: '2025-06-14' }));
    await addTransaction(db, tx({ categoryId: g, amountCents: -2000, date: '2025-06-15' }));
    await addTransaction(db, tx({ categoryId: g, amountCents: -4000, date: '2025-07-14' }));
    await addTransaction(db, tx({ categoryId: g, amountCents: -8000, date: '2025-07-15' }));

    expect(await categorySpent(db, g, '2025-06', 15)).toBe(6000);
    expect(await spendingByCategory(db, '2025-05', 15)).toEqual([
      { categoryId: g, spentCents: 1000 },
    ]);
    const totals = await monthlyTotals(db, '2025-07', 3, 15);
    expect(totals.map((t) => [t.month, t.expenseCents])).toEqual([
      ['2025-05', 1000],
      ['2025-06', 6000],
      ['2025-07', 8000],
    ]);
  });
});
