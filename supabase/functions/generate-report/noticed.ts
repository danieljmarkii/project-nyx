// The vet report's Noticed block — the page-1 line, the graph and the appendix.
//
// CUL-875 (Noticed N-6) · docs/nyx-daily-look-requirements.md §8, §9, §10.5, T-19.
//
// ── WHAT THIS IS ─────────────────────────────────────────────────────────────
// Pure assembly, like `trial.ts`: look rows + the window → a structured block the
// render layer turns into HTML and nothing else. No I/O, no clock, no Date.now().
//
// ── THE TWO RULES THAT SHAPE EVERY NUMBER HERE ───────────────────────────────
//  1. **The unit is the DAY and the verb is ANSWERED** (R9 / R11). Ten taps in a day
//     are one answered day; the denominator names the owner's ACT, never her pet's
//     state. Every count below is a count of `local_day` keys.
//  2. **The counters are SHARED, not mirrored** (CUL-875 D2). `answeredDays`,
//     `wordDays`, `absenceDays` and `answeredVomitDays` are imported from
//     `lib/lookDayCounts.ts` — the same function objects Home's footer, the receipts
//     and Patterns call. The issue asked for a server-side mirror with a parity test;
//     that is the diet-trial §5.3 defect written down in advance (two surfaces
//     re-deriving one count from the same rows and disagreeing by a denominator), and
//     the only thing standing in the way of sharing was one extensionless type import
//     in that file, now moved. A parity test proves two implementations agree at the
//     moment it runs; one implementation cannot disagree with itself.
//
// ── WHAT A LOOK NEVER DOES, RESTATED WHERE IT COULD BE BROKEN (§10.5) ────────
// A look joins no lane. It is not in `REPORT_SYMPTOM_TYPES` (its walk row carries the
// explicit NO) and not in `CORRELATION_SYMPTOM_TYPES`, so it enters no frequency
// count, no denominator of any other section, no detector and no safety flag. This
// module reads look rows and produces a block that sits BESIDE the record. If you ever
// find yourself passing something from here into a symptom aggregate, that is the
// rule breaking, not a feature.
//
// ── THE SOFT-DELETE JOIN IS THE CALLER'S ─────────────────────────────────────
// After an Undo the `looks` row and its note survive at rest with no schema-side
// signal, and the service role sees them. `index.ts` joins `events` and drops
// `deleted_at IS NOT NULL` (the `mapWeightRows` precedent) BEFORE anything reaches
// this module, so every count and every appendix line here is over live rows only.
// That join is the only guard; the fixture that pins it (Undo a note-bearing look →
// the appendix renders nothing) is in `report.test.ts`.

import {
  absenceDaySet,
  answeredDaySet,
  answeredDays as answeredDaysOf,
  answeredVomitDays,
  wordDays,
  type LookDayRow,
  type LookOutcome,
} from '../../../lib/lookDayCounts.ts'
import {
  LOOK_OPENING_CHIP_KEY,
  lookSpeciesOf,
  lookWord,
  notHerselfLabel,
  type LookSpecies,
  type LookWordKind,
} from '../../../constants/lookWords.ts'

const MS_PER_DAY = 86_400_000

/**
 * Q-13's floor, on the report: below FOURTEEN answered days in the window the report
 * prints the line and the strip and NO BARS, ever.
 *
 * The reason is the one the third adversarial pass gave: four answered days and two
 * *Off* draws a bar at half the track on a clinical document, from a self-selected
 * sample of four. The line and the strip both carry their denominator in the reader's
 * eye (a ratio, a row of dated cells); a bar carries only a LENGTH, and length is the
 * one encoding a 60-second reader takes at face value.
 */
export const NOTICED_BARS_MIN_ANSWERED_DAYS = 14

/** The strip's span: four weeks back from the window end, clipped to the window start. */
export const NOTICED_STRIP_DAYS = 28

