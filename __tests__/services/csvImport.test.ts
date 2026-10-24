import { parseCsv } from '@/services/csv';
import { transactionsToCsv } from '@/services/csvExport';
import {
  detectDateFormats,
  guessMapping,
  parseDateAs,
  validateImport,
  type ColumnMapping,
  type ImportContext,
} from '@/services/csvImport';
import type { Category, Transaction } from '@/types/domain';

const cat = (id: number, name: string, isIncome = false): Category => ({
  id,
  name,
  color: '#000000',
  icon: 'x',
  isIncome,
  archived: false,
  sortOrder: id,
  rollover: false,
});

const categories = [
  cat(1, 'Groceries'),
  cat(2, 'Fun'),
  cat(9, 'Other'),
  cat(10, 'Other income', true),
];
const ctx: ImportContext = {
  categories,
  fallbackExpenseCategoryId: 9,
  fallbackIncomeCategoryId: 10,
  today: '2025-06-15',
};

function run(text: string, overrides: Partial<ColumnMapping> = {}) {
  const { records } = parseCsv(text);
  const mapping = { ...guessMapping(records[0]!.fields, records), ...overrides };
  return validateImport(records, mapping, ctx);
}

describe('parseDateAs', () => {
  it.each([
    ['2025-06-01', 'YMD', '2025-06-01'],
    ['2025/6/1', 'YMD', '2025-06-01'],
    ['06/01/2025', 'MDY', '2025-06-01'],
    ['01/06/2025', 'DMY', '2025-06-01'],
    ['1.6.25', 'DMY', '2025-06-01'],
    ['2025-06-01T10:00:00', 'YMD', '2025-06-01'],
    ['2025-06-01 10:00', 'YMD', '2025-06-01'],
  ] as const)('%s as %s is %s', (text, fmt, out) => {
    expect(parseDateAs(text, fmt)).toBe(out);
  });

  it.each([
    ['13/01/2025', 'MDY'],
    ['2025-02-30', 'YMD'],
    ['06/01/2025', 'YMD'],
    ['yesterday', 'YMD'],
  ] as const)('rejects %s as %s', (text, fmt) => {
    expect(parseDateAs(text, fmt)).toBeNull();
  });
});

describe('detectDateFormats', () => {
  it('narrows to one format when a day is above 12', () => {
    expect(detectDateFormats(['01/02/2025', '25/02/2025'])).toEqual(['DMY']);
    expect(detectDateFormats(['02/25/2025'])).toEqual(['MDY']);
  });

  it('reports ambiguity', () => {
    expect(detectDateFormats(['01/02/2025'])).toEqual(['MDY', 'DMY']);
  });

  it('finds ISO dates', () => {
    expect(detectDateFormats(['2025-01-02'])).toEqual(['YMD']);
  });
});

describe('guessMapping', () => {
  it('maps common bank headers', () => {
    const { records } = parseCsv('Date,Description,Amount,Category,Memo\n2025-06-01,Shop,-1,Fun,x');
    expect(guessMapping(records[0]!.fields, records)).toMatchObject({
      hasHeader: true,
      date: 0,
      merchant: 1,
      amount: 2,
      category: 3,
      note: 4,
      dateFormat: 'YMD',
    });
  });

  it('maps debit and credit columns', () => {
    const { records } = parseCsv('Posted Date,Payee,Debit,Credit\n06/20/2025,Shop,5.00,');
    expect(guessMapping(records[0]!.fields, records)).toMatchObject({
      amount: null,
      debit: 2,
      credit: 3,
      dateFormat: 'MDY',
    });
  });
});

