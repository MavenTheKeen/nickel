import type { Cadence, IsoDate } from '@/types/domain';

import { addDays, addMonthsClamped, compareDates, parseIsoDate } from './dates';

/** Generating more than this in one pass means the app was closed for years; cap the work. */
export const MAX_CATCH_UP = 400;

/**
 * Date of the `index`-th occurrence (0 = anchor). Every occurrence is
 * computed from the anchor, not from the previous occurrence, so a bill on
 * the 31st falls on Feb 28 and then returns to Mar 31 instead of drifting
 * to the 28th for good. A yearly bill on Feb 29 falls on Feb 28 in common
 * years.
 */
export function occurrenceAt(anchor: IsoDate, cadence: Cadence, index: number): IsoDate {
  if (!Number.isInteger(index) || index < 0) throw new Error(`Invalid occurrence index ${index}`);
  const ymd = parseIsoDate(anchor);
  if (!ymd) throw new Error(`Invalid anchor date ${anchor}`);
  switch (cadence) {
    case 'weekly':
      return addDays(anchor, 7 * index);
    case 'monthly':
      return addMonthsClamped(anchor, index, ymd.d);
    case 'yearly':
      return addMonthsClamped(anchor, 12 * index, ymd.d);
  }
}

export interface Occurrence {
  index: number;
  date: IsoDate;
}

/** Occurrences from `fromIndex` whose date is on or before `today`. */
export function dueOccurrences(
  anchor: IsoDate,
  cadence: Cadence,
  fromIndex: number,
  today: IsoDate,
  limit = MAX_CATCH_UP,
): Occurrence[] {
  const due: Occurrence[] = [];
  for (let i = fromIndex; due.length < limit; i++) {
    const date = occurrenceAt(anchor, cadence, i);
    if (compareDates(date, today) > 0) break;
    due.push({ index: i, date });
  }
  return due;
}

/** Occurrences from `fromIndex` falling within [start, end], inclusive. */
export function occurrencesBetween(
  anchor: IsoDate,
  cadence: Cadence,
  fromIndex: number,
  start: IsoDate,
  end: IsoDate,
  limit = 60,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (let i = fromIndex; out.length < limit; i++) {
    const date = occurrenceAt(anchor, cadence, i);
    if (compareDates(date, end) > 0) break;
    if (compareDates(date, start) >= 0) out.push({ index: i, date });
  }
  return out;
}

export function cadenceLabel(cadence: Cadence): string {
  return { weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' }[cadence];
}
