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
// That join is the only guard, and it is a STRING LITERAL in a select — so the fixture
// that pins it (Undo a note-bearing look → the appendix renders nothing) is in
// `noticed.test.ts`, and `guards/reportLookPull.test.ts` pins the select itself, because
// deleting `deleted_at` from that embed un-guards every undone note with no test going
// red (every fixture hand-builds a row that already has the field).

import {
  absenceDaySet,
  answeredDaySet,
  answeredDays as answeredDaysOf,
  answeredVomitDays,
  wordDays,
  type LookDayRow,
  type LookOutcome,
} from '../../../lib/lookDayCounts.ts'
// The day-index arithmetic, imported rather than re-implemented for the third time.
// `trial.ts` — the sibling pure module this one is modelled on — already reaches for these,
// and the shared version is the more defensive one: it round-trips through `Date.UTC` and
// rejects a shape-valid impossible date ('2026-02-30') that `Date.parse` silently rolls
// over into a confident wrong day.
import { dayKeyFromIndex, localDayIndexOf } from '../../../lib/utils.ts'
import {
  LOOK_OPENING_CHIP_KEY,
  lookSpeciesOf,
  lookWord,
  notHerselfLabel,
  type LookSpecies,
  type LookWordKind,
} from '../../../constants/lookWords.ts'


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
  /**
   * The earliest local day THE RECORD carries the word on — not the window's.
   *
   * IT WAS THE WINDOW'S, AND THAT WAS THE WORST DEFECT IN THE BLOCK. `firstDay` read the
   * window while the coverage clause beside it read the whole pull, so on a dog marked
   * *Off* in July, recovered, and marked *Off* again in September under an August-opening
   * window, page 1 said *off on 3 (first Sep 2) … she had been answering since May 11, on
   * 102 of the days before the first of these* — and the 102 days INCLUDED the two July
   * days that falsify the onset. Two halves of one sentence on two spans, with the
   * record-scoped half counting the exact days the window-scoped half denies. A vet reads
   * onset as 13 days ago; the record says 67, waxing and relapsing. Different differential.
   *
   * That is C-35 exactly ("the same read bounded the onset date, so a two-month-old
   * concern printed as three days old"), and the direction was one-way: the block reached
   * outside the window only for the number that reassures.
   *
   * §6.9 defines onset as the first day a word was marked, full stop. So the DATE is the
   * record's and says so when it falls outside the window; the COUNT beside it stays the
   * window's, and the render never lets them be read as one span.
   */
  firstDay: string
  /** False when `firstDay` precedes the window — the render then says *before this
   *  window*, so a record-scoped date can never be read as a window-scoped onset. */
  firstDayInWindow: boolean
  /**
   * Can this date be called the record's first at all?
   *
   * False when the pull may have been truncated at the old end, where an earlier marking
   * could exist that this query never saw. The render then scopes the claim to what it
   * can see rather than asserting an onset — a date is free only when the read behind it
   * is complete (C-19).
   */
  firstDayIsRecordFirst: boolean
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
   * `concern` ● — answered, at least one SYMPTOM-CLASS word (a MIXED day draws ● — T-14,
   *   and the accusing branch winning is the same precedence `absenceDaySet` applies).
   * `clear` ○ — answered, no symptom-class word: she marked *nothing unusual*, OR her
   *   only word was an activity.
   * `unanswered` — a faint dot, NEVER a blank: a blank is the visual default and reads
   *   as "nothing seen", so a vomit's mark would float over a void (the third pass).
   *
   * ── WHY AN ACTIVITY-ONLY DAY IS `clear` AND NOT `concern` (the cold read) ──
   * It used to be `observation`, on the reading that an activity IS an observation. It
   * drew the same filled mark as an *off* day, so a week reading `lip-licking · off ·
   * LIVELY · off` rendered as four consecutive identical marks — an unbroken run of
   * concern, 25% of which was the owner saying the cat was bright. And it was
   * inconsistent with the rest of the page by construction: page 1 never lists an
   * activity word, never counts one and never bars one, so the one surface that DREW
   * them was inflating exactly the cluster the other surfaces were careful about.
   *
   * `clear` is not "nothing unusual" — that is the owner's own claim and it keeps its own
   * count and its own sentence. `clear` is the weaker, true statement the strip can make:
   * she answered, and nothing she said is a concern. The legend says it in those words.
   */
  mark: 'concern' | 'clear' | 'unanswered'
  /** A vomit was logged this day — from the RECORD's own rows, never from a look. */
  vomit: boolean
}

