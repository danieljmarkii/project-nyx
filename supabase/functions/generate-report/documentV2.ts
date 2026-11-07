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
import { leftOutBandLine } from './photoLeaveOut.ts'
import {
  REPORT_SYMPTOM_TYPES,
  type CheckOutcome,
  type ConcurrentChange,
  type IncidentPhotoLeftOut,
  type ReportSnapshot,
  type ReportSymptomType,
  type SafetyFlag,
  type SymptomAggregate,
  type SymptomLogEntry as SymptomLogTimeFields,
  SYMPTOM_WEEK_MIN_LOGGED_DAYS,
} from './report.ts'
import {
  cherryPickDisclosure,
  chronicitySpanDaysShown,
  fmtDay,
  fmtDayYear,
  fmtLocalDay,
  fmtRange,
  h,
  lastEntryLine,
  safetyChecksText,
  fmtLocalTime,
  fmtDayScopedTo,
  localDayKeyOf,
  safetyFlagRow,
  timeConfidence,
  scopeBasisLabel,
  V1_FLAG_POINTERS,
  type FlagPointers,
  symptomLabel,
  truncationDisclosure,
  utcNotice,
  hydrolysedIntactText,
} from './render.ts'
import {
  bandMembersOf,
  changesInWindowOf,
  concernWordDaysOf,
  datesClauseOf,
  mealTotalsOf,
  unfinishedMealDaysOf,
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
import { backSheetsOf, episodesBlock, TRIAL_READING_LABEL, trialHeadingOf, trialReadingOf, trialRowsOf, v2FlagPointersOf, type BackSheetV2 } from './backSheetsV2.ts'
import { carriedSectionsOf } from './sheet1CarryV2.ts'
import { adHocGroupOf, withRecordOverlaps } from './medicationFacts.ts'

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
      /**
       * CUL-2360: where the line starts and stops, in column units on the day's own place inside its
       * column (`dayPos`), so a course drawn over weeks sits on its dates, never a column's centre
       * (up to 3.5 days off what the twin says). 0 and `columns.length` are the chart's edges; every
       * value is clamped to them, so no line runs past the frame (N9).
       */
      fromPos: number
      toPos: number
      /** Starts before the window (no start mark) / runs past its end (no end mark). */
      openStart: boolean
      openEnd: boolean
      /** A prescribed course with no dose logged: hollow dashed, never solid (spec §5.4). */
      hollow: boolean
      /** The owner recorded the end. Otherwise the line stops at the last logged dose with no end
       *  bracket: a closed bracket would claim an end the record does not hold (cold read 3). */
      endDeclared: boolean
      /**
       * CUL-2360: the course has no recorded end and its line stops at the last logged dose inside
       * the window. A line that simply stopped read as a course that stopped (Nyx's cetirizine), so
       * it carries on dotted to the chart's edge, its own mark (`open_end`) with its own twin words.
       */
      openCourse: boolean
      /** The twin's words for this span ("Sep 21 to Oct 11", "prescribed, no doses logged"). */
      when: string
      /**
       * CUL-2480 instance 1: an ad-hoc drug (doses with no regimen) has no course to draw, so its row
       * is a tick per dosed day, never a continuous bar. Each entry is a fractional column position:
       * the column's index plus the day's place inside it, so seven daily doses in one week column
       * draw as seven ticks, not one (cold read recheck). Absent on a course.
       */
      doseCols?: number[]
      /** What the ticks are: ad-hoc doses, (CUL-2514) feedings off the trial diet, or (CUL-2535, a
       *  zero-sign sheet) the days a Noticed concern word was marked or a meal was not finished. */
      tickKind?: 'dose' | 'off_diet' | 'change'
    }

/** Every mark kind the chart can draw. The twin must name each one it draws (spec §5.4). */
export type MarkKind =
  | 'bar'
  | 'empty'
  | 'not_read'
  | 'hatch'
  | 'partial'
  | 'span'
  | 'hollow_span'
  | 'dose_ticks'
  | 'intake_refused'
  | 'intake_partly'
  /** CUL-2360: a course with no recorded end, dotted past its last logged dose. */
  | 'open_end'
  /** CUL-2514: a tick per day a feeding off the trial diet was logged. */
  | 'off_diet_ticks'
  /** CUL-2535: on a zero-sign sheet, a tick per day a change was marked (a concern word, a meal not finished). */
  | 'change_ticks'
  /** CUL-2360: the burden flag's own window, bracketed under the axis. */
  | 'recent_bracket'

/** CUL-2360: the burden flag's window under the axis, so a short last week's bar cannot read as easing
 *  while the band says the sign is high. Its words and count are the flag's own. */
export interface RecentBracket {
  fromPos: number
  toPos: number
  /** "last 7 days: 6 vomiting entries, flagged". */
  label: string
}

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
  /** CUL-2360: the burden flag's window, when one fired on a drawn sign; null otherwise. */
  recentBracket: RecentBracket | null
  /** Where the window ends, in column units (`chartEndPos`): the edge a line running on reaches. */
  endPos: number
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
  | {
      kind: 'masthead'
      id: 'masthead'
      eyebrow: string
      /** v1's letterhead stamp, word for word (CUL-2579 ruling (a)): the sheet says what it is
       *  before it says anything else. */
      stamp: string
      name: string
      signalment: string
      /** Species, sex, age and the latest weight: the part of the signalment that decides urgency,
       *  for a surface with room for one line of it (the phone at large text, CUL-2295). */
      signalmentBrief: string
      conditions: string | null
      window: string
      lastEntryHtml: string
    }
  | { kind: 'disclosure'; id: 'disclosure'; html: string }
  | { kind: 'band'; id: 'band'; heading: string; items: BandItem[]; checksHtml: string | null }
  | { kind: 'checks'; id: 'checks'; html: string }
  | { kind: 'scope_line'; id: 'scope-line'; text: string }
  | {
      kind: 'changes'
      id: 'changes'
      placement: 'band_slot' | 'under_chart'
      heading: string
      lines: ChangeLine[]
      /** CUL-2361 ruling (a): on a zero-sign sheet the first line is the sheet's one serif sentence.
       *  A renderer that prints an AI lead drops it to body, as it drops line 1 (spec §5.3). */
      serifLead: boolean
    }
  | { kind: 'record_edge'; id: 'record-edge'; lines: string[] }
  | {
      kind: 'lead_sentence'
      id: 'lead-sentence'
      text: string
      /** The sheet's one serif sentence (spec §5.3). False only on a zero-sign sheet whose
       *  "Changes in this window" lead takes the serif instead (CUL-2361 ruling (a)). */
      serif: boolean
    }
  | { kind: 'lead_chart'; id: 'lead-chart'; chart: LeadChart }
  | {
      kind: 'confounder'
      id: 'confounder'
      text: string
      /** The sentence of `text` that leads it as a warning: the one a surface that cannot show
       *  the whole line beside the chart shows there (the phone's pinned repeat, CUL-2295). */
      lead: string
    }
  | {
      /** CUL-2514: v1 page 1's "Interpreting this record", word for word, its pointers on v2's sheets. */
      kind: 'trial_reading'
      id: 'trial-reading'
      label: string
      /** The callout's sentences; null when v1 prints the rows but no callout. */
      html: string | null
      /** CUL-2551: every v1 trial row (`trialRowsOf`), word for word in v1's order, before the callout. */
      rows: Array<{ labelHtml: string; html: string }>
      /** v1's section heading ("Diet trial" and its aside), already-escaped html. */
      heading: string | null
    }
  | { kind: 'record_lines'; id: 'record-lines'; lines: RecordLine[] }
  /** CUL-2551: a v1 page-1 section, word for word with v2's pointers (`sheet1CarryV2.ts`). */
  | { kind: 'carried'; id: string; html: string }
  | { kind: 'gap_lines'; id: 'gap-lines'; heading: string; lines: GapLine[] }
  | { kind: 'questions'; id: 'questions'; heading: string; items: QuestionItem[] }
  | { kind: 'colophon'; id: 'colophon'; text: string }

/** A photo on an event a band line cites, printed dated beside that line (R-10, spec §5.9). */
export interface BandPhoto {
  /** The EXIF-stripped `data:` URI, or null when it could not be embedded (the caption says so). */
  src: string | null
  /** Plain text: "photo Sep 22, 1:30 am". */
  caption: string
  alt: string
}

