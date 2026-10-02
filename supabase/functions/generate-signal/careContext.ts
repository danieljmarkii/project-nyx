// EN-10's context lines (Engines v3 PR-22, CUL-1420; docs/nyx-care-state-requirements.md §5).
//
// When a pet has had a vet visit, is on a diet trial or is on a medication course, the
// finding's screen says so beside its counts: "Since the Sep 16 visit, 11 days: 4 episodes,
// with something logged on 11 of 11." Each line is a WINDOW, a COUNT and the LOGGING behind
// it. It never compares one window with another and never attributes anything to the visit,
// the drug or the diet: regression to the mean alone gives a 20 to 30% fall after an owner
// acts at a peak (Goldenholz; the 2026-08 brief §3), so the honest shape is dates and counts.
//
// PURE and offline-tested (careContext.test.ts): no I/O, no clock. The pipeline runs it after
// decoration, behind `engines_v3_en10`, and only on a complete read. It decorates findings
// that are already true; it never runs a detector, so nothing here changes what fires or how
// it ranks.
//
// THE VISIT IS A DATE, NEVER A NUMBER (vet visits spec AC 10, amended 2026-09-28). The one
// visit fact this file takes is a day. Every count below is computed from events alone, from
// that day; the visit contributes no row, no count and no coverage day.
//
// WHERE A ZERO MAY NOT APPEAR (§5.1). A count of zero reads as "it worked", and a steroid can
// hide the very sign being counted. So a zero is withheld (the line states its window and
// logging and stops) whenever any of these holds:
//   • a drug that can MASK this sign is on board, or ended within MASK_TAIL_DAYS (42) (a steroid
//     keeps acting after the last dose, and a depot injection for weeks), or is a drug the
//     table cannot resolve (which fails toward disclosure like a systemic steroid). Every
//     line on the screen, not only the course's own. ⚠ Stricter than the spec's text, on
//     purpose: §5.1 scopes the rule to the drug's too-soon window (14 days until CUL-583
//     rules per drug); this holds it for as long as the course is on board, because a
//     steroid still masks on day 40. Raised as a better-than-the-rule brief on CUL-1420.
//     An ended course draws no line of its own; it only withholds the zeros.
//   • the window overlaps the 42 days after the last visit, because an injection given at the
//     visit (Depo-Medrol, maropitant, Cytopoint) never enters `medications`: the visit is taken
//   as an unrecorded masking drug, on every line. A window that starts at the visit always
//   overlaps, so the visit line never shows a zero.
//   • a masking course's span (start to end + 42 days) overlaps the window, so a window partly
//     under a steroid never reads as "none since".
//   • the logging behind it is thin: fewer days with anything logged than §4.2's current-window
//     floor (10 of 14) allows, scaled to the window. A zero over a record nobody kept is not a
//     zero.
//
// THE DRUG TABLE is a STUB for CUL-583's ruling sheet (§5.1): matched on the drug's NAME
// (the regimen's own `drug_name`, and the library item's generic and brand names), never on
// the free-text reason it was started for. A name the table cannot resolve shows beside every
// concern and masks every sign.

import { collapseToEpisodeOnsets } from '../../../lib/symptomEpisodes.ts'
import { localDayIndex, localDayIndexOf } from '../../../lib/utils.ts'
import { careClaimReason } from '../../../lib/careClaimScreens.ts'
import {
  assessCourse,
  courseEffectOn,
  maskingSpansFor,
  windowTouchesSpan,
  MASK_TAIL_DAYS,
  VISIT_NO_ZERO_DAYS,
  type MaskCourse,
} from '../../../lib/maskingSpans.ts'
import type { CareContextLine, Finding, SymptomEvent, SymptomType } from './detection.ts'
import { SYMPTOM_LABEL } from './phrasing.ts'

export {
  courseEffectOn,
  DRUG_CLASS_EFFECTS,
  DRUG_NAME_CLASSES,
  MASK_TAIL_DAYS,
  resolveDrugClasses,
  VISIT_NO_ZERO_DAYS,
  type DrugClass,
} from '../../../lib/maskingSpans.ts'

const MS_PER_DAY = 86_400_000

// ── The inputs ────────────────────────────────────────────────────────────────

/** The two facts the shell reads for EN-10 alone, only while the key is on. */
export interface CareContextFacts {
  /** `vet_visits.visited_at` (a DATE) of the most recent non-deleted visit before
   *  today, or null. A DAY: no clinic, vet, reason or note ever reaches the engine. */
  lastVisitOn: string | null
  /** `occurred_at` of every non-deleted event in the read window, of every type but the
   *  daily look's `check_in` parent (a look never enters another surface's coverage). The
   *  logging behind each line: "something logged", never "logged on" a sign. */
  loggedAt: readonly string[]
  /** The instant the pulls behind this run read from (the shell's lookback). A window that
   *  starts before it cannot be counted, so its line states the window and no count. */
  readSinceIso: string
}

