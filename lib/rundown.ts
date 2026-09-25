// The vet-visit rundown (Ask / B-228 PR A6, spec §3.3 + mock §7).
//
// A one-tap, DETERMINISTIC assembly of the answers a clinician asks for at the
// start of a visit — symptom counts with denominators, a timing recount, the
// appetite picture, the weight range, current meds, and what's changed since the
// last logged visit. There is NO model call: it is the same engine that writes
// the vet report, so it works CAPPED and OFFLINE, and every tile taps through to
// its source (the screen maps the semantic tap target to a route).
//
// The register is the vet report's: counts with denominators, NO adjectives, NO
// verdicts. Two invariants govern the copy here:
//   • n=1 never reassures (G2) — a 0/low count is "none logged", never "she's
//     well". Absence of a symptom is never framed as wellness.
//   • Intake ≠ preference (G7) — appetite is a raw finished-rate over its
//     denominator, never softened to "picky"/"usual".
//
// G5 (one source of truth): the headline symptom counts and the appetite rate
// reuse the SAME canonical aggregates the Patterns dashboard and the vet report
// use (`getSymptomCounts` / `getIntakeRate` / `computeWeightTrend`), so the
// rundown can never disagree with the Timeline about a health fact. The pieces
// with no client aggregate today — the time-of-day recount, the logged-days
// denominator, the weight min/max, the active-meds + last-dose read, and the
// since-visit deltas — are computed here as pure functions (unit-tested) over
// the identical `events`/`meals`/`medications` reads, never as a re-derivation of
// a number that already has a canonical home.

import { getDb } from './db';
import {
  getSymptomCounts,
  getIntakeRate,
  calendarWindow,
  WINDOW_DAYS,
  isNotEnoughData,
  type IntakeRate,
} from './analytics';
import { getWeightHistory, computeWeightTrend, type WeightReading } from './weight';
import { symptomLabel } from './metricDetail';
import { toLocalDayKey, dayKeyToLocalDate, localDayIndexOf } from './utils';
import { recordDay, recordDayIndex, recordRange } from './recordDates';
import { readLatestVisitBefore, type SinceVisitDay } from './visitWindow';
import { ANCHORED_WINDOW_NAMES } from './historyWindows';
import {
  deriveMedicationCourses,
  type MedicationCourse,
  type MedicationHistoryRegimen,
} from './medicationHistory';
import { drugDisplayName, type AttributableDose } from './medications';

// ── Tap targets ─────────────────────────────────────────────────────────────
// Semantic (route-agnostic) so the pure layer stays testable; the screen maps
// each to an expo-router destination. Every tile that has a source carries one.
export type RundownTap =
  | { kind: 'symptom'; symptomType: string } // → /insights/[metric]
  | { kind: 'patterns' } //                     → /insights
  | { kind: 'weight' } //                       → /(tabs)/profile?focus=weight (CUL-753)
  | { kind: 'medication'; medicationId: string } // → /medication/[id]
  | { kind: 'meds' } //                         → /(tabs)/profile?focus=medications (no single med)
  | { kind: 'foods' } //                        → /(tabs)/foods
  | { kind: 'history' } //                      → /(tabs)/history
  | { kind: 'log-visit' }; //                   → /vet-visits?add=happened (none logged yet)

export type RundownTileKey =
  | 'symptoms'
  | 'timing'
  | 'appetite'
  | 'weight'
  | 'meds'
  | 'meds_past'
  | 'since_visit';

export interface RundownTile {
  key: RundownTileKey;
  label: string;
  value: string;
  /** Secondary line — the denominator / window / caveat. */
  detail?: string;
  tap: RundownTap | null;
  /** A designed empty state (Principle 5), not a data row — the screen styles it quieter. */
  empty?: boolean;
}

export interface Rundown {
  petName: string;
  generatedAtMs: number;
  tiles: RundownTile[];
  // The "Medications — past 12 months" block (B-140 PR 4). Kept SEPARATE from
  // `tiles` — not appended to it — so the screen renders it as its own labelled
  // section (a card = a section) and the plain-text export delineates it. The
  // register differs from `tiles` too: each row is a past course (drug → speakable
  // dates → an end register), never a symptom/appetite datum. Empty when the pet
  // has no ended/past courses (no designed empty state here — an absent history is
  // silence, not a finding; the current-meds tile already answers "on anything now?").
  pastMedications: RundownTile[];
  /**
   * Inputs this build ALREADY read, exposed so a second consumer quotes the same
   * derivation instead of running its own (CUL-903 VV-5 — Get ready's "Worth
   * raising" sits above this block on the same screen).
   *
   * Nothing renders these, so the rundown's tree is unchanged and AC 4's
   * byte-identical comparison is untouched. They are here rather than re-read
   * because the alternative is two derivations over one population, which is the
   * §5.3 lesson: a second `deriveMedicationCourses` pass is the same predicate run
   * twice today and two predicates the first time either caller is edited.
   */
  facts: RundownFacts;
}

export interface RundownFacts {
  /** The ONE shared course derivation over the whole regimen + dose history. */
  courses: MedicationCourse[];
  /** The drug-name cache a dose-derived course is named from. */
  medItemNames: Map<string, MedItemName>;
  /**
   * The first day of "since the last vet visit" ('YYYY-MM-DD'): the latest visit STRICTLY
   * BEFORE the rundown's day, through the one shared bound (`lib/visitWindow.ts`, H-11), so
   * the rundown, History and the report name one visit. Null when there is none. A visit
   * saved today, or dated ahead, anchors nothing until the day after it (CUL-1127).
   * Typed as a plain day key so a consumer's fixture can state one; the brand stays on
   * History's window input, where it guards who may mint a start.
   */
  lastVisitAt: string | null;
  /** Every weigh-in the weight tile was computed over, oldest first. */
  weighIns: WeightReading[];
}