describe('validateImport', () => {
  it('imports good rows and reports every bad row with its line number', () => {
    // 10 data rows, 2 bad (20%).
    const csv = [
      'date,merchant,amount,category',
      '2025-06-01,Loblaws,-45.10,Groceries',
      '2025-06-02,Cinema,-15.00,fun',
      '2025-06-03,Employer,2500.00,',
      'not a date,Shop,-1.00,',
      '2025-06-05,"Shop, Inc",(12.50),',
      '2025-06-06,Shop,abc,',
      '2025-06-07,Shop,"-1,200.00",Unknown',
      '2025-06-08,Shop,-3.00,Groceries',
      '2025-06-09,Shop,-4.00,Groceries',
      '2025-06-10,Shop,-5.00,Groceries',
    ].join('\n');
    const result = run(csv);
    expect(result.total).toBe(10);
    expect(result.rows).toHaveLength(8);
    expect(result.errors).toEqual([
      expect.objectContaining({ line: 5, message: expect.stringContaining('Date "not a date"') }),
      expect.objectContaining({ line: 7, message: 'Amount "abc" is not a number' }),
    ]);
    expect(result.rows[0]).toMatchObject({
      amountCents: -4510,
      categoryId: 1,
      merchant: 'Loblaws',
      line: 2,
    });
    expect(result.rows[1]).toMatchObject({ categoryId: 2 });
    expect(result.rows[2]).toMatchObject({ amountCents: 250000, categoryId: 10 });
    expect(result.rows[3]).toMatchObject({
      amountCents: -1250,
      merchant: 'Shop, Inc',
      categoryId: 9,
    });
    expect(result.rows[4]).toMatchObject({ amountCents: -120000, categoryId: 9 });
  });

  it('rejects zero amounts and far-future dates through the shared schema', () => {
    const r = run('date,amount\n2025-06-01,0.00\n2027-01-01,-5\n2026-06-01,-5');
    expect(r.errors.map((e) => e.message)).toEqual([
      'Amount cannot be zero',
      'Date is more than a year in the future',
    ]);
    expect(r.rows).toHaveLength(1);
  });

  it('combines debit and credit columns', () => {
    const r = run(
      'Date,Payee,Debit,Credit\n06/01/2025,Shop,5.00,\n06/02/2025,Pay,,100.00\n06/03/2025,X,,',
    );
    expect(r.rows.map((x) => x.amountCents)).toEqual([-500, 10000]);
    expect(r.errors[0]).toMatchObject({ line: 4, message: 'Debit and credit are both empty' });
  });

  it('flips the sign when the bank exports spending as positive', () => {
    const r = run('date,amount\n2025-06-01,12.00', { invertAmount: true });
    expect(r.rows[0]!.amountCents).toBe(-1200);
  });

  it('reads comma decimals with semicolon delimiters', () => {
    const r = run('Datum;Betrag\n01.06.2025;-1.234,56', {
      hasHeader: true,
      date: 0,
      amount: 1,
      dateFormat: 'DMY',
      decimal: ',',
    });
    expect(r.rows[0]).toMatchObject({ date: '2025-06-01', amountCents: -123456 });
  });

  it('handles files without a header row', () => {
    const r = run('2025-06-01,-5.00\n2025-06-02,-6.00');
    expect(r.rows).toHaveLength(2);
    expect(r.total).toBe(2);
  });

  it('ignores archived categories when matching names', () => {
    const archivedCtx = { ...ctx, categories: [{ ...cat(1, 'Groceries'), archived: true }] };
    const { records } = parseCsv('date,amount,category\n2025-06-01,-5,Groceries');
    const r = validateImport(records, guessMapping(records[0]!.fields, records), archivedCtx);
    expect(r.rows[0]!.categoryId).toBe(9);
  });
});

describe('export round trip', () => {
  it('re-imports an export unchanged', () => {
    const txs: Transaction[] = [
      {
        id: 1,
        amountCents: -4510,
        date: '2025-06-01',
        categoryId: 1,
        note: 'weekly, big shop',
        merchant: 'Loblaws',
        recurringId: null,
        importBatchId: null,
        receipt: null,
        original: null,
        createdAt: '',
      },
      {
        id: 2,
        amountCents: 250000,
        date: '2025-06-02',
        categoryId: 10,
        note: '',
        merchant: 'Employer',
        recurringId: null,
        importBatchId: null,
        receipt: null,
        original: null,
        createdAt: '',
      },
      {
        id: 3,
        amountCents: -1,
        date: '2025-06-03',
        categoryId: 2,
        note: 'say "hi"',
        merchant: '',
        recurringId: null,
        importBatchId: null,
        receipt: null,
        original: null,
        createdAt: '',
      },
    ];
    const csv = transactionsToCsv(txs, categories);
    const r = run(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows.map(({ line: _line, ...rest }) => rest)).toEqual(
      txs.map((t) => ({
        amountCents: t.amountCents,
        date: t.date,
        categoryId: t.categoryId,
        note: t.note,
        merchant: t.merchant,
      })),
    );
  });
});
