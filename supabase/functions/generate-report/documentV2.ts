// Vet report v2 sheet 1: the document model (CUL-2290, row VR2-10; v2 spec §3.2, §5).
//
// `buildDocumentV2(snapshot, opts)` returns an ordered list of typed blocks, each with a stable id.
// Every v2 surface reads it (the print renderer now; the phone reflow, the saved copy, the email and
// the subject later), so a block that one surface prints and another does not is a parity failure,
// not a layout choice (spec §3.4).
//
// THREE RULES THIS FILE KEEPS.
//   1. It computes no number. Every count comes off the snapshot `assembleReport` built, through the
//      v2 predicates (`v2Predicates.ts`) where one answers the question (spec §3.1).
//   2. It words no flag. Every band item, the R-11 flag included, is v1's own row
//      (`render.ts` `safetyFlagRow`), so v2 can never say a finding differently from v1, and the
//      superset invariant (spec §12) is a string containment a test can check.
//   3. Text fields are PLAIN TEXT; `html` fields are already escaped fragments (v1's rows and
//      disclosures). The renderer escapes the first and interpolates the second, never the reverse.
//
// Nothing here is reached unless the server resolved `report_document_v2` on for the caller AND
// the request asked for v2 (PM ruling (a) on CUL-2290); v1's `renderReport` is untouched.
import {
  REPORT_SYMPTOM_TYPES,
  type ConcurrentChange,
  type ReportSnapshot,
  type ReportSymptomType,
  type SafetyFlag,
  type SymptomAggregate,
  SYMPTOM_WEEK_MIN_LOGGED_DAYS,
} from './report.ts'
import {
  cherryPickDisclosure,
  fmtDay,
  fmtDayYear,
  fmtLocalDay,
  fmtRange,
  h,
  lastEntryLine,
  safetyChecksText,
  safetyFlagRow,
  scopeBasisLabel,
  symptomLabel,
  truncationDisclosure,
} from './render.ts'
import {
  bandMembersOf,
  changesInWindowOf,
  flagSign,
  gapLinesOf,
  isZeroSignSheet,
  leadSignOf,
  recordEdgeLinesOf,
  THIN_RECORD_DAYS,
  thinRecordLineOf,
  type ChangeLine,
  type GapLine,
  type Lead,
  type LeadSign,
} from './v2Predicates.ts'
import { kgToLbsNum } from '../../../lib/weightUnits.ts'

// ── Constants ────────────────────────────────────────────────────────────────

/** Spec §5.4: at most three stacked sign rows on sheet 1; safety-flagged signs never overflow. */
export const SIGN_ROWS_MAX = 3
/** Course, trial and bowl lines drawn under the sign rows; the rest are named with their dates. */
export const SPAN_ROWS_MAX = 5
/** Spec §5.4: past this many weeks, paper draws 2-week bins. */
export const WEEKS_BEFORE_BINNING = 13
/** Spec §5.6: at most five owner questions, each at most 200 characters. */
export const QUESTIONS_MAX = 5
export const QUESTION_CHARS_MAX = 200
/** Spec §5.7, ruling B: the cuttable prose on sheet 1, about 200 words. The ratchet test holds
 *  each fixture under its own recorded count AND under this. */
export const SHEET1_CUTTABLE_BUDGET = 200

// ── The model ────────────────────────────────────────────────────────────────

/** One column of the lead chart: a week, a 2-week bin or a day. */
export interface ChartColumn {
  start: string
  end: string
  /** Window days the column spans (7, 14, 1, or fewer for a part column at the window's end). */
  days: number
  /** Of those, days with any log. 0 → the column is hatched (nothing logged). */
  loggedDays: number
  /** The weeks inside the column (one, or two in a 2-week bin; a day column is its own part).
   *  The read floor applies to each, never to the bin's sum (adversarial pass 2, break 2). */
  parts: Array<{ days: number; loggedDays: number }>
}

export type ChartRow =
  | {
      kind: 'sign'
      sign: ReportSymptomType
      label: string
      /** The lead row draws in concern ink; every stacked row in ink-2 (spec §5.4). */
      lead: boolean
      /** Entries per column. A 0 prints an empty cell, never a `0` (event-only signs). */
      counts: number[]
    }
  | {
      kind: 'intake'
      label: string
      lead: true
      /** Per column: rated meals, those not fully eaten, and of those the ones refused. */
      cells: Array<{ rated: number; notFinished: number; refused: number }>
    }
  | {
      kind: 'coverage'
      label: string
      lead: true
    }
  | {
      kind: 'span'
      label: string
      /** First and last column the span touches; a span running past either edge is clipped. */
      fromCol: number
      toCol: number
      /** Starts before the window (no start mark) / runs past its end (no end mark). */
      openStart: boolean
      openEnd: boolean
      /** A prescribed course with no dose logged: hollow dashed, never solid (spec §5.4). */
      hollow: boolean
      /** The owner recorded the end. Otherwise the line stops at the last logged dose with no end
       *  bracket: a closed bracket would claim an end the record does not hold (cold read 3). */
      endDeclared: boolean
      /** The twin's words for this span ("Sep 21 to Oct 11", "prescribed, no doses logged"). */
      when: string
    }

/** Every mark kind the chart can draw. The twin must name each one it draws (spec §5.4). */
export type MarkKind = 'bar' | 'empty' | 'not_read' | 'hatch' | 'partial' | 'span' | 'hollow_span' | 'intake_refused' | 'intake_partly'

export interface LeadChart {
  unit: 'week' | 'two_weeks' | 'day'
  /** The h2. Under R-11 it opens with "Flag:". */
  heading: string
  /** The code line naming why the lead was chosen; null on a coverage row. */
  reasonLine: string | null
  /** Under R-11, v1's own row for the exempt flag, printed under the heading (rule 2). */
  flagHtml: string | null
  columns: ChartColumn[]
  rows: ChartRow[]
  /** Signs and spans that did not fit, named with their counts or dates; null when all fit. */
  overflow: string | null
  /** The text twin: the only carrier of the chart's facts. */
  twin: string
  marks: MarkKind[]
}

