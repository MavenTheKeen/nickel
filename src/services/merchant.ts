import type { CategoryRule } from '@/types/domain';

// Bank exports write the same shop many ways: "STARBUCKS #1234 TORONTO ON",
// "Starbucks 0042", "SQ *STARBUCKS". A merchant key strips the parts that
// change between purchases so rules, history and bill detection can compare
// merchants.

/** Card-processor prefixes and filler words that say nothing about the merchant. */
const NOISE = new Set([
  'sq',
  'tst',
  'pos',
  'pp',
  'paypal',
  'purchase',
  'debit',
  'credit',
  'card',
  'payment',
  'visa',
  'mc',
  'interac',
  'contactless',
  'inc',
  'ltd',
  'llc',
  'co',
]);

/**
 * Lower case, punctuation and digits removed, noise words dropped, spaces
 * collapsed. Returns '' when nothing meaningful is left.
 */
export function merchantKey(merchant: string): string {
  return merchant
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '' && !/\d/.test(w) && !NOISE.has(w))
    .join(' ');
}

/** True if every word of `pattern` appears, in order and as whole words, in `key`. */
export function keyContains(key: string, pattern: string): boolean {
  if (pattern === '') return false;
  return ` ${key} `.includes(` ${pattern} `);
}

/**
 * The rule for a merchant: the longest matching pattern wins, so
 * "uber eats" beats "uber". Ties go to the newest rule.
 */
export function matchRule(
  merchant: string,
  rules: readonly Pick<CategoryRule, 'id' | 'pattern' | 'categoryId'>[],
): Pick<CategoryRule, 'id' | 'pattern' | 'categoryId'> | null {
  const key = merchantKey(merchant);
  if (key === '') return null;
  let best: Pick<CategoryRule, 'id' | 'pattern' | 'categoryId'> | null = null;
  for (const r of rules) {
    if (!keyContains(key, r.pattern)) continue;
    if (
      !best ||
      r.pattern.length > best.pattern.length ||
      (r.pattern.length === best.pattern.length && r.id > best.id)
    ) {
      best = r;
    }
  }
  return best;
}

/** Display form of a key: "tim hortons" -> "Tim Hortons". */
export function titleCase(key: string): string {
  return key.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export interface MerchantCategoryCount {
  merchant: string;
  categoryId: number;
  count: number;
}

export type SuggestionSource = 'rule' | 'history';

export interface CategorySuggestion {
  categoryId: number;
  source: SuggestionSource;
}

/**
 * A category for a merchant: a matching rule first, otherwise the category
 * this merchant was filed under most often (at least twice, and more often
 * than any other).
 */
export function suggestCategory(
  merchant: string,
  rules: readonly Pick<CategoryRule, 'id' | 'pattern' | 'categoryId'>[],
  counts: readonly MerchantCategoryCount[],
): CategorySuggestion | null {
  const rule = matchRule(merchant, rules);
  if (rule) return { categoryId: rule.categoryId, source: 'rule' };
  const key = merchantKey(merchant);
  if (key === '') return null;
  const tally = new Map<number, number>();
  for (const c of counts) {
    if (merchantKey(c.merchant) === key) {
      tally.set(c.categoryId, (tally.get(c.categoryId) ?? 0) + c.count);
    }
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  if (!top || top[1] < 2 || (second && second[1] === top[1])) return null;
  return { categoryId: top[0], source: 'history' };
}
