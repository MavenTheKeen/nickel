import { parseDateWord, parseQuickAdd, type QuickAddContext } from '@/services/quickAdd';
import type { Category } from '@/types/domain';

const cat = (id: number, name: string, isIncome = false, archived = false): Category => ({
  id,
  name,
  color: '#000000',
  icon: 'cart',
  isIncome,
  archived,
  sortOrder: id,
  rollover: false,
});

// 2025-06-18 is a Wednesday.
const TODAY = '2025-06-18';

const ctx: QuickAddContext = {
  today: TODAY,
  categories: [
    cat(1, 'Groceries'),
    cat(2, 'Eating out'),
    cat(3, 'Other'),
    cat(4, 'Salary', true),
    cat(5, 'Other income', true),
    cat(6, 'Gym', false, true),
  ],
  rules: [{ id: 1, pattern: 'starbucks', categoryId: 2 }],
  counts: [{ merchant: 'Loblaws', categoryId: 1, count: 4 }],
};

describe('parseDateWord', () => {
  it('reads today, yesterday, weekdays and ISO dates', () => {
    expect(parseDateWord('today', TODAY)).toBe(TODAY);
    expect(parseDateWord('Yesterday', TODAY)).toBe('2025-06-17');
    expect(parseDateWord('wed', TODAY)).toBe(TODAY);
    expect(parseDateWord('mon', TODAY)).toBe('2025-06-16');
    expect(parseDateWord('thursday', TODAY)).toBe('2025-06-12');
    expect(parseDateWord('2025-06-01', TODAY)).toBe('2025-06-01');
    expect(parseDateWord('2025-02-30', TODAY)).toBeNull();
    expect(parseDateWord('coffee', TODAY)).toBeNull();
  });
});

describe('parseQuickAdd', () => {
  it('reads amount, category and merchant in any order', () => {
    expect(parseQuickAdd('12.50 groceries loblaws', ctx)).toEqual({
      amountCents: 1250,
      currency: null,
      kind: 'expense',
      date: TODAY,
      categoryId: 1,
      categorySource: 'name',
      merchant: 'loblaws',
    });
    expect(parseQuickAdd('Loblaws yesterday $8', ctx)).toMatchObject({
      amountCents: 800,
      date: '2025-06-17',
      merchant: 'Loblaws',
      categoryId: 1,
      categorySource: 'history',
    });
  });

  it('matches multi-word category names and unique prefixes', () => {
    expect(parseQuickAdd('30 eating out with sam', ctx)).toMatchObject({
      categoryId: 2,
      merchant: 'with sam',
    });
    expect(parseQuickAdd('30 groc', ctx)).toMatchObject({ categoryId: 1, merchant: '' });
    // "oth" starts both Other and Other income, so it is not a category.
    expect(parseQuickAdd('30 oth', ctx)).toMatchObject({ categoryId: null, merchant: 'oth' });
  });

  it('prefers the longer category name', () => {
    expect(parseQuickAdd('+50 other income', ctx)).toMatchObject({
      kind: 'income',
      categoryId: 5,
    });
  });

  it('suggests a category from rules for the merchant', () => {
    expect(parseQuickAdd('4.75 at Starbucks', ctx)).toMatchObject({
      categoryId: 2,
      categorySource: 'rule',
      merchant: 'Starbucks',
    });
  });

  it('treats a leading plus as income and never files it under an expense category', () => {
    expect(parseQuickAdd('+2000 salary', ctx)).toMatchObject({
      amountCents: 200000,
      kind: 'income',
      categoryId: 4,
    });
    expect(parseQuickAdd('+20 groceries', ctx)).toMatchObject({
      kind: 'income',
      categoryId: null,
      merchant: 'groceries',
    });
  });

  it('is an income when the named category is an income category', () => {
    expect(parseQuickAdd('2600 salary', ctx)).toMatchObject({ kind: 'income', categoryId: 4 });
  });

  it('ignores archived categories', () => {
    expect(parseQuickAdd('40 gym', ctx)).toMatchObject({ categoryId: null, merchant: 'gym' });
  });

  it('reads comma decimals on comma locales', () => {
    expect(parseQuickAdd('12,50 cafe', { ...ctx, decimal: ',' }).amountCents).toBe(1250);
  });

  it('returns no amount when there is none, and keeps only the first number', () => {
    expect(parseQuickAdd('coffee', ctx).amountCents).toBeNull();
    expect(parseQuickAdd('5 coffee 3', ctx)).toMatchObject({
      amountCents: 500,
      merchant: 'coffee 3',
    });
  });

  it('does not take a date for an amount', () => {
    expect(parseQuickAdd('2025-06-01 9.99 netflix', ctx)).toMatchObject({
      amountCents: 999,
      date: '2025-06-01',
      merchant: 'netflix',
    });
  });
});

describe('parseQuickAdd currencies', () => {
  const home = { ...ctx, homeCurrency: 'CAD' };

  it.each([
    ['€24 dinner', 'EUR', 2400],
    ['24€ dinner', 'EUR', 2400],
    ['24 EUR dinner', 'EUR', 2400],
    ['eur 24 dinner', 'EUR', 2400],
    ['24eur dinner', 'EUR', 2400],
    ['GBP12.50 dinner', 'GBP', 1250],
    ['¥2400 dinner', 'JPY', 240000],
  ])('%s is %s', (text, currency, amountCents) => {
    expect(parseQuickAdd(text, home)).toMatchObject({ currency, amountCents, merchant: 'dinner' });
  });

  it('treats the home currency and a bare dollar sign as no foreign currency', () => {
    expect(parseQuickAdd('24 CAD dinner', home).currency).toBeNull();
    expect(parseQuickAdd('$24 dinner', home).currency).toBeNull();
  });

  it('does not read the word "try" as Turkish lira', () => {
    expect(parseQuickAdd('5 try cafe', home)).toMatchObject({
      currency: null,
      merchant: 'try cafe',
    });
    expect(parseQuickAdd('5 TRY cafe', home).currency).toBe('TRY');
  });
});