export interface RecordLine {
  id: string
  text: string
}

export interface QuestionItem {
  n: number
  text: string
  pointer: string
}

export type BlockV2 =
  | { kind: 'masthead'; id: 'masthead'; eyebrow: string; name: string; signalment: string; conditions: string | null; window: string; lastEntryHtml: string }
  | { kind: 'disclosure'; id: 'disclosure'; html: string }
  | { kind: 'band'; id: 'band'; heading: string; items: Array<{ id: string; tag: string; html: string }>; checksHtml: string | null }
  | { kind: 'checks'; id: 'checks'; html: string }
  | { kind: 'scope_line'; id: 'scope-line'; text: string }
  | { kind: 'changes'; id: 'changes'; placement: 'band_slot' | 'under_chart'; heading: string; lines: ChangeLine[] }
  | { kind: 'record_edge'; id: 'record-edge'; lines: string[] }
  | { kind: 'lead_sentence'; id: 'lead-sentence'; text: string }
  | { kind: 'lead_chart'; id: 'lead-chart'; chart: LeadChart }
  | { kind: 'confounder'; id: 'confounder'; text: string }
  | { kind: 'record_lines'; id: 'record-lines'; lines: RecordLine[] }
  | { kind: 'gap_lines'; id: 'gap-lines'; heading: string; lines: GapLine[] }
  | { kind: 'questions'; id: 'questions'; heading: string; items: QuestionItem[] }
  | { kind: 'colophon'; id: 'colophon'; text: string }

export interface DocumentV2 {
  version: 'v2'
  sheet: 1
  blocks: BlockV2[]
}

export interface DocumentV2Options {
  /** The owner as `user_profiles` holds them. The surname comes ONLY from `last_name`, omitted when
   *  empty, and never from the email address (spec §5.7). Null: the profile could not say. */
  owner: { firstName: string | null; lastName: string | null } | null
  /** The saved copy's 4-character Crockford id (migration 113). Null on an unsaved render: the
   *  colophon then omits the segment and never makes one up (spec §5.10). */
  shortId: string | null
  /** The owner's questions, verbatim (spec §5.6). Empty until the composer (VR2-16) sends them. */
  questions: readonly string[]
}

// ── Small helpers ────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000
const REPORT_SYMPTOM_SET = new Set<string>(REPORT_SYMPTOM_TYPES)

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY)
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Strip v1's markup to the words a reader sees (for the word budget and the twin checks). */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&middot;/g, '·')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plain text of a v1 `fmtDay`-style helper, which escapes its fallback. */
function plainDay(day: string | null): string {
  return textOf(fmtDay(day))
}

// ── The masthead (one signalment builder, spec §5.7) ─────────────────────────

const SPECIES_WORD: Record<string, string> = { dog: 'Dog', cat: 'Cat' }

/** "3.73 kg (8.2 lb)": kg at the stored 2 dp, lb at 0.1 beside it (ruling W, spec §5.8). */
export function weightText(kg: number): string {
  return `${kg.toFixed(2)} kg (${kgToLbsNum(kg).toFixed(1)} lb)`
}

/** The ONE signalment line every v2 surface prints. */
export function signalmentLineOf(snap: ReportSnapshot): string {
  const s = snap.signalment
  const species = SPECIES_WORD[s.species] ?? s.species.charAt(0).toUpperCase() + s.species.slice(1)
  const sex = s.sex === 'unknown' ? 'sex not recorded' : s.sex
  const neuter = s.neuterStatus === 'not_recorded' ? 'neuter status not recorded' : s.neuterStatus
  // B-251: an approximate birth date is an entered age, never a birthday, so no "born".
  const age =
    s.ageYears === null
      ? 'age not recorded'
      : s.dateOfBirthPrecision === 'approximate' || s.dateOfBirth === null
        ? `~${s.ageYears} y`
        : `${s.ageYears} y, born ${textOf(fmtDayYear(s.dateOfBirth))}`
  const parts = [species, s.breed ?? 'breed not recorded', `${sex}, ${neuter}`, age]
  const hh = s.household
  if (hh && hh.others.length > 0) {
    const others = hh.others.map((o) => {
      const word = o.species === 'dog' ? 'dog' : o.species === 'cat' ? 'cat' : 'animal'
      const other = o.species === s.species || o.species === 'other' ? 'other ' : ''
      return `${o.count} ${other}${word}${o.count === 1 ? '' : 's'}`
    })
    // v1's provenance rides with it (CUL-979): the household is the record NOW, as the owner keeps it.
    parts.push(`lives with ${hh.complete ? '' : 'at least '}${others.join(' and ')} (owner-recorded, as of this report)`)
  }
  parts.push(s.latestWeight ? `${weightText(s.latestWeight.kg)} on ${plainDay(s.latestWeight.date)}` : 'no weight recorded')
  return parts.join(' · ')
}

/** v1's active-condition line (B-532), kept on the masthead because it frames every number. */
function conditionsLineOf(snap: ReportSnapshot): string | null {
  const active = snap.provenance.conditions.filter((c) => c.status === 'active')
  if (active.length === 0) return null
  const names = active.map((c) => (c.diagnosedAt ? `${c.name} (since ${textOf(fmtDayYear(c.diagnosedAt))})` : c.name))
  return `Recorded conditions: ${names.join(' · ')}. Owner-recorded history, not a finding in this window.`
}

function windowLineOf(snap: ReportSnapshot): string {
  const sc = snap.scope
  const basis = scopeBasisLabel(sc)
  return `${textOf(fmtRange(sc.startDate, sc.endDate))} · ${basis.charAt(0).toLowerCase()}${basis.slice(1)} · ${snap.atAGlance.loggedDays} of ${plural(snap.atAGlance.windowDays, 'day', 'days')} logged`
}

/** "Kept by Ada Okafor": the first name and, only from `last_name`, the surname. */
export function ownerNameOf(owner: DocumentV2Options['owner']): string | null {
  const first = owner?.firstName?.trim() ?? ''
  const last = owner?.lastName?.trim() ?? ''
  const name = [first, last].filter((x) => x !== '').join(' ')
  return name === '' ? null : name
}

