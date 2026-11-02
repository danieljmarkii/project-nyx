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
// The rest of the back sheets (event log, medication, trial, Noticed, "How this record was kept")
// are VR2-14's.
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
  fmtDay,
  fmtLocalDay,
  fmtLocalTime,
  h,
  hasIncidentPhotos,
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

export interface BackSheetV2 {
  /** 2, 3, …: computed, never typed (WBC-11). */
  n: number
  id: string
  kind: 'record' | 'intake'
  title: string
  blocks: BackBlockV2[]
}

// ── Pointers (CUL-2350) ──────────────────────────────────────────────────────

/** v1's detail sections with the appendices v2 does not print yet left out (rule 2 above). */
export const V2_SECTION_POINTERS: SectionPointers = { eventLog: null, freeFedAndTreats: null }

/** The intake sheet's name, as every pointer to it prints it. */
export const INTAKE_SHEET_TITLE = 'Intake per feeding'
export const RECORD_SHEET_TITLE = 'The record by day'
export const EPISODES_HEADING = 'What each episode looked like'
export const NO_PHOTOS_LINE = 'No incident photos in this window.'

/**
 * Where sheet 1's reused v1 flag rows point (CUL-2350): every pointer lands on a sheet this document
 * prints, by the title that sheet prints in its running head and heading. v1's "appendix A lists
 * this window's entries" becomes the ledger, which dates every entry in the window by day (the
 * event log itself is VR2-14's).
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
  // v1 only points at appendix E where it prints it, by the same predicate the intake sheet uses,
  // so a missing intake sheet is never pointed at; the fallback only keeps the type total.
  const meals = titled(intake ? INTAKE_SHEET_TITLE : RECORD_SHEET_TITLE)
  return {
    mealsIn: meals,
    mealsDetailIn: meals,
    logLists: `the day ledger ${titled(RECORD_SHEET_TITLE)} dates`,
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
  const leadDays = fill ? byType.get(fill) ?? new Map<string, number>() : new Map<string, number>()

  const cells: LedgerCell[] = days.map((day) => {
    const count = leadDays.get(day) ?? 0
    return { day, count, state: count > 0 ? 'sign' : logged.has(day) ? 'logged' : 'none' }
  })
  const rows: LedgerRow[] = []
  for (let i = 0; i < cells.length; i += 7) {
    const slice = cells.slice(i, i + 7)
    while (slice.length < 7) slice.push({ day: addDays(slice[slice.length - 1].day, 1), state: 'outside', count: 0 })
    rows.push({ label: dayLabel(slice[0].day), cells: slice })
  }

  const label = fill ? symptomLabel(fill) : null
  const lower = label ? label.toLowerCase() : null
  const drawsSign = cells.some((c) => c.state === 'sign')
  const drawsLogged = cells.some((c) => c.state === 'logged')
  const hatched = cells.filter((c) => c.state === 'none').map((c) => c.day)
  // The caption names only the marks this grid draws (AC 4, the chart standard's twin rule).
  const legend = [
    ...(drawsSign && lower ? [`Filled: ${lower} that day, with its count.`] : []),
    // "Plain" is a day something else was logged, never a day the sign was seen not to happen
    // (cold read: a plain square read as a normal-stool day on a record of 12 stools in 30 days).
    ...(drawsLogged
      ? [lower && drawsSign ? `Plain: something else was logged that day, but no ${lower}; not a sign it did not happen.` : 'Plain: something was logged that day.']
      : []),
    ...(hatched.length > 0 ? ['Hatched: nothing logged.'] : []),
  ]
  // When intake leads, the grid draws the busiest sign, and says outright that refusals are not on it.
  const notDrawn = lead?.sign === 'intake' && intakeSheet ? [`Meals not finished are not drawn on this grid.`] : []
  const caption = `Every day of the ${days.length}, as logged. One square is one day. ${[...legend, ...notDrawn].join(' ')}`.trim()

  const dayWithCount = (day: string, n: number): string => (n > 1 ? `${dayLabel(day)} ×${n}` : dayLabel(day))
  const lines: string[] = []
  if (fill && lower) {
    const ds = [...leadDays.entries()].filter(([d]) => d >= snap.scope.startDate && d <= snap.scope.endDate).sort((a, b) => a[0].localeCompare(b[0]))
    if (ds.length > 0) {
      lines.push(`${label} on ${ds.length} of ${days.length} days: ${ds.map(([d, n]) => dayWithCount(d, n)).join(', ')}.`)
    }
  }
  // Every other sign, dated, so the ledger dates every entry in the window (the chronicity
  // pointer's claim, CUL-2350) and a second or third sign is never only a count (Dr. Chen,
  // 2026-10-31: three signs on overlapping days).
  const others = REPORT_SYMPTOM_TYPES.filter((t) => t !== fill && byType.has(t)).map((t) => {
    const ds = [...(byType.get(t) as Map<string, number>).entries()]
      .filter(([d]) => d >= snap.scope.startDate && d <= snap.scope.endDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
    return { t, ds }
  }).filter((o) => o.ds.length > 0)
  if (others.length > 0) {
    lines.push(
      `${fill ? 'Also on these days' : 'Entries by day'}: ${others
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
  const caveat =
    snap.diet.freeFed.length > 0
      ? ' Free-fed food was also down in this window and its intake is not directly observed, so this is the last rated meal, not the last time food was eaten.'
      : ''
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

// ── The sheets ───────────────────────────────────────────────────────────────

/** Sheets 2 to N in print order, numbered from 2. */
export function backSheetsOf(snap: ReportSnapshot): BackSheetV2[] {
  const hasIntake = mealsAppendixVisible(snap)
  const intakeFirst = hasIntake && intakeFlagFired(snap)
  const order: Array<'record' | 'intake'> = hasIntake ? (intakeFirst ? ['intake', 'record'] : ['record', 'intake']) : ['record']
  const numberOf = (k: 'record' | 'intake'): number | null => {
    const i = order.indexOf(k)
    return i < 0 ? null : i + 2
  }
  return order.map((kind) => {
    const n = numberOf(kind) as number
    if (kind === 'intake') return { n, id: `sheet-${n}`, kind, title: INTAKE_SHEET_TITLE, blocks: [intakeBlock(snap)] }
    const blocks: BackBlockV2[] = [photoBlock(snap), ledgerBlock(snap, hasIntake)]
    const ep = episodesBlock(snap)
    if (ep) blocks.push(ep)
    return { n, id: `sheet-${n}`, kind, title: RECORD_SHEET_TITLE, blocks }
  })
}