// ── Input ────────────────────────────────────────────────────────────────────

/**
 * One live look row, as the I/O shell projects it.
 *
 * Structurally a `LookDayRow` plus the two fields only the appendix needs, so it can be
 * handed to the shared counters unchanged. `localDay` is the STORED key
 * (`looks.local_day`), never re-derived from `occurredAt` — T-19 exists because the
 * device and the server bucket days on two different clocks, and re-deriving here would
 * reintroduce exactly the disagreement the column was added to remove.
 */
export interface ReportLookInput extends LookDayRow {
  /** The PARENT event's instant — the appendix's hour. The owner's own "when I looked". */
  occurredAt: string
  /** `looks.notes` — the owner's sentence, printed in the appendix and nowhere else
   *  on this document, and only for the owner's own render (see `ReportAudience`). */
  notes: string | null
}

/**
 * Who this render is for — and therefore whether the owner's own sentences may appear
 * on it. REQUIRED on `ReportInput`, with no default anywhere (C-10: a field that
 * describes a value every call makes gets no runtime fallback).
 *
 * ── WHY IT IS A UNION AND NOT A BOOLEAN (§9 rule 4, CUL-875 D3) ──────────────
 * The rule is that an unauthenticated render never inherits the owner's notes toggle.
 * A boolean pair (`audience`, `includeNotes`) can express the violation — you can hand
 * a share mint `includeNotes: true` and the types are happy. This union cannot: the
 * `shared_link` arm has NO notes field to set. So "excluded by construction" is a fact
 * about the type, checked by `tsc`, rather than a branch someone has to remember.
 *
 * B-253's ratified rebuild mints an IMMUTABLE object behind a 30-day link with no
 * revocation (B-143 declined), so a toggle the owner set for a vet she is handing a PDF
 * to cannot be allowed to govern a later mint for a different audience. If notes on a
 * share link are ever wanted, that is a new field on the `shared_link` arm and its own
 * PM decision at PR 6 — not a default one refactor can flip.
 */
export type ReportAudience =
  | {
      kind: 'owner'
      /** The *Include your notes* option, as the owner set it. Default on. */
      includeLookNotes: boolean
    }
  | { kind: 'shared_link' }

/** Does this render print the owner's look notes? The ONE place that question is
 *  answered, so a second reader cannot answer it differently. */
export function lookNotesIncluded(audience: ReportAudience): boolean {
  return audience.kind === 'owner' && audience.includeLookNotes
}

// ── Output ───────────────────────────────────────────────────────────────────

/** A word that appeared, with the days it was marked on. */
export interface NoticedWordCount {
  /** The stored key. Never rendered raw — `label` is what a reader sees. */
  key: string
  /** The owner-facing head word from the closed vocabulary. */
  label: string
  kind: LookWordKind
  /** Days IN THE WINDOW the word was marked on. A word in two looks one day counts
   *  once (T-14) — which is why this is `wordDays`, not a row count. */
  dayCount: number
  /** The earliest local day in the window carrying the word. */
  firstDay: string
  /**
   * The coverage BEFORE the first day — what stops *off on 6* reading as "new".
   *
   * `answeredDays` counts days answered strictly before `firstDay`; `sinceDay` is the
   * earliest of them. NULL `sinceDay` means the ROW PULL's floor may be truncating, so
   * the count is a FLOOR and the render says "at least" and names no start date —
   * printing the pull floor as if it were the record's own beginning is the C-19
   * failure (a record-anchored date is free; one anchored to a query is not).
   *
   * The whole clause is absent when nothing was answered before the first day: "on 0
   * days before it" is not a sentence, and a naked first-date claim with no denominator
   * is T-18's "implies he had been fine until now".
   */
  priorCoverage: { answeredDays: number; sinceDay: string | null } | null
}

