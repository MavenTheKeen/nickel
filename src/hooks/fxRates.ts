import { cachedRate, newestCachedRate, saveRate } from '@/db/repositories/fxRates';
import type { Db } from '@/db/types';
import { fetchRate, RATE_SCALE, RateUnavailableError, type FetchedRate } from '@/services/fx';
import type { IsoDate } from '@/types/domain';

export interface RateResult extends FetchedRate {
  /**
   * Where the rate came from. "offline" means the network failed and the
   * newest stored rate for the pair is used instead; the form says so.
   */
  source: 'same' | 'cache' | 'network' | 'offline';
}

/**
 * The rate to convert one unit of `from` into `home` on `date`: stored rates
 * first, then the network, then the newest stored rate if offline. A rate
 * fetched for a past date is stored under that date and never fetched again;
 * today's and future rates are stored under today, so they refresh daily.
 */
export async function getRate(
  db: Db,
  from: string,
  home: string,
  date: IsoDate,
  today: IsoDate,
  fetchImpl?: typeof fetch,
): Promise<RateResult> {
  if (from === home) return { rateMicros: RATE_SCALE, rateDate: date, source: 'same' };
  const key = date < today ? date : today;
  const cached = await cachedRate(db, from, home, key);
  if (cached) return { ...cached, source: 'cache' };
  try {
    const fetched = await fetchRate(from, home, key, today, fetchImpl);
    await saveRate(db, from, home, key, fetched);
    return { ...fetched, source: 'network' };
  } catch (e) {
    const fallback = await newestCachedRate(db, from, home);
    if (fallback) return { ...fallback, source: 'offline' };
    throw e instanceof RateUnavailableError ? e : new RateUnavailableError(String(e));
  }
}
