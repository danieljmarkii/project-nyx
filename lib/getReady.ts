import { visibleFindings } from './signalVisible';
import { isStoodDown } from './signalCopy';
import {
  splitPastCourses,
  pastMedTileValue,
  pastMedEndDetail,
  resolveCourseName,
} from './rundown';
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
export type WorthRaisingSource = 'signal' | 'intake' | 'trial' | 'course' | 'weight';

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
  /**
   * The DEVICE-LOCAL intake-decline headline (`TrialCardInput.intakeDeclineHeadline`),
   * or null. Separate from `trialStrip` because `resolveTrialStrip` deliberately
   * DISCARDS it — see `intakeRow`.
   */
  intakeDeclineHeadline: string | null;
  /** The rundown built for this same screen — quoted, and the source of `facts`. */
  rundown: Rundown;
  nowMs: number;
}

export function buildWorthRaising(input: WorthRaisingInput): WorthRaising {
  const signalRows = buildSignalRows(input);
  // The trial leads the optional rows, the Signal's insight findings follow, and the
  // course and the weight gap come last.
  //
  // Why the insights sit ABOVE the course and the weight rather than below everything
  // (the first cut) — the adversarial pass measured it: with a trial, an unterminated
  // course and a weight gap all present, three of four slots went to the two weakest
  // rows and an ESTABLISHED food–symptom correlation, the most actionable thing the app
  // can say, never reached the page.
  //
  // Why the trial still outranks them: a wedge owner at a RECHECK for the trial, whose
  // Signal carries four benign findings, would otherwise open this page and find no
  // mention of the trial the appointment is about.
  //
  // A STOOD-DOWN MARKER STAYS IN, and that was reconsidered rather than assumed. It
  // ranks at the TOP of the insight band (`generate-signal/standDown.ts` puts it at
  // `max(formerRank, safetyCount)`), so the first instinct on seeing it displace a
  // correlation was to drop the whole class as "an absence, not a thing to raise".
  // That is wrong on the clinical read and the issue says so directly: the marker's
  // own copy refuses to reassure (*"That isn't an all-clear"*), and "the vomiting has
  // been quiet a fortnight" is exactly what a vet wants at a recheck for vomiting.
  // The ORDER is what fixes the displacement — the two weakest rows yield, not the
  // Signal's band.
  const optional = [
    trialRow(input.trialStrip),
    ...signalRows.filter((r) => !r.isSafety),
    courseRow(
      input.rundown.facts.courses,
      input.rundown.facts.medItemNames,
      // The RUNDOWN's clock, not a fresh one. `splitPastCourses` windows at 12 months,
      // and reading `Date.now()` here opened a second window over the population the
      // block below already split — seconds wide, and enough for Worth raising to
      // disagree with the rows printed under it about which courses exist.
      input.rundown.generatedAtMs,
    ),
    weightRow(input.rundown),
  ].filter((r): r is WorthRaisingRow => r !== null);

  // THE PARTITION IS THE SAFETY RULE. Every safety row leads and sits ABOVE the cap;
  // the cap applies to `optional` alone. The server already ranks safety first, so in
  // every ordinary case this is also the server's order — but it holds even if the
  // engine ever ranked a benign finding higher, which is what AC 5 requires.
  //
  // The device-local decline joins them, AHEAD of the server's, because it is the row
  // that survives when the server cannot be reached at all (see `intakeRow`).
  const localIntake = intakeRow(input.intakeDeclineHeadline);
  const safety = [...(localIntake ? [localIntake] : []), ...signalRows.filter((r) => r.isSafety)];
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
  // AT MOST ONE STAND-DOWN MARKER. They are ABSENCE statements — *"Vomiting has been
  // quiet for 14 days. That isn't an all-clear."* — and one is useful context at a
  // recheck, which is why the class is not dropped (the issue's own counterexample
  // expects it quoted). Two is not: `mergeStandDowns` ranks every marker at the TOP of
  // the insight band, so a GI pet whose chronic vomiting AND chronic loose stool both
  // quieted during the trial — the wedge case exactly — spent two capped slots saying
  // nothing happened, and pushed an ESTABLISHED food–symptom correlation off a page
  // where it appears nowhere else. The rundown block has a tile for timing and none for
  // a correlation; the correlation is the row with no second home.
  let standDowns = 0;
  return visibleFindings(input.findings, input.suppressTrialResponse, input.nowMs)
    .filter((f) => !isStoodDown(f.finding) || ++standDowns <= 1)
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

/**
 * The device's OWN intake-decline flag — the one row here that does not need the
 * network, and the reason this function exists at all.
 *
 * `resolveTrialStrip` discards `intakeDeclineHeadline` on purpose: on Home the Signal
 * card ABOVE the trial strip owns that statement, so repeating it in the strip would
 * say the same thing twice. **Get ready has no Signal card above it.** So passing only
 * `resolveTrialStrip(trialInput)` dropped the headline entirely — and dropped it
 * hardest in the state where it is the only safety fact available, because the Signal's
 * findings come from a network cache and this comes from SQLite.
 *
 * The measured shape (adversarial re-run): a cat on day 12 of a hydrolyzed trial whose
 * device holds `consecutive_low`, `daysBelowBaseline: 3` — the 48-hour feline hepatic-
 * lipidosis window — with the cache unreachable. Worth raising rendered one row, the
 * trial's day count, under a gap line asserting that the local half of this page was
 * COMPLETE. It was not.
 *
 * `isSafety: true` and above the cap, like any other safety row. Quoted verbatim from
 * the same object `trialRow` quotes, so the two cannot disagree about the same pet.
 */
function intakeRow(headline: string | null): WorthRaisingRow | null {
  if (!headline) return null;
  return {
    id: 'intake-decline',
    text: headline,
    detail: null,
    source: 'intake',
    sourceLabel: 'from this device’s record',
    isSafety: true,
  };
}

/** The running trial, in the Home strip's own words. */
function trialRow(strip: TrialStripModel | null): WorthRaisingRow | null {
  if (!strip) return null;
  // Not screened: every character here is the Home trial strip's own, rendered
  // unscreened there and quoted unchanged here (see `screen`).
  return {
    id: 'trial',
    // "Diet trial · day 23 of 56". `line` is null while a safety flag is live on the
    // strip, and the row is header-only then rather than borrowing another line.
    text: strip.header,
    detail: strip.line,
    source: 'trial',
    sourceLabel: 'from the trial',
    isSafety: false,
  };
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
  // WHAT "no end recorded" CAN ACTUALLY MEAN, worked out the hard way across two
  // adversarial passes — the first found the row over-firing, the second found the
  // correction had killed it outright.
  //
  // `splitPastCourses` drops active courses (the Current-meds block owns them), and for
  // a REGIMEN `end.kind === 'ended'` ⟺ `status ∈ {completed, stopped}` ⟺ `!isActive`.
  // So among the shown courses, a regimen ALWAYS has an owner-recorded end, and
  // `source === 'regimen' && end.kind !== 'ended'` is UNSATISFIABLE for every state the
  // database can hold. It rendered nothing at all — and took `screen()`, the runtime
  // half of AC 5's preference guard, down with it, since this is its only call site.
  //
  // A dose-derived course is therefore the only thing the H1 register can ever show as
  // "No end recorded" — which is what the source set names. The first pass's objection
  // stands and is answered by the COUNT, not by the kind: one Cerenia tablet given
  // yesterday is a PRN dose and the question *is she still meant to be on this?* is
  // fabricated about it; nine doses across five weeks with no regimen behind them is a
  // pattern nobody wrote down, and that is exactly the thing to say out loud. `>= 2` is
  // the plainest boundary between a one-off and a repeat, and it is the course's OWN
  // count (`dosesLogged`, quoted), not a threshold over a window.
  //
  // Residual, stated rather than hidden: a genuinely open regimen — the steroid started
  // in July and never ended — is `status = 'active'`, so it sits in Current meds and
  // never reaches here. Raising every active course would fire for every medicated pet.
  // Filed rather than invented.
  //
  // `.find` rather than `[0]`, and no early return on an unnameable row: an earlier cut
  // returned null when it could not name a course, so a nameless orphan SUPPRESSED the
  // one behind it while the block below named them both.
  const course = shown.find((c) => c.source === 'doses' && c.dosesLogged >= 2);
  if (!course) return null;
  return screen({
    id: `course-${course.key}`,
    // `resolveCourseName` is the RUNDOWN's own namer, exported rather than reimplemented.
    // The first cut had a private copy without its `?? 'Medication'` fallback, which is
    // how the two surfaces came to disagree about whether a course had a name at all.
    text: `${resolveCourseName(course, names)} — ${pastMedTileValue(course)}`,
    detail: pastMedEndDetail(course),
    source: 'course',
    sourceLabel: 'from the course',
    isSafety: false,
  });
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
 *      Bounded to a visit STRICTLY BEFORE TODAY, the report's own rung-1 rule: the
 *      date behind it is an unbounded `MAX(visited_at)`, and a future-dated row made
 *      the gate fire over a pet weighed an hour ago.
 *
 * Gate 2 fires only for a pet with a logged prior visit, so a first-time owner sees
 * it only through gate 1. That under-fires rather than over-claims, which is the
 * direction this page is allowed to be wrong in.
 *
 * What the row PRINTS is a date, never a duration (C-19): a record-anchored date
 * costs nothing, while "no weigh-in in 94 days" is a duration that would inherit
 * whichever window produced it.
 */
function weightRow(rundown: Rundown): WorthRaisingRow | null {
  const tile = rundown.tiles.find((t: RundownTile) => t.key === 'weight');
  if (!tile) return null;
  const { weighIns, lastVisitAt } = rundown.facts;

  // GATE 1 is answered by the TILE, not by the readings — quoted, never re-derived.
  // `buildRundown` sets `empty` on exactly the branch whose value is "No weigh-ins
  // logged", so this asks the rundown whether it is saying there is nothing, rather
  // than asking the readings and printing a sentence composed from something else.
  if (tile.empty === true) {
    // Not screened: the rundown's own tile value, quoted (see `screen`).
    return {
      id: 'weight-none',
      text: tile.value,
      detail: null,
      source: 'weight',
      sourceLabel: 'from the record',
      isSafety: false,
    };
  }

  if (!lastVisitAt || weighIns.length === 0) return null;
  // Oldest-first from `getWeightHistory`, so the last element is the newest reading.
  const newest = weighIns[weighIns.length - 1];
  const newestMs = Date.parse(newest.occurredAt);
  // A visit is a DATE with no time; comparing against the START of its own day means a
  // weigh-in taken later the same day as the visit counts as "since", which is the
  // reading the owner would give it.
  const visitMs = Date.parse(`${lastVisitAt}T00:00:00`);
  if (Number.isNaN(newestMs) || Number.isNaN(visitMs)) return null;

  // A FUTURE-DATED VISIT IS NOT "THE LAST VISIT" (adversarial pass). `facts.lastVisitAt`
  // is `readLastVisitDate`'s unbounded `MAX(visited_at)` — the reader migration 066 and
  // CLAUDE.md both name as undefended — so a visit row dated tomorrow made this gate
  // fire against a pet weighed an hour ago and print "Last weighed Sep 11 — before the
  // last visit" on a page that also says the visit has not happened. Live today via
  // CUL-946, which serialises `visited_at` through `toISOString()` and stores every
  // evening's visit as tomorrow.
  //
  // The bound is the report's own rung 1 — STRICTLY BEFORE TODAY (`report.ts` skips
  // today- and future-dated visits) — so this page and the document it hands the vet
  // agree about which visit is the last one.
  // THE RUNDOWN'S CLOCK, like every other read in this module. A fresh `new Date()`
  // here was a THIRD clock (the re-run found it): the gate judged "today" on the wall
  // clock while the sentence below printed its date off `generatedAtMs`, so the two
  // could disagree for any caller that passes `buildRundown` an explicit `nowMs` — and
  // it made the CUL-946 bound impossible to pin with a fixture.
  const startOfToday = new Date(rundown.generatedAtMs);
  startOfToday.setHours(0, 0, 0, 0);
  if (visitMs >= startOfToday.getTime()) return null;

  if (newestMs >= visitMs) return null;

  const when = formatVisitDate(localDateKeyOf(newest.occurredAt), new Date(rundown.generatedAtMs));
  return {
    id: 'weight-stale',
    // THE CLAIM LEADS, the range supports it (Dr. Chen's lens, adversarial pass). The
    // first cut put `tile.value` here — so read aloud, item four of *Worth raising* was
    // "8.6–9.4 lb", a range over up to sixty readings, with the actual thing worth
    // raising in tertiary fine print underneath.
    //
    // Both halves are still record-anchored: a DATE, and the order of two dates the
    // record already holds. No duration is stated and no window is opened (C-19).
    text: `Last weighed ${when} — before the last visit`,
    detail: tile.detail ? `${tile.value} · ${tile.detail}` : tile.value,
    source: 'weight',
    sourceLabel: 'from the record',
    isSafety: false,
  };
}

/** An instant's local calendar day, so `formatVisitDate` reads it in the owner's zone. */
function localDateKeyOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Refuse a row whose text THIS MODULE composed, if it turns a decline into a taste.
 *
 * ── WHAT IT COVERS, AND WHY THAT IS NARROWER THAN THE FIRST CUT ──────────────────
 * Exactly one row is composed here: the course row's `${name} — ${value}` join, where
 * owner free-text (a drug name) meets a string this module wrote. Everything else is
 * QUOTED VERBATIM from a module that renders the same sentence elsewhere on the same
 * screen — the trial strip's header and line, the rundown's weight tile — and
 * screening those here would mean Worth raising silently disagreeing with the identical
 * string printed two hundred pixels below it. Quoted, never re-derived, applies to the
 * screen as much as to the counts.
 *
 * That narrowing came from a measured harm, not from principle alone. The blanket
 * version nulled the DETAIL of any tripping row — so a trial whose food is called
 * "the kibble she prefers" lost its coverage denominator (*meals logged on 20 of 23
 * days*), silently, with no test and no way for the owner to know a number had been
 * removed. A screen that deletes evidence to avoid a word is the wrong trade on a page
 * a clinician reads.
 *
 * Dropping the whole row is safe here and only here: the course row is not a safety
 * statement, so its absence warns nobody of nothing. The Signal's rows never reach this
 * function at all — see `PREFERENCE_RE`.
 */
function screen(row: WorthRaisingRow): WorthRaisingRow | null {
  return PREFERENCE_RE.test(row.text) ? null : row;
}
