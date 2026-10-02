// The History timeline's date-scope logic, extracted pure so it is unit-testable without
// mounting the whole screen (B-308). Two scopes feed getTimeline's [after, before) bounds:
//   • a PRESET (today / last 7 / last 30 days) — a lower "after" cutoff, no upper bound;
//   • a single DAY (a doorway's ?day= or ?date=YYYY-MM-DD) — a BOUNDED start-AND-end day,
//     which a lone "after" cutoff can't express.
// The day filter takes precedence; the two are mutually exclusive in the UI.
//
// ── A DAY LINK IS READ BY SENDER, NEVER BY FLAG (H-7, CUL-1073) ─────────────────
// Two senders put a day in `?date=` and mean different clocks: the widget sends the
// owner's LOCAL day, the flag-off Patterns calendar a UTC day (its own sheet counts a
// UTC day). One parameter cannot carry both meanings, and an existing parameter never
// changes meaning in place, so the reading forks on who sent it:
//   ?day=YYYY-MM-DD ................ a local day — the Design v2 month's door, which
//                                     counts the same local day (`readDayRows`)
//   ?date=YYYY-MM-DD&src=widget .... a local day — the widget: frozen, the one sender
//                                     outside the app (H-7), so History reads what it sends
//   ?date=YYYY-MM-DD ............... a UTC day — the flag-off calendar, until it retires
//                                     at D2-8
// Before this, every `?date=` was a UTC day, so the widget's day view was off by the
// owner's offset: in Honolulu at 3 PM it showed a day that ended at 2 PM.
//
// ── BOUNDS ARE PARSED, NEVER COMPARED AS TEXT (C-40) ────────────────────────────
// A local write spells an instant `…Z`; a hydrated row spells it `…+00:00`, and the two
// do not order as text at the exact-equality second — a synced row at exactly local
// midnight falls out of its own day and into the day before. So the range below is
// exact and parsed, and the SQL gets `sqlPrefilter`'s wider copy: a coarse prefilter
// whose rows `inRange` then places (the `lib/monthReads.ts` and widget-snapshot shape).

import { dayKeyToLocalDate, formatUtcDayShort, toLocalDayKey } from './utils';

// The date-scope presets offered by DateScopeControl. Owned here (the domain type) and
// re-exported by the control, so the pure logic doesn't depend on a component.
export type DatePreset = 'today' | '7d' | '30d' | null;

/** Which clock a day link's key was counted on. */
export type DayBasis = 'local' | 'utc';

/** A single-day scope: the day, and the clock its sender counted it on. */
export interface DayScope {
  key: string;
  basis: DayBasis;
}

/** A scope's [after, before) bounds as ISO instants — exact, never widened. */
export interface ScopeRange {
  after: string | null;
  before: string | null;
}

/** The widget's `src` marker (`widgets/CulpritWidget.tsx`, `petLink`). Spelled there, not
 *  imported: the widget layout runs as a bare string with no module graph. */
export const WIDGET_LINK_SRC = 'widget';

/** Coerce a `?window=` deep-link value onto a DatePreset (B-378). This is History's OWN
 *  window vocabulary — a caller (Ask's provenance tap-through) maps its own window enum onto
 *  these three strings, and anything unrecognised (or absent) falls to `null` = all time, so a
 *  bad link degrades to the safe superset rather than throwing or hiding events. */
export function coerceDatePreset(value: string | undefined | null): DatePreset {
  return value === 'today' || value === '7d' || value === '30d' ? value : null;
}