export interface BandItem {
  id: string
  tag: string
  html: string
  photos: BandPhoto[]
  /** R-10 (PR-23): "Photo left out by the owner (Jul 2)." when a photo on an event this line cites
   *  was left out before sending; null otherwise. The flag text above it prints either way. */
  photosLeftOutLine: string | null
}

export interface DocumentV2 {
  version: 'v2'
  sheet: 1
  /** Sheet 1, the Front Page. */
  blocks: BlockV2[]
  /** Sheets 2 to N (VR2-13 onward, `backSheetsV2.ts`). */
  backSheets: BackSheetV2[]
  /** The saved copy's short id (`opts.shortId`), for the head on every printed page; null unsaved. */
  reportId: string | null
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
    // v1's callout carries these since sheet 1 reprints it (CUL-2514): "Jun 15 → Sep 16".
    .replace(/&rarr;/g, '→')
    .replace(/&times;/g, '×')
    .replace(/&hellip;/g, '…')
    .replace(/&dagger;/g, '†')
    .replace(/&asymp;/g, '≈')
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

/** "Cat · female · 8 y · 4.10 kg (9.0 lb)": species, sex, age and weight, from the same
 *  fields and words as `signalmentLineOf`, without breed, neuter status, birth date or household. */
export function signalmentBriefOf(snap: ReportSnapshot): string {
  const s = snap.signalment
  const species = SPECIES_WORD[s.species] ?? s.species.charAt(0).toUpperCase() + s.species.slice(1)
  const sex = s.sex === 'unknown' ? 'sex not recorded' : s.sex
  const age = s.ageYears === null ? 'age not recorded' : s.dateOfBirthPrecision === 'approximate' || s.dateOfBirth === null ? `~${s.ageYears} y` : `${s.ageYears} y`
  // The weight's date stays on the full line: the brief is a glance, the fold one tap away.
  const weight = s.latestWeight ? weightText(s.latestWeight.kg) : 'no weight recorded'
  return [species, sex, age, weight].join(' · ')
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

/** v1's letterhead stamp, its first two lines (the third, the generated date, is the colophon's). */
export const MASTHEAD_STAMP = 'Prepared for veterinary review · Not a diagnosis · owner-reported observations'

/** The ONE colophon template (spec §5.10). The sheet count is computed from the sheets printed. */
export function colophonOf(snap: ReportSnapshot, opts: DocumentV2Options, sheets = 1): string {
  const owner = ownerNameOf(opts.owner)
  const generated = textOf(fmtDayYear(snap.atAGlance.recordEdge.reportDate))
  return [
    `Kept by ${owner ?? 'the owner'}`,
    // CUL-2579 ruling (a): v1's page footer, word for word ("associational" included).
    'owner-reported observations',
    'associational, not a diagnosis',
    `generated ${generated}`,
    ...(opts.shortId ? [`report ${opts.shortId}`] : []),
    `sheet 1 of ${sheets}`,
  ].join(' · ')
}

// ── The band (spec §5.1, §5.2) ───────────────────────────────────────────────

/** v1's row for a flag, captured as (tag, html). Photos are left out of the snapshot handed to it:
 *  v1's thumbnail points at v1's appendix E, which v2 does not print; the dated photo beside a band
 *  line is R-10's (`bandPhotosOf`). The flag TEXT is v1's, with only its pointers swapped
 *  (CUL-2350): the document passes `v2FlagPointersOf`, so every "see appendix" lands on a sheet v2
 *  prints. With v1's own pointers (the default) `flagRowOf(f, s)` is v1's band row byte for byte,
 *  first-sheet facts included: both pass `v1FirstSheet` (CUL-2555). The AI lead's fact table calls
 *  `safetyFlagRow` without it and so still lacks those facts (filed for after CUL-2619). */
export function flagRowOf(f: SafetyFlag, snap: ReportSnapshot, ptr: FlagPointers = V1_FLAG_POINTERS): { tag: string; html: string } {
  const noPhotos: ReportSnapshot = { ...snap, incidentPhotos: [] }
  let captured: { tag: string; html: string } | null = null
  safetyFlagRow(
    f,
    noPhotos,
    (tag, body) => {
      captured = { tag, html: body }
      return ''
    },
    ptr,
    // CUL-2551: sheet 1 carries every v1 page-1 block, so v2's band takes v1's first-sheet fixes
    // (CUL-2529: the weight reading's age and intake coverage, the refusal's named feedings).
    true,
  )
  if (captured === null) throw new Error(`safetyFlagRow wrote no row for ${f.kind}`)
  return captured
}

/** CUL-2381 part 2: past this many trial foods, the refusal row names the first and counts the rest. */
export const BAND_TRIAL_FOODS_MAX = 2

/**
 * The flag as the band prints it. A trial-refusal row that lists every trial-diet food in full
 * (Nyx's six) pushed the burden and weight flags below the phone's first screen (cold read, F3); past
 * `BAND_TRIAL_FOODS_MAX` the row names the first food and counts the others. The full list stays on
 * the diet sheet (v1's diet-trial section, reprinted whole). Only the refusal row: the protein row
 * says which food's label it read, so its list is the finding itself and is never cut.
 */
export function bandFlagOf(f: SafetyFlag): SafetyFlag {
  if (f.kind !== 'trial_diet_refusal' || f.trialDietLabels.length <= BAND_TRIAL_FOODS_MAX) return f
  const n = f.trialDietLabels.length - 1
  return { ...f, trialDietLabels: [`${f.trialDietLabels[0]} + ${n} other trial item${n === 1 ? '' : 's'}`] }
}

/** One intake or weight check, in the band's checks register: what it read and over when. */
function checkOutcomeClause(o: CheckOutcome, snap: ReportSnapshot): string {
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`
  // Both instants, as the symptom checks name theirs (CUL-2368): the window is N × 24h back from
  // the detector's now, so it starts partway through a day.
  const at = (iso: string): string =>
    `${h(fmtLocalTime(iso, snap.timezone))} on ${h(fmtDayScopedTo(localDayKeyOf(iso, snap.timezone), snap.scope.endDate))}`
  const span = (): string => {
    if (o.endIso === null || o.windowDays === null) return ''
    const end = Date.parse(o.endIso)
    if (!Number.isFinite(end)) return ` in the ${o.windowDays} days to the end of this window`
    return ` from ${at(new Date(end - o.windowDays * MS_PER_DAY).toISOString())} to ${at(o.endIso)}`
  }
  const need = (what: string): string => (o.state === 'too_few' ? `, ${o.needed} needed${what}` : '')
  // Found by the check's own logic, not carried as a flag here (adversarial pass 1 on CUL-2565).
  if (o.found?.kind === 'one_bout') {
    const fed = o.population === 'meal_record' ? ['rated feeding', 'rated feedings'] : ['rated trial-diet feeding', 'rated trial-diet feedings']
    return `trial diet not eaten (${o.found.unfinished} of ${plural(o.found.rated, fed[0], fed[1])} left unfinished, all within ${o.found.spanHours} hours, too short a span for the flag)`
  }
  if (o.found?.kind === 'refused_then_vomited') {
    return `a meal refused and then vomit within ${o.found.windowMinutes} minutes (${plural(o.found.episodes, 'time', 'times')} on ${plural(o.found.days, 'day', 'days')}, the first ${h(fmtDayScopedTo(o.found.firstLocalDay, snap.scope.endDate))}), found by the app's own intake check, which this report does not carry as a flag`
  }
  switch (o.check) {
    case 'intake_decline':
      // "The intake check", never "reduced intake": the sentence before it on the checks line is a
      // trial sign's own check, and an extractor joins the two, so a decline word here read as a
      // decline in that sign (CI extraction, spec §8 rule 3). The check's name says no direction.
      return `the intake check (${plural(o.seen, 'rated meal', 'rated meals')}${span()}${need('')})`
    case 'trial_diet_refusal': {
      const fed = o.population === 'meal_record' ? ['rated feeding', 'rated feedings'] : ['rated trial-diet feeding', 'rated trial-diet feedings']
      const who = o.population === 'meal_record' ? 'trial diet not eaten, read over every rated feeding because the trial diet could not be told apart' : 'trial diet not eaten'
      // "The trial days this report covers", v1's own phrase: the count is the coverage range (the
      // trial clipped to the window), never the whole trial (cold read at f89c7ff).
      return `${who} (${plural(o.seen, fed[0], fed[1])} over the trial days this report covers${need('')})`
    }
    case 'weight_loss':
      return `weight loss (${plural(o.seen, 'weigh-in', 'weigh-ins')}${span()}${need('')})`
  }
}

/**
 * v1's "ran and did not trigger" sentence, word for word (CUL-2003; PM ruling 2026-10-19), then the
 * intake and weight checks v1 never names (CUL-2565, PM ruling (a) on brief B, 2026-11-06): each
 * that read enough and stayed quiet, and each that had too little to read, with its count and its
 * floor. A flagged one is in the band already. Neither list is an all-clear.
 */
function checksHtmlOf(snap: ReportSnapshot): string | null {
  const checked = safetyChecksText(snap)
  const outcomes = snap.checkOutcomes ?? []
  const quiet = outcomes.filter((o) => o.state === 'not_flagged').map((o) => checkOutcomeClause(o, snap))
  const thin = outcomes.filter((o) => o.state === 'too_few').map((o) => checkOutcomeClause(o, snap))
  const found = outcomes.filter((o) => o.state === 'found_not_flagged').map((o) => checkOutcomeClause(o, snap))
  const lead = checked?.lead ?? null
  const body = [
    // v1's sentence and its notes first and whole, so the must-carry guard reads them verbatim.
    lead === null ? '' : `Ran and did not trigger, which does not rule these out: ${lead}`,
    ...(checked?.rest ?? []),
    // Loudest first: what a check found, though no flag above carries it.
    found.length === 0 ? '' : `Found in this record, not raised as a flag, so not ruled out: ${found.join('; ')}.`,
    quiet.length === 0 ? '' : `${lead === null ? 'Ran and did not trigger, which does not rule these out' : 'Also ran and did not trigger'}: ${quiet.join('; ')}.`,
    thin.length === 0 ? '' : `Too few entries to run, so not ruled out either: ${thin.join('; ')}.`,
  ]
    .filter((x) => x !== '')
    .join(' ')
  return body === '' ? null : body
}

/** R-10: the photos on the events a band line cites, each dated with its time, most recent first
 *  as the snapshot orders them. Only the present-blood and present-foreign lines cite events. */
export function bandPhotosOf(f: SafetyFlag, snap: ReportSnapshot): BandPhoto[] {
  if (f.kind !== 'present_blood' && f.kind !== 'present_foreign') return []
  const ids = new Set(f.incidents.map((i) => i.eventId))
  return snap.incidentPhotos
    .filter((p) => ids.has(p.eventId))
    .map((p) => {
      const day = textOf(fmtLocalDay(p.occurredAt, snap.timezone))
      const when = `${day}, ${incidentTimeWords(p, snap.timezone)}`
      return {
        src: p.dataUri,
        // The time is the INCIDENT's, as the owner recorded it, never the photo's (capture time is
        // stripped); said with how sure it is, so a found vomit never prints as a witnessed minute
        // (cold read, CUL-2293: the time since ingestion sets the urgency of imaging).
        caption: `${/^sometime between /.test(incidentTimeWords(p, snap.timezone)) ? 'Photo of the incident' : `Photo of the ${day} incident`}, ${incidentTimeWords(
          p,
          snap.timezone,
        )}${p.dataUri ? '' : '; the photo could not be embedded'}`,
        alt: `Owner photo of the ${symptomLabel(p.type).toLowerCase()} incident on ${when}`,
      }
    })
}

/** R-10 (PR-23): the dated line for photos the owner left out on the events this band line cites.
 *  The same events `bandPhotosOf` reads, so a photo is either beside its line or dated there. */
export function bandLeftOutLineOf(f: SafetyFlag, snap: ReportSnapshot): string | null {
  if (f.kind !== 'present_blood' && f.kind !== 'present_foreign') return null
  // Absent on a snapshot frozen before PR-23 (a saved copy, a recorded fixture): nothing was left
  // out then, because nothing could be.
  // CUL-2455: each left-out incident keeps the day and time its caption would have printed, from
  // its own record (the same words `bandPhotosOf` puts in the caption). From the record, not the
  // event log: the stool blood flag cites normal stools, which the event log does not list
  // (adversarial pass 1). A copy saved before the time fields existed falls back to the day.
  const whenOf = (p: IncidentPhotoLeftOut): string | null =>
    p.occurredAtConfidence === undefined
      ? null
      : `${textOf(fmtLocalDay(p.occurredAt, snap.timezone))}, ${incidentTimeWords(
          {
            occurredAt: p.occurredAt,
            occurredAtConfidence: p.occurredAtConfidence,
            occurredAtEarliest: p.occurredAtEarliest ?? null,
            occurredAtLatest: p.occurredAtLatest ?? null,
          },
          snap.timezone,
        )}`
  return leftOutBandLine(new Set(f.incidents.map((i) => i.eventId)), snap.incidentPhotosLeftOut ?? [], snap.timezone, whenOf)
}

/** An incident's time in words with its confidence (v1's classes, `timeConfidence`). */
export function incidentTimeWords(
  p: { occurredAt: string; occurredAtConfidence: SymptomLogTimeFields['occurredAtConfidence']; occurredAtEarliest: string | null; occurredAtLatest: string | null },
  tz: string | null,
): string {
  const t = (iso: string): string => textOf(fmtLocalTime(iso, tz))
  switch (timeConfidence(p)) {
    case 'seen':
      return `seen at ${t(p.occurredAt)}`
    case 'est':
      return `about ${t(p.occurredAt)} (an estimate)`
    case 'range': {
      // A range across midnight names both days, or "Oct 9, 22:00–06:00" reads a day late on the
      // first edge (adversarial pass 2: time since ingestion, understated by 24 hours).
      const a = p.occurredAtEarliest as string
      const b = p.occurredAtLatest as string
      const dayA = textOf(fmtLocalDay(a, tz))
      const dayB = textOf(fmtLocalDay(b, tz))
      return dayA === dayB ? `sometime ${t(a)}–${t(b)}` : `sometime between ${dayA} ${t(a)} and ${dayB} ${t(b)}`
    }
    case 'bound':
      return p.occurredAtLatest ? `sometime before ${t(p.occurredAtLatest)}` : `sometime after ${t(p.occurredAtEarliest as string)}`
    case 'unspecified':
      return `about ${t(p.occurredAt)} (not recorded as seen)`
  }
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

/**
 * A day's place on the chart in column units: its column's index plus the centre of the day inside
 * that column, clamped to the chart (CUL-2360). Seven daily doses in one week column sit at seven
 * places; a course from a Thursday starts on the Thursday, not mid-week.
 */
export function dayPos(cols: ChartColumn[], day: string): number {
  if (cols.length === 0) return 0
  if (day < cols[0].start) return 0
  const end = chartEndPos(cols)
  if (day > cols[cols.length - 1].end) return end
  const i = colOf(cols, day)
  const col = cols[i]
  // A day's width is a full column's share, never a short column's: a 4-day last week holds its
  // days where a full week would, and the window ends inside the column (cold read at 7025c6d: the
  // bracket ran three days past Oct 31 and Cooper's Oct 13 tick sat late).
  const within = Math.min(Math.max(daysBetween(col.start, day), 0), col.days - 1)
  return Math.min(end, Math.max(0, i + (within + 0.5) / fullDaysOf(cols)))
}

/** A full column's days: 7 for weeks, 14 for bins, 1 for days (only the last column runs short). */
export function fullDaysOf(cols: ChartColumn[]): number {
  return Math.max(1, ...cols.map((c) => c.days))
}

/** Where the window ends on the chart, in column units: inside a short last column, never past it. */
export function chartEndPos(cols: ChartColumn[]): number {
  if (cols.length === 0) return 0
  return cols.length - 1 + cols[cols.length - 1].days / fullDaysOf(cols)
}

function spanRows(snap: ReportSnapshot, cols: ChartColumn[]): { rows: Extract<ChartRow, { kind: 'span' }>[]; overflow: string[] } {
  const rows: Extract<ChartRow, { kind: 'span' }>[] = []
  const overflow: string[] = []
  const trialRows: Extract<ChartRow, { kind: 'span' }>[] = []
  const courseRows: Extract<ChartRow, { kind: 'span' }>[] = []
  const windowStart = snap.scope.startDate
  for (const c of snap.concurrentChanges) {
    const start = c.startDate && c.startDate.slice(0, 10) >= windowStart ? c.startDate.slice(0, 10) : null
    const end = c.endInWindow ? c.endInWindow.slice(0, 10) : null
    const med = medicationFor(snap, c)
    const none = med !== null && med.courseDays.given === 0 && med.courseDays.loggedNotGiven === 0
    const adHoc = adHocGroupOf(snap, c)
    // CUL-2440: an ad-hoc drug whose record reaches before this window is not drawn as starting
    // here. Its bar begins at the first dose in the window, so the label says so.
    const recordBit = c.recordStart ? ` (first dose here; on record from ${plainDay(c.recordStart.firstDoseDay)})` : ''
    const from = start === null ? (c.startDate ? `from ${plainDay(c.startDate.slice(0, 10))} (before this window)` : 'start not recorded') : `from ${plainDay(start)}${recordBit}`
    const to = end === null ? 'through the window' : c.endIsDeclared ? `to ${plainDay(end)}` : `to ${plainDay(end)} (last dose logged)`
    const span = `${from}${start === null && !c.startDate ? ',' : ''} ${to}`
    const doseDays = adHoc ? adHoc.doseDays.filter((d) => d >= windowStart) : []
    const when = adHoc && doseDays.length > 0
      ? `ad-hoc, dosed on ${doseDays.length} day${doseDays.length === 1 ? '' : 's'} here, no regimen recorded (${
          doseDays.length <= 6 ? doseDays.map(plainDay).join(', ') : `${plainDay(doseDays[0])} to ${plainDay(doseDays[doseDays.length - 1])}`
        })${
          c.recordStart ? `; on record from ${plainDay(c.recordStart.firstDoseDay)}` : ''
        }`
      : none
        ? `prescribed ${span}, no doses logged`
        : span
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
      // CUL-2537: the trial's line is the trial's dates, never its food's: "Trial:" says whose end
      // the bracket is, and the foods fed on after it are their own rows (`postTrialFoodRows`).
      label: c.kind === 'diet_trial' ? `Trial: ${c.label}` : c.label,
      fromCol: startsInChart ? colOf(cols, start) : 0,
      toCol: end === null ? cols.length - 1 : colOf(cols, end),
      fromPos: startsInChart ? dayPos(cols, start) : 0,
      toPos: end === null ? chartEndPos(cols) : dayPos(cols, end),
      openStart: !startsInChart,
      openEnd: end === null,
      hollow: none,
      endDeclared: c.endIsDeclared,
      // A hollow course drew no dose, so there is no last dose to continue from: it stays hollow.
      openCourse: end !== null && !c.endIsDeclared && !none && !(adHoc && doseDays.length > 0),
      when,
    }
    if (adHoc && doseDays.length > 0) {
      row.doseCols = [...new Set(doseDays.filter((d) => d >= first))].sort().map((d) => dayPos(cols, d))
      row.tickKind = 'dose'
    }
    if (c.kind === 'diet_trial') trialRows.push(row)
    else courseRows.push(row)
  }
  // The trial, then the courses; past the cap, named below. What was fed after the trial (CUL-2537)
  // takes its own row beside the cap, so a food never pushes a course off the chart.
  for (const row of [...trialRows, ...courseRows]) {
    if (rows.length < SPAN_ROWS_MAX) rows.push(row)
    else overflow.push(`${row.label} ${row.when}`)
  }
  const foods = postTrialFoodRows(snap, cols)
  rows.splice(trialRows.length > 0 ? Math.min(trialRows.length, rows.length) : 0, 0, ...foods.rows)
  overflow.push(...foods.overflow)
  const off = offDietRow(snap, cols)
  if (off) {
    // The trial's breaks lead the intervention rows: on a full chart a course is named under it
    // rather than the off-diet days (a course already prints on the confounder line).
    if (rows.length - foods.rows.length >= SPAN_ROWS_MAX) {
      const bumped = rows.pop() as Extract<ChartRow, { kind: 'span' }>
      overflow.push(`${bumped.label} ${bumped.when}`)
    }
    rows.unshift(off)
  }
  return { rows, overflow }
}

/** Foods fed after a trial ended that get a row of their own; the rest are named under the chart. */
// One row beside the course cap (`SPAN_ROWS_MAX`), so a food never pushes a course off the chart;
// every other food is named under the chart.
export const POST_TRIAL_FOOD_ROWS_MAX = 1

/**
 * CUL-2537: what was fed after a trial that ended inside the window. Nyx's chart closed the trial's
 * bracket on Oct 20 and drew no food after it, while the trial food carried on to Oct 31 and chicken
 * came back Oct 21 to 28, before the vomiting rose. Each meal food logged after the trial's end is a
 * line from the day after the end (or its first feeding, if later) to its last logged feeding, with
 * no end bracket (a food is not a course). Foods off the trial's list come first, then those carrying
 * an off-trial protein, then by feedings; past `POST_TRIAL_FOOD_ROWS_MAX`, each is named under the chart. Dates are the
 * snapshot's own (`diet.mealItems`), never derived.
 */
function postTrialFoodRows(snap: ReportSnapshot, cols: ChartColumn[]): { rows: Extract<ChartRow, { kind: 'span' }>[]; overflow: string[] } {
  const t = snap.trial
  const ended = t?.endedAt ? t.endedAt.slice(0, 10) : null
  if (!t || ended === null || cols.length === 0 || ended >= snap.scope.endDate) return { rows: [], overflow: [] }
  const after = addDays(ended, 1)
  // A food off the trial's list first (what came back after it), then one carrying an off-trial
  // protein, then by feedings.
  const onList = (label: string | null) => label !== null && t.trialDietLabels.some((l) => label.startsWith(l))
  const items = snap.diet.mealItems
    .filter((m) => m.lastDate !== null && m.lastDate >= after)
    .sort(
      (a, b) =>
        Number(onList(a.foodLabel)) - Number(onList(b.foodLabel)) ||
        Number(b.proteinSet.offTrial.length > 0) - Number(a.proteinSet.offTrial.length > 0) ||
        b.count - a.count,
    )
  const rows: Extract<ChartRow, { kind: 'span' }>[] = []
  const overflow: string[] = []
  for (const m of items) {
    const from = m.firstDate !== null && m.firstDate > after ? m.firstDate : after
    const to = m.lastDate as string
    const label = m.foodLabel ?? 'A food not named'
    // The snapshot's own dates only (adversarial pass 2: "logged from <the day after the trial>" was a
    // date no feeding carried). A food first logged before the trial ended says so.
    const span = m.firstDate !== null && m.firstDate >= after ? `logged from ${plainDay(m.firstDate)} to ${plainDay(to)}` : `logged until ${plainDay(to)} (first logged ${m.firstDate ? plainDay(m.firstDate) : 'date not recorded'}, before the trial ended)`
    const when = `fed after the trial, ${span}${m.proteinSet.offTrial.length > 0 ? ` (${m.proteinSet.offTrial.join(', ')}, off the trial)` : ''}`
    if (rows.length >= POST_TRIAL_FOOD_ROWS_MAX) {
      overflow.push(`${label} ${when}`)
      continue
    }
    rows.push({
      kind: 'span',
      label,
      fromCol: colOf(cols, from),
      toCol: colOf(cols, to),
      fromPos: dayPos(cols, from),
      toPos: dayPos(cols, to),
      openStart: false,
      openEnd: false,
      hollow: false,
      endDeclared: false,
      openCourse: false,
      when,
    })
  }
  return { rows, overflow }
}

/**
 * CUL-2514: the days a feeding off the trial diet was logged, a tick each, so the chicken and beef
 * days sit on the chart beside the vomits they may explain. The days are v1's own (the trial's
 * off-diet itemisation, `offDietDetail`); a floor, never a total. Null with no trial or no such day
 * in the drawn columns.
 */
function offDietRow(snap: ReportSnapshot, cols: ChartColumn[]): Extract<ChartRow, { kind: 'span' }> | null {
  const t = snap.trial
  if (!t || cols.length === 0) return null
  const days = [
    ...new Set(t.exposures.items.filter((x) => x.classification.offDiet).map((x) => new Date(x.dayIndex * MS_PER_DAY).toISOString().slice(0, 10))),
  ]
    .filter((d) => d >= cols[0].start && d <= cols[cols.length - 1].end)
    .sort()
  if (days.length === 0) return null
  const named = days.length <= 6 ? days.map(plainDay).join(', ') : `${days.length} days from ${plainDay(days[0])} to ${plainDay(days[days.length - 1])}`
  return {
    kind: 'span',
    label: 'Off the trial diet',
    fromCol: colOf(cols, days[0]),
    toCol: colOf(cols, days[days.length - 1]),
    fromPos: dayPos(cols, days[0]),
    toPos: dayPos(cols, days[days.length - 1]),
    openStart: false,
    openEnd: false,
    hollow: false,
    endDeclared: false,
    openCourse: false,
    when: `on ${named} (a floor, not a total)`,
    doseCols: days.map((d) => dayPos(cols, d)),
    tickKind: 'off_diet',
  }
}

/**
 * CUL-2535 (brief 4a): on a zero-sign sheet the chart draws what the "Changes in this window" lines
 * state, by day: a tick row per Noticed concern word the changes list names, and one for the days a
 * meal was not finished. 42 identical "logged" bars said nothing clinical while Olive's six sleepy
 * days sat in the last eleven. The same days the lines print (`concernWordDaysOf`,
 * `unfinishedMealDaysOf`), never re-derived.
 */
/** Every day a change tick row would draw, oldest first (the row's start must reach the first). */
function changeDaysOf(snap: ReportSnapshot): string[] {
  const days: string[] = []
  for (const c of changesInWindowOf(snap) ?? []) {
    if (c.id !== 'noticed_concern' || !snap.noticed) continue
    const word = snap.noticed.concernWords.find((w) => c.text.startsWith(`Marked ${w.label.toLowerCase()} on `))
    if (word) days.push(...concernWordDaysOf(snap, word.key))
  }
  if (snap.v2.mealNotFinishedDays > 0) days.push(...(unfinishedMealDaysOf(snap) ?? []))
  return [...new Set(days)].sort()
}

function changeTickRows(snap: ReportSnapshot, cols: ChartColumn[]): Array<Extract<ChartRow, { kind: 'span' }>> {
  if (cols.length === 0) return []
  const rows: Array<Extract<ChartRow, { kind: 'span' }>> = []
  const tick = (label: string, all: string[]) => {
    const days = all.filter((d) => d >= cols[0].start && d <= cols[cols.length - 1].end)
    if (days.length === 0) return
    rows.push({
      kind: 'span',
      label,
      fromCol: colOf(cols, days[0]),
      toCol: colOf(cols, days[days.length - 1]),
      fromPos: dayPos(cols, days[0]),
      toPos: dayPos(cols, days[days.length - 1]),
      openStart: false,
      openEnd: false,
      hollow: false,
      endDeclared: false,
      openCourse: false,
      when: `on ${days.map(plainDay).join(', ')}`,
      doseCols: days.map((d) => dayPos(cols, d)),
      tickKind: 'change',
    })
  }
  for (const c of changesInWindowOf(snap) ?? []) {
    if (c.id !== 'noticed_concern' || !snap.noticed) continue
    const word = snap.noticed.concernWords.find((w) => c.text.startsWith(`Marked ${w.label.toLowerCase()} on `))
    if (word) tick(`Marked ${word.label.toLowerCase()}`, concernWordDaysOf(snap, word.key))
  }
  const meals = unfinishedMealDaysOf(snap)
  if (meals && snap.v2.mealNotFinishedDays > 0) tick('Meals not finished', meals)
  return rows
}

/** The short last column a reader could take for a fall: a part week (or bin) at the window's end.
 *  Null on a day row, where every column is a whole day. */
export function soFarCol(cols: ChartColumn[], unit: LeadChart['unit']): number | null {
  if (unit === 'day' || cols.length === 0) return null
  const last = cols.length - 1
  return cols[last].days < (unit === 'week' ? 7 : 14) ? last : null
}

/**
 * CUL-2360: the burden flag's own window, bracketed under the axis, on the sign the flag counts. A
 * 4-day last week holding 4 vomits drew shorter than the 6-day week before it while the band said
 * 6 vomits in 7 days; the bracket puts the flag's window and count on the chart. Its count and days
 * are the flag's fields, worded as v1's burden row words them (rule 1: no number computed here).
 * The lead row's flag first; null when no burden flag fired on a drawn sign row.
 */
function recentBracketOf(snap: ReportSnapshot, cols: ChartColumn[], rows: ChartRow[], zeroSign: boolean): RecentBracket | null {
  if (zeroSign || cols.length === 0) return null
  const drawn = rows.filter((r): r is Extract<ChartRow, { kind: 'sign' }> => r.kind === 'sign')
  const burdens = snap.safetyFlags.filter((f): f is Extract<SafetyFlag, { kind: 'symptom_burden' }> => f.kind === 'symptom_burden')
  const pick = [...drawn].sort((a, b) => Number(b.lead) - Number(a.lead)).map((r) => burdens.find((f) => f.symptomType === r.sign)).find((f) => f !== undefined)
  if (!pick) return null
  const from = addDays(snap.scope.endDate, -(pick.windowDays - 1))
  const label = `the last ${pick.windowDays} days, ${pick.count} ${symptomLabel(pick.symptomType).toLowerCase()} ${pick.count === 1 ? 'entry' : 'entries'}, as the burden flag counts them`
  // The bracket opens at the start of its first day, never before the chart's left edge.
  const left = from < cols[0].start ? 0 : dayPos(cols, from) - 0.5 / fullDaysOf(cols)
  return { fromPos: Math.max(0, left), toPos: chartEndPos(cols), label }
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

function buildLeadChart(
  snap: ReportSnapshot,
  lead: Lead | null,
  leadFlag: Extract<SafetyFlag, { kind: 'chronicity' }> | null,
  ptr: FlagPointers,
): LeadChart {
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
    let first = fewLogged ? snap.v2.loggedDayKeys[0] : null
    // Adversarial pass 2 (QUIET, the chart): on a zero-sign sheet the row starts no later than the
    // first day a change was marked, or ticks before it were dropped and the rest drawn as the set.
    if (zeroSign && first !== null) {
      const changed = changeDaysOf(snap)
      if (changed.length > 0 && changed[0] < first) first = changed[0]
    }
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
    const changes = changeTickRows(snap, columns)
    for (const r of changes) rows.push(r)
    if (changes.length > 0) {
      marks.add('change_ticks')
      twinParts.push(`Ticks, one per day a change was marked: ${changes.map((r) => `${r.label.toLowerCase()} ${r.when}`).join('; ')}`)
    }
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
      // CUL-2360: the short last week's count is said with its days ("2 in 4 days"), as its bar is labelled.
      const short = soFarCol(columns, unit)
      twinParts.push(`${symptomLabel(s.type).toLowerCase()} ${counts.map((n, i) => (i === short && n > 0 ? `${n} in ${plural(columns[i].days, 'day', 'days')}` : cellWord(n, columns[i], unit))).join(', ')}`)
    }
    if (overflow.length > 0) {
      // CUL-2566 instance 1: a sign past the chart's rows keeps v1's weekly series in words, column
      // for column as a drawn row's twin says it, so a recent cluster of a fourth sign is not only a
      // total. Read off the same buckets (`perCol`), never recounted.
      overflowParts.push(
        `also logged: ${overflow
          .map((s) => {
            const counts = perCol(s.weeklyBuckets, s.type)
            const short = soFarCol(columns, unit)
            const series = counts.map((n, i) => (i === short && n > 0 ? `${n} in ${plural(columns[i].days, 'day', 'days')}` : cellWord(n, columns[i], unit))).join(', ')
            return `${symptomLabel(s.type).toLowerCase()} ${plural(s.count, 'entry', 'entries')}, by ${unit === 'two_weeks' ? 'fortnight' : unit === 'day' ? 'day' : 'week'} ${series}`
          })
          .join('; ')}`,
      )
    }
    if (columns.some((c) => c.loggedDays === 0)) marks.add('hatch')
  }

