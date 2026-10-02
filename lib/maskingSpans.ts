// The masking spans (Engines v3, CUL-1440; docs/nyx-care-state-requirements.md §5.1 and the
// 2026-09-29 ruling on CUL-1420).
//
// ONE TABLE, ONE SPAN RULE, TWO CALLERS. EN-10's context lines (`generate-signal/careContext.ts`)
// withhold a zero while a drug that can hide the sign is on board, inside its tail, or within
// 42 days of a visit. The Signal screen and Get ready draw charts and sentences beside those
// lines, and every one of them must follow the same rule (CUL-1440). Two copies of the drug
// table would drift, and a drift here is a zero printed beside a steroid, so the table and the
// span rule live here, imported by the server (Deno, `.ts` extension) and by the app.
//
// PURE. No I/O and no clock: the caller hands in today's day index. The visit arrives as a DATE
// the caller read (`guards/visitReaders.test.ts`: this file reads no vet table, and never may).
// No owner copy lives here (C-26: three Edge Functions' closures may reach a lib module, and
// copy belongs to the surface that prints it).
//
// THE SPAN. A masking course's span runs from its start to its end plus MASK_TAIL_DAYS (or to
// today plus the tail while it runs). A visit's runs from the visit day to VISIT_NO_ZERO_DAYS
// after it: an injection given in the room never enters `medications`, so the visit is taken as
// an unrecorded masking drug, on every sign, until CUL-1446 lets the owner say what was given.
// A window that TOUCHES a span never shows a zero; a window that touches none is unchanged.

import { localDayIndexOf } from './utils.ts'

/** The signs a course may be drawn beside or may mask. The Signal's symptom union. */
export type MaskSign = 'vomit' | 'diarrhea' | 'itch' | 'scratch' | 'skin_reaction' | 'cough' | 'sneeze'

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

const ALL_SIGNS: readonly MaskSign[] = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'cough', 'sneeze']
const VOMIT_DIARRHEA: readonly MaskSign[] = ['vomit', 'diarrhea']