/** The ONE colophon template (spec §5.10). "Sheet 1 of 1" until the back sheets exist. */
export function colophonOf(snap: ReportSnapshot, opts: DocumentV2Options): string {
  const owner = ownerNameOf(opts.owner)
  const generated = textOf(fmtDayYear(snap.atAGlance.recordEdge.reportDate))
  return [
    `Kept by ${owner ?? 'the owner'}`,
    'owner-reported, not a diagnosis',
    `generated ${generated}`,
    ...(opts.shortId ? [`report ${opts.shortId}`] : []),
    'sheet 1 of 1',
  ].join(' · ')
}

// ── The band (spec §5.1, §5.2) ───────────────────────────────────────────────

/** v1's row for a flag, captured as (tag, html). Photos are left out of the snapshot handed to it:
 *  v1's thumbnail points at v1's appendix E, which v2 does not print; the dated photo beside a band
 *  line is R-10's (the photo row). The flag TEXT is untouched. */
export function flagRowOf(f: SafetyFlag, snap: ReportSnapshot): { tag: string; html: string } {
  const noPhotos: ReportSnapshot = { ...snap, incidentPhotos: [] }
  let captured: { tag: string; html: string } | null = null
  safetyFlagRow(f, noPhotos, (tag, body) => {
    captured = { tag, html: body }
    return ''
  })
  if (captured === null) throw new Error(`safetyFlagRow wrote no row for ${f.kind}`)
  return captured
}

/** v1's "ran and did not trigger" sentence, word for word (CUL-2003; PM ruling 2026-10-19). */
function checksHtmlOf(snap: ReportSnapshot): string | null {
  const checked = safetyChecksText(snap)
  if (checked === null) return null
  const body = [checked.lead === null ? '' : `Ran and did not trigger, which does not rule these out: ${checked.lead}`, ...checked.rest]
    .filter((x) => x !== '')
    .join(' ')
  return body === '' ? null : body
}

function flagId(f: SafetyFlag, i: number): string {
  const sign = 'symptomType' in f ? `-${f.symptomType}` : 'source' in f ? `-${f.source}` : ''
  return `band-${i + 1}-${f.kind}${sign}`
}

// ── The lead chart (spec §5.4) ──────────────────────────────────────────────

function windowDayKeys(snap: ReportSnapshot): string[] {
  const n = daysBetween(snap.scope.startDate, snap.scope.endDate) + 1
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(snap.scope.startDate, i))
}

/** The week columns, from the symptom aggregates' own buckets (every aggregate shares them). */
function weekColumns(snap: ReportSnapshot): ChartColumn[] {
  const a = snap.symptoms[0]
  const logged = new Set(snap.v2.loggedDayKeys)
  if (a) {
    return a.bucketStartDates.map((start, i) => ({
      start,
      end: addDays(start, a.bucketDays[i] - 1),
      days: a.bucketDays[i],
      loggedDays: a.loggedDaysByBucket[i],
      parts: [{ days: a.bucketDays[i], loggedDays: a.loggedDaysByBucket[i] }],
    }))
  }
  // No aggregate (no symptom type in the window): the same 7-day anchoring from the window start.
  const days = windowDayKeys(snap)
  const out: ChartColumn[] = []
  for (let i = 0; i < days.length; i += 7) {
    const slice = days.slice(i, i + 7)
    const l = slice.filter((d) => logged.has(d)).length
    out.push({ start: slice[0], end: slice[slice.length - 1], days: slice.length, loggedDays: l, parts: [{ days: slice.length, loggedDays: l }] })
  }
  return out
}

function binPairs(cols: ChartColumn[]): ChartColumn[] {
  const out: ChartColumn[] = []
  for (let i = 0; i < cols.length; i += 2) {
    const a = cols[i]
    const b = cols[i + 1]
    out.push(b ? { start: a.start, end: b.end, days: a.days + b.days, loggedDays: a.loggedDays + b.loggedDays, parts: [...a.parts, ...b.parts] } : a)
  }
  return out
}

function sumPairs(xs: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < xs.length; i += 2) out.push(xs[i] + (xs[i + 1] ?? 0))
  return out
}

/** Which signs get a row, lead first: the safety-flagged ones always, then by days with an entry. */
function chartSigns(snap: ReportSnapshot, lead: Lead | null): { rows: SymptomAggregate[]; overflow: SymptomAggregate[] } {
  const logged = snap.symptoms.filter((s) => s.count > 0)
  const flagged = new Set<string>()
  for (const f of snap.safetyFlags) {
    const s = flagSign(f)
    if (s !== null && s !== 'intake') flagged.add(s)
  }
  const order = (a: SymptomAggregate, b: SymptomAggregate): number =>
    Number(b.type === lead?.sign) - Number(a.type === lead?.sign) ||
    Number(flagged.has(b.type)) - Number(flagged.has(a.type)) ||
    b.symptomDays - a.symptomDays ||
    b.count - a.count ||
    REPORT_SYMPTOM_TYPES.indexOf(a.type) - REPORT_SYMPTOM_TYPES.indexOf(b.type)
  const sorted = [...logged].sort(order)
  const max = lead?.sign === 'intake' ? SIGN_ROWS_MAX - 1 : SIGN_ROWS_MAX
  const rows: SymptomAggregate[] = []
  const overflow: SymptomAggregate[] = []
  for (const s of sorted) {
    if (rows.length < max || flagged.has(s.type)) rows.push(s)
    else overflow.push(s)
  }
  return { rows, overflow }
}

/** The medication a change line is about, when there is exactly one. */
function medicationFor(snap: ReportSnapshot, c: ConcurrentChange) {
  if (c.kind !== 'medication' && c.kind !== 'supplement') return null
  const hits = snap.medications.filter((m) => m.overlapsWindow && c.label.toLowerCase().includes(m.drugName.toLowerCase()))
  return hits.length === 1 ? hits[0] : null
}

function colOf(cols: ChartColumn[], day: string): number {
  for (let i = 0; i < cols.length; i++) if (day <= cols[i].end) return i
  return cols.length - 1
}

