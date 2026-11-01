// Vet report v2 predicates (CUL-2289, row VR2-9; v2 spec §4, §5.1 to §5.5, v1 spec §7.1's v2
// amendment). One answer, written once, to the questions every v2 surface asks of a snapshot:
// what sits in the safety band, which sign leads sheet 1, what prints when the record is too short
// for a check, the record-edge line, the "Not in this record" gap lines, and the "Changes in this
// window" line on a zero-sign sheet (PM ruling (a) on CUL-2323).
//
// PURE over `ReportSnapshot`. Nothing here computes a number the snapshot does not already carry
// (v2 spec §3.1): a fact these predicates need and v1 lacks is added to `snap.v2` in
// `assembleReport`. Nothing here renders: each predicate returns typed facts plus the one
// code-written sentence the document model (VR2-10) places. v1's render reads none of it.
import {
  REPORT_SYMPTOM_TYPES,
  type ReportSnapshot,
  type ReportSymptomType,
  type SafetyFlag,
} from './report.ts'

// ── The closed lists ─────────────────────────────────────────────────────────

/**
 * R-11 condition 2: the signs a skin trial is run for (C-11; its decision row is in
 * `constants/eventTypes.membership.test.ts`). `careContext.ts`'s `trialCovers` draws a skin
 * trial's line beside itch and scratch; `skin_reaction` is added because it is a skin sign by name
 * and a chronic one on a skin trial is the same clinical question. Closed on purpose: vomiting,
 * stool and intake are never on it, so their chronicity always stays in the band (v1 spec §7.1).
 */
export const SKIN_TRIAL_SIGNS: readonly ReportSymptomType[] = ['itch', 'scratch', 'skin_reaction']

/** A gi trial's own signs, for the lead ladder's step 2 only (never a band decision). */
const GI_TRIAL_SIGNS: readonly ReportSymptomType[] = ['vomit', 'diarrhea']

/** The lead-eligible set (v2 spec §4): the report's symptom types plus the intake measure.
 *  Exposures and Noticed looks never lead. */
export type LeadSign = ReportSymptomType | 'intake'
export const LEAD_ELIGIBLE: readonly LeadSign[] = [...REPORT_SYMPTOM_TYPES, 'intake']

/** Step 4's tie order: GI and intake first, then the report's own symptom order. */
const TIE_ORDER: readonly LeadSign[] = [
  'vomit',
  'diarrhea',
  'intake',
  ...REPORT_SYMPTOM_TYPES.filter((t) => t !== 'vomit' && t !== 'diarrhea'),
]

const REPORT_SYMPTOM_SET = new Set<string>(REPORT_SYMPTOM_TYPES)

type ChronicityFlag = Extract<SafetyFlag, { kind: 'chronicity' }>

// ── Small helpers ────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Whole days from `from` to `to`, both 'YYYY-MM-DD' local keys. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY)
}

/** 'YYYY-MM-DD' → "Jun 19". Year-less on purpose: every date these lines print sits within weeks
 *  of the report date, which the masthead states in full (C-19's bounded range). */
