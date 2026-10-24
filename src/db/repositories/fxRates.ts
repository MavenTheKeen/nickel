import type { Db } from '@/db/types';
import type { FetchedRate } from '@/services/fx';
import type { IsoDate } from '@/types/domain';

export async function cachedRate(
  db: Db,
  base: string,
  quote: string,
  date: IsoDate,
): Promise<FetchedRate | null> {
  const r = await db.first<{ rate_micros: number; rate_date: string }>(
    'SELECT rate_micros, rate_date FROM fx_rates WHERE base = ? AND quote = ? AND date = ?',
    [base, quote, date],
  );
  return r ? { rateMicros: r.rate_micros, rateDate: r.rate_date } : null;
}

/** The newest stored rate for the pair, for use when the phone is offline. */
export async function newestCachedRate(
  db: Db,
  base: string,
  quote: string,
): Promise<FetchedRate | null> {
  const r = await db.first<{ rate_micros: number; rate_date: string }>(
    'SELECT rate_micros, rate_date FROM fx_rates WHERE base = ? AND quote = ? ORDER BY rate_date DESC LIMIT 1',
    [base, quote],
  );
  return r ? { rateMicros: r.rate_micros, rateDate: r.rate_date } : null;
}

export async function saveRate(
  db: Db,
  base: string,
  quote: string,
  date: IsoDate,
  rate: FetchedRate,
  now = new Date(),
): Promise<void> {
  await db.run(
    `INSERT INTO fx_rates (date, base, quote, rate_micros, rate_date, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (base, quote, date) DO UPDATE SET rate_micros = excluded.rate_micros,
       rate_date = excluded.rate_date, fetched_at = excluded.fetched_at`,
    [date, base, quote, rate.rateMicros, rate.rateDate, now.toISOString()],
  );
}
