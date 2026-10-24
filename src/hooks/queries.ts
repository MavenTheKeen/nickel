import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDb } from '@/db/DbProvider';
import { copyBudgetsFromPreviousMonth, removeBudget } from '@/db/repositories/budgets';
import {
  applyRuleToHistory,
  deleteCategoryRule,
  listCategoryRules,
  saveCategoryRule,
  updateCategoryRule,
} from '@/db/repositories/categoryRules';
import {
  addContribution,
  createGoal,
  deleteContribution,
  deleteGoal,
  getGoal,
  listContributions,
  setGoalArchived,
  updateGoal,
  type GoalInput,
} from '@/db/repositories/goals';
import {
  createCategory,
  deleteCategory,
  listCategories,
  setCategoryArchived,
  setCategoryRollover,
  updateCategory,
  type CategoryInput,
} from '@/db/repositories/categories';
import { recentEvents } from '@/db/repositories/events';
import { listBatches, undoBatch } from '@/db/repositories/imports';
import {
  createRule,
  deleteRule,
  dismissSuggestion,
  listRules,
  markNextPaid,
  skipNext,
  updateRule,
  type RuleInput,
} from '@/db/repositories/recurring';
import {
  getSettings,
  setInternal,
  updateSettings,
  type Settings,
} from '@/db/repositories/settings';
import {
  getTransaction,
  listTransactions,
  restoreTransaction,
} from '@/db/repositories/transactions';
import { timed, track } from '@/events/track';
import { listFlagStates } from '@/flags/store';
import { haptics } from '@/platform/haptics';
import { refreshWidget } from '@/widget/widget';
import { useUiStore } from './uiStore';
import { toIsoDate } from '@/services/dates';
import type { BillSuggestion } from '@/services/billDetection';
import type { ForeignAmount, IsoDate, IsoMonth, NewTransaction, Transaction } from '@/types/domain';
import type { TransactionInput } from '@/types/schemas';

import {
  importRows,
  removeTransaction,
  rescheduleNotifications,
  saveBudget,
  saveTransaction,
} from './actions';
import { useAppContext } from './AppContext';
import { getRate, type RateResult } from './fxRates';
import {
  loadBillSuggestions,
  loadBudgets,
  loadCategorizer,
  loadGoals,
  loadHome,
  loadInsights,
  loadReview,
  loadReviewPrompt,
} from './loaders';

// Query keys. Every write invalidates 'data', which every read below sits
// under, so Home, Budgets and Insights refresh after any change.
export const keys = {
  all: ['data'] as const,
  home: (today: string, startDay: number) => ['data', 'home', today, startDay] as const,
  transactions: (month: IsoMonth, search: string, categoryId: number | null, startDay: number) =>
    ['data', 'transactions', month, search, categoryId, startDay] as const,
  transaction: (id: number) => ['data', 'transaction', id] as const,
  budgets: (month: IsoMonth, startDay: number) => ['data', 'budgets', month, startDay] as const,
  insights: (month: IsoMonth, startDay: number) => ['data', 'insights', month, startDay] as const,
  categories: (includeArchived: boolean) => ['data', 'categories', includeArchived] as const,
  rules: ['data', 'rules'] as const,
  batches: ['data', 'batches'] as const,
  settings: ['data', 'settings'] as const,
  events: ['data', 'events'] as const,
  flags: ['data', 'flags'] as const,
  categorizer: ['data', 'categorizer'] as const,
  categoryRules: ['data', 'categoryRules'] as const,
  billSuggestions: (today: string) => ['data', 'billSuggestions', today] as const,
  goals: (includeArchived: boolean) => ['data', 'goals', includeArchived] as const,
  goal: (id: number) => ['data', 'goal', id] as const,
  contributions: (id: number) => ['data', 'contributions', id] as const,
  review: (month: IsoMonth, startDay: number) => ['data', 'review', month, startDay] as const,
  reviewPrompt: (today: string, startDay: number) =>
    ['data', 'reviewPrompt', today, startDay] as const,
};

const today = () => toIsoDate(new Date());

function useInvalidateAll() {
  const qc = useQueryClient();
  const db = useDb();
  return () => {
    refreshWidget(db);
    return qc.invalidateQueries({ queryKey: keys.all });
  };
}

export function useHome() {
  const db = useDb();
  const t = today();
  const startDay = useUiStore((st) => st.periodStartDay);
  return useQuery({ queryKey: keys.home(t, startDay), queryFn: () => loadHome(db, t, startDay) });
}

