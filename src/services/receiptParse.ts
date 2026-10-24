import type { IsoDate } from '@/types/domain';

import { addDays, formatYmd, isValidYmd } from './dates';

// Reads the total, date and shop name out of the lines that on-device text
// recognition returns for a receipt photo. The result is only ever offered to
// the user to accept; nothing is filled in silently.

export interface ReceiptReading {
  totalCents: number | null;
  date: IsoDate | null;
  merchant: string | null;
}

export interface ReceiptOptions {
  today: IsoDate;
  /** Which comes first in a numeric date like 03/04/2025 when both parts are 12 or less. */
  dayFirst?: boolean;
}

/** Amounts with exactly two decimals: "12.50", "1,234.56", "1.234,56", "12,50". */
const AMOUNT = /(?<![\d.,])(\d{1,3}(?:[ .,]\d{3})+|\d+)[.,](\d{2})(?![\d])/g;

export function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const whole = (m[1] ?? '').replace(/[ .,]/g, '');
    const cents = Number(whole) * 100 + Number(m[2]);
    if (Number.isSafeInteger(cents) && cents > 0) out.push(cents);
  }
  return out;
}

/** Strongest first: a "grand total" beats an "amount due", which beats a plain "total". */
const TOTAL_WORDS: readonly RegExp[] = [
  /\bgrand\s*total\b/i,
  /\b(amount|balance|total)\s*(due|payable|to pay)\b/i,
  /\b(total|montant|summe|gesamt|importe)\b/i,
];
const NOT_TOTAL = /\b(sub\s*-?\s*total|tax|hst|gst|vat|tip|saving|saved|discount|items?|qty)\b/i;

function totalFrom(lines: readonly string[]): number | null {
  for (const word of TOTAL_WORDS) {
    const found: number[] = [];
    lines.forEach((line, i) => {
      if (!word.test(line) || NOT_TOTAL.test(line)) return;
      // The amount is on the same line, or on the next one when the receipt
      // prints labels and amounts in two columns.
      const here = amountsIn(line);
      found.push(...(here.length > 0 ? here : amountsIn(lines[i + 1] ?? '')));
    });
    if (found.length > 0) return Math.max(...found);
  }
  return null;
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

function monthNumber(word: string): number | null {
  const i = MONTHS.indexOf(word.slice(0, 3).toLowerCase() as (typeof MONTHS)[number]);
  return i === -1 ? null : i + 1;
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function datesIn(line: string, dayFirst: boolean): IsoDate[] {
  const out: IsoDate[] = [];
  const push = (y: number, m: number, d: number) => {
    const ymd = { y: fullYear(y), m, d };
    if (isValidYmd(ymd)) out.push(formatYmd(ymd));
  };
  for (const m of line.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  for (const m of line.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    // A part above 12 can only be the day, which settles the order.
    if (a > 12) push(y, b, a);
    else if (b > 12) push(y, a, b);
    else if (dayFirst) push(y, b, a);
    else push(y, a, b);
  }
  for (const m of line.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi)) {
    const month = monthNumber(m[1] ?? '');
    if (month) push(Number(m[3]), month, Number(m[2]));
  }
  for (const m of line.matchAll(/\b(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})\b/gi)) {
    const month = monthNumber(m[2] ?? '');
    if (month) push(Number(m[3]), month, Number(m[1]));
  }
  return out;
}

const NOT_MERCHANT =
  /\b(receipt|welcome|thank|tel|phone|fax|www|http|store\s*#|cashier|transaction|invoice|order)\b|@/i;

function merchantFrom(lines: readonly string[]): string | null {
  for (const raw of lines.slice(0, 5)) {
    const line = raw.trim();
    const letters = line.replace(/[^A-Za-zÀ-ɏ]/g, '').length;
    if (letters < 3 || letters / line.length < 0.5 || NOT_MERCHANT.test(line)) continue;
    // Receipts print names in capitals; "LOBLAWS" reads better as "Loblaws".
    const name =
      line === line.toUpperCase()
        ? line
            .toLowerCase()
            .replace(
              /(^|[\s&'-])([a-zà-ɏ])/g,
              (_, before: string, c: string) => before + c.toUpperCase(),
            )
        : line;
    return name.slice(0, 120);
  }
  return null;
}

export function parseReceipt(lines: readonly string[], opts: ReceiptOptions): ReceiptReading {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  // A receipt date is never in the future and rarely more than a year old.
  const latest = addDays(opts.today, 1);
  const earliest = addDays(opts.today, -366);
  const date =
    clean
      .flatMap((l) => datesIn(l, opts.dayFirst ?? false))
      .find((d) => d <= latest && d >= earliest) ?? null;
  return { totalCents: totalFrom(clean), date, merchant: merchantFrom(clean) };
}
