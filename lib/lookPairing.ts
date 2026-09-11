// The same-day pairing — a look word beside the days a vomit was logged
// (CUL-874 / N-5).
//
// docs/nyx-daily-look-requirements.md §6.11, T-17, §7; L-17 as ruled on CUL-849
// (2026-09-11, option (a)).
//
// ── WHAT IT IS, AND WHERE IT MAY APPEAR ──────────────────────────────────────
// *Lip-licking · on 2 of the 3 vomit days you answered · and on 1 of the 20 other days
// you answered · 1 vomit day not answered.* Patterns and the report ONLY (T-17), never
// Home — on Home it would sit one card below a gated finding about the same vomits,
// chosen by the word the owner had just tapped: an uncorrected comparison from a
// twenty-six-word family, beside a lane that pays a Bonferroni correction for the same
// shape.
//
// ── THE UNIT, AND BOTH DENOMINATORS ──────────────────────────────────────────
// The unit is DAYS WITH ≥ 1 VOMIT, never the report's episode count. Both sides count
// ANSWERED days, and that symmetry is the third adversarial pass's correction: the first
// draft's left side counted ALL vomit days while its right side counted answered ones, so
// every unanswered vomit day pushed the association toward null — "didn't log" scored as
// "didn't happen", the reassuring direction, on the exact question a worried owner is
// asking. A vomit day with no look is therefore outside BOTH sides and is always said.
//
// ── THE FOUR FLOORS, EACH FROM A BROKEN DRAFT ────────────────────────────────
//   1. ≥ 3 answered vomit days and ≥ 10 answered other days.
//   2. The left numerator is never 0 and never 1. *0 of the 3 vomit days* is an absence
//      claim at n=3, rendered on the day she was worried enough to tap the word (floor 5,
//      n=1 never reassures); *1 of the 1* is a pattern generator.
//   3. A strictly positive margin only. The fourth pass found a word marked on 2 of 3
//      vomit days and 9 of 10 other days clearing every other floor and printing as a
//      finding — the control fraction was HIGHER and the line still read as a link.
//   4. Concern words only. §6.6 bars a positive from being one half of a two-half
//      comparison and this is one; without the rule *"Played lined up most often with a
//      vomit day"* is reachable. It also shrinks the family the disclosure is correcting
//      for, in the conservative direction.
//
// ── L-17: THE FAMILY CORRECTION IS THE DISCLOSURE, AND IT IS NOT OPTIONAL ────
// Twenty-six words, one comparison each. The PM ruled (a): the owner surface pays its
// correction in WORDS THE READER CAN USE rather than in a Bonferroni-style floor most
// records would never clear — at most ONE pairing per card, the largest positive margin,
// said to be one of several words checked. Never "predicts", never "linked", never a tier.
//
// THE TEAM'S IMPLEMENTATION OF (a), AND WHY IT IS SHAPED THIS WAY: the fraction and the
// disclosure are ONE STRING in ONE FIELD, separated by a newline. Not two fields, not a
// `{ text, disclosure }` pair, not a second helper — because a render path able to emit
// the fraction WITHOUT the sentence is the uncorrected comparison the brief was raised to
// stop, and a second field is exactly that path with a plausible excuse. There is no
// formatted fraction on this module's surface at all: the counts are exported as raw
// numbers for the report and the tests, and the only renderable is `text`.

import { lookWordKind, type LookSpecies } from '../constants/lookWords';
import { answeredDaySet, wordDaySet, type LookDayRow } from './lookDayCounts';

/** §6.11 — answered days holding at least one vomit, below which nothing renders. */
export const LOOK_PAIRING_MIN_VOMIT_DAYS = 3;

/** §6.11 — answered days holding no vomit, the control side's floor. */
export const LOOK_PAIRING_MIN_OTHER_DAYS = 10;

/** §6.11 floor 2 — the left numerator is never 0 and never 1. */
export const LOOK_PAIRING_MIN_MARKED_VOMIT_DAYS = 2;

/** L-17 (a) — the sentence that makes the comparison a corrected one. It ships INSIDE
 *  `text`; it is exported only so a test can assert its presence in every pairing this
 *  module can produce, which is the assertion that keeps (a) honest. */
export const LOOK_PAIRING_DISCLOSURE =
  'Of the words you marked, this one lined up most often with a vomit day.';

export interface LookPairing {
  /** The word key that earned the card's one pairing. */
  word: string;
  /** Answered days holding ≥ 1 vomit — the left denominator. */
  vomitDays: number;
  /** Of those, days the word was marked — the left numerator (≥ 2, always). */
  vomitMarked: number;
  /** Answered days holding no vomit — the right denominator. */
  otherDays: number;
  /** Of those, days the word was marked — the control numerator. */
  otherMarked: number;
  /** Vomit days with no look at all. Outside both sides, always said when non-zero. */
  unansweredVomitDays: number;
  /**
   * THE ONLY RENDERABLE. The fraction, the control fraction, the unanswered-vomit-day
   * clause and the L-17 disclosure, as one string with a line break between the counts
   * and the disclosure. One field on purpose — see the header.
   */
  text: string;
}

