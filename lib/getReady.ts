import { visibleFindings } from './signalVisible';
import { splitPastCourses, pastMedTileValue, pastMedEndDetail } from './rundown';
// The C-19-correct date formatter (year-stamped outside this year), and the
// companion's own — Get ready is a companion surface.
import { formatVisitDate } from './vetVisits';
import type { CachedFinding } from './signal';
import type { Rundown, RundownTile } from './rundown';
import type { TrialStripModel } from './dietTrialCard';
import type { MedicationCourse } from './medicationHistory';
import type { MedItemName } from './rundown';

// "Worth raising" — the Get-ready block (CUL-903 VV-5; spec §4.1 B1, §7 AC 5, mock B1).
//
// ── THE ONE RULE THIS MODULE EXISTS TO KEEP ──────────────────────────────────────
// DETERMINISTIC, ONE SOURCE PER ROW, QUOTED NEVER RE-DERIVED (G6).
//
// Every row here is a sentence the app ALREADY states somewhere else, reproduced. No
// row counts anything, and no row opens a window of its own — because a second count
// over the same population with a different window is how CUL-746 shipped: the vet
// report scored a pet's PRESCRIBED trial diet as an off-diet breach, and it did so
// without any module being individually wrong. This page is read aloud to a
// clinician, so a number invented here is a number the owner will say in the room.
//
// Concretely, the four sources and what each contributes:
//   • the Signal   → `CachedFinding.text`, the server-composed phrased sentence, the
//                    exact string `InsightCard` renders on Home. Never re-phrased.
//   • the trial    → `TrialStripModel.header` / `.line`, the exact strings the Home
//                    trial strip renders.
//   • a course     → `pastMedTileValue` / `pastMedEndDetail`, the exact strings the
//                    rundown's own past-medications row renders, over the course
//                    derivation that build already ran (`Rundown.facts`).
//   • the weight   → the rundown's own weight tile, plus a DATE from the record.
//
// ── WHY SAFETY SITS ABOVE THE CAP ────────────────────────────────────────────────
// Jordan's cap is four. Principle 3 says safety insights "always lead and are never
// dropped to honor a layout cap", and the Signal's findings are unbounded server-side
// — nothing caps them at three. So the cap governs the OPTIONAL rows and every safety
// finding renders above it. A list that silently dropped the fourth safety finding to
// make room for a weight date would be the exact trade Principle 3 forbids.
//
// ── WHY THE TRIAL OUTRANKS A NON-SAFETY SIGNAL ROW ───────────────────────────────
// Below the safety rows the order is the trial, the course, the weight, and only then
// the remaining Signal findings. That is not the issue's listed order, and the reason
// is the case this feature exists for: a wedge owner at a RECHECK for the diet trial,
// whose Signal happens to carry four benign findings, would otherwise open Get ready
// and find four symptom sentences and no mention of the trial — at the appointment
// the trial is the subject of. The Signal's own findings are on Home in full and its
// symptom counts are in the rundown block directly below this one; the trial, the
// unterminated course and the weight gap appear nowhere else on this page.
//
// ── WHAT IS ABSENT, AND WHAT IS NOT SAID ─────────────────────────────────────────
// A quiet record renders NO SECTION (mock B1b), never a row saying "nothing to
// raise". Absence is a coverage fact, never wellness — the rundown's own "None logged
// in 30 days" is the only sentence about it, and it already carries its denominator.
//
// A read that FAILED is not a quiet record (C-12). `findings: null` means the Signal
// cache could not be reached; the section still renders, with the gap named, because
// an owner who cannot tell "nothing standing" from "we could not look" will read the
// first and walk into the room reassured.

/** Which of the record's own voices a row is quoting. */
export type WorthRaisingSource = 'signal' | 'trial' | 'course' | 'weight';

export interface WorthRaisingRow {
  /** Stable within one build — the list is re-derived at render, never stored. */
  id: string;
  /** The quoted sentence. */
  text: string;
  /** A second quoted line: the trial's coverage line, the course's end register. */
  detail: string | null;
  source: WorthRaisingSource;
  /** 'from the Signal' — named on every row, so the owner can say where it came from. */
  sourceLabel: string;
  /** True for a Signal finding whose own priority class is safety. Never capped away. */
  isSafety: boolean;
}

export interface WorthRaising {
  rows: WorthRaisingRow[];
  /**
   * True when the Signal cache could not be READ (offline, or a failed request) — as
   * distinct from a cache that answered with no findings.
   *
   * The section renders a quiet line naming the gap rather than pretending to
   * completeness. It is not an error state: every other row still built from local
   * SQLite, so the page is useful, just not whole.
   */
  signalUnavailable: boolean;
}

/** Jordan: "never more than four." Governs the optional rows; safety sits above it. */
export const WORTH_RAISING_CAP = 4;