/** What each class can do to a sign: hide it (`masks`) or bring it on (`causes`). */
export const DRUG_CLASS_EFFECTS: Record<DrugClass, { masks: readonly MaskSign[]; causes: readonly MaskSign[] }> = {
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
  // "Depo" alone is how owners write a depot injection (Depo-Medrol, Depo-Provera); both are
  // hormonal and treated as masking, the conservative side.
  depo: ['systemic_corticosteroid'],
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
  pectalin: ['antidiarrheal'],
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

// Words that say how a drug is given, how much or how often, or which salt it is, never what
// it is. Stripped before a name is judged, so "Prednisolone 5mg tablets" resolves as
// prednisolone and "Buddy's pills" as nothing.
const FORM_WORDS = new Set([
  'mg', 'mcg', 'ml', 'g', 'kg', 'iu', 'u', 'units', 'tab', 'tabs', 'tablet', 'tablets', 'pill', 'pills', 'capsule',
  'capsules', 'cap', 'caps', 'chew', 'chews', 'chewable', 'chewables', 'liquid', 'suspension', 'solution', 'syrup',
  'oral', 'inj', 'injection', 'injectable', 'shot', 'cream', 'ointment', 'drops', 'drop', 'gel', 'spray', 'inhaler',
  'daily', 'bid', 'sid', 'tid', 'eod', 'q', 'h', 'hr', 'hrs', 'x', 'per', 'day', 'days', 'once', 'twice', 'a', 'an',
  'the', 'of', 'for', 's', 'dose', 'doses', 'half', 'quarter', 'generic', 'compounded', 'flavored', 'flavoured',
  'er', 'sr', 'xr', 'maleate', 'sodium', 'hydrochloride', 'hcl', 'acetate', 'phosphate', 'succinate', 'tartrate',
  'citrate', 'besylate', 'sulfate', 'hyclate', 'monohydrate', 'my', 'his', 'her', 'dog', 'cat', 'pet', 'med', 'meds',
  'medicine', 'medication',
  // Brand suffixes and release forms (adversarial final pass, PR-22): without these, "Pepcid AC"
  // or a cat's lifelong "Methimazole transdermal" failed toward disclosure and masked every sign.
  'transdermal', 'powder', 'slurry', 'delayed', 'release', 'delayed-release', 'extended', 'extended-release',
  'odt', 'hfa', 'otc', 'ac', 'sp', 'dc', 'a-d', 'forte', 'pro',
])

/** A word's classes, and whether any part of it is unknown. The whole word is looked up
 *  first ("depo-medrol", "temaril-p"); otherwise a hyphenated word is a COMBINATION and every
 *  part must be known or a form word ("Cerenia-injectable" resolves; "Metronidazole-Prednisolone"
 *  resolves to both; "Metro-Pred" has an unknown part). Adversarial review, PR-22: taking the
 *  first part alone read a compounded steroid as metronidazole only. */
function readWord(w: string): { classes: DrugClass[]; unknown: boolean } {
  const direct = DRUG_NAME_CLASSES[w]
  if (direct) return { classes: [...direct], unknown: false }
  const parts = w.split('-').filter((x) => x && !FORM_WORDS.has(x))
  if (parts.length <= 1 && !w.includes('-')) return { classes: [], unknown: true }
  const classes: DrugClass[] = []
  let unknown = false
  for (const part of parts) {
    const c = DRUG_NAME_CLASSES[part]
    if (c) classes.push(...c)
    else unknown = true
  }
  return { classes, unknown }
}

// A name that joins two things ("+", "/", "&", a hyphenated word) is a combination: it is never
// set aside as a nickname, because an unknown member may mask.
const COMBINATION = /[+/&]|[a-z]-[a-z]/i

/**
 * The classes a course's names resolve to, or null for DISCLOSURE (shown beside every concern,
 * masking every sign). Matched on whole words, never substrings ("Predator" is not a steroid).
 *
 * A name resolves only when EVERY word in it that is not a form or dose word is in the table.
 * A name that half-resolves ("Carprofen + mirtazapine", "Rimadyl (Depo shot at clinic)") is a
 * combination with an unknown member, which may mask the sign, so the whole course fails
 * toward disclosure (adversarial review, PR-22: one known NSAID used to hide an antiemetic).
 * A name with no known word at all (an owner's nickname) is set aside if another name — the
 * library item's generic or brand — resolves in full; if none does, null.
 */
export function resolveDrugClasses(names: readonly string[]): DrugClass[] | null {
  const found = new Set<DrugClass>()
  let anyFull = false
  for (const name of names) {
    const words = (name ?? '').toLowerCase().split(/[^a-z-]+/).filter((w) => w && !FORM_WORDS.has(w))
    if (words.length === 0) continue
    const read = words.map(readWord)
    const known = read.filter((r) => r.classes.length > 0)
    if (known.length === 0) {
      // A nickname ("Buddy's pills") is set aside; an unreadable combination is not.
      if (COMBINATION.test(name)) return null
      continue
    }
    if (read.some((r) => r.unknown)) return null
    anyFull = true
    for (const r of known) for (const cls of r.classes) found.add(cls)
  }
  return anyFull ? [...found].sort() : null
}

/** How a course relates to one sign: it can hide it, bring it on, or neither. */
export function courseEffectOn(classes: DrugClass[] | null, sign: MaskSign): { shown: boolean; masks: boolean } {
  if (classes === null) return { shown: true, masks: true } // unresolved: like a systemic steroid
  const masks = classes.some((c) => DRUG_CLASS_EFFECTS[c].masks.includes(sign))
  const causes = classes.some((c) => DRUG_CLASS_EFFECTS[c].causes.includes(sign))
  return { shown: masks || causes, masks }
}

// ── The rules' constants ──────────────────────────────────────────────────────

// ⚠ Both windows are 42 days, not the spec's 14, until CUL-583 rules per drug: a depot
// steroid (Depo-Medrol) acts for 3 to 6 weeks, longer in cats, and lokivetmab (Cytopoint) for
// 4 to 8 (adversarial review, PR-22). Raised on CUL-1420 as a better-than-the-rule brief.
/** A masking course withholds zeros from its start until this many days after its end. */
export const MASK_TAIL_DAYS = 42
/** A visit is treated as an unrecorded masking drug given that day (an injection never enters
 *  `medications`): every window overlapping [visit, visit + this] withholds its zero, and the
 *  visit line carries the disclosure while it is this recent. */
export const VISIT_NO_ZERO_DAYS = 42

// ── The courses and the spans ─────────────────────────────────────────────────

/** A medication course, reduced to what the spans need. The server's `CourseFact` is this. */
export interface MaskCourse {
  /** The owner's own name for it (`medications.drug_name`). */
  drugLabel: string
  /** Every name the table may match: the drug name, the library item's generic and brand. */
  names: readonly string[]
  /** DATE. Null means the start is unknown, and a course with no start masks nothing. */
  startedOn: string | null
  /** DATE, inclusive; null while ongoing. */
  endedOn: string | null
  /** `medications.status`; absent in rows that did not select it. */
  status?: string | null
}

/** One course, placed on the owner's calendar against today. */
export interface AssessedCourse {
  course: MaskCourse
  /** First day, as an epoch-day index on the owner's clock, or null when unknown. */
  start: number | null
  /** Last day, or null while ongoing. A course marked ended with no end date is taken to
   *  have ended today: its end is unknown, so it may have been yesterday. */
  end: number | null
  /** Whether the end above is a recorded date (false: the "ended today" stand-in). */
  endKnown: boolean
  onBoard: boolean
  /** Ended, and within MASK_TAIL_DAYS of its end. */
  inTail: boolean
  /** The table's reading of its names; null fails toward disclosure. */
  classes: DrugClass[] | null
}

/** Where a course sits relative to today. The server's lines and the client's spans read
 *  this one placement, so "on board" and "in its tail" can never mean two things. */
export function assessCourse(c: MaskCourse, todayIndex: number, timeZone: string | undefined): AssessedCourse {
  const start = c.startedOn ? localDayIndexOf(c.startedOn, timeZone) : null
  const ended = c.status === 'completed' || c.status === 'stopped'
  const endIdx = c.endedOn ? localDayIndexOf(c.endedOn, timeZone) : null
  const end = endIdx !== null ? endIdx : ended ? todayIndex : null
  const started = start !== null && start <= todayIndex
  const onBoard = started && (end === null || (end >= todayIndex && !(ended && endIdx === null)))
  const inTail = started && !onBoard && end !== null && todayIndex - end <= MASK_TAIL_DAYS
  return {
    course: c,
    start,
    end,
    endKnown: endIdx !== null,
    onBoard,
    inTail,
    classes: resolveDrugClasses([c.drugLabel, ...c.names]),
  }
}

/** Where a zero may not appear for one sign, and why. Days are epoch-day indexes, inclusive. */
export type MaskSpan =
  | {
      kind: 'course'
      fromDay: number
      toDay: number
      course: AssessedCourse
      /** The table could not resolve the name (it masks like a steroid, and says "may"). */
      unresolved: boolean
    }
  | { kind: 'visit'; fromDay: number; toDay: number; visitOn: string }

export interface MaskingInput {
  courses: readonly MaskCourse[]
  /** The most recent visit strictly before today (a DATE), or null. */
  lastVisitOn: string | null
  todayIndex: number
  timeZone: string | undefined
}

/**
 * Every span inside which a zero of `sign` may not be shown: each course that can mask it,
 * from its start to its end (today while it runs) plus MASK_TAIL_DAYS, and the last visit,
 * from its day to VISIT_NO_ZERO_DAYS after. A course that has not started yet masks nothing.
 * Courses first, in start order, then the visit: the order a caption names them in.
 */
export function maskingSpansFor(sign: MaskSign, input: MaskingInput): MaskSpan[] {
  const today = input.todayIndex
  const spans: MaskSpan[] = []
  const assessed = input.courses
    .map((c) => assessCourse(c, today, input.timeZone))
    .filter((x) => x.start !== null && x.start <= today && courseEffectOn(x.classes, sign).masks)
    .sort((a, b) => (a.start as number) - (b.start as number) || a.course.drugLabel.localeCompare(b.course.drugLabel))
  for (const x of assessed) {
    spans.push({
      kind: 'course',
      fromDay: x.start as number,
      toDay: (x.onBoard || x.end === null ? today : x.end) + MASK_TAIL_DAYS,
      course: x,
      unresolved: x.classes === null,
    })
  }
  const v = input.lastVisitOn ? localDayIndexOf(input.lastVisitOn, input.timeZone) : null
  if (input.lastVisitOn && v !== null && v < today) {
    spans.push({ kind: 'visit', fromDay: v, toDay: v + VISIT_NO_ZERO_DAYS, visitOn: input.lastVisitOn })
  }
  return spans
}

/** Whether the window [fromDay, toDay] (inclusive) touches any span. */
export function windowTouchesSpan(spans: readonly MaskSpan[], fromDay: number, toDay: number): boolean {
  return spans.some((s) => s.fromDay <= toDay && s.toDay >= fromDay)
}

/** The spans the window [fromDay, toDay] touches, in the spans' own order. */
export function spansTouching(spans: readonly MaskSpan[], fromDay: number, toDay: number): MaskSpan[] {
  return spans.filter((s) => s.fromDay <= toDay && s.toDay >= fromDay)
}
