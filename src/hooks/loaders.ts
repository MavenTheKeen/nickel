import { listBudgets } from '@/db/repositories/budgets';
import { listCategories } from '@/db/repositories/categories';
import { listCategoryRules, merchantCategoryCounts } from '@/db/repositories/categoryRules';
import { contributedBetween, listGoals } from '@/db/repositories/goals';
import { listDismissedSuggestions, listRules } from '@/db/repositories/recurring';
import {
  budgetLines,
  countTransactionsIn,
  largestExpenses,
  monthlyTotals,
  spendingByCategory,
  spendingByWeekday,
  topMerchants,
  type CategorySpend,
  type LargeExpense,
  type MerchantSpend,
  type MonthTotals,
} from '@/db/repositories/reports';
import { getInternal } from '@/db/repositories/settings';
import { recentTransactions, transactionsWithMerchantSince } from '@/db/repositories/transactions';
import type { Db } from '@/db/types';
import { budgetProgress, safeToSpendToday, type BudgetProgress } from '@/services/budgetMath';
import { detectBills, type BillSuggestion } from '@/services/billDetection';
import { addDays, addMonthsToMonth, daysBetween, periodOf, periodRange } from '@/services/dates';
import type { MerchantCategoryCount } from '@/services/merchant';
import { buildReview, type ReviewCard } from '@/services/review';
import { occurrencesBetween } from '@/services/recurrence';
import type {
  Category,
  CategoryRule,
  Goal,
  IsoDate,
  IsoMonth,
  RecurringRule,
  Transaction,
} from '@/types/domain';

// Read models for each screen: one async call per screen, composed from
// repository queries, so screens stay free of data logic.

export interface UpcomingBill {
  rule: RecurringRule;
  date: IsoDate;
}

export interface HomeData {
  month: IsoMonth;
  hasBudgets: boolean;
  totalLimitCents: number;
  /** Spending in budgeted categories only, to compare with the total limit. */
  budgetedSpentCents: number;
  monthExpenseCents: number;
  monthIncomeCents: number;
  safeToSpendCents: number;
  recent: Transaction[];
  upcoming: UpcomingBill[];
}

export function upcomingBills(
  rules: readonly RecurringRule[],
  today: IsoDate,
  days = 7,
): UpcomingBill[] {
  const end = addDays(today, days);
  return rules
    .flatMap((rule) =>
      occurrencesBetween(rule.anchorDate, rule.cadence, rule.nextIndex, today, end).map((o) => ({
        rule,
        date: o.date,
      })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.rule.id - b.rule.id));
}

export async function loadHome(db: Db, today: IsoDate, startDay = 1): Promise<HomeData> {
  const month = periodOf(today, startDay);
  const [lines, totals, recent, rules] = await Promise.all([
    budgetLines(db, month, startDay),
    monthlyTotals(db, month, 1, startDay),
    recentTransactions(db, 10),
    listRules(db),
  ]);
  const totalLimitCents = lines.reduce((s, l) => s + l.limitCents, 0);
  const budgetedSpentCents = lines.reduce((s, l) => s + l.spentCents, 0);
  const thisMonth = totals[0] ?? { expenseCents: 0, incomeCents: 0 };
  return {
    month,
    hasBudgets: lines.length > 0,
    totalLimitCents,
    budgetedSpentCents,
    monthExpenseCents: thisMonth.expenseCents,
    monthIncomeCents: thisMonth.incomeCents,
    safeToSpendCents: safeToSpendToday({
      totalLimitCents,
      totalSpentCents: budgetedSpentCents,
      today,
      startDay,
    }),
    recent,
    upcoming: upcomingBills(rules, today),
  };
}

export interface BudgetRow {
  category: Category;
  /** The limit to spend against: the set limit plus any rollover carry. */
  limitCents: number | null;
  /** The limit as set for this period. */
  baseLimitCents: number | null;
  carryCents: number;
  spentCents: number;
  progress: BudgetProgress | null;
}