export function useTransactions(month: IsoMonth, search: string, categoryId: number | null) {
  const db = useDb();
  const startDay = useUiStore((st) => st.periodStartDay);
  return useQuery({
    queryKey: keys.transactions(month, search, categoryId, startDay),
    queryFn: () => listTransactions(db, { month, search, categoryId, startDay }),
    placeholderData: (prev) => prev,
  });
}

export function useTransaction(id: number | null) {
  const db = useDb();
  return useQuery({
    queryKey: keys.transaction(id ?? -1),
    queryFn: () => (id === null ? null : getTransaction(db, id)),
    enabled: id !== null,
  });
}

export function useBudgets(month: IsoMonth) {
  const db = useDb();
  const startDay = useUiStore((st) => st.periodStartDay);
  return useQuery({
    queryKey: keys.budgets(month, startDay),
    queryFn: () => loadBudgets(db, month, startDay),
  });
}

export function useInsights(month: IsoMonth) {
  const db = useDb();
  const startDay = useUiStore((st) => st.periodStartDay);
  return useQuery({
    queryKey: keys.insights(month, startDay),
    queryFn: () => timed('insights_load', () => loadInsights(db, month, startDay)),
  });
}

export function useCategories(includeArchived = false) {
  const db = useDb();
  return useQuery({
    queryKey: keys.categories(includeArchived),
    queryFn: () => listCategories(db, { includeArchived }),
    staleTime: Infinity,
  });
}

export function useRules() {
  const db = useDb();
  return useQuery({ queryKey: keys.rules, queryFn: () => listRules(db) });
}

export function useBatches() {
  const db = useDb();
  return useQuery({ queryKey: keys.batches, queryFn: () => listBatches(db) });
}

export function useSettings() {
  const db = useDb();
  return useQuery({ queryKey: keys.settings, queryFn: () => getSettings(db), staleTime: Infinity });
}

export function useRecentEvents() {
  const db = useDb();
  return useQuery({ queryKey: keys.events, queryFn: () => recentEvents(db, 200) });
}

export function useFlagStates() {
  const db = useDb();
  return useQuery({ queryKey: keys.flags, queryFn: () => listFlagStates(db) });
}

// Mutations

export function useSaveTransaction() {
  const db = useDb();
  const { effects } = useAppContext();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (p: {
      input: TransactionInput & { receipt?: string | null; original?: ForeignAmount | null };
      id?: number;
      source?: 'manual' | 'onboarding' | 'quick_add';
    }) => saveTransaction(db, effects, p.input, { id: p.id, today: today(), source: p.source }),
    onSuccess: () => {
      haptics.success();
      return invalidate();
    },
  });
}

export function useDeleteTransaction() {
  const db = useDb();
  const { effects } = useAppContext();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => removeTransaction(db, effects, id, today()),
    onSuccess: () => {
      haptics.warning();
      return invalidate();
    },
  });
}

export function useRestoreTransaction() {
  const db = useDb();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (t: Transaction) => restoreTransaction(db, t),
    onSuccess: invalidate,
  });
}

export function useSetBudget() {
  const db = useDb();
  const { effects } = useAppContext();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (p: { categoryId: number; month: IsoMonth; limitCents: number | null }) => {
      if (p.limitCents === null) return removeBudget(db, p.categoryId, p.month);
      await saveBudget(db, p.categoryId, p.month, p.limitCents);
      // Budget warnings need permission; ask when a budget first makes them useful.
      await effects.requestPermission().catch(() => false);
    },
    onSuccess: invalidate,
  });
}

export function useCopyBudgets() {
  const db = useDb();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (month: IsoMonth) => copyBudgetsFromPreviousMonth(db, month),
    onSuccess: invalidate,
  });
}

export function useCategoryMutations() {
  const db = useDb();
  const invalidate = useInvalidateAll();
  const opts = { onSuccess: invalidate };
  return {
    create: useMutation({
      mutationFn: (input: CategoryInput) => createCategory(db, input),
      ...opts,
    }),
    update: useMutation({
      mutationFn: (p: { id: number; input: CategoryInput }) => updateCategory(db, p.id, p.input),
      ...opts,
    }),
    archive: useMutation({
      mutationFn: (p: { id: number; archived: boolean }) =>
        setCategoryArchived(db, p.id, p.archived),
      ...opts,
    }),
    remove: useMutation({ mutationFn: (id: number) => deleteCategory(db, id), ...opts }),
  };
}

