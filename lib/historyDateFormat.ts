// The one formatter, shaped for History v2's pure numbers (HV-9 / CUL-1166; spec §3.9,
// H-10). `lib/historyDays.ts` takes its dates through an injected `HistoryDateFormat` so
// its rules test without a formatter; this is the one place that injection is filled,
// from `lib/recordDates.ts`, so no date on the screen is formatted twice (a count line,
// a gap line and a sheet sub-row all read through the same three calls).
//
// A key `recordDates` cannot read comes back as itself, never as a guessed date: the
// callers hand over day keys the record produced, so this only fires on a caller's bug,
// and the raw key is ugly but true where `Date`'s roll-over would print a day nobody
// logged.

import type { HistoryDateFormat } from './historyDays';
import { RECORD_RANGE_DASH, recordDay, recordRange, recordWeekday } from './recordDates';

/** The formatter for one `today` (the owner's local day key): the year rule reads it. */
export function historyDateFormatFor(today: string): HistoryDateFormat {
  return {
    day: (key) => recordDay(key, today) ?? key,
    weekday: (key) => recordWeekday(key, today) ?? key,
    range: (fromKey, toKey) => recordRange(fromKey, toKey, today) ?? `${fromKey}${RECORD_RANGE_DASH}${toKey}`,
  };
}