function spanRows(snap: ReportSnapshot, cols: ChartColumn[]): { rows: Extract<ChartRow, { kind: 'span' }>[]; overflow: string[] } {
  const rows: Extract<ChartRow, { kind: 'span' }>[] = []
  const overflow: string[] = []
  const windowStart = snap.scope.startDate
  for (const c of snap.concurrentChanges) {
    const start = c.startDate && c.startDate.slice(0, 10) >= windowStart ? c.startDate.slice(0, 10) : null
    const end = c.endInWindow ? c.endInWindow.slice(0, 10) : null
    const med = medicationFor(snap, c)
    const none = med !== null && med.courseDays.given === 0 && med.courseDays.loggedNotGiven === 0
    const from = start === null ? (c.startDate ? `from ${plainDay(c.startDate.slice(0, 10))} (before this window)` : 'start not recorded') : `from ${plainDay(start)}`
    const to = end === null ? 'through the window' : c.endIsDeclared ? `to ${plainDay(end)}` : `to ${plainDay(end)} (last dose logged)`
    const span = `${from}${start === null && !c.startDate ? ',' : ''} ${to}`
    const when = none ? `prescribed ${span}, no doses logged` : span
    const first = cols[0]?.start ?? windowStart
    // A course that ended before the first drawn column (a day row starting at the first entry)
    // is not drawn over that column; it is named under the chart instead (adversarial pass 1, 6).
    if (end !== null && end < first) {
      overflow.push(`${c.label} ${when}, before the first day drawn`)
      continue
    }
    const startsInChart = start !== null && start >= first
    const row: Extract<ChartRow, { kind: 'span' }> = {
      kind: 'span',
      label: c.label,
      fromCol: startsInChart ? colOf(cols, start) : 0,
      toCol: end === null ? cols.length - 1 : colOf(cols, end),
      openStart: !startsInChart,
      openEnd: end === null,
      hollow: none,
      endDeclared: c.endIsDeclared,
      when,
    }
    if (rows.length < SPAN_ROWS_MAX) rows.push(row)
    else overflow.push(`${c.label} ${when}`)
  }
  return { rows, overflow }
}

function colLabel(c: ChartColumn, unit: LeadChart['unit']): string | null {
  if (unit === 'day') return null
  const full = unit === 'week' ? 7 : 14
  if (c.days < full) return `${c.days}-day ${unit === 'week' ? 'week' : 'bin'}${c.loggedDays < c.days ? `, logged ${c.loggedDays} of ${c.days}` : ''}`
  if (c.loggedDays === 0) return null
  if (c.loggedDays < c.days) return `logged ${c.loggedDays} of ${c.days}`
  return null
}

/**
 * The fewest logged days a column needs before an empty cell may read "none" (CUL-1995, mirrored:
 * the same question as v1's symptom chart, "is this week logged densely enough that an absence may
 * be read?"). Scaled by the column's weeks; a day column is read whenever it was logged.
 */
export function readFloor(unit: LeadChart['unit']): number {
  return unit === 'day' ? 1 : SYMPTOM_WEEK_MIN_LOGGED_DAYS
}

/** An empty cell may read "none" only when EVERY week in its column clears the floor. v1 holds
 *  the floor absolute, so a short part week is never read either (render.ts, CUL-1995). */
export function notReadCol(col: ChartColumn, unit: LeadChart['unit']): boolean {
  return col.loggedDays > 0 && col.parts.some((p) => p.loggedDays < readFloor(unit))
}

/** One word per cell, in the twin's register. An empty cell under the floor is "not read", never
 *  "none": two logged days of seven cannot say a sign was absent that week (cold read, CUL-2290). */
function cellWord(count: number, col: ChartColumn, unit: LeadChart['unit']): string {
  if (count > 0) return String(count)
  if (col.loggedDays === 0) return 'nothing logged'
  if (!notReadCol(col, unit)) return 'none'
  return col.loggedDays === col.days ? `not read (a ${col.days}-day ${unit === 'two_weeks' ? 'bin' : 'week'})` : `not read (logged ${col.loggedDays} of ${col.days})`
}