// The window every count is scoped to — stated on-screen and in the export so a
// clinician reading a saved copy knows "30 days ending WHEN" (P6 record hygiene).
export const RUNDOWN_WINDOW_DAYS = 30;

// Weigh-in horizon for the weight-range tile. Deliberately wider than the app's
// 12-reading chart window (insights / WeightTrendCard): the range a vet asks for
// is longer-horizon than the 30-day symptom window — a diet trial or a chronic
// case is weighed monthly, so 12 readings could miss the relevant trajectory.
// A high row cap ≈ "all recent weigh-ins" without an arbitrary time bound.
export const RUNDOWN_WEIGHIN_LIMIT = 60;

// The past-medications window (B-140 PR 4, D3 RATIFIED 2026-08-04 — PM confirmed the
// provisional: 12 months shown by name, earlier courses folded behind a count).
// Courses whose most-recent activity is within this many months are listed by name;
// anything older is folded behind a count ("3 earlier courses, over a year ago") so the
// list stays speakable for a chronic-med cat while the lifetime question stays answerable
// (the profile "Past medications" section — PR 2 — and the report table — PR 5 — carry the
// full named lifetime). The window is a single source of truth: the section label, the
// cutoff, and the plain-text export all read this constant, so a PM change moves them together.
export const RUNDOWN_MED_HISTORY_MONTHS = 12;

/** The past-meds section heading — one source, so a window change (D3) moves label + cutoff together. */
export function pastMedsSectionLabel(): string {
  return `Medications — past ${RUNDOWN_MED_HISTORY_MONTHS} months`;
}

/** "As of Jul 18, 2026 · last 30 days" — the artifact's own date stamp. */
export function rundownDateLine(generatedAtMs: number): string {
  const when = new Date(generatedAtMs).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `As of ${when} · last ${RUNDOWN_WINDOW_DAYS} days`;
}

// ── Time-of-day recount ─────────────────────────────────────────────────────
// Three 8-hour clock bands. Overnight (12am–8am) is broken out on its own
// because empty-stomach / nocturnal vomiting is a real clinical signal the vet
// looks for; the split is descriptive, never a verdict.
export interface TimeBand {
  key: 'overnight' | 'daytime' | 'evening';
  label: string;
  startHour: number; // inclusive
  endHour: number; // exclusive (24 = midnight)
}

export const TIME_BANDS: readonly TimeBand[] = [
  { key: 'overnight', label: '12am–8am', startHour: 0, endHour: 8 },
  { key: 'daytime', label: '8am–4pm', startHour: 8, endHour: 16 },
  { key: 'evening', label: '4pm–12am', startHour: 16, endHour: 24 },
] as const;

export interface TimingCluster {
  band: TimeBand;
  count: number; // events in the modal band
  total: number; // events considered
}

// Below this, there is no meaningful time-of-day picture to report.
export const TIMING_MIN_EVENTS = 3;
// The modal band must hold at least half the events before we assert a cluster —
// otherwise the events are spread across the day and no timing tile is shown (the
// raw count still conveys the number). Ties resolve to the earliest band, which
// keeps a 12am–8am pattern legible rather than hidden behind a later band.
export const TIMING_MIN_SHARE = 0.5;

/**
 * The dominant clock band and its share, from a list of LOCAL hours-of-day
 * (0–23). Returns null when there are too few events, or when no single band
 * holds a majority (events are spread — we assert nothing). Pure: the caller
 * derives local hours from each event's `occurred_at` in the device timezone.
 */
export function computeTimingCluster(localHours: number[]): TimingCluster | null {
  const valid = localHours.filter((h) => Number.isInteger(h) && h >= 0 && h < 24);
  const total = valid.length;
  if (total < TIMING_MIN_EVENTS) return null;

  const counts = TIME_BANDS.map(
    (band) => valid.filter((h) => h >= band.startHour && h < band.endHour).length,
  );
  let bestIdx = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[bestIdx]) bestIdx = i; // strict >: ties keep the earlier band
  }
  const count = counts[bestIdx];
  if (count / total < TIMING_MIN_SHARE) return null;
  return { band: TIME_BANDS[bestIdx], count, total };
}

// ── Weight range ────────────────────────────────────────────────────────────
export interface WeightRange {
  minLbs: number;
  maxLbs: number;
  count: number;
}

/** Min/max over a weigh-in series (already in display lbs, rounded 0.1). null with no readings. */
export function computeWeightRange(seriesLbs: number[]): WeightRange | null {
  const valid = seriesLbs.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return null;
  return { minLbs: Math.min(...valid), maxLbs: Math.max(...valid), count: valid.length };
}

// ── Logged-days denominator ─────────────────────────────────────────────────
/** Distinct LOCAL calendar days present in a set of ISO timestamps (coverage denominator). */
export function distinctLocalDays(isoTimestamps: string[]): number {
  const days = new Set<string>();
  for (const iso of isoTimestamps) {
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) days.add(toLocalDayKey(new Date(ms)));
  }
  return days.size;
}

