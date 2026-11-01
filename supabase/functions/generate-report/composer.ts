// The composer's outline (Vet report v2 PR-16, CUL-2296; spec §10.1, §10.7; round 5 frames b1 to b4).
//
// The first screen after "Vet report" asks one question, which days the vet should see, and
// answers it with counts before anything is built. Everything it shows is read off the SAME
// snapshot the report is assembled from (`buildReportSnapshotForPet`), never recounted here
// (spec §3.1: `assembleReport` stays the only place a number is computed). This module is pure:
// it picks the windows to offer and reads counts and flags off snapshots the shell built.
//
// THE LIVE FLAGS ARE ONE 56-DAY SET (§10.1, GAP-13). The call card at the top of the composer is
// the safety flags of a snapshot over the last 56 days, whatever window the owner picks, read
// once when the composer opens and never re-read on a window change: the safety row never moves
// (GAP-14). 56 is the chronicity lookback the live Signal reads, so a flag on the card is a flag
// the app's own engine would raise today. A window change cannot hide one.
//
// THE COUNTS ARE THE WINDOW'S. Logged days, symptom entries and weigh-ins come off the window's
// own snapshot; the days after a window that ends before today are counted off a second snapshot
// over exactly those days, so the "left out" line (b4) and the window's counts partition the
// record rather than estimate it (C-4).

import type { ReportDietTrialInput, ReportScope, ReportSnapshot, ReportVetVisitInput, SafetyFlag } from './report.ts'
import { leadSignOf, type LeadReason, type LeadSign } from './v2Predicates.ts'

/** The live-flag set's span, in local days ending today (spec §10.1). */
export const LIVE_FLAG_DAYS = 56
/** The rolling window every composer offers. */
export const LAST_DAYS = 30

export type ComposerWindowKind = 'since_visit' | 'diet_trial' | 'last_90' | 'last_30' | 'since_first'

export interface ComposerWindow {
  kind: ComposerWindowKind
  /** Inclusive local 'YYYY-MM-DD' bounds. */
  startDate: string
  endDate: string
  /** Inclusive day count. */
  days: number
  /**
   * The §6 cascade's own window (`resolveScope` with no override): the window the report builds
   * today when nobody chooses. Offered first, and sent back as NO override, so the report keeps
   * its own label and floors and nothing regresses from the pre-composer default (adversarial
   * pass 1 on CUL-2296, F2/F6).
   */
  isDefault: boolean
}

export interface ComposerCounts {
  startDate: string
  endDate: string
  windowDays: number
  loggedDays: number
  symptomEntries: number
  weighIns: number
  /** The window's newest weigh-in, in pounds (app screens read lb, ruling W). */
  latestWeighIn: { lbs: number; date: string } | null
  lead: { sign: LeadSign; reason: LeadReason } | null
  /** The window's logged days; null when the snapshot did not carry them (never "none"). */
  loggedDayKeys: string[] | null
  /** A pull behind these counts came back short: the counts may be low. */
  incomplete: boolean
  /**
   * The safety flags the report for THIS window prints (its own snapshot's band). The composer
   * compares them with the 56-day live set and warns when the window drops one: a short or cropped
   * window can lose a flag the live set holds (adversarial pass 1, F1/F2).
   */
  flags: ComposerFlag[]
}

export interface ComposerAfter {
  /** The first day after the window, and today. */
  startDate: string
  endDate: string
  /** The sum of `byType`, so the line's total and its breakdown can never disagree. */
  symptomEntries: number
  /** Symptom entries after the window by type, most first. */
  byType: Array<{ type: string; count: number }>
  /** Meals refused after the window, through today: the report's own record-edge count, read off
   *  the window's snapshot (a refusal is not a symptom entry, and intake is not preference). */
  mealsRefused: number
  /** A pull behind the after-window counts came back short. */
  incomplete: boolean
}

export interface ComposerFlag {
  kind: SafetyFlag['kind']
  /** The symptom the flag is about, when it names one; null otherwise. */
  sign: string | null
  /** An intake flag's trigger, so the card can say "refusing" rather than "less" when it was. */
  trigger: string | null
}