export function useRuleMutations() {
  const db = useDb();
  const { effects } = useAppContext();
  const qc = useQueryClient();
  const after = async () => {
    await rescheduleNotifications(db, effects, today()).catch(() => null);
    refreshWidget(db);
    await qc.invalidateQueries({ queryKey: keys.all });
  };
  return {
    create: useMutation({
      mutationFn: async (input: RuleInput) => {
        const id = await createRule(db, input);
        // Bill reminders need permission; ask when the first bill makes them useful.
        await effects.requestPermission().catch(() => false);
        return id;
      },
      onSuccess: after,
    }),
    update: useMutation({
      mutationFn: (p: { id: number; input: RuleInput }) => updateRule(db, p.id, p.input),
      onSuccess: after,
    }),
    remove: useMutation({ mutationFn: (id: number) => deleteRule(db, id), onSuccess: after }),
    markPaid: useMutation({
      mutationFn: (id: number) => markNextPaid(db, id, today()),
      onSuccess: after,
    }),
    skip: useMutation({ mutationFn: (id: number) => skipNext(db, id), onSuccess: after }),
  };
}

export function useImport() {
  const db = useDb();
  const { effects } = useAppContext();
  const invalidate = useInvalidateAll();
  return {
    run: useMutation({
      mutationFn: (p: {
        filename: string;
        rows: NewTransaction[];
        errorCount: number;
        totalRows: number;
      }) => importRows(db, effects, { ...p, today: today() }),
      onSuccess: invalidate,
    }),
    undo: useMutation({
      mutationFn: (batchId: number) => undoBatch(db, batchId),
      onSuccess: invalidate,
    }),
  };
}

export function useUpdateSettings() {
  const db = useDb();
  const { effects } = useAppContext();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      await updateSettings(db, patch);
      await rescheduleNotifications(db, effects, today()).catch(() => null);
    },
    onSuccess: invalidate,
  });
}

// Categorising: rules, history and the learning prompt

export function useCategorizer() {
  const db = useDb();
  return useQuery({ queryKey: keys.categorizer, queryFn: () => loadCategorizer(db) });
}

export function useCategoryRules() {
  const db = useDb();
  return useQuery({ queryKey: keys.categoryRules, queryFn: () => listCategoryRules(db) });
}

export function useCategoryRuleMutations() {
  const db = useDb();
  const invalidate = useInvalidateAll();
  return {
    /** Creates or moves the rule; optionally refiles matching past transactions. Returns how many moved. */
    save: useMutation({
      mutationFn: async (p: { pattern: string; categoryId: number; applyToHistory: boolean }) => {
        await saveCategoryRule(db, p.pattern, p.categoryId);
        track('feature_used', { feature: 'rule_created', applyToHistory: p.applyToHistory });
        return p.applyToHistory ? applyRuleToHistory(db, p.pattern, p.categoryId) : 0;
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (p: { id: number; pattern: string; categoryId: number }) =>
        updateCategoryRule(db, p.id, p.pattern, p.categoryId),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => deleteCategoryRule(db, id),
      onSuccess: invalidate,
    }),
  };
}

// Rollover

export function useSetRollover() {
  const db = useDb();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (p: { categoryId: number; rollover: boolean }) =>
      setCategoryRollover(db, p.categoryId, p.rollover),
    onSuccess: invalidate,
  });
}

// Bill suggestions

export function useBillSuggestions() {
  const db = useDb();
  const t = today();
  return useQuery({ queryKey: keys.billSuggestions(t), queryFn: () => loadBillSuggestions(db, t) });
}

export function useBillSuggestionMutations() {
  const db = useDb();
  const { effects } = useAppContext();
  const qc = useQueryClient();
  const after = async () => {
    await rescheduleNotifications(db, effects, today()).catch(() => null);
    refreshWidget(db);
    await qc.invalidateQueries({ queryKey: keys.all });
  };
  return {
    /** Starts a bill at the next expected date, so nothing already recorded is repeated. */
    accept: useMutation({
      mutationFn: async (s: BillSuggestion) => {
        const id = await createRule(db, {
          amountCents: s.amountCents,
          categoryId: s.categoryId,
          cadence: s.cadence,
          anchorDate: s.nextDate,
          note: '',
          merchant: s.merchant,
        });
        track('feature_used', { feature: 'bill_suggestion_accepted', cadence: s.cadence });
        await effects.requestPermission().catch(() => false);
        return id;
      },
      onSuccess: after,
    }),
    dismiss: useMutation({
      mutationFn: (key: string) => dismissSuggestion(db, key),
      onSuccess: after,
    }),
  };
}

