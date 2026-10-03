// EN-9's care state (Engines v3 PR-23, CUL-1417; docs/nyx-care-state-requirements.md §3–§4,
// the C1a co-signs in docs/clinical-ruling-sheet-2026-10.md §2.0a).
//
// A recurring concern (a chronicity or worsening SAFETY finding about one sign) is raised: Home
// asks for the vet. When the owner says the vet knows, the concern moves to `with_vet` and
// stops asking. It comes back (`raised_again`) only on a TESTED CHANGE in the record, never on a
// timer, never on one bad day, and once back it stays back until the owner answers again.
//
// PURE and offline-tested (careState.test.ts): no I/O, no clock. The pipeline runs it last,
// behind `engines_v3_en9`, on a complete read only. It reads what the shell read (the owner's
// answers, the trial or course an answer names, lethargy instants) and the events detection
// already read. It never runs a detector and never touches an ESCALATION: an incident red flag,
// an intake decline, the burden card or any other safety finding that is not a concern keeps
// its sentence, its ask and every rank it had, or a better one (§3.1, AC-3).
//
// WHAT AN ANSWER IS. A dated fact the owner caused about ONE sign (§3.2). A visit alone is
// nothing; no visit, appointment or answer enters a count, a floor, a window or a statistic
// (AC 10 as amended). Every number below is computed from events, from a DATE the answer names.
//
// HOW THE TESTS STAY HONEST WITHOUT MEMORY. The engine keeps no table of its own, so the re-raise
// is recomputed from the record on every run: each past evening since the answer is evaluated as
// the daily run would have evaluated it, and the persistence rule (fire at t and again within
// t+7..t+14, no evening between below the coverage floor) is applied over those evenings. A run
// that missed an evening therefore changes nothing. Two things the record cannot always rebuild
// are carried from the previous cache row, and only in the LOUDER direction: the latch (a prior
// `raised_again` for the same answer stays) and the frozen reference (§4.2: stored once,
// disclosed, never re-derived, so a relabelled cat is compared against what was frozen). The
// prior row is owner-writable (ai_signals_owner), so nothing read from it may quiet a concern:
// a carried reference is used only when the record can no longer rebuild one.
//
// KNOWN GAPS, stated (C-38). A pet that never improves never re-raises in v1 (§4.1, CUL-1290).
// `recheck_booked` needs to know an appointment is ABOUT the sign, which the shell may not read
// under AC 10 (CUL-1531): the pure rule is here, and the shell passes no appointments. The
// weight fact line (§4.1) is EN-8's gate and is not built here. Source 3 of C1a (the intake
// predicate) waits on GAP-28's shared module.

import { collapseToEpisodeOnsets } from '../../../lib/symptomEpisodes.ts'
import { localDayIndex, localDayIndexOf } from '../../../lib/utils.ts'
import { careClaimReason } from '../../../lib/careClaimScreens.ts'
import { maskingSpansFor, windowTouchesSpan, type MaskCourse } from '../../../lib/maskingSpans.ts'
import type { Finding, SymptomEvent, SymptomType } from './detection.ts'
import { SYMPTOM_LABEL, templateForFinding } from './phrasing.ts'
import { formatDay, ZERO_COVERAGE_FLOOR } from './careContext.ts'

const MS_PER_DAY = 86_400_000

// ── The knobs (PR-16 sets them from the measured frontier, §0.3) ──────────────────────

export interface CareStateConfig {
  /** §4.2 one-sided significance. PR-16's grid: {0.05, 0.1}. */
  alpha: number
  /** §4.2 minimum rate ratio, current over reference. PR-16's grid: {1.5, 2}. */
  rateRatio: number
  /** §4.2 reference window length, days. PR-16's grid: {28, 56}. */
  referenceDays: number
  /** §4.2 days with anything logged the reference must reach (20 of 28, scaled). */
  referenceFloor: number
  /** §4.2 current window and its floor: the last 14 days, logged on at least 10. */
  currentDays: number
  currentFloor: number
  /** §4.2 persistence: the second firing comes 7 to 14 days after the first. */
  persistMinDays: number
  persistMaxDays: number
  /** §4.3 the dense-day arm: the sign on at least this many of the last `denseWindowDays`. */
  denseDayFloor: number
  denseWindowDays: number
  /** C1a: a co-sign returns a watched concern on at least this many local days in the current
   *  window. PR-16 sets it inside the 5% cap; 2 is the ruled minimum ("never one day"). */
  coSignMinDays: number
  /** C1a "new": no row of the co-sign in this many days before the answer's anchor. */
  coSignNewDays: number
  /** §3.2 a vet-started course with no target lapses this many days after the answer. */
  courseNoTargetCapDays: number
  /** §3.2 a vet-started course lapses this many days after its last logged dose. */
  courseAfterLastDoseDays: number
}

export const CARE_STATE_CONFIG: CareStateConfig = {
  // The quieter corner of PR-16's starting grid: the 5% cap on false returns binds first (§0.3),
  // and the burden card and the dense-day arm are the net for fast worsening (§4.4).
  alpha: 0.05,
  rateRatio: 2,
  referenceDays: 28,
  referenceFloor: 20,
  currentDays: 14,
  currentFloor: 10,
  persistMinDays: 7,
  persistMaxDays: 14,
  denseDayFloor: 4,
  denseWindowDays: 7,
  coSignMinDays: 2,
  coSignNewDays: 28,
  courseNoTargetCapDays: 56,
  courseAfterLastDoseDays: 14,
}

