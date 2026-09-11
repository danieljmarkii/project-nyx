// *What you noticed* — the Patterns card, decided (CUL-874 / N-5).
//
// docs/nyx-daily-look-requirements.md §7 (the card), §6 (the baseline it reads back),
// R2, R13, T-17, T-20; the review's E-13.
//
// PURE, React-free, theme-free. It turns the pet's look record into an ordered row set
// and the three lines around it; `components/dashboard/WhatYouNoticedCard.tsx` renders
// what this decides and derives nothing of its own. That split is the point — every
// number on this card is a claim about an animal, and a claim belongs where it can be
// tested without a renderer.
//
// ── THE CARD, TOP TO BOTTOM ──────────────────────────────────────────────────
//   Counted across the 24 of the last 28 days you answered.   ← the denominator, as the ACT
//   Off                     first Sep 3 · 4 weeks before: 0 of 22       3 of 24 days
//   Lip-licking             on 2 of the 3 vomit days you answered …     3 of 24
//   Marked — the owner's claim
//   Nothing unusual                                                    19 of 24
//   Activity
//   Played                                                             12 of 24
//
// ── THREE READINGS THE SPEC ONLY SETTLES WHEN YOU HOLD ITS SECTIONS TOGETHER ─
//
//  1. WHICH ROWS THE FLOOR HOLDS BACK. §7's frame draws a day-3 card as the calibration
//     line alone, and §7's prose says "below floor: the current-window counts AND the
//     calibration line". §6.6 settles it, because it is absolute and it is a safety rule:
//     *a rising symptom-class count is never withheld — not by the density rule and NOT BY
//     THE FLOOR.* So symptom rows render at every coverage with their denominators, and
//     what the floor holds is the REASSURING half — the observed absence and the activity
//     positives. On a quiet day-3 record that yields exactly the mock's frame (no symptom
//     row exists, the absence is held, the calibration line stands alone); with one *Off*
//     among those three days it yields the accusing count and no all-clear, which is the
//     only reading of the two sentences that does not break §6.6.
//
//  2. THE DENOMINATOR LINE PRINTS AT EVERY COVERAGE, INCLUDING SATURATION. Home's footer
//     drops the number at 28 of 28 because a count of eligible days IS a streak there
//     (T-16). §7 overrules that here, and gives the reason: suppressing the line at full
//     coverage removes the only cue on the day the reflex risk peaks. Two surfaces, two
//     rules, one deliberate difference — C-34's "same value, different question".
//
//  3. WHAT A SYMPTOM ROW IS UNDER THE WITHHELD STATE. §7 withholds the denominator LINE
//     under item 12 ("so the number Home refuses is not one tap away") and also says the
//     symptom rows "stay". They cannot stay as *3 of 24* — the 24 is the refused number.
//     So they stay as the BARE COUNT and the first date: *Off · 3 days · first marked Sep
//     2, 2026.* PM-ruled 2026-09-11. A bare numerator reconstructs no denominator (the
//     words overlap on a day, so nothing subtracts back to the answered total), and it
//     keeps the accusing count on the one morning it matters most — which dropping to
//     Home's bare-date form would not.
//
// ── AND THE THING THIS CARD MAY NEVER BECOME (§7's Never list) ───────────────
// No average, no slope, no score, no heatmap, no positive-valence tally, no whole-day
// colour, no streak, no "usual" state word. The greyscale test: printed in grey, this
// card must still be a list of counts with denominators and nothing that reads as a
// verdict. Every row here is `{label, numerator, denominator}` by construction, which is
// what makes that testable rather than aspirational.

import {
  LOOK_OPENING_CHIP_KEY,
  LOOK_WORDS,
  lookWordKind,
  type LookSpecies,
} from '../constants/lookWords';
import { LOOK_COVERAGE_FLOOR_DAYS, LOOK_COVERAGE_WINDOW_DAYS } from './lookCoverage';
import { compareWord, comparisonClause, type LookComparison } from './lookComparison';
import { cardPairing, type LookPairing } from './lookPairing';
import { resolveWord, type LookPetContext } from './lookDisplay';
import { localDayIndex, localDayIndexOf, formatCalendarDate, petPronouns } from './utils';
// The year-stamped form lives with the receipts, NOT in `lib/utils` — three Edge
// Functions import that file, and a formatter added there drifts all three (C-26).
import { lookDatedWithYear } from './lookReceipts';
import { answeredDaySet, absenceDaySet, wordDaySet, type LookDayRow } from './lookDayCounts';

