// The clinical twins (CUL-874 / N-5) — CUL-845 gate 2.

import * as lookTwins from './lookTwins';
import {
  leafZeroContradictsLooks,
  twinMapKeysAreReal,
  LOOK_LEAF_TWINS,
  LOOK_TWIN_LEAVES,
  LOOK_TWIN_WORDS,
} from './lookTwins';
import { SYMPTOM_TYPES } from '../constants/eventTypes';
import { LOOK_WORDS } from '../constants/lookWords';

const counts = (entries: [string, number][]) => new Map(entries);

describe('the map is real on both sides', () => {
  it('every leaf is a symptom leaf and every word is a look word', () => {
    // A typo on either side silently DISABLES the gate — a leaf that never matches, or a
    // word whose count is always zero — which is the failure mode of two literal sets
    // that have to agree with two other files.
    expect(twinMapKeysAreReal()).toBe(true);
  });

  it('the leaves are exactly the two CUL-845 names, as a set-equality decision', () => {
    expect(new Set(LOOK_TWIN_LEAVES)).toEqual(new Set(['itch', 'lethargy']));
    for (const leaf of LOOK_TWIN_LEAVES) expect(SYMPTOM_TYPES.has(leaf as never)).toBe(true);
  });

  it('the words are exactly the three the vocabulary pairs with them', () => {
    expect(new Set(LOOK_TWIN_WORDS)).toEqual(
      new Set(['scratching_more', 'subdued', 'sleeping_more']),
    );
  });

  it('each named word exists in BOTH species lists — a shared key is one key (HR-23)', () => {
    for (const word of LOOK_TWIN_WORDS) {
      for (const species of ['cat', 'dog'] as const) {
        expect(LOOK_WORDS[species].some((w) => w.key === word)).toBe(true);
      }
    }
  });

  it('overgrooming is NOT paired with itch — a vet reads one spot and generalised itch apart', () => {
    expect(LOOK_LEAF_TWINS.itch).not.toContain('overgrooming');
  });
});

describe('CUL-845 gate 2 — the suppression', () => {
  it('fires for itch when the owner has been tapping Scratching more', () => {
    expect(leafZeroContradictsLooks('itch', counts([['scratching_more', 30]]))).toBe(true);
  });

  it('fires for lethargy on EITHER of its two words', () => {
    expect(leafZeroContradictsLooks('lethargy', counts([['subdued', 4]]))).toBe(true);
    expect(leafZeroContradictsLooks('lethargy', counts([['sleeping_more', 1]]))).toBe(true);
  });

  it('does not fire when the twin count is zero — a zero beside a zero is two silences', () => {
    expect(leafZeroContradictsLooks('itch', counts([['scratching_more', 0]]))).toBe(false);
    expect(leafZeroContradictsLooks('itch', counts([]))).toBe(false);
  });

  it('does not fire for a leaf with no twin', () => {
    expect(leafZeroContradictsLooks('vomit', counts([['subdued', 30]]))).toBe(false);
    expect(leafZeroContradictsLooks('diarrhea', counts([['scratching_more', 30]]))).toBe(false);
    expect(leafZeroContradictsLooks('cough', counts([['subdued', 30]]))).toBe(false);
  });

  it('does not fire across the pairs — Scratching more says nothing about lethargy', () => {
    expect(leafZeroContradictsLooks('lethargy', counts([['scratching_more', 30]]))).toBe(false);
    expect(leafZeroContradictsLooks('itch', counts([['subdued', 30]]))).toBe(false);
  });
});

describe('the map may only ever SUPPRESS', () => {
  it('exposes no way to turn a look count into a leaf count', () => {
    // The directional rule, encoded. The module's whole surface is: two frozen lists, a
    // boolean, and a self-check. Nothing returns a NUMBER derived from a look, so no
    // caller can add one to a symptom tile, a denominator, or anything the engine reads —
    // R10 and T-5 survive the exception CUL-845 gate 2 creates.
    for (const [name, value] of Object.entries(lookTwins as Record<string, unknown>)) {
      if (typeof value !== 'function') continue;
      const result = (value as (...a: unknown[]) => unknown)('itch', counts([['scratching_more', 30]]));
      expect(typeof result).not.toBe('number');
      expect(name).toMatch(/^(leafZeroContradictsLooks|twinMapKeysAreReal)$/);
    }
  });
});
