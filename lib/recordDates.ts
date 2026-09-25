// The one date formatter for the record (H-10, CUL-1160;
// docs/nyx-history-v2-requirements.md §3.9).
//
// THE RULE. A date in the current year is bare (*Sep 16*); any other date carries its
// year (*Dec 31, 2026*); a range states a year once (*Aug 30 – Sep 5, 2025*), and only on
// the side that needs it (*Dec 27, 2026 – Jan 2*, read on Jan 5, 2027). So every bare date
// the owner reads is in the current year, and "Since Jul 2" can never mean fourteen
// months when it reads like eleven weeks (CUL-1126's counterexample).
//
// ── DAY KEYS IN, NEVER INSTANTS ────────────────────────────────────────────────
//
// Every input is a LOCAL day key ('YYYY-MM-DD'), and "the current year" is read off the
// caller's `today` key. Nothing here resolves a zone, so no zone can move a date: the
// caller turns an instant into its local day once (`toLocalDayKey`), and an Edge Function
// can pass the owner's day from its own zone and get the same string. The calendar parts
// are read through `Date.UTC`, which has no zone and no DST, so '2026-09-21' is a Monday
// on every device.
//
// ── ENGLISH, LOCALE-INDEPENDENT ────────────────────────────────────────────────
//
// Fixed three-letter months, like the mock and the trial surfaces' `MONTHS`: the strings
// are pinned by table tests, the owner reads them beside copy that is English anyway,
// and `toLocaleDateString`'s output moves with the ICU build under the test runner.
//
// ── A MALFORMED KEY RETURNS NULL ───────────────────────────────────────────────
//
// Never a guessed date: `Date` rolls '2026-02-30' over to Mar 2, which would print a day
// the record never named, so the caller omits the clause (the `formatCalendarDate`
// contract). An unreadable `today` is a different case, because the date itself is fine
// and only the year rule is in doubt: that stamps the year, since a stamped year is at
// worst verbose and a missing one is the ambiguity this module exists to remove.
//
// No imports on purpose: the module stays usable from the Edge Functions unchanged.

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const MS_PER_DAY = 86_400_000;

/** The separator every range uses, the mock's: a spaced en dash. */
export const RECORD_RANGE_DASH = ' – ';

interface DayParts {
  year: number;
  /** 0–11 */
  month: number;
  day: number;
  /** 0 = Sunday */
  weekday: number;
  /** Whole days since 1970-01-01, for ordering two days without comparing text. */
  index: number;
}

/**
 * A day key's calendar parts, or null when the key is not a real calendar day.
 *
 * The regex checks the SHAPE and the round trip checks the DAY: `Date.UTC` silently rolls
 * '2026-13-45' and '2026-02-30' forward, and maps years 0–99 onto the 1900s, so anything
 * that does not come back intact is refused.
 */
function partsOf(dayKey: string): DayParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const ms = Date.UTC(year, month, day);
  const at = new Date(ms);
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month || at.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day, weekday: at.getUTCDay(), index: Math.round(ms / MS_PER_DAY) };
}

/** Does this year need stamping? True outside the current year, and when the current
 *  year cannot be read (the header: fail toward the unambiguous string). */
function stampsYear(year: number, today: string): boolean {
  const current = partsOf(today);
  return current === null || current.year !== year;
}

function monthDay(p: DayParts): string {
  return `${MONTHS_SHORT[p.month]} ${p.day}`;
}

function dayText(p: DayParts, today: string): string {
  return stampsYear(p.year, today) ? `${monthDay(p)}, ${p.year}` : monthDay(p);
}

/**
 * One day: *Sep 16* in the current year, *Dec 31, 2026* outside it.
 *
 * For a gap line's lone date, the strip's label, a window's anchor, a course's start:
 * every place a single day is named.
 */
export function recordDay(day: string, today: string): string | null {
  const p = partsOf(day);
  return p ? dayText(p, today) : null;
}

/** A day header: *Mon, Sep 21*, or *Thu, Dec 31, 2026* outside the current year. */
export function recordWeekday(day: string, today: string): string | null {
  const p = partsOf(day);
  return p ? `${WEEKDAYS_SHORT[p.weekday]}, ${dayText(p, today)}` : null;
}

/**
 * An inclusive range of days, the year stated once.
 *
 *   Sep 13 – 16            one month, the current year
 *   Aug 30 – Sep 5         two months, the current year
 *   Sep 13 – 16, 2025      one other year, stated once at the end
 *   Dec 27, 2026 – Jan 2   across a new year, read in 2027: only the side that needs it
 *   Sep 16                 a one-day range is a day
 *
 * Null for a malformed key or an inverted range: a range that ends before it starts is a
 * caller's bug, and printing it would state a window the record never had.
 */
export function recordRange(fromDay: string, toDay: string, today: string): string | null {
  const a = partsOf(fromDay);
  const b = partsOf(toDay);
  if (!a || !b || a.index > b.index) return null;
  if (a.index === b.index) return dayText(a, today);

  if (a.year === b.year) {
    const tail = stampsYear(a.year, today) ? `, ${a.year}` : '';
    const end = a.month === b.month ? String(b.day) : monthDay(b);
    return `${monthDay(a)}${RECORD_RANGE_DASH}${end}${tail}`;
  }
  // Two different years: each side carries its own year unless it is the current one,
  // so at most one side is ever bare, and a bare side is always this year.
  return `${dayText(a, today)}${RECORD_RANGE_DASH}${dayText(b, today)}`;
}

/** A month key ('YYYY-MM') as a real month, or null. */
function monthPartsOf(month: string): DayParts | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  return m ? partsOf(`${m[1]}-${m[2]}-01`) : null;
}

/**
 * A month where it stands alone (a window's pill, the count line): *September* in the
 * current year, *September 2025* outside it. Takes a month key, 'YYYY-MM'.
 */
export function recordMonth(month: string, today: string): string | null {
  const p = monthPartsOf(month);
  if (!p) return null;
  const name = MONTHS_LONG[p.month];
  return stampsYear(p.year, today) ? `${name} ${p.year}` : name;
}

/**
 * A month under its year's subhead (the window sheet, where *2025* already heads the
 * group): always bare. The ONE unstamped form, and only for a place where the year is
 * printed directly above it.
 */
export function recordMonthUnderYear(month: string): string | null {
  const p = monthPartsOf(month);
  return p ? MONTHS_LONG[p.month] : null;
}

/** The year a day key falls in, or null for a malformed key. */
export function recordYearOf(day: string): number | null {
  return partsOf(day)?.year ?? null;
}
