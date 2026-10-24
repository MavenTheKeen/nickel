import type { IsoDate, IsoMonth } from '@/types/domain';

// All dates are calendar dates in the user's local time, kept as YYYY-MM-DD
// strings. Day arithmetic runs in UTC, which has no daylight saving, so a time
// zone or DST change on the device cannot shift a stored date by one.

export interface Ymd {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad4 = (n: number) => String(n).padStart(4, '0');

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function isValidYmd({ y, m, d }: Ymd): boolean {
  return (
    Number.isInteger(y) &&
    Number.isInteger(m) &&
    Number.isInteger(d) &&
    y >= 1 &&
    y <= 9999 &&
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= daysInMonth(y, m)
  );
}

export function parseIsoDate(s: string): Ymd | null {
  const match = ISO_DATE.exec(s);
  if (!match) return null;
  const ymd = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  return isValidYmd(ymd) ? ymd : null;
}

function mustParse(s: IsoDate): Ymd {
  const ymd = parseIsoDate(s);
  if (!ymd) throw new Error(`Invalid date: ${s}`);
  return ymd;
}

export function formatYmd({ y, m, d }: Ymd): IsoDate {
  return `${pad4(y)}-${pad2(m)}-${pad2(d)}`;
}

/** Today's local calendar date. */
export function toIsoDate(date: Date): IsoDate {
  return formatYmd({ y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() });
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function parseIsoMonth(s: string): { y: number; m: number } | null {
  const match = ISO_MONTH.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  return y >= 1 && m >= 1 && m <= 12 ? { y, m } : null;
}

export function addMonthsToMonth(month: IsoMonth, n: number): IsoMonth {
  const parsed = parseIsoMonth(month);
  if (!parsed) throw new Error(`Invalid month: ${month}`);
  const total = parsed.y * 12 + (parsed.m - 1) + n;
  return `${pad4(Math.floor(total / 12))}-${pad2((total % 12) + 1)}`;
}

/** First and last day of a month, inclusive. */
export function monthRange(month: IsoMonth): { start: IsoDate; end: IsoDate } {
  const parsed = parseIsoMonth(month);
  if (!parsed) throw new Error(`Invalid month: ${month}`);
  return {
    start: `${month}-01`,
    end: `${month}-${pad2(daysInMonth(parsed.y, parsed.m))}`,
  };
}

/** The `count` months ending with `month`, oldest first. */
export function lastNMonths(month: IsoMonth, count: number): IsoMonth[] {
  return Array.from({ length: count }, (_, i) => addMonthsToMonth(month, i - count + 1));
}

const MS_PER_DAY = 86_400_000;

// UTC has no daylight saving, so a UTC day count is an exact calendar-day count.
function toDayNumber({ y, m, d }: Ymd): number {
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);
  return Math.round(t.getTime() / MS_PER_DAY);
}

function fromDayNumber(n: number): Ymd {
  const t = new Date(n * MS_PER_DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function addDays(date: IsoDate, n: number): IsoDate {
  return formatYmd(fromDayNumber(toDayNumber(mustParse(date)) + n));
}

/** b - a in days. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return toDayNumber(mustParse(b)) - toDayNumber(mustParse(a));
}

/** 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(date: IsoDate): number {
  return new Date(toDayNumber(mustParse(date)) * MS_PER_DAY).getUTCDay();
}

/**
 * Adds months keeping the original day where possible and clamping to the
 * last day of shorter months (Jan 31 + 1 month = Feb 28 or 29).
 */
export function addMonthsClamped(date: IsoDate, n: number, anchorDay?: number): IsoDate {
  const { y, m, d } = mustParse(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return formatYmd({ y: ny, m: nm, d: day });
}

/** Days from `today` to the end of its month, counting today. */
export function daysLeftInMonth(today: IsoDate): number {
  const { y, m, d } = mustParse(today);
  return daysInMonth(y, m) - d + 1;
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Budget periods. With the default start day of 1 a period is a calendar
// month. With start day N (2-28) the period named "2025-06" runs from
// 2025-06-N to the day before 2025-07-N; a payday on the 15th means budgets
// reset on the 15th. Days above 28 are not offered because February would
// need special cases.

export const MAX_PERIOD_START_DAY = 28;

export function clampStartDay(day: number): number {
  return Math.min(MAX_PERIOD_START_DAY, Math.max(1, Math.trunc(day) || 1));
}

/** First and last day of the period named `month`, inclusive. */
export function periodRange(month: IsoMonth, startDay = 1): { start: IsoDate; end: IsoDate } {
  const day = clampStartDay(startDay);
  if (day === 1) return monthRange(month);
  const dd = String(day).padStart(2, '0');
  return {
    start: `${month}-${dd}`,
    end: addDays(`${addMonthsToMonth(month, 1)}-${dd}`, -1),
  };
}

/**
 * The period a date belongs to. Shifting the date back by (startDay - 1)
 * days lands it in the month that names its period; the SQL in reports.ts
 * uses the same rule through strftime.
 */
export function periodOf(date: IsoDate, startDay = 1): IsoMonth {
  return monthOf(addDays(date, -(clampStartDay(startDay) - 1)));
}

/** Days from `today` to the end of its period, counting today. */
export function daysLeftInPeriod(today: IsoDate, startDay = 1): number {
  return daysBetween(today, periodRange(periodOf(today, startDay), startDay).end) + 1;
}

export function periodLength(month: IsoMonth, startDay = 1): number {
  const { start, end } = periodRange(month, startDay);
  return daysBetween(start, end) + 1;
}

/** SQLite strftime modifier that applies the periodOf shift. */
export function periodShiftModifier(startDay = 1): string {
  return `-${clampStartDay(startDay) - 1} days`;
}