  // Course, trial and bowl lines (spec §5.4: a solid bracketed line; hollow dashed with no doses).
  const spans = spanRows(snap, columns)
  for (const r of spans.rows) {
    rows.push(r)
    marks.add(r.doseCols ? (r.tickKind === 'off_diet' ? 'off_diet_ticks' : 'dose_ticks') : r.hollow ? 'hollow_span' : 'span')
    if (r.openCourse) marks.add('open_end')
  }
  if (spans.overflow.length > 0) overflowParts.push(`also running: ${spans.overflow.join('; ')}`)
  const solid = spans.rows.filter((r) => !r.hollow && !r.doseCols)
  const hollow = spans.rows.filter((r) => r.hollow && !r.doseCols)
  const ticks = spans.rows.filter((r) => r.doseCols && r.tickKind !== 'off_diet')
  const offDiet = spans.rows.filter((r) => r.tickKind === 'off_diet')
  const open = solid.filter((r) => r.openCourse)
  if (offDiet.length > 0) twinParts.push(`Ticks, one per day a feeding off the trial diet was logged: ${offDiet.map((r) => r.when).join('; ')}`)
  if (solid.length > 0) twinParts.push(`Bracketed lines, courses and foods: ${solid.map((r) => `${r.label} ${r.when}`).join('; ')}`)
  if (open.length > 0) twinParts.push(`Dotted after the last logged dose, no end recorded: ${open.map((r) => r.label).join('; ')}`)
  if (hollow.length > 0) twinParts.push(`Hollow dashed line: ${hollow.map((r) => `${r.label}, ${r.when}`).join('; ')}`)
  if (ticks.length > 0) twinParts.push(`Ticks, one per day an ad-hoc dose was logged: ${ticks.map((r) => `${r.label}, ${r.when}`).join('; ')}`)