export interface ComposerLive {
  /** `flags`: at least one. `none`: the set read in full and held none. `incomplete`: none fired
   *  over a pull that came back short, so the composer may not imply there were none. */
  state: 'flags' | 'none' | 'incomplete'
  startDate: string
  endDate: string
  flags: ComposerFlag[]
}

// ── Day arithmetic (local calendar-day keys) ────────────────────────────────

function dayNum(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

function keyOf(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10)
}

export function addDays(key: string, n: number): string {
  return keyOf(dayNum(key) + n)
}

export function daysInclusive(start: string, end: string): number {
  return dayNum(end) - dayNum(start) + 1
}

/** The local day an instant falls on in `tz` (UTC when null or unknown). A DATE column passes through. */
export function localDayOf(value: string, tz: string | null): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(ms))
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

/** The live-flag window: the last `LIVE_FLAG_DAYS` local days through `today`. */
export function liveWindowOf(today: string): { startDate: string; endDate: string } {
  return { startDate: addDays(today, -(LIVE_FLAG_DAYS - 1)), endDate: today }
}

// ── The windows offered (b1) ─────────────────────────────────────────────────

/**
 * The windows the composer offers, each with its reason and dates, the first one selected:
 *   0. the §6 cascade's own window (`defaultScope`): since the last visit, the diet trial the
 *      report anchors on (with its floors), or the last 90 days. Sent back as no override.
 *   1. since the last visit (the most recent visit strictly before today, as the cascade reads it);
 *   2. the diet trial (the running one first, else the latest started on or before today), to its
 *      end or today;
 *   3. the last 30 days, or, for a record that began inside them, since the first entry.
 * A window identical to an earlier one is not offered twice.
 */
export function composerWindowsOf(input: {
  today: string
  timezone: string | null
  vetVisits: readonly ReportVetVisitInput[]
  dietTrials: readonly ReportDietTrialInput[]
  firstEntryDate: string | null
  defaultScope: Pick<ReportScope, 'basis' | 'startDate' | 'endDate'>
}): ComposerWindow[] {
  const { today, timezone } = input
  const todayN = dayNum(today)
  const out: ComposerWindow[] = []
  const push = (kind: ComposerWindowKind, startDate: string, endDate: string, isDefault = false) => {
    if (dayNum(startDate) > dayNum(endDate)) return
    if (out.some((w) => w.startDate === startDate && w.endDate === endDate)) return
    out.push({ kind, startDate, endDate, days: daysInclusive(startDate, endDate), isDefault })
  }

  const d = input.defaultScope
  if (d.basis !== 'custom') {
    push(d.basis === 'fallback_90d' ? 'last_90' : d.basis, d.startDate, d.endDate, true)
  }

  let lastVisit: string | null = null
  for (const v of input.vetVisits) {
    const day = localDayOf(v.visitedAt, timezone)
    if (day === null || dayNum(day) >= todayN) continue
    if (lastVisit === null || dayNum(day) > dayNum(lastVisit)) lastVisit = day
  }
  if (lastVisit !== null) push('since_visit', lastVisit, today)

  // The running trial outranks an ended one, then the latest start (the order `selectReportTrial`
  // ranks by), so an abandoned short trial never stands in for the one under way (B-613's input).
  let trial: { start: string; end: string; active: boolean } | null = null
  for (const t of input.dietTrials) {
    const start = localDayOf(t.startedAt, timezone)
    if (start === null || dayNum(start) > todayN) continue
    const active = t.status === 'active'
    if (trial !== null && (trial.active && !active || (trial.active === active && dayNum(start) <= dayNum(trial.start)))) continue
    const endRaw: string | null = active ? null : t.endedAt ?? t.completedAt ?? null
    const endDay: string | null = endRaw === null ? null : localDayOf(endRaw, timezone)
    const end: string = endDay === null || dayNum(endDay) > todayN ? today : endDay
    trial = { start, end: dayNum(end) < dayNum(start) ? start : end, active }
  }
  if (trial !== null) push('diet_trial', trial.start, trial.end)

  const first = input.firstEntryDate
  if (first !== null && dayNum(first) <= todayN && daysInclusive(first, today) < LAST_DAYS) {
    push('since_first', first, today)
  } else {
    push('last_30', addDays(today, -(LAST_DAYS - 1)), today)
  }
  return out
}

