// Vet report v2 sheets 2 to N, the first back sheets (CUL-2293, row VR2-13; v2 spec §5.9, §6.1).
//
// `backSheetsOf(snapshot)` returns the sheets that follow the Front Page, each an ordered list of
// typed blocks with ids unique across the whole document, so the print renderer and the phone
// reflow are held to one list exactly as sheet 1's blocks are (spec §3.4).
//
// WHAT THIS ROW PRINTS, AND IN WHAT ORDER (spec §6.1's must-carry rows for sheet 2):
//   - the record sheet: the photo strip at the top when photos exist, one text line when none
//     (§5.9); C's day ledger (hatch for nothing logged, nothing drawn for a logged day without the
//     lead sign, never a 0); then "What each episode looked like";
//   - the intake sheet ("Intake per feeding"), whenever v1 would print appendix E. It comes FIRST
//     among the back sheets when an intake or refusal flag fired (GAP-35), otherwise after the
//     record sheet.
// VR2-14 (CUL-2294) prints the rest, after those two, in this order:
//   - "Event log" (v1 appendix A), every read's state in words;
//   - "Medications": the lifetime table first, then the dose log for this window (v1 D2 and D);
//   - "Diet, weight and food exposure": v1 page 1's diet, feeding and medication block, its weight
//     trend and the diet trial section, then v1's diet history and off-diet exposures (appendices
//     B and C). v1's protein-over-time chart is not reprinted: its labels are SVG text under v2's
//     11pt floor, every feeding it draws is dated in the exposures table, and a chart enters v2 only
//     with its own row in docs/nyx-chart-standard.md;
//   - "Noticed (owner’s observations)" when the owner answered: v1's graph, then every look by day;
//   - "How this record was kept", always last: the fixed absence rules (spec §6.1, GAP-33).
// Every one of them is v1's own section (rule 2 below); `v2Pointers` swaps v1's letters and "page 1"
// for the sheet each pointer lands on, and the must-carry registry (`mustCarry.ts`) holds every
// v1 §3 and §4 item to a block here or on sheet 1.
//
// THE RULES THIS FILE KEEPS (the same three as `documentV2.ts`):
//   1. It computes no clinical number. Counts come off the snapshot; the ledger only places the
//      snapshot's per-day counts on days.
//   2. It words no clinical finding. "What each episode looked like", the intake tables and the photo
//      cards are v1's own sections (`render.ts`), called with v2's pointers, so every present-only
//      rule, assessed denominator and "not a clearance" sentence is v1's, word for word. Where v1
//      points at an appendix v2 does not print yet, the sentence that pointed is left out whole
//      (`V2_SECTION_POINTERS`); it is never re-pointed at a page that is not in the document.
//   3. `html` fields are already-escaped fragments; every other text field is plain text.
import {
  REPORT_SYMPTOM_TYPES,
  type ReportSnapshot,
  type ReportSymptomType,
  type SafetyFlag,
} from './report.ts'
import {
  chronicityRecordPrecedesCounts,
  dietHistoryAppendix,
  dietMeds,
  dietTrialSection,
  eventLogParts,
  fmtDay,
  fmtLocalDay,
  fmtLocalTime,
  h,
  hasIncidentPhotos,
  hasNoticed,
  medicationAppendix,
  medicationHistoryTable,
  noticedAppendixLetter,
  noticedAppendixParts,
  noticedGraph,
  noticedLine,
  offDietAppendix,
  photosAppendixLetter,
  scopeBasisLabel,
  fmtRange,
  trialCropDisclosureRenders,
  weightBlock,
  incidentPhotoCard,
  incidentPhotosIntroHtml,
  intakeDetailTable,
  intakeLabel,
  mealItemsTable,
  mealsAppendixVisible,
  mealsIntroHtml,
  offTrialFootnote,
  safetyFlagRow,
  stoolCharacteristics,
  symptomLabel,
  vomitCharacteristics,
  type FlagPointers,
  type SectionPointers,
} from './render.ts'
import { leadSignOf } from './v2Predicates.ts'
import { feedingWasFinished } from '../../../lib/dietTrial.ts'

// ── Types ────────────────────────────────────────────────────────────────────

/** One day of the ledger. `outside` pads the last row past the window's end and draws nothing. */
export interface LedgerCell {
  day: string
  /** `none`: nothing of any kind logged (hatch); `logged`: an entry that day, none of the lead
   *  sign (drawn as nothing, never a 0); `sign`: the lead sign that day, with its count. */
  state: 'none' | 'logged' | 'sign' | 'outside'
  count: number
  /** Intake fill only: true when every rated meal that day was refused (drawn solid); false when a
   *  meal was not fully eaten but not every one was refused (drawn light), the lead chart's two fills. */
  refusedAll?: boolean
}

export interface LedgerRow {
  /** The row's first day, plain text ("Sep 16"). */
  label: string
  cells: LedgerCell[]
}

export type BackBlockV2 =
  | { kind: 'photo_strip'; id: 'photo-strip'; heading: string; introHtml: string; cardsHtml: string[] }
  | { kind: 'no_photos'; id: 'photo-strip'; text: string }
  | {
      kind: 'ledger'
      id: 'ledger'
      heading: string
      /** What one square is and every mark the grid draws, and only those (AC 4). */
      caption: string
      /** The lead sign the grid fills, plain text, or null when no symptom leads. */
      fills: string | null
      rows: LedgerRow[]
      /** The text twin: every fact the grid draws, in words (the grid is aria-hidden). */
      lines: string[]
    }
  | { kind: 'episodes'; id: 'episodes'; heading: string; html: string }
  /** A v1 section reprinted whole under a v2 heading (VR2-14): its HTML is v1's, pointers swapped. */
  | { kind: 'section'; id: SectionBlockId; heading: string | null; html: string }
  /** "How this record was kept" (spec §6.1, GAP-33): fixed sentences, plain text, always last. */
  | { kind: 'kept'; id: 'kept'; heading: string; entries: KeptEntry[] }
  | {
      kind: 'intake'
      id: 'intake'
      heading: string
      introHtml: string
      /** The refusal flag's own predicate, read off `feedingWasFinished`; null when no such flag. */
      predicate: string | null
      /** The last watched meal rated above "refused", when the dated list can say it. */
      lastAboveRefused: string | null
      tablesHtml: string
    }

