// History v2's week strip, pure (CUL-1165 / HV-8; docs/nyx-history-v2-requirements.md
// §3.4, §5.7, §7 AC 25–27). One week of the Patterns month's day marks, without counts,
// paged by the week: this module decides what every cell says and how the pager is bounded,
// so every rule is a table test and the component only draws (C-41).
//
// ── ONE STATE PER CELL (WBC-1) ───────────────────────────────────────────────────
//
// `stripMarkOf` enumerates every state §3.4 names, in one precedence order:
//
//   ahead          a day after today, while the strip's bounds reach today: an outlined
//                  box, the date faint. Checked FIRST, since every window ends today and a
//                  later day is outside it by construction; "ahead" is the truer thing to
//                  say. Past a bound that ended earlier (a past month, an ended course) a
//                  later day is only outside, so the week does not trail future boxes
//                  after a course that is over.
//   before_record  before the pet's first record: no box, the date faint. Before
//                  "outside", so a young record says why its strip starts where it does.
//   outside        outside the window or a course's days: absent, never focusable.
//   noticed        under Noticed (H-9), the date only: nothing ever says a day had no look.
//   unlogged       nothing in the population: the grey square.
//   open           today with nothing logged yet: a white box in today's border.
//   rose           the rose fill: a vomiting EPISODE began this day under All types (the
//                  month's own mark, `DayFacts.vomitEpisode`), or the filtered symptom.
//   logged         a line: any log under All types, or the filtered kind.
//   quiet          a white box, no line: logged, but not the filtered kind.
//
// A day with only a look or a vet visit is `unlogged`: neither is in the population
// (R-1, HV-4's `unloggedDaysOf`), so the strip and the count line's coverage agree.
//
// ── THE ROSE PER FILTER (C-11) ───────────────────────────────────────────────────
//
// All types marks what the month marks, so the two surfaces never disagree about a day:
// a vomiting episode's FIRST day, re-logs inside the engine's gap folded in (CUL-1208 is
// the spec edit that names the field). A symptom filter marks its own kind, and All
// symptoms any symptom, through `isSymptomFilter`, which rides `SYMPTOM_TYPES`: a leaf
// that joins that set is rose here the same day. `stool_normal` is not in it, so the Stool
// filter draws a line, neutral, as its rows are (the membership walk states it).
//
// ── NEVER A FALSE ABSENCE ────────────────────────────────────────────────────────
//
// The rose follows the month's episode mark, but the WORDS follow the rows. A bout that
// starts at 23:10 and goes on at 00:40 roses only its first day, and the second day's
// label still says "1 vomit logged": the record holds that row, and "no vomit logged"
// would be a claim the query did not return (AC 38). The eye and the ear then differ in
// one direction only, the words saying MORE than the colour, never less.
//
// ── THE BROKEN LINE KEYS ON A RECORDED STATE (§3.4) ──────────────────────────────
//
// A meal left unfinished is the intake lens's own predicate, already counted into
// `DayFacts.mealsNotFinished` (a rating below Most on a qualifying meal: rated, never a
// treat, never free-fed); a dose not given in full is `notInFull` (Partial, Missed or
// Refused). A missing rating or chip is never counted, so CUL-1118's exception-only
// ratings cannot change what the line means. The line breaks under All types and Meal
// for meals, and under Medication and a course for doses, on a rose day too.
//
// ── THE WORDS ARE THE DAY HEADER'S ───────────────────────────────────────────────
//
// A strip tap lands on its day's card, whose header reads "2 vomits · 10 logged"; PMD-13
// asks the cell to carry that same count. So a label says the filtered count in the
// header's own nouns (`filterNoun`, `absenceText` from `lib/historyDays.ts`), then the
// day's total: "2 vomits logged, 10 logged in all". §3.4's table phrases the same facts
// in the same order ("vomiting logged 2 times"); its copy, like HV-4's, is a placeholder
// for HV-12's pass (CUL-1169), which edits the header and the strip in one place.
//
// Day keys are local 'YYYY-MM-DD' and compare correctly as text (C-40 is about instants).

import {
  absenceText,
  dayCountFor,
  filterNoun,
  formatCount,
  isDayKey,
  isSymptomFilter,
  shiftDay,
  type CourseDays,
  type DayFacts,
  type DayRange,
  type HistoryFilter,
} from './historyDays';
import { weekStartOf, type HistoryWindowKey } from './historyWindows';
import { TIMING_SYMPTOM_TYPE } from './patternsTiming';
import { recordDay, recordDayIndex, recordMonthUnderYear, recordRange, recordYearOf } from './recordDates';

// ── The cell ─────────────────────────────────────────────────────────────────────

export type StripState =
  | 'ahead'
  | 'before_record'
  | 'outside'
  | 'noticed'
  | 'unlogged'
  | 'open'
  | 'rose'
  | 'logged'
  | 'quiet';

