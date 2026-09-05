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

// ── The C-3 property, stated as an invariant rather than as examples ──────────
//
// Found by the adversarial pass on the first cut: a row's value can itself be a list
// (`contents` joins its labels with ", "), and joining values with ", " on top of that
// rendered "Yellow, foamy, bile, Foam, Hair · 4 findings" — five items beside a count of
// four, with only a casing seam to give it away. An example list would not have caught
// it, because every example anyone writes uses single-label values.
describe('observationStripLine — the named list never out-counts the count (C-3)', () => {
  const MULTI = ['Yellow', 'Foamy', 'Bile, foam, hair', 'None visible'];

  it('re-separates a multi-label value so it reads as ONE item', () => {
    expect(observationStripLine(MULTI)).toEqual({
      named: 'Yellow, foamy, bile / foam / hair',
      count: '4 findings',
    });
  });

  it('property: the commas in the named half are always (named rows − 1), whatever the values hold', () => {
    // Every shape a real builder can emit: single labels, multi-label lists, values that
    // already carry a slash (`Dark / older blood` is a shipped BLOOD_OPTIONS label), and
    // values containing the word "finding".
    const shapes = [
      ['A'],
      ['A', 'B'],
      ['A, b, c', 'D'],
      ['A, b', 'C, d', 'E, f', 'G, h'],
      ['Dark / older blood', 'A, b', 'C'],
      ['4 findings', 'A, b, c, d, e', 'X', 'Y', 'Z'],
    ];
    for (const values of shapes) {
      const line = observationStripLine(values)!;
      const namedRows = Math.min(values.length, STRIP_NAMED_MAX);
      expect(line.named.split(', ')).toHaveLength(namedRows);
      // …and the count still describes the WHOLE population, not the named subset.
      expect(line.count).toBe(`${values.length} finding${values.length === 1 ? '' : 's'}`);
    }
  });
});