// ── The inputs ────────────────────────────────────────────────────────────────

export type AckSource = 'at_vet_tick' | 'visit_answer' | 'my_vet_knows' | 'vet_started_trial' | 'vet_started_course'

/** The trial a `vet_started_trial` answer names (diet_trials, by explicit columns). */
export interface AckTrialScope {
  startedOn: string
  /** `ended_at`, the day it stopped or completed, or null while it runs. */
  endedOn: string | null
  /** `target_duration_days_initial`, else the current target: an extension re-asks (§3.2). */
  initialTargetDays: number | null
}

/** The course a `vet_started_course` answer names (medications, by explicit columns). */
export interface AckCourseScope {
  /** The regimen's `drug_name`, for "{pet's} vet started {drug} for it". */
  drugLabel: string | null
  startedOn: string | null
  endedOn: string | null
  status: string | null
  /** Whether the course carries a target (days or doses). No target ⇒ the 56-day cap. */
  hasTarget: boolean
  /** `occurred_at` of its newest given or partial dose, or null when none is logged. */
  lastDoseAt: string | null
}

/** One row of `care_acknowledgements`, with the scope its source names. */
export interface AckFact {
  id: string
  sign: SymptomType
  source: AckSource
  /** The visit day, the tap day, or the trial / course start (a local DATE). */
  anchorOn: string
  /** When the owner wrote it. Co-sign rows must postdate it, and the latch reads it. */
  createdAt: string
  /** Set on a retraction row: the answer it takes back. A retraction is never an answer. */
  retracts: string | null
  trial: AckTrialScope | null
  course: AckCourseScope | null
}

/** An upcoming appointment, reduced to dates and the signs it is about (§4.7). */
export interface AppointmentFact {
  id: string
  scheduledAt: string
  cancelledAt: string | null
  deletedAt: string | null
  /** The signs the appointment is about. The shell cannot read this under AC 10 (CUL-1531),
   *  so production passes no appointments; the rule is built so the read can land alone. */
  aboutSigns: readonly SymptomType[]
}

/** What the shell read for EN-9, only while `engines_v3_en9` is on. */
export interface CareRecord {
  acknowledgements: readonly AckFact[]
  appointments: readonly AppointmentFact[]
  /** `occurred_at` of every non-deleted `lethargy` row in the read window (C1a source 2). */
  lethargyAt: readonly string[]
}

export const EMPTY_CARE_RECORD: CareRecord = { acknowledgements: [], appointments: [], lethargyAt: [] }

export interface CareStateArgs {
  record: CareRecord
  symptoms: readonly SymptomEvent[]
  /** Every event instant in the read (EN-10's `loggedAt`): "days with anything logged". */
  loggedAt: readonly string[]
  /** The instant the pulls read from. A window before it is not counted. */
  readSinceIso: string
  /** The last visit before today, a DATE (EN-10's read), or null. A zero is withheld near it. */
  lastVisitOn: string | null
  courses: readonly MaskCourse[]
  timezone: string | undefined
  nowMs: number
  petName: string
  episodeGapHours: number
  /** ⑦'s recency floor for the sign (`chronicityFloorsFor(...).ongoingRecencyDays`). */
  recencyDaysFor: (sign: SymptomType) => number
  /** The previous cache row's findings, untyped (the latch and the frozen reference). */
  priorFindings: unknown
  /** When the previous row was generated, or null. */
  priorGeneratedAtMs: number | null
  config?: CareStateConfig
}

// ── The output ────────────────────────────────────────────────────────────────

export type CareStateValue = 'raised' | 'with_vet' | 'recheck_booked' | 'raised_again'
export type ReRaiseReason = 'rate' | 'dense' | 'co_sign' | 'pair'

/** The frozen reference (§4.2): its window, as epoch-day indexes, and what it counted. */
export interface CareReference {
  fromDay: number
  toDay: number
  episodes: number
  loggedDays: number
  /** True when it was taken before the anchor; false when it was the first window after. */
  beforeAnchor: boolean
}

/** The `careState` field on a concern finding. Absent on every finding flag-off. */
export interface CareStateFact {
  state: CareStateValue
  /** The live answer this state rests on; null on `raised`. */
  ackId: string | null
  source: AckSource | null
  anchorOn: string | null
  reference: CareReference | null
  /** Set on `raised_again`: which test brought it back. */
  reason: ReRaiseReason | null
  /** Set on `recheck_booked`: the appointment's day. */
  recheckOn: string | null
  /** The cached sentence for this state, template-only (AC 8). Null on `raised`: the lane's own
   *  sentence stands, phrased as it always was. */
  text: string | null
}

export type WithCareState<F extends Finding = Finding> = F & { careState?: CareStateFact }

// ── Small helpers ─────────────────────────────────────────────────────────────

const CONCERN_TYPES = new Set<Finding['type']>(['symptom_chronicity', 'symptom_worsening'])

/** A concern is a chronicity or worsening SAFETY finding: one sign, one care state (§3.1). */
export function concernSignOf(f: Finding): SymptomType | null {
  if (!CONCERN_TYPES.has(f.type) || f.priorityClass !== 'safety') return null
  const s = (f as { symptomType?: unknown }).symptomType
  return typeof s === 'string' ? (s as SymptomType) : null
}

/** `with_vet` and `recheck_booked`: the two states that carry no ask. */
export function isWatched(state: CareStateValue | null | undefined): boolean {
  return state === 'with_vet' || state === 'recheck_booked'
}

