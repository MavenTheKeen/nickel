import type { Category, CategoryRule, IsoDate, NewTransaction } from '@/types/domain';
import { transactionSchema } from '@/types/schemas';

import type { CsvRecord } from './csv';
import { formatYmd, isValidYmd } from './dates';
import { suggestCategory, type MerchantCategoryCount } from './merchant';
import { parseMoney } from './money';

export type DateFormat = 'YMD' | 'MDY' | 'DMY';

export interface ColumnMapping {
  hasHeader: boolean;
  date: number;
  dateFormat: DateFormat;
  /** A single signed amount column... */
  amount: number | null;
  /** ...or separate debit (money out) and credit (money in) columns. */
  debit: number | null;
  credit: number | null;
  merchant: number | null;
  note: number | null;
  category: number | null;
  decimal: '.' | ',';
  /** Some banks export spending as positive numbers; flip the sign of the amount column. */
  invertAmount: boolean;
}

export interface ImportContext {
  categories: readonly Category[];
  /** Used when the file has no category column or the name is unknown. */
  fallbackExpenseCategoryId: number;
  fallbackIncomeCategoryId: number;
  today: IsoDate;
  /** Category rules and past filing, used for rows without a known category name. */
  rules?: readonly Pick<CategoryRule, 'id' | 'pattern' | 'categoryId'>[];
  counts?: readonly MerchantCategoryCount[];
}

export interface ImportRowError {
  line: number;
  message: string;
  raw: string;
}

export interface ValidatedImport {
  rows: (NewTransaction & { line: number })[];
  errors: ImportRowError[];
  /** Data rows considered (header excluded). */
  total: number;
  /** Rows whose category came from a rule or from history rather than the file. */
  autoCategorized: number;
}

const DATE_PARTS = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/;

function expandYear(y: number, digits: number): number {
  return digits <= 2 ? 2000 + y : y;
}

/** Parses a date in the given field order; separators may be - / or . */
export function parseDateAs(text: string, format: DateFormat): IsoDate | null {
  const s = text.trim().split(/[ T]/)[0] ?? '';
  const match = DATE_PARTS.exec(s);
  if (!match) return null;
  const [, a = '', b = '', c = ''] = match;
  let ymd;
  if (format === 'YMD') {
    if (a.length !== 4) return null;
    ymd = { y: Number(a), m: Number(b), d: Number(c) };
  } else {
    if (c.length !== 4 && c.length !== 2) return null;
    const y = expandYear(Number(c), c.length);
    ymd = format === 'MDY' ? { y, m: Number(a), d: Number(b) } : { y, m: Number(b), d: Number(a) };
  }
  return isValidYmd(ymd) ? formatYmd(ymd) : null;
}

/**
 * The date formats that parse every non-empty sample. More than one means
 * the samples are ambiguous (every day was 12 or lower), and the user picks.
 */
export function detectDateFormats(samples: readonly string[]): DateFormat[] {
  const present = samples.map((s) => s.trim()).filter(Boolean);
  if (present.length === 0) return [];
  return (['YMD', 'MDY', 'DMY'] as const).filter((f) =>
    present.every((s) => parseDateAs(s, f) !== null),
  );
}

const HEADER_HINTS: Record<
  'date' | 'amount' | 'debit' | 'credit' | 'merchant' | 'note' | 'category',
  RegExp
> = {
  date: /^(transaction |posted |posting )?date$|^date posted$/i,
  amount: /^(amount|amt|value|transaction amount)$/i,
  debit: /^(debit|withdrawal|withdrawals|money out|paid out)$/i,
  credit: /^(credit|deposit|deposits|money in|paid in)$/i,
  merchant: /^(merchant|payee|description|name|details)$/i,
  note: /^(note|notes|memo|reference)$/i,
  category: /^(category|type)$/i,
};

