/**
 * @jest-environment node
 */
import {
  CategoryInUseError,
  createCategory,
  deleteCategory,
  listCategories,
  seedDefaultCategories,
  setCategoryArchived,
} from '@/db/repositories/categories';
import {
  addTransaction,
  countTransactions,
  deleteTransaction,
  getTransaction,
  listTransactions,
  recentTransactions,
  restoreTransaction,
  updateTransaction,
} from '@/db/repositories/transactions';

import { FIXED_NOW, seededDb, tx } from '../helpers/fixtures';

describe('categories', () => {
  it('seeds defaults once', async () => {
    const { db } = await seededDb();
    expect(await seedDefaultCategories(db)).toBe(0);
    const cats = await listCategories(db);
    expect(cats.length).toBeGreaterThan(5);
    expect(cats.filter((c) => c.isIncome).map((c) => c.name)).toContain('Salary');
  });

  it('lists expense categories before income', async () => {
    const { db } = await seededDb();
    const cats = await listCategories(db);
    const firstIncome = cats.findIndex((c) => c.isIncome);
    expect(cats.slice(firstIncome).every((c) => c.isIncome)).toBe(true);
  });

  it('rejects duplicate names regardless of case', async () => {
    const { db } = await seededDb();
    await expect(
      createCategory(db, { name: 'groceries', color: '#000000', icon: 'x', isIncome: false }),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('blocks deleting a used category and allows archiving it', async () => {
    const { db, cats } = await seededDb();
    const id = cats.Groceries!.id;
    await addTransaction(db, tx({ categoryId: id }));
    await expect(deleteCategory(db, id)).rejects.toBeInstanceOf(CategoryInUseError);
    await setCategoryArchived(db, id, true);
    expect((await listCategories(db)).some((c) => c.id === id)).toBe(false);
    expect((await listCategories(db, { includeArchived: true })).some((c) => c.id === id)).toBe(
      true,
    );
  });

  it('deletes an unused category along with its budgets', async () => {
    const { db } = await seededDb();
    const id = await createCategory(db, {
      name: 'Pets',
      color: '#123456',
      icon: 'paw',
      isIncome: false,
    });
    await db.run(
      "INSERT INTO budgets (category_id, month, limit_cents) VALUES (?, '2025-06', 100)",
      [id],
    );
    await deleteCategory(db, id);
    expect(await db.first('SELECT COUNT(*) AS n FROM budgets')).toEqual({ n: 0 });
  });
});

describe('transactions', () => {
  it('adds, reads, edits and deletes', async () => {
    const { db, cats } = await seededDb();
    const id = await addTransaction(
      db,
      tx({ categoryId: cats.Groceries!.id, merchant: 'Loblaws' }),
      FIXED_NOW,
    );
    expect(await getTransaction(db, id)).toMatchObject({
      amountCents: -1000,
      merchant: 'Loblaws',
      createdAt: FIXED_NOW.toISOString(),
    });
    await updateTransaction(db, id, {
      amountCents: -2500,
      date: '2025-06-11',
      categoryId: cats.Fun!.id,
      note: 'edited',
      merchant: 'Cinema',
    });
    expect(await getTransaction(db, id)).toMatchObject({ amountCents: -2500, note: 'edited' });
    const deleted = await deleteTransaction(db, id);
    expect(deleted?.id).toBe(id);
    expect(await getTransaction(db, id)).toBeNull();
  });

  it('restores a deleted row with the same id for undo', async () => {
    const { db, cats } = await seededDb();
    const id = await addTransaction(db, tx({ categoryId: cats.Groceries!.id }));
    const deleted = (await deleteTransaction(db, id))!;
    await restoreTransaction(db, deleted);
    expect(await getTransaction(db, id)).toEqual(deleted);
  });

  it('returns null when deleting a missing row and throws when updating one', async () => {
    const { db, cats } = await seededDb();
    expect(await deleteTransaction(db, 999)).toBeNull();
    await expect(
      updateTransaction(db, 999, {
        amountCents: -1,
        date: '2025-01-01',
        categoryId: cats.Fun!.id,
        note: '',
        merchant: '',
      }),
    ).rejects.toThrow(/not found/);
  });

  it('lists a month newest first and filters by search and category', async () => {
    const { db, cats } = await seededDb();
    const g = cats.Groceries!.id;
    const f = cats.Fun!.id;
    await addTransaction(db, tx({ categoryId: g, date: '2025-06-01', merchant: 'Loblaws' }));
    await addTransaction(db, tx({ categoryId: f, date: '2025-06-20', note: 'Movie night' }));
    await addTransaction(db, tx({ categoryId: g, date: '2025-05-31', merchant: 'Loblaws' }));
    await addTransaction(db, tx({ categoryId: g, date: '2025-07-01', merchant: 'Loblaws' }));

    const june = await listTransactions(db, { month: '2025-06' });
    expect(june.map((t) => t.date)).toEqual(['2025-06-20', '2025-06-01']);
    expect(
      (await listTransactions(db, { month: '2025-06', search: 'loblaw' })).map((t) => t.date),
    ).toEqual(['2025-06-01']);
    expect((await listTransactions(db, { month: '2025-06', search: 'movie' })).length).toBe(1);
    expect((await listTransactions(db, { month: '2025-06', categoryId: f })).length).toBe(1);
  });

  it('treats % and _ in search as plain text', async () => {
    const { db, cats } = await seededDb();
    await addTransaction(db, tx({ categoryId: cats.Fun!.id, note: '100% fun' }));
    await addTransaction(db, tx({ categoryId: cats.Fun!.id, note: 'boring' }));
    expect(await listTransactions(db, { month: '2025-06', search: '%' })).toHaveLength(1);
    expect(await listTransactions(db, { month: '2025-06', search: '_' })).toHaveLength(0);
  });

  it('returns the most recent transactions', async () => {
    const { db, cats } = await seededDb();
    for (let d = 1; d <= 12; d++) {
      await addTransaction(
        db,
        tx({ categoryId: cats.Fun!.id, date: `2025-06-${String(d).padStart(2, '0')}` }),
      );
    }
    const recent = await recentTransactions(db, 10);
    expect(recent).toHaveLength(10);
    expect(recent[0]!.date).toBe('2025-06-12');
    expect(await countTransactions(db)).toBe(12);
  });
});