export function careStateOf(f: Finding): CareStateFact | null {
  const c = (f as { careState?: unknown }).careState
  return c && typeof c === 'object' ? (c as CareStateFact) : null
}

/** The cached sentence for a finding's care state, or null when the lane's own stands. */
export function careStateText(f: Finding): string | null {
  const c = careStateOf(f)
  return c && typeof c.text === 'string' && c.text.length > 0 ? c.text : null
}

const possessive = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// ── The exact conditional binomial (§4.2) ─────────────────────────────────────

const LOG_FACT: number[] = [0]
function logFact(n: number): number {
  for (let i = LOG_FACT.length; i <= n; i += 1) LOG_FACT[i] = LOG_FACT[i - 1] + Math.log(i)
  return LOG_FACT[n]
}

/** P(X ≥ a) for X ~ Binomial(n, q). Exact; n here is tens of episodes. */
export function binomialUpperTail(a: number, n: number, q: number): number {
  if (a <= 0) return 1
  if (a > n) return 0
  if (q <= 0) return 0
  if (q >= 1) return 1
  let p = 0
  for (let k = a; k <= n; k += 1) {
    p += Math.exp(logFact(n) - logFact(k) - logFact(n - k) + k * Math.log(q) + (n - k) * Math.log(1 - q))
  }
  return Math.min(1, p)
}

/**
 * The Poisson rate comparison, as the exact conditional binomial (§4.2): given n = a + b episodes
 * over logged days Lc (current) and Lr (reference), a ~ Binomial(n, Lc / (Lc + Lr)) under no
 * change; one-sided for excess. Fires when p < α AND the current rate is at least r × the
 * reference rate (a·Lr ≥ r·b·Lc, so a reference of zero episodes needs only the p-value).
 */
export function rateTestFires(a: number, b: number, lc: number, lr: number, cfg: CareStateConfig): boolean {
  if (lc <= 0 || lr <= 0) return false
  if (a * lr < cfg.rateRatio * b * lc) return false
  return binomialUpperTail(a, a + b, lc / (lc + lr)) < cfg.alpha
}

// ── The record, indexed by local day ──────────────────────────────────────────

interface DayIndex {
  today: number
  /** The first local day the read covers in full. */
  firstFullDay: number
  /** Episode onsets per local day, for one sign (⑦'s 3 h collapse, §4.2's unit). */
  onsets: (sign: SymptomType) => number[]
  /** Distinct local days carrying a row of the sign (the dense-day arm's unit). */
  signDays: (sign: SymptomType) => Set<number>
  /** Distinct local days with anything logged. */
  logged: Set<number>
}

function indexRecord(args: CareStateArgs): DayIndex {
  const tz = args.timezone
  const today = localDayIndex(args.nowMs, tz)
  const readFromMs = Date.parse(args.readSinceIso)
  const firstFullDay = Number.isFinite(readFromMs) ? localDayIndex(readFromMs, tz) + 1 : Number.POSITIVE_INFINITY
  const logged = new Set<number>()
  for (const iso of args.loggedAt) {
    const ms = Date.parse(iso)
    if (Number.isFinite(ms)) logged.add(localDayIndex(ms, tz))
  }
  for (const e of args.symptoms) {
    const ms = Date.parse(e.occurredAt)
    if (Number.isFinite(ms)) logged.add(localDayIndex(ms, tz))
  }
  const onsetCache = new Map<SymptomType, number[]>()
  const dayCache = new Map<SymptomType, Set<number>>()
  const msOf = (sign: SymptomType) =>
    args.symptoms.filter((e) => e.type === sign).map((e) => Date.parse(e.occurredAt)).filter((ms) => Number.isFinite(ms)).sort((x, y) => x - y)
  return {
    today,
    firstFullDay,
    logged,
    onsets: (sign) => {
      let v = onsetCache.get(sign)
      if (!v) {
        v = collapseToEpisodeOnsets(msOf(sign), args.episodeGapHours).map((ms) => localDayIndex(ms, tz))
        onsetCache.set(sign, v)
      }
      return v
    },
    signDays: (sign) => {
      let v = dayCache.get(sign)
      if (!v) {
        v = new Set(msOf(sign).map((ms) => localDayIndex(ms, tz)))
        dayCache.set(sign, v)
      }
      return v
    },
  }
}

function countIn(days: readonly number[], from: number, to: number): number {
  let c = 0
  for (const d of days) if (d >= from && d <= to) c += 1
  return c
}
function loggedIn(logged: Set<number>, from: number, to: number): number {
  let k = 0
  for (let d = from; d <= to; d += 1) if (logged.has(d)) k += 1
  return k
}

// ── The live answer (§3.2) ────────────────────────────────────────────────────

/**
 * The first onset of the sign's CURRENT course: the first episode after the last quiet gap long
 * enough that ⑦ stopped firing (its recency floor). An answer given before it belongs to an
 * earlier course and lapsed at that stand-down (§3.2, AC 14). Null when no episode is in the read.
 */
export function courseStartMs(args: CareStateArgs, sign: SymptomType): number | null {
  const ms = collapseToEpisodeOnsets(
    args.symptoms.filter((e) => e.type === sign).map((e) => Date.parse(e.occurredAt)).filter((x) => Number.isFinite(x)).sort((x, y) => x - y),
    args.episodeGapHours,
  )
  if (ms.length === 0) return null
  const gapMs = (args.recencyDaysFor(sign) + 1) * MS_PER_DAY
  let start = ms[0]
  for (let i = 1; i < ms.length; i += 1) if (ms[i] - ms[i - 1] > gapMs) start = ms[i]
  return start
}

