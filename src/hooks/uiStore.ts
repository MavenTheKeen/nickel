import { create } from 'zustand';

import { periodOf, toIsoDate } from '@/services/dates';
import { DEFAULT_NUMBER_FORMAT, type NumberFormat } from '@/services/format';
import type { IsoMonth } from '@/types/domain';

interface UiState {
  /** Budget period shown on Transactions, Budgets and Insights. */
  month: IsoMonth;
  search: string;
  categoryFilter: number | null;
  /** Mirrors the saved setting so formatting needs no database read. */
  currencySymbol: string;
  /** Mirrors the saved setting: the day budget periods start. */
  periodStartDay: number;
  /** Mirrors the saved setting: ISO code amounts are kept in. */
  homeCurrency: string;
  numberFormat: NumberFormat;
  /** BCP 47 tag used for date formatting. */
  locale: string;
  setMonth: (month: IsoMonth) => void;
  setSearch: (search: string) => void;
  setCategoryFilter: (id: number | null) => void;
  setCurrencySymbol: (symbol: string) => void;
  /** Changing the start day also moves the selected period to today's. */
  setPeriodStartDay: (day: number) => void;
  setLocale: (locale: string, numberFormat: NumberFormat) => void;
  setHomeCurrency: (code: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  month: periodOf(toIsoDate(new Date())),
  search: '',
  categoryFilter: null,
  currencySymbol: '$',
  periodStartDay: 1,
  numberFormat: DEFAULT_NUMBER_FORMAT,
  locale: 'en-US',
  homeCurrency: 'USD',
  setMonth: (month) => set({ month }),
  setSearch: (search) => set({ search }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setCurrencySymbol: (currencySymbol) => set({ currencySymbol }),
  setPeriodStartDay: (periodStartDay) =>
    set({ periodStartDay, month: periodOf(toIsoDate(new Date()), periodStartDay) }),
  setLocale: (locale, numberFormat) => set({ locale, numberFormat }),
  setHomeCurrency: (homeCurrency) => set({ homeCurrency }),
}));
