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
//   • a drug that can MASK this sign is on board (or a drug the table cannot resolve, which
//     fails toward disclosure like a systemic steroid). Every line on the screen, not only
//     the course's own. ⚠ Stricter than the spec's text, on purpose: §5.1 scopes the rule to
//     the drug's too-soon window (14 days until CUL-583 rules per drug); this holds it for as
//     long as the course is on board, because a steroid still masks on day 40. Raised as a
//     better-than-the-rule brief on CUL-1420; loosening it is one constant (ZERO_WITHHELD_*).
//   • the line is the visit line and the visit was 14 days ago or fewer, because an injection
//     given at the visit (Depo-Medrol, maropitant) never enters `medications`.
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
import type { CareContextLine, Finding, SymptomEvent, SymptomType } from './detection.ts'

const MS_PER_DAY = 86_400_000

// ── The inputs ────────────────────────────────────────────────────────────────

/** The two facts the shell reads for EN-10 alone, only while the key is on. */
export interface CareContextFacts {
  /** `vet_visits.visited_at` (a DATE) of the most recent non-deleted visit on or before
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
export interface CourseFact {
  /** The owner's own name for it (`medications.drug_name`, NOT NULL). What the line prints. */
  drugLabel: string
  /** Every name the table may match: the drug name, the library item's generic and brand. */
  names: readonly string[]
  /** DATE. Null means the start is unknown, and a course with no start gets no line. */
  startedOn: string | null
  /** DATE, inclusive; null while ongoing. */
  endedOn: string | null
  /** `medications.status`; absent in rows that did not select it. */
  status?: string | null
}

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

// ── The drug table (a stub for CUL-583) ───────────────────────────────────────

export type DrugClass =
  | 'systemic_corticosteroid'
  | 'inhaled_corticosteroid'
  | 'antiemetic_gi_protectant'
  | 'antidiarrheal'
  | 'antipruritic'
  | 'antitussive_bronchodilator'
  | 'nsaid'
  | 'gi_upset_other'

const ALL_SIGNS: readonly SymptomType[] = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'cough', 'sneeze']
const VOMIT_DIARRHEA: readonly SymptomType[] = ['vomit', 'diarrhea']

/** What each class can do to a sign: hide it (`masks`) or bring it on (`causes`). */
export const DRUG_CLASS_EFFECTS: Record<DrugClass, { masks: readonly SymptomType[]; causes: readonly SymptomType[] }> = {
  systemic_corticosteroid: { masks: ALL_SIGNS, causes: [] },
  inhaled_corticosteroid: { masks: ['cough'], causes: [] },
  antiemetic_gi_protectant: { masks: ['vomit'], causes: [] },
  antidiarrheal: { masks: ['diarrhea'], causes: [] },
  // Cyclosporine both masks itch and causes GI upset (§5.1 lists it in both rows).
  antipruritic: { masks: ['itch', 'scratch'], causes: [] },
  antitussive_bronchodilator: { masks: ['cough'], causes: [] },
  nsaid: { masks: [], causes: VOMIT_DIARRHEA },
  gi_upset_other: { masks: [], causes: VOMIT_DIARRHEA },
}