export interface NoticedStrip {
  startDate: string
  endDate: string
  days: NoticedStripDay[]
  /** Answered days inside the strip — THE denominator of `wordDaysInSpan`.
   *
   *  Not the cell count. The per-word sentence used to read *off on 6 of these 28*, where
   *  28 is calendar days and only 25 were answered — a denominator no other count on this
   *  page uses, two centimetres from a bar reading *6 of 42 days answered*. On a thin
   *  record it is worse than inconsistent: 5 concerning days out of 13 answered printed as
   *  "5 of these 28", understating the rate by a factor of two, in the reassuring
   *  direction (the cold read). */
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
   *
   * A KNOWN ACTIVITY WORD, NOT A FALSY CATCH-ALL. It used to be "answered, not an absence
   * day, no concern word", which swept up three different populations and told the reader
   * all three were activities: a day whose only word this build does not recognise (which
   * a held redeploy makes ordinary — the client ships OTA and the vocabulary can gain a
   * word before this function is redeployed), and a row stored `observed` with an empty
   * word array, which migration 064 permits by its own choice. Four days of a concern
   * word the deployed function had not heard of printed as *4 answered days carry only an
   * activity word*. Those days are `unreadableDays` now, and they are said in their own
   * words.
   */
  activityOnlyDays: number
  /**
   * Answered days that are not absence days and carry NO word this build can read — an
   * unrecognised key, or a row stored as an observation with no words at all.
   *
   * The report knows something was recorded and cannot say what. That is the honest
   * statement, and it is the opposite of "only an activity": one is the owner reporting
   * her pet was bright, the other is the document admitting a gap in itself.
   */
  unreadableDays: number
  /** Symptom-class words, most days first. Page 1 and the bars. */
  concernWords: NoticedWordCount[]
  /** Activity words. The appendix's ink only — NEVER page 1, because a rise in a
   *  positive never reassures and a page-1 tally of them invites exactly that read. */
  activityWords: NoticedWordCount[]
  /** May the bars draw? */
  barsRender: boolean
  /**
   * WHY they do not, when they do not — never a single empty return the caller has to
   * guess at (C-4).
   *
   * `floor` — under `NOTICED_BARS_MIN_ANSWERED_DAYS`.
   * `spread` — enough answered days, but clustered: §6.5's guard, which the first cut kept
   *   the count of and dropped the placement of. Sixteen consecutive answered days during
   *   one bad fortnight drew a bar at 81% of the track under a title spanning three
   *   months. "Eight answered days can be eight days the owner was already worried" is
   *   §6.5's own sentence, and it is truer on the surface where the encoding is a LENGTH.
   * `no_concern_words` — she answered plenty and marked no concern. Nothing is withheld
   *   here and the render must not say anything was: attributing this to a thin record
   *   substitutes "too little evidence" for "she reported nothing wrong", on the most
   *   common record there is.
   */
  barsWithheld: 'floor' | 'spread' | 'no_concern_words' | null
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
  /**
   * How often the owner marked *nothing unusual* on a day the record holds a vomit — and
   * how many vomit days she answered at all. BOTH sides are answered days (§6.11's rule,
   * which exists because counting one side over all vomit days scores every unanswered
   * bad day as "nothing seen").
   *
   * THE CALIBRATION FACT, and the cold read is what named it: it tells a reader how much
   * weight *marked nothing unusual on 32 of the 42* can carry. An owner who marks nothing
   * unusual on three of the four days her cat vomits is an owner whose quiet days mean
   * something different, and until this printed, that was derivable from the strip only
   * by eye, mark by mark.
   *
   * It ESCALATES ONLY. A zero here would read as "she caught every one", which is
   * reassurance drawn from an absence, so the render prints this only when
   * `absenceOnVomitDays > 0`.
   */
  absenceOnVomitDays: number
  answeredVomitDays: number
  /** The local days IN THE WINDOW the record holds a vomit, sorted. The appendix marks
   *  its day headings from this; the strip draws its own 28-day slice of the same set, so
   *  a day marked in the appendix and a triangle on page 1 cannot disagree — and the
   *  appendix, which spans the whole window, does not inherit the strip's shorter span. */
  vomitDays: string[]
  /**
   * Do the page-1 counts actually fail to reconcile? `absenceDays + Σ concern day counts`
   * against the days answered.
   *
   * The reconciliation clause used to print unconditionally, and on a real record it was
   * FALSE: 6 + 2 + 2 + 32 is exactly 42, because a double-counted multi-word day and an
   * omitted activity-only day cancelled. A disclaimer that is wrong half the time teaches
   * a reader to skim the small print — and the small print beside it is where the
   * refused-meal contradiction lives (the cold read).
   */
  countsSum: number
  /** True when at least one word key in the window was outside the closed vocabulary. */
  hasUnknownWords: boolean
  /**
   * True when the pull was capped AND its oldest row lands inside the window — so the
   * window's own oldest look rows are missing and EVERY count here is a floor.
   *
   * The first cut's comment claimed this could not happen ("the window keeps every row it
   * had"), which is true only while the window's own rows fit under the cap. A
   * since-visit window has no upper bound and a custom window has no clamp, so a
   * long-tenured household answering several times a day can exceed it inside the window:
   * measured, 399 answered days printed as "300 of 399" with an onset 99 days late and no
   * disclosure at all.
   */
  windowTruncated: boolean
  /**
   * The coverage before the EARLIEST concern-word first-date, stated once.
   *
   * Per-word it was three parentheticals on one line (*120 days before it since May 3* …
   * *94* … *121*), all anchored to the same start date, which turned a scannable sentence
   * into a wall and invited a reader to hunt for meaning in 120-vs-121 (the cold read).
   * One clause answers the question all three were asked for — had she been watching
   * before this started? — and it is true of every word on the line, because coverage
   * before the earliest first-date is a subset of the coverage before any later one.
   *
   * Null when nothing was answered before, or when there is no concern word.
   */
  baseline: { answeredDays: number; sinceDay: string | null; firstDay: string } | null
}

