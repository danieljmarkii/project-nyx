// Supabase Edge Functions shared module — "may wait": whether a call-today read may tell the
// owner to call "first thing tomorrow" (Engines v3 PR-27e, CUL-1628, under CUL-1611's ruling A).
//
// THE COLUMN (087): `event_ai_analysis.may_wait`. Only TRUE grants leave to wait; FALSE and NULL
// both keep the louder line ("If they're closed, call an emergency clinic."). Readers gate on
// `tier = 'call_today' AND may_wait IS TRUE`. 087 adds no CHECK pairing it with the tier, so
// every write of `tier` writes `may_wait` too (`mayWaitValue`), and no write inherits a TRUE.
//
// WHY THE SERVER. PR-27b built this on the phone and four adversarial passes broke every
// version (CUL-1510): the evidence that waiting is safe lives in other reads' flags and
// payloads, a removed photo's call, a neighbour's intake flag, lethargy logged back-dated,
// and the phone does not hold them. This module is the one predicate; it reads only what it
// is handed, so each rule is a named check with its own test and its own mutation proof
// (incidentMayWait.test.ts). The reads are incidentMayWaitEvidence.ts.
//
// THE RULES (CUL-1611's list; anything unknown refuses):
//   allow_list    the call came from the record: at least one contextual flag, every one on
//                 the type's list. Lethargy is never on it; a cat's intake flag is not (CUL-1610
//                 ruled A); stool's concurrent vomiting is not (PR-27e decision (a)).
//   photo_finding no visual flag, on this write or the stored row; no blood or foreign-material
//                 field present OR UNSURE, on this run's columns, the stored columns or the
//                 stored payload.
//   blood_colour  no blood-coloured (or unclear) colour, on the same three sources.
//   model_call    the model did not make the call, this run or the stored payload; and the
//                 stored row was never refused on its own photo (a FALSE: see below).
//   settled       this run read every photo and the photo shows the subject; the write is
//                 'completed'; the row is not owner-edited (its payload is frozen); not a
//                 rescue, not a capped run over a photo (the caller says so through `settled`).
//   neighbour     no call-now sign within the floor's window (72 h either side): EN-4's floor
//                 re-run anchored on every neighbouring vomit; a neighbour's own call now, photo
//                 finding, model call, intake or lethargy flag, or FALSE; a photographed
//                 neighbour with no settled read; any lethargy within a day of the run; a cat
//                 whose intake flag fires at any vomit in the run or at the read.
//   dst           no UTC-offset change in the owner's profile zone from 72 h before the vomit
//                 to 48 h after the read (the profile zone: the server has no device zone, so
//                 the client re-checks its own at render, CUL-1629).
// `engine` and `evidence` refuse too: a TRUE needs EN-4's floor on (the call-now signs are the
// floor's question), and a record the reads could not answer.
//
// FALSE VERSUS NULL. A refused call today is FALSE only when THIS incident's own photo evidence
// refused it (photo_finding, blood_colour, model_call). Every other refusal is NULL. That makes a
// stored FALSE a durable fact about the incident, which is the point: photos are hard-deleted
// (lib/attachments.ts), so once a photoless re-read has nulled the payload, a stored FALSE is the
// only trace that a removed photo carried a finding (CUL-1611: "including after a photo is
// removed"). It is sticky on this row and refuses for every neighbour. A refusal for a reason
// the record recomputes (a neighbour's unread photo, a capped run, DST) stays NULL, so it cannot
// chain across a run of vomiting or outlive its cause.

import { FLOOR_LETHARGY_HOURS, FLOOR_READ_HOURS, incidentFloor, type FloorVomit } from '../../../lib/incidentFloor.ts'
import { effectiveTierRank, TIER_RANK } from '../../../lib/incidentTier.ts'

export type MayWaitRule =
  | 'tier'
  | 'engine'
  | 'allow_list'
  | 'photo_finding'
  | 'blood_colour'
  | 'model_call'
  | 'settled'
  | 'evidence'
  | 'neighbour'
  | 'dst'

