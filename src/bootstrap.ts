import * as Crypto from 'expo-crypto';
import { getLocales } from 'expo-localization';

import { getDeviceDb } from '@/db/expoDriver';
import { migrate } from '@/db/migrate';
import { seedDefaultCategories } from '@/db/repositories/categories';
import { insertEvent, pruneEvents } from '@/db/repositories/events';
import { getSettings, updateSettings, type Settings } from '@/db/repositories/settings';
import { referencedReceipts } from '@/db/repositories/transactions';
import type { Db } from '@/db/types';
import { attachEventSink, now, track, trackTiming } from '@/events/track';
import {
  listEngineFlag,
  onboardingFlag,
  type ListEngine,
  type OnboardingVariant,
} from '@/flags/definitions';
import { ensureInstallId, getVariant } from '@/flags/store';
import { onAppStart, type Effects } from '@/hooks/actions';
import {
  applyPlan,
  configureNotificationHandler,
  notifyNow,
  requestNotificationPermission,
} from '@/notifications/scheduler';
import { setCrashReportingConsent } from '@/monitoring/sentry';
import { cleanupReceipts } from '@/platform/receipts';
import { toIsoDate } from '@/services/dates';
import { isCurrencyCode } from '@/services/fx';
import { registerBackgroundRefresh } from '@/background/refreshTask';

/** Recorded when this module is first evaluated: the earliest point JS can measure. */
export const JS_START = now();

export const deviceEffects: Effects = {
  notifyNow,
  applyPlan,
  requestPermission: requestNotificationPermission,
};

export interface BootResult {
  db: Db;
  encrypted: boolean;
  installId: string;
  settings: Settings;
  onboardingVariant: OnboardingVariant;
  listEngine: ListEngine;
}

/**
 * Everything the app needs before the first screen: open and migrate the
 * database, connect the event log, assign experiment variants, and generate
 * any recurring bills that fell due while the app was closed.
 */
export async function bootstrap(): Promise<BootResult> {
  const t0 = now();
  const { db, encrypted } = await getDeviceDb();
  const { from, to } = await migrate(db);
  await seedDefaultCategories(db);

  const sessionId = Crypto.randomUUID();
  await attachEventSink((e) => insertEvent(db, e), sessionId);
  void pruneEvents(db).catch(() => undefined);

  const installId = await ensureInstallId(db, () => Crypto.randomUUID());
  const onboardingVariant = await getVariant(db, onboardingFlag, installId);
  const listEngine = await getVariant(db, listEngineFlag, installId);
  let settings = await getSettings(db);
  if (settings.homeCurrency === '') {
    // First start: amounts are kept in the currency of the phone's region.
    const regional = getLocales()[0]?.currencyCode ?? '';
    await updateSettings(db, { homeCurrency: isCurrencyCode(regional) ? regional : 'USD' });
    settings = await getSettings(db);
  }
  setCrashReportingConsent(settings.crashReports);

  configureNotificationHandler();
  const { generated } = await onAppStart(db, deviceEffects, toIsoDate(new Date()));

  void referencedReceipts(db)
    .then(cleanupReceipts)
    .catch(() => undefined);
  void registerBackgroundRefresh();
  track('app_open', { schemaFrom: from, schemaTo: to, recurringGenerated: generated, encrypted });
  trackTiming('bootstrap', now() - t0);
  return { db, encrypted, installId, settings, onboardingVariant, listEngine };
}