/** Why an answer is not live, or null when it is. Exported for the tests. */
export function lapseReason(ack: AckFact, args: CareStateArgs, retracted: ReadonlySet<string>, courseStart: number | null, cfg: CareStateConfig): string | null {
  const tz = args.timezone
  const today = localDayIndex(args.nowMs, tz)
  const created = Date.parse(ack.createdAt)
  const anchor = localDayIndexOf(ack.anchorOn, tz)
  if (!Number.isFinite(created) || anchor === null) return 'malformed'
  if (retracted.has(ack.id)) return 'retracted'
  if (created > args.nowMs) return 'future'
  // An answer given before this course began covered an earlier one (the January answer, a
  // stand-down, a September recurrence: born raised).
  if (courseStart === null || created < courseStart) return 'earlier_course'
  // A visit answer must postdate the concern: a February vaccine visit never covers June.
  if ((ack.source === 'at_vet_tick' || ack.source === 'visit_answer') && anchor < localDayIndex(courseStart, tz)) {
    return 'visit_before_onset'
  }
  if (ack.source === 'vet_started_trial') {
    const t = ack.trial
    if (!t) return 'scope_missing'
    const s = localDayIndexOf(t.startedOn, tz)
    if (s === null) return 'scope_missing'
    if (t.endedOn) {
      const e = localDayIndexOf(t.endedOn, tz)
      if (e === null || e < today) return 'trial_ended'
    }
    const target = t.initialTargetDays
    if (target !== null && Number.isFinite(target) && today > s + Math.floor(target) - 1) return 'trial_target_reached'
  }
  if (ack.source === 'vet_started_course') {
    const c = ack.course
    if (!c) return 'scope_missing'
    if (c.endedOn) {
      const e = localDayIndexOf(c.endedOn, tz)
      if (e === null || e < today) return 'course_ended'
    } else if (c.status === 'completed' || c.status === 'stopped') {
      return 'course_ended'
    }
    if (c.lastDoseAt) {
      const last = Date.parse(c.lastDoseAt)
      if (Number.isFinite(last) && today > localDayIndex(last, tz) + cfg.courseAfterLastDoseDays) return 'course_last_dose'
    }
    if (!c.hasTarget && today > localDayIndex(created, tz) + cfg.courseNoTargetCapDays) return 'course_cap'
  }
  return null
}

/** The newest live answer for the sign, or null (the only one lapsed ⇒ raised). */
export function liveAck(sign: SymptomType, args: CareStateArgs, cfg: CareStateConfig): AckFact | null {
  const acks = args.record.acknowledgements
  const retracted = new Set(acks.filter((a) => a.retracts).map((a) => a.retracts as string))
  const start = courseStartMs(args, sign)
  const live = acks
    .filter((a) => a.sign === sign && !a.retracts)
    .filter((a) => lapseReason(a, args, retracted, start, cfg) === null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? 1 : -1))
  return live[0] ?? null
}

// ── The reference (§4.2) ──────────────────────────────────────────────────────

/** The day counting starts from: the anchor's next day, or the trial's first day (TD-5 call 2). */
function countFromDay(ack: AckFact, tz: string | undefined): number | null {
  const a = localDayIndexOf(ack.anchorOn, tz)
  if (a === null) return null
  return ack.source === 'vet_started_trial' ? a : a + 1
}

/** The window the reference is taken BEFORE: the anchor, or the trial's start. */
function referenceAnchorDay(ack: AckFact, tz: string | undefined): number | null {
  return localDayIndexOf(ack.anchorOn, tz)
}

/**
 * The reference window, frozen. The 28 days before the anchor when they are in the read and
 * logged on at least 20; else the FIRST 28-day window after the anchor that clears the floor
 * and ends before today's current window starts. It never slides: a fixed rule over the record
 * finds the same window on every run. Null while no window qualifies.
 */
export function referenceFor(sign: SymptomType, ack: AckFact, ix: DayIndex, cfg: CareStateConfig, tz: string | undefined): CareReference | null {
  const anchor = referenceAnchorDay(ack, tz)
  if (anchor === null) return null
  const len = cfg.referenceDays
  const floor = Math.ceil((cfg.referenceFloor * len) / 28)
  const onsets = ix.onsets(sign)
  const pre = { from: anchor - len, to: anchor - 1 }
  if (pre.from >= ix.firstFullDay) {
    const k = loggedIn(ix.logged, pre.from, pre.to)
    if (k >= floor) return { fromDay: pre.from, toDay: pre.to, episodes: countIn(onsets, pre.from, pre.to), loggedDays: k, beforeAnchor: true }
  }
  const lastEnd = ix.today - cfg.currentDays
  for (let from = Math.max(anchor + 1, ix.firstFullDay); from + len - 1 <= lastEnd; from += 1) {
    const to = from + len - 1
    const k = loggedIn(ix.logged, from, to)
    if (k >= floor) return { fromDay: from, toDay: to, episodes: countIn(onsets, from, to), loggedDays: k, beforeAnchor: false }
  }
  return null
}

// ── The re-raise tests (§4.2, §4.3, C1a, the pair) ─────────────────────────────

/** The current window ending on day d: [d − 13, d]. */
function currentWindow(d: number, cfg: CareStateConfig) {
  return { from: d - cfg.currentDays + 1, to: d }
}