// The rules whose refusal is a fact about this incident's own photo: they write FALSE.
export const PHOTO_EVIDENCE_RULES: readonly MayWaitRule[] = ['photo_finding', 'blood_colour', 'model_call']

// ── The lists ─────────────────────────────────────────────────────────────────────

/** The contextual flags a wait may stand on, per incident type. A type not here never waits. */
export const WAIT_ALLOWED_FLAGS: Readonly<Record<string, readonly string[]>> = {
  vomit: ['repeated_vomiting'],
  stool_normal: ['repeated_loose_stool'],
  diarrhea: ['repeated_loose_stool'],
}

/** A neighbour carrying one of these is a call-now sign around the read (CUL-1611). */
export const NEIGHBOUR_REFUSING_FLAGS: readonly string[] = ['concurrent_lethargy', 'feline_reduced_intake']

/** Colours that may be blood, or say nothing (PR-27b's B3 plus decision (b)). */
export const VOMIT_WAIT_BLOCKING_COLOURS: readonly string[] = ['pink_red', 'dark_red', 'black_coffee_ground', 'mixed', 'unsure']
export const STOOL_WAIT_BLOCKING_COLOURS: readonly string[] = ['black_tarry', 'red_streaked', 'unsure']

/** Present or unclear: an unsure field cannot rule blood or foreign material out. */
const VOMIT_BLOOD_BLOCKING: readonly string[] = ['fresh_red', 'coffee_ground', 'unsure']
const STOOL_BLOOD_BLOCKING: readonly string[] = ['yes', 'unsure']
const FOREIGN_BLOCKING: readonly string[] = ['yes', 'unsure']

/** The neighbourhood: the floor's own reach either side of the vomit. */
export const MAY_WAIT_NEIGHBOUR_HOURS = FLOOR_READ_HOURS
/** Lethargy a day either side of any vomit in the run (the floor's T3 window). */
export const MAY_WAIT_LETHARGY_HOURS = FLOOR_LETHARGY_HOURS
/** The cat intake flag, as shipped (analyze-vomit/context.ts): a rated meal in the week before,
 *  no Most or All meal in the day before. Mirrored here, same question (C-34). */
export const MAY_WAIT_INTAKE_HOURS = 24
export const MAY_WAIT_INTAKE_BASELINE_HOURS = 7 * 24
/** How far past the read the DST check looks: the wait runs to the next morning, at most. */
export const MAY_WAIT_DST_AFTER_HOURS = 48

const HOUR = 3_600_000

// ── Structured-column blockers ────────────────────────────────────────────────────

export type ColumnBlocker = 'blood' | 'foreign_material' | 'colour'

/** What a row of structured columns says against waiting, across both types' column names
 *  (the table is one, so a neighbour of either type reads the same way). */
export function columnBlockers(row: Record<string, unknown> | null | undefined): ColumnBlocker[] {
  if (!row) return []
  const out = new Set<ColumnBlocker>()
  const isIn = (v: unknown, list: readonly string[]) => typeof v === 'string' && list.includes(v)
  if (isIn(row.blood_present, VOMIT_BLOOD_BLOCKING) || isIn(row.stool_blood_present, STOOL_BLOOD_BLOCKING)) out.add('blood')
  if (isIn(row.foreign_material_present, FOREIGN_BLOCKING)) out.add('foreign_material')
  if (isIn(row.colour, VOMIT_WAIT_BLOCKING_COLOURS) || isIn(row.stool_colour, STOOL_WAIT_BLOCKING_COLOURS)) out.add('colour')
  return [...out]
}

/** A stored ai_raw_payload as columns. The two types name their fields alike in the payload
 *  (`colour`, `blood_present`) and differently in the table, so the type decides the map. */
export function payloadAsColumns(incidentType: string, payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (incidentType === 'vomit') {
    return { blood_present: p.blood_present, foreign_material_present: p.foreign_material_present, colour: p.colour }
  }
  return { stool_blood_present: p.blood_present, foreign_material_present: p.foreign_material_present, stool_colour: p.colour }
}