export type SectionBlockId =
  | 'noticed-line'
  | 'event-log'
  | 'medication-history'
  | 'medication-log'
  | 'diet-meds'
  | 'weight'
  | 'diet-trial'
  | 'diet-history'
  | 'exposures'
  | 'noticed-graph'
  | 'noticed-log'

/** One rule of "How this record was kept": a term and its sentences, plain text. */
export interface KeptEntry {
  term: string
  text: string
}

export type BackSheetKind = 'record' | 'intake' | 'log' | 'medication' | 'diet' | 'noticed' | 'kept'

export interface BackSheetV2 {
  /** 2, 3, …: computed, never typed (WBC-11). */
  n: number
  id: string
  kind: BackSheetKind
  title: string
  blocks: BackBlockV2[]
}

// ── Pointers (CUL-2350) ──────────────────────────────────────────────────────

/** The intake sheet's name, as every pointer to it prints it. */
export const INTAKE_SHEET_TITLE = 'Intake per feeding'
export const RECORD_SHEET_TITLE = 'The record by day'
export const LOG_SHEET_TITLE = 'Event log'
export const MEDICATION_SHEET_TITLE = 'Medications'
export const DIET_SHEET_TITLE = 'Diet, weight and food exposure'
export const NOTICED_SHEET_TITLE = 'Noticed (owner’s observations)'
export const KEPT_SHEET_TITLE = 'How this record was kept'

/** A pointer at a sheet by the title it prints, as HTML (rule 3). Never a number: see below. */
export const sheetHeaded = (title: string): string => `the sheet headed &ldquo;${h(title)}&rdquo;`

/**
 * v1's detail sections, pointed at v2's sheets (VR2-14). Until this row these were null and every
 * sentence that pointed at an appendix was left out whole; the event log and the diet sheet now
 * print, so the sentences come back, pointed at the sheets by title.
 */
export const V2_SECTION_POINTERS: SectionPointers = {
  eventLog: sheetHeaded(LOG_SHEET_TITLE),
  freeFedAndTreats: `Free-fed food and treats are on ${sheetHeaded(DIET_SHEET_TITLE)}`,
}
export const EPISODES_HEADING = 'What each episode looked like'
export const NO_PHOTOS_LINE = 'No incident photos in this window.'

/**
 * Where sheet 1's reused v1 flag rows point (CUL-2350): every pointer lands on a sheet this document
 * prints, by the title that sheet prints in its running head and heading. v1's "appendix A lists
 * this window's entries" becomes the event log, which lists every entry by date and time (VR2-14;
 * before it, the ledger stood in).
 *
 * BY TITLE, NEVER BY NUMBER. A sheet number inside a flag line is a digit that is not a clinical
 * fact, and the AI lead's verifier (PR-25) reads every number band item 1 prints as one the lead must
 * repeat: "on sheet 2" made the honest cat lead fail for leaving out a 2. A title says where to turn
 * and adds no number to the band.
 */
export function v2FlagPointersOf(sheets: readonly BackSheetV2[], snap: ReportSnapshot): FlagPointers {
  const titled = (t: string): string => `on the sheet headed &ldquo;${h(t)}&rdquo;`
  const intake = sheets.find((s) => s.kind === 'intake')
  if (!sheets.some((s) => s.kind === 'record')) throw new Error('the record sheet always prints')
  if (!sheets.some((s) => s.kind === 'log')) throw new Error('the event log always prints')
  // v1 only points at appendix E where it prints it, by the same predicate the intake sheet uses,
  // so a missing intake sheet is never pointed at; the fallback only keeps the type total.
  const meals = titled(intake ? INTAKE_SHEET_TITLE : RECORD_SHEET_TITLE)
  return {
    mealsIn: meals,
    mealsDetailIn: meals,
    // The event log lists every entry by date and time (VR2-14), as v1's appendix A did.
    logLists: `the event log ${titled(LOG_SHEET_TITLE)} lists`,
    incidents: snap.incidentPhotos.length > 0 ? `see the incident photos ${titled(RECORD_SHEET_TITLE)}` : null,
  }
}

// ── Small helpers ────────────────────────────────────────────────────────────

/** Strip v1's markup to plain text (the twin and the dates are plain). */
function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .trim()
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function windowDays(snap: ReportSnapshot): string[] {
  const out: string[] = []
  for (let d = snap.scope.startDate; d <= snap.scope.endDate; d = addDays(d, 1)) out.push(d)
  return out
}

const dayLabel = (day: string): string => plain(fmtDay(day))

/** "Sep 3–5", "Sep 30–Oct 2", "Sep 9": consecutive days joined, the month said once. */
function dayRanges(days: readonly string[]): string[] {
  const out: string[] = []
  let i = 0
  while (i < days.length) {
    let j = i
    while (j + 1 < days.length && days[j + 1] === addDays(days[j], 1)) j++
    if (i === j) out.push(dayLabel(days[i]))
    else {
      const a = dayLabel(days[i])
      const b = dayLabel(days[j])
      const sameMonth = days[i].slice(0, 7) === days[j].slice(0, 7)
      out.push(sameMonth ? `${a}–${b.replace(/^\S+\s/, '')}` : `${a}–${b}`)
    }
    i = j + 1
  }
  return out
}