/**
 * Persistence (§4.2): a firing at t and again at t' with t' − t in [7, 14], and no evening in
 * between below the coverage floor. Two unrelated flares months apart never add up. Returns the
 * day of the second firing, or null.
 */
export function persistentDay(
  firesOn: (d: number) => boolean,
  coveredOn: (d: number) => boolean,
  fromDay: number,
  today: number,
  cfg: CareStateConfig,
): number | null {
  for (let t = fromDay; t <= today - cfg.persistMinDays; t += 1) {
    if (!firesOn(t)) continue
    let ok = true
    for (let d = t + 1; d <= Math.min(today, t + cfg.persistMaxDays); d += 1) {
      if (!coveredOn(d)) {
        ok = false
        break
      }
      if (d - t >= cfg.persistMinDays && firesOn(d)) return d
    }
    if (!ok) continue
  }
  return null
}

/** What brought a watched concern back, and the pair the row then states. */
export interface ReRaise {
  reason: ReRaiseReason
  /** Day the trigger completed (an epoch-day index). */
  onDay: number
  /** For the rate arm: the current window's episodes on that day. */
  currentEpisodes?: number
  /** For the dense arm: the days with the sign in the last 7. */
  denseDays?: number
  /** For a co-sign: which sign, on how many days, since when. */
  coSign?: { sign: SymptomType | 'lethargy'; days: number; sinceDay: number }
  /** For the pair: the other sign's first onset (a DATE). */
  pairSign?: SymptomType
  pairSinceDay?: number
}

/** The co-signs C1a names for a concern's sign. Itch, scratch, skin and cough take none in v1. */
export function coSignsFor(sign: SymptomType): (SymptomType | 'lethargy')[] {
  if (sign === 'vomit') return ['diarrhea', 'lethargy']
  if (sign === 'diarrhea') return ['vomit', 'lethargy']
  return []
}

interface ReRaiseArgs {
  sign: SymptomType
  ack: AckFact
  reference: CareReference | null
  ix: DayIndex
  args: CareStateArgs
  cfg: CareStateConfig
  /** The other sign of the cough/vomit pair, when its chronicity finding is live now. */
  pairOnsetIso: string | null
}

export function findReRaise(x: ReRaiseArgs): ReRaise | null {
  const { sign, ack, reference, ix, args, cfg } = x
  const tz = args.timezone
  const createdMs = Date.parse(ack.createdAt)
  const evalFrom = Math.max(localDayIndex(createdMs, tz), ix.firstFullDay + cfg.currentDays - 1)
  const covered = (d: number) => {
    const w = currentWindow(d, cfg)
    return w.from >= ix.firstFullDay && loggedIn(ix.logged, w.from, w.to) >= cfg.currentFloor
  }
  const found: ReRaise[] = []

  // §4.2 the rate test, against the frozen reference. The current window must not overlap the
  // reference (a post-anchor reference ends at least a window before the first evaluation).
  if (reference) {
    const onsets = ix.onsets(sign)
    const fires = (d: number) => {
      const w = currentWindow(d, cfg)
      if (w.from <= reference.toDay || !covered(d)) return false
      return rateTestFires(countIn(onsets, w.from, w.to), reference.episodes, loggedIn(ix.logged, w.from, w.to), reference.loggedDays, cfg)
    }
    const day = persistentDay(fires, covered, evalFrom, ix.today, cfg)
    if (day !== null) {
      const w = currentWindow(day, cfg)
      found.push({ reason: 'rate', onDay: day, currentEpisodes: countIn(onsets, w.from, w.to) })
    }
  }

  // §4.3 the dense-day arm: ④'s firm floor, with the same persistence. A floor the engine already
  // trusts is never silenced by a care state.
  {
    const days = ix.signDays(sign)
    const denseOn = (d: number) => countIn([...days], d - cfg.denseWindowDays + 1, d) >= cfg.denseDayFloor
    const day = persistentDay((d) => covered(d) && denseOn(d), covered, evalFrom, ix.today, cfg)
    if (day !== null) found.push({ reason: 'dense', onDay: day, denseDays: countIn([...days], day - cfg.denseWindowDays + 1, day) })
  }

  // C1a co-signs: presence only, on ≥ coSignMinDays local days inside one current window, every
  // qualifying row after the answer was written, and NEW: no row of it in the 28 days before the
  // anchor. A pre-anchor window the read does not reach cannot show "new", so it does not fire
  // (the quieter reading, inside the 5% cap the ruling binds it to).
  const anchor = localDayIndexOf(ack.anchorOn, tz)
  if (anchor !== null && anchor - cfg.coSignNewDays >= ix.firstFullDay) {
    for (const co of coSignsFor(sign)) {
      const instants = co === 'lethargy'
        ? args.record.lethargyAt
        : args.symptoms.filter((e) => e.type === co).map((e) => e.occurredAt)
      const ms = instants.map((i) => Date.parse(i)).filter((m) => Number.isFinite(m))
      const allDays = ms.map((m) => localDayIndex(m, tz))
      if (countIn(allDays, anchor - cfg.coSignNewDays, anchor - 1) > 0) continue
      const afterDays = [...new Set(ms.filter((m) => m > createdMs).map((m) => localDayIndex(m, tz)))].sort((a, b) => a - b)
      for (let i = 0; i + cfg.coSignMinDays - 1 < afterDays.length; i += 1) {
        const last = afterDays[i + cfg.coSignMinDays - 1]
        if (last - afterDays[i] <= cfg.currentDays - 1 && last <= ix.today) {
          found.push({ reason: 'co_sign', onDay: last, coSign: { sign: co, days: countIn(afterDays, last - cfg.currentDays + 1, ix.today), sinceDay: afterDays[i] } })
          break
        }
      }
    }
  }

  // The cough/vomit pair (GAP-29): the other sign's course turned chronic after the answer.
  if (x.pairOnsetIso) {
    const onset = Date.parse(x.pairOnsetIso)
    if (Number.isFinite(onset) && onset > createdMs) {
      found.push({ reason: 'pair', onDay: ix.today, pairSign: sign === 'vomit' ? 'cough' : 'vomit', pairSinceDay: localDayIndex(onset, tz) })
    }
  }

  // The earliest trigger is the one the row names.
  found.sort((a, b) => a.onDay - b.onDay)
  return found[0] ?? null
}

