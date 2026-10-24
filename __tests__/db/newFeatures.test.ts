/**
 * @jest-environment node
 */
import { createBackup, parseBackup, restoreBackup } from '@/db/backup';
import { migrate } from '@/db/migrate';
import { migrations } from '@/db/migrations';
import { setBudget } from '@/db/repositories/budgets';
import { listCategories, setCategoryRollover } from '@/db/repositories/categories';
import {
  applyRuleToHistory,
  countRuleMatches,
  EmptyPatternError,
  listCategoryRules,
  merchantCategoryCounts,
  saveCategoryRule,
} from '@/db/repositories/categoryRules';
import {
  addContribution,
  contributedBetween,
  createGoal,
  deleteGoal,
  getGoal,
  listContributions,
  listGoals,
} from '@/db/repositories/goals';
import { createRule, dismissSuggestion } from '@/db/repositories/recurring';
import { budgetLines } from '@/db/repositories/reports';
import { setInternal } from '@/db/repositories/settings';
import {
  addTransaction,
  getTransaction,
  referencedReceipts,
  updateTransaction,
} from '@/db/repositories/transactions';
import {
  loadBillSuggestions,
  loadBudgets,
  loadCategorizer,
  loadReview,
  loadReviewPrompt,
} from '@/hooks/loaders';
import { validateImport } from '@/services/csvImport';
import { parseCsv } from '@/services/csv';

import { FIXED_NOW, seededDb, tx } from '../helpers/fixtures';
import { openTestDb } from '../helpers/testDb';

const SCHEMA = migrations.at(-1)!.version;

describe('category rules', () => {
  it('stores patterns normalised and moves an existing pattern to a new category', async () => {
    const { db, cats } = await seededDb();
    const a = await saveCategoryRule(db, 'STARBUCKS #12', cats['Eating out']!.id, FIXED_NOW);
    const b = await saveCategoryRule(db, 'starbucks', cats.Fun!.id, FIXED_NOW);
    expect(b).toBe(a);
    expect(await listCategoryRules(db)).toEqual([
      { id: a, pattern: 'starbucks', categoryId: cats.Fun!.id, createdAt: FIXED_NOW.toISOString() },
    ]);
    await expect(saveCategoryRule(db, '#1234', cats.Fun!.id)).rejects.toThrow(EmptyPatternError);
  });

  it('refiles matching past transactions of the same kind only', async () => {
    const { db, cats } = await seededDb();
    const other = cats.Other!.id;
    await addTransaction(db, tx({ categoryId: other, merchant: 'SQ *STARBUCKS 0042' }));
    await addTransaction(db, tx({ categoryId: other, merchant: 'Starbucks Reserve' }));
    await addTransaction(db, tx({ categoryId: other, merchant: 'Starbucksy' }));
    // A refund filed as income is never moved into an expense category.
    await addTransaction(
      db,
      tx({ categoryId: cats['Other income']!.id, merchant: 'Starbucks', amountCents: 500 }),
    );
    const eating = cats['Eating out']!.id;
    expect(await countRuleMatches(db, 'starbucks', eating)).toBe(2);
    expect(await applyRuleToHistory(db, 'starbucks', eating)).toBe(2);
    expect(await countRuleMatches(db, 'starbucks', eating)).toBe(0);
  });

  it('feeds the importer, which files rows by rule or history when the file has no category', async () => {
    const { db, cats } = await seededDb();
    await saveCategoryRule(db, 'netflix', cats.Fun!.id);
    for (let i = 0; i < 2; i++) {
      await addTransaction(db, tx({ categoryId: cats.Groceries!.id, merchant: 'Loblaws' }));
    }
    const { rules, counts } = await loadCategorizer(db);
    expect(counts).toContainEqual({
      merchant: 'Loblaws',
      categoryId: cats.Groceries!.id,
      count: 2,
    });
    const csv = parseCsv(
      'Date,Amount,Description\n2025-06-01,-15.99,NETFLIX.COM\n2025-06-02,-40,LOBLAWS 1033\n2025-06-03,-5,Corner store\n2025-06-04,20,Netflix refund',
    );
    const result = validateImport(
      csv.records,
      {
        hasHeader: true,
        date: 0,
        dateFormat: 'YMD',
        amount: 1,
        debit: null,
        credit: null,
        merchant: 2,
        note: null,
        category: null,
        decimal: '.',
        invertAmount: false,
      },
      {
        categories: await listCategories(db),
        fallbackExpenseCategoryId: cats.Other!.id,
        fallbackIncomeCategoryId: cats['Other income']!.id,
        today: '2025-06-15',
        rules,
        counts,
      },
    );
    expect(result.rows.map((r) => r.categoryId)).toEqual([
      cats.Fun!.id,
      cats.Groceries!.id,
      cats.Other!.id,
      cats['Other income']!.id,
    ]);
    expect(result.autoCategorized).toBe(2);
    expect(await merchantCategoryCounts(db)).toHaveLength(1);
  });
});