/** The card's label (R13 / L-11). */
export const NOTICED_CARD_LABEL = 'What you noticed';

/**
 * The `›` destination. The metric detail for looks is v1.x, so the door lands on the
 * History day spine filtered to looks — a real room, not a stub (§7).
 *
 * `ts` IS NOT DECORATION. History is a mounted tab and its filter effect returns early on
 * `!params.ts` (`app/(tabs)/history.tsx`), so without a nonce the type filter applies on
 * the first tap only: an owner who taps through, switches the scope to Meals to check a
 * bowl, comes back and taps again lands on Meals while the card's own hint promises
 * "Opens every look in the record". Every other doorway into that screen passes one, the
 * look's own `lookMoreTodayHref` included — this is the same door and it takes the same
 * key. Found by the product read (CUL-874).
 */
export function noticedCardHref(nowMs: number = Date.now()): string {
  return `/history?type=check_in&ts=${nowMs}`;
}

/** The group label above the observed-absence row. Verbatim from §7: the absence is the
 *  OWNER'S CLAIM and is labelled as one, never as something the app observed (G9). */
export const NOTICED_ABSENCE_GROUP = 'Marked — the owner’s claim';

/** The group label above the activity positives. §7 gives these rows a weight and an
 *  order but no label of its own; the mock's cell carries the rule ("Activity — in ink,
 *  never a pair") rather than owner copy, so the owner reads the noun alone. */
export const NOTICED_POSITIVE_GROUP = 'Activity';

/** The observed-absence row's label — the owner's own chip word (§5.6, L-6). */
export const NOTICED_ABSENCE_LABEL = 'Nothing unusual';

/**
 * The withheld card's SPAN line — what the coverage line's slot carries once the
 * denominator has left it.
 *
 * Without it the withheld card states no window anywhere, and its rows pair a 28-day
 * count with a first date from the whole record: *Off · 1 day · first marked Aug 2* reads
 * as "one day since August", a duration the record does not support (C-19 — a date is
 * free, a duration is guarded). The 28 is the WINDOW, a constant, and never the
 * answered-day total item 12 refuses; saying it leaks nothing and closes the implied
 * duration. Found by the adversarial pass (CUL-874).
 */
export function noticedWithheldSpanLine(windowDays: number): string {
  return `The counts below are from the last ${windowDays} days.`;
}

/**
 * The multi-select clause — §8 rule 12's, owed to the owner and not only to the vet.
 *
 * A day carries more than one word, so a card showing 3 + 3 + 1 + 19 + 12 over a
 * denominator of 24 is correct and reads as broken. §8 mandates the clause on the report
 * because the sum is "wrong to a cold reader without the clause"; this card shows MORE
 * rows than the report's line (the activity positives are on it) to a LESS expert reader,
 * so it needs the clause at least as much. Found by the product read (CUL-874).
 */
export const NOTICED_MULTI_SELECT_NOTE =
  'A day can carry more than one word, so these counts don’t add up to the days.';

/** The three weights §7 names, in the order they render. `symptom` is ink; the other two
 *  are the secondary ink. A weight is presentation metadata, never a severity. */
export type NoticedRowWeight = 'symptom' | 'absence' | 'positive';

export interface NoticedRow {
  /** The word key, or `NOTICED_ABSENCE_LABEL`'s own sentinel for the absence row. */
  key: string;
  weight: NoticedRowWeight;
  /** The head word as the vocabulary names it for this pet. */
  label: string;
  /** Days in the window the row counts. */
  days: number;
  /**
   * The answered-day denominator — `null` ONLY under the withheld state, where the
   * answered-day total is the number item 12 refuses. A renderer prints "N of M days" or,
   * at null, "N days"; it never invents an M.
   */
  denominator: number | null;
  /** The sub-lines under the row, in order: the first date + the comparison clause, then
   *  the pairing. Each is a whole line (T-15 — nothing of one kind shares a line with
   *  another); the pairing's own string carries its L-17 disclosure on a second line. */
  detail: string[];
}

