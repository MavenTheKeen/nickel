import type { Db } from '@/db/types';
import { clampStartDay } from '@/services/dates';
import type { IsoMonth } from '@/types/domain';

export interface Settings {
  currencySymbol: string;
  notifyBills: boolean;
  notifyBudget: boolean;
  notifyWeekly: boolean;
  /** Set once the first-run flow (either onboarding variant) has finished. */
  onboardingDone: boolean;
  /** Require Face ID, fingerprint or the device passcode to open the app. */
  appLock: boolean;
  /** Opt-in crash reports; only has an effect in builds configured for Sentry. */
  crashReports: boolean;
  /** Day of the month budgets reset (1-28), for example payday. */
  periodStartDay: number;
  /** ISO 4217 code that amounts are kept in. Empty until set from the device region on first start. */
  homeCurrency: string;
}

export const DEFAULT_SETTINGS: Settings = {
  currencySymbol: '$',
  notifyBills: true,
  notifyBudget: true,
  notifyWeekly: true,
  onboardingDone: false,
  appLock: false,
  crashReports: false,
  periodStartDay: 1,
  homeCurrency: '',
};

type Key = keyof Settings;

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const k = key as Key;
    const target = out as unknown as Record<Key, boolean | string | number>;
    const kind = typeof DEFAULT_SETTINGS[k];
    if (kind === 'boolean') target[k] = value === '1';
    else if (kind === 'number') target[k] = Number(value);
    else target[k] = value;
  }
  out.periodStartDay = clampStartDay(out.periodStartDay);
  return out;
}

export async function updateSettings(db: Db, patch: Partial<Settings>): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      await tx.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value)],
      );
    }
  });
}

/** Internal values that are not user preferences (install id and similar). */
export async function getInternal(db: Db, key: string): Promise<string | null> {
  const r = await db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
    `_${key}`,
  ]);
  return r?.value ?? null;
}

export async function setInternal(db: Db, key: string, value: string): Promise<void> {
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [`_${key}`, value],
  );
}

/**
 * Records that a budget warning was sent. Returns false if the same warning
 * was already sent this month, so the caller does not notify again.
 */
export async function recordBudgetWarning(
  db: Db,
  categoryId: number,
  month: IsoMonth,
  threshold: 80 | 100,
  now = new Date(),
): Promise<boolean> {
  const r = await db.run(
    'INSERT OR IGNORE INTO budget_warnings (category_id, month, threshold, sent_at) VALUES (?, ?, ?, ?)',
    [categoryId, month, threshold, now.toISOString()],
  );
  return r.changes === 1;
}