describe('goals', () => {
  it('sums contributions, including withdrawals, and deletes them with the goal', async () => {
    const { db } = await seededDb();
    const id = await createGoal(
      db,
      {
        name: ' Trip ',
        targetCents: 100000,
        targetDate: '2025-12-01',
        color: '#1565C0',
        icon: 'airplane',
      },
      FIXED_NOW,
    );
    await addContribution(db, id, 30000, '2025-06-01');
    await addContribution(db, id, 5000, '2025-06-20', 'birthday');
    await addContribution(db, id, -2000, '2025-07-02');
    expect(await getGoal(db, id)).toMatchObject({
      name: 'Trip',
      savedCents: 33000,
      archived: false,
    });
    expect((await listContributions(db, id)).map((c) => c.amountCents)).toEqual([
      -2000, 5000, 30000,
    ]);
    expect(await contributedBetween(db, '2025-06-01', '2025-06-30')).toBe(35000);
    await deleteGoal(db, id);
    expect(await listGoals(db)).toEqual([]);
    expect(await contributedBetween(db, '2025-01-01', '2025-12-31')).toBe(0);
  });

  it('rejects a zero contribution', async () => {
    const { db } = await seededDb();
    const id = await createGoal(db, {
      name: 'Fund',
      targetCents: 100,
      targetDate: null,
      color: '#1565C0',
      icon: 'bank',
    });
    await expect(addContribution(db, id, 0, '2025-06-01')).rejects.toThrow();
  });
});

describe('rollover budgets', () => {
  it('adds what was left last period to this period limit', async () => {
    const { db, cats } = await seededDb();
    const g = cats.Groceries!.id;
    await setCategoryRollover(db, g, true);
    await setBudget(db, g, '2025-04', 40000);
    await setBudget(db, g, '2025-05', 40000);
    await setBudget(db, g, '2025-06', 40000);
    await addTransaction(db, tx({ categoryId: g, amountCents: -30000, date: '2025-04-10' }));
    await addTransaction(db, tx({ categoryId: g, amountCents: -45000, date: '2025-05-10' }));
    await addTransaction(db, tx({ categoryId: g, amountCents: -1000, date: '2025-06-02' }));
    const [line] = await budgetLines(db, '2025-06');
    // April left 100.00, May went 50.00 over: 50.00 carries into June.
    expect(line).toMatchObject({
      baseLimitCents: 40000,
      carryCents: 5000,
      limitCents: 45000,
      spentCents: 1000,
    });

    const rows = await loadBudgets(db, '2025-06');
    expect(rows.find((r) => r.category.id === g)).toMatchObject({
      carryCents: 5000,
      limitCents: 45000,
    });
  });

  it('uses the budget period start day for past periods', async () => {
    const { db, cats } = await seededDb();
    const g = cats.Groceries!.id;
    await setCategoryRollover(db, g, true);
    await setBudget(db, g, '2025-05', 10000);
    await setBudget(db, g, '2025-06', 10000);
    // With periods starting on the 15th, June 10 belongs to the May period.
    await addTransaction(db, tx({ categoryId: g, amountCents: -4000, date: '2025-06-10' }));
    const [line] = await budgetLines(db, '2025-06', 15);
    expect(line?.carryCents).toBe(6000);
    const [calendar] = await budgetLines(db, '2025-06', 1);
    expect(calendar?.carryCents).toBe(10000);
  });

  it('does nothing for categories without rollover', async () => {
    const { db, cats } = await seededDb();
    await setBudget(db, cats.Fun!.id, '2025-05', 10000);
    await setBudget(db, cats.Fun!.id, '2025-06', 10000);
    expect((await budgetLines(db, '2025-06'))[0]).toMatchObject({
      carryCents: 0,
      limitCents: 10000,
    });
  });
});