/** The model's OWN verdict in a stored payload was a call. */
export function payloadModelCalled(payload: unknown): boolean {
  return !!payload && typeof payload === 'object' && (payload as Record<string, unknown>).recommendation === 'worth_a_call'
}

function listOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

// ── The evidence the predicate is handed ──────────────────────────────────────────

/** The write being decided. */
export interface MayWaitWrite {
  incidentType: string
  tier: string | undefined
  contextualFlags: readonly string[]
  visualFlags: readonly string[]
  status: string
}

/** This run. */
export interface MayWaitRun {
  /** Every photo on the event was read and shows the subject, or the event has none; not a
   *  rescue, not a capped run over a photo, not a partial or unreadable read. */
  settled: boolean
  /** This run's model said worth_a_call. */
  modelCalled: boolean
  /** This run's structured columns (null when no model ran). */
  columns: Record<string, unknown> | null
}

/** One neighbouring incident (a vomit or a stool within the window), never the read itself. */
export interface MayWaitNeighbour {
  eventId: string
  eventType: string
  at: string
  hasPhoto: boolean
  /** Its event_ai_analysis row, or null when it has none. */
  analysis: Record<string, unknown> | null
}

/** The record around the read. `null` from the reader means it could not be read. */
export interface MayWaitRecord {
  anchorAt: string
  nowMs: number
  species: string
  timeZone: string | null
  /** Every live vomit of the pet within twice the window either side (the floor re-run anchored
   *  on a neighbour reads a window either side of it), the read's own included when a vomit. */
  vomits: readonly FloorVomit[]
  neighbours: readonly MayWaitNeighbour[]
  lethargyAt: readonly string[]
  meals: readonly { at: string; rating: string | null }[]
}

export interface MayWaitInput {
  /** EN-3 and EN-4 both on for the record's owner. */
  floorOn: boolean
  write: MayWaitWrite
  run: MayWaitRun
  /** The stored row as read straight before this write (null: no row yet). */
  stored: Record<string, unknown> | null
  record: MayWaitRecord | null
}

export interface MayWaitVerdict {
  mayWait: boolean
  /** Every rule that refused, in the order above (empty exactly when mayWait). */
  refusedBy: MayWaitRule[]
}

// ── The checks, one per rule ───────────────────────────────────────────────────────

export function allowListHolds(write: MayWaitWrite): boolean {
  const allowed = WAIT_ALLOWED_FLAGS[write.incidentType]
  if (!allowed || write.contextualFlags.length === 0) return false
  return write.contextualFlags.every((f) => allowed.includes(f))
}

/** The three sources a photo finding can sit in for the read itself. */
function selfColumnRows(input: MayWaitInput): Record<string, unknown>[] {
  return [
    input.run.columns,
    input.stored,
    payloadAsColumns(input.write.incidentType, input.stored?.ai_raw_payload),
  ].filter((r): r is Record<string, unknown> => !!r)
}

export function noPhotoFinding(input: MayWaitInput): boolean {
  if (input.write.visualFlags.length > 0) return false
  if (listOf(input.stored?.visual_flags).length > 0) return false
  return !selfColumnRows(input).some((r) => columnBlockers(r).some((b) => b === 'blood' || b === 'foreign_material'))
}

export function noBloodColour(input: MayWaitInput): boolean {
  return !selfColumnRows(input).some((r) => columnBlockers(r).includes('colour'))
}

export function noModelCall(input: MayWaitInput): boolean {
  if (input.run.modelCalled) return false
  if (payloadModelCalled(input.stored?.ai_raw_payload)) return false
  // A stored FALSE is this incident's own photo evidence, kept after the photo is gone.
  return input.stored?.may_wait !== false
}

export function readIsSettled(input: MayWaitInput): boolean {
  if (!input.run.settled) return false
  if (input.write.status !== 'completed') return false
  return !input.stored?.edited_at
}