/** v1's fragments name the front page "page 1"; v2 calls it sheet 1. Only that phrase changes. */
function onSheets(html: string): string {
  return html
    .replace(/page&nbsp;1/g, 'sheet&nbsp;1')
    // v1's characteristics sit on page 1 under the band; on v2 they are a sheet away from it.
    .replace(/These lead the flags for review above\./g, 'These lead the flags for review on sheet&nbsp;1.')
}

const INTAKE_FLAGS: ReadonlySet<SafetyFlag['kind']> = new Set(['intake_decline', 'trial_diet_refusal'])

/** GAP-35: an intake or refusal flag fired, so the intake sheet leads the back sheets. */
export function intakeFlagFired(snap: ReportSnapshot): boolean {
  return snap.safetyFlags.some((f) => INTAKE_FLAGS.has(f.kind))
}

// ── The record sheet ─────────────────────────────────────────────────────────

function photoBlock(snap: ReportSnapshot): BackBlockV2 {
  // v1's predicate: a retained photo, or a photographed and read incident whose photo the owner
  // removed (which must be disclosed, never dropped).
  if (!hasIncidentPhotos(snap)) return { kind: 'no_photos', id: 'photo-strip', text: NO_PHOTOS_LINE }
  return {
    kind: 'photo_strip',
    id: 'photo-strip',
    heading: 'Incident photos',
    introHtml: onSheets(incidentPhotosIntroHtml(snap, V2_SECTION_POINTERS)),
    cardsHtml: snap.incidentPhotos.map((p) => incidentPhotoCard(p, snap.timezone)),
  }
}