describe('bill suggestions and the review', () => {
  it('suggests a repeating charge until it becomes a bill or is dismissed', async () => {
    const { db, cats } = await seededDb();
    for (const date of ['2025-03-03', '2025-04-03', '2025-05-03', '2025-06-03']) {
      await addTransaction(
        db,
        tx({ categoryId: cats.Fun!.id, merchant: 'Spotify', amountCents: -1199, date }),
      );
    }
    const [s] = await loadBillSuggestions(db, '2025-06-15');
    expect(s).toMatchObject({ merchant: 'Spotify', cadence: 'monthly', nextDate: '2025-07-03' });

    await dismissSuggestion(db, s!.key);
    expect(await loadBillSuggestions(db, '2025-06-15')).toEqual([]);
  });

  it('stops suggesting once a bill exists for the merchant', async () => {
    const { db, cats } = await seededDb();
    for (const date of ['2025-04-03', '2025-05-03', '2025-06-03']) {
      await addTransaction(
        db,
        tx({ categoryId: cats.Fun!.id, merchant: 'Spotify', amountCents: -1199, date }),
      );
    }
    await createRule(db, {
      amountCents: -1199,
      categoryId: cats.Fun!.id,
      cadence: 'monthly',
      anchorDate: '2025-07-03',
      note: '',
      merchant: 'Spotify',
    });
    expect(await loadBillSuggestions(db, '2025-06-15')).toEqual([]);
  });

  it('builds the review from the period and the one before', async () => {
    const { db, cats } = await seededDb();
    await addTransaction(
      db,
      tx({ categoryId: cats.Groceries!.id, amountCents: -5000, date: '2025-05-10' }),
    );
    await addTransaction(
      db,
      tx({
        categoryId: cats.Groceries!.id,
        amountCents: -8000,
        date: '2025-06-07',
        merchant: 'Metro',
      }),
    );
    await addTransaction(
      db,
      tx({ categoryId: cats.Fun!.id, amountCents: -2000, date: '2025-06-14' }),
    );
    const goal = await createGoal(db, {
      name: 'Fund',
      targetCents: 100000,
      targetDate: null,
      color: '#1565C0',
      icon: 'bank',
    });
    await addContribution(db, goal, 2500, '2025-06-20');
    const { cards } = await loadReview(db, '2025-06');
    expect(cards.map((c) => c.kind)).toEqual([
      'total',
      'change',
      'merchant',
      'weekday',
      'largest',
      'goals',
    ]);
    expect(cards[0]).toMatchObject({ spentCents: 10000, changePercent: 100 });
    // June 7 and 14, 2025 are Saturdays.
    expect(cards.find((c) => c.kind === 'weekday')).toMatchObject({
      weekday: 6,
      sharePercent: 100,
    });
  });

  it('offers the review in the first week of the next period until it is seen', async () => {
    const { db, cats } = await seededDb();
    expect(await loadReviewPrompt(db, '2025-07-03')).toBeNull();
    await addTransaction(db, tx({ categoryId: cats.Fun!.id, date: '2025-06-10' }));
    expect(await loadReviewPrompt(db, '2025-07-03')).toBe('2025-06');
    expect(await loadReviewPrompt(db, '2025-07-08')).toBeNull();
    await setInternal(db, 'review_seen', '2025-06');
    expect(await loadReviewPrompt(db, '2025-07-03')).toBeNull();
  });
});

