// EN-4's floor (CUL-1134, Engines v3 PR-28). Every fixture's boundary is derived from the
// shipped constants, never restated (C-34), and the "property" cases sweep offsets across
// each window so a boundary moved by one step goes red.
import {
  FLOOR_BURST_MINUTES,
  FLOOR_LETHARGY_HOURS,
  FLOOR_MERGE_MINUTES,
  FLOOR_PAIR_HOURS,
  FLOOR_SPAN_HOURS,
  FLOOR_YOUNG_MONTHS,
  ageInMonths,
  incidentFloor,
  vomitOnsets,
  type FloorInput,
  type FloorVomit,
} from './incidentFloor';

const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.parse('2026-08-05T12:00:00.000Z');
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();
const v = (offsetMs: number, confidence: string | null = 'witnessed'): FloorVomit => ({ at: at(offsetMs), confidence });
// An adult with a birthday on file, so T7 stays out of the way unless a case asks for it.
const ADULT = '2020-01-01';

function run(p: Partial<FloorInput> & { anchor: FloorVomit }): ReturnType<typeof incidentFloor> {
  return incidentFloor({ vomits: [p.anchor], lethargyAt: [], species: 'cat', birthDate: ADULT, ...p });
}

describe('incidentFloor: the photoless triple (the issue\'s headline case)', () => {
  it('a cat vomiting three times in four hours, no photos, is call now', () => {
    const vomits = [v(0), v(2 * H), v(FLOOR_SPAN_HOURS * H)];
    for (const anchor of vomits) {
      const r = run({ anchor, vomits });
      expect(r.tier).toBe('call_now');
      expect(r.rows).toContain('T2');
      expect(r.counts.span).toBe(3);
    }
  });

  it('three onsets spread one minute wider than the span are not T2', () => {
    const vomits = [v(0), v(2 * H), v(FLOOR_SPAN_HOURS * H + MIN)];
    expect(run({ anchor: vomits[1], vomits }).rows).not.toContain('T2');
  });

  it('three logs inside 30 minutes are call now (T1) even though they merge into one onset', () => {
    const vomits = [v(0), v(10 * MIN), v(FLOOR_BURST_MINUTES * MIN)];
    const r = run({ anchor: vomits[0], vomits });
    expect(r.rows).toContain('T1');
    expect(r.rows).not.toContain('T2');
    expect(r.tier).toBe('call_now');
  });
});

describe('incidentFloor: counting (GAP-10)', () => {
  it('witnessed logs merge within 30 minutes of the onset and never chain', () => {
    // A dog retching every ten minutes for an hour: seven logs, and the merge must NOT fold
    // them into one onset (the symptomEpisodes chaining defect).
    const vomits = Array.from({ length: 7 }, (_, i) => v(i * 10 * MIN));
    const onsets = new Set(vomitOnsets(vomits).map((o) => o.onset));
    // 0 opens; 10, 20 and 30 join it (within FLOOR_MERGE_MINUTES of 0); 40 is past it and
    // opens its own, which 50 and 60 join. A chaining collapse would give one onset.
    expect(FLOOR_MERGE_MINUTES).toBe(30);
    expect([...onsets]).toEqual([T0, T0 + 40 * MIN]);
  });

  it('estimated and unclassified logs never merge; each is its own onset', () => {
    const vomits = [v(0, 'estimated'), v(5 * MIN, null), v(10 * MIN, 'estimated')];
    expect(new Set(vomitOnsets(vomits).map((o) => o.onset)).size).toBe(3);
  });

  it('the found pair: two piles found together are never onsets, so no call now', () => {
    const vomits = [v(0, 'window'), v(MIN, 'window')];
    const r = run({ anchor: vomits[0], vomits });
    expect(r.rows).not.toContain('T1');
    expect(r.rows).not.toContain('T2');
    // an adult cat's two found piles earn nothing louder than today's rule here
    expect(r.tier).toBeNull();
  });

  it('a found pile beside two witnessed onsets does not make a third onset', () => {
    const vomits = [v(0), v(2 * H), v(3 * H, 'window')];
    for (const anchor of vomits) expect(run({ anchor, vomits }).rows).not.toContain('T2');
  });

  it('the late-logged found vomit: a pile logged hours later still counts toward the day rungs', () => {
    // Found at 20:00, two earlier witnessed vomits the same day. For a dog that is T6.
    const vomits = [v(0), v(20 * H, 'window')];
    const r = run({ anchor: vomits[1], vomits, species: 'dog' });
    expect(r.rows).toContain('T6');
    expect(r.tier).toBe('call_today');
    // and the witnessed vomit's own read, run again later, sees the found pile too
    expect(run({ anchor: vomits[0], vomits, species: 'dog' }).rows).toContain('T6');
  });
});

