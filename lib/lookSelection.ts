// Toggling a look word — the ONE selection rule, shared by the editor's grid
// (CUL-869 / N-3) and the Home card's (CUL-871 / N-4a).
//
// docs/nyx-daily-look-requirements.md T-14. It exists as its own module for the
// reason the day counts live together in `lib/looks.ts`: two surfaces that let an
// owner choose words must not disagree about which choices can coexist, and the
// only way to guarantee that is for there to be one function.
//
// ── THE RULE, EXACTLY AS RULED ────────────────────────────────────────────────
// T-14: "Within one look the energy poles clear each other (*Lively* clears *Off*
// and *Sleeping more*, and back): one entry cannot say both; a day can."
//
// Note what it is NOT, because the general version is the tempting one and it is
// wrong: this is not "a positive clears the concerns". A dog can plainly have done
// the `full_walk` and also been `lip_licking`, and a cat can have `played` and been
// `hiding` from the other cat — the ruling names ONE opposition, between three
// named keys, because those three are claims about the same axis at the same
// moment. Widening it would silently delete words an owner chose. So the pole sets
// are literal key lists, and a word outside them toggles like any checkbox.
//
// The day is where the contradiction is allowed to live: a *nothing unusual* at
// 7 AM and an *off* at 6 PM is an OFF day (§5.6, `absenceDays`), and *lively* at
// noon beside *off* at nine is two looks, two rows, both true. Only ONE ENTRY is
// constrained, and only here.

import { LOOK_OPENING_CHIP_KEY, LOOK_WORDS, type LookSpecies } from '../constants/lookWords';

/** The high-energy pole. One key, and it is on both species' lists. */
const ENERGY_UP: readonly string[] = ['lively'];

/** The low-energy pole — the two keys T-14 names. `restless` / `restless_night`
 *  are deliberately NOT here: restlessness is not the low end of the same axis
 *  (a restless pet is *not settling*, which can sit beside lively as easily as
 *  beside off), and the ruling does not name them. */
const ENERGY_DOWN: readonly string[] = ['subdued', 'sleeping_more'];

/** The other pole for a key, or null when the key sits on neither. Exported so the
 *  guard can assert the sets against the shipped vocabulary rather than against a
 *  copy of this list. */
export function energyPoleOpposites(key: string): readonly string[] | null {
  if (ENERGY_UP.includes(key)) return ENERGY_DOWN;
  if (ENERGY_DOWN.includes(key)) return ENERGY_UP;
  return null;
}

/** Both poles, for the guard that pins every key in them is a real word of both
 *  species — a typo here would silently stop clearing anything. */
export const ENERGY_POLE_KEYS: readonly string[] = [...ENERGY_UP, ...ENERGY_DOWN];

/**
 * Toggle `key` in `selected`, applying T-14's pole rule.
 *
 * Selection ORDER is preserved (the words travel up "in the order chosen", §3.1a),
 * so this appends rather than re-sorting, and de-selecting leaves the rest where
 * they were. Idempotent in the sense that matters: toggling the same key twice
 * returns a set equal to the original, poles included — a cleared opposite does
 * NOT come back, which is correct, because the owner never re-chose it.
 */
export function toggleLookWord(selected: readonly string[], key: string): string[] {
  if (selected.includes(key)) return selected.filter((k) => k !== key);
  const opposites = energyPoleOpposites(key);
  const kept = opposites ? selected.filter((k) => !opposites.includes(k)) : [...selected];
  return [...kept, key];
}

/** Every pole key is a real key of BOTH species — the invariant the guard proves.
 *  Here rather than in the test so the claim lives beside the lists it is about. */
export function polesAreRealWords(): boolean {
  const species: LookSpecies[] = ['cat', 'dog'];
  return ENERGY_POLE_KEYS.every((key) =>
    species.every((s) => LOOK_WORDS[s].some((w) => w.key === key)),
  );
}

