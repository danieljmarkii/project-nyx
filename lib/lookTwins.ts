// The clinical twins — CUL-845 gate 2, and the ONE direction this map may run
// (CUL-874 / N-5).
//
// docs/nyx-daily-look-requirements.md §3.6 (R10, the link struck), §8 rule 12; CUL-845
// gate 2 ("no owner-facing surface may print a ZERO for a leaf whose look-word twin is
// non-zero in the same window").
//
// ── WHAT THIS IS, AND WHAT IT IS EMPHATICALLY NOT ────────────────────────────
// `constants/lookWords.ts` says, correctly: "There is no map from a look word to a
// symptom leaf (R10): the `Leaf` column of §4.2 / §4.3 is documentation for the report
// and for CUL-845, never runtime." This file is the narrow exception CUL-845 gate 2
// creates, and the exception is DIRECTIONAL:
//
//   MAY:     remove a zero. Nothing else.
//   MAY NOT: produce a count, contribute a numerator or a denominator to any surface,
//            write a row, reach `generate-signal`, reach Ask, or add a look to a symptom
//            tile's number.
//
// R10 and T-5 survive intact under that rule, because SUPPRESSION carries no information
// from the look into the engine's arithmetic — it only stops the app asserting something
// the owner's own words contradict. A map that could also ADD would be the L-9 link
// returning through a side door, with the second adversarial pass's finding still live:
// `itch` sits in every lane cell including the comparison gate, whose failure direction is
// reassurance, so a prompted itch row makes the engine MORE confident vomiting is
// improving.
//
// ── WHY A ZERO IS THE THING WORTH SUPPRESSING ────────────────────────────────
// An owner taps *Scratching more* on 30 of 40 answered days and never opens the + menu to
// log an `itch` row. Patterns then draws an `Itch/Scratch · 0` card — "reassurance by
// absence", produced by the boundary rather than by the record. `components/home/
// TrendZone.tsx` already refuses a zero count line for exactly this reason; CUL-845 gate 2
// generalises the shipped rule to the case it was written for. The whole CARD goes rather
// than just its number: its delta line ("5 fewer than last month") is the same claim in
// another grammar, and the leaf's history stays one tap away in the metric detail.
//
// ── AND WHY THE MEMBERSHIP DECISION IS NOT IN `guards/symptomLists.test.ts` ──
// Registration there is a SKIP (C-32): a registered file stops being scanned, so
// registering this one would exempt the twin map from the very scan that must catch a
// symptom leaf appearing where it should not. The per-leaf decision lives in the §13a
// membership walk (`constants/eventTypes.membership.test.ts`) as set-equality over the
// shipped constant, which is where a membership decision belongs.

import { SYMPTOM_TYPES } from '../constants/eventTypes';
import { LOOK_WORDS } from '../constants/lookWords';

/**
 * Symptom leaf → the look words an owner may be using INSTEAD of logging it.
 *
 * Only pairs where the two name the same observable. The pairs, and why each:
 *
 *   • `itch` ↔ `scratching_more` — the same act, one tapped and one logged. CUL-845's
 *     worked case.
 *   • `lethargy` ↔ `subdued`, `sleeping_more` — the low-energy pair. TWO words, because
 *     the vocabulary split what the leaf keeps together: *Off* (flat, not getting up for
 *     the things he usually does) and *Sleeping more* are both the leaf's territory and
 *     an owner will reach for whichever fits her morning.
 *
 * NOT paired, deliberately, and each absence is a decision rather than an omission:
 *   • `overgrooming` — licking or chewing ONE SPOT is a distinct sign from generalised
 *     itch; a vet reads them apart, so the app must not fold one into the other.
 *   • `vomit`, `diarrhea` — no look word names either (T-3/§4.1 rule 8 keep the bowl and
 *     the tray on the record path), so there is nothing to pair.
 *   • `cough`, `sneeze` — W1 leaves with no look word in the v1 vocabulary.
 *   • `outside_box` — a `check_in` word for a found accident; the record's own leaf for
 *     it is a stool/urination row, not a symptom leaf on this list.
 *
 * Frozen with the vocabulary (`LOOK_VOCAB_VERSION` 1). A new look word does not join a
 * leaf here without Dr. Chen, for the same reason a new word does not join the
 * vocabulary without one.
 */
export const LOOK_LEAF_TWINS: Readonly<Record<string, readonly string[]>> = {
  itch: ['scratching_more'],
  lethargy: ['subdued', 'sleeping_more'],
};

/**
 * Would printing a ZERO for this leaf contradict the owner's own words?
 *
 * `lookWordDays` is the per-word answered-day count over the SAME window the zero is
 * being printed for — the caller's, because the caller owns the window and this module
 * must not grow a second opinion about what "in the window" means (C-3).
 *
 * Returns false for every leaf with no twin, which is most of them, and false when the
 * twin's count is zero too — a zero beside a zero is not a disagreement, it is two
 * silences, and suppressing it would hide an honest fact.
 */
export function leafZeroContradictsLooks(
  leaf: string,
  lookWordDays: ReadonlyMap<string, number>,
): boolean {
  const twins = LOOK_LEAF_TWINS[leaf];
  if (!twins) return false;
  return twins.some((word) => (lookWordDays.get(word) ?? 0) > 0);
}

/** Every leaf key this map names — for the membership walk's set-equality read, so the
 *  decision is enumerated rather than inferred from the object literal. */
export const LOOK_TWIN_LEAVES: readonly string[] = Object.keys(LOOK_LEAF_TWINS);

/** Every look word this map names, likewise. */
export const LOOK_TWIN_WORDS: readonly string[] = Object.values(LOOK_LEAF_TWINS).flat();

/** Both halves of the map are real keys — a typo here would silently disable the gate
 *  (a leaf that never matches, a word whose count is always zero), which is the failure
 *  mode a map of two literal sets has. Checked at module load rather than only in a test,
 *  because the cost is one pass over four strings and the alternative is a gate that
 *  looks present and is not. */
export function twinMapKeysAreReal(): boolean {
  const words = new Set<string>();
  for (const list of Object.values(LOOK_WORDS)) for (const w of list) words.add(w.key);
  return (
    LOOK_TWIN_LEAVES.every((leaf) => (SYMPTOM_TYPES as ReadonlySet<string>).has(leaf)) &&
    LOOK_TWIN_WORDS.every((word) => words.has(word))
  );
}