/**
 * Words that turn a decline into a taste.
 *
 * The intake invariant: decline or refusal is frequently a DISEASE signal, so it is
 * never softened to "picky". This screen runs over rows this module ASSEMBLES from
 * parts — where owner free-text (a drug name) and this module's own joins meet — and
 * NEVER over a quoted Signal sentence.
 *
 * That asymmetry is deliberate and is the only safe direction. AC 5 requires the
 * Signal's sentence verbatim; silently editing or dropping one would (a) break that
 * requirement and (b) be able to remove a SAFETY statement from the list, which is
 * the one outcome nothing here may cause. The Signal's own copy is screened where it
 * is composed — `generate-signal/phrasing.ts` — which is where a fix belongs.
 * `guards/worthRaising.test.ts` holds the build-time half over this module's source.
 */
const PREFERENCE_RE = /\b(fussy|fussiness|picky|pickiness|prefers?|preference[sd]?)\b/i;

export interface WorthRaisingInput {
  /** The cached findings, or null when the cache could not be read (see above). */
  findings: CachedFinding[] | null;
  /** Home's B-789 suppression, passed through so the two surfaces cannot disagree. */
  suppressTrialResponse: boolean;
  /** `resolveTrialStrip`'s model for this pet, or null when no trial is running. */
  trialStrip: TrialStripModel | null;
  /** The rundown built for this same screen — quoted, and the source of `facts`. */
  rundown: Rundown;
  nowMs: number;
}

export function buildWorthRaising(input: WorthRaisingInput): WorthRaising {
  const signalRows = buildSignalRows(input);
  const optional = [
    trialRow(input.trialStrip),
    courseRow(input.rundown.facts.courses, input.rundown.facts.medItemNames, input.nowMs),
    weightRow(input.rundown, input.nowMs),
    ...signalRows.filter((r) => !r.isSafety),
  ].filter((r): r is WorthRaisingRow => r !== null);

  // THE PARTITION IS THE SAFETY RULE. Every safety row leads and sits ABOVE the cap;
  // the cap applies to `optional` alone. The server already ranks safety first, so in
  // every ordinary case this is also the server's order — but it holds even if the
  // engine ever ranked a benign finding higher, which is what AC 5 requires.
  const safety = signalRows.filter((r) => r.isSafety);
  return {
    rows: [...safety, ...optional.slice(0, WORTH_RAISING_CAP)],
    signalUnavailable: input.findings === null,
  };
}

/**
 * The Signal's findings as rows, safety first.
 *
 * `visibleFindings` is the SHARED predicate Home's own card stack uses
 * (`lib/signalVisible.ts`), not a second copy: it carries the B-789 suppression that
 * withholds a reassuring "0 vomiting · was 20" over a pet whose record shows a
 * not-eating concern. Re-deriving "the leading findings" here would bring that
 * sentence back as a thing to RAISE WITH A VET, over a starving cat.
 *
 * The order inside this list is the SERVER'S RANK, unchanged — `visibleFindings`
 * returns it sorted and the filters below preserve it.
 *
 * Safety-first is NOT done here, and a first draft that re-sorted by
 * `isSafety` here was dead code: `buildWorthRaising` partitions this list into
 * `safety` and `optional` and concatenates them, so a safety row leads whatever
 * order it arrives in. Caught by mutation — removing the sort changed no behaviour
 * and no test — and deleted rather than kept, because a line that looks like it
 * enforces the safety rule while enforcing nothing is worse than no line: the next
 * reader trusts it.
 */
function buildSignalRows(input: WorthRaisingInput): WorthRaisingRow[] {
  if (!input.findings) return [];
  return visibleFindings(input.findings, input.suppressTrialResponse, input.nowMs)
    .map((f, i) => ({
      id: `signal-${i}`,
      // VERBATIM. The Change Contract's phrased, count-anchored sentence is the unit.
      text: f.text,
      detail: null,
      source: 'signal' as const,
      sourceLabel: 'from the Signal',
      isSafety: f.finding.priorityClass === 'safety',
    }));
}

/** The running trial, in the Home strip's own words. */
function trialRow(strip: TrialStripModel | null): WorthRaisingRow | null {
  if (!strip) return null;
  return screen({
    id: 'trial',
    // "Diet trial · day 23 of 56". `line` is null while a safety flag is live on the
    // strip, and the row is header-only then rather than borrowing another line.
    text: strip.header,
    detail: strip.line,
    source: 'trial',
    sourceLabel: 'from the trial',
    isSafety: false,
  });
}

/**
 * The most recent course the owner never ended — "is she still meant to be on this?".
 *
 * `splitPastCourses` is the rundown's own 12-month window (D3), so this can never
 * surface a 2019 course, and `end.kind !== 'ended'` is the H1 register: `Ended`
 * renders only from an OWNER ACTION, and the record's silence reads "No end
 * recorded" — never softened to "completed" or "ongoing".
 *
 * Active courses are already excluded by `splitPastCourses` (they belong to the
 * rundown's Current meds block), which is what keeps this row about the ambiguous
 * case rather than about every med the pet is on.
 */