/** A neighbour's row says "call now", or carries a photo finding, or was never settled. */
export function neighbourRefuses(n: MayWaitNeighbour): boolean {
  const a = n.analysis
  if (!a) return n.hasPhoto
  if (n.hasPhoto && (a.status !== 'completed' || !!a.error)) return true
  if (effectiveTierRank({ tier: a.tier as string | null, recommendation: a.recommendation as string | null }) === TIER_RANK.call_now) return true
  if (listOf(a.visual_flags).length > 0) return true
  if (listOf(a.contextual_flags).some((f) => NEIGHBOUR_REFUSING_FLAGS.includes(f))) return true
  if (a.may_wait === false) return true
  if (payloadModelCalled(a.ai_raw_payload)) return true
  if (columnBlockers(a).length > 0) return true
  return columnBlockers(payloadAsColumns(n.eventType, a.ai_raw_payload)).length > 0
}

/** A rated meal in the week before `atMs`: the owner tracks intake. */
export function tracksIntakeAt(meals: MayWaitRecord['meals'], atMs: number): boolean {
  return meals.some((m) => {
    const t = Date.parse(m.at)
    return m.rating !== null && Number.isFinite(t) && t <= atMs && t >= atMs - MAY_WAIT_INTAKE_BASELINE_HOURS * HOUR
  })
}

/** The cat intake flag as shipped, evaluated at `atMs`. */
export function intakeFlagAt(meals: MayWaitRecord['meals'], atMs: number): boolean {
  const within = (iso: string, hours: number) => {
    const t = Date.parse(iso)
    return Number.isFinite(t) && t <= atMs && t >= atMs - hours * HOUR
  }
  const tracks = meals.some((m) => m.rating !== null && within(m.at, MAY_WAIT_INTAKE_BASELINE_HOURS))
  const ate = meals.some((m) => (m.rating === 'most' || m.rating === 'all') && within(m.at, MAY_WAIT_INTAKE_HOURS))
  return tracks && !ate
}

export function noCallNowAround(record: MayWaitRecord): boolean {
  const anchorMs = Date.parse(record.anchorAt)
  if (!Number.isFinite(anchorMs)) return false
  const reach = MAY_WAIT_NEIGHBOUR_HOURS * HOUR

  if (record.neighbours.some(neighbourRefuses)) return false

  // The run: the read and every neighbour inside the window.
  const runTimes = [anchorMs, ...record.neighbours.map((n) => Date.parse(n.at)).filter((t) => Number.isFinite(t) && Math.abs(t - anchorMs) <= reach)]
  const first = Math.min(...runTimes)
  const last = Math.max(...runTimes)

  // EN-4's floor, re-run on every vomit in the run, from the record (never its stored tier,
  // which a row floored before EN-4 was on does not carry).
  for (const v of record.vomits) {
    const t = Date.parse(v.at)
    if (!Number.isFinite(t) || Math.abs(t - anchorMs) > reach) continue
    const floor = incidentFloor({ anchor: v, vomits: record.vomits, lethargyAt: record.lethargyAt, species: record.species, birthDate: null })
    if (floor.tier === 'call_now') return false
  }

  // Lethargy a day either side of the run, and anything logged since, back-dated or not.
  const lethargyTo = Math.max(last + MAY_WAIT_LETHARGY_HOURS * HOUR, record.nowMs)
  if (record.lethargyAt.some((iso) => {
    const t = Date.parse(iso)
    return Number.isFinite(t) && t >= first - MAY_WAIT_LETHARGY_HOURS * HOUR && t <= lethargyTo
  })) return false

  // A cat: the intake flag at any vomit in the run, and at the read. And a cat whose meals are
  // not rated has no intake record at all: the flag's tracking guard (Pattern 6) keeps it from
  // ESCALATING on a gap in the log, and the same gap must not GRANT a night's wait either
  // (adversarial pass, finding 6: a cat inside the 48 h hepatic-lipidosis window).
  if (record.species === 'cat') {
    if (!tracksIntakeAt(record.meals, record.nowMs)) return false
    const vomitTimes = record.vomits.map((v) => Date.parse(v.at)).filter((t) => Number.isFinite(t) && Math.abs(t - anchorMs) <= reach)
    for (const t of [...vomitTimes, record.nowMs]) {
      if (intakeFlagAt(record.meals, t)) return false
    }
  }
  return true
}