// ── Copy formatters (pure, tested) ──────────────────────────────────────────

/** "7 in 30 days · 3 this week" — the raw count, never a trend verdict. */
export function symptomTileValue(count30: number, count7: number): string {
  const week = count7 === 0 ? 'none this week' : `${count7} this week`;
  return `${count30} in 30 days · ${week}`;
}

/** "5 of 7 between 12am–8am" — a factual recount of where they fell, no "clustered". */
export function timingTileValue(cluster: TimingCluster): string {
  return `${cluster.count} of ${cluster.total} between ${cluster.band.label}`;
}

/** "9.3–9.7 lbs" or "9.5 lbs" (single reading). */
export function weightTileValue(range: WeightRange): string {
  if (range.minLbs === range.maxLbs) return `${range.minLbs} lbs`;
  return `${range.minLbs}–${range.maxLbs} lbs`;
}

/** "6 weigh-ins" / "1 weigh-in". */
export function weighInCountLabel(count: number): string {
  return `${count} weigh-in${count === 1 ? '' : 's'}`;
}

/**
 * The appetite tile from the canonical intake rate. Below the ranking floor it
 * says so honestly rather than guessing (data-gap, never reassurance). Never
 * "usual"/"good"/"picky" — a raw finished-of-rated fraction the vet reads.
 */
export function appetiteTileValue(intake: IntakeRate | { status: 'not_enough_data' }): string {
  if ('status' in intake) return 'Too few meals logged to read appetite';
  return `${intake.finishedMeals} of ${intake.ratedMeals} meals finished`;
}

/** "As needed" for a PRN regimen (doses_per_day NULL), else the schedule. Mirrors profile.tsx. */
export function frequencyLabel(dosesPerDay: number | null): string {
  if (dosesPerDay == null) return 'As needed';
  switch (dosesPerDay) {
    case 1:
      return 'Once a day';
    case 2:
      return 'Twice a day';
    case 3:
      return '3× a day';
    case 4:
      return '4× a day';
    default:
      return `${dosesPerDay}× a day`;
  }
}

/**
 * "last Jul 10" from an ISO dose timestamp, or "no dose logged yet" (never "none needed").
 * The dose's LOCAL day through the one formatter (H-10, CUL-1126), so a dormant PRN course
 * whose last dose was last July reads "last Jul 10, 2025", never a bare date that looks
 * like eleven weeks ago. `today` is the rundown's own day key, never a second clock.
 */
export function lastDoseLabel(lastDoseIso: string | null, today: string): string {
  if (!lastDoseIso) return 'no dose logged yet';
  const ms = Date.parse(lastDoseIso);
  if (!Number.isFinite(ms)) return 'no dose logged yet';
  const day = recordDay(toLocalDayKey(new Date(ms)), today);
  return day ? `last ${day}` : 'no dose logged yet';
}

export interface SinceVisitChanges {
  newFoods: number;
  newMeds: number;
}