/** Every active expense category, with its limit and spending for the month. */
export async function loadBudgets(db: Db, month: IsoMonth, startDay = 1): Promise<BudgetRow[]> {
  const [categories, lines, spend] = await Promise.all([
    listCategories(db),
    budgetLines(db, month, startDay),
    spendingByCategory(db, month, startDay),
  ]);
  const lineBy = new Map(lines.map((l) => [l.categoryId, l]));
  const spentBy = new Map(spend.map((s) => [s.categoryId, s.spentCents]));
  return categories
    .filter((c) => !c.isIncome)
    .map((category) => {
      const line = lineBy.get(category.id);
      const spentCents = line?.spentCents ?? spentBy.get(category.id) ?? 0;
      return {
        category,
        limitCents: line?.limitCents ?? null,
        baseLimitCents: line?.baseLimitCents ?? null,
        carryCents: line?.carryCents ?? 0,
        spentCents,
        progress: line ? budgetProgress(spentCents, line.limitCents) : null,
      };
    })
    .sort((a, b) => Number(b.limitCents !== null) - Number(a.limitCents !== null));
}

export async function hasBudgetsFor(db: Db, month: IsoMonth): Promise<boolean> {
  return (await listBudgets(db, month)).length > 0;
}

export interface InsightsData {
  byCategory: CategorySpend[];
  trend: MonthTotals[];
  merchants: MerchantSpend[];
  largest: LargeExpense[];
}

export async function loadInsights(db: Db, month: IsoMonth, startDay = 1): Promise<InsightsData> {
  const [byCategory, trend, merchants, largest] = await Promise.all([
    spendingByCategory(db, month, startDay),
    monthlyTotals(db, month, 12, startDay),
    topMerchants(db, month, 5, startDay),
    largestExpenses(db, month, 5, startDay),
  ]);
  return { byCategory, trend, merchants, largest };
}

/** Bills worth suggesting from the last 400 days of transactions. */
export async function loadBillSuggestions(db: Db, today: IsoDate): Promise<BillSuggestion[]> {
  const [transactions, rules, dismissed] = await Promise.all([
    transactionsWithMerchantSince(db, addDays(today, -400)),
    listRules(db),
    listDismissedSuggestions(db),
  ]);
  return detectBills({ transactions, rules, dismissed, today });
}

export interface Categorizer {
  rules: CategoryRule[];
  counts: MerchantCategoryCount[];
}

/** What quick add, the form and the importer need to suggest a category. */
export async function loadCategorizer(db: Db): Promise<Categorizer> {
  const [rules, counts] = await Promise.all([listCategoryRules(db), merchantCategoryCounts(db)]);
  return { rules, counts };
}

export interface ReviewData {
  month: IsoMonth;
  cards: ReviewCard[];
}

export async function loadReview(db: Db, month: IsoMonth, startDay = 1): Promise<ReviewData> {
  const prev = addMonthsToMonth(month, -1);
  const { start, end } = periodRange(month, startDay);
  const [
    totals,
    byCategory,
    prevByCategory,
    merchants,
    largest,
    lines,
    byWeekday,
    contributed,
    count,
    prevCount,
  ] = await Promise.all([
    monthlyTotals(db, month, 2, startDay),
    spendingByCategory(db, month, startDay),
    spendingByCategory(db, prev, startDay),
    topMerchants(db, month, 1, startDay),
    largestExpenses(db, month, 1, startDay),
    budgetLines(db, month, startDay),
    spendingByWeekday(db, month, startDay),
    contributedBetween(db, start, end),
    countTransactionsIn(db, month, startDay),
    countTransactionsIn(db, prev, startDay),
  ]);
  const [before, now] = totals;
  return {
    month,
    cards: buildReview({
      month,
      spentCents: now?.expenseCents ?? 0,
      incomeCents: now?.incomeCents ?? 0,
      prevSpentCents: prevCount > 0 ? (before?.expenseCents ?? 0) : null,
      byCategory,
      prevByCategory: prevCount > 0 ? prevByCategory : [],
      topMerchant: merchants[0] ?? null,
      largest: largest[0] ?? null,
      budgets: lines,
      byWeekday,
      goalContributedCents: contributed,
      transactionCount: count,
    }),
  };
}

/**
 * The period whose review Home should offer: the one that just ended, during
 * the first week of the new period, if it had transactions and the review has
 * not been opened or dismissed.
 */
export async function loadReviewPrompt(
  db: Db,
  today: IsoDate,
  startDay = 1,
): Promise<IsoMonth | null> {
  const current = periodOf(today, startDay);
  if (daysBetween(periodRange(current, startDay).start, today) >= 7) return null;
  const previous = addMonthsToMonth(current, -1);
  if ((await getInternal(db, 'review_seen')) === previous) return null;
  return (await countTransactionsIn(db, previous, startDay)) > 0 ? previous : null;
}

export async function loadGoals(db: Db, includeArchived = false): Promise<Goal[]> {
  return listGoals(db, { includeArchived });
}