/** One cell of the dated strip. */
export interface NoticedStripDay {
  day: string
  /**
   * `absence` ○ — answered, every look that day *nothing unusual*.
   * `observation` ● — answered, at least one word (a MIXED day draws ● — T-14, and the
   *   accusing branch winning is the same precedence `absenceDaySet` applies).
   * `unanswered` — a faint dot, NEVER a blank: a blank is the visual default and reads
   *   as "nothing seen", so a vomit's ▲ would float over a void (the third pass).
   */
  mark: 'absence' | 'observation' | 'unanswered'
  /** A vomit was logged this day — from the RECORD's own rows, never from a look. */
  vomit: boolean
}

export interface NoticedStrip {
  startDate: string
  endDate: string
  days: NoticedStripDay[]
  /** Answered days inside the strip — the denominator of `wordDaysInSpan`. */
  answeredDays: number
  /** Vomit days inside the strip that were NOT answered. The caption's count: a
   *  ▲ over a faint dot is a day nobody reported on, and saying so is what stops the
   *  strip reading as "she was fine on the others". */
  unansweredVomitDays: number
  /**
   * Each drawn word's count INSIDE THIS SPAN (C-3: the scope where the reader meets
   * the claim). Without it a 60-second reader meets *6 of 42* on the bars and three ●
   * here and has no way to know they are one word over two different spans.
   *
   * A word with zero days here is carried in `wordsAbsentInSpan` instead of as a "0":
   * a bare zero beside a word on a clinical page reads as "assessed and absent", and
   * the honest statement is that its days fall earlier.
   */
  wordDaysInSpan: Array<{ key: string; label: string; dayCount: number }>
  wordsAbsentInSpan: Array<{ key: string; label: string }>
}

/** One look, in the appendix. */
export interface NoticedEntry {
  eventId: string
  occurredAt: string
  localDay: string
  outcome: LookOutcome
  /** Vocabulary-known words only. An unknown key is DROPPED, never echoed: the column
   *  is unbounded at rest by the spec's own choice (the client validates, the 032
   *  precedent), and the privacy review stored 20,000 keys and `<script>…` strings in
   *  one row. Nothing this document prints comes from outside the closed list. */
  words: Array<{ key: string; label: string }>
  /** How many keys were dropped as unknown — disclosed rather than silently lost. */
  unknownWords: number
  /** The owner's sentence, or null. Null both when there is none AND whenever this
   *  render is not the owner's own (`lookNotesIncluded`), so the appendix cannot print
   *  one by reaching past the decision. */
  note: string | null
}

/** The appendix's grouping: two looks on one day are two lines under ONE day, never two
 *  rows a vet counts as two episodes ("units are answered days, never episodes" binds
 *  the appendix's shape, not only its counts). */
export interface NoticedDay {
  day: string
  entries: NoticedEntry[]
}

/**
 * What the record says about intake beside the owner's absence claims (§5 honesty rule
 * 12). Three states, and the report never withholds — it says the disagreement.
 */
export type NoticedIntake =
  /** No rated meal at all in the window: the record cannot speak to intake, and the
   *  line says so in its own words rather than leaving *marked nothing unusual on 34*
   *  to stand as if the bowl had been watched (T-20's blind case). */
  | { kind: 'no_record' }
  /** Rated meals exist and no absence day coincides with a meal left. */
  | { kind: 'none' }
  /** Absence days the owner marked *nothing unusual* on that ALSO carry a meal she
   *  recorded as picked at or refused. Dr. Chen §3: the disagreement is said, not
   *  hidden. */
  | { kind: 'disagreement'; days: string[] }