// ── Day helpers (the report's own day-number arithmetic, local to this module) ──


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
    .filter((r) => localDayIndexOf(r.localDay) !== null)
    .slice()
    .sort(
      (a, b) =>
        a.localDay.localeCompare(b.localDay) ||
        a.createdAt.localeCompare(b.createdAt) ||
        (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0),
    )

  const inWindow = (r: ReportLookInput): boolean => {
    const dn = localDayIndexOf(r.localDay)
    return dn !== null && dn >= startDayNum && dn <= endDayNum
  }
  const windowRows = dated.filter(inWindow)
  if (windowRows.length === 0) return null

  // Did the cap bite INSIDE the window? `dated` is oldest-first, so its head is the oldest
  // row the pull returned; if that row is not older than the window's opening day, rows
  // the window needs may be missing off the old end and every count here is a floor.
  const oldestPulledNum = localDayIndexOf(dated[0].localDay)
  const windowTruncated = !pullComplete && (oldestPulledNum === null || oldestPulledNum > startDayNum)

  const answeredDays = answeredDaysOf(windowRows)
  const absenceCount = absenceDaySet(windowRows).size

  // ── The words ────────────────────────────────────────────────────────────
  // Built over the window's rows, keyed by the stored key, labelled through the closed
  // vocabulary. An unknown key never reaches a count OR a label — it is dropped here,
  // once, so no consumer downstream has to remember to.
  let hasUnknownWords = false
  // WHICH words appeared is a question about the WINDOW; WHEN each was first marked is a
  // question about the RECORD. Keeping them apart is the whole of finding 1: the earliest
  // day is read over every pulled row, so a word marked in July and again in September
  // reports July as its onset rather than the window's opening.
  const inWindowKeys = new Set<string>()
  for (const r of windowRows) {
    for (const key of r.words) {
      if (labelFor(key, species, params.sex) === null) {
        hasUnknownWords = true
        continue
      }
      inWindowKeys.add(key)
    }
  }
  const firstDayByKey = new Map<string, string>()
  for (const r of dated) {
    for (const key of r.words) {
      if (!inWindowKeys.has(key)) continue
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
    const firstNum = localDayIndexOf(firstDay)
    const entry: NoticedWordCount = {
      key,
      label,
      kind,
      // The COUNT is the window's. Only the date reaches back.
      dayCount: wordDays(windowRows, key),
      firstDay,
      firstDayInWindow: firstNum !== null && firstNum >= startDayNum,
      firstDayIsRecordFirst: pullComplete,
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
    const dn = localDayIndexOf(r.localDay)
    return dn !== null && dn >= stripStartDayNum && dn <= endDayNum
  })
  const stripAnswered = answeredDaySet(stripRows)
  // The days inside the strip carrying a symptom-class word — the ONE thing `concern`
  // means. Derived from the same `concernWords` set page 1 counts and bars, so the mark
  // and the number can never disagree about what a concern is.
  const stripConcernDays = new Set<string>()
  for (const r of stripRows) {
    if (r.words.some((k) => kindFor(k, species) === 'concern' && labelFor(k, species, params.sex) !== null)) {
      stripConcernDays.add(r.localDay)
    }
  }
  const stripDays: NoticedStripDay[] = []
  const stripVomitDays = new Set<string>()
  for (let dn = stripStartDayNum; dn <= endDayNum; dn++) {
    const day = dayKeyFromIndex(dn)
    const vomit = vomitLocalDays.has(day)
    if (vomit) stripVomitDays.add(day)
    const hasConcern = stripConcernDays.has(day)
    stripDays.push({
      day,
      mark: !stripAnswered.has(day) ? 'unanswered' : hasConcern ? 'concern' : 'clear',
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
    startDate: dayKeyFromIndex(stripStartDayNum),
    endDate: dayKeyFromIndex(endDayNum),
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

  // THREE populations, counted apart. A day that is answered and is not an absence day is
  // one of: a concern day (listed on page 1), an ACTIVITY-only day (deliberately not
  // listed), or a day carrying nothing this build can read. The first cut collapsed the
  // last two and called both an activity.
  const concernKeys = new Set(concernWords.map((w) => w.key))
  const activityKeys = new Set(activityWords.map((w) => w.key))
  const daysWithConcern = new Set<string>()
  const daysWithActivity = new Set<string>()
  for (const r of windowRows) {
    if (r.words.some((k) => concernKeys.has(k))) daysWithConcern.add(r.localDay)
    if (r.words.some((k) => activityKeys.has(k))) daysWithActivity.add(r.localDay)
  }
  const absenceSetForCounts = absenceDaySet(windowRows)
  let activityOnlyDays = 0
  let unreadableDays = 0
  for (const day of answeredDaySet(windowRows)) {
    if (absenceSetForCounts.has(day) || daysWithConcern.has(day)) continue
    if (daysWithActivity.has(day)) activityOnlyDays += 1
    else unreadableDays += 1
  }

  // The calibration fact, window-scoped — because the claim it calibrates (*marked
  // nothing unusual on N of the M*) is window-scoped (C-35: a gate's window is the window
  // of the claim it gates, never the convenient neighbour's).
  const windowAbsence = absenceDaySet(windowRows)
  let absenceOnVomitDays = 0
  for (const day of windowAbsence) if (vomitLocalDays.has(day)) absenceOnVomitDays += 1

  const countsSum = absenceCount + concernWords.reduce((n, w) => n + w.dayCount, 0)

  // §6.5's spread guard, carried onto the surface where the encoding is a LENGTH. The
  // window is divided into four equal parts and the answered days must touch at least
  // three of them — the report's proportional reading of "≥ 8 answered days spread over
  // ≥ 3 of its 4 weeks", which works on a 28-day window and on a 400-day one alike.
  const answeredQuarters = new Set<number>()
  const span = Math.max(1, endDayNum - startDayNum + 1)
  for (const day of answeredDaySet(windowRows)) {
    const num = localDayIndexOf(day)
    if (num === null) continue
    answeredQuarters.add(Math.min(3, Math.floor(((num - startDayNum) * 4) / span)))
  }
  const barsWithheld: NoticedBlock['barsWithheld'] =
    concernWords.length === 0
      ? 'no_concern_words'
      : answeredDays < NOTICED_BARS_MIN_ANSWERED_DAYS
        ? 'floor'
        : answeredQuarters.size < 3
          ? 'spread'
          : null

  const earliest = concernWords.reduce<NoticedWordCount | null>(
    (acc, w) => (acc === null || w.firstDay < acc.firstDay ? w : acc),
    null,
  )
  const baseline =
    earliest && earliest.priorCoverage
      ? { ...earliest.priorCoverage, firstDay: earliest.firstDay }
      : null

  return {
    windowDays,
    answeredDays,
    absenceDays: absenceCount,
    activityOnlyDays,
    unreadableDays,
    windowTruncated,
    absenceOnVomitDays,
    answeredVomitDays: answeredVomitDays(windowRows, vomitLocalDays),
    vomitDays: [...vomitLocalDays]
      .filter((d) => {
        const num = localDayIndexOf(d)
        return num !== null && num >= startDayNum && num <= endDayNum
      })
      .sort(),
    countsSum,
    baseline,
    concernWords,
    activityWords,
    barsRender: barsWithheld === null,
    barsWithheld,
    barsStartDate: dayKeyFromIndex(startDayNum),
    barsEndDate: dayKeyFromIndex(endDayNum),
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