  const partials = columns
    .map((c, i) => ({ c, i, l: colLabel(c, unit) }))
    .filter((x) => x.l !== null)
  if (partials.length > 0) marks.add('partial')
  // CUL-2360: a short last column draws its count bars as outlines ("so far"), so fewer days can
  // never read as fewer entries; the twin says so wherever such a bar is drawn.
  const soFarIdx = soFarCol(columns, unit)
  const soFarDrawn =
    soFarIdx !== null &&
    // Count bars only: an intake bar is a share of the meals rated and stays filled.
    rows.some((r) => r.kind === 'sign' && r.counts[soFarIdx] > 0)
  const fromNote = dayRowFrom !== null ? `, the first day with an entry in this window` : ''
  const head = `By ${unitWord} from ${startLabel}${fromNote}${
    partials.length > 0
      ? ` (${partials
          .map(
            (x) =>
              `${unit === 'day' ? 'day' : unit === 'week' ? 'week' : 'bin'} ${x.i + 1} ${x.l}${
                x.i === soFarIdx ? `, so far${soFarDrawn ? ', its bars drawn as outlines and labelled with its days, not a full week' : ''}` : ''
              }`,
          )
          .join('; ')})`
      : ''
  }`
  const recentBracket = recentBracketOf(snap, columns, rows, zeroSign)
  if (recentBracket) {
    marks.add('recent_bracket')
    twinParts.push(`Bracket under the axis: ${recentBracket.label}`)
  }
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
  const flag = leadFlag ? flagRowOf(leadFlag, snap, ptr) : null
  const heading = leadFlag
    ? `Flag: ${symptomLabel(leadFlag.symptomType).toLowerCase()} over at least ${chronicitySpanDaysShown(leadFlag, snap)} days, the trial’s own sign`
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
    recentBracket,
    endPos: chartEndPos(columns),
    twin,
    marks: [...marks],
  }
}