function ledgerBlock(snap: ReportSnapshot, intakeSheet: boolean): BackBlockV2 {
  const days = windowDays(snap)
  const logged = new Set(snap.v2.loggedDayKeys)
  const lead = leadSignOf(snap)
  // The lead sign fills the grid. When intake leads (or nothing does), the sign with the most days
  // with an entry fills it instead, so a refusing cat's vomiting is still drawn on its days; the
  // caption names whichever sign it is.
  const busiest = [...snap.symptoms]
    .filter((x) => x.count > 0)
    .sort((a, b) => b.symptomDays - a.symptomDays || b.count - a.count || REPORT_SYMPTOM_TYPES.indexOf(a.type) - REPORT_SYMPTOM_TYPES.indexOf(b.type))[0]
  // A lead sign with no entry in the window (a stool blood flag on a dog that logged no loose stool)
  // would fill nothing and leave a flagged chronic sign drawn plain; the busiest sign fills instead.
  const leadHasDays = lead !== null && lead.sign !== 'intake' && snap.v2.symptomDayCounts.some((x) => x.type === lead.sign && x.count > 0 && x.day >= snap.scope.startDate && x.day <= snap.scope.endDate)
  const fill: ReportSymptomType | null = leadHasDays ? (lead!.sign as ReportSymptomType) : busiest?.type ?? null
  const reportSigns = new Set<string>(REPORT_SYMPTOM_TYPES)
  const byType = new Map<ReportSymptomType, Map<string, number>>()
  for (const x of snap.v2.symptomDayCounts) {
    if (!reportSigns.has(x.type) || x.count <= 0) continue
    const m = byType.get(x.type) ?? new Map<string, number>()
    m.set(x.day, x.count)
    byType.set(x.type, m)
  }
  // INTAKE LEADS: the grid draws what the flag is about (cold read round 2, Mira: thirty refusals
  // left off the grid read as quiet days). Its days are the watched rated meals not fully eaten, the
  // same predicate the lead chart's intake row draws, and every symptom moves to the lines below.
  const intakeFill = lead?.sign === 'intake' && snap.v2.mealNotFinishedDayCounts.length > 0
  const symptomFill: ReportSymptomType | null = intakeFill ? null : fill
  const leadDays = intakeFill
    ? new Map(snap.v2.mealNotFinishedDayCounts.map((x) => [x.day, x.count] as const))
    : symptomFill
      ? byType.get(symptomFill) ?? new Map<string, number>()
      : new Map<string, number>()

  const intakeByDay = new Map(snap.v2.mealNotFinishedDayCounts.map((x) => [x.day, x] as const))
  const cells: LedgerCell[] = days.map((day) => {
    const count = leadDays.get(day) ?? 0
    const cell: LedgerCell = { day, count, state: count > 0 ? 'sign' : logged.has(day) ? 'logged' : 'none' }
    if (intakeFill && count > 0) {
      const d = intakeByDay.get(day)
      cell.refusedAll = d !== undefined && d.refused === d.rated
    }
    return cell
  })
  const rows: LedgerRow[] = []
  for (let i = 0; i < cells.length; i += 7) {
    const slice = cells.slice(i, i + 7)
    while (slice.length < 7) slice.push({ day: addDays(slice[slice.length - 1].day, 1), state: 'outside', count: 0 })
    rows.push({ label: dayLabel(slice[0].day), cells: slice })
  }

  const label = intakeFill ? 'Meals not finished' : symptomFill ? symptomLabel(symptomFill) : null
  const lower = intakeFill ? 'a meal not finished' : label ? label.toLowerCase() : null
  const drawsSign = cells.some((c) => c.state === 'sign')
  const drawsLogged = cells.some((c) => c.state === 'logged')
  const hatched = cells.filter((c) => c.state === 'none').map((c) => c.day)
  // The caption names only the marks this grid draws (AC 4, the chart standard's twin rule).
  const legend = [
    ...(drawsSign && lower
      ? intakeFill
        ? [
            ...(cells.some((c) => c.refusedAll === true) ? ['Solid: every rated meal that day refused.'] : []),
            ...(cells.some((c) => c.refusedAll === false) ? ['Light: a rated meal not fully eaten that day (any rating below “ate it all”), not every one refused.'] : []),
            'The number is the meals not fully eaten that day.',
          ]
        : [`Filled: ${lower} that day, with its count.`]
      : []),
    // "Plain" is a day something else was logged, never a day the sign was seen not to happen
    // (cold read: a plain square read as a normal-stool day on a record of 12 stools in 30 days).
    ...(drawsLogged
      ? [
          lower && drawsSign
            ? intakeFill
              ? 'Plain: something was logged that day, but no rated meal left unfinished; not a sign every meal was eaten.'
              : `Plain: something else was logged that day, but no ${lower}; not a sign it did not happen.`
            : 'Plain: something was logged that day.',
        ]
      : []),
    ...(hatched.length > 0 ? ['Hatched: nothing logged.'] : []),
  ]
  const caption = `Every day of the ${days.length}, as logged. One square is one day. ${legend.join(' ')}`.trim()

  const dayWithCount = (day: string, n: number): string => (n > 1 ? `${dayLabel(day)} ×${n}` : dayLabel(day))
  const lines: string[] = []
  if (intakeFill) {
    // Refusal apart from a partly eaten meal, by day, with the meals behind each (cold read round 3:
    // one mark for both erased the day she stopped eating anything).
    const inW = snap.v2.mealNotFinishedDayCounts.filter((x) => x.day >= snap.scope.startDate && x.day <= snap.scope.endDate)
    const all = inW.filter((x) => x.refused === x.rated).map((x) => x.day)
    const part = inW.filter((x) => x.refused !== x.rated).map((x) => x.day)
    const notFinished = inW.reduce((n, x) => n + x.count, 0)
    const rated = inW.reduce((n, x) => n + x.rated, 0)
    lines.push(
      `Meals not finished on ${inW.length} of ${days.length} days (${notFinished} of the ${rated} rated meals on those days)${
        all.length > 0 ? `; every rated meal refused on ${dayRanges(all).join(', ')}` : ''
      }${part.length > 0 ? `; not finished, not every one refused, on ${dayRanges(part).join(', ')}` : ''}.`,
    )
  } else if (label && lower) {
    const ds = [...leadDays.entries()].filter(([d]) => d >= snap.scope.startDate && d <= snap.scope.endDate).sort((a, b) => a[0].localeCompare(b[0]))
    if (ds.length > 0) {
      lines.push(`${label} on ${ds.length} of ${days.length} days: ${ds.map(([d, n]) => dayWithCount(d, n)).join(', ')}.`)
    }
  }
  // Every other sign, dated, so the ledger dates every entry in the window (the chronicity
  // pointer's claim, CUL-2350) and a second or third sign is never only a count (Dr. Chen,
  // 2026-10-31: three signs on overlapping days).
  const others = REPORT_SYMPTOM_TYPES.filter((t) => t !== symptomFill && byType.has(t)).map((t) => {
    const ds = [...(byType.get(t) as Map<string, number>).entries()]
      .filter(([d]) => d >= snap.scope.startDate && d <= snap.scope.endDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
    return { t, ds }
  }).filter((o) => o.ds.length > 0)
  if (others.length > 0) {
    lines.push(
      `${label ? 'Also on these days' : 'Entries by day'}: ${others
        .map((o) => `${symptomLabel(o.t).toLowerCase()} ${o.ds.map(([d, n]) => dayWithCount(d, n)).join(', ')}`)
        .join('; ')}.`,
    )
  }
  if (lead?.sign === 'intake' && intakeSheet) {
    lines.push(`Meals not finished are listed by date and time on the sheet headed “${INTAKE_SHEET_TITLE}”.`)
  }
  if (hatched.length > 0) lines.push(`Nothing logged: ${dayRanges(hatched).join(', ')}.`)
  return { kind: 'ledger', id: 'ledger', heading: 'Every day of the window', caption, fills: label, rows, lines }
}

function episodesBlock(snap: ReportSnapshot): BackBlockV2 | null {
  const html = `${vomitCharacteristics(snap, V2_SECTION_POINTERS)}${stoolCharacteristics(snap, V2_SECTION_POINTERS)}`.trim()
  if (html === '') return null
  // v1's two sections sit under this sheet's own heading, so their headings step down one level.
  return {
    kind: 'episodes',
    id: 'episodes',
    heading: EPISODES_HEADING,
    html: onSheets(html.replace(/<h2>/g, '<h3>').replace(/<\/h2>/g, '</h3>')),
  }
}

// ── The intake sheet ─────────────────────────────────────────────────────────

const RATING_ORDER = ['all', 'most', 'some', 'picked', 'refused'] as const

/** The refusal flag's own split of the ratings, read off the predicate it counts with. */
function predicateLineOf(snap: ReportSnapshot): string | null {
  const flag = snap.safetyFlags.find((f) => f.kind === 'trial_diet_refusal')
  // A refusal the owner reported by ending the trial, with no counts behind it, has no split to state.
  if (!flag || flag.kind !== 'trial_diet_refusal' || flag.refusal === null) return null
  let tag = ''
  safetyFlagRow(flag, snap, (t) => {
    tag = t
    return ''
  })
  const word = (r: string): string => `“${intakeLabel(r).toLowerCase()}”`
  const notFinished = RATING_ORDER.filter((r) => feedingWasFinished(r) === false)
  const finished = RATING_ORDER.filter((r) => feedingWasFinished(r) === true)
  const or = (xs: readonly string[]): string =>
    xs.length <= 1 ? xs.map(word).join('') : `${xs.slice(0, -1).map(word).join(', ')} or ${word(xs[xs.length - 1])}`
  let line = `The “${tag}” flag on sheet 1 counts a rated feeding as not finished when it is ${or(notFinished)}; ${or(finished)} count${
    finished.length === 1 ? 's' : ''
  } as finished.`
  // The dated list below holds every meal below "ate it all" when no reduced-intake flag fired, so
  // it can carry meals this flag counts as finished; said, so the two counts never look like one.
  const listedFinished = finished.filter((r) => r !== 'all' && snap.provenance.intakeLog.some((e) => e.intakeRating === r))
  if (snap.provenance.intakeLogScope === 'unfinished' && listedFinished.length > 0) {
    const holds = snap.provenance.intakeLogHiddenOlder > 0 ? 'lists the most recent meals' : 'holds every meal'
    line += ` The dated list below ${holds} rated below “ate it all”, so it also lists ${or(listedFinished)} meals, which the flag counts as finished.`
  }
  return line
}

/** " (UTC)" when the record carries no usable zone: fmtLocalTime then prints UTC, and an
 *  unlabelled UTC minute reads as local (adversarial pass 1 on CUL-2293). */
function utcMark(tz: string | null): string {
  if (!tz) return ' (UTC)'
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return ''
  } catch {
    return ' (UTC)'
  }
}