/** A medication course, reduced to what the lines need. */
/** A medication course, reduced to what the lines need (the shared `MaskCourse`). */
export type CourseFact = MaskCourse

/** The running diet trial, or null. `running` is the pipeline's `isTrialRunning` (B-422). */
export interface TrialFact {
  startedOn: string
  targetDurationDays: number
  indication: string | null
  targetProtein: string | null
}

export interface CareContextArgs {
  facts: CareContextFacts
  symptoms: readonly SymptomEvent[]
  courses: readonly CourseFact[]
  trial: TrialFact | null
  timezone: string | undefined
  nowMs: number
  episodeGapHours: number
}

// ── The drug table and the spans (shared with the app, CUL-1440) ──────────────
// The table, `resolveDrugClasses`, `courseEffectOn`, the course placement and the span rule
// live in `lib/maskingSpans.ts`, so the Signal screen and Get ready withhold exactly the zeros
// these lines withhold. Re-exported here for the callers and tests that import them from here.

/** §4.2's current-window floor (10 of 14 days with anything logged), as a fraction. A zero
 *  shows only when the window's logging clears it. */
export const ZERO_COVERAGE_FLOOR = 10 / 14

/** The signs a trial's indication covers (§5.1). `other` covers none: the trial screen
 *  speaks for it. */
export function trialCovers(indication: string | null, sign: SymptomType): boolean {
  if (indication === 'gi') return sign === 'vomit' || sign === 'diarrhea'
  if (indication === 'skin') return sign === 'itch' || sign === 'scratch'
  return false
}

// The findings that carry lines (CUL-1140's scope: the chronicity and timing cards). Every one
// names a single sign; a safety card's plain face (S1) is untouched, because the lines are a
// field the client draws on the finding's own screen, never part of the card's sentence.
const LINE_BEARING = new Set<Finding['type']>([
  'symptom_chronicity',
  'postprandial_timing',
  'empty_stomach_timing',
  'timing_story',
  'timeofday_clustering',
])

export function signOf(f: Finding): SymptomType | null {
  if (!LINE_BEARING.has(f.type)) return null
  const s = (f as { symptomType?: unknown }).symptomType
  return typeof s === 'string' ? (s as SymptomType) : null
}

// ── Copy ──────────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** An epoch-day index as "Sep 16", with the year only when it is not today's year (C-19:
 *  a year-less date is safe only inside a bounded range, and these can cross a New Year). */
export function formatDay(dayIndex: number, todayIndex: number): string {
  const d = new Date(dayIndex * MS_PER_DAY)
  const t = new Date(todayIndex * MS_PER_DAY)
  const base = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
  return d.getUTCFullYear() === t.getUTCFullYear() ? base : `${base}, ${d.getUTCFullYear()}`
}

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
const episodes = (n: number) => `${n} ${n === 1 ? 'episode' : 'episodes'}`

function titleCase(protein: string): string {
  const p = protein.trim()
  return p.length === 0 ? p : p[0].toUpperCase() + p.slice(1)
}

// ── The computation ───────────────────────────────────────────────────────────

interface Window {
  /** First counted day (inclusive), as an epoch-day index on the owner's clock. */
  fromDay: number
  /** Days in the window, today included. */
  length: number
}

interface Counted {
  /** Episodes of the sign whose ONSET falls in the window, or null when the window starts
   *  before the read (it cannot be counted). */
  count: number | null
  /** Days in the window with anything logged, or null likewise. */
  logged: number | null
}

/**
 * Build the lines for one sign. Exported for the property tests; the pipeline reaches it
 * through `EN10_CONTEXT_STEP`.
 */