/** The line under the date: none, whole, or broken (a meal left unfinished; a dose not
 *  given in full). Drawn in the glyph teal on a white box, in white on the rose. */
export type StripLine = 'none' | 'solid' | 'broken';

export interface StripMark {
  day: string;
  state: StripState;
  line: StripLine;
  today: boolean;
  /** What VoiceOver reads. Null for an absent cell, which is never focusable. */
  label: string | null;
  /** The cell is a door: a tap lands on its day's card, or on the gap line that holds it
   *  (§3.4). A day ahead, before the record or outside the bounds is a plain view (C-7). */
  tappable: boolean;
}

/** What the strip is bounded by and names, beside the filter. */
export interface StripWindow {
  /** The first and last day the strip marks: the window's bounds, cut to a course's days
   *  under a course filter (`stripBoundsOf`). */
  fromDay: string;
  toDay: string;
  /** The pet's first record (`FirstDays.record`): never a look, so a look answered before
   *  the first log does not move it. Null: nothing logged yet. */
  recordStart: string | null;
  /** The pet's name, for "before Nyx's record". */
  petName: string;
  /** A course filter's course name ("no Cetirizine HCl dose logged"), else null. */
  courseName: string | null;
}

// ── The spoken day ───────────────────────────────────────────────────────────────

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * A day as VoiceOver reads it: "Saturday, September 19", and "Friday, December 31, 2027"
 * outside the current year. English and locale-independent, like `lib/recordDates.ts`
 * (whose month name it reads, and whose year rule it applies: H-10, every date outside the
 * current year carries its year). The visible cell shows only the day of the month, so
 * this is the one place a cell's date is spoken in full.
 */
export function stripDayWord(day: string, today: string): string {
  const index = recordDayIndex(day);
  const date = spokenMonthDay(day, today);
  if (index === null || date === null) return day;
  const weekday = WEEKDAYS_LONG[(((index + 4) % 7) + 7) % 7]; // 1970-01-01 was a Thursday
  return `${weekday}, ${date}`;
}

/** "September 19", or "December 27, 2026" outside the current year; null for a malformed
 *  day. An unreadable `today` stamps the year: verbose at worst, never ambiguous. */
function spokenMonthDay(day: string, today: string): string | null {
  const month = recordDayIndex(day) === null ? null : recordMonthUnderYear(day.slice(0, 7));
  if (month === null) return null;
  const date = `${month} ${Number(day.slice(8, 10))}`;
  const year = recordYearOf(day);
  const current = recordYearOf(today);
  return current === null || current !== year ? `${date}, ${year}` : date;
}

/** The week label as VoiceOver reads it: "Week of September 13". The visible label is the
 *  range ("Sep 13 – 19"), whose abbreviations and dash a screen reader may read literally. */
export function stripWeekSpoken(week: string, today: string): string {
  return `Week of ${spokenMonthDay(week, today) ?? week}`;
}

function possessive(petName: string): string | null {
  const name = petName.trim();
  return name.length > 0 ? `${name}’s` : null;
}

// ── The mark ─────────────────────────────────────────────────────────────────────

/** "a meal left unfinished" / "2 meals left unfinished": the month's own words for the
 *  broken line, with the count the header gives. */
function unfinishedMealsText(n: number): string {
  return n === 1 ? 'a meal left unfinished' : `${formatCount(n)} meals left unfinished`;
}

/** "a dose not given in full" / "2 doses not given in full" (CUL-1193's words). */
function dosesNotInFullText(n: number): string {
  return n === 1 ? 'a dose not given in full' : `${formatCount(n)} doses not given in full`;
}

/** What breaks a filter's line on a day, and how the label says it. Zero: the line is
 *  whole. Only a recorded state counts (the header). */
function brokenOf(f: DayFacts, filter: HistoryFilter): { count: number; text: (n: number) => string } {
  switch (filter.kind) {
    case 'all':
      return { count: f.mealsNotFinished, text: unfinishedMealsText };
    case 'type':
      if (filter.type === 'meal') return { count: f.mealsNotFinished, text: unfinishedMealsText };
      if (filter.type === 'medication') {
        let n = 0;
        for (const d of Object.values(f.doses)) n += d.notInFull;
        return { count: n, text: dosesNotInFullText };
      }
      return { count: 0, text: dosesNotInFullText };
    case 'course':
      return { count: f.doses[filter.courseKey]?.notInFull ?? 0, text: dosesNotInFullText };
    default:
      return { count: 0, text: dosesNotInFullText };
  }
}

/** The filtered count in the header's nouns: "2 vomits logged", "1 Cetirizine HCl dose
 *  logged". A course names its drug when the caller knows it. */