export interface NoticedCardModel {
  /** The first line — the denominator as the act. `null` under the withheld state. */
  coverageLine: string | null;
  rows: NoticedRow[];
  /** The one withheld sentence, or `null`. Replaces the absence and positive rows. */
  withheldLine: string | null;
  /** The withheld card's span, or `null`. Stands in the coverage line's slot so the rows
   *  below it are not a count with no window beside a date with no bound. */
  withheldSpanLine: string | null;
  /** The one calibration line, or `null`. Renders when the record is too thin for the
   *  reassuring rows, or when a symptom row's comparison is waiting on §6.5's floor. */
  calibrationLine: string | null;
  /** `NOTICED_MULTI_SELECT_NOTE` when the card shows two or more counted rows, else
   *  `null`. One row cannot be summed against anything, and the withheld card prints no
   *  denominator to sum toward. */
  multiSelectNote: string | null;
  /** True when the calibration line is the only thing on the card — §7's drawn empty
   *  state, the room behind a door that exists from day 1. */
  empty: boolean;
  /** The card's one pairing (L-17), already attached to its row's `detail`. Surfaced so a
   *  test can assert "at most one" without re-parsing strings. */
  pairing: LookPairing | null;
  /** Per-word answered-day counts over THIS card's window. The card's own numerators,
   *  exposed for a test; CUL-845 gate 2 does NOT read them — see `lookWordDaysOver`. */
  wordDaysInWindow: ReadonlyMap<string, number>;
}

export interface NoticedCardInput {
  petName: string;
  /** The RECORD's pet — species for the vocabulary, sex for the withheld sentence's
   *  inflection. ONE source for both: a second `sex` field beside this one is two
   *  answers to "whose card is this", and the withheld line names her three times. */
  pet: LookPetContext;
  nowMs: number;
  /** Explicit IANA zone for the day arithmetic; production passes nothing (T-19, C-29). */
  timeZone?: string;
  /** `lookWithheld` — the SHARED predicate (N-4b's `lib/lookWithheld.ts`), passed rather
   *  than re-derived so Home and Patterns cannot disagree one tap apart (T-20). */
  withheld: boolean;
  /**
   * Local days (the looks' own keying) on which a vomit was logged.
   *
   * BOUNDED HERE, not by the caller. The screen reads eight weeks so the comparison has
   * an earlier half, and the pairing counts looks over the card's 28 days only — so a
   * vomit from the earlier half would land in NEITHER side of the margin and be counted
   * as "not answered", inflating the one clause that tells the owner how much of her
   * pet's record the pairing could not see. The window is this module's, so the bound is
   * too (C-3).
   */
  vomitLocalDays: Iterable<string>;
}

/** The withheld sentence — §7 verbatim, inflected. A FUNCTION of the pet because it names
 *  her three times: `pets.sex` is NOT NULL with an `unknown` member (E-15), and this card
 *  is one tap from the record that knows which animal it is. */
export function noticedWithheldLine(petName: string, sex: 'male' | 'female' | 'unknown'): string {
  const p = petPronouns(sex);
  return (
    `While ${petName}’s eating needs attention, ${p.possessive} quiet-day counts aren’t shown — ` +
    `a run of ordinary days isn’t a sign ${p.subject} is well. ` +
    `${p.possessive.charAt(0).toUpperCase()}${p.possessive.slice(1)} looks are on the report, beside ${p.possessive} meals.`
  );
}

/**
 * The calibration line — §6.5's copy and §7's empty state, one string for both.
 *
 * It states what the record HAS and never what it is missing: no target, no countdown, no
 * "3 more days" (Principle 5, and G8 — transparency, never solicitation). The same
 * sentence serves the thin card and the comparison that is still waiting, because they
 * are the same fact said once rather than a general line plus a technical one.
 */