export function linesForSign(sign: SymptomType, args: CareContextArgs): CareContextLine[] {
  const tz = args.timezone
  const today = localDayIndex(args.nowMs, tz)
  const readFromMs = Date.parse(args.facts.readSinceIso)
  // The first local day the read covers IN FULL (the lookback instant usually lands mid-day).
  const firstFullDay = Number.isFinite(readFromMs) ? localDayIndex(readFromMs, tz) + 1 : Number.POSITIVE_INFINITY

  // ⑦'s episodes, collapsed over the whole read so a bout spanning a window's first day
  // counts once, by its onset (the chronicity lane's unit, §4.2).
  const onsetDays = collapseToEpisodeOnsets(
    args.symptoms
      .filter((e) => e.type === sign)
      .map((e) => Date.parse(e.occurredAt))
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => a - b),
    args.episodeGapHours,
  ).map((ms) => localDayIndex(ms, tz))
  const loggedDays = new Set<number>()
  for (const iso of args.facts.loggedAt) {
    const ms = Date.parse(iso)
    if (Number.isFinite(ms)) loggedDays.add(localDayIndex(ms, tz))
  }
  // A symptom row is an event too; counted even if the coverage read raced its write.
  for (const e of args.symptoms) {
    const ms = Date.parse(e.occurredAt)
    if (Number.isFinite(ms)) loggedDays.add(localDayIndex(ms, tz))
  }

  const count = (w: Window): Counted => {
    if (w.fromDay < firstFullDay) return { count: null, logged: null }
    const to = w.fromDay + w.length - 1
    let c = 0
    for (const d of onsetDays) if (d >= w.fromDay && d <= to) c += 1
    let k = 0
    for (let d = w.fromDay; d <= to; d += 1) if (loggedDays.has(d)) k += 1
    return { count: c, logged: k }
  }

  // Every course with what it can do to this sign, placed against today by the shared
  // `assessCourse` (the app's spans read the same placement, CUL-1440).
  const assessed = args.courses.map((c) => {
    const x = assessCourse(c, today, tz)
    // An owner's label that itself makes a care claim ("Cerenia (helped last time)") is never
    // printed; the library's name, or a plain noun, stands in (CUL-1271's screen).
    const fallback = c.names[0] ? c.names[0][0].toUpperCase() + c.names[0].slice(1) : 'A medication'
    const label = careClaimReason(c.drugLabel) === null ? c.drugLabel : fallback
    return { c, label, start: x.start, end: x.end, endKnown: x.endKnown, onBoard: x.onBoard, inTail: x.inTail, resolved: x.classes !== null, effect: courseEffectOn(x.classes, sign) }
  })

  // Where a zero may not appear for this sign: the shared span rule (`lib/maskingSpans.ts`),
  // every masking course from its start to its end plus the tail, and the visit as an
  // unrecorded masking drug. A window that OVERLAPS any span withholds its zero, so a window
  // partly under a steroid never reads as "none since".
  const visitOn = args.facts.lastVisitOn
  const v = visitOn ? localDayIndexOf(visitOn, tz) : null
  const maskSpans = maskingSpansFor(sign, { courses: args.courses, lastVisitOn: visitOn, todayIndex: today, timeZone: tz })

  // A zero is withheld (§5.1, the header): in a window a masking span overlaps, or on a thinly
  // logged window.
  const zeroWithheld = (c: Counted, w: Window): boolean =>
    c.count === 0 &&
    (windowTouchesSpan(maskSpans, w.fromDay, w.fromDay + w.length - 1) ||
      (c.logged as number) < ZERO_COVERAGE_FLOOR * w.length)

  const lines: CareContextLine[] = []

  // 1. Courses, above the trial, so the diet is never the first explanation a reader meets. A
  //    course on board draws its window; one ended inside its tail draws its dates, and no
  //    count, because it still acts on what is counted below it.
  const drawn = assessed
    .filter((x) => (x.onBoard || x.inTail) && x.effect.shown)
    .sort((a, b) => (a.start as number) - (b.start as number) || a.label.localeCompare(b.label))
  for (const { c, label, start, end, onBoard, endKnown, effect, resolved } of drawn) {
    const s = start as number
    // D3 (CUL-1440): a course that can hide the sign says so on every form of its line, so the
    // line's SHAPE never gives a zero away (the count-less form used to print only at zero) and
    // "Most recent 8 days ago" beside it is read with the drug in view. A name the table cannot
    // resolve masks like a steroid, and says "may": the app does not know what it is.
    const hides = effect.masks ? ` It ${resolved ? 'can' : 'may'} hide ${SYMPTOM_LABEL[sign]}.` : ''
    const on = formatDay(s, today)
    const anchorOn = c.startedOn as string
    if (!onBoard) {
      const to = end as number
      // No end date on record: say it stopped, never an end the record does not hold.
      const text = (!endKnown ? `${label} since ${on}, stopped.` : to > s ? `${label}, ${on} to ${formatDay(to, today)}.` : `${label}, ${on}.`) + hides
      lines.push({ kind: 'course', anchorOn, days: to - s + 1, count: null, loggedDays: null, drugLabel: label, text })
      continue
    }
    const n = today - s
    if (n < 1) {
      lines.push({ kind: 'course', anchorOn, days: 0, count: null, loggedDays: null, drugLabel: label, text: `${label} since ${on}.${hides}` })
      continue
    }
    // Counted from the day after the start: the start day's episodes may predate the first dose.
    const w = { fromDay: s + 1, length: n }
    const got = count(w)
    if (got.count === null) {
      lines.push({ kind: 'course', anchorOn, days: n, count: null, loggedDays: null, drugLabel: label, text: `${label} since ${on}, ${days(n)}.${hides}` })
    } else if (zeroWithheld(got, w)) {
      lines.push({
        kind: 'course', anchorOn, days: n, count: null, loggedDays: got.logged, drugLabel: label,
        text: `${label} since ${on}, ${days(n)}, with something logged on ${got.logged} of ${n}.${hides}`,
      })
    } else {
      lines.push({
        kind: 'course', anchorOn, days: n, count: got.count, loggedDays: got.logged, drugLabel: label,
        text: `${label} since ${on}, ${days(n)}: ${episodes(got.count)}, with something logged on ${got.logged} of ${n}.${hides}`,
      })
    }
  }

  // 2. The trial, only on a sign its indication covers, and only up to its target's last day.
  //    Past it the pipeline may still BELIEVE the trial runs (the B-422 grace), but the grace
  //    never reaches evidence: those days may be a re-challenge. The trial screen speaks then.
  const trial = args.trial
  if (trial && trialCovers(trial.indication, sign)) {
    const s = localDayIndexOf(trial.startedOn, tz)
    const target = Math.floor(trial.targetDurationDays)
    if (s !== null && s <= today && Number.isFinite(target) && target > 0 && today <= s + target - 1) {
      const d = today - s + 1 // "day d": the start day is day 1
      const name = trial.targetProtein && trial.targetProtein.trim() ? `${titleCase(trial.targetProtein)} trial` : 'Diet trial'
      const head = `${name}, day ${d} of ${target}`
      const w = { fromDay: s, length: d }
      const got = count(w)
      const base = { kind: 'trial' as const, anchorOn: trial.startedOn, days: d }
      if (got.count === null) {
        lines.push({ ...base, count: null, loggedDays: null, text: `${head}.` })
      } else if (zeroWithheld(got, w)) {
        lines.push({ ...base, count: null, loggedDays: got.logged, text: `${head}, with something logged on ${got.logged} of its ${days(d)}.` })
      } else {
        lines.push({
          ...base, count: got.count, loggedDays: got.logged,
          text: `${head}: ${episodes(got.count)} in its ${days(d)}, with something logged on ${got.logged}.`,
        })
      }
    }
  }

  // 3. The last visit. A DATE: it starts a window and contributes nothing to what is counted.
  if (visitOn && v !== null && v < today) {
    const n = today - v
    const recent = n <= VISIT_NO_ZERO_DAYS
    const on = formatDay(v, today)
    // Counted from the day after: the visit day's own episodes may be why they went.
    const w = { fromDay: v + 1, length: n }
    const got = count(w)
    const disclosure = recent ? ' Anything given at the visit isn\'t in the record.' : ''
    const base = { kind: 'visit' as const, anchorOn: visitOn, days: n }
    if (got.count === null) {
      lines.push({ ...base, count: null, loggedDays: null, text: `Since the ${on} visit, ${days(n)}.${disclosure}` })
    } else if (zeroWithheld(got, w)) {
      lines.push({ ...base, count: null, loggedDays: got.logged, text: `Since the ${on} visit, ${days(n)}, with something logged on ${got.logged} of ${n}.${disclosure}` })
    } else {
      lines.push({
        ...base, count: got.count, loggedDays: got.logged,
        text: `Since the ${on} visit, ${days(n)}: ${episodes(got.count)}, with something logged on ${got.logged} of ${n}.${disclosure}`,
      })
    }
  }

  return lines
}

/** A step that decorates the pipeline's findings; the flag-off guard hands in its own. */
export type CareContextStep = <T extends { finding: Finding }>(findings: T[], args: CareContextArgs) => T[]

/**
 * EN-10's step: each line-bearing finding gains `careContext` when it has at least one line.
 * A finding with none, and every other type, is returned as it was (byte-identical).
 */
export const EN10_CONTEXT_STEP: CareContextStep = (findings, args) =>
  findings.map((r) => {
    const sign = signOf(r.finding)
    if (sign === null) return r
    const lines = linesForSign(sign, args)
    return lines.length > 0 ? { ...r, finding: { ...r.finding, careContext: lines } } : r
  })