/**
 * GAP-35's line: when a refusing pet last ate something, the time a vet phoning about the feline
 * 48 to 72 hour window needs. Read off the snapshot (`lastMealAboveRefusal`), which `assembleReport`
 * computes over every watched rated meal in the window, never the capped dated list below.
 *
 * THE THRESHOLD IS THE REFUSAL CLASS, NOT "REFUSED" ALONE (adversarial pass 1): "picked at it" is in
 * the codebase's refusal class (`lib/intakeEvidence.ts`), and anchoring on it made four days of
 * picking read as a meal seven hours ago beside a band saying five days without a full meal. The
 * spec's words are "above refused"; this is the louder reading, shipped while that ruling is open.
 */
function lastAboveRefusedOf(snap: ReportSnapshot): string | null {
  const v = snap.v2
  if (v.watchedRatedMeals === 0) return null
  const bowl = v.intakeWeeksBowlExcluded > 0 || snap.provenance.intakeLogFreeFedExcluded > 0
  const noun = bowl ? 'watched meal' : 'meal'
  // A free-fed bowl down in the window was not watched, so the last RATED meal is not the last
  // intake; said beside the line, never left to the paragraph above (cold read, Mira).
  // Only a bowl still down AFTER the meal can have been eaten from since (adversarial pass 2).
  // A bowl with no end date is still down, so it was down after every meal, even where its start is
  // unreadable and the detector's spans drop it (Mira's bowl has no recorded start).
  const bowlSince = v.freeFedDownSinceLastMeal || snap.diet.freeFed.some((f) => f.activeUntil === null)
  const hit0 = v.lastMealAboveRefusal
  const caveat = !bowlSince
    ? ''
    : hit0
      ? ' A free-fed bowl was down after it and its intake is not directly observed, so this is the last rated meal, not the last time food was eaten.'
      : ' A free-fed bowl was down in this window and its intake is not directly observed, so these ratings are not everything eaten.'
  const anyMostOrAll = snap.diet.mealItems.some((i) => i.intakeBreakdown.some((b) => (b.rating === 'all' || b.rating === 'most') && b.count > 0))
  const hit = v.lastMealAboveRefusal
  if (!hit) {
    return `No ${noun} in this window was rated “ate some” or better: every one of the ${v.watchedRatedMeals} rated was “picked at it” or “refused”.${caveat}`
  }
  const none = anyMostOrAll ? '' : ' No meal in this window was rated “ate most” or “ate it all”.'
  return `The last ${noun} rated “ate some” or better: ${plain(fmtLocalDay(hit.occurredAt, snap.timezone))} at ${plain(
    fmtLocalTime(hit.occurredAt, snap.timezone),
  )}${utcMark(snap.timezone)} (${intakeLabel(hit.rating).toLowerCase()}).${none}${caveat}`
}

function intakeBlock(snap: ReportSnapshot): BackBlockV2 {
  const items = snap.diet.mealItems
  const log = snap.provenance.intakeLog
  const footnote = items.length > 0 && items.some((i) => i.proteinSet.offTrial.length > 0) ? offTrialFootnote(snap.diet.trialTargetProtein) : ''
  const tables = `${items.length > 0 ? mealItemsTable(snap, items) : ''}${footnote}${log.length > 0 ? intakeDetailTable(snap, log, '') : ''}`
  return {
    kind: 'intake',
    id: 'intake',
    heading: INTAKE_SHEET_TITLE,
    introHtml: onSheets(mealsIntroHtml(V2_SECTION_POINTERS)),
    predicate: predicateLineOf(snap),
    lastAboveRefused: lastAboveRefusedOf(snap),
    tablesHtml: onSheets(tables),
  }
}

// ── The pointer swap (VR2-14) ────────────────────────────────────────────────

/**
 * v1's letters, resolved to the v2 sheet that prints the same section. v1 letters its appendices by
 * what renders (`photosAppendixLetter`, `noticedAppendixLetter`), so the map reads v1's own
 * functions rather than typing a letter, and a letter v2 has no sheet for is never in it.
 */
function letterTitles(snap: ReportSnapshot): Map<string, string> {
  const m = new Map<string, string>([
    ['A', LOG_SHEET_TITLE],
    ['B', DIET_SHEET_TITLE],
    ['C', DIET_SHEET_TITLE],
    ['D', MEDICATION_SHEET_TITLE],
  ])
  if (mealsAppendixVisible(snap)) m.set('E', INTAKE_SHEET_TITLE)
  if (hasIncidentPhotos(snap)) m.set(photosAppendixLetter(snap), RECORD_SHEET_TITLE)
  if (hasNoticed(snap)) m.set(noticedAppendixLetter(snap), NOTICED_SHEET_TITLE)
  return m
}

/**
 * v1 page 1's sections that v2 reprints on the diet sheet point at each other as "page 1". On v2
 * they share a sheet, so each phrase says "this sheet"; read one by one, so a "page 1" this table
 * does not know falls through to "sheet 1" only where `assertNoV1Pointer` lets it.
 */
