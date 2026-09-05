import { observationStripLine, STRIP_NAMED_MAX } from './observationStrip';

describe('observationStripLine (CUL-803 §5.3)', () => {
  it('reproduces the round-2 mock line: three named, all counted', () => {
    expect(observationStripLine(['Yellow', 'Foamy', 'Bile', 'None visible']))
      .toBe('Yellow, foamy, bile · 4 findings');
  });

  it('the count counts the SAME population the list draws from (C-3)', () => {
    // The load-bearing property: naming a subset is honest only while the number beside
    // it describes the rows the subset came out of. Six rows, three named, six counted.
    const values = ['Liquid', 'Tan', 'None visible', 'Some', 'Type 6', 'Possible'];
    const line = observationStripLine(values)!;
    expect(line.endsWith('· 6 findings')).toBe(true);
    expect(line.split(' · ')[0].split(', ')).toHaveLength(STRIP_NAMED_MAX);
  });

  it('names every value when there are fewer than the cap, and still counts them', () => {
    expect(observationStripLine(['Brown', 'Liquid'])).toBe('Brown, liquid · 2 findings');
  });

  it('singularises a lone finding', () => {
    expect(observationStripLine(['Streaks'])).toBe('Streaks · 1 finding');
  });

  it('ignores blank and whitespace-only values in BOTH halves', () => {
    // A blank that counted but could never be named would inflate the number against a
    // list that cannot grow to meet it.
    expect(observationStripLine(['Yellow', '   ', 'Bile', ''])).toBe('Yellow, bile · 2 findings');
  });

  it('returns null for nothing to say — a strip is never drawn over an empty grid', () => {
    expect(observationStripLine([])).toBeNull();
    expect(observationStripLine(['', '  '])).toBeNull();
  });

  it('lowers only the leading character, never the rest of the value', () => {
    expect(observationStripLine(['Tan', 'Type 6 — mushy'])).toBe('Tan, type 6 — mushy · 2 findings');
  });
});