describe('incidentFloor: T3, vomiting with lethargy', () => {
  it('fires for lethargy anywhere within 24 h either side, and not one minute outside', () => {
    const anchor = v(0);
    for (const off of [-FLOOR_LETHARGY_HOURS * H, -H, 0, 5 * H, FLOOR_LETHARGY_HOURS * H]) {
      expect(run({ anchor, lethargyAt: [at(off)] }).rows).toEqual(['T3']);
    }
    for (const off of [-FLOOR_LETHARGY_HOURS * H - MIN, FLOOR_LETHARGY_HOURS * H + MIN]) {
      expect(run({ anchor, lethargyAt: [at(off)] }).rows).toEqual([]);
    }
  });

  it('is call now for species other too (T26)', () => {
    expect(run({ anchor: v(0), lethargyAt: [at(H)], species: 'other' }).tier).toBe('call_now');
  });
});

describe('incidentFloor: dogs and young animals', () => {
  it('T6: a dog with two vomits in 24 h is call today; a cat with the same record is not', () => {
    const vomits = [v(0), v(FLOOR_PAIR_HOURS * H)];
    expect(run({ anchor: vomits[0], vomits, species: 'dog' }).rows).toEqual(['T6']);
    expect(run({ anchor: vomits[0], vomits, species: 'cat' }).rows).toEqual([]);
    const apart = [v(0), v(FLOOR_PAIR_HOURS * H + MIN)];
    expect(run({ anchor: apart[0], vomits: apart, species: 'dog' }).rows).toEqual([]);
  });

  it('T7: under six months is call today on two in 24 h; at six months it is not', () => {
    const vomits = [v(0), v(10 * H)];
    const young = new Date(T0);
    young.setUTCMonth(young.getUTCMonth() - (FLOOR_YOUNG_MONTHS - 1));
    const grown = new Date(T0);
    grown.setUTCMonth(grown.getUTCMonth() - FLOOR_YOUNG_MONTHS);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    expect(run({ anchor: vomits[0], vomits, birthDate: iso(young) }).rows).toEqual(['T7']);
    expect(run({ anchor: vomits[0], vomits, birthDate: iso(grown) }).rows).toEqual([]);
  });

  it('T7: no birthday on file reads the pet as young, and says so', () => {
    const vomits = [v(0), v(10 * H)];
    const r = run({ anchor: vomits[0], vomits, birthDate: null });
    expect(r.rows).toEqual(['T7']);
    expect(r.ageUnknown).toBe(true);
    expect(run({ anchor: v(0), birthDate: null }).ageUnknown).toBe(false);
  });

  it('ageInMonths counts whole months and refuses what it cannot read', () => {
    expect(ageInMonths('2026-02-05', Date.parse('2026-08-05T00:00:00Z'))).toBe(6);
    expect(ageInMonths('2026-02-06', Date.parse('2026-08-05T00:00:00Z'))).toBe(5);
    expect(ageInMonths(null, T0)).toBeNull();
    expect(ageInMonths('not a date', T0)).toBeNull();
  });
});

describe('incidentFloor: T8, vomiting three days running', () => {
  it('fires wherever the anchor sits among the three spans', () => {
    const days = [v(-50 * H), v(-25 * H), v(0)];
    for (const anchor of days) expect(run({ anchor, vomits: days }).rows).toContain('T8');
  });

  it('three calendar evenings, 23:00, 22:00, 23:30: the run need not start at a log (adversarial D1)', () => {
    // Mon 23:00, Tue 22:00, Wed 23:30: gaps of 23 h and 25.5 h.
    const mon = v(-(23 + 25.5) * H);
    const tue = v(-25.5 * H);
    const wed = v(0);
    for (const anchor of [mon, tue, wed]) expect(run({ anchor, vomits: [mon, tue, wed] }).rows).toContain('T8');
  });

  it('a gap day breaks the run', () => {
    const days = [v(-3 * 24 * H + H), v(-24 * H + H), v(0)];
    for (const anchor of days) expect(run({ anchor, vomits: days }).rows).not.toContain('T8');
  });

  it('the anchor must sit inside the run: a vomit a day after it does not borrow it', () => {
    const days = [v(-2 * 24 * H), v(-24 * H), v(-1)];
    expect(run({ anchor: v(3 * 24 * H), vomits: [...days, v(3 * 24 * H)] }).rows).not.toContain('T8');
  });
});

describe('incidentFloor: shape', () => {
  it('is raise-only: a lone vomit meets no row and names no tier', () => {
    expect(run({ anchor: v(0) })).toEqual({ tier: null, rows: [], counts: { burst: 1, span: 1, pair: 1 }, ageUnknown: false });
  });

  it('an unparseable anchor meets nothing', () => {
    expect(run({ anchor: { at: 'nope', confidence: 'witnessed' }, lethargyAt: [at(0)] }).tier).toBeNull();
  });

  it('counts the anchor once whether or not the caller\'s read included it', () => {
    const others = [v(H), v(2 * H)];
    const without = run({ anchor: v(0), vomits: others });
    const withIt = run({ anchor: v(0), vomits: [v(0), ...others] });
    expect(without).toEqual(withIt);
    expect(withIt.rows).toContain('T2');
  });

  it('parses instants: +00:00 and Z spell one moment (C-40)', () => {
    const plus = { at: at(0).replace('.000Z', '+00:00'), confidence: 'witnessed' };
    const r = run({ anchor: v(0), vomits: [plus, v(H), v(2 * H)] });
    expect(r.counts.span).toBe(3);
  });
});