function presentText(filter: HistoryFilter, k: number, courseName: string | null): string {
  if (filter.kind === 'course' && courseName) {
    return `${formatCount(k)} ${courseName} ${k === 1 ? 'dose' : 'doses'} logged`;
  }
  return `${formatCount(k)} ${filterNoun(filter, k)} logged`;
}

/**
 * One cell of the strip: its state, its line and its spoken label, for every row of §3.4's
 * table under every filter (AC 25). `f` is the day's facts, an empty day's when nothing was
 * logged (`dayFactsOn`); `window` bounds and names the strip; `today` is the owner's local
 * day, the same one every other count on the screen was derived for.
 *
 * The caller has already checked the facts answer the window on screen
 * (`factsAnswerWindow`): a cell drawn from a read that has not answered would say
 * "nothing logged" about days nobody has read yet (C-12).
 */
export function stripMarkOf(f: DayFacts, filter: HistoryFilter, window: StripWindow, today: string): StripMark {
  const day = f.day;
  const isToday = day === today;
  const word = stripDayWord(day, today);
  const head = isToday ? `${word}, today` : word;
  const mark = (state: StripState, line: StripLine, label: string | null, tappable: boolean): StripMark => ({
    day,
    state,
    line,
    today: isToday,
    label,
    tappable,
  });

  if (day > today) {
    return window.toDay >= today ? mark('ahead', 'none', `${word}, ahead`, false) : mark('outside', 'none', null, false);
  }

  // An empty record starts no earlier than today; a first record dated after today (a
  // clock set forward) cannot push today itself before the record.
  const floor = window.recordStart === null || window.recordStart > today ? today : window.recordStart;
  if (day < floor) {
    const whose = possessive(window.petName);
    return mark('before_record', 'none', whose ? `${word}, before ${whose} record` : `${word}, before the record began`, false);
  }

  if (day < window.fromDay || day > window.toDay) return mark('outside', 'none', null, false);

  // H-9: under Noticed the strip shows dates only, and nothing says a day had no look.
  if (filter.kind === 'noticed') return mark('noticed', 'none', head, true);

  if (f.total === 0) {
    return isToday
      ? mark('open', 'none', `${word}, today, nothing logged yet`, true)
      : mark('unlogged', 'none', `${word}, nothing logged`, true);
  }

  const total = `${formatCount(f.total)} logged in all`;
  const broken = brokenOf(f, filter);

  if (filter.kind === 'all') {
    const k = f.byType[TIMING_SYMPTOM_TYPE] ?? 0;
    const rose = f.vomitEpisode;
    // `vomitEpisode` without a vomit row on its day cannot be built (the episode is dated by
    // its own first row), and if it ever were the words still claim nothing they cannot see.
    const vomit = k > 0 ? presentText({ kind: 'type', type: TIMING_SYMPTOM_TYPE }, k, null) : rose ? 'a vomiting episode began' : 'no vomit logged';
    const parts = [head, vomit, total];
    if (broken.count > 0) parts.push(broken.text(broken.count));
    return mark(rose ? 'rose' : 'logged', broken.count > 0 ? 'broken' : 'solid', parts.join(', '), true);
  }

  const k = dayCountFor(f, filter) ?? 0;
  if (k === 0) {
    const none = absenceText(filter, window.courseName) ?? 'nothing of this kind logged';
    return mark('quiet', 'none', [head, none, total].join(', '), true);
  }
  const parts = [head, presentText(filter, k, window.courseName), total];
  if (broken.count > 0) parts.push(broken.text(broken.count));
  return mark(isSymptomFilter(filter) ? 'rose' : 'logged', broken.count > 0 ? 'broken' : 'solid', parts.join(', '), true);
}

// ── The pager (§3.4: bounded by the window, the record and a course) ─────────────

/**
 * The days the strip may mark: the window's bounds, cut to a course's own days under a
 * course filter. Null when nothing is left: a course with no day inside the window, or one
 * whose start cannot be placed. The window's bounds already start no earlier than the
 * pet's first record and end no later than today (HV-3's `resolveWindow`).
 */
export function stripBoundsOf(window: DayRange, course: CourseDays | null): DayRange | null {
  if (!isDayKey(window.fromDay) || !isDayKey(window.toDay) || window.fromDay > window.toDay) return null;
  if (course === null) return { fromDay: window.fromDay, toDay: window.toDay };
  if (course.fromDay === null) return null;
  const fromDay = course.fromDay > window.fromDay ? course.fromDay : window.fromDay;
  const toDay = course.toDay !== null && course.toDay < window.toDay ? course.toDay : window.toDay;
  return fromDay <= toDay ? { fromDay, toDay } : null;
}

/** The strip's pages, oldest first: the Sunday of every week from the first bounded day's
 *  to the last's (§3.4, Sunday first). */
