import type { Category, CategoryRule, IsoDate } from '@/types/domain';

import { addDays, dayOfWeek, parseIsoDate } from './dates';
import { CURRENCIES, isCurrencyCode } from './fx';
import { suggestCategory, type MerchantCategoryCount, type SuggestionSource } from './merchant';
import { parseMoneyInput } from './money';

// Quick add: one line of text such as "12.50 groceries loblaws yesterday"
// becomes a transaction. Order does not matter. The rules:
// - the first number is the amount; a leading "+" makes it income
// - a currency symbol or code next to it ("€24", "24 EUR", "24eur") records it
//   in that currency, converted to the home currency when saved
// - "today", "yesterday", a weekday ("mon", "friday") or 2025-06-14 sets the date
// - a word or phrase that names a category picks it ("eating out", "groc")
// - everything else is the merchant, which also suggests a category
//   through rules and history when no category was named

export interface QuickAddResult {
  /**
   * Positive amount as typed, in hundredths, or null when no amount was found.
   * In the home currency unless `currency` is set.
   */
  amountCents: number | null;
  /** ISO code of a foreign currency named in the text, or null for the home currency. */
  currency: string | null;
  kind: 'expense' | 'income';
  date: IsoDate;
  categoryId: number | null;
  categorySource: 'name' | SuggestionSource | null;
  merchant: string;
}

