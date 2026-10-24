import type { IsoDate, IsoMonth } from '@/types/domain';

import { parseIsoDate, parseIsoMonth, periodRange } from './dates';

/** How the device writes numbers. Money input and display follow it. */
export interface NumberFormat {
  decimal: '.' | ',';
  /** Thousands separator: ',', '.', a space, an apostrophe, or none. */
  group: string;
}

export const DEFAULT_NUMBER_FORMAT: NumberFormat = { decimal: '.', group: ',' };

/**
 * Normalises what the OS reports. A group separator equal to the decimal
 * separator would make amounts ambiguous, so it is dropped in that case.
 */
export function numberFormatFrom(
  decimal: string | null | undefined,
  group: string | null | undefined,
): NumberFormat {
  const d = decimal === ',' ? ',' : '.';
  const g = group ?? (d === '.' ? ',' : '.');
  return { decimal: d, group: g === d ? '' : g.replace(/ | /g, ' ') };
}

function localDate(date: IsoDate): Date | null {
  const p = parseIsoDate(date);
  // Noon, so no time zone offset can move the calendar day.
  return p ? new Date(p.y, p.m - 1, p.d, 12) : null;
}

/** "Jun 5" (or the locale's equivalent); the year is added when it is not the current one. */
export function formatShortDate(date: IsoDate, locale: string, currentYear: number): string {
  const d = localDate(date);
  if (!d) return date;
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      ...(d.getFullYear() !== currentYear ? { year: 'numeric' } : {}),
    }).format(d);
  } catch {
    return date;
  }
}

/** "June 2025", or "15 Jun – 14 Jul 2025" when budget periods do not start on the 1st. */
export function formatPeriod(month: IsoMonth, startDay: number, locale: string): string {
  const p = parseIsoMonth(month);
  if (!p) return month;
  try {
    if (startDay === 1) {
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(p.y, p.m - 1, 1, 12),
      );
    }
    const { start, end } = periodRange(month, startDay);
    const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    const endDate = localDate(end)!;
    return `${fmt.format(localDate(start)!)} – ${fmt.format(endDate)} ${endDate.getFullYear()}`;
  } catch {
    return month;
  }
}

const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Saturday" for 6, in the locale's language. 0 is Sunday. */
export function weekdayName(day: number, locale: string): string {
  try {
    // 2023-01-01 was a Sunday.
    return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2023, 0, 1 + day, 12)),
    );
  } catch {
    return WEEKDAYS_EN[day] ?? '';
  }
}

/** "$" for CAD, "€" for EUR: the short symbol used to display home-currency amounts. */
export function currencySymbolFor(code: string, locale = 'en-US'): string {
  try {
    const part = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? code;
  } catch {
    return code;
  }
}

/** True when the locale writes the day before the month in numeric dates (14/06/2025). */
export function isDayFirst(locale: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).formatToParts(new Date(2025, 10, 22));
    return parts.findIndex((p) => p.type === 'day') < parts.findIndex((p) => p.type === 'month');
  } catch {
    return false;
  }
}