function buildLeadChart(snap: ReportSnapshot, lead: Lead | null, leadFlag: Extract<SafetyFlag, { kind: 'chronicity' }> | null): LeadChart {
  // A zero-sign sheet leads with coverage (round 5's c′), EXCEPT when intake leads because it is
  // flagged: then the chart is the measure the flag fired on, never a row of logged days
  // (adversarial pass 1 on CUL-2290, break 2: the 48-hour refusal cat drew 31 solid bars).
  const zeroSign = isZeroSignSheet(snap) && !(lead?.sign === 'intake' && lead.reason === 'flag')
  const windowDays = snap.atAGlance.windowDays
  const marks = new Set<MarkKind>()

  // The unit. A window under the 14-day constant draws a day row (spec §5.1) unless intake leads,
  // whose ratings the snapshot carries by week only; past 13 weeks, 2-week bins (spec §5.4).
  let unit: LeadChart['unit'] = 'week'
  let columns = weekColumns(snap)
  const logged = new Set(snap.v2.loggedDayKeys)
  // Ruling T's "below a 14-day constant" reads both ways: a window that short, or so few days
  // logged. With few days logged the row starts at the first of them, and the twin says so, so
  // ninety days of hatch never stand in for a record that began last week.
  const fewLogged = snap.atAGlance.loggedDays < THIN_RECORD_DAYS && snap.v2.loggedDayKeys.length > 0
  let dayRowFrom: string | null = null
  if (((windowDays < THIN_RECORD_DAYS || fewLogged) && lead?.sign !== 'intake') || zeroSign) {
    unit = 'day'
    const days = windowDayKeys(snap)
    const first = fewLogged ? snap.v2.loggedDayKeys[0] : null
    dayRowFrom = first !== null && first > snap.scope.startDate ? first : null
    columns = days
      .filter((d) => dayRowFrom === null || d >= dayRowFrom)
      .map((d) => ({ start: d, end: d, days: 1, loggedDays: logged.has(d) ? 1 : 0, parts: [{ days: 1, loggedDays: logged.has(d) ? 1 : 0 }] }))
  } else if (columns.length > WEEKS_BEFORE_BINNING) {
    unit = 'two_weeks'
    columns = binPairs(columns)
  }
  const perCol = (weekly: number[], sign: ReportSymptomType): number[] => {
    if (unit === 'day') {
      const byDay = new Map(snap.v2.symptomDayCounts.filter((x) => x.type === sign).map((x) => [x.day, x.count]))
      return columns.map((c) => byDay.get(c.start) ?? 0)
    }
    return unit === 'two_weeks' ? sumPairs(weekly) : weekly
  }

  const startLabel = plainDay(columns[0]?.start ?? snap.scope.startDate)
  const rows: ChartRow[] = []
  const twinParts: string[] = []
  const overflowParts: string[] = []
  const unitWord = unit === 'day' ? 'day' : unit === 'week' ? 'week' : '2 weeks'

  if (zeroSign) {
    rows.push({ kind: 'coverage', label: 'Logged', lead: true })
    const hatched = columns.filter((c) => c.loggedDays === 0).map((c) => plainDay(c.start))
    if (columns.some((c) => c.loggedDays > 0)) marks.add('bar')
    if (hatched.length > 0) marks.add('hatch')
    twinParts.push(
      `${snap.atAGlance.loggedDays} of ${plural(columns.length, 'day carries', 'days carry')} an entry` +
        (hatched.length > 0 ? `; hatched, nothing logged: ${hatched.join(', ')}` : ''),
    )
  } else {
    if (lead?.sign === 'intake') {
      const weeks = snap.v2.intakeWeeks
      const cells =
        unit === 'two_weeks'
          ? sumPairs(weeks.map((w) => w.rated)).map((rated, i) => ({
              rated,
              notFinished: sumPairs(weeks.map((w) => w.notFinished))[i],
              refused: sumPairs(weeks.map((w) => w.refused))[i],
            }))
          : weeks
      rows.push({ kind: 'intake', label: 'Meals not finished', lead: true, cells })
      const words = cells.map((c, i) =>
        c.rated === 0 ? (columns[i]?.loggedDays === 0 ? 'nothing logged' : 'none rated') : `${c.notFinished} of ${c.rated}${c.refused > 0 ? ` (${c.refused} refused)` : ''}`,
      )
      if (cells.some((c) => c.refused > 0)) marks.add('intake_refused')
      if (cells.some((c) => c.notFinished - c.refused > 0)) marks.add('intake_partly')
      const fills = [
        ...(marks.has('intake_refused') ? ['refused drawn solid'] : []),
        ...(marks.has('intake_partly') ? ['partly eaten drawn light'] : []),
      ]
      const bowl = snap.v2.intakeWeeksBowlExcluded
      const bowlNote = bowl > 0 ? `, not counting ${plural(bowl, 'rating', 'ratings')} of a free-fed bowl, which the intake check does not read` : ''
      twinParts.push(`meals not finished, of those rated${fills.length > 0 ? ` (${fills.join(', ')})` : ''}${bowlNote}: ${words.join(', ')}`)
    }
    const { rows: signRows, overflow } = chartSigns(snap, lead)
    for (const s of signRows) {
      const counts = perCol(s.weeklyBuckets, s.type)
      rows.push({ kind: 'sign', sign: s.type, label: symptomLabel(s.type), lead: lead?.sign === s.type, counts })
      if (counts.some((n) => n > 0)) marks.add('bar')
      if (counts.some((n, i) => n === 0 && columns[i].loggedDays > 0 && !notReadCol(columns[i], unit))) marks.add('empty')
      if (counts.some((n, i) => n === 0 && notReadCol(columns[i], unit))) marks.add('not_read')
      twinParts.push(`${symptomLabel(s.type).toLowerCase()} ${counts.map((n, i) => cellWord(n, columns[i], unit)).join(', ')}`)
    }
    if (overflow.length > 0) {
      overflowParts.push(`also logged: ${overflow.map((s) => `${symptomLabel(s.type).toLowerCase()} ${plural(s.count, 'entry', 'entries')}`).join('; ')}`)
    }
    if (columns.some((c) => c.loggedDays === 0)) marks.add('hatch')
  }

  // Course, trial and bowl lines (spec §5.4: a solid bracketed line; hollow dashed with no doses).
  const spans = spanRows(snap, columns)
  for (const r of spans.rows) {
    rows.push(r)
    marks.add(r.hollow ? 'hollow_span' : 'span')
  }
  if (spans.overflow.length > 0) overflowParts.push(`also running: ${spans.overflow.join('; ')}`)
  const solid = spans.rows.filter((r) => !r.hollow)
  const hollow = spans.rows.filter((r) => r.hollow)
  if (solid.length > 0) twinParts.push(`Bracketed lines, courses and foods: ${solid.map((r) => `${r.label} ${r.when}`).join('; ')}`)
  if (hollow.length > 0) twinParts.push(`Hollow dashed line: ${hollow.map((r) => `${r.label}, ${r.when}`).join('; ')}`)

  const partials = columns
    .map((c, i) => ({ c, i, l: colLabel(c, unit) }))
    .filter((x) => x.l !== null)
  if (partials.length > 0) marks.add('partial')
  const fromNote = dayRowFrom !== null ? `, the first day with an entry in this window` : ''
  const head = `By ${unitWord} from ${startLabel}${fromNote}${
    partials.length > 0 ? ` (${partials.map((x) => `${unit === 'day' ? 'day' : unit === 'week' ? 'week' : 'bin'} ${x.i + 1} ${x.l}${x.i === columns.length - 1 && x.c.days < (unit === 'week' ? 7 : 14) ? ', so far' : ''}`).join('; ')})` : ''
  }`
  const hatchNote =
    !zeroSign && columns.some((c) => c.loggedDays === 0)
      ? `; hatched, nothing logged: ${columns.filter((c) => c.loggedDays === 0).map((c) => plainDay(c.start)).join(', ')}`
      : ''
  const scale = rows.filter((r) => r.kind === 'sign').length > 1 ? ', one scale on every row' : ''
  const entriesWord = zeroSign ? '' : `, entries each ${unit === 'day' ? 'day' : unit === 'week' ? 'week' : '2 weeks'}${scale}`
  const twin = `${head}${entriesWord}: ${twinParts.join('; ')}${hatchNote}.${overflowParts.length > 0 ? ` Not drawn, ${overflowParts.join('; ')}.` : ''}`

  const leadLabel =
    zeroSign ? 'Days logged' : lead?.sign === 'intake' ? 'Meals not finished' : lead ? symptomLabel(lead.sign) : 'Entries'
  const byWord = unit === 'day' ? 'by day' : unit === 'week' ? 'by week' : 'by 2 weeks'
  const flag = leadFlag ? flagRowOf(leadFlag, snap) : null
  const heading = leadFlag
    ? `Flag: ${symptomLabel(leadFlag.symptomType).toLowerCase()} over at least ${leadFlag.spanDays} days, the trial’s own sign`
    : zeroSign
      ? `${leadLabel}, from ${startLabel}`
      : `${leadLabel} ${byWord}, from ${startLabel}`
  return {
    unit,
    heading,
    reasonLine: zeroSign ? null : (lead?.line ?? null),
    flagHtml: flag ? flag.html : null,
    columns,
    rows,
    overflow: overflowParts.length > 0 ? overflowParts.join('; ') : null,
    twin,
    marks: [...marks],
  }
}