// Lowercased name tokens → classes. A name may carry more than one class (cyclosporine).
// Generic names and the common veterinary brands; §5.1's rows, nothing added beyond them.
export const DRUG_NAME_CLASSES: Record<string, readonly DrugClass[]> = {
  // Systemic corticosteroids — every concern.
  prednisone: ['systemic_corticosteroid'],
  prednisolone: ['systemic_corticosteroid'],
  pred: ['systemic_corticosteroid'],
  dexamethasone: ['systemic_corticosteroid'],
  methylprednisolone: ['systemic_corticosteroid'],
  medrol: ['systemic_corticosteroid'],
  'depo-medrol': ['systemic_corticosteroid'],
  triamcinolone: ['systemic_corticosteroid'],
  budesonide: ['systemic_corticosteroid'],
  'temaril-p': ['systemic_corticosteroid'],
  // Inhaled corticosteroids — cough.
  fluticasone: ['inhaled_corticosteroid'],
  flovent: ['inhaled_corticosteroid'],
  // Antiemetics and GI protectants — vomiting.
  maropitant: ['antiemetic_gi_protectant'],
  cerenia: ['antiemetic_gi_protectant'],
  ondansetron: ['antiemetic_gi_protectant'],
  zofran: ['antiemetic_gi_protectant'],
  metoclopramide: ['antiemetic_gi_protectant'],
  reglan: ['antiemetic_gi_protectant'],
  famotidine: ['antiemetic_gi_protectant'],
  pepcid: ['antiemetic_gi_protectant'],
  omeprazole: ['antiemetic_gi_protectant'],
  prilosec: ['antiemetic_gi_protectant'],
  pantoprazole: ['antiemetic_gi_protectant'],
  sucralfate: ['antiemetic_gi_protectant'],
  carafate: ['antiemetic_gi_protectant'],
  // Antidiarrheals, metronidazole, tylosin, probiotics — diarrhea.
  metronidazole: ['antidiarrheal'],
  flagyl: ['antidiarrheal'],
  tylosin: ['antidiarrheal'],
  tylan: ['antidiarrheal'],
  probiotic: ['antidiarrheal'],
  probiotics: ['antidiarrheal'],
  fortiflora: ['antidiarrheal'],
  proviable: ['antidiarrheal'],
  loperamide: ['antidiarrheal'],
  imodium: ['antidiarrheal'],
  'pro-pectalin': ['antidiarrheal'],
  // Antipruritics — itch and scratch.
  oclacitinib: ['antipruritic'],
  apoquel: ['antipruritic'],
  lokivetmab: ['antipruritic'],
  cytopoint: ['antipruritic'],
  cyclosporine: ['antipruritic', 'gi_upset_other'],
  ciclosporin: ['antipruritic', 'gi_upset_other'],
  atopica: ['antipruritic', 'gi_upset_other'],
  // Antitussives and bronchodilators — cough.
  hydrocodone: ['antitussive_bronchodilator'],
  hycodan: ['antitussive_bronchodilator'],
  butorphanol: ['antitussive_bronchodilator'],
  torbugesic: ['antitussive_bronchodilator'],
  dextromethorphan: ['antitussive_bronchodilator'],
  theophylline: ['antitussive_bronchodilator'],
  aminophylline: ['antitussive_bronchodilator'],
  terbutaline: ['antitussive_bronchodilator'],
  albuterol: ['antitussive_bronchodilator'],
  // NSAIDs — can cause vomiting and diarrhea.
  carprofen: ['nsaid'],
  rimadyl: ['nsaid'],
  meloxicam: ['nsaid'],
  metacam: ['nsaid'],
  robenacoxib: ['nsaid'],
  onsior: ['nsaid'],
  grapiprant: ['nsaid'],
  galliprant: ['nsaid'],
  firocoxib: ['nsaid'],
  previcox: ['nsaid'],
  deracoxib: ['nsaid'],
  deramaxx: ['nsaid'],
  // Doxycycline, methimazole, chemotherapy — can cause vomiting and diarrhea.
  doxycycline: ['gi_upset_other'],
  methimazole: ['gi_upset_other'],
  felimazole: ['gi_upset_other'],
  chlorambucil: ['gi_upset_other'],
  leukeran: ['gi_upset_other'],
  lomustine: ['gi_upset_other'],
  ccnu: ['gi_upset_other'],
  vincristine: ['gi_upset_other'],
  cyclophosphamide: ['gi_upset_other'],
  doxorubicin: ['gi_upset_other'],
  carboplatin: ['gi_upset_other'],
  toceranib: ['gi_upset_other'],
  palladia: ['gi_upset_other'],
}

/**
 * The classes a course's names resolve to, or null when none resolves. Matched on whole
 * words of each name ("Prednisolone 5mg" → prednisolone), never on substrings, so "Predator"
 * resolves nothing rather than a steroid. Null is the disclosure path, never "harmless".
 */
export function resolveDrugClasses(names: readonly string[]): DrugClass[] | null {
  const found = new Set<DrugClass>()
  for (const name of names) {
    const words = (name ?? '').toLowerCase().split(/[^a-z-]+/).filter(Boolean)
    for (const w of words) {
      for (const cls of DRUG_NAME_CLASSES[w] ?? []) found.add(cls)
      // A hyphenated brand's first word is tried alone too ("Cerenia-injectable").
      const head = w.split('-')[0]
      if (head !== w) for (const cls of DRUG_NAME_CLASSES[head] ?? []) found.add(cls)
    }
  }
  return found.size > 0 ? [...found].sort() : null
}

/** How a course relates to one sign: it can hide it, bring it on, or neither. */
export function courseEffectOn(classes: DrugClass[] | null, sign: SymptomType): { shown: boolean; masks: boolean } {
  if (classes === null) return { shown: true, masks: true } // unresolved: like a systemic steroid
  const masks = classes.some((c) => DRUG_CLASS_EFFECTS[c].masks.includes(sign))
  const causes = classes.some((c) => DRUG_CLASS_EFFECTS[c].causes.includes(sign))
  return { shown: masks || causes, masks }
}