export function noticedCalibrationLine(answeredDays: number): string {
  // At zero the count clause says nothing and reads as a score of nought, so it goes and
  // the sentence stands alone. Every other value states what the record HAS.
  if (answeredDays === 0) return 'Looks build up over time.';
  return `Looks build up over time · ${answeredDays} ${answeredDays === 1 ? 'day' : 'days'} answered so far.`;
}

/** The denominator line — the act, never an observation, never a miss (§7, G9). */
export function noticedCoverageLine(answeredDays: number, windowDays: number): string {
  return `Counted across the ${answeredDays} of the last ${windowDays} days you answered.`;
}

/**
 * The card's row ORDER, for one species.
 *
 * The opening chip leads: *Not herself* is the chief complaint an owner reaches for
 * first, it is the first chip on the Home card, and it is classified `concern` by
 * `lookWordKind` — but it lives outside `LOOK_WORDS` (its label follows `pets.sex`), so
 * it would otherwise fall off the end of a vocabulary-ordered list. Everything after it
 * is the vocabulary's own order, which is the taxonomy's chip order (§7).
 */
export function noticedWordOrder(species: LookSpecies | null): string[] {
  if (!species) return [LOOK_OPENING_CHIP_KEY];
  return [LOOK_OPENING_CHIP_KEY, ...LOOK_WORDS[species].map((w) => w.key)];
}

/**
 * Per-word answered-day counts over an ARBITRARY trailing window — CUL-845 gate 2's read.
 *
 * IT TAKES THE WINDOW BECAUSE THE ZERO IT SUPPRESSES IS NOT THIS CARD'S. The Patterns
 * symptom cards count a 30-day month (`AnalyticsWindow 'month'`, captioned "Last 30
 * days"); this card counts 28. Reading the card's 28 against their 30 left a two-day
 * hole in the gate, and the adversarial pass walked through it: *Scratching more* marked
 * only on days 29 and 30 → the gate sees zero → `Itch · 0` prints over the owner's own
 * words, in exactly the case CUL-845 gate 2 exists for. C-3: use the predicate the
 * neighbouring sentence uses.
 */
export function lookWordDaysOver(
  record: readonly LookDayRow[],
  input: { nowMs: number; timeZone?: string; days: number },
): Map<string, number> {
  const todayIndex = localDayIndex(input.nowMs, input.timeZone);
  const firstIndex = todayIndex - (input.days - 1);
  const byWord = new Map<string, Set<string>>();
  for (const row of record) {
    const index = localDayIndexOf(row.localDay);
    if (index === null || index < firstIndex || index > todayIndex) continue;
    for (const word of row.words) {
      let days = byWord.get(word);
      if (!days) byWord.set(word, (days = new Set()));
      days.add(row.localDay);
    }
  }
  const counts = new Map<string, number>();
  for (const [word, days] of byWord) counts.set(word, days.size);
  return counts;
}

/** A row's first-date clause. Inside the card's window the date is bare (the window IS
 *  the band C-19 requires); outside it the year is stamped, because a date that predates
 *  the claim's own scope sits in no band and a bare "Jun 2" would read as this year's. */
function firstDateClause(firstDay: string, windowFirstIndex: number): string | null {
  const index = localDayIndexOf(firstDay);
  if (index === null) return null;
  const dated = index >= windowFirstIndex ? formatCalendarDate(firstDay) : lookDatedWithYear(firstDay);
  return dated ? `first ${dated}` : null;
}

/** The label a row shows. `null` when this build cannot name the key (a row written under
 *  a newer vocabulary) — such a row is dropped rather than rendered as its raw key. */
function labelFor(key: string, pet: LookPetContext): string | null {
  return resolveWord(key, pet)?.head ?? null;
}

/**
 * Build the card.
 *
 * `record` is every LIVE look row for the pet (`loadLookDays` has already dropped the
 * soft-deleted ones through the parent). Rows outside the window are ignored HERE rather
 * than at the read: the caller may hand over more than the window because the comparison
 * needs eight weeks, and a window may INDEX while only the total may be SPOKEN (C-3).
 */