export interface LookPairingInput {
  /** Every local day (the looks' own `local_day` keying — T-19) on which a vomit was
   *  logged for this pet, inside the window the card speaks for. Days, never episodes. */
  vomitLocalDays: Iterable<string>;
  /** The pet's species, for the word's kind. */
  species: LookSpecies | null;
  /**
   * The words to check, IN THE CARD'S ROW ORDER. The order is the tie-break when two
   * words share the largest margin: the card's own order is the only ranking the
   * vocabulary does not invent (it carries no severity), and a deterministic tie-break is
   * what stops the one rendered pairing changing between two reads of the same record.
   */
  words: Iterable<string>;
}

/** Pluralise "vomit day" for the unanswered clause. */
function vomitDayNoun(n: number): string {
  return n === 1 ? 'vomit day' : 'vomit days';
}

/**
 * The card's ONE pairing, or null.
 *
 * `record` is every LIVE look row for the pet inside the window the card speaks for
 * (`loadLookDays` has already dropped the soft-deleted ones through the parent, and the
 * caller has already bounded it). Both denominators are derived here from the same
 * `answeredDaySet` every other count on this feature uses, rather than re-counted — the
 * diet-trial §5.3 lesson: two surfaces that re-derive "the same" denominator disagree by
 * one, and here the disagreement would be an association.
 */
export function cardPairing(
  record: readonly LookDayRow[],
  input: LookPairingInput,
): LookPairing | null {
  const answered = answeredDaySet(record);
  const allVomitDays = new Set(input.vomitLocalDays);

  const answeredVomitDays = new Set<string>();
  for (const day of allVomitDays) if (answered.has(day)) answeredVomitDays.add(day);
  const vomitDays = answeredVomitDays.size;
  // The control side is every OTHER answered day — the complement inside the answered
  // set, so the two sides partition it exactly once (C-4) and no day is on both.
  const otherDays = answered.size - vomitDays;
  const unansweredVomitDays = allVomitDays.size - vomitDays;

  if (vomitDays < LOOK_PAIRING_MIN_VOMIT_DAYS) return null;
  if (otherDays < LOOK_PAIRING_MIN_OTHER_DAYS) return null;

  let best: LookPairing | null = null;
  let bestMargin = 0;
  let bestMarked = 0;

  for (const word of input.words) {
    // Concern words only — floor 4, applied before anything is counted so a positive
    // cannot reach a margin at all.
    if (lookWordKind(word, input.species) !== 'concern') continue;

    const marked = wordDaySet(record, word);
    let vomitMarked = 0;
    for (const day of answeredVomitDays) if (marked.has(day)) vomitMarked += 1;
    // The control numerator is the word's answered days that are NOT vomit days —
    // computed from the same two sets rather than from a second scan of the record.
    let otherMarked = 0;
    for (const day of marked) {
      if (!answered.has(day)) continue;
      if (!answeredVomitDays.has(day)) otherMarked += 1;
    }

    if (vomitMarked < LOOK_PAIRING_MIN_MARKED_VOMIT_DAYS) continue;

    // Strictly positive margin, cross-multiplied: vomitMarked/vomitDays > otherMarked/otherDays.
    // Both denominators are the same for every word on this card, so the cross-product is
    // a valid common-denominator ranking as well as the gate — no floats, no ties from
    // rounding.
    const margin = vomitMarked * otherDays - otherMarked * vomitDays;
    if (margin <= 0) continue;

    // Strictly greater keeps the FIRST word in the card's order on a tie (the loop walks
    // that order), which is the documented tie-break. A secondary tie-break on the raw
    // vomit-day numerator is applied first: at equal margins the word seen on more of her
    // bad days is the more useful one to a vet.
    if (margin > bestMargin || (margin === bestMargin && vomitMarked > bestMarked)) {
      bestMargin = margin;
      bestMarked = vomitMarked;
      const unanswered =
        unansweredVomitDays > 0
          ? ` · ${unansweredVomitDays} ${vomitDayNoun(unansweredVomitDays)} not answered`
          : '';
      best = {
        word,
        vomitDays,
        vomitMarked,
        otherDays,
        otherMarked,
        unansweredVomitDays,
        // ONE string. The disclosure is not appended by a caller and cannot be dropped by
        // one — see the header. Both denominators name the act (*you answered*) at full
        // length on both sides: the mock shortens the control half for width, and C-28
        // says a clause squeezed under a length cap loses its "why" first, so the longer
        // form is the one that ships.
        text:
          `on ${vomitMarked} of the ${vomitDays} vomit days you answered` +
          ` · and on ${otherMarked} of the ${otherDays} other days you answered` +
          `${unanswered}.\n${LOOK_PAIRING_DISCLOSURE}`,
      };
    }
  }

  return best;
}