// ── The rules' constants ──────────────────────────────────────────────────────

/** A visit this recent (in days) never shows a zero, and carries the injection disclosure. */
export const VISIT_NO_ZERO_DAYS = 14
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

  // Courses on board today, with what each can do to this sign.
  const courses = args.courses
    .map((c) => {
      const start = c.startedOn ? localDayIndexOf(c.startedOn, tz) : null
      const end = c.endedOn ? localDayIndexOf(c.endedOn, tz) : null
      const ended = c.status === 'completed' || c.status === 'stopped'
      const onBoard = start !== null && start <= today && (end === null ? !ended : end >= today)
      return { c, start, onBoard, effect: courseEffectOn(resolveDrugClasses([c.drugLabel, ...c.names]), sign) }
    })
    .filter((x) => x.onBoard && x.effect.shown)
    .sort((a, b) => (a.start as number) - (b.start as number) || a.c.drugLabel.localeCompare(b.c.drugLabel))
  const maskOnBoard = courses.some((x) => x.effect.masks)

  // A zero is withheld (§5.1, the header): beside a masking drug, on a thinly logged window,
  // and on the visit line while the visit is recent.
  const zeroWithheld = (c: Counted, length: number, recentVisit: boolean): boolean =>
    c.count === 0 && (maskOnBoard || recentVisit || (c.logged as number) < ZERO_COVERAGE_FLOOR * length)

  const lines: CareContextLine[] = []

  // 1. Courses, above the trial, so the diet is never the first explanation a reader meets.
  for (const { c, start } of courses) {
    const s = start as number
    const on = formatDay(s, today)
    const n = today - s
    const anchorOn = c.startedOn as string
    if (n < 1) {
      lines.push({ kind: 'course', anchorOn, days: 0, count: null, loggedDays: null, drugLabel: c.drugLabel, text: `${c.drugLabel} since ${on}.` })
      continue
    }
    // Counted from the day after the start: the start day's episodes may predate the first dose.
    const got = count({ fromDay: s + 1, length: n })
    if (got.count === null) {
      lines.push({ kind: 'course', anchorOn, days: n, count: null, loggedDays: null, drugLabel: c.drugLabel, text: `${c.drugLabel} since ${on}, ${days(n)}.` })
    } else if (zeroWithheld(got, n, false)) {
      lines.push({
        kind: 'course', anchorOn, days: n, count: null, loggedDays: got.logged, drugLabel: c.drugLabel,
        text: `${c.drugLabel} since ${on}, ${days(n)}. Started ${days(n)} ago.`,
      })
    } else {
      lines.push({
        kind: 'course', anchorOn, days: n, count: got.count, loggedDays: got.logged, drugLabel: c.drugLabel,
        text: `${c.drugLabel} since ${on}, ${days(n)}: ${episodes(got.count)}, with something logged on ${got.logged} of ${n}.`,
      })
    }
  }

  // 2. The trial, only on a sign its indication covers.
  const trial = args.trial
  if (trial && trialCovers(trial.indication, sign)) {
    const s = localDayIndexOf(trial.startedOn, tz)
    if (s !== null && s <= today) {
      const d = today - s + 1 // "day d": the start day is day 1
      const name = trial.targetProtein && trial.targetProtein.trim() ? `${titleCase(trial.targetProtein)} trial` : 'Diet trial'
      const head = `${name}, day ${d} of ${trial.targetDurationDays}`
      const got = count({ fromDay: s, length: d })
      const base = { kind: 'trial' as const, anchorOn: trial.startedOn, days: d }
      if (got.count === null) {
        lines.push({ ...base, count: null, loggedDays: null, text: `${head}.` })
      } else if (zeroWithheld(got, d, false)) {
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
  const visitOn = args.facts.lastVisitOn
  const v = visitOn ? localDayIndexOf(visitOn, tz) : null
  if (visitOn && v !== null && v < today) {
    const n = today - v
    const recent = n <= VISIT_NO_ZERO_DAYS
    const on = formatDay(v, today)
    // Counted from the day after: the visit day's own episodes may be why they went.
    const got = count({ fromDay: v + 1, length: n })
    const disclosure = recent ? ' Anything given at the visit isn\'t in the record.' : ''
    const base = { kind: 'visit' as const, anchorOn: visitOn, days: n }
    if (got.count === null) {
      lines.push({ ...base, count: null, loggedDays: null, text: `Since the ${on} visit, ${days(n)}.${disclosure}` })
    } else if (zeroWithheld(got, n, recent)) {
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