// ── Record lines (spec §4's line ranker, §5.7) ──────────────────────────────

/** v1's absence sentence, verbatim (render.ts `symptomPanel`'s empty state). */
const ABSENCE_SENTENCE = 'No symptom events were logged in this window. Absence of a log is not evidence a symptom did not occur.'

function signLine(snap: ReportSnapshot, s: SymptomAggregate): RecordLine {
  const last = s.lastOnset ? textOf(fmtLocalDay(s.lastOnset, snap.timezone)) : null
  // WBC-10: bars count entries, a flag states episodes. Where a chronicity flag on this sign states
  // a different number, both print here, so the two never sit unexplained on one sheet.
  const chronic = snap.safetyFlags.find((f) => f.kind === 'chronicity' && f.symptomType === s.type)
  const episodes =
    chronic && chronic.kind === 'chronicity' && chronic.episodeCount !== s.count
      ? ` (${plural(chronic.episodeCount, 'episode', 'episodes')} as the flag counts them)`
      : ''
  return {
    id: `sign-${s.type}`,
    text: `${symptomLabel(s.type)}: ${plural(s.count, 'entry', 'entries')}${episodes} on ${s.symptomDays} of ${plural(s.loggedDays, 'logged day', 'logged days')}${last ? `, the last ${last}` : ''}.`,
  }
}

function intakeLine(snap: ReportSnapshot): RecordLine | null {
  const v = snap.v2
  if (v.loggedMeals === 0) return null
  const freeFed = snap.diet.freeFed.length > 0
  const mc = snap.diet.mealCompletion
  const notFinished = mc ? mc.ratedMeals - mc.finishedMeals : null
  const parts = [`${v.loggedMeals} logged`, `${v.ratedMeals} rated`]
  // v1's run (CUL-1978): "40 of 44 fully eaten" read as a dog who eats fine while the last four
  // were not. The same floor as v1's `recentNotFullyEatenRun`: 2 or more, and not every meal.
  const run = mc?.recentNotFullyEatenRun ?? 0
  const runText = mc && run >= 2 && run < mc.ratedMeals ? `The last ${run} rated meals in a row were not fully eaten. ` : ''
  // Refused outright is said apart from "not fully eaten" (cold read 3, Mira: 34 of 38 refused read
  // as partial intake). Same population as `finishedMeals`, from `intakeBreakdown`.
  const refused = mc?.intakeBreakdown.find((b) => b.rating === 'refused')?.count ?? 0
  const refusedText = refused > 0 ? ` (${refused} refused outright)` : ''
  if (notFinished !== null && notFinished > 0) parts.push(`${notFinished} not fully eaten${refusedText}, on ${plural(v.mealNotFinishedDays, 'day', 'days')}`)
  else if (notFinished === 0 && v.ratedMeals > 0) parts.push('every rated meal recorded as fully eaten')
  // B-040's words, verbatim: a bowl left down means no one watched what was eaten from it.
  const bowls = snap.diet.freeFed.map((b) => b.foodLabel ?? 'a food not named').join(', ')
  return { id: 'intake', text: `Meals (logged as meals, not treats): ${runText}${parts.join('; ')}.${freeFed ? ` Free-fed: ${bowls}. Intake not directly observed.` : ''}` }
}

function trialLine(snap: ReportSnapshot): RecordLine | null {
  const t = snap.trial
  if (!t) return null
  const labels = t.trialDietLabels
  const foods =
    labels.length === 0 ? 'a diet trial' : labels.length <= 2 ? labels.join(' and ') : `${labels[0]} and ${labels.length - 1} other trial foods`
  const start = textOf(fmtDayYear(t.startedAt.slice(0, 10)))
  const ended = t.endedAt
    ? `, ${t.status === 'abandoned' ? 'stopped' : 'ended'} ${textOf(fmtDayYear(t.endedAt.slice(0, 10)))}`
    : t.daysPastTarget > 0
      ? `, day ${t.dayCounter}, ${plural(t.daysPastTarget, 'day', 'days')} past its planned ${t.targetDurationDays}`
      : `, day ${t.dayCounter} of ${t.targetDurationDays}`
  const planned = t.endedAt ? `; planned for ${t.targetDurationDays} days` : ''
  return { id: 'trial', text: `Diet trial (owner-entered): ${foods}, from ${start}${ended}${planned}.` }
}