export interface NoticedBlock {
  windowDays: number
  /** Days in the window holding at least one look. THE denominator. */
  answeredDays: number
  /** Days on which EVERY look was *nothing unusual* (T-14). Printed as the owner's
   *  CLAIM (*marked* …), never as an observation the report vouches for. */
  absenceDays: number
  /**
   * Answered days whose ONLY words were activity words — days page 1 lists nowhere,
   * because an activity never appears there.
   *
   * Carried because the reconciliation clause has to be true in BOTH directions. The
   * spec names the over-count (6 + 4 + 2 + 34 = 46 over a denominator of 42, correct
   * under multi-select), and a reader who cannot make the numbers add up assumes an
   * error. The UNDER-count is the same defect in the other direction and is not in the
   * spec: a day on which the owner marked only *Lively* is answered, is not an absence
   * day, and carries no page-1 word — so the visible counts can also fall SHORT of the
   * days answered, and the missing days are exactly the good ones. Saying "some days
   * are missing from this list" while silently omitting the days the pet was well would
   * be the reassuring omission made invisible.
   */
  activityOnlyDays: number
  /** Symptom-class words, most days first. Page 1 and the bars. */
  concernWords: NoticedWordCount[]
  /** Activity words. The appendix's ink only — NEVER page 1, because a rise in a
   *  positive never reassures and a page-1 tally of them invites exactly that read. */
  activityWords: NoticedWordCount[]
  /** May the bars draw? False below `NOTICED_BARS_MIN_ANSWERED_DAYS`. */
  barsRender: boolean
  /** The bars' own span — the report window. Named on the bars because it differs
   *  from the strip's. */
  barsStartDate: string
  barsEndDate: string
  strip: NoticedStrip
  /** The appendix, grouped by day, oldest first. */
  days: NoticedDay[]
  /** Whether the appendix carries a note column at all. */
  notesIncluded: boolean
  /** Looks in the window carrying a note that this render does NOT print, because the
   *  owner turned the option off or this is not her render. Disclosed, so a withheld
   *  column is never a silent one. */
  notesWithheld: number
  intake: NoticedIntake
  /** True when at least one word key in the window was outside the closed vocabulary.
   *  The render says so once rather than per row. */
  hasUnknownWords: boolean
}

// ── Day helpers (the report's own day-number arithmetic, local to this module) ──

/** 'YYYY-MM-DD' → integer day index. Null when unparseable. */
function dayNumber(dayKey: string): number | null {
  const ms = Date.parse(`${dayKey}T00:00:00Z`)
  return Number.isNaN(ms) ? null : Math.round(ms / MS_PER_DAY)
}

function dayKeyFromNumber(n: number): string {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10)
}

/**
 * A key's owner-facing head word, or null when the closed vocabulary does not know it.
 *
 * Null is a DROP, not a fallback to the raw key (the privacy review's rule 1). The
 * pet's own species is tried first with the sibling as a fallback, mirroring
 * `lib/lookDisplay`'s resolver: a shared key means the same thing in both lists.
 *
 * ONE VOCABULARY VERSION EXISTS TODAY (`LOOK_VOCAB_VERSION` is 1), so resolving against
 * the shipped list IS resolving "at `vocab_version`". A bump owes a decision here
 * before it ships: a row written under v1 must keep rendering v1's words, which means
 * this resolver gains the row's version and the constants file gains its history. It is
 * not written now because a resolver over a version set of one is untestable
 * scaffolding, and the row already carries `vocabVersion` for it to read.
 */
function labelFor(key: string, species: LookSpecies | null, sex: 'male' | 'female' | 'unknown'): string | null {
  if (key === LOOK_OPENING_CHIP_KEY) return notHerselfLabel(sex)
  const order: LookSpecies[] = species ? [species, species === 'cat' ? 'dog' : 'cat'] : ['cat', 'dog']
  for (const s of order) {
    const word = lookWord(s, key)
    if (word) return word.head
  }
  return null
}

/** A key's direction, or null when unknown. The opening chip is a CONCERN — it is the
 *  owner's chief complaint ("ADR"), not an activity and not the absence. Mirrors
 *  `lookWordKind` rather than re-deciding: a second classification of the same keys is
 *  the C-11 drift this feature already avoided once. */
