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

import { LOOK_WORDS, type LookSpecies } from '../constants/lookWords';

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