function medicationLines(snap: ReportSnapshot): RecordLine[] {
  // A course with nothing logged as given prints no line here: "given on 0 of 21" reads as "not
  // given" where the record says "not logged", and the gap line already states the unlogged days
  // (spec §5.7, a fact prints once).
  return snap.medications
    .filter((m) => m.overlapsWindow && (m.courseDays.given > 0 || m.courseDays.loggedNotGiven > 0))
    .map((m) => {
      const c = m.courseDays
      const total = c.given + c.loggedNotGiven + c.nothingLogged
      const kind = m.isSupplement ? ' (entered as a supplement)' : ''
      const body =
        total === 0
          ? 'no course days in this window'
          : `given on ${c.given} of ${plural(total, 'course day', 'course days')}${c.loggedNotGiven > 0 ? `, logged as not given on ${c.loggedNotGiven}` : ''}`
      return { id: `medication-${m.regimenId}`, text: `${m.drugName}${kind}: ${body}.` }
    })
}

function noticedLine(snap: ReportSnapshot): RecordLine | null {
  const n = snap.noticed
  if (!n) return null
  const words = [...n.concernWords]
    .filter((w) => w.dayCount > 0)
    .sort((a, b) => b.dayCount - a.dayCount || a.key.localeCompare(b.key))
    .map((w) => {
      const first = plainDay(w.firstDay)
      const when =
        w.dayCount === 1 && w.firstDayInWindow
          ? ` (${first})`
          : w.firstDayInWindow
            ? `, the first ${first}`
            : `, first marked ${textOf(fmtDayYear(w.firstDay))}, before this window`
      return `“${w.label}” on ${w.dayCount}${when}`
    })
  return {
    id: 'noticed',
    text: `Noticed: answered on ${n.answeredDays} of ${plural(snap.atAGlance.windowDays, 'day', 'days')}${words.length > 0 ? `; ${words.join(', ')}` : ''}.`,
  }
}

function coverageLine(snap: ReportSnapshot, zeroSign: boolean): RecordLine {
  const ag = snap.atAGlance
  return { id: 'coverage', text: `${ag.loggedDays} of ${plural(ag.windowDays, 'day', 'days')} logged.${zeroSign ? ` ${ABSENCE_SENTENCE}` : ''}` }
}

/**
 * The ranked lines. Coverage first on a zero-sign sheet or when a record-edge line holds (spec §4's
 * ranker); then the lead sign; intake within the top three; then the other signs, the trial, the
 * courses and Noticed. The first line becomes the serif sentence (spec §5.3).
 */
function recordLinesOf(snap: ReportSnapshot, lead: Lead | null, edgeHolds: boolean): RecordLine[] {
  const zeroSign = isZeroSignSheet(snap)
  // When intake leads because it is flagged, the meals line is the sheet's sentence, never the
  // absence sentence (adversarial pass 2, break 1: the 48-hour refusal cat opened on "No symptom
  // events were logged"). The coverage line, absence sentence included, still prints, second.
  const intakeFlagLead = lead?.sign === 'intake' && lead.reason === 'flag'
  const out: RecordLine[] = []
  if ((zeroSign || edgeHolds) && !intakeFlagLead) out.push(coverageLine(snap, zeroSign))
  const signs = snap.symptoms.filter((s) => s.count > 0)
  const leadAgg = signs.find((s) => s.type === lead?.sign)
  if (leadAgg) out.push(signLine(snap, leadAgg))
  const intake = intakeLine(snap)
  if (intake) out.splice(intakeFlagLead ? 0 : Math.min(out.length, 2), 0, intake)
  if (intakeFlagLead && (zeroSign || edgeHolds)) out.splice(intake ? 1 : 0, 0, coverageLine(snap, zeroSign))
  const { rows, overflow } = chartSigns(snap, lead)
  for (const s of [...rows, ...overflow]) if (s !== leadAgg) out.push(signLine(snap, s))
  const trial = trialLine(snap)
  if (trial) out.push(trial)
  out.push(...medicationLines(snap))
  const noticed = noticedLine(snap)
  if (noticed) out.push(noticed)
  return out
}

/** The confounder line: what overlaps a trial, as recorded (spec §5 order, v1 §7.2's caveat). */
function confounderOf(snap: ReportSnapshot): string | null {
  const t = snap.trial
  if (!t) return null
  // A bowl left down beside a trial is a competing food the trial cannot exclude (cold read on
  // CUL-2290, Mira): named here, beside the trial, not only on the meals line.
  const bowls = snap.diet.freeFed.map((b) => b.foodLabel ?? 'a food not named')
  const bowl = bowls.length > 0 ? ` A free-fed bowl was down in this window (${bowls.join(', ')}): intake not directly observed, and the trial cannot exclude it.` : ''
  if (t.medicationOverlap.length === 0) {
    return `No medication or supplement is recorded as overlapping the trial in this window, not checked with the owner.${bowl}`
  }
  const items = t.medicationOverlap.map((m) => {
    const from = plainDay(m.fromDate)
    const to = plainDay(m.toDate)
    return `${m.drugName}${m.isSupplement ? ' (entered as a supplement)' : ''}, overlapping it ${from} to ${to}${m.activeAtWindowEnd ? ' (its course has no recorded end)' : ''}`
  })
  const abx = t.medicationOverlap.some((m) => m.antibacterialInGiTrial)
    ? ' An antibacterial course overlaps a GI trial: a steroid’s effect withdraws when it stops, a course’s effect on the microbiome does not.'
    : ''
  return `Not a test of the diet alone. Overlapping the trial: ${items.join('; ')}. Spans are the courses as recorded, not evidence of administration.${abx}${bowl}`
}

// ── The document ─────────────────────────────────────────────────────────────