/** "2 new foods · 1 new med" / "No new foods or meds logged" — a factual delta. */
export function sinceVisitValue(changes: SinceVisitChanges): string {
  const parts: string[] = [];
  if (changes.newFoods > 0) {
    parts.push(`${changes.newFoods} new food${changes.newFoods === 1 ? '' : 's'}`);
  }
  if (changes.newMeds > 0) {
    parts.push(`${changes.newMeds} new med${changes.newMeds === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No new foods or meds logged';
}

/**
 * Where a since-visit tile taps through: the surface that actually shows the
 * change — foods when a food was introduced, meds (profile) for a med-only
 * change, else the timeline. A med-only change must never land in the food
 * library (tap-through fidelity).
 */
export function sinceVisitTap(changes: SinceVisitChanges): RundownTap {
  if (changes.newFoods > 0) return { kind: 'foods' };
  if (changes.newMeds > 0) return { kind: 'meds' };
  return { kind: 'history' };
}

/** The since-visit tile's label: History's own long name for the window (§3.9), imported
 *  so the rundown, the report screen and History cannot name one window three ways. */
export const SINCE_VISIT_LABEL = ANCHORED_WINDOW_NAMES.visit;

/**
 * The since-visit tile's date: the day the window starts, through the one formatter (H-10,
 * CUL-1126). "Jul 2" in the current year, "Jul 2, 2025" outside it, so fourteen months can
 * never read as eleven weeks. The label beside it already says "Since the last vet visit",
 * so the date stands alone, as it does on History's window sheet.
 *
 * Takes the day KEY and never `Date.parse`s it: a bare 'YYYY-MM-DD' parses as UTC
 * midnight, which printed the day before the visit for every owner behind UTC.
 */
export function visitDateLabel(sinceDay: SinceVisitDay, today: string): string | null {
  return recordDay(sinceDay, today);
}

// ── Past medications (B-140 PR 4) — pure copy + windowing, tested off the DB ─────
// The block reads the ONE shared course derivation (deriveMedicationCourses); these
// helpers turn a derived course into a speakable rundown row and split the past into a
// shown/folded window. Two invariants govern the copy, enforced by the reassurance scan
// in rundown.test.ts (clinical-guardrails Pattern 8 — the invariant is a test):
//   • H1 — "Ended" renders ONLY from `end.kind === 'ended'` (an owner action); silence is
//     "No end recorded", NEVER "completed"/"ongoing". A history view that promotes a quiet
//     course into an ending fabricates a clinical fact (the B-422 stale-active lesson).
//   • H4 — the dose count is `course.dosesLogged` (= dosesTowardTarget), the SAME number the
//     profile card / med strip / report show for the course; there is no second count here.
// No verdict, no adherence %, no "picky"/wellness word — a factual course-recall aid.

/**
 * The lower bound of the shown window: `RUNDOWN_MED_HISTORY_MONTHS` calendar months
 * before `nowMs`, in the owner's LOCAL calendar (the device zone is the owner's midnight,
 * B-514) — "past 12 months" means "back to this date a year ago", not a 365-day count.
 * Pure function of nowMs so it pins without touching the clock.
 */
export function medHistoryCutoffMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setMonth(d.getMonth() - RUNDOWN_MED_HISTORY_MONTHS);
  return d.getTime();
}

/**
 * A past course's recency for the shown/folded split: the last dose logged, else the
 * owner-recorded end date, else the regimen start. Null only when a course carries none of
 * these (structurally unreachable — every regimen has a start, every dose-derived course a
 * dose), and a null sorts as SHOWN (we never fold a course we cannot date — showing is the
 * safe direction on a clinical surface).
 *
 * The last dose is a real INSTANT, so its absolute ms is the honest recency. The end/start
 * are DATE-only 'YYYY-MM-DD' columns, which MUST bucket to LOCAL midnight via
 * `dayKeyToLocalDate` — NEVER `Date.parse`, which reads a bare date as UTC and lands a day
 * early behind UTC (the B-441 trap). `medHistoryCutoffMs` is a local-wall-clock instant, so
 * both operands of the split's `>= cutoff` compare on one local basis; parsing a DATE as UTC
 * would fold a boundary course a day early for every owner behind UTC.
 */
export function courseRecencyMs(course: MedicationCourse): number | null {
  if (course.lastDoseIso) {
    const ms = Date.parse(course.lastDoseIso);
    if (Number.isFinite(ms)) return ms;
  }
  const dateKey = (course.end.kind === 'ended' ? course.end.endedAt : null) ?? course.startedAt;
  const local = dateKey ? dayKeyToLocalDate(dateKey.slice(0, 10)) : null;
  return local ? local.getTime() : null;
}

/**
 * "Mar 16" from a 'YYYY-MM-DD' day key (a derived local dose day, or a regimen DATE column),
 * through the one formatter (`lib/recordDates.ts`, H-10, CUL-1126): bare in the current year,
 * "Mar 16, 2025" outside it. The past-meds block spans twelve months, so it crosses a new
 * year every January, and a bare date there could mean either. The key is read as a
 * calendar day, never an instant, so the day cannot shift across a timezone (the B-441
 * trap). Slices to the leading date so a stray datetime still yields its calendar day.
 * Null (surface omits the date) when absent or malformed, never a guessed date.
 */
export function formatMedDate(value: string | null, today: string): string | null {
  return value ? recordDay(value.slice(0, 10), today) : null;
}

/**
 * A speakable date range, the year stated once and only where it is needed (H-10):
 * "Mar 3 – 16" (same month), "Mar 3 – Apr 2" (cross-month), "Mar 3 – 16, 2025" (another
 * year), "Dec 30, 2025 – Jan 2" (across a new year, read in 2026: the direction stays
 * unambiguous because at most one side is ever bare, and a bare side is this year), "Mar 3"
 * (single day, or only one endpoint known), or null (neither known). An inverted pair (an
 * end recorded before its start) prints its start alone rather than a window the record
 * never had.
 */
export function formatMedDateRange(
  startKey: string | null,
  endKey: string | null,
  today: string,
): string | null {
  const sStr = formatMedDate(startKey, today);
  const eStr = formatMedDate(endKey, today);
  if (sStr && eStr && startKey && endKey) {
    return recordRange(startKey.slice(0, 10), endKey.slice(0, 10), today) ?? sStr;
  }
  return sStr ?? eStr ?? null;
}

/** "1 dose" / "26 doses" — plain count of doses delivered (H4: `course.dosesLogged`). */
export function doseCountPhrase(n: number): string {
  return `${n} dose${n === 1 ? '' : 's'}`;
}

/**
 * The speakable facts line for a past course. An ENDED course leads with its window
 * (start → owner-recorded end), then length, then dose count — the shape of a defined
 * course a vet places on a timeline. A course with no recorded end leads with the dose
 * count, then the logged span — "what was logged", since there is no formal window to state.
 */
export function pastMedTileValue(course: MedicationCourse, today: string): string {
  const count = doseCountPhrase(course.dosesLogged);
  if (course.end.kind === 'ended') {
    const range = formatMedDateRange(course.startedAt, course.end.endedAt, today);
    const parts: string[] = [];
    if (range) parts.push(range);
    if (course.runDays != null) {
      parts.push(`${course.runDays} day${course.runDays === 1 ? '' : 's'}`);
    }
    parts.push(count);
    return parts.join(' · ');
  }
  const range = formatMedDateRange(course.firstDoseDay, course.lastDoseDay, today);
  return range ? `${count} · ${range}` : count;
}

/**
 * The end-register secondary line (H1). "Ended {date}" renders ONLY for an owner-ended
 * course; every other course reads "No end recorded" — the record's silence stated
 * honestly, never softened into "completed"/"ongoing" and never a wellness word.
 */
export function pastMedEndDetail(course: MedicationCourse, today: string): string {
  if (course.end.kind === 'ended') {
    const when = formatMedDate(course.end.endedAt, today);
    return when ? `Ended ${when}` : 'Ended';
  }
  return 'No end recorded';
}

/** The folded "earlier courses" row (D3): a quiet, non-tappable disclosure, never a data row. */
export function earlierCoursesTile(count: number): RundownTile {
  return {
    key: 'meds_past',
    label: 'Earlier',
    value: `${count} earlier course${count === 1 ? '' : 's'}, over a year ago`,
    tap: null,
    empty: true,
  };
}

/**
 * One past-course row. Regimen courses tap to their detail screen (`/medication/[id]`,
 * where PR 3 renders the past-course facts); a dose-derived course has no regimen, so it
 * taps to History (its doses' home). Normal emphasis — a "No end recorded" course is a real
 * course, not a designed-empty row, so it is NOT faded (the register line carries the
 * distinction, not the styling).
 */
export function pastMedCourseTile(
  course: MedicationCourse,
  drugName: string,
  today: string,
): RundownTile {
  return {
    key: 'meds_past',
    label: drugName,
    value: pastMedTileValue(course, today),
    detail: pastMedEndDetail(course, today),
    tap:
      course.source === 'regimen' && course.regimenId
        ? { kind: 'medication', medicationId: course.regimenId }
        : { kind: 'history' },
  };
}

/**
 * Split the derived courses into the past-meds rundown block: the courses shown by name
 * (past, within the window) and a count of the earlier ones folded behind it. Active
 * courses are dropped here — they belong to the "Current meds" block, so a course is never
 * duplicated across the two (QA AC #3). Ordering is the derivation's (recency), preserved.
 */
export function splitPastCourses(
  courses: MedicationCourse[],
  nowMs: number,
): { shown: MedicationCourse[]; earlierCount: number } {
  const cutoff = medHistoryCutoffMs(nowMs);
  const shown: MedicationCourse[] = [];
  let earlierCount = 0;
  for (const c of courses) {
    if (c.isActive) continue; // the current-meds block owns active courses
    const ms = courseRecencyMs(c);
    if (ms == null || ms >= cutoff) shown.push(c);
    else earlierCount++;
  }
  return { shown, earlierCount };
}

// Brand/generic pair from the drug cache, keyed by medication_item_id.
export interface MedItemName {
  generic: string | null;
  brand: string | null;
}

// A course's owner-facing drug name. A regimen course carries its own `drug_name` (what the
// owner entered — the same string the current-meds block shows). A dose-derived course has
// none, so we resolve the drug library's brand-first name (B-171, the app's owner-facing
// naming rule); a nameless dose (no item, or an uncached one) falls back to plain
// "Medication" — honest (doses happened, the drug is unknown), never a guess.
export function resolveCourseName(course: MedicationCourse, itemNames: Map<string, MedItemName>): string {
  if (course.drugName && course.drugName.trim().length > 0) return course.drugName;
  const item = course.medicationItemId ? itemNames.get(course.medicationItemId) : undefined;
  return (item ? drugDisplayName(item.generic, item.brand) : null) ?? 'Medication';
}

/**
 * Assemble the past-medications block from the derived courses and the drug-name map:
 * the shown courses as named rows, then the folded "earlier courses" row when any exist.
 * Pure — the DB reads live in `buildRundown`, so this is unit-tested with fixtures.
 */
export function buildPastMedications(
  courses: MedicationCourse[],
  itemNames: Map<string, MedItemName>,
  nowMs: number,
): RundownTile[] {
  const { shown, earlierCount } = splitPastCourses(courses, nowMs);
  const today = toLocalDayKey(new Date(nowMs));
  const tiles = shown.map((c) => pastMedCourseTile(c, resolveCourseName(c, itemNames), today));
  if (earlierCount > 0) tiles.push(earlierCoursesTile(earlierCount));
  return tiles;
}

/**
 * A plain-text rendering of the rundown for the "Save for the visit" share — a
 * portable, offline artifact the owner can print, message to themselves, or hand
 * to the vet, needing no persistence (§10). Same register as the tiles: label,
 * value, denominator; no adjectives, no verdicts.
 */
export function rundownToPlainText(rundown: Rundown): string {
  const tileLine = (t: RundownTile) =>
    t.detail ? `${t.label}: ${t.value} (${t.detail})` : `${t.label}: ${t.value}`;
  const lines = [`${rundown.petName} — visit rundown`, rundownDateLine(rundown.generatedAtMs), ''];
  for (const tile of rundown.tiles) lines.push(tileLine(tile));
  // Past-medications block under its own heading, so a clinician reading the saved copy
  // sees the same labelled section the screen renders (and knows its 12-month window).
  if (rundown.pastMedications.length > 0) {
    lines.push('', pastMedsSectionLabel());
    for (const tile of rundown.pastMedications) lines.push(tileLine(tile));
  }
  lines.push('', "From Culprit — your pet's logged record.");
  return lines.join('\n');
}

// ── Local reads (thin; the pure logic above does the work) ──────────────────

interface ActiveRegimen {
  id: string;
  drugName: string;
  dosesPerDay: number | null;
  lastDoseIso: string | null;
}

/** Active regimens for a pet, most-recently-started first, each with its last logged dose. */
async function readActiveRegimens(petId: string): Promise<ActiveRegimen[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: string;
    drug_name: string;
    doses_per_day: number | null;
    last_dose: string | null;
  }>(
    // Last dose is the newest non-deleted administration event linked to this
    // regimen (the meds→administrations→events soft-delete chain), mirroring the
    // occurred_at ordering `recentMedicationsQuery` uses.
    `SELECT m.id AS id, m.drug_name AS drug_name, m.doses_per_day AS doses_per_day,
            (SELECT MAX(e.occurred_at)
               FROM medication_administrations ma
               JOIN events e ON e.id = ma.event_id
              WHERE ma.medication_id = m.id AND e.deleted_at IS NULL) AS last_dose
       FROM medications m
      WHERE m.pet_id = ? AND m.status = 'active'
      ORDER BY m.started_at DESC`,
    [petId],
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    drugName: r.drug_name,
    dosesPerDay: r.doses_per_day,
    lastDoseIso: r.last_dose,
  }));
}

// The pet's WHOLE regimen set — active AND ended — for the past-meds derivation. NOT
// filtered to `status = 'active'`: that filter is the amnesia B-140 exists to undo (spec §1),
// and `deriveMedicationCourses` needs every status to tell current from past. Selects exactly
// the columns `MedicationHistoryRegimen` carries (incl. the two duration targets and ended_at)
// so the row is passed straight to the derivation.
async function readAllRegimens(petId: string): Promise<MedicationHistoryRegimen[]> {
  const db = getDb();
  const rows = await db.getAllAsync<MedicationHistoryRegimen>(
    `SELECT id, medication_item_id, drug_name, dose_amount, route, doses_per_day,
            schedule_notes, started_at, target_duration_days, target_duration_doses,
            status, ended_at
       FROM medications
      WHERE pet_id = ?`,
    [petId],
  );
  return rows ?? [];
}

// Every non-deleted dose for the pet, in `AttributableDose` shape — the whole history, NOT a
// recency window: the derivation attributes each dose to a course and counts it, and the fold
// count needs the older courses too. Soft-delete is read THROUGH the parent event
// (`e.deleted_at` — a dose carries no own deleted_at, migration 020); filtered here for a cheap
// read AND passed through so `attributeDoses` re-applies it as its single enforcement point
// (the med-strip pattern). Ordering is irrelevant — the derivation computes its own spans.
async function readAllDoses(petId: string): Promise<AttributableDose[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    medication_id: string | null;
    medication_item_id: string | null;
    adherence: string | null;
    deleted_at: string | null;
    occurred_at: string;
  }>(
    `SELECT ma.medication_id AS medication_id, ma.medication_item_id AS medication_item_id,
            ma.adherence AS adherence, e.deleted_at AS deleted_at, e.occurred_at AS occurred_at
       FROM medication_administrations ma
       JOIN events e ON e.id = ma.event_id
      WHERE ma.pet_id = ? AND e.deleted_at IS NULL`,
    [petId],
  );
  return (rows ?? []).map((r) => ({
    medication_id: r.medication_id,
    medication_item_id: r.medication_item_id,
    adherence: r.adherence,
    deleted_at: r.deleted_at,
    occurred_at: r.occurred_at,
  }));
}

// The whole per-account drug cache as an id → name map — a small, organically-built library
// (B-117), so one read is cheaper than a per-course round trip. Only dose-derived courses need
// it (a regimen course names itself); resolveCourseName brand-firsts these via drugDisplayName.
async function readMedicationItemNames(): Promise<Map<string, MedItemName>> {
  const db = getDb();
  const rows = await db.getAllAsync<{ id: string; generic_name: string | null; brand_name: string | null }>(
    `SELECT id, generic_name, brand_name FROM medication_items_cache`,
  );
  const map = new Map<string, MedItemName>();
  for (const r of rows ?? []) map.set(r.id, { generic: r.generic_name, brand: r.brand_name });
  return map;
}

/**
 * Changes since the window's first day: foods whose FIRST-EVER logged feed falls on or after
 * it (genuinely introduced since), and regimens started on or after it.
 *
 * ── THE DAY IS COMPARED AS A DAY, NEVER AS TEXT (C-40, CUL-1127) ──────────────
 * This used to bind the visit's 'YYYY-MM-DD' into `HAVING MIN(e.occurred_at) >= ?`, a TEXT
 * comparison against ISO instants. '2026-07-02' sorts before every '2026-07-02T…' string,
 * so the bound was UTC midnight: for an owner at UTC−7 a food first fed at 8pm the evening
 * BEFORE the visit counted as new since it, and at UTC+10 a food first fed at 8am on the
 * visit's own day did not. Both sides are now read as LOCAL day indices (`localDayIndexOf`
 * takes a DATE key verbatim and an instant by the day it falls on) and compared as numbers.
 *
 * The food half reads each linked meal's instant and takes the earliest per food in code,
 * so no text MIN picks between two spellings of one instant (`…Z` local, `…+00:00`
 * hydrated). A meal whose time cannot be parsed is skipped for that food, never guessed
 * into the window. `started_at` is a Postgres DATE, compared through the same index so a
 * stray instant in the mirror still lands on its local day.
 *
 * `sinceDay` is a branded `SinceVisitDay`, so only the shared bound can hand this a start.
 */
async function readSinceVisitChanges(petId: string, sinceDay: SinceVisitDay): Promise<SinceVisitChanges> {
  const since = recordDayIndex(sinceDay);
  if (since === null) throw new RangeError(`rundown: since-visit day is not a day key: "${sinceDay}"`);
  const db = getDb();
  const [feeds, regimens] = await Promise.all([
    db.getAllAsync<{ food_item_id: string; occurred_at: string }>(
      `SELECT m.food_item_id AS food_item_id, e.occurred_at AS occurred_at
         FROM meals m
         JOIN events e ON e.id = m.event_id
        WHERE e.pet_id = ? AND e.deleted_at IS NULL AND m.food_item_id IS NOT NULL`,
      [petId],
    ),
    db.getAllAsync<{ started_at: string | null }>(
      `SELECT started_at FROM medications WHERE pet_id = ?`,
      [petId],
    ),
  ]);
  return countSinceVisitChanges(feeds ?? [], regimens ?? [], since);
}

/**
 * The pure half of `readSinceVisitChanges`, exported so the day comparison is tested over
 * real instants in every CI zone rather than through a mocked database.
 */
export function countSinceVisitChanges(
  feeds: readonly { food_item_id: string; occurred_at: string }[],
  regimens: readonly { started_at: string | null }[],
  sinceIndex: number,
): SinceVisitChanges {
  const firstFeed = new Map<string, number>();
  for (const f of feeds) {
    const day = localDayIndexOf(f.occurred_at);
    if (day === null) continue;
    const prior = firstFeed.get(f.food_item_id);
    if (prior === undefined || day < prior) firstFeed.set(f.food_item_id, day);
  }
  let newFoods = 0;
  for (const day of firstFeed.values()) if (day >= sinceIndex) newFoods++;

  let newMeds = 0;
  for (const r of regimens) {
    const day = r.started_at ? localDayIndexOf(r.started_at) : null;
    if (day !== null && day >= sinceIndex) newMeds++;
  }
  return { newFoods, newMeds };
}

/** LOCAL hours-of-day of a symptom type's events in a window (for the timing recount). */
async function readSymptomLocalHours(
  petId: string,
  symptomType: string,
  startMs: number,
  endMs: number,
): Promise<number[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ occurred_at: string }>(
    `SELECT occurred_at FROM events
      WHERE pet_id = ? AND deleted_at IS NULL AND event_type = ?
        AND occurred_at >= ? AND occurred_at < ?`,
    [petId, symptomType, new Date(startMs).toISOString(), new Date(endMs).toISOString()],
  );
  return (rows ?? [])
    .map((r) => Date.parse(r.occurred_at))
    .filter((ms) => Number.isFinite(ms))
    .map((ms) => new Date(ms).getHours());
}

/**
 * ISO timestamps of non-deleted MEAL events in a window — the appetite-coverage
 * denominator (days a feeding was actually logged). Scoped to meals, not all
 * events, so the "meals logged on N of 30 days" line under Appetite means
 * meal-days, never total logging density (which would read as false meal
 * coverage). Treats are excluded (`food_type != 'treat'`) to match the intake
 * rate's own treat exclusion (§11 #1) — a treat-only day isn't a meal-day. A
 * meal with no library link (`food_type` NULL) still counts (it's a logged feed).
 */
async function readMealTimestamps(petId: string, startMs: number, endMs: number): Promise<string[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ occurred_at: string }>(
    `SELECT e.occurred_at AS occurred_at
       FROM meals m
       JOIN events e ON e.id = m.event_id
       LEFT JOIN food_items_cache f ON f.id = m.food_item_id
      WHERE e.pet_id = ? AND e.deleted_at IS NULL
        AND (f.food_type IS NULL OR f.food_type != 'treat')
        AND e.occurred_at >= ? AND e.occurred_at < ?`,
    [petId, new Date(startMs).toISOString(), new Date(endMs).toISOString()],
  );
  return (rows ?? []).map((r) => r.occurred_at);
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Assemble the rundown for a pet. Client-only, deterministic, offline-safe: it
 * reuses the canonical count/rate/weight aggregates and reads the local mirror
 * for the pieces that have no client aggregate. Errors are the caller's to
 * handle (no silent failures) — a broken read should surface, not fabricate a
 * reassuring empty rundown.
 */
export async function buildRundown(
  petId: string,
  petName: string,
  nowMs: number = Date.now(),
): Promise<Rundown> {
  const monthRange = calendarWindow('month', nowMs);
  const windowDays = WINDOW_DAYS.month;
  // The rundown's one day key. Every date it prints and the visit bound it reads are judged
  // against this, never a fresh `new Date()`, so a rundown built at an explicit `nowMs`
  // (and the saved copy stamped "As of" that day) agree with themselves.
  const today = toLocalDayKey(new Date(nowMs));

  const [
    monthCounts,
    weekCounts,
    intake,
    weightReadings,
    mealTimestamps,
    regimens,
    lastVisit,
    allRegimens,
    allDoses,
    medItemNames,
  ] = await Promise.all([
    getSymptomCounts(petId, 'month', nowMs),
    getSymptomCounts(petId, 'week', nowMs),
    getIntakeRate(petId, 'month', nowMs),
    getWeightHistory(petId, RUNDOWN_WEIGHIN_LIMIT),
    readMealTimestamps(petId, monthRange.currentStartMs, monthRange.currentEndMs),
    readActiveRegimens(petId),
    // The ONE since-visit bound (H-11, `lib/visitWindow.ts`), judged on the rundown's own
    // day: the latest visit strictly before it, so the rundown, History's *Since the last
    // vet visit* and the report's rung 1 start on the same day. A visit saved today, or a
    // row dated ahead, anchors nothing until the day after it (CUL-1127; CUL-946 wrote
    // exactly such rows, and the old `MAX(visited_at)` measured "nothing changed" from them).
    readLatestVisitBefore(getDb(), petId, today),
    // Past-meds block: the whole regimen+dose history + the drug-name cache, read alongside
    // everything else. readActiveRegimens (above) still drives the "Current meds" block
    // unchanged; these three feed the SEPARATE past block via the shared course derivation.
    readAllRegimens(petId),
    readAllDoses(petId),
    readMedicationItemNames(),
  ]);

  const tiles: RundownTile[] = [];

  // 1 — Symptom counts (one tile per symptom present, ranked; canonical numbers).
  const present = monthCounts.filter((c) => c.current > 0);
  if (present.length === 0) {
    tiles.push({
      key: 'symptoms',
      label: 'Symptoms',
      // Absence is a coverage fact, never wellness (G2): "none logged", not "she's well".
      value: 'None logged in 30 days',
      tap: { kind: 'history' },
      empty: true,
    });
  } else {
    for (const c of present) {
      const week = weekCounts.find((w) => w.symptomType === c.symptomType)?.current ?? 0;
      tiles.push({
        key: 'symptoms',
        label: symptomLabel(c.symptomType),
        value: symptomTileValue(c.current, week),
        tap: { kind: 'symptom', symptomType: c.symptomType },
      });
    }

    // 2 — Timing recount for the dominant symptom (already the first `present` row).
    const dominant = present[0];
    const hours = await readSymptomLocalHours(
      petId,
      dominant.symptomType,
      monthRange.currentStartMs,
      monthRange.currentEndMs,
    );
    const cluster = computeTimingCluster(hours);
    if (cluster) {
      tiles.push({
        key: 'timing',
        label: 'Timing',
        value: timingTileValue(cluster),
        detail: symptomLabel(dominant.symptomType),
        tap: { kind: 'symptom', symptomType: dominant.symptomType },
      });
    }
  }

  // 3 — Appetite (canonical intake rate) + the MEAL-day coverage denominator.
  // The window is UTC-day-aligned but days are bucketed local, so a boundary event
  // can nudge the distinct-local-day count one past the window; clamp so the
  // coverage reads "≤ N of N", never "31 of 30".
  const mealDaysLogged = Math.min(distinctLocalDays(mealTimestamps), windowDays);
  const appetiteDetailParts = [`meals logged on ${mealDaysLogged} of ${windowDays} days`];
  if (!isNotEnoughData(intake) && intake.intakeNotDirectlyObserved) {
    appetiteDetailParts.push('some meals free-fed (intake not directly seen)');
  }
  tiles.push({
    key: 'appetite',
    label: 'Appetite',
    value: appetiteTileValue(intake),
    detail: appetiteDetailParts.join(' · '),
    tap: { kind: 'patterns' },
    empty: isNotEnoughData(intake),
  });

  // 4 — Weight range over weigh-ins (lbs, the app-wide display unit).
  const range = computeWeightRange(computeWeightTrend(weightReadings).seriesLbs);
  if (range) {
    tiles.push({
      key: 'weight',
      label: 'Weight',
      value: weightTileValue(range),
      detail: weighInCountLabel(range.count),
      tap: { kind: 'weight' },
    });
  } else {
    tiles.push({
      key: 'weight',
      label: 'Weight',
      value: 'No weigh-ins logged',
      tap: { kind: 'weight' },
      empty: true,
    });
  }

  // 5 — Current meds (one tile per active regimen; PRN vs schedule + last dose).
  if (regimens.length === 0) {
    tiles.push({
      key: 'meds',
      label: 'Current meds',
      value: 'None active',
      tap: { kind: 'meds' },
      empty: true,
    });
  } else {
    for (const reg of regimens) {
      tiles.push({
        key: 'meds',
        label: reg.drugName,
        value: `${frequencyLabel(reg.dosesPerDay)} · ${lastDoseLabel(reg.lastDoseIso, today)}`,
        tap: { kind: 'medication', medicationId: reg.id },
      });
    }
  }

  // 6 — Since the last vet visit (or an honest "none logged" forward state).
  if (!lastVisit) {
    tiles.push({
      key: 'since_visit',
      label: SINCE_VISIT_LABEL,
      value: 'No prior visit logged',
      tap: { kind: 'log-visit' },
      empty: true,
    });
  } else {
    const changes = await readSinceVisitChanges(petId, lastVisit);
    const hasChanges = changes.newFoods > 0 || changes.newMeds > 0;
    tiles.push({
      key: 'since_visit',
      label: SINCE_VISIT_LABEL,
      value: sinceVisitValue(changes),
      detail: visitDateLabel(lastVisit, today) ?? undefined,
      tap: sinceVisitTap(changes),
      empty: !hasChanges,
    });
  }

  // 7 — Past medications (B-140 PR 4). The ONE shared course derivation over the whole
  // regimen+dose history, split into a 12-month shown window with earlier courses folded
  // (D3 ratified 2026-08-04). Active courses are dropped here — the current-meds tiles above own
  // them — so a course is never duplicated across the two blocks. Deterministic + offline:
  // the derivation is pure and every input is a local-mirror read.
  const courses = deriveMedicationCourses({ regimens: allRegimens, doses: allDoses });
  const pastMedications = buildPastMedications(courses, medItemNames, nowMs);

  return {
    petName,
    generatedAtMs: nowMs,
    tiles,
    pastMedications,
    facts: { courses, medItemNames, lastVisitAt: lastVisit, weighIns: weightReadings },
  };
}