const SAME_SHEET: ReadonlyArray<readonly [string, string]> = [
  ['Weight trend on page&nbsp;1', 'Weight trend on this sheet'],
  ['so page&nbsp;1 shows no weight trend', 'so this sheet shows no weight trend'],
  ['on page&nbsp;1 under Timing vs symptoms', 'on this sheet under Timing vs symptoms'],
  ['not the association test on page&nbsp;1', 'not the association test on this sheet'],
  ['the diet-trial block on page&nbsp;1', 'the diet-trial section on this sheet'],
  // The Noticed line prints under the ledger on v2, and lists symptom-class words only, as v1's did.
  ['only an activity word, which page 1 never lists', 'only an activity word, which this line never lists'],
]

/**
 * The "page 1" phrases that stay true as "sheet 1" on v2: each names something sheet 1 prints (the
 * band's flags, the changes in this window). Anything else that says "page 1" is a pointer at a v1
 * section whose v2 home is a back sheet, and `assertNoV1Pointer` fails the build on it rather than
 * let a vet turn to sheet 1 for a section it does not hold.
 */
const SHEET_ONE_TRUE = [
  /safety flags? on sheet&nbsp;1/,
  /flag(?:s for review)? on sheet&nbsp;1/,
  /reduced-intake flag on sheet&nbsp;1/,
  /named among the concurrent changes on sheet&nbsp;1/,
  /These lead the flags for review on sheet&nbsp;1/,
  /the Weight flag on sheet&nbsp;1/,
  /the &ldquo;last fully-eaten meal&rdquo; on sheet&nbsp;1/,
  /so sheet&nbsp;1 shows no &ldquo;last full meal&rdquo;/,
  /\(sheet&nbsp;1 anchor\)/,
]

/** v1's whole-course adherence line is the diet sheet's; the dose log on the medication sheet says so. */
function medicationPointers(html: string): string {
  return html.replace('page&nbsp;1&rsquo;s adherence line counts the whole course', `the adherence line on ${sheetHeaded(DIET_SHEET_TITLE)} counts the whole course`)
}

/**
 * Swap every v1 pointer in a reprinted v1 section for the v2 sheet that holds its target (rule 2:
 * only the pointer changes, never the sentence around it). An appendix title becomes the block's
 * own heading, without its letter.
 */
export function v2Pointers(html: string, snap: ReportSnapshot): string {
  const titles = letterTitles(snap)
  const title = (letter: string): string => {
    const t = titles.get(letter)
    if (!t) throw new Error(`appendix ${letter} has no v2 sheet on this record`)
    return t
  }
  let out = html
    .replace(/<p class="appx-title serif"[^>]*>(?:Appendix [A-G] (?:—|&mdash;) )?([\s\S]*?)<\/p>/g, '<h2>$1</h2>')
    // v1's weight sparkline is role="img" with a label; on v2 every SVG is aria-hidden and its words
    // are the twin (the reading, count, span and change printed beside it), as sheet 1's charts are.
    .replace(/<svg class="spark"([^>]*?) role="img" aria-label="[^"]*"/g, '<svg class="spark"$1 aria-hidden="true"')
    // v1 page 1's diet block closes on a contents line ("Full event log, … : appendices A–E"):
    // navigation only, and v2's sheets carry their titles, so it is left out whole.
    .replace(/\s*<p class="ref">Full event log, [\s\S]*?<\/p>/g, '')
  // v1 spells "page 1" both with a no-break space and without; each phrase matches either.
  for (const [from, to] of SAME_SHEET) out = out.replaceAll(from, to).replaceAll(from.replaceAll('&nbsp;', ' '), to)
  out = medicationPointers(out)
    .replace(/\(appendix(?:&nbsp;| )([A-G])\)/g, (_m, l: string) => `(${sheetHeaded(title(l))})`)
    .replace(/\bin appendix(?:&nbsp;| )([A-G])\b/g, (_m, l: string) => `on ${sheetHeaded(title(l))}`)
    .replace(/\bappendix(?:&nbsp;| )([A-G])\b/g, (_m, l: string) => sheetHeaded(title(l)))
  return onSheets(out)
}

/**
 * The guard behind the swap: no reprinted section may name an appendix, a page, or a "sheet 1"
 * that sheet 1 does not hold. Thrown at build time, so a v1 change that adds a pointer reds every
 * v2 test before it can print a dangling reference (the class v1 paid for with B-599).
 */
export function assertNoV1Pointer(html: string, where: string): void {
  const text = html.replace(/<[^>]*>/g, ' ')
  const appendix = /\bappendi(?:x|ces)\b/i.exec(text)
  if (appendix) throw new Error(`${where}: names an appendix: “${text.slice(Math.max(0, appendix.index - 60), appendix.index + 40).trim()}”`)
  const page = /\bpage(?:&nbsp;|\s)1\b/.exec(html)
  if (page) throw new Error(`${where}: names page 1: “${html.slice(Math.max(0, page.index - 80), page.index + 40)}”`)
  let rest = html
  for (const ok of SHEET_ONE_TRUE) rest = rest.replace(new RegExp(ok.source, 'g'), '')
  const s1 = /sheet&nbsp;1/.exec(rest)
  if (s1) throw new Error(`${where}: points at sheet 1 for something sheet 1 may not hold: “${rest.slice(Math.max(0, s1.index - 80), s1.index + 40)}”`)
}

/** A v1 section as a v2 block: pointers swapped, then held to the guard. Null when v1 prints nothing. */
function sectionBlock(id: SectionBlockId, heading: string | null, v1Html: string, snap: ReportSnapshot): BackBlockV2 | null {
  if (v1Html.trim() === '') return null
  const html = v2Pointers(v1Html, snap).trim()
  assertNoV1Pointer(html, id)
  return { kind: 'section', id, heading, html }
}