// ── Reading a snapshot ───────────────────────────────────────────────────────

export function countsOf(snap: ReportSnapshot): ComposerCounts {
  const trend = snap.weight.trend
  const lead = leadSignOf(snap)
  return {
    startDate: snap.scope.startDate,
    endDate: snap.scope.endDate,
    windowDays: snap.scope.windowDays,
    loggedDays: snap.atAGlance.loggedDays,
    symptomEntries: snap.atAGlance.totalSymptomIncidents,
    weighIns: trend?.readingCount ?? 0,
    latestWeighIn:
      trend && trend.latestLbs !== null && trend.latestDate !== null ? { lbs: trend.latestLbs, date: trend.latestDate } : null,
    lead: lead === null ? null : { sign: lead.sign, reason: lead.reason },
    loggedDayKeys: snap.v2.loggedDayKeys ?? null,
    incomplete: snap.incompletePulls.length > 0,
    flags: snap.safetyFlags.map(flagOf),
  }
}

/** The symptom entries over the days AFTER the chosen window (`snap`), and the refused meals the
 *  window's own snapshot counts after its end (`windowSnap`). */
export function afterOf(snap: ReportSnapshot, windowSnap: ReportSnapshot): ComposerAfter {
  const byType = snap.symptoms
    .filter((s) => s.count > 0)
    .map((s) => ({ type: s.type as string, count: s.count }))
    .sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : 1))
  return {
    startDate: snap.scope.startDate,
    endDate: snap.scope.endDate,
    symptomEntries: byType.reduce((n, t) => n + t.count, 0),
    byType,
    mealsRefused: windowSnap.atAGlance.recordEdge.afterWindowMealsRefused,
    incomplete: snap.incompletePulls.length > 0,
  }
}

function flagSymptomOf(f: SafetyFlag): string | null {
  switch (f.kind) {
    case 'chronicity':
    case 'symptom_burden':
    case 'symptom_worsening':
      return f.symptomType
    case 'present_blood':
      return f.source === 'vomit' ? 'vomit' : 'diarrhea'
    case 'present_foreign':
      return 'vomit'
    default:
      return null
  }
}

/**
 * The live-flag card's set: every safety flag of the 56-day snapshot, in the snapshot's safety
 * order. R-11's exempt chronicity flag stays in it: it moves to lead the sheet, it is still live.
 */
function flagOf(f: SafetyFlag): ComposerFlag {
  return { kind: f.kind, sign: flagSymptomOf(f), trigger: f.kind === 'intake_decline' ? f.trigger : null }
}

export function liveOf(snap: ReportSnapshot): ComposerLive {
  const flags = snap.safetyFlags.map(flagOf)
  const state = flags.length > 0 ? 'flags' : snap.incompletePulls.length > 0 ? 'incomplete' : 'none'
  return { state, startDate: snap.scope.startDate, endDate: snap.scope.endDate, flags }
}

// ── The request ──────────────────────────────────────────────────────────────

export type ComposerPart = 'open' | 'window'

/** Parse the composer's part of a request body. Null ⇒ not a composer request. */
export function parseComposerRequest(body: { mode?: unknown; part?: unknown }): { part: ComposerPart } | null {
  if (body.mode !== 'composer') return null
  return { part: body.part === 'window' ? 'window' : 'open' }
}

/** A window's bounds are two well-formed local days, start on or before end. */
export function validWindow(w: { startDate: string; endDate: string } | null): boolean {
  if (w === null) return false
  const re = /^\d{4}-\d{2}-\d{2}$/
  return re.test(w.startDate) && re.test(w.endDate) && dayNum(w.startDate) <= dayNum(w.endDate)
}
