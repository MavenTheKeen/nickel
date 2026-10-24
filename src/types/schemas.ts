import { z } from 'zod';

import { addDays, parseIsoDate } from '@/services/dates';
import { parseMoneyInput } from '@/services/money';
import type { IsoDate } from '@/types/domain';

export const MAX_NOTE_LENGTH = 500;
export const MAX_MERCHANT_LENGTH = 120;
export const MAX_AMOUNT_CENTS = 99_999_999_99; // 100 million minus a cent
/** Dates more than this many days ahead are almost always typos. */
export const MAX_FUTURE_DAYS = 365;

const isoDate = z.string().refine((s) => parseIsoDate(s) !== null, 'Enter a valid date');

/**
 * The single source of truth for a transaction about to be written, used by
 * the add/edit form and by every CSV row.
 */
export function transactionSchema(today: IsoDate) {
  const latest = addDays(today, MAX_FUTURE_DAYS);
  return z.object({
    amountCents: z
      .number()
      .int('Amount must be in whole cents')
      .refine((v) => v !== 0, 'Amount cannot be zero')
      .refine((v) => Math.abs(v) <= MAX_AMOUNT_CENTS, 'Amount is too large'),
    date: isoDate.refine((d) => d <= latest, 'Date is more than a year in the future'),
    categoryId: z.number().int().positive('Choose a category'),
    note: z.string().max(MAX_NOTE_LENGTH, `Note is longer than ${MAX_NOTE_LENGTH} characters`),
    merchant: z
      .string()
      .max(MAX_MERCHANT_LENGTH, `Merchant is longer than ${MAX_MERCHANT_LENGTH} characters`),
  });
}

export type TransactionInput = z.infer<ReturnType<typeof transactionSchema>>;

/** What the add/edit form holds: text fields as typed, before conversion. */
export interface TransactionFormValues {
  amount: string;
  kind: 'expense' | 'income';
  categoryId: number;
  date: IsoDate;
  note: string;
  merchant: string;
}

export function transactionFormSchema(today: IsoDate, decimal: '.' | ',' = '.') {
  return z
    .object({
      amount: z.string().trim().min(1, 'Enter an amount'),
      kind: z.enum(['expense', 'income']),
      categoryId: z.number().int().positive('Choose a category'),
      date: z.string(),
      note: z.string(),
      merchant: z.string(),
    })
    .transform((v, ctx) => {
      const cents = parseMoneyInput(v.amount, decimal);
      if (cents === null) {
        ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter an amount like 12.50' });
        return z.NEVER;
      }
      if (cents < 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: 'Enter a positive amount and choose expense or income',
        });
        return z.NEVER;
      }
      return {
        amountCents: v.kind === 'expense' ? -cents : cents,
        date: v.date,
        categoryId: v.categoryId,
        note: v.note.trim(),
        merchant: v.merchant.trim(),
      };
    })
    .pipe(transactionSchema(today));
}

export function budgetLimitSchema(decimal: '.' | ',' = '.') {
  return z.string().transform((s, ctx) => {
    const cents = parseMoneyInput(s, decimal);
    if (cents === null || cents <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Enter a limit above zero' });
      return z.NEVER;
    }
    return cents;
  });
}

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(40, 'Name is longer than 40 characters'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a colour'),
  icon: z.string().min(1),
  isIncome: z.boolean(),
});
