import { z } from 'zod';

import type { IsoDate } from '@/types/domain';

// Foreign currency. Amounts in the app are always cents of the home currency;
// a foreign amount is converted once, when it is recorded, at that day's rate.
// Rates are held as integers in millionths and conversion uses BigInt, so no
// float ever touches a stored amount.

export interface Currency {
  code: string;
  /** Digits after the decimal point (minor units), per ISO 4217. */
  decimals: number;
  /** A symbol people type in quick add, when it is unambiguous. */
  symbol?: string;
}

/** The currencies offered in the picker: the most traded, plus those Frankfurter covers well. */
export const CURRENCIES: readonly Currency[] = [
  { code: 'USD', decimals: 2 },
  { code: 'EUR', decimals: 2, symbol: '€' },
  { code: 'GBP', decimals: 2, symbol: '£' },
  { code: 'CAD', decimals: 2 },
  { code: 'AUD', decimals: 2 },
  { code: 'NZD', decimals: 2 },
  { code: 'JPY', decimals: 0, symbol: '¥' },
  { code: 'CHF', decimals: 2 },
  { code: 'CNY', decimals: 2 },
  { code: 'HKD', decimals: 2 },
  { code: 'SGD', decimals: 2 },
  { code: 'KRW', decimals: 0, symbol: '₩' },
  { code: 'INR', decimals: 2, symbol: '₹' },
  { code: 'MXN', decimals: 2 },
  { code: 'BRL', decimals: 2 },
  { code: 'SEK', decimals: 2 },
  { code: 'NOK', decimals: 2 },
  { code: 'DKK', decimals: 2 },
  { code: 'PLN', decimals: 2 },
  { code: 'CZK', decimals: 2 },
  { code: 'HUF', decimals: 2 },
  { code: 'TRY', decimals: 2 },
  { code: 'ZAR', decimals: 2 },
  { code: 'THB', decimals: 2, symbol: '฿' },
  { code: 'ILS', decimals: 2, symbol: '₪' },
  { code: 'ISK', decimals: 0 },
  { code: 'PHP', decimals: 2, symbol: '₱' },
  { code: 'IDR', decimals: 2 },
  { code: 'MYR', decimals: 2 },
  { code: 'AED', decimals: 2 },
];

const byCode = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currency(code: string): Currency | undefined {
  return byCode.get(code.toUpperCase());
}

export function isCurrencyCode(code: string): boolean {
  return byCode.has(code.toUpperCase());
}

export const RATE_SCALE = 1_000_000;

/** 1.571 -> 1571000. Six decimal places is finer than any published reference rate. */
export function rateToMicros(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Invalid rate ${rate}`);
  const micros = Math.round(rate * RATE_SCALE);
  if (micros <= 0) throw new Error(`Rate ${rate} is too small`);
  return micros;
}

/** 1571000 -> "1.571", trailing zeros removed. */
export function formatRate(micros: number): string {
  const whole = Math.floor(micros / RATE_SCALE);
  const frac = String(micros % RATE_SCALE)
    .padStart(6, '0')
    .replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

/** Parses a rate typed by the user ("1.5710" or "1,571"). Returns micros or null. */
export function parseRate(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null;
  const [whole = '0', frac = ''] = s.split('.');
  const micros = Number(whole) * RATE_SCALE + Number(frac.padEnd(6, '0'));
  return micros > 0 && Number.isSafeInteger(micros) ? micros : null;
}

/**
 * Converts an amount in minor units of one currency to cents of the home
 * currency: minor x rate, adjusted for the difference in decimal places,
 * rounded half away from zero.
 */
export function convertToHomeCents(
  originalMinor: number,
  rateMicros: number,
  fromDecimals: number,
  homeDecimals = 2,
): number {
  const sign = originalMinor < 0 ? -1n : 1n;
  let num = BigInt(Math.abs(originalMinor)) * BigInt(rateMicros);
  let den = BigInt(RATE_SCALE);
  const shift = homeDecimals - fromDecimals;
  if (shift > 0) num *= 10n ** BigInt(shift);
  else if (shift < 0) den *= 10n ** BigInt(-shift);
  const q = (num * 2n + den) / (den * 2n);
  return Number(sign * q);
}

/**
 * Converts what the user typed (parsed as two-decimal cents) to minor units
 * of the currency. Returns null when the currency has no decimals and the
 * amount has some (2400.50 yen).
 */
export function centsToMinor(cents: number, decimals: number): number | null {
  if (decimals === 2) return cents;
  if (decimals > 2) return cents * 10 ** (decimals - 2);
  const factor = 10 ** (2 - decimals);
  return cents % factor === 0 ? cents / factor : null;
}

/** The amount as paid, in the currency's own format ("€24.00", "¥2,400"). */
export function formatMinor(minor: number, code: string, locale: string): string {
  const decimals = currency(code)?.decimals ?? 2;
  const value = minor / 10 ** decimals;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${value.toFixed(decimals)} ${code}`;
  }
}

/** The response of GET /v2/rate/{base}/{quote}. */
const rateResponse = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  base: z.string().length(3),
  quote: z.string().length(3),
  rate: z.number().positive(),
});

export interface FetchedRate {
  rateMicros: number;
  /** The date the rate was published for; may be earlier than the date asked for. */
  rateDate: IsoDate;
}

export class RateUnavailableError extends Error {
  override name = 'RateUnavailableError';
}

export function parseRateResponse(json: unknown, base: string, quote: string): FetchedRate {
  const parsed = rateResponse.safeParse(json);
  if (!parsed.success)
    throw new RateUnavailableError('The exchange rate service sent an unexpected reply');
  const r = parsed.data;
  if (r.base.toUpperCase() !== base || r.quote.toUpperCase() !== quote) {
    throw new RateUnavailableError('The exchange rate service sent a rate for another currency');
  }
  return { rateMicros: rateToMicros(r.rate), rateDate: r.date };
}

export const FX_HOST = 'https://api.frankfurter.dev';

/** Only the two currency codes and the date are sent. Dates after today use the latest rate. */
export function rateUrl(base: string, quote: string, date: IsoDate, today: IsoDate): string {
  const path = `${FX_HOST}/v2/rate/${base.toLowerCase()}/${quote.toLowerCase()}`;
  return date < today ? `${path}?date=${date}` : path;
}

/**
 * Downloads one rate. `fetchImpl` is injected so tests never touch the
 * network. Times out after `timeoutMs` so an offline phone fails fast.
 */
export async function fetchRate(
  base: string,
  quote: string,
  date: IsoDate,
  today: IsoDate,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 8000,
): Promise<FetchedRate> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(rateUrl(base, quote, date, today), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new RateUnavailableError(`No rate for ${base} to ${quote} (${res.status})`);
    return parseRateResponse(await res.json(), base, quote);
  } catch (e) {
    if (e instanceof RateUnavailableError) throw e;
    throw new RateUnavailableError('Could not reach the exchange rate service');
  } finally {
    clearTimeout(timer);
  }
}