export function stripWeeksOf(bounds: DayRange): string[] {
  const first = weekStartOf(bounds.fromDay);
  const last = weekStartOf(bounds.toDay);
  if (first === null || last === null || first > last) return [];
  const out: string[] = [];
  for (let week = first; week <= last; week = shiftDay(week, 7)) out.push(week);
  return out;
}

/**
 * The page that shows. The store's week when it is one of the pages; the nearest end when
 * it falls outside them (a filter change that narrowed the bounds keeps the owner's week in
 * the store and shows the closest one); the last page by default, the week that holds the
 * window's last day. -1 only for no pages.
 */
export function stripPageOf(weeks: readonly string[], stripWeek: string | null): number {
  if (weeks.length === 0) return -1;
  const last = weeks.length - 1;
  if (stripWeek === null) return last;
  const week = weekStartOf(stripWeek);
  if (week === null) return last;
  if (week <= weeks[0]) return 0;
  if (week >= weeks[last]) return last;
  const at = weeks.indexOf(week);
  return at === -1 ? last : at;
}

/** The week's range, the strip's only label (WBC-3: never the window's name beside it):
 *  "Sep 13 – 19", through the one formatter (H-10). */
export function stripWeekLabel(week: string, today: string): string {
  return recordRange(week, shiftDay(week, 6), today) ?? week;
}

/** The facts on hand answer the window on screen. A read in flight after a window change
 *  still holds the last window's facts; drawn under the new window, they would call days
 *  "nothing logged" that nobody has read (C-12), so the strip waits instead. */
export function factsAnswerWindow(factsRange: DayRange | null, window: DayRange): boolean {
  return factsRange !== null && factsRange.fromDay === window.fromDay && factsRange.toDay === window.toDay;
}

// ── The arrows (WBC-3) ───────────────────────────────────────────────────────────

export interface StripArrow {
  enabled: boolean;
  /** Enabled: it moves the strip, and a day is reached by tapping it. Disabled: why not. */
  label: string;
}

export interface StripArrows {
  back: StripArrow;
  forward: StripArrow;
}

export interface StripArrowContext {
  /** The strip's bounds (`stripBoundsOf`). */
  bounds: DayRange;
  /** The window on screen: its identity and its long name. */
  window: { key: HistoryWindowKey; bounds: DayRange; longName: string };
  /** A course filter's course, else null. */
  course: { name: string; days: CourseDays } | null;
  recordStart: string | null;
  petName: string;
  today: string;
}

const BACK = 'Earlier week';
const FORWARD = 'Later week';
const MOVES = 'in the strip. Tap a day to go to it.';

/** Why the strip starts where it does: the record, a course, or the window. */
function backReason(ctx: StripArrowContext): string {
  const lo = ctx.bounds.fromDay;
  const date = recordDay(lo, ctx.today) ?? lo;
  if (ctx.recordStart === null) return 'nothing is logged yet';
  if (lo === ctx.recordStart) {
    const whose = possessive(ctx.petName);
    return whose ? `${whose} record starts ${date}` : `the record starts ${date}`;
  }
  if (ctx.course && ctx.course.days.fromDay === lo && lo > ctx.window.bounds.fromDay) {
    return `${ctx.course.name} starts ${date}`;
  }
  switch (ctx.window.key.kind) {
    case 'trial':
      return `the trial started ${date}`;
    case 'visit':
      return `the last vet visit was ${date}`;
    case 'today':
      return 'the window is today';
    default:
      return `${ctx.window.longName} starts ${date}`;
  }
}

/** Why the strip ends where it does: today, a course's end, or a past month's end. */
function forwardReason(ctx: StripArrowContext): string {
  const hi = ctx.bounds.toDay;
  if (hi === ctx.today) return 'today is in this week';
  const date = recordDay(hi, ctx.today) ?? hi;
  if (ctx.course && ctx.course.days.toDay === hi && hi < ctx.window.bounds.toDay) {
    return `${ctx.course.name} ended ${date}`;
  }
  return `${ctx.window.longName} ends ${date}`;
}

/** The two arrows for the page that shows: each moves the strip a week, and each says
 *  why it cannot at an edge (§3.4: "Earlier week · Nyx's record starts May 14"). Spoken
 *  labels join with commas, never a middle dot a screen reader may pronounce. */
export function stripArrowsOf(weeks: readonly string[], page: number, ctx: StripArrowContext): StripArrows {
  const canBack = page > 0;
  const canForward = page >= 0 && page < weeks.length - 1;
  return {
    back: { enabled: canBack, label: canBack ? `${BACK} ${MOVES}` : `${BACK}, ${backReason(ctx)}` },
    forward: { enabled: canForward, label: canForward ? `${FORWARD} ${MOVES}` : `${FORWARD}, ${forwardReason(ctx)}` },
  };
}