function kindFor(key: string, species: LookSpecies | null): LookWordKind | null {
  if (key === LOOK_OPENING_CHIP_KEY) return 'concern'
  const order: LookSpecies[] = species ? [species, species === 'cat' ? 'dog' : 'cat'] : ['cat', 'dog']
  for (const s of order) {
    const word = lookWord(s, key)
    if (word) return word.kind
  }
  return null
}

export interface BuildNoticedParams {
  /** EVERY live look row the pull returned — not only the window's. The pre-first-day
   *  coverage clause reads back past the window on purpose (C-19: re-anchoring a claim
   *  to the record's earliest entry costs nothing as a DATE). */
  rows: readonly ReportLookInput[]
  startDayNum: number
  endDayNum: number
  windowDays: number
  /**
   * Did the pull return the pet's WHOLE live look record?
   *
   * Its ONLY job is deciding whether the pre-first-day coverage clause may name a start
   * date — the B-613 `eventsSinceIso` discipline applied to the one sentence on this
   * block that reads outside the window. FALSE ⇒ rows may be missing off the old end ⇒
   * the count is a FLOOR and names no start date, because printing a query's bound as
   * though it were the record's own first day is the C-19 failure (a record-anchored
   * date is free; a query-anchored one is not).
   *
   * The caller earns `true` by observing that its query was not truncated — never by
   * assuming it. Everything else on this block is window-scoped and unaffected either
   * way: the pull is ordered newest-first precisely so that anything dropped is the
   * OLDEST, which is the only thing this one clause reads.
   */
  pullComplete: boolean
  /** Local days (same keying) a vomit was logged — the record's own rows, never a look. */
  vomitLocalDays: ReadonlySet<string>
  /** Local days carrying a meal the owner rated as picked at or refused. */
  mealLeftLocalDays: ReadonlySet<string>
  /** Did the window hold ANY rated meal? False ⇒ the record is blind to intake. */
  hasRatedMeals: boolean
  species: string
  sex: 'male' | 'female' | 'unknown'
  audience: ReportAudience
}

/**
 * The whole block, or null when the window holds no look at all.
 *
 * Null rather than an empty block: there is no designed empty state for Noticed on the
 * vet report, and there should not be. An owner who has never answered has a record
 * that says nothing about her looking, and a section headed *Owner's observations* over
 * a zero is a section that invites the reader to score her.
 */
