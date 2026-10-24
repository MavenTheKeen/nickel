/** A calendar date in the user's local time, formatted YYYY-MM-DD. */
export type IsoDate = string;
/** A calendar month, formatted YYYY-MM. */
export type IsoMonth = string;

export type Cadence = 'weekly' | 'monthly' | 'yearly';

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string;
  isIncome: boolean;
  archived: boolean;
  sortOrder: number;
  /** Unspent budget carries into the next period, and overspending is taken from it. */
  rollover: boolean;
}

export interface Transaction {
  id: number;
  /** Integer cents; negative for expenses, positive for income. */
  amountCents: number;
  date: IsoDate;
  categoryId: number;
  note: string;
  merchant: string;
  recurringId: number | null;
  importBatchId: number | null;
  /** File name of a receipt photo in the receipts folder, or null. */
  receipt: string | null;
  /** For a foreign-currency purchase: the amount as paid, its currency and the rate used. */
  original: ForeignAmount | null;
  createdAt: string;
}

export interface ForeignAmount {
  /** Minor units of the currency (cents, or yen for JPY), signed like amountCents. */
  minor: number;
  currency: string;
  /** Home currency per unit of this currency, in millionths. */
  rateMicros: number;
}

export type NewTransaction = Omit<
  Transaction,
  'id' | 'createdAt' | 'recurringId' | 'importBatchId' | 'receipt' | 'original'
> & {
  recurringId?: number | null;
  importBatchId?: number | null;
  receipt?: string | null;
  original?: ForeignAmount | null;
};

export interface Budget {
  id: number;
  categoryId: number;
  month: IsoMonth;
  limitCents: number;
}

export interface RecurringRule {
  id: number;
  amountCents: number;
  categoryId: number;
  cadence: Cadence;
  /** The first occurrence; every later occurrence is computed from it. */
  anchorDate: IsoDate;
  /** Index of the next occurrence to generate (0 = anchorDate). */
  nextIndex: number;
  nextDue: IsoDate;
  note: string;
  merchant: string;
  active: boolean;
}

export interface ImportBatch {
  id: number;
  filename: string;
  importedAt: string;
  rowCount: number;
  errorCount: number;
}

/** "Merchant contains pattern -> category". The pattern is a normalised merchant key. */
export interface CategoryRule {
  id: number;
  pattern: string;
  categoryId: number;
  createdAt: string;
}

export interface Goal {
  id: number;
  name: string;
  targetCents: number;
  targetDate: IsoDate | null;
  color: string;
  icon: string;
  createdAt: string;
  archived: boolean;
  /** Sum of contributions; withdrawals are negative contributions. */
  savedCents: number;
}

export interface GoalContribution {
  id: number;
  goalId: number;
  amountCents: number;
  date: IsoDate;
  note: string;
}
