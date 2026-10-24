import { getStoredFlag, listStoredFlags, storeFlag } from '@/db/repositories/flags';
import { getInternal, setInternal } from '@/db/repositories/settings';
import type { Db } from '@/db/types';
import { track } from '@/events/track';

import { assignVariant } from './assign';
import { flagDefinitions, type FlagDefinition } from './definitions';

const INSTALL_ID_KEY = 'install_id';

/** The install id is created once and kept; it is the only input to variant assignment. */
export async function ensureInstallId(db: Db, generate: () => string): Promise<string> {
  const existing = await getInternal(db, INSTALL_ID_KEY);
  if (existing) return existing;
  const id = generate();
  await setInternal(db, INSTALL_ID_KEY, id);
  return id;
}

/** New id means new variants: used by "Reset install id" on the debug screen. */
export async function resetInstallId(db: Db, generate: () => string): Promise<string> {
  const id = generate();
  await setInternal(db, INSTALL_ID_KEY, id);
  await db.run('DELETE FROM flags WHERE overridden = 0');
  return id;
}

/**
 * Returns the stored variant, or assigns one deterministically and stores it.
 * Storing the first assignment keeps a user's experience fixed even if the
 * weights change in a later version. Exposure is tracked on first assignment.
 */
export async function getVariant<V extends string>(
  db: Db,
  flag: FlagDefinition<V>,
  installId: string,
  now = new Date(),
): Promise<V> {
  const stored = await getStoredFlag(db, flag.key);
  if (stored && (flag.variants as readonly string[]).includes(stored.variant)) {
    return stored.variant as V;
  }
  const variant = assignVariant(installId, flag);
  await storeFlag(db, flag.key, variant, false, now);
  track('experiment_exposure', { flag: flag.key, variant });
  return variant;
}

export async function overrideVariant(db: Db, flagKey: string, variant: string): Promise<void> {
  const def = flagDefinitions.find((f) => f.key === flagKey);
  if (!def || !def.variants.includes(variant))
    throw new Error(`Unknown variant ${flagKey}=${variant}`);
  await storeFlag(db, flagKey, variant, true);
}

export interface FlagState {
  key: string;
  description: string;
  variants: readonly string[];
  variant: string | null;
  overridden: boolean;
}

export async function listFlagStates(db: Db): Promise<FlagState[]> {
  const stored = new Map((await listStoredFlags(db)).map((f) => [f.key, f]));
  return flagDefinitions.map((def) => ({
    key: def.key,
    description: def.description,
    variants: def.variants,
    variant: stored.get(def.key)?.variant ?? null,
    overridden: stored.get(def.key)?.overridden ?? false,
  }));
}