export function buildNoticedCard(
  record: readonly LookDayRow[],
  input: NoticedCardInput,
): NoticedCardModel {
  const species = input.pet.species === 'cat' || input.pet.species === 'dog' ? input.pet.species : null;
  const todayIndex = localDayIndex(input.nowMs, input.timeZone);
  const windowFirstIndex = todayIndex - (LOOK_COVERAGE_WINDOW_DAYS - 1);

  // The window's own rows, once. Every count below is taken from THIS list, so the card
  // cannot hold two opinions about which days it is speaking for.
  const inWindow = record.filter((row) => {
    const index = localDayIndexOf(row.localDay);
    return index !== null && index >= windowFirstIndex && index <= todayIndex;
  });

  const answered = answeredDaySet(inWindow).size;
  const order = noticedWordOrder(species);

  // Per-word day counts over the window — the rows' numerators AND what CUL-845 gate 2
  // reads. One derivation, two consumers.
  const wordDaysInWindow = new Map<string, number>();
  for (const key of order) {
    const days = wordDaySet(inWindow, key).size;
    if (days > 0) wordDaysInWindow.set(key, days);
  }

  const symptomKeys = order.filter(
    (key) => lookWordKind(key, species) === 'concern' && (wordDaysInWindow.get(key) ?? 0) > 0,
  );
  const positiveKeys = order.filter(
    (key) => lookWordKind(key, species) === 'positive' && (wordDaysInWindow.get(key) ?? 0) > 0,
  );
  const absence = absenceDaySet(inWindow).size;

  // ── The withheld state (item 12, T-20) ────────────────────────────────────
  // Decided BEFORE any comparison or pairing is computed, so no branch below can leak a
  // denominator through a state whose whole point is refusing one. The absence and
  // positive rows do not exist here; the symptom rows keep their bare count and their
  // first date, and nothing else.
  if (input.withheld) {
    const rows: NoticedRow[] = [];
    for (const key of symptomKeys) {
      const label = labelFor(key, input.pet);
      if (!label) continue;
      const markedDays = [...wordDaySet(record, key)].sort();
      const first = markedDays.length > 0 ? firstMarkedClause(markedDays[0]) : null;
      rows.push({
        key,
        weight: 'symptom',
        label,
        days: wordDaysInWindow.get(key) ?? 0,
        denominator: null,
        detail: first ? [first] : [],
      });
    }
    return {
      coverageLine: null,
      rows,
      withheldLine: noticedWithheldLine(input.petName, input.pet.sex ?? 'unknown'),
      // Only when there is a count to bound: on a card with no symptom row the sentence
      // stands alone and a span line would frame nothing.
      withheldSpanLine: rows.length > 0 ? noticedWithheldSpanLine(LOOK_COVERAGE_WINDOW_DAYS) : null,
      // No calibration line: it prints an answered-day count, which is the refused number.
      calibrationLine: null,
      // No multi-select clause either: this card prints no denominator, so there is no
      // total for a reader to try to sum toward.
      multiSelectNote: null,
      empty: rows.length === 0,
      pairing: null,
      wordDaysInWindow,
    };
  }

  // ── The open state ────────────────────────────────────────────────────────
  const belowFloor = answered < LOOK_COVERAGE_FLOOR_DAYS;
  const vomitDaysInWindow: string[] = [];
  for (const day of new Set(input.vomitLocalDays)) {
    const index = localDayIndexOf(day);
    if (index !== null && index >= windowFirstIndex && index <= todayIndex) vomitDaysInWindow.push(day);
  }
  // NO PAIRING BELOW THE FLOOR. §6.11's own floors bottom out at 13 answered days — one
  // below §7's — so without this the card printed *Looks build up over time · 13 days
  // answered so far* and an association about the same thirteen days, on one card. A
  // surface that has just said it cannot speak yet does not then speak (the adversarial
  // pass, CUL-874).
  const pairing = belowFloor
    ? null
    : cardPairing(inWindow, {
        vomitLocalDays: vomitDaysInWindow,
        species,
        words: symptomKeys,
      });

  const rows: NoticedRow[] = [];
  let anyComparisonWaiting = false;

  for (const key of symptomKeys) {
    const label = labelFor(key, input.pet);
    if (!label) continue;
    const detail: string[] = [];

    // Line 1: the first date, then the comparison clause — one line, ' · ' between, so a
    // row never grows a line per fact (T-15's discipline applied to the sub-line).
    const markedDays = [...wordDaySet(record, key)].sort();
    const parts: string[] = [];
    const dateClause = markedDays.length > 0 ? firstDateClause(markedDays[0], windowFirstIndex) : null;
    if (dateClause) parts.push(dateClause);

    // The comparison reads the WHOLE record, not the window: its earlier half is the four
    // weeks before the window starts, which `inWindow` has already dropped.
    const comparison: LookComparison = compareWord(key, record, {
      nowMs: input.nowMs,
      timeZone: input.timeZone,
      species,
    });
    if (comparison.kind === 'withheld' && comparison.reason === 'notEnoughData') {
      anyComparisonWaiting = true;
    } else {
      const clause = comparisonClause(comparison);
      if (clause) parts.push(clause);
    }
    if (parts.length > 0) detail.push(parts.join(' · '));

    // Line 2: the card's ONE pairing, under the row that earned it.
    if (pairing && pairing.word === key) detail.push(pairing.text);

    rows.push({
      key,
      weight: 'symptom',
      label,
      days: wordDaysInWindow.get(key) ?? 0,
      denominator: answered,
      detail,
    });
  }

  // The reassuring half — held below the floor (reading 1 in the header).
  if (!belowFloor) {
    if (absence > 0) {
      rows.push({
        key: 'nothing_unusual',
        weight: 'absence',
        label: NOTICED_ABSENCE_LABEL,
        days: absence,
        denominator: answered,
        detail: [],
      });
    }
    for (const key of positiveKeys) {
      const label = labelFor(key, input.pet);
      if (!label) continue;
      rows.push({
        key,
        weight: 'positive',
        label,
        days: wordDaysInWindow.get(key) ?? 0,
        denominator: answered,
        // NEVER a pair (§6.6, gap 10) and never a pairing (§6.11 floor 4). The current
        // window's count is the whole of a positive row, which is why this is `[]` here
        // rather than a branch above that happens not to fire.
        detail: [],
      });
    }
  }

  const calibrationLine =
    belowFloor || anyComparisonWaiting ? noticedCalibrationLine(answered) : null;

  // ── THE DENOMINATOR LINE, AND WHERE "AT EVERY COVERAGE" STOPS ─────────────
  // §7 says the line prints at every coverage, and the sentence it argues against is
  // C-3's SUPPRESS-AT-FULL-COVERAGE rule: the reason given is that hiding it at
  // saturation "removes the only cue on the day the reflex risk peaks". It is an argument
  // about the TOP of the range, and read as covering the bottom too it produces two
  // strings the design authority does not draw — *Counted across the 0 of the last 28
  // days you answered* on a card that has never been answered, and, at three answered
  // days, that line stacked on *Looks build up over time · 3 days answered so far* saying
  // the same number twice. Mock §06 draws the day-3 card as the calibration line ALONE,
  // and the sibling footer struck this exact string below the same floor on a written
  // safety rationale (`lib/lookCoverage.ts`) — so a line Home refuses would be one tap
  // away, which is the T-20 failure in the other direction.
  //
  // So: at or above the floor the line always prints, saturation included (§7's actual
  // argument, kept). Below it the calibration line speaks for the coverage instead, and
  // says the same number once. Found by the product read (CUL-874); flagged to the PM as
  // a departure from the issue's literal "at every coverage".
  const coverageLine = belowFloor ? null : noticedCoverageLine(answered, LOOK_COVERAGE_WINDOW_DAYS);

  return {
    coverageLine,
    rows,
    withheldLine: null,
    withheldSpanLine: null,
    calibrationLine,
    // Two or more counted rows is where the sum becomes tempting and wrong.
    multiSelectNote: rows.length >= 2 ? NOTICED_MULTI_SELECT_NOTE : null,
    empty: rows.length === 0,
    pairing,
    wordDaysInWindow,
  };
}

/** The withheld row's date clause. Always year-stamped: the withheld card prints no
 *  window at all, so there is no band for a bare date to sit inside (C-19). */
function firstMarkedClause(firstDay: string): string | null {
  const dated = lookDatedWithYear(firstDay);
  return dated ? `first marked ${dated}` : null;
}

