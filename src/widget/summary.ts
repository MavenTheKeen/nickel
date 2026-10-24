import type { HomeData } from '@/hooks/loaders';
import { formatCents, type FormatMoneyOptions } from '@/services/money';

/** Name the widget is registered under in app.json. */
export const WIDGET_NAME = 'SafeToSpend';

/** What the home screen widget shows. Pure, so it is tested without Android. */
export interface WidgetSummary {
  label: string;
  value: string;
  detail: string;
  /** True when the value is a problem (nothing left to spend). */
  problem: boolean;
}

export function widgetSummary(
  home: HomeData | null,
  opts: { locked: boolean; money: FormatMoneyOptions },
): WidgetSummary {
  // With the app lock on, the home screen must not show balances.
  if (opts.locked) {
    return {
      label: 'Nickel',
      value: 'Locked',
      detail: 'Open the app to see your budget',
      problem: false,
    };
  }
  if (!home) {
    return { label: 'Nickel', value: '–', detail: 'Open the app once to set up', problem: false };
  }
  const money = (c: number) => formatCents(c, opts.money);
  if (!home.hasBudgets) {
    return {
      label: 'Spent this month',
      value: money(home.monthExpenseCents),
      detail: 'Set a budget to see what is safe to spend',
      problem: false,
    };
  }
  return {
    label: 'Safe to spend today',
    value: money(home.safeToSpendCents),
    detail: `${money(home.budgetedSpentCents)} of ${money(home.totalLimitCents)} spent`,
    problem: home.safeToSpendCents === 0,
  };
}