export function buildNoticed(params: BuildNoticedParams): NoticedBlock | null {
  const {
    rows,
    startDayNum,
    endDayNum,
    windowDays,
    pullComplete,
    vomitLocalDays,
    mealLeftLocalDays,
    hasRatedMeals,
    audience,
  } = params

  const species = lookSpeciesOf(params.species)
  const notesIncluded = lookNotesIncluded(audience)

  // Every row that has a usable day key, sorted oldest-first with the row's own
  // deterministic tiebreak (created_at, then the parent id) so two looks on one day
  // always print in the same order.
  const dated = rows
    .filter((r) => dayNumber(r.localDay) !== null)
    .slice()
    .sort(
      (a, b) =>
        a.localDay.localeCompare(b.localDay) ||
        a.createdAt.localeCompare(b.createdAt) ||
        (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0),
    )

  const inWindow = (r: ReportLookInput): boolean => {
    const dn = dayNumber(r.localDay)
    return dn !== null && dn >= startDayNum && dn <= endDayNum
  }
  const windowRows = dated.filter(inWindow)
  if (windowRows.length === 0) return null

  const answeredDays = answeredDaysOf(windowRows)
  const absenceCount = absenceDaySet(windowRows).size

  // ── The words ────────────────────────────────────────────────────────────
  // Built over the window's rows, keyed by the stored key, labelled through the closed
  // vocabulary. An unknown key never reaches a count OR a label — it is dropped here,
  // once, so no consumer downstream has to remember to.
  let hasUnknownWords = false
  const firstDayByKey = new Map<string, string>()
  for (const r of windowRows) {
    for (const key of r.words) {
      if (labelFor(key, species, params.sex) === null) {
        hasUnknownWords = true
        continue
      }
      const prev = firstDayByKey.get(key)
      if (prev === undefined || r.localDay < prev) firstDayByKey.set(key, r.localDay)
    }
  }

  const concernWords: NoticedWordCount[] = []
  const activityWords: NoticedWordCount[] = []
  for (const [key, firstDay] of firstDayByKey) {
    const label = labelFor(key, species, params.sex)
    const kind = kindFor(key, species)
    if (label === null || kind === null) continue
    const entry: NoticedWordCount = {
      key,
      label,
      kind,
      dayCount: wordDays(windowRows, key),
      firstDay,
      priorCoverage: priorCoverageFor(dated, firstDay, pullComplete),
    }
    ;(kind === 'concern' ? concernWords : activityWords).push(entry)
  }
  // Most days first, then the earliest first-day, then the key — deterministic, so the
  // same record always renders in the same order (and the bars' order is the line's).
  const byWeight = (a: NoticedWordCount, b: NoticedWordCount): number =>
    b.dayCount - a.dayCount || a.firstDay.localeCompare(b.firstDay) || a.key.localeCompare(b.key)
  concernWords.sort(byWeight)
  activityWords.sort(byWeight)

  // ── The strip ────────────────────────────────────────────────────────────
  // Four weeks back from the window END, CLIPPED to the window start: a clinical
  // document scoped to a window never draws days outside it, and on a window shorter
  // than four weeks the strip is shorter and says so in its own title.
  const stripStartDayNum = Math.max(startDayNum, endDayNum - (NOTICED_STRIP_DAYS - 1))
  const stripRows = dated.filter((r) => {
    const dn = dayNumber(r.localDay)
    return dn !== null && dn >= stripStartDayNum && dn <= endDayNum
  })
  const stripAnswered = answeredDaySet(stripRows)
  const stripAbsence = absenceDaySet(stripRows)
  const stripDays: NoticedStripDay[] = []
  const stripVomitDays = new Set<string>()
  for (let dn = stripStartDayNum; dn <= endDayNum; dn++) {
    const day = dayKeyFromNumber(dn)
    const vomit = vomitLocalDays.has(day)
    if (vomit) stripVomitDays.add(day)
    stripDays.push({
      day,
      mark: !stripAnswered.has(day) ? 'unanswered' : stripAbsence.has(day) ? 'absence' : 'observation',
      vomit,
    })
  }

  const wordDaysInSpan: NoticedStrip['wordDaysInSpan'] = []
  const wordsAbsentInSpan: NoticedStrip['wordsAbsentInSpan'] = []
  for (const w of concernWords) {
    const n = wordDays(stripRows, w.key)
    if (n > 0) wordDaysInSpan.push({ key: w.key, label: w.label, dayCount: n })
    else wordsAbsentInSpan.push({ key: w.key, label: w.label })
  }

  const strip: NoticedStrip = {
    startDate: dayKeyFromNumber(stripStartDayNum),
    endDate: dayKeyFromNumber(endDayNum),
    days: stripDays,
    answeredDays: stripAnswered.size,
    // BOTH sides of this subtraction count the SAME way. `answeredVomitDays` intersects
    // the strip's vomit days with its answered days; the remainder is the vomit days
    // nobody reported on. Counting the left side over all vomit days and the right over
    // answered ones is the §6.11 defect the third pass caught, in the other direction.
    unansweredVomitDays: stripVomitDays.size - answeredVomitDays(stripRows, stripVomitDays),
    wordDaysInSpan,
    wordsAbsentInSpan,
  }

  // ── The appendix ─────────────────────────────────────────────────────────
  let notesWithheld = 0
  const byDay = new Map<string, NoticedEntry[]>()
  for (const r of windowRows) {
    const words: Array<{ key: string; label: string }> = []
    let unknownWords = 0
    for (const key of r.words) {
      const label = labelFor(key, species, params.sex)
      if (label === null) unknownWords += 1
      else words.push({ key, label })
    }
    const hasNote = typeof r.notes === 'string' && r.notes.trim().length > 0
    if (hasNote && !notesIncluded) notesWithheld += 1
    const entry: NoticedEntry = {
      eventId: r.eventId,
      occurredAt: r.occurredAt,
      localDay: r.localDay,
      outcome: r.outcome,
      words,
      unknownWords,
      note: notesIncluded && hasNote ? (r.notes as string) : null,
    }
    const list = byDay.get(r.localDay)
    if (list) list.push(entry)
    else byDay.set(r.localDay, [entry])
  }
  // `windowRows` is already oldest-first, so insertion order is day order.
  const days: NoticedDay[] = [...byDay.entries()].map(([day, entries]) => ({ day, entries }))

  // ── Intake, beside the absence claim (§5 honesty rule 12) ────────────────
  let intake: NoticedIntake
  if (!hasRatedMeals) {
    intake = { kind: 'no_record' }
  } else {
    const absenceSet = absenceDaySet(windowRows)
    const overlap = [...absenceSet].filter((d) => mealLeftLocalDays.has(d)).sort()
    intake = overlap.length > 0 ? { kind: 'disagreement', days: overlap } : { kind: 'none' }
  }

  // Days answered, not absence days, and carrying no CONCERN word — i.e. the days whose
  // only content is an activity. Derived from the same row set every other count reads.
  const concernKeys = new Set(concernWords.map((w) => w.key))
  const daysWithConcern = new Set<string>()
  for (const r of windowRows) {
    if (r.words.some((k) => concernKeys.has(k))) daysWithConcern.add(r.localDay)
  }
  const absenceSetForCounts = absenceDaySet(windowRows)
  let activityOnlyDays = 0
  for (const day of answeredDaySet(windowRows)) {
    if (!absenceSetForCounts.has(day) && !daysWithConcern.has(day)) activityOnlyDays += 1
  }

  return {
    windowDays,
    answeredDays,
    absenceDays: absenceCount,
    activityOnlyDays,
    concernWords,
    activityWords,
    barsRender: answeredDays >= NOTICED_BARS_MIN_ANSWERED_DAYS,
    barsStartDate: dayKeyFromNumber(startDayNum),
    barsEndDate: dayKeyFromNumber(endDayNum),
    strip,
    days,
    notesIncluded,
    notesWithheld,
    intake,
    hasUnknownWords,
  }
}

/**
 * The days answered strictly BEFORE a word's first day, and the earliest of them.
 *
 * Read over the WHOLE pull, not the window: that is the point of the clause. *off on 6*
 * with nothing beside it reads as a new problem; *off on 6 (first Sep 2; answered on 118
 * days before it since May 3)* reads as a change in a record that was being kept.
 *
 * Returns null when nothing was answered before that day: "on 0 days before it" is not
 * a sentence, and a first-date claim with no denominator beside it is T-18's "implies he
 * had been fine until now" — the naked receipt, on a clinical page.
 *
 * When the pull was not complete, the earliest row here is a query artefact rather than
 * the record's beginning, so the date is withheld and the count is stated as a floor.
 */
function priorCoverageFor(
  allRows: readonly ReportLookInput[],
  firstDay: string,
  pullComplete: boolean,
): { answeredDays: number; sinceDay: string | null } | null {
  const prior = allRows.filter((r) => r.localDay < firstDay)
  if (prior.length === 0) return null
  const answered = answeredDaySet(prior)
  if (answered.size === 0) return null
  let earliest: string | null = null
  for (const day of answered) if (earliest === null || day < earliest) earliest = day
  return { answeredDays: answered.size, sinceDay: pullComplete ? earliest : null }
}