// ── The event log, medication, diet and Noticed sheets ───────────────────────

function eventLogBlock(snap: ReportSnapshot): BackBlockV2 {
  const p = eventLogParts(snap, true)
  const html = `<p class="bnote">${p.subHtml}</p>${p.tableHtml}<p class="note">${p.noteHtml}</p>`
  return sectionBlock('event-log', 'Symptom event log', html, snap) as BackBlockV2
}

function medicationBlocks(snap: ReportSnapshot): BackBlockV2[] {
  // The lifetime table first (spec §6.1): its coverage note and H1 disclosure lead the data, and it
  // answers "has she ever been on steroids?" before the window's dose detail narrows the view.
  return [sectionBlock('medication-history', null, medicationHistoryTable(snap), snap), sectionBlock('medication-log', null, medicationAppendix(snap), snap)].filter(
    (b): b is BackBlockV2 => b !== null,
  )
}

function dietBlocks(snap: ReportSnapshot): BackBlockV2[] {
  // The off-trial "*" key goes beside the table that used it, as v1's `appendixBCD` places it.
  const hasTrial = snap.diet.trial != null
  const markedB =
    hasTrial &&
    (snap.diet.trial!.proteinSet.offTrial.length > 0 ||
      snap.diet.freeFed.some((f) => f.proteinSet.offTrial.length > 0) ||
      snap.diet.mealItems.some((m) => m.proteinSet.offTrial.length > 0))
  const markedC = hasTrial && snap.provenance.confounders.some((c) => c.proteinSet.offTrial.length > 0)
  const key = offTrialFootnote(snap.diet.trialTargetProtein)
  return [
    sectionBlock('diet-meds', null, dietMeds(snap), snap),
    sectionBlock('weight', 'Weight', weightBlock(snap), snap),
    sectionBlock('diet-trial', null, dietTrialSection(snap), snap),
    sectionBlock('diet-history', null, `${dietHistoryAppendix(snap)}${markedB ? key : ''}`, snap),
    sectionBlock('exposures', null, `${offDietAppendix(snap)}${!markedB && markedC ? key : ''}`, snap),
  ].filter((b): b is BackBlockV2 => b !== null)
}

function noticedBlocks(snap: ReportSnapshot): BackBlockV2[] {
  const parts = noticedAppendixParts(snap, 'the four-week strip above')
  if (!parts) return []
  const log = `<p class="bnote">${parts.subHtml}</p>${parts.tableHtml}<p class="note">${parts.footHtml}</p>`
  return [sectionBlock('noticed-graph', null, noticedGraph(snap), snap), sectionBlock('noticed-log', 'Every answer, by day', log, snap)].filter(
    (b): b is BackBlockV2 => b !== null,
  )
}

/** Spec §6.1's Noticed row: the answered-day line under the sheet 2 ledger, pointing at the Noticed sheet. */
function noticedLineBlock(snap: ReportSnapshot): BackBlockV2 | null {
  if (!hasNoticed(snap)) return null
  return sectionBlock('noticed-line', null, noticedLine(snap), snap)
}

// ── How this record was kept (spec §6.1, GAP-33) ─────────────────────────────

/**
 * The fixed absence rules, in clinical words, always the last sheet. v1's "How to read this report"
 * is the source: every rule it teaches a reader is here, re-pointed at v2's sheets, and each entry
 * that describes a section prints only where the document carries that section (v1's B-599 rule: a
 * legend entry for a line the report lacks is a dangling reference).
 *
 * THE FLAG ENTRY STATES THE RULE, NEVER A RESULT. v1 learned it on a cat refusing 34 of 38 feedings:
 * "none were present in this window" reads as an all-clear and then denies being one. So the
 * sentence is the same whether or not a flag fired, and it lists every lane the checks watch
 * (B-494), so a lane's silence is never read as its negative result.
 *
 * Plain text, sentence by sentence, because the extraction test (`scripts/report-extract`) asserts
 * every sentence survives a clinic's text extraction (GAP-33).
 */
