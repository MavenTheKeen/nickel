// Money is always an integer number of cents. Parsing works on the string
// digits, so values like "0.1" + "0.2" never pass through binary floats.

const MAX_CENTS = 999_999_999_99; // one billion minus a cent; well inside 2^53

export interface ParseMoneyOptions {
  /** Decimal separator in the input. Default '.'; ',' for "1.234,56" style. */
  decimal?: '.' | ',';
}

/**
 * Parses a money string into integer cents. Accepts an optional currency
 * symbol, thousands separators, a leading minus or trailing minus, and
 * accounting-style parentheses for negatives: "(12.50)" is -1250.
 * Returns null when the text is not a single amount with at most two decimals.
 */
export function parseMoney(input: string, opts: ParseMoneyOptions = {}): number | null {
  const decimal = opts.decimal ?? '.';
  const group = decimal === '.' ? ',' : '.';
  let s = input.trim();
  if (s === '') return null;

  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }
  // Currency symbols and codes, before or after the number.
  s = s.replace(/^(?:[$€£¥₹]|[A-Z]{3})\s*/u, '').replace(/\s*(?:[$€£¥₹]|[A-Z]{3})$/u, '');
  if (s.startsWith('-') && !negative) {
    // "$-12.00"
    negative = true;
    s = s.slice(1);
  }

  const groupRe = group === ',' ? /,/g : /\./g;
  const pattern =
    decimal === '.'
      ? /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$|^\.(\d{1,2})$/
      : /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$|^,(\d{1,2})$/;
  const match = pattern.exec(s);
  if (!match) return null;

  const [whole = '0', frac = ''] = s.replace(groupRe, '').split(decimal);
  const cents = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return negative && cents !== 0 ? -cents : cents;
}

export interface FormatMoneyOptions {
  symbol?: string;
  /** Decimal separator; default '.'. */
  decimal?: '.' | ',';
  /** Thousands separator; default ','. Empty for none. */
  group?: string;
  /** Show "+" for positive values (used for income rows). */
  signed?: boolean;
}

export function formatCents(cents: number, opts: FormatMoneyOptions = {}): string {
  if (!Number.isInteger(cents)) throw new Error(`Cents must be an integer, got ${cents}`);
  const symbol = opts.symbol ?? '$';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, opts.group ?? ',');
  const frac = String(abs % 100).padStart(2, '0');
  const sign = cents < 0 ? '-' : opts.signed && cents > 0 ? '+' : '';
  return `${sign}${symbol}${whole}${opts.decimal ?? '.'}${frac}`;
}

/** Plain decimal string for CSV export and edit fields: -1250 -> "-12.50". */
export function centsToDecimalString(cents: number): string {
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${s}` : s;
}

/**
 * Splits a total into `parts` integer amounts that add up exactly to the
 * total. Leftover cents go to the first parts: 1000 / 3 = [334, 333, 333].
 */
export function splitCents(total: number, parts: number): number[] {
  if (!Number.isInteger(total)) throw new Error('total must be integer cents');
  if (!Number.isInteger(parts) || parts <= 0) throw new Error('parts must be a positive integer');
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / parts);
  const extra = abs % parts;
  return Array.from({ length: parts }, (_, i) => sign * (base + (i < extra ? 1 : 0)) || 0);
}

/** Integer-safe division rounding half away from zero. */
export function divideRound(numerator: number, denominator: number): number {
  if (denominator === 0) throw new Error('division by zero');
  const q = Math.abs(numerator) / Math.abs(denominator);
  const r = Math.floor(q + 0.5);
  return Math.sign(numerator) * Math.sign(denominator) * r || 0;
}

/**
 * Parses an amount typed by the user. The device's decimal separator is
 * tried first; a plain "." is always accepted too, so "12.50" works on a
 * phone set to a comma locale.
 */
export function parseMoneyInput(input: string, decimal: '.' | ',' = '.'): number | null {
  return parseMoney(input, { decimal }) ?? (decimal === ',' ? parseMoney(input) : null);
}
