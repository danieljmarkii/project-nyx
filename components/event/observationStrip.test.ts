import { observationStripLine, STRIP_NAMED_MAX } from './observationStrip';

describe('observationStripLine (CUL-803 §5.3)', () => {
  it('reproduces the round-2 mock line: three named, all counted', () => {
    expect(observationStripLine(['Yellow', 'Foamy', 'Bile', 'None visible']))
      .toEqual({ named: 'Yellow, foamy, bile', count: '4 findings' });
  });

  it('the count counts the SAME population the list draws from (C-3)', () => {
    // The load-bearing property: naming a subset is honest only while the number beside
    // it describes the rows the subset came out of. Six rows, three named, six counted.
    const values = ['Liquid', 'Tan', 'None visible', 'Some', 'Type 6', 'Possible'];
    const line = observationStripLine(values)!;
    expect(line.count).toBe('6 findings');
    expect(line.named.split(', ')).toHaveLength(STRIP_NAMED_MAX);
  });

  it('keeps the two halves APART, so the renderer can pin one and shrink the other', () => {
    // Returning one joined string is what would force the count to share a truncation
    // fate with the values. The count is the half that must survive (C-3 / C-8).
    const line = observationStripLine(['Yellow', 'Foamy', 'Bile', 'None visible'])!;
    expect(line.count).not.toContain('Yellow');
    expect(line.named).not.toMatch(/finding/);
  });

  it('names every value when there are fewer than the cap, and still counts them', () => {
    expect(observationStripLine(['Brown', 'Liquid'])).toEqual({ named: 'Brown, liquid', count: '2 findings' });
  });

  it('singularises a lone finding', () => {
    expect(observationStripLine(['Streaks'])).toEqual({ named: 'Streaks', count: '1 finding' });
  });

  it('ignores blank and whitespace-only values in BOTH halves', () => {
    // A blank that counted but could never be named would inflate the number against a
    // list that cannot grow to meet it.
    expect(observationStripLine(['Yellow', '   ', 'Bile', ''])).toEqual({ named: 'Yellow, bile', count: '2 findings' });
  });

  it('returns null for nothing to say — a strip is never drawn over an empty grid', () => {
    expect(observationStripLine([])).toBeNull();
    expect(observationStripLine(['', '  '])).toBeNull();
  });

  it('lowers only the leading character, never the rest of the value', () => {
    expect(observationStripLine(['Tan', 'Type 6 — mushy'])!.named).toBe('Tan, type 6 — mushy');
  });
});