/** The UTC offset (minutes) of `zone` at `atMs`, or null when the zone is not one Intl knows. */
export function utcOffsetMinutes(zone: string, atMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(new Date(atMs))
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    if (name === 'GMT') return 0
    const m = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name)
    if (!m) return null
    const minutes = Number(m[2]) * 60 + Number(m[3])
    return m[1] === '-' ? -minutes : minutes
  } catch {
    return null
  }
}

/** Whether the offset moves anywhere in [fromMs, toMs]. Every DST change holds for hours, so an
 *  hourly sample finds each one; an unknown zone answers true (refuse). */
export function dstChangeBetween(zone: string | null, fromMs: number, toMs: number): boolean {
  if (!zone || !Number.isFinite(fromMs) || !Number.isFinite(toMs)) return true
  const first = utcOffsetMinutes(zone, fromMs)
  if (first === null) return true
  for (let t = fromMs; t < toMs; t += HOUR) {
    if (utcOffsetMinutes(zone, t) !== first) return true
  }
  return utcOffsetMinutes(zone, toMs) !== first
}

export function notAcrossDst(record: MayWaitRecord): boolean {
  const anchorMs = Date.parse(record.anchorAt)
  if (!Number.isFinite(anchorMs)) return false
  const from = Math.min(anchorMs, record.nowMs) - MAY_WAIT_NEIGHBOUR_HOURS * HOUR
  const to = Math.max(anchorMs, record.nowMs) + MAY_WAIT_DST_AFTER_HOURS * HOUR
  return !dstChangeBetween(record.timeZone, from, to)
}

// ── The predicate ─────────────────────────────────────────────────────────────────

/** Whether THIS incident's own photo evidence refuses the wait (the rules that write FALSE),
 *  whatever the tier: a hold or a calm read keeps its words, but not a TRUE its photo refutes. */
export function photoEvidenceRefuses(input: MayWaitInput): boolean {
  return !noPhotoFinding(input) || !noBloodColour(input) || !noModelCall(input)
}

export function mayWaitVerdict(input: MayWaitInput): MayWaitVerdict {
  const refusedBy: MayWaitRule[] = []
  if (input.write.tier !== 'call_today') refusedBy.push('tier')
  if (!input.floorOn) refusedBy.push('engine')
  if (!allowListHolds(input.write)) refusedBy.push('allow_list')
  if (!noPhotoFinding(input)) refusedBy.push('photo_finding')
  if (!noBloodColour(input)) refusedBy.push('blood_colour')
  if (!noModelCall(input)) refusedBy.push('model_call')
  if (!readIsSettled(input)) refusedBy.push('settled')
  if (!input.record) {
    refusedBy.push('evidence')
  } else {
    if (!noCallNowAround(input.record)) refusedBy.push('neighbour')
    if (!notAcrossDst(input.record)) refusedBy.push('dst')
  }
  return { mayWait: refusedBy.length === 0, refusedBy }
}

/** The value a write of `tier` carries. TRUE only on a call today the predicate passed; FALSE on
 *  a call today its own photo refused; NULL otherwise (any other tier, or a refusal the record
 *  recomputes). A stored FALSE is never written over, whatever the tier: it is the one trace a
 *  removed photo leaves (see the header). A write that names no tier (the key off) names no
 *  may_wait either, except over a stored TRUE, which it takes back: a TRUE written before a
 *  rollback must not outlive the reads that follow it (adversarial pass, finding 4). */
export function mayWaitValue(
  tier: string | undefined,
  verdict: MayWaitVerdict | null,
  storedMayWait: unknown,
): boolean | null | undefined {
  if (tier === undefined) return storedMayWait === true ? null : undefined
  if (storedMayWait === false) return false
  if (tier !== 'call_today' || !verdict) return null
  if (verdict.mayWait) return true
  return verdict.refusedBy.some((r) => PHOTO_EVIDENCE_RULES.includes(r)) ? false : null
}