// ── The prior row (the latch and the frozen reference) ────────────────────────

interface PriorCare {
  state: CareStateValue
  ackId: string
  reason: ReRaiseReason | null
  reference: CareReference | null
  text: string | null
}

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x)
}

function readReference(raw: unknown, cfg: CareStateConfig): CareReference | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isInt(r.fromDay) || !isInt(r.toDay) || !isInt(r.episodes) || !isInt(r.loggedDays)) return null
  if (r.toDay - r.fromDay + 1 !== cfg.referenceDays || r.episodes < 0 || r.loggedDays < 1 || r.loggedDays > cfg.referenceDays) return null
  return { fromDay: r.fromDay, toDay: r.toDay, episodes: r.episodes, loggedDays: r.loggedDays, beforeAnchor: r.beforeAnchor === true }
}

/** The prior row's care state per sign, tolerant of any shape (a malformed entry reads as none). */
export function readPriorCare(raw: unknown, cfg: CareStateConfig): Map<string, PriorCare> {
  const out = new Map<string, PriorCare>()
  if (!Array.isArray(raw)) return out
  for (const e of raw) {
    const f = (e as { finding?: unknown } | null)?.finding as Record<string, unknown> | undefined
    if (!f || typeof f !== 'object' || !CONCERN_TYPES.has(f.type as Finding['type'])) continue
    const c = f.careState as Record<string, unknown> | undefined
    if (!c || typeof c !== 'object' || typeof c.ackId !== 'string' || typeof f.symptomType !== 'string') continue
    const state = c.state
    if (state !== 'with_vet' && state !== 'recheck_booked' && state !== 'raised_again') continue
    const prev = out.get(f.symptomType)
    // Loudest wins when two lanes of one sign disagree: raised_again over the watched states.
    if (prev && prev.state === 'raised_again') continue
    out.set(f.symptomType, {
      state,
      ackId: c.ackId,
      reason: c.reason === 'rate' || c.reason === 'dense' || c.reason === 'co_sign' || c.reason === 'pair' ? c.reason : null,
      reference: readReference(c.reference, cfg),
      text: typeof c.text === 'string' ? c.text : null,
    })
  }
  return out
}

// ── Copy (template-only, AC 8; nyx-voice pass at PR-35) ───────────────────────

const SIGN_NOUN: Partial<Record<SymptomType, string>> = {
  vomit: 'Vomiting',
  diarrhea: 'Loose stool',
  itch: 'Itching',
  scratch: 'Scratching',
  skin_reaction: 'Skin irritation',
  cough: 'Coughing',
}

/** The source sentence, verbatim from §3.3: always "you said", never "your vet saw". */
export function sourceSentence(ack: AckFact, petName: string, today: number, tz: string | undefined, drugLabel: string | null): string {
  const a = localDayIndexOf(ack.anchorOn, tz)
  const on = a === null ? ack.anchorOn : formatDay(a, today)
  switch (ack.source) {
    case 'at_vet_tick':
    case 'visit_answer':
      return `You said you talked about it at the ${on} visit.`
    case 'my_vet_knows':
      return `You said on ${on} ${possessive(petName)} vet knows.`
    case 'vet_started_trial':
      return `You said ${possessive(petName)} vet started the trial for it.`
    case 'vet_started_course':
      return `You said ${possessive(petName)} vet started ${drugLabel ?? 'the medication'} for it.`
  }
}

interface SinceCount {
  /** Days in the window. */
  n: number
  count: number | null
  logged: number | null
  fromDay: number
}