/** A starting mapping from header names, for the user to confirm or change. */
export function guessMapping(
  firstRow: readonly string[],
  samples: readonly CsvRecord[],
): ColumnMapping {
  const find = (key: keyof typeof HEADER_HINTS) => {
    const i = firstRow.findIndex((h) => HEADER_HINTS[key].test(h.trim()));
    return i === -1 ? null : i;
  };
  const date = find('date');
  const hasHeader = date !== null || find('amount') !== null;
  const dateCol = date ?? 0;
  const formats = detectDateFormats(
    samples.slice(hasHeader ? 1 : 0, 50).map((r) => r.fields[dateCol] ?? ''),
  );
  const amount = find('amount');
  return {
    hasHeader,
    date: dateCol,
    dateFormat: formats[0] ?? 'YMD',
    amount: amount ?? (hasHeader ? null : 1),
    debit: amount === null ? find('debit') : null,
    credit: amount === null ? find('credit') : null,
    merchant: find('merchant'),
    note: find('note'),
    category: find('category'),
    decimal: '.',
    invertAmount: false,
  };
}

function cell(fields: readonly string[], index: number | null): string {
  return index === null ? '' : (fields[index] ?? '').trim();
}

function rowAmount(fields: readonly string[], m: ColumnMapping): number | string {
  if (m.amount !== null) {
    const raw = cell(fields, m.amount);
    if (raw === '') return 'Amount is empty';
    const cents = parseMoney(raw, { decimal: m.decimal });
    if (cents === null) return `Amount "${raw}" is not a number`;
    return m.invertAmount ? -cents : cents;
  }
  if (m.debit === null && m.credit === null) return 'No amount column is mapped';
  const debitRaw = cell(fields, m.debit);
  const creditRaw = cell(fields, m.credit);
  if (debitRaw === '' && creditRaw === '') return 'Debit and credit are both empty';
  const debit = debitRaw === '' ? 0 : parseMoney(debitRaw, { decimal: m.decimal });
  if (debit === null) return `Debit "${debitRaw}" is not a number`;
  const credit = creditRaw === '' ? 0 : parseMoney(creditRaw, { decimal: m.decimal });
  if (credit === null) return `Credit "${creditRaw}" is not a number`;
  return Math.abs(credit) - Math.abs(debit);
}

/**
 * Validates every data row. Good rows are returned ready to insert; every bad
 * row is reported with its line number and the first problem found, so one
 * bad row never blocks the rest of the file.
 */
export function validateImport(
  records: readonly CsvRecord[],
  mapping: ColumnMapping,
  ctx: ImportContext,
): ValidatedImport {
  const byName = new Map(
    ctx.categories.filter((c) => !c.archived).map((c) => [c.name.trim().toLowerCase(), c]),
  );
  const schema = transactionSchema(ctx.today);
  const data = mapping.hasHeader ? records.slice(1) : records;
  const rows: ValidatedImport['rows'] = [];
  const errors: ImportRowError[] = [];
  const byId = new Map(ctx.categories.map((c) => [c.id, c]));
  let autoCategorized = 0;

  for (const record of data) {
    const { fields, line } = record;
    const fail = (message: string) => errors.push({ line, message, raw: fields.join(', ') });

    const rawDate = cell(fields, mapping.date);
    if (rawDate === '') {
      fail('Date is empty');
      continue;
    }
    const date = parseDateAs(rawDate, mapping.dateFormat);
    if (date === null) {
      fail(`Date "${rawDate}" does not match ${mapping.dateFormat}`);
      continue;
    }
    const amount = rowAmount(fields, mapping);
    if (typeof amount === 'string') {
      fail(amount);
      continue;
    }

    const categoryName = cell(fields, mapping.category).toLowerCase();
    const named = categoryName ? byName.get(categoryName) : undefined;
    const merchant = cell(fields, mapping.merchant);
    let categoryId = named?.id;
    if (categoryId === undefined && merchant !== '') {
      const s = suggestCategory(merchant, ctx.rules ?? [], ctx.counts ?? []);
      const cat = s ? byId.get(s.categoryId) : undefined;
      // A suggestion must agree with the sign: an expense rule never files income.
      if (cat && !cat.archived && cat.isIncome === amount > 0) {
        categoryId = cat.id;
        autoCategorized++;
      }
    }
    categoryId ??= amount > 0 ? ctx.fallbackIncomeCategoryId : ctx.fallbackExpenseCategoryId;

    const parsed = schema.safeParse({
      amountCents: amount,
      date,
      categoryId,
      merchant,
      note: cell(fields, mapping.note),
    });
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message ?? 'Invalid row');
      continue;
    }
    rows.push({ ...parsed.data, line });
  }

  return { rows, errors, total: data.length, autoCategorized };
}
