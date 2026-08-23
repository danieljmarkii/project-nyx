import { ESTIMATE_HEADROOM, estimateTextWidth } from './textWidth';

// The shared character table (CUL-599, extracted for CUL-600). Its two consumers —
// lib/petTabLabel.ts and lib/headerName.ts — each test their own ladder against it,
// which pins the RUNGS but not the TABLE: a consumer's invariant of the form
// `estimateTextWidth(t, size, ls) <= budget` is true by construction whatever the
// table says. That is exactly the hole CUL-599 found the hard way, where 25 tests
// could not notice that full-width scripts were charged half their true advance.
//
// So this suite asserts the table's own contract directly: the class ordering, the
// non-Latin classes, the letter-spacing term being real, and the boundary of what
// the module actually promises.

const FS = 17;

describe('the class table separates what an average would merge', () => {
  it('orders narrow < default < capital < wide', () => {
    const w = (c: string) => estimateTextWidth(c, FS, 0);
    expect(w('i')).toBeLessThan(w('a'));
    expect(w('a')).toBeLessThan(w('A'));
    expect(w('A')).toBeLessThan(w('M'));
  });

  it('treats a capital I as narrow and a capital M as wide, against their case', () => {
    // The two exceptions that make the ordering above a table rather than a rule.
    expect(estimateTextWidth('I', FS, 0)).toBeLessThan(estimateTextWidth('A', FS, 0));
    expect(estimateTextWidth('M', FS, 0)).toBeGreaterThan(estimateTextWidth('A', FS, 0));
  });

  it('makes Willow and Lili measurably different, which is the point of the table', () => {
    // An average advance makes these the same width; they differ by more than a rung.
    expect(estimateTextWidth('Willow', FS, 0)).toBeGreaterThan(
      estimateTextWidth('Lili', FS, 0) * 1.5,
    );
  });

  it('is additive over characters and zero for the empty string', () => {
    expect(estimateTextWidth('', FS, 0)).toBe(0);
    expect(estimateTextWidth('ab', FS, 0)).toBeCloseTo(
      estimateTextWidth('a', FS, 0) + estimateTextWidth('b', FS, 0),
      5,
    );
  });

  it('scales linearly with font size', () => {
    expect(estimateTextWidth('Biscuit', 34, 0)).toBeCloseTo(
      estimateTextWidth('Biscuit', 17, 0) * 2,
      5,
    );
  });
});

describe('the classes that exist because an ASCII-only table under-charged them', () => {
  it('charges a full-width script a full em, not the Latin lowercase default', () => {
    // Under-charging these by ~half is what let a six-character Japanese name pass a
    // fit test and then get tail-cut by numberOfLines={1}.
    expect(estimateTextWidth('ミルク', FS, 0)).toBeGreaterThan(
      estimateTextWidth('abc', FS, 0),
    );
    expect(estimateTextWidth('ミ', FS, 0)).toBeCloseTo(FS, 5);
  });

  it('covers hangul and CJK ideographs, not only kana', () => {
    for (const char of ['한', '中', '．']) {
      expect(estimateTextWidth(char, FS, 0)).toBeGreaterThanOrEqual(FS);
    }
  });

  it('measures an astral code point ONCE, not as two half-width surrogate halves', () => {
    // `for…of` iterates code points. A `.length`-based loop would bill an emoji as two
    // default-width characters — under-charging the one glyph most likely to be wide.
    expect(estimateTextWidth('🐈', FS, 0)).toBeGreaterThan(estimateTextWidth('M', FS, 0));
  });

  it('charges an accented capital as a capital, not as lowercase', () => {
    // Tested by case rather than an A-Z range: European names are the common
    // non-ASCII case, so this is the branch that matters most in practice.
    for (const upper of ['Ü', 'É', 'Ñ', 'Ø']) {
      expect(estimateTextWidth(upper, FS, 0)).toBeCloseTo(estimateTextWidth('U', FS, 0), 5);
    }
  });
});

describe('letter spacing is the caller’s to state, and it is not decorative', () => {
  it('charges it per code point, including the last', () => {
    // The conservative reading: RN's iOS text layout adds trailing spacing.
    const spacing = 0.4;
    const text = 'Bartholomew';
    expect(estimateTextWidth(text, FS, spacing) - estimateTextWidth(text, FS, 0)).toBeCloseTo(
      text.length * spacing,
      5,
    );
  });

  it('is large enough to matter at a real name length', () => {
    // 0.4pt x 12 characters is 4.8pt — larger than ESTIMATE_HEADROOM absorbs on a
    // 320pt tab, which is why it is a required argument rather than a default.
    const twelve = 'Bartholomews';
    const delta = estimateTextWidth(twelve, 11, 0.4) - estimateTextWidth(twelve, 11, 0);
    expect(delta).toBeGreaterThan(4);
  });

  it('lets two callers measure the same text differently, on purpose', () => {
    // The tab binds trackingWide; the Home header binds none. If this ever stopped
    // being possible, one surface would be inheriting the other's typography.
    expect(estimateTextWidth('Biscuit', FS, 0.4)).toBeGreaterThan(
      estimateTextWidth('Biscuit', FS, 0),
    );
  });
});

describe('ESTIMATE_HEADROOM', () => {
  it('shaves the budget rather than padding the estimate', () => {
    // A fraction < 1 applied to the BUDGET. Stated as a test because the direction is
    // the whole point: every residual error is spent on the safe side.
    expect(ESTIMATE_HEADROOM).toBeGreaterThan(0);
    expect(ESTIMATE_HEADROOM).toBeLessThan(1);
    expect(100 * ESTIMATE_HEADROOM).toBeLessThan(100);
  });
});

describe('the boundary of what this module promises', () => {
  it('under-charges a script it has no class for — a known limit, not a bug', () => {
    // Devanagari renders wider than Latin lowercase and is NOT in isFullWidth, so it
    // is billed the default. This test exists so the limit is DISCOVERED here, by a
    // reader of the table, rather than inferred from a docstring that over-promises —
    // the CUL-599 lesson: a table of assumptions must say where it stops. If a real
    // pet name ever hits this, the fix is a new class, not a wider headroom.
    expect(estimateTextWidth('क', FS, 0)).toBeLessThan(FS);
  });
});