/** The count since the answer's date, with its logging, or what may be said instead (§3.3, §5.1). */
function sinceLine(sign: SymptomType, ack: AckFact, ix: DayIndex, args: CareStateArgs, cfg: CareStateConfig): string {
  const tz = args.timezone
  const from = countFromDay(ack, tz)
  const today = ix.today
  if (from === null) return ''
  const n = today - from + 1
  // Below §4.2's coverage floor the test cannot run, and the row says so instead of counting.
  const cw = currentWindow(today, cfg)
  const k14 = cw.from >= ix.firstFullDay ? loggedIn(ix.logged, cw.from, cw.to) : null
  if (k14 !== null && k14 < cfg.currentFloor && n >= cfg.currentDays) {
    return `Something logged on ${k14} of the last ${cfg.currentDays} days, too few to count from.`
  }
  if (n < 1) return ''
  // "Since {the answer's date}": the anchor itself (a trial counts from its first day, the
  // others from the day after, TD-5 call 2), so the date named is always the one the owner gave.
  const sinceOn = formatDay(localDayIndexOf(ack.anchorOn, tz) as number, today)
  if (from < ix.firstFullDay) return `Since ${sinceOn}, ${plural(n, 'day', 'days')}.`
  const c: SinceCount = { n, count: countIn(ix.onsets(sign), from, today), logged: loggedIn(ix.logged, from, today), fromDay: from }
  // A zero reads as "it worked": withheld beside a drug that can mask the sign, within 42 days of a
  // visit (an answer's own visit day included), and over thin logging (§5.1, PR-22's ruling).
  const visits = [args.lastVisitOn, ack.source === 'at_vet_tick' || ack.source === 'visit_answer' ? ack.anchorOn : null]
    .filter((v): v is string => typeof v === 'string')
  const spans = maskingSpansFor(sign as Parameters<typeof maskingSpansFor>[0], { courses: args.courses, visitsOn: visits, todayIndex: today, timeZone: tz })
  const zeroWithheld = c.count === 0 && (windowTouchesSpan(spans, from, today) || (c.logged as number) < ZERO_COVERAGE_FLOOR * n)
  if (zeroWithheld) return `Since ${sinceOn}, ${plural(n, 'day', 'days')}, with something logged on ${c.logged} of ${n}.`
  return `Since ${sinceOn}, ${plural(n, 'day', 'days')}: ${plural(c.count as number, 'episode', 'episodes')}, with something logged on ${c.logged} of ${n}.`
}

function backBecauseLine(r: ReRaise, petName: string, today: number): string {
  switch (r.reason) {
    case 'rate':
      return `Back because it's coming more often.`
    case 'dense':
      return `Back because it's been logged on ${r.denseDays} of the last 7 days.`
    case 'co_sign': {
      const cs = r.coSign!
      const since = formatDay(cs.sinceDay, today)
      if (cs.sign === 'diarrhea') return `Back because ${petName} has also had loose stools on ${plural(cs.days, 'day', 'days')} since ${since}.`
      if (cs.sign === 'vomit') return `Back because ${petName} has also vomited on ${plural(cs.days, 'day', 'days')} since ${since}.`
      return `Back because ${petName} has also been logged with lethargy on ${plural(cs.days, 'day', 'days')} since ${since}.`
    }
    case 'pair': {
      const label = SYMPTOM_LABEL[r.pairSign as SymptomType]
      return `Back because ${possessive(petName)} ${label} has been coming back too, since ${formatDay(r.pairSinceDay as number, today)}.`
    }
  }
}

/** The compared pair (§4.2): counts with their windows, never a rate or a percentage. */
function pairLine(r: ReRaise, ref: CareReference | null, today: number): string | null {
  if (r.reason !== 'rate' || !ref) return null
  const span = ref.beforeAnchor
    ? `in the ${Math.round((ref.toDay - ref.fromDay + 1) / 7)} weeks before`
    : `from ${formatDay(ref.fromDay, today)} to ${formatDay(ref.toDay, today)}`
  return `${plural(r.currentEpisodes as number, 'episode', 'episodes')} in the last 2 weeks; ${ref.episodes} ${span}${ref.beforeAnchor ? ` ${formatDay(ref.toDay + 1, today)}` : ''}.`
}

// ── The step ──────────────────────────────────────────────────────────────────

export type CareStateStep = <T extends { rank: number; finding: Finding }>(findings: T[], args: CareStateArgs) => T[]

/**
 * EN-9's step: each concern gains `careState`; the watched ones rank below every other safety
 * finding; nothing else changes. Every escalation keeps its finding object untouched.
 */
