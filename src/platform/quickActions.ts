import { Platform } from 'react-native';

import { optionalModule } from './runtime';

type QuickActionsModule = typeof import('expo-quick-actions');

/** Paths a quick action or deep link may open. Anything else is ignored. */
export const QUICK_ACTION_HREFS = ['/transaction', '/insights', '/bills', '/import'] as const;
export type QuickActionHref = (typeof QUICK_ACTION_HREFS)[number];

export function isQuickActionHref(value: unknown): value is QuickActionHref {
  return typeof value === 'string' && (QUICK_ACTION_HREFS as readonly string[]).includes(value);
}

const ACTIONS: { id: string; title: string; iosSymbol: string; href: QuickActionHref }[] = [
  { id: 'add', title: 'Add expense', iosSymbol: 'symbol:plus.circle', href: '/transaction' },
  { id: 'insights', title: 'Insights', iosSymbol: 'symbol:chart.pie', href: '/insights' },
  { id: 'bills', title: 'Bills', iosSymbol: 'symbol:calendar', href: '/bills' },
];

/**
 * Registers the app icon long-press menu and calls `open` for the chosen
 * action, both for a cold start from the menu and while the app is running.
 * Returns an unsubscribe function. A no-op where the module is unavailable.
 */
export function registerQuickActions(open: (href: QuickActionHref) => void): () => void {
  // Loaded lazily: importing it where the native module is missing throws.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QA = optionalModule<QuickActionsModule>(() => require('expo-quick-actions'));
  if (!QA) return () => undefined;

  void QA.setItems(
    ACTIONS.map((a) => ({
      id: a.id,
      title: a.title,
      icon: Platform.OS === 'ios' ? a.iosSymbol : null,
      params: { href: a.href },
    })),
  ).catch(() => undefined);

  const handle = (action: { params?: Record<string, unknown> | null } | undefined) => {
    const href = action?.params?.href;
    if (isQuickActionHref(href)) open(href);
  };
  handle(QA.initial);
  const sub = QA.addListener(handle);
  return () => sub.remove();
}