export function keptEntries(snap: ReportSnapshot): KeptEntry[] {
  const entries: KeptEntry[] = [
    {
      term: 'No flag is not an all-clear',
      text: 'Flags for review print on sheet 1 only when a check fired, and they rest on the owner’s record, not a diagnosis. The checks look for chronicity, reduced intake, a prescribed diet going uneaten, weight loss, possible blood or foreign material, and worsening. When no flag prints, no check fired; that is not the same as nothing being wrong.',
    },
    {
      term: 'Owner-reported',
      text: 'Every entry was logged by the owner on a phone. This is a record of what the owner observed, not a clinical examination, and it contains no diagnosis or treatment recommendation.',
    },
    {
      term: 'Present-only findings',
      text: 'Blood, foreign material and mucus are reported only when seen in an incident; their absence is never printed as a count. Absence in a photo cannot exclude bleeding, digested blood photographs poorly, and these are automated reads. A clear photo is never an all-clear.',
    },
    {
      term: 'Assessed denominators',
      text: 'Photo findings are counted over the incidents with a legible automated read. A read that was uncertain, failed or still processing is named as such and is never counted as clear. The reads are owner-reviewable, not reviewed, and never carry a diagnosis or a single-incident verdict.',
    },
    {
      term: 'Denominators',
      text: 'Every count is shown over its window and the days logged, so a count is never read without how long and how completely it was tracked. A day with nothing logged is not a day without signs.',
    },
    {
      term: 'Range',
      text: `This record covers ${plain(scopeBasisLabel(snap.scope).toLowerCase())}, ${plain(fmtRange(snap.scope.startDate, snap.scope.endDate))}. A hand-picked window states how many symptom events fall outside it, so nothing is cropped to a good week.${
        trialCropDisclosureRenders(snap)
          ? ' Where the range covers only part of a diet trial, the trial section names the symptom events logged in the trial days it leaves out; neither count reports an absence of symptoms.'
          : ''
      }`,
    },
    {
      term: 'Entries and episodes',
      text: 'An entry is one logged row, with same-minute duplicates collapsed: the unit of the counts and the day ledger. An episode is a bout: entries within three hours of each other are chained into one, the unit of the chronicity flag. A sign logged repeatedly during one bout shows more entries than episodes; the two are deliberately not reconciled into one number.',
    },
    {
      term: 'Time confidence',
      text: 'In the event log, seen means a witnessed time, est an estimated time, and range a window the event occurred in, found later. A bare “before” or “after” time is one known bound. Unspecified means no confidence was recorded; treat that time as approximate.',
    },
    {
      term: 'Duplicate logs',
      text: 'The same incident logged more than once is counted once everywhere on this record, and the number of logs is shown beside it rather than hidden.',
    },
    ...(chronicityRecordPrecedesCounts(snap)
      ? [
          {
            term: 'Where the chronicity counts begin',
            text: `The chronicity flag reads a fixed recent window, which can be shorter than this record’s range. Its day counts begin where it says; the earlier entries are real, are listed on the sheet headed “${LOG_SHEET_TITLE}”, and are outside the counted window, not judged unrelated.`,
          },
        ]
      : []),
    ...(hasIncidentPhotos(snap)
      ? [
          {
            term: 'Incident photos',
            text: `The owner’s own photos, attached when each event was logged, are on the sheet headed “${RECORD_SHEET_TITLE}”, most recent first. Location, device and capture-time metadata are removed and the images are downscaled. A photo flagged for possible blood or foreign material also leads the flags on sheet 1.`,
          },
        ]
      : []),
    ...(hasNoticed(snap)
      ? [
          {
            term: 'Noticed',
            text: `A once-a-day check the owner answers from a fixed list of plain-language words. The unit is a day she answered, not an episode. “Marked nothing unusual” is her claim about a day, not an examination and not an all-clear. These observations are counted nowhere else on this record: no symptom count, chart or flag reads them. Every answer is on the sheet headed “${NOTICED_SHEET_TITLE}”.`,
          },
        ]
      : []),
    {
      term: 'Intake',
      text: 'A declined or barely touched meal is recorded as a possible health signal, never as picky. Free-fed food is not directly observed, so the absence of a meal log is not read as a meal not eaten.',
    },
    {
      term: 'Weight',
      text: 'Weights are the owner’s weigh-ins, at home or at the vet where marked, read as a trend and never as a diagnosis. Body condition is not assessed. A weight flag compares the latest reading with the highest in the year before it, which may come from a different scale.',
    },
    {
      term: 'Associations',
      text: 'A timing relationship is reported as co-occurrence with its counts, for the clinician to weigh. Nothing on this record asserts that a food caused a symptom.',
    },
    {
      // Last, as v1 ends its legend: what the record is computed over.
      term: 'Deleted entries',
      text: `Entries the owner deleted are excluded. Every symptom count traces line by line to the event log, and the off-diet exposures to the exposures table on the sheet headed “${DIET_SHEET_TITLE}”; medication, diet, weight and normal-stool figures summarise the owner’s logs for those items rather than itemising each one. Nothing is counted that the owner did not log.`,
    },
  ]
  return entries
}

/** The sentences of the kept block, one per entry sentence: what the extraction test asserts. */
export function keptSentencesOf(entries: readonly KeptEntry[]): string[] {
  return entries.flatMap((e) => [e.term, ...e.text.split(/(?<=[.;])\s+(?=[A-Z“])/)]).map((x) => x.trim()).filter((x) => x !== '')
}

// ── The sheets ───────────────────────────────────────────────────────────────

/**
 * Sheets 2 to N in print order, numbered from 2. The record and intake sheets lead (GAP-35 decides
 * which first); the event log, medication and diet sheets always print, as v1's appendices A to D
 * always do; Noticed prints only when the owner answered; "How this record was kept" is always last.
 */
export function backSheetsOf(snap: ReportSnapshot): BackSheetV2[] {
  const hasIntake = mealsAppendixVisible(snap)
  const intakeFirst = hasIntake && intakeFlagFired(snap)
  const lead: BackSheetKind[] = hasIntake ? (intakeFirst ? ['intake', 'record'] : ['record', 'intake']) : ['record']
  const order: BackSheetKind[] = [...lead, 'log', 'medication', 'diet', ...(hasNoticed(snap) ? (['noticed'] as const) : []), 'kept']
  return order.map((kind, i) => {
    const n = i + 2
    const sheet = (title: string, blocks: BackBlockV2[]): BackSheetV2 => ({ n, id: `sheet-${n}`, kind, title, blocks })
    switch (kind) {
      case 'intake':
        return sheet(INTAKE_SHEET_TITLE, [intakeBlock(snap)])
      case 'record': {
        const blocks: BackBlockV2[] = [photoBlock(snap), ledgerBlock(snap, hasIntake)]
        const noticed = noticedLineBlock(snap)
        if (noticed) blocks.push(noticed)
        const ep = episodesBlock(snap)
        if (ep) blocks.push(ep)
        return sheet(RECORD_SHEET_TITLE, blocks)
      }
      case 'log':
        return sheet(LOG_SHEET_TITLE, [eventLogBlock(snap)])
      case 'medication':
        return sheet(MEDICATION_SHEET_TITLE, medicationBlocks(snap))
      case 'diet':
        return sheet(DIET_SHEET_TITLE, dietBlocks(snap))
      case 'noticed':
        return sheet(NOTICED_SHEET_TITLE, noticedBlocks(snap))
      case 'kept':
        return sheet(KEPT_SHEET_TITLE, [{ kind: 'kept', id: 'kept', heading: KEPT_SHEET_TITLE, entries: keptEntries(snap) }])
    }
  })
}
