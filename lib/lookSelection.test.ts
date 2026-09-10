import { toggleLookWord, energyPoleOpposites, ENERGY_POLE_KEYS, polesAreRealWords } from './lookSelection';
import { LOOK_WORDS } from '../constants/lookWords';

// CUL-869 / N-3. T-14's one opposition, and the far larger set of pairs it does NOT
// govern — which is most of what these tests are for.

describe('toggleLookWord — the energy poles clear each other (T-14)', () => {
  it('Lively clears Off and Sleeping more', () => {
    expect(toggleLookWord(['subdued', 'sleeping_more'], 'lively')).toEqual(['lively']);
  });

  it('…and back: Off clears Lively', () => {
    expect(toggleLookWord(['lively'], 'subdued')).toEqual(['subdued']);
  });

  it('Sleeping more clears Lively too — both keys of the low pole, not just the first', () => {
    expect(toggleLookWord(['lively'], 'sleeping_more')).toEqual(['sleeping_more']);
  });

  it('clears ONLY the opposite pole — a word on neither survives', () => {
    expect(toggleLookWord(['subdued', 'lip_licking'], 'lively')).toEqual(['lip_licking', 'lively']);
  });

  it('the two low-pole keys coexist — they are the same pole, not opposites', () => {
    expect(toggleLookWord(['subdued'], 'sleeping_more')).toEqual(['subdued', 'sleeping_more']);
  });
});

describe('toggleLookWord — what T-14 does NOT say', () => {
  // The tempting generalisation is "a positive clears the concerns". It is wrong,
  // and getting it wrong deletes words the owner chose. These pin the narrowness.
  it.each([
    ['full_walk', 'lip_licking', 'a dog can do the whole walk and still lip-lick'],
    ['played', 'hiding', 'a cat can play and also hide from the other cat'],
    ['full_walk', 'limping', 'a limp on a completed walk is exactly what a vet wants'],
    ['lively', 'restless', 'restless is not the low end of the energy axis'],
    ['lively', 'walk_refused', 'lively at home and refusing the walk is one real morning'],
  ])('%s does not clear %s — %s', (added, existing) => {
    expect(toggleLookWord([existing], added)).toEqual([existing, added]);
  });

  it('restless and restless_night sit on no pole at all', () => {
    expect(energyPoleOpposites('restless')).toBeNull();
    expect(energyPoleOpposites('restless_night')).toBeNull();
  });
});

describe('toggleLookWord — the ordinary toggle behaviour', () => {
  it('de-selects a chosen word and leaves the order of the rest', () => {
    expect(toggleLookWord(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('appends rather than sorting — the words travel up in the order chosen (§3.1a)', () => {
    expect(toggleLookWord(['zebra'], 'apple')).toEqual(['zebra', 'apple']);
  });

  it('a cleared pole does NOT come back on a second toggle — she never re-chose it', () => {
    const afterLively = toggleLookWord(['subdued'], 'lively');
    expect(afterLively).toEqual(['lively']);
    expect(toggleLookWord(afterLively, 'lively')).toEqual([]);
  });

  it('never mutates its input', () => {
    const before = ['subdued'];
    toggleLookWord(before, 'lively');
    expect(before).toEqual(['subdued']);
  });
});

describe('the pole keys are real words', () => {
  it('every pole key exists in BOTH species’ vocabularies', () => {
    // A typo here would silently stop clearing anything: `toggleLookWord` would
    // still run, the opposite would just never match. This is the assertion that
    // makes the rule's existence observable.
    expect(polesAreRealWords()).toBe(true);
  });

  it('names them explicitly, so a vocabulary change that retires one reds this', () => {
    expect([...ENERGY_POLE_KEYS].sort()).toEqual(['lively', 'sleeping_more', 'subdued']);
    for (const key of ENERGY_POLE_KEYS) {
      expect(LOOK_WORDS.dog.some((w) => w.key === key)).toBe(true);
      expect(LOOK_WORDS.cat.some((w) => w.key === key)).toBe(true);
    }
  });

  it('the poles are exactly the Energy-group words T-14 names, and no other', () => {
    // The high pole is the Energy positive; the low pole is the two Energy concerns
    // T-14 names. `restless` / `restless_night` / `walk_refused` are Energy-group
    // concerns that are deliberately NOT poles — pinned here so a future reading of
    // "the energy poles" as "the Energy group" reds rather than silently widening.
    const dogEnergy = LOOK_WORDS.dog.filter((w) => w.group === 'Energy').map((w) => w.key);
    expect(dogEnergy).toEqual(
      expect.arrayContaining(['restless', 'restless_night', 'walk_refused']),
    );
    for (const key of ['restless', 'restless_night', 'walk_refused']) {
      expect(ENERGY_POLE_KEYS).not.toContain(key);
    }
  });
});