export const EN9_CARE_STATE_STEP: CareStateStep = (findings, args) => {
  const cfg = args.config ?? CARE_STATE_CONFIG
  const ix = indexRecord(args)
  const tz = args.timezone
  const prior = readPriorCare(args.priorFindings, cfg)
  const chronicOnset = new Map<SymptomType, string>()
  for (const r of findings) {
    if (r.finding.type === 'symptom_chronicity') chronicOnset.set(r.finding.symptomType, r.finding.firstOnsetIso)
  }
  // One state per SIGN (chronicity and worsening for one sign share it, §2 finding identity).
  const bySign = new Map<SymptomType, CareStateFact>()
  const stateFor = (sign: SymptomType): CareStateFact => {
    const cached = bySign.get(sign)
    if (cached) return cached
    const ack = liveAck(sign, args, cfg)
    if (!ack) {
      const raised: CareStateFact = { state: 'raised', ackId: null, source: null, anchorOn: null, reference: null, reason: null, recheckOn: null, text: null }
      bySign.set(sign, raised)
      return raised
    }
    const p = prior.get(sign)
    const priorSame = p && p.ackId === ack.id ? p : null
    // The frozen reference: rebuilt from the record when it can be (the same fixed rule finds the
    // same window), the stored one only once the record no longer reaches it.
    const reference = referenceFor(sign, ack, ix, cfg, tz) ?? priorSame?.reference ?? null
    const pairSign: SymptomType | null = sign === 'vomit' ? 'cough' : sign === 'cough' ? 'vomit' : null
    let pairOnsetIso = pairSign ? chronicOnset.get(pairSign) ?? null : null
    // The pair turning chronic: when the prior row (written after the answer) lacked the other
    // sign's chronicity card and this run has it, it turned chronic after the answer even if
    // its first onset in the lookback is older.
    if (pairSign && pairOnsetIso && args.priorGeneratedAtMs !== null && args.priorGeneratedAtMs > Date.parse(ack.createdAt)) {
      const priorHad = Array.isArray(args.priorFindings) && (args.priorFindings as { finding?: { type?: unknown; symptomType?: unknown } }[])
        .some((e) => e?.finding?.type === 'symptom_chronicity' && e.finding.symptomType === pairSign)
      if (!priorHad) pairOnsetIso = new Date(Math.max(Date.parse(ack.createdAt) + 1, args.nowMs)).toISOString()
    }
    const rr = findReRaise({ sign, ack, reference, ix, args, cfg, pairOnsetIso })
    const latched = priorSame?.state === 'raised_again'
    const drug = ack.source === 'vet_started_course' ? courseLabelFor(ack) : null
    const source = sourceSentence(ack, args.petName, ix.today, tz, drug)
    if (rr || latched) {
      const reason: ReRaiseReason = rr?.reason ?? priorSame?.reason ?? 'rate'
      const back = rr ? backBecauseLine(rr, args.petName, ix.today) : `Back because something changed since your answer.`
      const pair = rr ? pairLine(rr, reference, ix.today) : null
      const fact: CareStateFact = {
        state: 'raised_again', ackId: ack.id, source: ack.source, anchorOn: ack.anchorOn, reference, reason, recheckOn: null,
        // The lane's own sentence (its ask word for word) is spliced in per card below, since
        // chronicity and worsening for one sign share the state but not the sentence.
        text: [back, LANE_TOKEN, pair, source].filter((s): s is string => !!s).join(' '),
      }
      bySign.set(sign, fact)
      return fact
    }
    const recheck = recheckFor(sign, ack, args)
    const head = `${possessive(args.petName)} ${(SYMPTOM_NOUN_LOWER[sign] ?? SYMPTOM_LABEL[sign])}, with your vet.`
    const tail = recheck
      ? `Recheck booked for ${formatDay(recheck.day, ix.today)}.`
      : sinceLine(sign, ack, ix, args, cfg)
    const fact: CareStateFact = {
      state: recheck ? 'recheck_booked' : 'with_vet', ackId: ack.id, source: ack.source, anchorOn: ack.anchorOn, reference, reason: null,
      recheckOn: recheck ? recheck.on : null,
      text: [head, source, tail].filter((s) => s.length > 0).join(' '),
    }
    bySign.set(sign, fact)
    return fact
  }
  const decorated = findings.map((r) => {
    const sign = concernSignOf(r.finding)
    if (sign === null) return r
    const fact = stateFor(sign)
    const text = fact.state === 'raised_again' && fact.text
      ? fact.text.replace(LANE_TOKEN, templateForFinding(r.finding, args.petName))
      : fact.text
    return { ...r, finding: { ...r.finding, careState: { ...fact, text } } as unknown as Finding }
  })
  return rankWatchedLast(decorated)
}

const SYMPTOM_NOUN_LOWER: Partial<Record<SymptomType, string>> = Object.fromEntries(
  Object.entries(SIGN_NOUN).map(([k, v]) => [k, (v as string).toLowerCase()]),
) as Partial<Record<SymptomType, string>>

/** Where a raised_again row's lane sentence goes. */
const LANE_TOKEN = '{lane}'

function courseLabelFor(ack: AckFact): string | null {
  const label = ack.course?.drugLabel?.trim()
  // An owner's label that itself makes a care claim ("Cerenia (helped last time)") is never
  // printed (CUL-1271's screen, as EN-10's course line does); the plain noun stands in.
  return label && careClaimReason(label) === null ? label : null
}

/** §4.7: a booked appointment about this sign, after the anchor, not cancelled, deleted or past. */
export function recheckFor(sign: SymptomType, ack: AckFact, args: CareStateArgs): { day: number; on: string } | null {
  const tz = args.timezone
  const today = localDayIndex(args.nowMs, tz)
  const anchor = localDayIndexOf(ack.anchorOn, tz)
  if (anchor === null) return null
  const ok = args.record.appointments
    .filter((a) => !a.cancelledAt && !a.deletedAt && a.aboutSigns.includes(sign))
    .map((a) => ({ a, ms: Date.parse(a.scheduledAt) }))
    .filter((x) => Number.isFinite(x.ms))
    .map((x) => ({ ...x, day: localDayIndex(x.ms, tz) }))
    .filter((x) => x.day > anchor && x.day >= today)
    .sort((a, b) => a.day - b.day)
  const first = ok[0]
  return first ? { day: first.day, on: first.a.scheduledAt } : null
}

/**
 * The one server re-rank Home, Ask, Get ready and the banner inherit (§3.3), at its narrowest:
 * the watched concerns move below every other safety finding, in their own order; nothing else
 * moves relative to anything else. So an escalation only ever moves UP, and a raised concern is
 * never placed below a watched one.
 */
export function rankWatchedLast<T extends { rank: number; finding: Finding }>(rows: T[]): T[] {
  const watched = (r: T) => r.finding.priorityClass === 'safety' && isWatched(careStateOf(r.finding)?.state)
  const watchedRows = rows.filter(watched)
  if (watchedRows.length === 0) return rows
  const remaining = rows.filter((r) => !watched(r))
  let at = remaining.reduce((last, r, i) => (r.finding.priorityClass === 'safety' ? i + 1 : last), -1)
  if (at === -1) at = rows.findIndex(watched)
  return [...remaining.slice(0, at), ...watchedRows, ...remaining.slice(at)].map((r, i) => ({ ...r, rank: i }))
}
