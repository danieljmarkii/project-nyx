import {
  resolvePetTabLabel,
  estimateLabelWidth,
  clearPetTabLabelCache,
  PET_TAB_FALLBACK_LABEL,
  PET_TAB_SIDE_PADDING,
} from './petTabLabel';

// The ladder's ruled acceptance cases (spec §1 AC / mock round 2 §01 R2-1). These are
// the calibration, not an incidental sample: the character budget exists to reproduce
// them, so if an advance is ever retuned these are what says whether it still can.

// The narrowest supported device, four tabs, flex:1 — an 80pt tab.
const NARROW_TAB = 320 / 4;
// A current mainstream phone (iPhone 14 class), where the ladder should rarely bite.
const TYPICAL_TAB = 390 / 4;

beforeEach(clearPetTabLabelCache);

describe('resolvePetTabLabel — the ruled cases at 320pt', () => {
  it('renders an ordinary name whole at the top rung', () => {
    expect(resolvePetTabLabel('Biscuit', NARROW_TAB)).toEqual({
      text: 'Biscuit',
      fontSize: 11,
      isFallback: false,
    });
  });

  it('drops "Bartholomew" one rung rather than shrinking or cutting it', () => {
    expect(resolvePetTabLabel('Bartholomew', NARROW_TAB)).toEqual({
      text: 'Bartholomew',
      fontSize: 10,
      isFallback: false,
    });
  });

  it('falls back to the word "Pet" for "Schrodingers Cat" — never a cut name', () => {
    const resolved = resolvePetTabLabel('Schrodingers Cat', NARROW_TAB);
    expect(resolved.text).toBe(PET_TAB_FALLBACK_LABEL);
    expect(resolved.isFallback).toBe(true);
    // The rule that makes this the right answer rather than a lesser one: no rung
    // ever emits a prefix of the name.
    expect(resolved.text).not.toContain('Schrod');
  });

  it('never emits an ellipsis — there is no such rung', () => {
    ['Schrodingers Cat', 'Mr. Bartholomew Whiskerson III', 'Bartholomew'].forEach((name) => {
      const { text } = resolvePetTabLabel(name, NARROW_TAB);
      expect(text).not.toMatch(/[…]|\.\.\./);
      // Either the whole name, or the generic word. Never something in between.
      expect(text === name || text === PET_TAB_FALLBACK_LABEL).toBe(true);
    });
  });
});

describe('resolvePetTabLabel — the ladder relaxes on a wider device', () => {
  it('gives "Bartholomew" its top rung back at 390pt', () => {
    expect(resolvePetTabLabel('Bartholomew', TYPICAL_TAB).fontSize).toBe(11);
  });

  it('rescues "Schrodingers Cat" to a real-name rung at 390pt', () => {
    expect(resolvePetTabLabel('Schrodingers Cat', TYPICAL_TAB)).toEqual({
      text: 'Schrodingers Cat',
      fontSize: 10,
      isFallback: false,
    });
  });
});

describe('resolvePetTabLabel — degenerate input', () => {
  it('uses the generic word for an empty or whitespace-only name', () => {
    expect(resolvePetTabLabel('', NARROW_TAB).text).toBe(PET_TAB_FALLBACK_LABEL);
    expect(resolvePetTabLabel('   ', NARROW_TAB).text).toBe(PET_TAB_FALLBACK_LABEL);
  });

  it('uses the generic word before a width is known', () => {
    expect(resolvePetTabLabel('Biscuit', 0).isFallback).toBe(true);
    expect(resolvePetTabLabel('Biscuit', PET_TAB_SIDE_PADDING * 2).isFallback).toBe(true);
  });

  it('trims surrounding whitespace rather than spending it on the budget', () => {
    expect(resolvePetTabLabel('  Biscuit  ', NARROW_TAB).text).toBe('Biscuit');
  });

  it('measures a wide-script name on a square body, so it cannot silently clip', () => {
    // A CJK name is a handful of characters but each is full-width. Guessing Latin
    // advances would call it a comfortable fit and clip it on device.
    expect(estimateLabelWidth('小白小白小白小白', 11)).toBeGreaterThan(
      estimateLabelWidth('abcdefgh', 11),
    );
  });
});

describe('resolvePetTabLabel — determinism and caching', () => {
  it('returns the same rung for the same name and width, cold or cached', () => {
    const first = resolvePetTabLabel('Bartholomew', NARROW_TAB);
    const second = resolvePetTabLabel('Bartholomew', NARROW_TAB);
    expect(second).toEqual(first);
    clearPetTabLabelCache();
    expect(resolvePetTabLabel('Bartholomew', NARROW_TAB)).toEqual(first);
  });

  it('keys the cache on width as well as name', () => {
    expect(resolvePetTabLabel('Schrodingers Cat', NARROW_TAB).isFallback).toBe(true);
    expect(resolvePetTabLabel('Schrodingers Cat', TYPICAL_TAB).isFallback).toBe(false);
  });

  it('never lets a name/width pair collide with another', () => {
    // The key puts the width first precisely so a name containing the separator
    // cannot forge a different pair's entry.
    expect(resolvePetTabLabel('80:Rex', NARROW_TAB).text).toBe('80:Rex');
    expect(resolvePetTabLabel('Rex', NARROW_TAB).text).toBe('Rex');
  });
});

describe('estimateLabelWidth', () => {
  it('grows with the point size', () => {
    expect(estimateLabelWidth('Bartholomew', 11)).toBeGreaterThan(
      estimateLabelWidth('Bartholomew', 10),
    );
  });

  it('charges letter spacing per character, not per em', () => {
    const chars = 'Biscuit'.length;
    expect(estimateLabelWidth('Biscuit', 11, 0.4)).toBeCloseTo(
      estimateLabelWidth('Biscuit', 11) + chars * 0.4,
      5,
    );
  });

  it('is monotonic in length — adding a character never narrows a name', () => {
    let previous = 0;
    'Bartholomew'.split('').forEach((_, i) => {
      const width = estimateLabelWidth('Bartholomew'.slice(0, i + 1), 11);
      expect(width).toBeGreaterThan(previous);
      previous = width;
    });
  });
});