// ── Record lines (spec §4's line ranker, §5.7) ──────────────────────────────

/** v1's absence sentence, verbatim (render.ts `symptomPanel`'s empty state). */
export const ABSENCE_SENTENCE = 'No symptom events were logged in this window. Absence of a log is not evidence a symptom did not occur.'

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

/** A free-fed bowl as the meals and confounder lines name it: its label and what it carries (CUL-2540). */
function bowlText(b: ReportSnapshot['diet']['freeFed'][number]): string {
  const proteins = b.proteinSet.proteins.length > 0 ? b.proteinSet.proteins : b.primaryProtein ? [b.primaryProtein] : []
  const carries = proteins.length === 0 ? 'protein not recorded' : `${proteins.join(', ')}${b.proteinSet.complete ? '' : '; list not complete'}`
  return `${b.foodLabel ?? 'a food not named'} (${carries})`
}

/**
 * CUL-2540: the run of refusals reaching the newest rated meal, read off the intake log (newest
 * first), and the meal before it. Only rows the not-fully-eaten run already covers are counted, so a
 * fully eaten meal the log leaves out can never sit inside the run.
 *
 * ADVERSARIAL PASS 1 (two breaks). QUIET: the log's pinned last-full-meal row sits after the capped
 * rows, so "reached the cap" is reaching the last row that is not pinned, and with older rows hidden
 * the run says "at least" (60 refusals read as "the last 40"). LOUD: the meal before the run is named
 * only when it is inside the not-fully-eaten run too (`k < run`); past it, the next listed row can be
 * an older meal across a fully eaten one the log's scope leaves out.
 */