function shortDate(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

/** As `shortDate`, with the year when it is not the report's year: a weigh-in can sit months back,
 *  outside the bounded range a year-less date is safe in. */
function datedFrom(day: string, reportDate: string): string {
  return day.slice(0, 4) === reportDate.slice(0, 4) ? shortDate(day) : `${shortDate(day)}, ${day.slice(0, 4)}`
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "13 days before this report", or "the day of this report" — never "0 days". */
function beforeReport(days: number): string {
  return days === 0 ? 'the day of this report' : `${plural(days, 'day', 'days')} before this report`
}

/** The sign a band flag is about, when it is lead-eligible; null for a flag with no sign a chart
 *  can lead with (weight, a protein mismatch, an engine-only finding). */
export function flagSign(f: SafetyFlag): LeadSign | null {
  switch (f.kind) {
    case 'present_blood':
      return f.source === 'vomit' ? 'vomit' : 'diarrhea'
    case 'present_foreign':
      return 'vomit'
    case 'intake_decline':
    case 'trial_diet_refusal':
      return 'intake'
    case 'chronicity':
    case 'symptom_burden':
    case 'symptom_worsening':
      return REPORT_SYMPTOM_SET.has(f.symptomType) ? (f.symptomType as ReportSymptomType) : null
    case 'weight_loss':
    case 'weight_unchecked':
    case 'engine_other':
    case 'protein_mismatch':
      return null
  }
}

/** The symptom a flag names, for R-11 condition 5 ("no other flag on that sign"). Wider than
 *  `flagSign`: a sign that is not lead-eligible still counts as a flag on that sign. */
function flagSymptom(f: SafetyFlag): string | null {
  if (f.kind === 'chronicity' || f.kind === 'symptom_burden' || f.kind === 'symptom_worsening') return f.symptomType
  if (f.kind === 'present_blood') return f.source === 'vomit' ? 'vomit' : 'diarrhea'
  if (f.kind === 'present_foreign') return 'vomit'
  return null
}

// ── R-11 and the band (v2 spec §5.1, §5.2) ──────────────────────────────────

/** The five conditions of v1 spec §7.1's v2 amendment, each named so a test can break it alone. */
export interface R11Conditions {
  /** (1) the trial's indication is exactly `skin`. */
  skinTrial: boolean
  /** (2) the sign is on the closed skin list. */
  skinSign: boolean
  /** (3) the engine would not flag a rise on this sign (`foldedWorsening` is `not_rising`; an
   *  unmeasured rise is not "no rise"). */
  noFoldedWorsening: boolean
  /** (4) the flag's tier is the tier its span alone earns. */
  tierFromSpan: boolean
  /** (5) no other flag fired on this sign. */
  onlyFlagOnSign: boolean
}

export function r11ConditionsOf(snap: ReportSnapshot, flag: ChronicityFlag): R11Conditions {
  // One fact row per chronicity flag. A flag with no row (a snapshot built without it) fails
  // conditions 3 and 4, so silence keeps the flag in the band.
  const fact = snap.v2.chronicity.find((c) => c.symptomType === flag.symptomType)
  return {
    skinTrial: snap.trial !== null && snap.trial.indication === 'skin',
    skinSign: (SKIN_TRIAL_SIGNS as readonly string[]).includes(flag.symptomType),
    noFoldedWorsening: fact?.worsening === 'not_rising',
    tierFromSpan: fact !== undefined && flag.tier === fact.spanTier,
    onlyFlagOnSign: !snap.safetyFlags.some((o) => o !== flag && flagSymptom(o) === flag.symptomType),
  }
}

export function r11Holds(c: R11Conditions): boolean {
  return c.skinTrial && c.skinSign && c.noFoldedWorsening && c.tierFromSpan && c.onlyFlagOnSign
}

export interface BandMembers {
  /** The band's items, one per flag, in the snapshot's safety order. Two flags of one kind (a
   *  vomiting and a cough chronicity flag) are two items: one sign per line, the cough↔vomit
   *  caveat riding on the flag that carries `coughVomitAdjacent`. */
  band: SafetyFlag[]
  /**
   * The chronicity flag R-11 moves out of the band to lead as the lead chart, its heading opening
   * with "Flag:". It stays `safety_live`. Null when no flag is exempt.
   *
   * An exempt flag must actually lead (team call, plan comment on CUL-2289): if any band member
   * left behind names a lead-eligible sign, §4's ladder would give the lead chart to that member
   * and the exempt flag would print in neither place. So the exemption also requires that no
   * other band member could take the lead; otherwise the flag stays in the band.
   */
  leadFlag: ChronicityFlag | null
}

export function bandMembersOf(snap: ReportSnapshot): BandMembers {
  const flags = snap.safetyFlags
  for (const f of flags) {
    if (f.kind !== 'chronicity' || !r11Holds(r11ConditionsOf(snap, f))) continue
    const rest = flags.filter((o) => o !== f)
    if (rest.some((o) => flagSign(o) !== null)) continue
    return { band: rest, leadFlag: f }
  }
  return { band: [...flags], leadFlag: null }
}

// ── The lead (v2 spec §4) ────────────────────────────────────────────────────

export type LeadReason = 'flag' | 'trial_sign' | 'rising' | 'most_days'

export const LEAD_REASON_LINE: Record<LeadReason, string> = {
  flag: 'Leads because it is flagged.',
  trial_sign: 'Leads because it is the trial’s sign.',
  rising: 'Leads because its count rose week over week.',
  most_days: 'Leads because it has the most days with an entry.',
}

export interface Lead {
  sign: LeadSign
  reason: LeadReason
  /** The short code line naming why the lead was chosen. */
  line: string
}

/** Days with an entry, per lead-eligible sign. Intake's days are the days a rated meal was not
 *  fully eaten: the days the intake measure has something to show. */
function entryDays(snap: ReportSnapshot): Map<LeadSign, number> {
  const days = new Map<LeadSign, number>()
  for (const s of snap.symptoms) {
    if (s.count > 0 && s.symptomDays > 0) days.set(s.type, s.symptomDays)
  }
  if (snap.v2.mealNotFinishedDays > 0) days.set('intake', snap.v2.mealNotFinishedDays)
  return days
}

/** The candidate with the most entry days, ties broken by `TIE_ORDER`; null when none has any. */
function mostDays(candidates: readonly LeadSign[], days: Map<LeadSign, number>): LeadSign | null {
  let best: LeadSign | null = null
  for (const sign of TIE_ORDER) {
    if (!candidates.includes(sign)) continue
    const n = days.get(sign) ?? 0
    if (n === 0) continue
    if (best === null || n > (days.get(best) ?? 0)) best = sign
  }
  return best
}

function lead(sign: LeadSign, reason: LeadReason): Lead {
  return { sign, reason, line: LEAD_REASON_LINE[reason] }
}

/**
 * Which sign leads sheet 1 (§4), consumed by the composer, the sheet and the AI fact table:
 *   1. the R-11 lead flag, else the first band flag with a lead-eligible sign;
 *   2. else the trial's indication sign (its member with the most entry days);
 *   3. else a sign the engine measured rising (④'s check stood below its card floor);
 *   4. else the sign with the most days with an entry, GI and intake breaking ties.
 * Null only on a sheet with no entry of any eligible sign (the zero-sign sheet).
 *
 * Step 2 and 3 skip a sign with no entry in the window: an empty lead chart over a trial's sign
 * reads as a clean result, which the record has not shown. Step 3 reads only a rise the engine
 * computed (the 2026-10-31 rule: a line may state only a comparison the engine made). "New" signs
 * have no engine fact yet, so step 3 does not name them; such a sign still competes at step 4.
 */
export function leadSignOf(snap: ReportSnapshot): Lead | null {
  const { band, leadFlag } = bandMembersOf(snap)
  if (leadFlag) return lead(leadFlag.symptomType as ReportSymptomType, 'flag')
  for (const f of band) {
    const s = flagSign(f)
    if (s !== null) return lead(s, 'flag')
  }
  const days = entryDays(snap)
  const indication = snap.trial?.indication ?? null
  const trialSigns = indication === 'skin' ? SKIN_TRIAL_SIGNS : indication === 'gi' ? GI_TRIAL_SIGNS : []
  const trialLead = mostDays(trialSigns, days)
  if (trialLead !== null) return lead(trialLead, 'trial_sign')
  const rising = snap.safetyChecks
    .filter((c) => c.kind === 'worsening' && c.state === 'below_card_floor')
    .map((c) => c.symptomType as string)
    .filter((t): t is ReportSymptomType => REPORT_SYMPTOM_SET.has(t))
  const risingLead = mostDays(rising, days)
  if (risingLead !== null) return lead(risingLead, 'rising')
  const any = mostDays(LEAD_ELIGIBLE, days)
  return any === null ? null : lead(any, 'most_days')
}

// ── The thin record (ruling T, v2 spec §5.1) ─────────────────────────────────

/**
 * Below this many logged days the checks that compare weeks cannot run: ④ compares two 7-day
 * weeks and ⑦ needs weeks of span (v2 spec §5.1, "a 14-day constant"). The same constant turns
 * the weekly bars into a day row and suppresses the AI lead (VR2-10, VR2-25 read it from here).
 */
export const THIN_RECORD_DAYS = 14

export interface ThinRecordLine {
  loggedDays: number
  /** Printed where the band sits, never styled as the band. Names only what could not run; never
   *  "no flags", "not triggered" or anything that reads as a result. */
  text: string
}

export function thinRecordLineOf(snap: ReportSnapshot): ThinRecordLine | null {
  const n = snap.atAGlance.loggedDays
  if (n >= THIN_RECORD_DAYS) return null
  const lead = n === 0 ? 'No days logged' : `${plural(n, 'day', 'days')} logged`
  return { loggedDays: n, text: `${lead}: too few for the checks that compare weeks.` }
}

// ── The record edge (v2 spec §5.3) ──────────────────────────────────────────

/** The record ends this many days or more before the report date → the line prints. */
export const RECORD_ENDS_MIN_DAYS = 2
/** The record begins fewer than this many days before the report date → the line prints. Same
 *  question as the thin record (are there weeks to compare?), so the same value, mirrored. */
export const RECORD_BEGINS_MAX_DAYS = THIN_RECORD_DAYS

export interface RecordEdgeLine {
  kind: 'ends' | 'begins'
  date: string
  daysBeforeReport: number
  text: string
}

/** Zero, one or two lines: the end first (silence is the louder fact), then the beginning. */
export function recordEdgeLinesOf(snap: ReportSnapshot): RecordEdgeLine[] {
  const edge = snap.atAGlance.recordEdge
  const lines: RecordEdgeLine[] = []
  if (edge.lastEntryDate !== null && edge.lastEntryDaysBeforeReport !== null && edge.lastEntryDaysBeforeReport >= RECORD_ENDS_MIN_DAYS) {
    lines.push({
      kind: 'ends',
      date: edge.lastEntryDate,
      daysBeforeReport: edge.lastEntryDaysBeforeReport,
      text: `Record ends ${shortDate(edge.lastEntryDate)}, ${beforeReport(edge.lastEntryDaysBeforeReport)}.`,
    })
  }
  const first = snap.v2.firstEntryDate
  if (first !== null) {
    const d = daysBetween(first, edge.reportDate)
    if (d >= 0 && d < RECORD_BEGINS_MAX_DAYS) {
      lines.push({ kind: 'begins', date: first, daysBeforeReport: d, text: `Record begins ${shortDate(first)}, ${beforeReport(d)}.` })
    }
  }
  return lines
}

// ── Gap lines (R-5b, v2 spec §5.5) ──────────────────────────────────────────

export const GAP_LINE_MAX = 3

/**
 * A weight flag over a weigh-in this old asks for a newer one. Its own question (is the reading
 * behind a live loss recent enough to act on?), so its own constant: two weeks, the span of ④'s
 * two compared weeks, inside which a pet already flagged for loss can lose more unseen. Not
 * `CHANGES_WEIGHT_STALE_DAYS`, which asks whether an older pet is being weighed at all.
 */
export const GAP_WEIGHT_STALE_DAYS = 14

/** The closed catalogue. Each names a missing MEASUREMENT, never an owner act. */
export type GapLineId = 'weight_after' | 'shared_bowl' | 'meals_unrated' | 'doses_not_logged'

export interface GapLine {
  id: GapLineId
  lane: 'safety' | 'intake' | 'coverage'
  /** The fact this line is about. The document model passes the ids it has printed; a line whose
   *  fact is printed is dropped, so a gap line never restates a printed fact. */
  factId: string
  text: string
}

export function gapLinesOf(snap: ReportSnapshot, printedFactIds: ReadonlySet<string> = new Set()): GapLine[] {
  const out: GapLine[] = []
  // Safety first: a live weight flag over an old weigh-in.
  const w = snap.signalment.latestWeight
  if (w !== null && snap.safetyFlags.some((f) => f.kind === 'weight_loss')) {
    if (daysBetween(w.date, snap.atAGlance.recordEdge.reportDate) >= GAP_WEIGHT_STALE_DAYS) {
      out.push({ id: 'weight_after', lane: 'safety', factId: 'weight.latest', text: `A weight after ${datedFrom(w.date, snap.atAGlance.recordEdge.reportDate)}` })
    }
  }
  // Intake: who ate from a bowl another pet shares, then meals with no rating.
  if (snap.diet.freeFed.some((b) => b.isShared)) {
    out.push({ id: 'shared_bowl', lane: 'intake', factId: 'diet.freeFed.shared', text: 'Which pet ate from the shared bowl' })
  }
  const unrated = snap.v2.loggedMeals - snap.v2.ratedMeals
  if (unrated > 0) {
    out.push({
      id: 'meals_unrated',
      lane: 'intake',
      factId: 'diet.mealsUnrated',
      text: `How much was eaten at ${unrated} of ${plural(snap.v2.loggedMeals, 'logged meal', 'logged meals')}`,
    })
  }
  // Coverage: course days with no row of the course. Keyed to the days with nothing logged, never
  // to whether any dose was logged, so one dose never removes the line. Prescriptions before
  // supplements, then the most unlogged days first.
  const courses = snap.medications
    .filter((m) => m.overlapsWindow && m.courseDays.nothingLogged > 0)
    .sort((a, b) => Number(a.isSupplement) - Number(b.isSupplement) || b.courseDays.nothingLogged - a.courseDays.nothingLogged)
  for (const m of courses) {
    const c = m.courseDays
    const total = c.given + c.loggedNotGiven + c.nothingLogged
    out.push({
      id: 'doses_not_logged',
      lane: 'coverage',
      factId: `medication.${m.regimenId}.courseDays`,
      text: `Doses of ${m.drugName} on ${c.nothingLogged} of ${plural(total, 'day', 'days')} not logged`,
    })
  }
  return out.filter((g) => !printedFactIds.has(g.factId)).slice(0, GAP_LINE_MAX)
}

// ── Changes in this window (PM ruling (a) on CUL-2323) ──────────────────────

/** A Noticed concern word marked on this many window days or more. */
export const CHANGES_NOTICED_MIN_DAYS = 3
/** Days with a rated meal not fully eaten, this many or more. */
export const CHANGES_MEALS_NOT_FINISHED_MIN_DAYS = 3
/** No weigh-in in this many days, for a pet older than `CHANGES_SENIOR_MONTHS`. */
export const CHANGES_WEIGHT_STALE_DAYS = 30
/** "A pet over 10": older than 10 years, measured in whole months so 10 years 6 months counts. */
export const CHANGES_SENIOR_MONTHS = 120

export type ChangeLineId = 'noticed_concern' | 'meals_not_finished' | 'weight_stale_senior'

export interface ChangeLine {
  id: ChangeLineId
  text: string
}

/**
 * The "Changes in this window" line on a zero-sign sheet: a window with no symptom entry can still
 * hold the change a vet needs, and without this the sheet reads calm (CUL-2323). From a closed
 * catalogue, code-written, never a band member and never called a flag; the render (VR2-10) sits
 * it where the band would sit, unframed.
 *
 * Null on a sheet with any symptom entry (the ruling scopes it to zero-sign sheets) and when no
 * entry holds. It does not read the band: an intake flag on a zero-sign sheet does not withhold
 * a Noticed line, and where the two sit together is the render's call.
 */
export function changesInWindowOf(snap: ReportSnapshot): ChangeLine[] | null {
  if (snap.symptoms.some((s) => s.count > 0)) return null
  const out: ChangeLine[] = []
  const n = snap.noticed
  if (n) {
    const words = n.concernWords
      .filter((w) => w.dayCount >= CHANGES_NOTICED_MIN_DAYS)
      .sort((a, b) => b.dayCount - a.dayCount || a.key.localeCompare(b.key))
    for (const w of words) {
      out.push({
        id: 'noticed_concern',
        text: `Marked ${w.label.toLowerCase()} on ${w.dayCount} of ${plural(n.answeredDays, 'day', 'days')} answered`,
      })
    }
  }
  const days = snap.v2.mealNotFinishedDays
  if (days >= CHANGES_MEALS_NOT_FINISHED_MIN_DAYS) {
    const mc = snap.diet.mealCompletion
    const meals = mc ? ` (${mc.ratedMeals - mc.finishedMeals} of ${plural(mc.ratedMeals, 'rated meal', 'rated meals')})` : ''
    out.push({ id: 'meals_not_finished', text: `Meals not finished on ${days} days${meals}` })
  }
  const sg = snap.signalment
  if (sg.ageYears !== null && sg.ageYears * 12 + (sg.ageMonths ?? 0) > CHANGES_SENIOR_MONTHS) {
    const w = sg.latestWeight
    const report = snap.atAGlance.recordEdge.reportDate
    if (w === null) {
      out.push({ id: 'weight_stale_senior', text: 'No weight on record' })
    } else {
      const d = daysBetween(w.date, report)
      if (d >= CHANGES_WEIGHT_STALE_DAYS) out.push({ id: 'weight_stale_senior', text: `No weight since ${datedFrom(w.date, report)}, ${d} days before this report` })
    }
  }
  return out.length > 0 ? out : null
}
