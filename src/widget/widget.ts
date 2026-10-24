import { getLocales } from 'expo-localization';
import { createElement } from 'react';
import { Appearance, Platform } from 'react-native';

import { getDeviceDb } from '@/db/expoDriver';
import { migrate } from '@/db/migrate';
import { getSettings } from '@/db/repositories/settings';
import type { Db } from '@/db/types';
import { loadHome } from '@/hooks/loaders';
import { optionalModule } from '@/platform/runtime';
import { toIsoDate } from '@/services/dates';
import { numberFormatFrom } from '@/services/format';

import type { SafeToSpendWidget as SafeToSpendWidgetType } from './SafeToSpendWidget';
import { WIDGET_NAME, widgetSummary } from './summary';

type WidgetModule = typeof import('react-native-android-widget');

function widgetModule(): WidgetModule | null {
  if (Platform.OS !== 'android') return null;
  // Loaded lazily: importing it where the native module is missing throws.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return optionalModule<WidgetModule>(() => require('react-native-android-widget'));
}

/** Builds the widget from current data. Runs in the app and in headless widget tasks. */
async function buildWidget(db: Db) {
  const settings = await getSettings(db);
  const loc = getLocales()[0];
  const nf = numberFormatFrom(loc?.decimalSeparator, loc?.digitGroupingSeparator);
  const home = settings.appLock
    ? null
    : await loadHome(db, toIsoDate(new Date()), settings.periodStartDay);
  const summary = widgetSummary(home, {
    locked: settings.appLock,
    money: { symbol: settings.currencySymbol, decimal: nf.decimal, group: nf.group },
  });
  // Required here, not imported, so the widget library loads only on Android.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SafeToSpendWidget } = require('./SafeToSpendWidget') as {
    SafeToSpendWidget: typeof SafeToSpendWidgetType;
  };
  return createElement(SafeToSpendWidget, {
    summary,
    dark: Appearance.getColorScheme() === 'dark',
  });
}

let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * Redraws any placed widgets after data changes. Debounced so a burst of
 * writes (an import, a restore) redraws once. A no-op off Android and in Expo Go.
 */
export function refreshWidget(db: Db): void {
  const mod = widgetModule();
  if (!mod) return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    void mod
      .requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => buildWidget(db) })
      .catch(() => undefined);
  }, 500);
}

/**
 * Registers the handler Android calls when a widget is added, resized or
 * due for its periodic update, possibly with the app closed. Called from index.ts.
 */
export function registerWidgetHandler(): void {
  const mod = widgetModule();
  if (!mod) return;
  mod.registerWidgetTaskHandler(async (props) => {
    if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
    const { db } = await getDeviceDb();
    await migrate(db);
    props.renderWidget(await buildWidget(db));
  });
}