function courseRow(
  courses: MedicationCourse[],
  names: Map<string, MedItemName>,
  nowMs: number,
): WorthRaisingRow | null {
  const { shown } = splitPastCourses(courses, nowMs);
  // Recency-ordered by the derivation; the first unterminated one is the live question.
  const course = shown.find((c) => c.end.kind !== 'ended');
  if (!course) return null;
  const name = courseName(course, names);
  if (!name) return null;
  return screen({
    id: `course-${course.key}`,
    text: `${name} — ${pastMedTileValue(course)}`,
    detail: pastMedEndDetail(course),
    source: 'course',
    sourceLabel: 'from the course',
    isSafety: false,
  });
}

/** A regimen names itself; a dose-derived course is named from the drug identity. */
function courseName(course: MedicationCourse, names: Map<string, MedItemName>): string | null {
  const own = course.drugName?.trim();
  if (own) return own;
  const item = course.medicationItemId ? names.get(course.medicationItemId) : undefined;
  // Brand-first, the app's owner-facing naming rule (B-171).
  return item?.brand?.trim() || item?.generic?.trim() || null;
}

/**
 * The weight gap — and it ships with NO invented duration, which is the whole design.
 *
 * "When no weigh-in is recent" needs a meaning for *recent*, and the obvious one is a
 * threshold in days. A threshold would be a new claim over a new window on a page
 * whose entire rule is that it makes none (G6 / CUL-746), and there is no such
 * constant anywhere in the app to mirror — inventing one here would mean this module
 * deciding, alone, how long is too long between weigh-ins for any species, age or
 * condition. That is a clinical judgment, not a render-layer one.
 *
 * So *recent* is answered against the RECORD instead, in two gates that each read
 * dates the record already holds:
 *
 *   1. No weigh-in at all — asked of the RUNDOWN's own tile (its `empty` branch is
 *      exactly the one whose value reads "No weigh-ins logged"), so the gate and the
 *      sentence it prints can never come from two different places.
 *   2. The newest weigh-in predates the last logged visit — i.e. THE VET'S OWN NUMBER
 *      IS STILL THE NEWEST ONE. Nothing has been measured since they last saw this
 *      animal, which is precisely the thing worth saying out loud at the next visit.
 *
 * Gate 2 fires only for a pet with a logged prior visit, so a first-time owner sees
 * it only through gate 1. That under-fires rather than over-claims, which is the
 * direction this page is allowed to be wrong in.
 *
 * What the row PRINTS is a date, never a duration (C-19): a record-anchored date
 * costs nothing, while "no weigh-in in 94 days" is a duration that would inherit
 * whichever window produced it.
 */
function weightRow(rundown: Rundown, nowMs: number): WorthRaisingRow | null {
  const tile = rundown.tiles.find((t: RundownTile) => t.key === 'weight');
  if (!tile) return null;
  const { weighIns, lastVisitAt } = rundown.facts;
  const now = new Date(nowMs);

  // GATE 1 is answered by the TILE, not by the readings — quoted, never re-derived.
  // `buildRundown` sets `empty` on exactly the branch whose value is "No weigh-ins
  // logged", so this asks the rundown whether it is saying there is nothing, rather
  // than asking the readings and then printing a sentence composed from something
  // else. Reading `weighIns.length === 0` here and printing `tile.value` would let
  // the two disagree, and the row would assert a gap while showing a range.
  if (tile.empty === true) {
    return screen({
      id: 'weight-none',
      text: tile.value,
      detail: null,
      source: 'weight',
      sourceLabel: 'from the record',
      isSafety: false,
    });
  }

  if (!lastVisitAt || weighIns.length === 0) return null;
  // Oldest-first from `getWeightHistory`, so the last element is the newest reading.
  const newest = weighIns[weighIns.length - 1];
  const newestMs = Date.parse(newest.occurredAt);
  // A visit is a DATE with no time; comparing it as the START of its own day means a
  // weigh-in taken later the same day as the visit counts as "since", which is the
  // reading the owner would give it.
  const visitMs = Date.parse(`${lastVisitAt}T00:00:00`);
  if (Number.isNaN(newestMs) || Number.isNaN(visitMs)) return null;
  if (newestMs >= visitMs) return null;

  return screen({
    id: 'weight-stale',
    text: tile.value,
    detail: `Last weighed ${formatVisitDate(localDateKeyOf(newest.occurredAt), now)} — before the last visit`,
    source: 'weight',
    sourceLabel: 'from the record',
    isSafety: false,
  });
}

/** An instant's local calendar day, so `formatVisitDate` reads it in the owner's zone. */
function localDateKeyOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Refuse a row this module assembled if it turns a decline into a taste.
 *
 * Dropping is safe HERE and only here: none of the three assembled rows is a safety
 * statement, so its absence removes nothing the owner needs to be warned about. The
 * Signal's rows never reach this function — see `PREFERENCE_RE`.
 */
function screen(row: WorthRaisingRow): WorthRaisingRow | null {
  if (PREFERENCE_RE.test(row.text)) return null;
  if (row.detail && PREFERENCE_RE.test(row.detail)) return { ...row, detail: null };
  return row;
}