// Goals

export function useGoals(includeArchived = false) {
  const db = useDb();
  return useQuery({
    queryKey: keys.goals(includeArchived),
    queryFn: () => loadGoals(db, includeArchived),
  });
}

export function useGoal(id: number | null) {
  const db = useDb();
  return useQuery({
    queryKey: keys.goal(id ?? -1),
    queryFn: () => (id === null ? null : getGoal(db, id)),
    enabled: id !== null,
  });
}

export function useContributions(goalId: number | null) {
  const db = useDb();
  return useQuery({
    queryKey: keys.contributions(goalId ?? -1),
    queryFn: () => (goalId === null ? [] : listContributions(db, goalId)),
    enabled: goalId !== null,
  });
}

export function useGoalMutations() {
  const db = useDb();
  const invalidate = useInvalidateAll();
  const opts = { onSuccess: invalidate };
  return {
    create: useMutation({
      mutationFn: async (input: GoalInput) => {
        const id = await createGoal(db, input);
        track('feature_used', { feature: 'goal_created', hasDate: input.targetDate !== null });
        return id;
      },
      ...opts,
    }),
    update: useMutation({
      mutationFn: (p: { id: number; input: GoalInput }) => updateGoal(db, p.id, p.input),
      ...opts,
    }),
    archive: useMutation({
      mutationFn: (p: { id: number; archived: boolean }) => setGoalArchived(db, p.id, p.archived),
      ...opts,
    }),
    remove: useMutation({ mutationFn: (id: number) => deleteGoal(db, id), ...opts }),
    contribute: useMutation({
      mutationFn: async (p: {
        goalId: number;
        amountCents: number;
        date?: IsoDate;
        note?: string;
      }) => {
        const id = await addContribution(db, p.goalId, p.amountCents, p.date ?? today(), p.note);
        haptics.success();
        return id;
      },
      ...opts,
    }),
    removeContribution: useMutation({
      mutationFn: (id: number) => deleteContribution(db, id),
      ...opts,
    }),
  };
}

// Period review

export function useReview(month: IsoMonth) {
  const db = useDb();
  const startDay = useUiStore((st) => st.periodStartDay);
  return useQuery({
    queryKey: keys.review(month, startDay),
    queryFn: () => loadReview(db, month, startDay),
  });
}

export function useReviewPrompt() {
  const db = useDb();
  const t = today();
  const startDay = useUiStore((st) => st.periodStartDay);
  return useQuery({
    queryKey: keys.reviewPrompt(t, startDay),
    queryFn: () => loadReviewPrompt(db, t, startDay),
  });
}

/** Marks a period's review as seen, so Home stops offering it. */
export function useMarkReviewSeen() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (month: IsoMonth) => setInternal(db, 'review_seen', month),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data', 'reviewPrompt'] }),
  });
}

// Exchange rates. Kept outside the 'data' key, so saving a transaction does
// not refetch them; a rate for a given day does not change.

export type RateState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rate: RateResult }
  | { status: 'error'; message: string };

const rateKey = (from: string, home: string, date: IsoDate) => ['fx', from, home, date] as const;

export function useRate(from: string | null, date: IsoDate): RateState {
  const db = useDb();
  const home = useUiStore((st) => st.homeCurrency);
  const q = useQuery({
    queryKey: rateKey(from ?? home, home, date),
    queryFn: () => getRate(db, from ?? home, home, date, today()),
    enabled: from !== null && from !== home,
    staleTime: Infinity,
  });
  if (from === null || from === home) return { status: 'idle' };
  if (q.data) return { status: 'ready', rate: q.data };
  if (q.error) return { status: 'error', message: q.error.message };
  return { status: 'loading' };
}

/** Gets a rate outside render, sharing the cache with useRate. */
export function useRateFetcher() {
  const db = useDb();
  const qc = useQueryClient();
  const home = useUiStore((st) => st.homeCurrency);
  return (from: string, date: IsoDate) =>
    qc.fetchQuery({
      queryKey: rateKey(from, home, date),
      queryFn: () => getRate(db, from, home, date, today()),
      staleTime: Infinity,
    });
}