// A single-day deep-link key ('YYYY-MM-DD'), distinct from the 'today' preset. Matched
// loosely; `dayScopeBounds` does the real parse, and refuses a key that is not a day.
export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The preset's lower "after" cutoff, or null for "All time". `today` is the start of the
 *  LOCAL calendar day (matching the Home "Today" zone's boundary); the rolling presets are
 *  N×24h before now. `now` is injectable for deterministic tests. */
export function dateAfterForPreset(preset: DatePreset, now: Date = new Date()): string | null {
  if (!preset) return null;
  if (preset === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = preset === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** One day's exact [after, before) on the clock its sender meant, or null for a key that is
 *  not a real calendar day. The key must round-trip: `Date` rolls an impossible date over
 *  (Feb 30 → Mar 2) rather than refusing it, and a link must never land on a day it did not
 *  name. The local day runs from local midnight to the next one, built from the key's
 *  components, so a 23- or 25-hour day is still exactly one day (C-29). */
export function dayScopeBounds(scope: DayScope): { after: string; before: string } | null {
  if (!DAY_KEY_RE.test(scope.key)) return null;
  if (scope.basis === 'local') {
    const start = dayKeyToLocalDate(scope.key);
    if (!start || toLocalDayKey(start) !== scope.key) return null;
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return { after: start.toISOString(), before: end.toISOString() };
  }
  const startMs = Date.parse(`${scope.key}T00:00:00.000Z`);
  if (!Number.isFinite(startMs)) return null;
  const after = new Date(startMs).toISOString();
  if (after.slice(0, 10) !== scope.key) return null;
  return { after, before: new Date(startMs + 86_400_000).toISOString() };
}

/** The single day a doorway's params ask for, read BY SENDER (the table above), or null
 *  when they ask for none or name a key that is not a day. `?day=` wins when both are
 *  present: no sender sends both, and the newer parameter is the one with one meaning.
 *  `?date=today` is the `today` PRESET, not a day — the caller reads that. */
export function dayScopeFromParams(params: {
  date?: string;
  day?: string;
  src?: string;
}): DayScope | null {
  const scope: DayScope | null = params.day
    ? { key: params.day, basis: 'local' }
    : params.date
      ? { key: params.date, basis: params.src === WIDGET_LINK_SRC ? 'local' : 'utc' }
      : null;
  return scope && dayScopeBounds(scope) ? scope : null;
}

/** The route into History that lands on one LOCAL day — the Design v2 month's door
 *  (CUL-1073). `ts` is the doorway nonce: the History tab stays mounted, so a tap is a
 *  new `ts`, never a remount. */
export function historyDayHref(
  dayKey: string,
  nowMs: number = Date.now(),
): { pathname: '/(tabs)/history'; params: { day: string; ts: string } } {
  return { pathname: '/(tabs)/history', params: { day: dayKey, ts: String(nowMs) } };
}

/** The short date History's day pill prints ("Sep 16"), and the one a door into that day
 *  names, so the two agree by construction. It formats the KEY, whichever clock counted it:
 *  `formatUtcDayShort` reads the key at UTC midnight and prints in UTC, which is exactly the
 *  key's own date on any device. */
export function historyDayLabel(dayKey: string): string {
  return formatUtcDayShort(dayKey);
}

/** The effective [after, before) bounds, exact. A single-day filter takes precedence and
 *  expresses ONE day on its sender's clock (bounded start and end); otherwise the preset
 *  gives an "after" cutoff with no upper bound. A key that is not a day falls back to the
 *  preset — never a broken bound. */
export function effectiveRange(
  preset: DatePreset,
  day: DayScope | null,
  now: Date = new Date(),
): ScopeRange {
  if (day) {
    const bounds = dayScopeBounds(day);
    if (bounds) return bounds;
  }
  return { after: dateAfterForPreset(preset, now), before: null };
}

/** How far the SQL prefilter reaches past each bound. The spelling hazard lives inside one
 *  second, so a minute covers it with room to spare. Not the month's day of slack: History
 *  pages this read by OFFSET, and every slack row is fetched and then dropped, so a day's
 *  worth could fill a page with a neighbouring day's rows and leave the list blank. */
export const PREFILTER_SLACK_MS = 60_000;

/** The range widened by `PREFILTER_SLACK_MS` each side, for the SQL text compare ONLY. The
 *  rows it returns are placed by `inRange`; this range is never shown or counted. */
export function sqlPrefilter(range: ScopeRange): ScopeRange {
  return {
    after: range.after ? new Date(Date.parse(range.after) - PREFILTER_SLACK_MS).toISOString() : null,
    before: range.before ? new Date(Date.parse(range.before) + PREFILTER_SLACK_MS).toISOString() : null,
  };
}

/** Whether an instant falls in [after, before), both sides parsed (C-40). An instant that
 *  does not parse cannot be placed in a bounded range, so it is out of one; the unbounded
 *  range (All time) holds everything. */
export function inRange(occurredAt: string, range: ScopeRange): boolean {
  if (!range.after && !range.before) return true;
  const t = Date.parse(occurredAt);
  if (!Number.isFinite(t)) return false;
  if (range.after && t < Date.parse(range.after)) return false;
  if (range.before && t >= Date.parse(range.before)) return false;
  return true;
}