function refusalRunText(snap: ReportSnapshot, run: number): string {
  // CUL-2568: the run (`recentNotFullyEatenRun`) skips a free-fed bowl's "ate it all" and counts its
  // other ratings, so the rows read here skip exactly those (`k` and `run` must index one list, or the
  // "meal before" could sit behind a bowl rating); and the cap needs `k < run` (an exact run of 40
  // ending at a capped log is not "at least").
  const rows = snap.provenance.intakeLog.filter((r) => !r.pinned && !(r.freeFed && r.intakeRating === 'all'))
  let k = 0
  while (k < rows.length && k < run && rows[k].intakeRating === 'refused') k++
  if (k < 2) return ''
  const day = (iso: string) => textOf(fmtLocalDay(iso, snap.timezone))
  // "At least" whenever the log runs out before the run does: hidden watched rows OR bowl rows past
  // the bowl cap (adversarial pass 2, QUIET: the bound read as the whole run).
  const capped = k === rows.length && k < run
  const next = k < run && k < rows.length ? rows[k] : null
  const before =
    next && !next.notCountedFreeFed && next.intakeRating !== 'all' && next.intakeRating !== 'refused'
      ? ` The ${next.freeFed ? 'free-fed bowl rating' : 'meal'} before them, on ${day(next.occurredAt)}, was partly eaten.`
      : ''
  return ` ${capped ? 'At least the last' : 'The last'} ${k} were refused outright, from ${day(rows[k - 1].occurredAt)} to ${day(rows[0].occurredAt)}.${before}`
}

