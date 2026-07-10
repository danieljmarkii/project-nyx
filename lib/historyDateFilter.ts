// The History timeline's date-scope logic, extracted pure so it is unit-testable without
// mounting the whole screen (B-308). Two scopes feed getTimeline's [after, before) bounds:
//   • a PRESET (today / last 7 / last 30 days) — a lower "after" cutoff, no upper bound;
//   • a single DAY (the Calendar v3 drill-in deep-link, ?date=YYYY-MM-DD) — a BOUNDED
//     start-AND-end UTC day, which a lone "after" cutoff can't express.
// The day filter takes precedence; the two are mutually exclusive in the UI.

import { utcDayBounds } from './utils';

// The date-scope presets offered by DateScopeControl. Owned here (the domain type) and
// re-exported by the control, so the pure logic doesn't depend on a component.
export type DatePreset = 'today' | '7d' | '30d' | null;

// A single-day deep-link key ('YYYY-MM-DD') from the Calendar drill-in — an arbitrary UTC
// calendar day, distinct from the 'today' preset. Matched loosely; utcDayBounds does the
// real parse.
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

/** The effective [after, before) query bounds. A specific-day filter (B-308) takes
 *  precedence and expresses ONE UTC calendar day (bounded start/end); otherwise the preset
 *  gives an "after" cutoff with no upper bound. UTC day bounds so the drill-in count, the
 *  History list, and the calendar cell all agree on which events belong to the day. */
export function effectiveRange(
  preset: DatePreset,
  day: string | null,
  now: Date = new Date(),
): { after: string | null; before: string | null } {
  if (day) {
    const bounds = utcDayBounds(day);
    if (bounds) return { after: bounds.after, before: bounds.before };
  }
  return { after: dateAfterForPreset(preset, now), before: null };
}