describe('receipts', () => {
  it('keeps the receipt when an update leaves it out, and clears it with null', async () => {
    const { db, cats } = await seededDb();
    const id = await addTransaction(db, {
      ...tx({ categoryId: cats.Fun!.id }),
      receipt: 'a-1.jpg',
    });
    const fields = {
      amountCents: -200,
      date: '2025-06-10',
      categoryId: cats.Fun!.id,
      note: '',
      merchant: '',
    };
    await updateTransaction(db, id, fields);
    expect((await getTransaction(db, id))?.receipt).toBe('a-1.jpg');
    expect(await referencedReceipts(db)).toEqual(new Set(['a-1.jpg']));
    await updateTransaction(db, id, { ...fields, receipt: null });
    expect((await getTransaction(db, id))?.receipt).toBeNull();
  });
});

describe('schema 3', () => {
  it('upgrades a version 2 database with data', async () => {
    const db = openTestDb();
    await migrate(db, migrations.slice(0, 2));
    await db.run("INSERT INTO categories (name, color, icon) VALUES ('Food', '#000000', 'food')");
    await db.run(
      "INSERT INTO transactions (amount_cents, date, category_id, created_at) VALUES (-500, '2025-01-02', 1, 'x')",
    );
    expect(await migrate(db)).toEqual({ from: 2, to: SCHEMA });
    expect(await db.first('SELECT rollover FROM categories')).toEqual({ rollover: 0 });
    expect(await db.first('SELECT amount_cents, receipt FROM transactions')).toEqual({
      amount_cents: -500,
      receipt: null,
    });
  });

  it('backs up and restores rules, goals, rollover and receipts', async () => {
    const { db, cats } = await seededDb();
    await saveCategoryRule(db, 'uber', cats.Transport!.id);
    await setCategoryRollover(db, cats.Groceries!.id, true);
    const goal = await createGoal(db, {
      name: 'Car',
      targetCents: 500000,
      targetDate: '2026-01-01',
      color: '#283593',
      icon: 'car',
    });
    await addContribution(db, goal, 10000, '2025-06-01');
    await addTransaction(db, { ...tx({ categoryId: cats.Fun!.id }), receipt: 'r-2.jpg' });
    await dismissSuggestion(db, 'gym|out');
    const backup = await createBackup(db);

    const target = await seededDb();
    const counts = await restoreBackup(target.db, parseBackup(JSON.stringify(backup), SCHEMA));
    expect(counts).toMatchObject({
      category_rules: 1,
      goals: 1,
      goal_contributions: 1,
      dismissed_suggestions: 1,
    });
    expect((await getGoal(target.db, goal))?.savedCents).toBe(10000);
    expect((await listCategories(target.db)).find((c) => c.name === 'Groceries')?.rollover).toBe(
      true,
    );
    expect(await referencedReceipts(target.db)).toEqual(new Set(['r-2.jpg']));
  });

  it('restores a backup made before schema 3', async () => {
    const { db } = await seededDb();
    const backup = await createBackup(db);
    const old = JSON.parse(JSON.stringify(backup));
    old.schemaVersion = 2;
    for (const t of ['category_rules', 'goals', 'goal_contributions', 'dismissed_suggestions']) {
      delete old.tables[t];
    }
    for (const c of old.tables.categories) delete c.rollover;
    const target = await seededDb();
    await restoreBackup(target.db, parseBackup(JSON.stringify(old), SCHEMA));
    expect((await listCategories(target.db)).every((c) => !c.rollover)).toBe(true);
  });
});