// ── THE OTHER AXIS: THE ABSENCE AND THE WORDS (CUL-871 / N-4a) ────────────────
//
// T-14's pole rule is between two WORDS. This is the rule between the two SHAPES an
// answer can take, and it is the record's rule rather than a design choice: a
// `nothing_unusual` row carries no words and an `observed` row carries at least one
// (`insertLook` throws in both directions, and migration 064's CHECK holds the outcome
// itself). So a card that let both be chosen at once would be building a write the
// write path must refuse.
//
// It lives HERE, beside the pole rule, for the reason this module exists at all: the
// Home card is the first surface where the absence chip and the words sit together,
// and N-3's editor deliberately shows an absence row no grid at all — so when a second
// surface does gain both (the editor's own outcome switch, N-3b's return path), the
// rule it obeys must be this one and not a re-derivation of it.
//
// WHAT IT IS NOT. Neither shape is a verdict on the other, and choosing one is never a
// warning: an owner who has tapped three words and then decides the day was ordinary
// taps *Nothing unusual* and the words go, in one gesture, with no dialog. The
// observed-absence row is a real answer (L-6), not the empty state of the words.

/** The card's whole selection. `empty` is the resting state — nothing pre-selected,
 *  ever (§3.1a) — and it is a state, never an outcome: a look is written from
 *  `absence` or `words`, and `empty` has nothing to write. */
export type LookDraft =
  | { kind: 'empty' }
  | { kind: 'absence' }
  | { kind: 'words'; words: string[] };

/** The resting draft. A function rather than a shared constant so no caller can hold a
 *  reference to a draft another caller is about to compare against. */
export function emptyDraft(): LookDraft {
  return { kind: 'empty' };
}

/** Tap *Nothing unusual*: it takes the answer, or gives it back. Words chosen before
 *  it are cleared — see the header; they cannot coexist. */
export function toggleAbsence(draft: LookDraft): LookDraft {
  return draft.kind === 'absence' ? { kind: 'empty' } : { kind: 'absence' };
}

/** Tap a word: the absence yields to it, and the pole rule applies among the words
 *  (T-14, `toggleLookWord` — never re-implemented here). Deselecting the last word
 *  returns to `empty`, not to a `words` draft with an empty list, so "nothing is
 *  chosen" has exactly one representation. */
export function toggleWordInDraft(draft: LookDraft, key: string): LookDraft {
  const before = draft.kind === 'words' ? draft.words : [];
  const words = toggleLookWord(before, key);
  return words.length === 0 ? { kind: 'empty' } : { kind: 'words', words };
}

/** Is this key chosen? One place, so a chip's rendered state and the write can never
 *  disagree about the same draft. */
export function draftHasWord(draft: LookDraft, key: string): boolean {
  return draft.kind === 'words' && draft.words.includes(key);
}

/**
 * The write `insertLook` takes, or null when there is nothing to write. The one
 * translation from what the owner tapped to what the record holds.
 *
 * IT DROPS THE OPENING CHIP WHEN A WORD FOLLOWS (§3.1a: `not_herself` is "stored alone
 * only when no word follows"). *Not herself* is the chief complaint — what an owner
 * says when she has nothing more specific — so once she does have something specific,
 * it is not a SECOND observation, it is the same one named. Storing both would put
 * "not herself" beside "off, hiding" on the report and in the Patterns pairing as
 * though it were another thing she saw, and it would count as a word in a surface that
 * counts words.
 *
 * The chip stays SELECTED on the card while the grid is open — the owner tapped it and
 * nothing should move under her thumb — so this is a rule about the WRITE, not about
 * the selection, which is why it lives here rather than in the toggles.
 */
export function draftToWrite(
  draft: LookDraft,
): { outcome: 'observed' | 'nothing_unusual'; words: readonly string[] } | null {
  if (draft.kind === 'absence') return { outcome: 'nothing_unusual', words: [] };
  if (draft.kind !== 'words') return null;
  const specific = draft.words.filter((k) => k !== LOOK_OPENING_CHIP_KEY);
  return { outcome: 'observed', words: specific.length > 0 ? specific : draft.words };
}
