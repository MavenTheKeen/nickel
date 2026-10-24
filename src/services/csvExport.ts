import type { Category, Transaction } from '@/types/domain';

import { toCsv } from './csv';
import { centsToDecimalString } from './money';

export const EXPORT_HEADER = ['date', 'amount', 'category', 'merchant', 'note'] as const;

/**
 * Exports transactions in a format the importer reads back unchanged: ISO
 * dates, signed decimal amounts, and category names.
 */
export function transactionsToCsv(
  transactions: readonly Transaction[],
  categories: readonly Category[],
): string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return toCsv([
    [...EXPORT_HEADER],
    ...transactions.map((t) => [
      t.date,
      centsToDecimalString(t.amountCents),
      names.get(t.categoryId) ?? '',
      t.merchant,
      t.note,
    ]),
  ]);
}