function intakeLine(snap: ReportSnapshot): RecordLine | null {
  // CUL-2536: v1's meal count (`mealTotalsOf`), never `snap.v2.loggedMeals` (3 beside v1's 219).
  const meals = mealTotalsOf(snap)
  if (meals.logged === 0) return null
  const freeFed = snap.diet.freeFed.length > 0
  const mc = snap.diet.mealCompletion
  const notFinished = mc ? mc.ratedMeals - mc.finishedMeals : null
  const parts = [`${meals.logged} logged`, meals.rated < meals.logged ? `${meals.rated} rated, intake not recorded for ${meals.logged - meals.rated}` : `${meals.rated} rated`]
  // v1's run (CUL-1978): "40 of 44 fully eaten" read as a dog who eats fine while the last four
  // were not. The same floor as v1's `recentNotFullyEatenRun`: 2 or more. CUL-2540: a run that is
  // every rated meal says so, with its newest day, so an unbroken refusal never reads as a count.
  const run = mc?.recentNotFullyEatenRun ?? 0
  // The newest rated row the run counts: a bowl's "ate it all" is skipped, as the run skips it (CUL-2568).
  const newest = snap.provenance.intakeLog.find((r) => !r.pinned && !(r.freeFed && r.intakeRating === 'all'))
  const newestDay = newest ? textOf(fmtLocalDay(newest.occurredAt, snap.timezone)) : null
  const runText =
    mc && run >= 2 && run < mc.ratedMeals
      ? `The last ${run} rated meals in a row were not fully eaten${newestDay ? `, the most recent on ${newestDay}` : ''}.${refusalRunText(snap, run)} `
      : mc && run >= 2 && run === mc.ratedMeals
        ? `Every rated meal, ${run} of ${run}, was not fully eaten${newestDay ? `, through the most recent on ${newestDay}` : ''}.${refusalRunText(snap, run)} `
        : ''
  // Refused outright is said apart from "not fully eaten" (cold read 3, Mira: 34 of 38 refused read
  // as partial intake). Same population as `finishedMeals`, from `intakeBreakdown`.
  const refused = mc?.intakeBreakdown.find((b) => b.rating === 'refused')?.count ?? 0
  // CUL-2580 (PM ruling (a) on brief A, 2026-11-06): this line counts "ate most" as not fully eaten;
  // the band's diet-not-eaten flag counts it as finished (`feedingWasFinished`), over trial-diet
  // feedings, treats included, across the trial's evidence dates. So each names its population: the
  // flag in v1's words, word for word, and this line its meals and, where any, its "ate most" ones.
  // The two need not sum to each other; they count different feedings, and each says which.
  const mostly = mc?.intakeBreakdown.find((b) => b.rating === 'most')?.count ?? 0
  // Refused first, so its parenthesis cannot read as a share of the "ate most" (adversarial pass 2).
  const refusedText = `${refused > 0 ? ` (${refused} refused outright)` : ''}${mostly > 0 ? `, counting ${mostly} “ate most”` : ''}`
  // CUL-2349 (N2): the unfinished days themselves, as every sign line gives its last day.
  const dates = unfinishedMealDaysOf(snap)
  const when = dates ? datesClauseOf(dates, snap.atAGlance.recordEdge.reportDate) : ''
  if (notFinished !== null && notFinished > 0) parts.push(`${notFinished} not fully eaten${refusedText}, on ${plural(snap.v2.mealNotFinishedDays, 'day', 'days')}${when}`)
  else if (notFinished === 0 && meals.rated > 0) parts.push('every rated meal recorded as fully eaten')
  // B-040's words, verbatim: a bowl left down means no one watched what was eaten from it.
  const bowls = snap.diet.freeFed.map(bowlText).join(', ')
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
  // CUL-2581 (stopgap): v1's trial block names a hydrolysed trial and the intact protein beside it;
  // so does this line, word for word, so v2 never says less than v1.
  // Only where the food's own name does not already say it ("Vetline Hydrolysed Soy").
  const hydrolysed =
    snap.diet.hydrolysedTrial && !/hydroly[sz]/i.test(foods) ? ` (hydrolysed ${snap.diet.hydrolysedTrial.protein})` : ''
  const intact = hydrolysedIntactText(snap)
  return {
    id: 'trial',
    text: `Diet trial (owner-entered): ${foods}${hydrolysed}, from ${start}${ended}${planned}.${intact ? ` ${intact.lead} ${intact.rest}` : ''}`,
  }
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
          : `given on ${c.given} of ${plural(total, 'course day', 'course days')}${
              // CUL-2440: the partial doses ride with the count, as on every back sheet.
              m.partialDoses > 0 ? ` (${m.partialDoses} partial)` : ''
            }${c.loggedNotGiven > 0 ? `, logged as not given on ${c.loggedNotGiven}` : ''}`
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

function coverageLine(snap: ReportSnapshot): RecordLine {
  const ag = snap.atAGlance
  return { id: 'coverage', text: `${ag.loggedDays} of ${plural(ag.windowDays, 'day', 'days')} logged.` }
}

/**
 * CUL-2361 ruling (a): v1's absence sentence keeps every word but is its own ordinary record line,
 * never the serif sentence. As the largest line on a zero-sign sheet it read as a clean bill of
 * health ("symptom events" is the app's term; it leaves out the daily look answers).
 */
const ABSENCE_LINE: RecordLine = { id: 'absence', text: ABSENCE_SENTENCE }

/** The coverage count, and on a zero-sign sheet the absence sentence straight after it. */
function coverageLines(snap: ReportSnapshot, zeroSign: boolean): RecordLine[] {
  return zeroSign ? [coverageLine(snap), ABSENCE_LINE] : [coverageLine(snap)]
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
  if ((zeroSign || edgeHolds) && !intakeFlagLead) out.push(...coverageLines(snap, zeroSign))
  const signs = snap.symptoms.filter((s) => s.count > 0)
  const leadAgg = signs.find((s) => s.type === lead?.sign)
  if (leadAgg) out.push(signLine(snap, leadAgg))
  const intake = intakeLine(snap)
  if (intake) out.splice(intakeFlagLead ? 0 : Math.min(out.length, 2), 0, intake)
  if (intakeFlagLead && (zeroSign || edgeHolds)) out.splice(intake ? 1 : 0, 0, ...coverageLines(snap, zeroSign))
  const { rows, overflow } = chartSigns(snap, lead)
  for (const s of [...rows, ...overflow]) if (s !== leadAgg) out.push(signLine(snap, s))
  const trial = trialLine(snap)
  if (trial) out.push(trial)
  out.push(...medicationLines(snap))
  const noticed = noticedLine(snap)
  if (noticed) out.push(noticed)
  return out
}

/** A free-fed bowl beside a trial, as a warning with no owner text in it (it is pinned on the phone). */
const BOWL_WARNING = 'A free-fed bowl was down in this window; the trial cannot exclude it.'

/** The confounder line: what overlaps a trial, as recorded (spec §5 order, v1 §7.2's caveat). */
function confounderOf(snap: ReportSnapshot): { text: string; lead: string } | null {
  const t = snap.trial
  if (!t) return null
  // A bowl left down beside a trial is a competing food the trial cannot exclude (cold read on
  // CUL-2290, Mira): named here, beside the trial, not only on the meals line.
  const bowls = snap.diet.freeFed.map(bowlText)
  // The warning is a fixed sentence and the owner's labels follow it (adversarial pass 2 on
  // CUL-2295): a surface that pins the warning beside the chart pins a bounded sentence, never a
  // list of free-text names that can grow past the screen.
  const bowl = bowls.length > 0 ? ` ${BOWL_WARNING} Free-fed: ${bowls.join(', ')}; intake not directly observed.` : ''
  // CUL-2480 instance 4: an ad-hoc drug whose doses on record cross the trial, with no overlap row.
  const recordOnly = (t.recordOnlyOverlap ?? []).map(
    (r) =>
      `${r.drugName}${r.isSupplement ? ' (entered as a supplement)' : ''}, ad-hoc doses on record ${plainDay(r.firstDoseDay)} to ${plainDay(
        r.lastDoseDay,
      )}, a span that crosses the trial (which doses fell in it is not counted)`,
  )
  if (t.medicationOverlap.length === 0 && recordOnly.length === 0) {
    const none = 'No medication or supplement is recorded as overlapping the trial in this window, not checked with the owner.'
    // With no medication overlapping, a bowl left down is the line's warning, so it leads wherever
    // only one sentence fits (cold read on CUL-2295, Mira): the "no medication" sentence alone
    // reads as a clean trial.
    return { text: `${none}${bowl}`, lead: bowl ? BOWL_WARNING : none }
  }
  const overlapItems = t.medicationOverlap.map((m) => {
    const from = plainDay(m.fromDate)
    const to = plainDay(m.toDate)
    // An ad-hoc drug is dated from its earliest dose on record (CUL-2440), and says it has no
    // regimen: "its course has no recorded end" read as a prescribed course still running.
    // Sheet 1 is word-budgeted, so this is the short form; the back sheets carry the full one.
    // ADVERSARIAL PASS 2 (QUIET): "no recorded end" stays unless the last dose fell after the trial.
    const afterTrial = !!m.endedAt && m.endedAt.slice(0, 10) > m.toDate
    const tail = m.recordStart && !afterTrial
      ? ` (ad-hoc, by ${plainDay(m.recordStart.firstDoseDay)}${m.activeAtWindowEnd ? '; its course has no recorded end' : ''})`
      : m.recordStart
      ? m.recordStart.atHistoryFloor
        ? ` (ad-hoc, by ${plainDay(m.recordStart.firstDoseDay)})` // on record from that day, the read's floor: by then at the latest
        : ` (ad-hoc, first logged ${plainDay(m.recordStart.firstDoseDay)})`
      : m.activeAtWindowEnd
        ? ' (its course has no recorded end)'
        : ''
    return `${m.drugName}${m.isSupplement ? ' (entered as a supplement)' : ''}, overlapping it ${from} to ${to}${tail}`
  })
  const items = [...overlapItems, ...recordOnly]
  const abx = t.medicationOverlap.some((m) => m.antibacterialInGiTrial) || (t.recordOnlyOverlap ?? []).some((r) => r.antibacterialInGiTrial)
    ? ' An antibacterial course overlaps a GI trial: a steroid’s effect withdraws when it stops, a course’s effect on the microbiome does not.'
    : ''
  return {
    text: `Not a test of the diet alone. Overlapping the trial: ${items.join('; ')}. Spans are the courses as recorded, not evidence of administration.${abx}${bowl}`,
    lead: 'Not a test of the diet alone.',
  }
}

// ── The document ─────────────────────────────────────────────────────────────

export function buildDocumentV2(input: ReportSnapshot, opts: DocumentV2Options): DocumentV2 {
  // One medication fact per drug, read the same way by sheet 1 and every back sheet (CUL-2440).
  const snap = withRecordOverlaps(input)
  const blocks: BlockV2[] = []
  const zeroSign = isZeroSignSheet(snap)
  // The back sheets first: sheet 1's flag rows point at them by number (CUL-2350).
  const backSheets = backSheetsOf(snap)
  const ptr = v2FlagPointersOf(backSheets, snap)

  blocks.push({
    kind: 'masthead',
    id: 'masthead',
    eyebrow: 'Owner’s home log',
    stamp: MASTHEAD_STAMP,
    name: snap.signalment.name,
    signalment: signalmentLineOf(snap),
    signalmentBrief: signalmentBriefOf(snap),
    conditions: conditionsLineOf(snap),
    window: windowLineOf(snap),
    lastEntryHtml: lastEntryLine(snap),
  })

  // v1's page-1 disclosures (the cherry-pick guard, a record that could not be read in full) carry
  // over word for word: each one stops a short or hand-cropped record reading as a whole one.
  // CUL-2391: with no usable zone every date and time on the sheet is UTC, and v1's letterhead line
  // says so; v2 has no letterhead, so it rides here, beside the other record-reading disclosures.
  const disclosure = `${cherryPickDisclosure(snap)}${truncationDisclosure(snap)}${utcNotice(snap.timezone)}`.trim()
  if (disclosure !== '') blocks.push({ kind: 'disclosure', id: 'disclosure', html: disclosure })

  const { band, leadFlag } = bandMembersOf(snap)
  const inBand = new Set(band)
  const snapshotBand = snap.safetyFlags.filter((f) => inBand.has(f))
  const checks = checksHtmlOf(snap)
  if (band.length > 0) {
    blocks.push({
      kind: 'band',
      id: 'band',
      heading: `Flags for the vet · ${band.length}`,
      // Ids keep the snapshot's order (CUL-2381): the band's ruled display order moves where an
      // item prints, never its id, so a stored AI lead's citations still resolve.
      items: band.map((f) => ({ id: flagId(f, snapshotBand.indexOf(f)), ...flagRowOf(bandFlagOf(f), snap, ptr), photos: bandPhotosOf(f, snap), photosLeftOutLine: bandLeftOutLineOf(f, snap) })),
      checksHtml: checks,
    })
  } else if (checks !== null) {
    blocks.push({ kind: 'checks', id: 'checks', html: checks })
  }

  // CUL-2551 (PM ruling (a), briefs 1a to 5a): every other block of v1's page 1, word for word in
  // v1's order, so sheet 1 never says less than v1's page 1 (`sheet1MustCarry.test.ts`). v1's
  // headline prints straight under the band, where v1 put it (CUL-2579 ruling (a)).
  const ep = episodesBlock(snap)
  const episodes = ep ? `<h2>${h(ep.heading)}</h2>${ep.html}` : null
  const carried = carriedSectionsOf(input, episodes)
  for (const c of carried) if (c.id === 'headline') blocks.push({ kind: 'carried', id: c.id, html: c.html })

  const thin = thinRecordLineOf(snap)
  if (thin) blocks.push({ kind: 'scope_line', id: 'scope-line', text: thin.text })

  // CUL-2323 + CUL-2340 (PM ruling (a)): the line prints whenever an entry holds, on every sheet.
  // `isZeroSignSheet` chooses only WHERE: the band's slot on a zero-sign sheet, under the lead chart
  // otherwise. Never framed like the band, never called a flag.
  const changes = changesInWindowOf(snap)
  const lead = leadSignOf(snap)
  // CUL-2361 ruling (a): on a zero-sign sheet the serif sentence is the changes line's lead, or the
  // coverage count when no change holds; never v1's absence sentence. A flagged intake lead keeps
  // the meals line as its sentence (adversarial pass 2 on CUL-2290, break 1).
  const intakeFlagLead = lead?.sign === 'intake' && lead.reason === 'flag'
  const changesSerif = zeroSign && !intakeFlagLead && changes !== null && changes.length > 0
  const changesBlock: BlockV2 | null = changes
    ? {
        kind: 'changes',
        id: 'changes',
        placement: zeroSign ? 'band_slot' : 'under_chart',
        heading: 'Changes in this window',
        lines: changes,
        serifLead: changesSerif,
      }
    : null
  if (changesBlock && zeroSign) blocks.push(changesBlock)

  const edge = recordEdgeLinesOf(snap)
  if (edge.length > 0) blocks.push({ kind: 'record_edge', id: 'record-edge', lines: edge.map((l) => l.text) })

  const lines = recordLinesOf(snap, lead, edge.length > 0)
  if (lines.length > 0) blocks.push({ kind: 'lead_sentence', id: 'lead-sentence', text: lines[0].text, serif: !changesSerif })

  blocks.push({ kind: 'lead_chart', id: 'lead-chart', chart: buildLeadChart(snap, lead, leadFlag, ptr) })
  if (changesBlock && !zeroSign) blocks.push(changesBlock)

  const confounder = confounderOf(snap)
  if (confounder) blocks.push({ kind: 'confounder', id: 'confounder', ...confounder })

  // CUL-2514: the trial's bottom line as v1's page 1 states it, beside the overlap it qualifies.
  const reading = trialReadingOf(snap)
  const trialRows = trialRowsOf(snap)
  if (reading !== null || trialRows.length > 0) {
    blocks.push({ kind: 'trial_reading', id: 'trial-reading', label: TRIAL_READING_LABEL, html: reading, rows: trialRows, heading: trialHeadingOf(snap) })
  }

  if (lines.length > 1) blocks.push({ kind: 'record_lines', id: 'record-lines', lines: lines.slice(1) })

  const gaps = gapLinesOf(snap)
  if (gaps.length > 0) blocks.push({ kind: 'gap_lines', id: 'gap-lines', heading: 'Not in this record', lines: gaps })

  for (const c of carried) if (c.id !== 'headline') blocks.push({ kind: 'carried', id: c.id, html: c.html })

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

  blocks.push({ kind: 'colophon', id: 'colophon', text: colophonOf(snap, opts, 1 + backSheets.length) })
  return { version: 'v2', sheet: 1, blocks, backSheets, reportId: opts.shortId }
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
    /** v1's trial bottom line (CUL-2514): never cut, so never in the cuttable budget. */
    trialReading: number
    /** v1 page 1's carried sections (CUL-2551): never cut. */
    carried: number
  }
}

function words(text: string): number {
  const t = text.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}

export function wordCountOf(doc: DocumentV2): WordCount {
  let cuttable = 0
  const fixed = { masthead: 0, band: 0, scopeLine: 0, twin: 0, colophon: 0, changes: 0, recordEdge: 0, disclosure: 0, questions: 0, trialReading: 0, carried: 0 }
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
        fixed.masthead += words([b.eyebrow, b.stamp, b.name, b.signalment, b.conditions ?? '', b.window, textOf(b.lastEntryHtml)].join(' '))
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
      case 'trial_reading':
        fixed.trialReading += words(`${textOf(b.heading ?? '')} ${b.label} ${textOf(b.html ?? '')} ${b.rows.map((r) => `${textOf(r.labelHtml)} ${textOf(r.html)}`).join(' ')}`)
        break
      case 'carried':
        fixed.carried += words(textOf(b.html))
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