export interface QuickAddContext {
  today: IsoDate;
  categories: readonly Category[];
  rules: readonly Pick<CategoryRule, 'id' | 'pattern' | 'categoryId'>[];
  counts: readonly MerchantCategoryCount[];
  decimal?: '.' | ',';
  currencySymbol?: string;
  /** ISO code of the home currency; naming it is the same as naming none. */
  homeCurrency?: string;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

/** Words that join a phrase together and are dropped from the merchant. */
const FILLER = new Set(['at', 'for', 'from', 'on', 'in', 'to']);

/** Symbols that identify one currency; "$" is left out because many currencies use it. */
const SYMBOLS: readonly (readonly [string, string])[] = CURRENCIES.filter((c) => c.symbol).map(
  (c) => [c.symbol as string, c.code] as const,
);

/**
 * A word that is only a currency code. Upper case always counts; lower case
 * counts unless it is also an English word ("try" is the Turkish lira).
 */
function currencyWord(word: string): string | null {
  const upper = word.toUpperCase();
  if (!isCurrencyCode(upper)) return null;
  if (word !== upper && upper === 'TRY') return null;
  return upper;
}

/** A date word, or null. A weekday means the most recent one, today included. */
export function parseDateWord(word: string, today: IsoDate): IsoDate | null {
  const w = word.toLowerCase();
  if (w === 'today') return today;
  if (w === 'yesterday') return addDays(today, -1);
  const weekday = WEEKDAYS[w];
  if (weekday !== undefined) return addDays(today, -((dayOfWeek(today) - weekday + 7) % 7));
  return parseIsoDate(word) ? word : null;
}

function stripAffix(w: string, affix: string): string | null {
  if (affix && w.startsWith(affix)) return w.slice(affix.length);
  if (affix && w.endsWith(affix)) return w.slice(0, w.length - affix.length);
  return null;
}

function parseAmountWord(
  word: string,
  decimal: '.' | ',',
  symbol: string,
): { cents: number; sign: '+' | '-' | null; currency: string | null } | null {
  let w = word;
  let sign: '+' | '-' | null = null;
  let currency: string | null = null;
  if (w.startsWith('+') || w.startsWith('-')) {
    sign = w[0] as '+' | '-';
    w = w.slice(1);
  }
  for (const [sym, code] of SYMBOLS) {
    const stripped = stripAffix(w, sym);
    if (stripped !== null) {
      currency = code;
      w = stripped;
      break;
    }
  }
  if (currency === null) {
    for (const s of [symbol, '$']) w = stripAffix(w, s) ?? w;
    // A code written onto the number: "24eur", "EUR24".
    const before = /^([a-z]{3})(\d.*)$/i.exec(w);
    const after = /^(\d.*?)([a-z]{3})$/i.exec(w);
    const code = before?.[1] ?? after?.[2];
    const number = before?.[2] ?? after?.[1];
    if (code && number && isCurrencyCode(code)) {
      currency = code.toUpperCase();
      w = number;
    }
  }
  if (!/^\d/.test(w)) return null;
  const cents = parseMoneyInput(w, decimal);
  return cents === null || cents <= 0 ? null : { cents, sign, currency };
}

function findCategory(
  words: readonly string[],
  categories: readonly Category[],
): { category: Category; start: number; length: number } | null {
  const active = categories.filter((c) => !c.archived);
  const byName = new Map(active.map((c) => [c.name.toLowerCase(), c]));
  // Longest phrase first, so "other income" wins over "other".
  for (let length = Math.min(3, words.length); length >= 1; length--) {
    for (let start = 0; start + length <= words.length; start++) {
      const phrase = words
        .slice(start, start + length)
        .join(' ')
        .toLowerCase();
      const exact = byName.get(phrase);
      if (exact) return { category: exact, start, length };
    }
  }
  // A single word of three or more letters that starts exactly one category name.
  for (let start = 0; start < words.length; start++) {
    const w = words[start]!.toLowerCase();
    if (w.length < 3) continue;
    const matches = active.filter((c) => c.name.toLowerCase().startsWith(w));
    if (matches.length === 1) return { category: matches[0]!, start, length: 1 };
  }
  return null;
}

export function parseQuickAdd(text: string, ctx: QuickAddContext): QuickAddResult {
  const decimal = ctx.decimal ?? '.';
  let words = text.trim().split(/\s+/).filter(Boolean);

  let amountCents: number | null = null;
  let sign: '+' | '-' | null = null;
  let currency: string | null = null;
  let date = ctx.today;
  const rest: string[] = [];
  for (const w of words) {
    const d = parseDateWord(w, ctx.today);
    if (d !== null) {
      date = d;
      continue;
    }
    if (amountCents === null) {
      const a = parseAmountWord(w, decimal, ctx.currencySymbol ?? '$');
      if (a) {
        amountCents = a.cents;
        sign = a.sign;
        currency = a.currency ?? currency;
        continue;
      }
    }
    const code = currency === null ? currencyWord(w) : null;
    if (code) {
      currency = code;
      continue;
    }
    rest.push(w);
  }
  words = rest;
  if (currency !== null && currency === ctx.homeCurrency) currency = null;

  let categoryId: number | null = null;
  let categorySource: QuickAddResult['categorySource'] = null;
  let isIncome: boolean | null = sign === '+' ? true : sign === '-' ? false : null;
  const named = findCategory(words, ctx.categories);
  if (named && (isIncome === null || named.category.isIncome === isIncome)) {
    categoryId = named.category.id;
    categorySource = 'name';
    isIncome = named.category.isIncome;
    words = [...words.slice(0, named.start), ...words.slice(named.start + named.length)];
  }

  while (words.length > 0 && FILLER.has(words[0]!.toLowerCase())) words = words.slice(1);
  while (words.length > 0 && FILLER.has(words.at(-1)!.toLowerCase())) words = words.slice(0, -1);
  const merchant = words.join(' ');

  if (categoryId === null && merchant !== '') {
    const suggestion = suggestCategory(merchant, ctx.rules, ctx.counts);
    const cat = suggestion && ctx.categories.find((c) => c.id === suggestion.categoryId);
    if (suggestion && cat && !cat.archived && (isIncome === null || cat.isIncome === isIncome)) {
      categoryId = cat.id;
      categorySource = suggestion.source;
      isIncome = cat.isIncome;
    }
  }

  return {
    amountCents,
    currency,
    kind: isIncome ? 'income' : 'expense',
    date,
    categoryId,
    categorySource,
    merchant,
  };
}

/** The category quick add uses when nothing in the text names or suggests one. */
export function fallbackCategory(
  categories: readonly Category[],
  kind: QuickAddResult['kind'],
): Category | undefined {
  const income = kind === 'income';
  const active = categories.filter((c) => !c.archived && c.isIncome === income);
  return active.find((c) => /^other/i.test(c.name)) ?? active[0];
}