export function buildDocumentV2(snap: ReportSnapshot, opts: DocumentV2Options): DocumentV2 {
  const blocks: BlockV2[] = []
  const zeroSign = isZeroSignSheet(snap)

  blocks.push({
    kind: 'masthead',
    id: 'masthead',
    eyebrow: 'Owner’s home log',
    name: snap.signalment.name,
    signalment: signalmentLineOf(snap),
    conditions: conditionsLineOf(snap),
    window: windowLineOf(snap),
    lastEntryHtml: lastEntryLine(snap),
  })

  // v1's page-1 disclosures (the cherry-pick guard, a record that could not be read in full) carry
  // over word for word: each one stops a short or hand-cropped record reading as a whole one.
  const disclosure = `${cherryPickDisclosure(snap)}${truncationDisclosure(snap)}`.trim()
  if (disclosure !== '') blocks.push({ kind: 'disclosure', id: 'disclosure', html: disclosure })

  const { band, leadFlag } = bandMembersOf(snap)
  const checks = checksHtmlOf(snap)
  if (band.length > 0) {
    blocks.push({
      kind: 'band',
      id: 'band',
      heading: `Flags for the vet · ${band.length}`,
      items: band.map((f, i) => ({ id: flagId(f, i), ...flagRowOf(f, snap) })),
      checksHtml: checks,
    })
  } else if (checks !== null) {
    blocks.push({ kind: 'checks', id: 'checks', html: checks })
  }

  const thin = thinRecordLineOf(snap)
  if (thin) blocks.push({ kind: 'scope_line', id: 'scope-line', text: thin.text })

  // CUL-2323 + CUL-2340 (PM ruling (a)): the line prints whenever an entry holds, on every sheet.
  // `isZeroSignSheet` chooses only WHERE: the band's slot on a zero-sign sheet, under the lead chart
  // otherwise. Never framed like the band, never called a flag.
  const changes = changesInWindowOf(snap)
  const changesBlock: BlockV2 | null = changes
    ? { kind: 'changes', id: 'changes', placement: zeroSign ? 'band_slot' : 'under_chart', heading: 'Changes in this window', lines: changes }
    : null
  if (changesBlock && zeroSign) blocks.push(changesBlock)

  const edge = recordEdgeLinesOf(snap)
  if (edge.length > 0) blocks.push({ kind: 'record_edge', id: 'record-edge', lines: edge.map((l) => l.text) })

  const lead = leadSignOf(snap)
  const lines = recordLinesOf(snap, lead, edge.length > 0)
  if (lines.length > 0) blocks.push({ kind: 'lead_sentence', id: 'lead-sentence', text: lines[0].text })

  blocks.push({ kind: 'lead_chart', id: 'lead-chart', chart: buildLeadChart(snap, lead, leadFlag) })
  if (changesBlock && !zeroSign) blocks.push(changesBlock)

  const confounder = confounderOf(snap)
  if (confounder) blocks.push({ kind: 'confounder', id: 'confounder', text: confounder })

  if (lines.length > 1) blocks.push({ kind: 'record_lines', id: 'record-lines', lines: lines.slice(1) })

  const gaps = gapLinesOf(snap)
  if (gaps.length > 0) blocks.push({ kind: 'gap_lines', id: 'gap-lines', heading: 'Not in this record', lines: gaps })

  const questions = opts.questions
    .map((q) => q.trim())
    .filter((q) => q !== '')
    .slice(0, QUESTIONS_MAX)
    .map((q) => q.slice(0, QUESTION_CHARS_MAX))
  if (questions.length > 0) {
    // Spec §5.6: no `source_ref` yet, so each points at the report; whenever a band prints, at it too.
    const pointer = band.length > 0 || leadFlag ? 'record: this report and its flags' : 'record: this report'
    blocks.push({ kind: 'questions', id: 'questions', heading: 'The owner’s questions', items: questions.map((text, i) => ({ n: i + 1, text, pointer })) })
  }

  blocks.push({ kind: 'colophon', id: 'colophon', text: colophonOf(snap, opts) })
  return { version: 'v2', sheet: 1, blocks }
}

// ── The word budget (ruling B, spec §5.7) ───────────────────────────────────

export interface WordCount {
  /** The prose that can be cut: the lead sentence, the record lines, the confounder, the gap lines. */
  cuttable: number
  /** Reported beside it, never trimmed: masthead, band (checks and an R-11 flag included), scope
   *  line, twin, colophon, and the other required lines (changes, record edge, disclosures, the
   *  owner's questions) so their growth stays visible too. */
  fixed: {
    masthead: number
    band: number
    scopeLine: number
    twin: number
    colophon: number
    changes: number
    recordEdge: number
    disclosure: number
    questions: number
  }
}

function words(text: string): number {
  const t = text.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}

export function wordCountOf(doc: DocumentV2): WordCount {
  let cuttable = 0
  const fixed = { masthead: 0, band: 0, scopeLine: 0, twin: 0, colophon: 0, changes: 0, recordEdge: 0, disclosure: 0, questions: 0 }
  for (const b of doc.blocks) {
    switch (b.kind) {
      case 'lead_sentence':
      case 'confounder':
        cuttable += words(b.text)
        break
      case 'record_lines':
        cuttable += b.lines.reduce((n, l) => n + words(l.text), 0)
        break
      case 'gap_lines':
        cuttable += b.lines.reduce((n, l) => n + words(l.text), 0)
        break
      case 'masthead':
        fixed.masthead += words([b.eyebrow, b.name, b.signalment, b.conditions ?? '', b.window, textOf(b.lastEntryHtml)].join(' '))
        break
      case 'band':
        fixed.band += words([b.heading, ...b.items.map((i) => `${i.tag} ${textOf(i.html)}`), textOf(b.checksHtml ?? '')].join(' '))
        break
      case 'checks':
        fixed.band += words(textOf(b.html))
        break
      case 'scope_line':
        fixed.scopeLine += words(b.text)
        break
      case 'lead_chart':
        fixed.twin += words(b.chart.twin)
        if (b.chart.flagHtml) fixed.band += words(`${b.chart.heading} ${textOf(b.chart.flagHtml)}`)
        break
      case 'changes':
        fixed.changes += words([b.heading, ...b.lines.map((l) => l.text)].join(' '))
        break
      case 'record_edge':
        fixed.recordEdge += words(b.lines.join(' '))
        break
      case 'disclosure':
        fixed.disclosure += words(textOf(b.html))
        break
      case 'questions':
        fixed.questions += words(b.items.map((q) => q.text).join(' '))
        break
      case 'colophon':
        fixed.colophon += words(b.text)
        break
      default:
        break
    }
  }
  return { cuttable, fixed }
}

/** Escape helper re-exported so the renderer has one escaping function, v1's. */
export { h }
