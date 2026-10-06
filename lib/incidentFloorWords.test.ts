// The floor's words (CUL-1510). The load-bearing block is the first: every watch-for clause
// is driven through the REAL floor (`lib/incidentFloor.ts`) with the trigger its sentence
// names, and the floor must answer at least the tier the sentence promises (spec §3, BRK-3).
// Fixtures are built from LOCAL components, so the suite means the same thing in every
// zone the non-UTC CI job runs (B-514), and the dates sit in June, clear of any DST change.
import { incidentFloor, type FloorVomit } from './incidentFloor';
import {
  CALL_TODAY_NO_WAIT,
  bloatLine,
  callFromRecordOnly,
  callTodayAction,
  clockWords,
  modelMadeCall,
  deadlineWords,
  floorRanOn,
  pastWords,
  stoolFindings,
  tellThem,
  vomitFindings,
  watchForClauses,
  watchForList,
  type WatchForInput,
} from './incidentFloorWords';

const MIN = 60_000;
const HOUR = 3_600_000;
const local = (d: number, h: number, m = 0) => new Date(2026, 5, d, h, m).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const RANK = { call_today: 1, call_now: 2 } as const;
const rankOf = (t: 'call_now' | 'call_today' | null) => (t ? RANK[t] : 0);

function input(over: Partial<WatchForInput> & { anchorMs: number; nowMs?: number }): WatchForInput {
  const anchor: FloorVomit = { at: iso(over.anchorMs), confidence: over.anchor?.confidence ?? 'witnessed' };
  return {
    petName: 'Mochi',
    species: 'cat',
    birthDate: '2020-01-01',
    vomits: [anchor],
    nowMs: over.anchorMs + 5 * MIN,
    ...over,
    anchor,
  };
}

// A tiny seeded generator, so a failure names a reproducible case.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('every clause names a tier the real floor gives (BRK-3)', () => {
  it('T2: two more vomits, more than half an hour apart, by the named time → call now', () => {
    const r = rng(2);
    for (let i = 0; i < 400; i++) {
      const a = local(10, 20, Math.floor(r() * 60));
      const confidences = ['witnessed', 'estimated', null] as const;
      // An earlier witnessed log within 30 minutes absorbs the anchor's onset: the clause's
      // deadline must start from that onset, or the third vomit lands outside T2's span.
      const earlier: FloorVomit[] = r() < 0.5 ? [{ at: iso(a - Math.floor(r() * 30) * MIN), confidence: 'witnessed' }] : [];
      const anchor: FloorVomit = { at: iso(a), confidence: 'witnessed' };
      const base = input({ anchorMs: a, vomits: [...earlier, anchor] });
      const clause = watchForClauses(base).find((c) => c.row === 'T2');
      expect(clause?.tier).toBe('call_now');
      // The clause's OWN deadline, never one re-derived here (C-34): the third vomit sits at
      // it half the time, the boundary where a deadline from the wrong instant falls out.
      const deadline = clause?.byMs ?? NaN;
      expect(deadline).toBeGreaterThan(a);
      // Two more, each more than 30 minutes after the last, the second no later than the deadline.
      const b = a + 31 * MIN + Math.floor(r() * 60) * MIN;
      const c = r() < 0.5 ? deadline : Math.min(deadline, b + 31 * MIN + Math.floor(r() * 150) * MIN);
      if (c - b <= 30 * MIN) continue;
      const pick = () => confidences[Math.floor(r() * confidences.length)];
      const vomits = [...base.vomits, { at: iso(b), confidence: pick() }, { at: iso(c), confidence: pick() }];
      const floor = incidentFloor({ anchor, vomits, lethargyAt: [], species: 'cat', birthDate: '2020-01-01' });
      expect(floor.tier).toBe('call_now');
    }
  });

  it('T2 is absent on a found pile, whose own read the floor never raises on onsets', () => {
    const a = local(10, 20);
    const clauses = watchForClauses(input({ anchorMs: a, anchor: { at: iso(a), confidence: 'window' } }));
    expect(clauses.map((c) => c.row)).not.toContain('T2');
  });

  it('T3: low on energy by the named time → call now, at the boundary too', () => {
    const a = local(10, 21);
    const clause = watchForClauses(input({ anchorMs: a })).find((c) => c.row === 'T3');
    expect(clause?.tier).toBe('call_now');
    expect(clause?.text).toBe('Mochi is low on energy by 9 PM tomorrow');
    for (const t of [a + MIN, a + 12 * HOUR, clause?.byMs ?? NaN]) {
      const anchor = { at: iso(a), confidence: 'witnessed' };
      const floor = incidentFloor({ anchor, vomits: [anchor], lethargyAt: [iso(t)], species: 'cat', birthDate: '2020-01-01' });
      expect(floor.tier).toBe('call_now');
    }
  });

  it.each([
    ['T6', 'a dog', 'dog', '2020-01-01'],
    ['T7', 'a three-month-old cat', 'cat', '2026-03-01'],
    ['T7', 'a cat with no birthday', 'cat', null],
  ] as const)('%s (%s): vomits again by the named time → call today, a found pile included', (row, _what, species, birthDate) => {
    const a = local(10, 21);
    const clause = watchForClauses(input({ anchorMs: a, species, birthDate })).find((c) => c.row === row);
    expect(clause?.tier).toBe('call_today');
    expect(clause?.text).toBe('Mochi vomits again by 9 PM tomorrow');
    for (const [t, confidence] of [[a + 31 * MIN, 'window'], [clause?.byMs ?? NaN, 'estimated'], [clause?.byMs ?? NaN, 'window']] as const) {
      const anchor = { at: iso(a), confidence: 'witnessed' };
      const floor = incidentFloor({ anchor, vomits: [anchor, { at: iso(t), confidence }], lethargyAt: [], species, birthDate });
      expect(rankOf(floor.tier)).toBeGreaterThanOrEqual(RANK.call_today);
      expect(floor.rows).toContain(row);
    }
  });

  it('T6/T7 is absent for an adult cat: the floor gives it no pair rung', () => {
    const a = local(10, 21);
    expect(watchForClauses(input({ anchorMs: a })).map((c) => c.row)).not.toContain('T6');
    expect(watchForClauses(input({ anchorMs: a })).map((c) => c.row)).not.toContain('T7');
  });

  it('T8: whatever the clause names, a vomit on each named day meets the real floor, any date of the year (DST weeks included)', () => {
    const r = rng(8);
    let named = 0;
    for (let i = 0; i < 3000; i++) {
      // Any day of 2026, so the run crosses each zone's DST changes on some draws.
      const day0 = new Date(2026, 0, 1 + Math.floor(r() * 365));
      const at = (dayOffset: number) =>
        new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + dayOffset, Math.floor(r() * 24), Math.floor(r() * 60)).getTime();
      const a = at(0);
      const prior: FloorVomit[] = [-2, -1]
        .filter(() => r() < 0.4)
        .map((k) => ({ at: iso(at(k)), confidence: r() < 0.5 ? 'window' : 'witnessed' }));
      const anchor: FloorVomit = { at: iso(a), confidence: 'witnessed' };
      const viewOffset = r() < 0.6 ? 0 : 1;
      const nowMs = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + viewOffset, 23, 59).getTime() - Math.floor(r() * 12) * HOUR;
      if (nowMs < a) continue;
      const base: WatchForInput = { petName: 'Mochi', species: 'cat', birthDate: '2020-01-01', anchor, vomits: [...prior, anchor], nowMs };
      const clause = watchForClauses(base).find((c) => c.row === 'T8');
      if (!clause) continue;
      named++;
      // Read the days the sentence names, relative to the viewing day.
      const viewDay = viewOffset;
      const days =
        /each of the next two days/.test(clause.text) ? [viewDay + 1, viewDay + 2]
        : /today and again tomorrow/.test(clause.text) ? [viewDay, viewDay + 1]
        : /again today$/.test(clause.text) ? [viewDay]
        : /again tomorrow$/.test(clause.text) ? [viewDay + 1]
        : /day after tomorrow$/.test(clause.text) ? [viewDay + 2]
        : null;
      expect(days).not.toBeNull();
      const added = (days ?? []).map((k) => {
        let t = at(k);
        if (k === viewDay && t < nowMs) t = nowMs + MIN; // "today" means later today
        return { at: iso(t), confidence: null };
      });
      const floor = incidentFloor({ anchor, vomits: [...base.vomits, ...added], lethargyAt: [], species: 'cat', birthDate: '2020-01-01' });
      if (!floor.rows.includes('T8')) {
        throw new Error(`T8 missed: ${JSON.stringify({ vomits: [...base.vomits, ...added].map((v) => new Date(v.at).toString()), now: new Date(nowMs).toString(), text: clause.text })}`);
      }
    }
    expect(named).toBeGreaterThan(500);
  });

  it('T8 is never promised across a DST change, where three local days can miss three 24-hour spans (B4)', () => {
    // Every day of 2026 that is not 24 hours long in this zone (none in UTC; the non-UTC
    // CI job and the zones this suite was proven in carry them).
    for (let k = 0; k < 365; k++) {
      const start = new Date(2026, 0, 1 + k).getTime();
      const next = new Date(2026, 0, 2 + k).getTime();
      if (next - start === 24 * HOUR) continue;
      // The adversarial case: 00:05 the day before, 23:55 on the odd day, noon the day after.
      const a = new Date(2026, 0, k, 0, 5).getTime();
      const anchor: FloorVomit = { at: iso(a), confidence: 'witnessed' };
      const clause = watchForClauses({ petName: 'Mochi', species: 'cat', birthDate: '2020-01-01', anchor, vomits: [anchor], nowMs: a + 5 * MIN }).find((c) => c.row === 'T8');
      const vomits = [anchor, { at: iso(new Date(2026, 0, 1 + k, 23, 55).getTime()), confidence: null }, { at: iso(new Date(2026, 0, 2 + k, 12, 0).getTime()), confidence: null }];
      const floor = incidentFloor({ anchor, vomits, lethargyAt: [], species: 'cat', birthDate: '2020-01-01' });
      if (clause) expect(floor.rows).toContain('T8');
    }
  });

  it('T8 counts what is logged: a vomit yesterday means one more tomorrow is enough (B5)', () => {
    const a = local(10, 20);
    const yesterday = { at: iso(local(9, 19)), confidence: 'witnessed' };
    const anchor = { at: iso(a), confidence: 'witnessed' };
    const clause = watchForClauses(input({ anchorMs: a, vomits: [yesterday, anchor] })).find((c) => c.row === 'T8');
    expect(clause?.text).toBe('Mochi vomits again tomorrow');
    const floor = incidentFloor({ anchor, vomits: [yesterday, anchor, { at: iso(local(11, 21)), confidence: null }], lethargyAt: [], species: 'cat', birthDate: '2020-01-01' });
    expect(floor.rows).toContain('T8');
  });

  it('T8 the day after the vomit: today and again tomorrow', () => {
    const a = local(10, 20);
    const clause = watchForClauses(input({ anchorMs: a, nowMs: local(11, 8) })).find((c) => c.row === 'T8');
    expect(clause?.text).toBe('Mochi vomits today and again tomorrow');
  });
});

describe('the watch-for list', () => {
  it('reads as two sentences with their own timeframes, a dog adding the bloat line first', () => {
    const a = local(10, 21);
    const list = watchForList(input({ anchorMs: a, species: 'dog' }));
    expect(list?.emergency).toBe(bloatLine('Mochi'));
    expect(list?.emergency).not.toMatch(/GDV/);
    expect(list?.lines).toEqual([
      'Call your vet now if you see Mochi vomit twice more by 1 AM tomorrow, with more than half an hour between each or Mochi is low on energy by 9 PM tomorrow.',
      'Call your vet today if Mochi vomits again by 9 PM tomorrow or Mochi vomits on each of the next two days.',
    ]);
  });

  it('drops a clause whose window has closed, and draws nothing once every one has', () => {
    const a = local(10, 21);
    const later = watchForList(input({ anchorMs: a, nowMs: a + 5 * HOUR }));
    expect(later?.clauses.map((c) => c.row)).toEqual(['T3', 'T8']);
    expect(watchForList(input({ anchorMs: a, nowMs: local(13, 9) }))).toBeNull();
  });

  it('a dog keeps the bloat line after every window has closed (it has no window)', () => {
    const a = local(10, 21);
    const list = watchForList(input({ anchorMs: a, species: 'dog', nowMs: local(13, 9) }));
    expect(list).toEqual({ emergency: bloatLine('Mochi'), lines: [], clauses: [], ageNote: null });
  });

  it('says so when the young-animal clause is there only because no birthday is on file (§8.11)', () => {
    const a = local(10, 21);
    expect(watchForList(input({ anchorMs: a, birthDate: null }))?.ageNote).toBe(
      "Mochi's birthday isn't on file, so this is read the way it would be for a young animal.",
    );
    expect(watchForList(input({ anchorMs: a, birthDate: '2026-03-01' }))?.ageNote).toBeNull();
  });

  it('never names blood or a meal: neither has a floor row behind it yet', () => {
    const list = watchForList(input({ anchorMs: local(10, 21), species: 'dog', birthDate: null }));
    const text = [list?.emergency, ...(list?.lines ?? [])].join(' ');
    expect(text).not.toMatch(/blood|meal|eat/i);
  });

  it('only stands on a row the floor wrote', () => {
    expect(floorRanOn({ engine_flags: ['engines_v3_en3', 'engines_v3_en4'] })).toBe(true);
    expect(floorRanOn({ engine_flags: '["engines_v3_en4"]' })).toBe(true);
    expect(floorRanOn({ engine_flags: ['engines_v3_en3'] })).toBe(false);
    expect(floorRanOn({ engine_flags: null })).toBe(false);
    expect(floorRanOn(null)).toBe(false);
  });
});

describe("call today's action line (§2 rule 1)", () => {
  const signs = 'Mochi vomits three times within a few hours, or vomits and is low on energy';

  it('by day: the spec line, leave to wait only beside the call-now signs', () => {
    expect(callTodayAction({ petName: 'Mochi', nowMs: local(10, 14), recordOnly: true })).toBe(
      `Call your vet today. If they're closed, first thing tomorrow, or an emergency clinic tonight if ${signs}.`,
    );
  });

  it('late in the day it resolves to first thing tomorrow, the signs still the exception', () => {
    expect(callTodayAction({ petName: 'Mochi', nowMs: local(10, 21), recordOnly: true })).toBe(
      `Call your vet tonight if they're open, or first thing tomorrow. Call an emergency clinic tonight if ${signs}.`,
    );
    expect(callTodayAction({ petName: 'Mochi', nowMs: local(10, 3), recordOnly: true })).toBe(
      `Call your vet first thing this morning. Call an emergency clinic now if ${signs}.`,
    );
  });

  it('never gives leave to wait over a call the record alone did not raise', () => {
    for (const h of [3, 14, 21]) {
      expect(callTodayAction({ petName: 'Mochi', nowMs: local(10, h), recordOnly: false })).toBe(CALL_TODAY_NO_WAIT);
    }
  });

  it('record-only: the floor ran, allow-listed flags only, no visual flag, no photo finding, no model call', () => {
    const ok = { kind: 'vomit' as const, floorRan: true, contextual_flags: ['repeated_vomiting'], visual_flags: [], photoFinding: false, modelCall: false };
    expect(callFromRecordOnly(ok)).toBe(true);
    expect(callFromRecordOnly({ ...ok, floorRan: false })).toBe(false);
    expect(callFromRecordOnly({ ...ok, visual_flags: ['blood'] })).toBe(false);
    expect(callFromRecordOnly({ ...ok, photoFinding: true })).toBe(false);
    expect(callFromRecordOnly({ ...ok, modelCall: true })).toBe(false);
    // Lethargy already logged is half of a call-now sign: the exception must never be met (B1).
    expect(callFromRecordOnly({ ...ok, contextual_flags: ['repeated_vomiting', 'concurrent_lethargy'] })).toBe(false);
    expect(callFromRecordOnly({ ...ok, kind: 'stool', contextual_flags: ['concurrent_vomiting', 'concurrent_lethargy'] })).toBe(false);
    expect(callFromRecordOnly({ ...ok, kind: 'stool', contextual_flags: ['concurrent_vomiting'] })).toBe(true);
    // A flag this build does not know, and unknown lists, keep no leave to wait.
    expect(callFromRecordOnly({ ...ok, contextual_flags: ['something_new'] })).toBe(false);
    expect(callFromRecordOnly({ ...ok, contextual_flags: [] })).toBe(false);
    expect(callFromRecordOnly({ ...ok, visual_flags: null })).toBe(false);
    expect(callFromRecordOnly({ ...ok, contextual_flags: undefined })).toBe(false);
  });

  it("the model's own call is read from the payload; a photo with no verdict counts as one", () => {
    expect(modelMadeCall('worth_a_call', true)).toBe(true);
    expect(modelMadeCall('monitor', true)).toBe(false);
    expect(modelMadeCall('not_enough_to_say', true)).toBe(false);
    expect(modelMadeCall('a_value_from_later', true)).toBe(true);
    expect(modelMadeCall(undefined, true)).toBe(true);
    expect(modelMadeCall(undefined, false)).toBe(false);
  });

  it('the signs it names are call now on the real floor (T2, T3)', () => {
    const a = local(10, 14);
    const anchor = { at: iso(a), confidence: 'witnessed' };
    const three = [anchor, { at: iso(a + 40 * MIN), confidence: 'witnessed' }, { at: iso(a + 80 * MIN), confidence: 'witnessed' }];
    expect(incidentFloor({ anchor, vomits: three, lethargyAt: [], species: 'cat', birthDate: '2020-01-01' }).tier).toBe('call_now');
    expect(incidentFloor({ anchor, vomits: [anchor], lethargyAt: [iso(a + HOUR)], species: 'cat', birthDate: '2020-01-01' }).tier).toBe('call_now');
  });
});

describe('what to tell them (§2 rule 2)', () => {
  it('a vomit: the count and span, the photo finding, the courses', () => {
    const a = local(11, 3, 12);
    const vomits = [
      { at: iso(local(10, 23, 40)), confidence: 'witnessed' },
      { at: iso(local(11, 1, 5)), confidence: 'witnessed' },
      { at: iso(a), confidence: 'witnessed' },
    ];
    expect(
      tellThem({
        petName: 'Mochi',
        kind: 'vomit',
        anchor: vomits[2],
        vomits,
        findings: vomitFindings({ blood_present: 'coffee_ground', foreign_material_present: 'no' }),
        courses: ['prednisone'],
        nowMs: local(11, 3, 30),
      }),
    ).toBe(
      '3 vomits logged from 11:40 PM yesterday to 3:12 AM; dark, gritty material in the photo that can be digested blood; on prednisone.',
    );
  });

  it('one vomit, found, with nothing seen and no course', () => {
    const a = local(11, 7, 2);
    const anchor = { at: iso(a), confidence: 'window' };
    expect(
      tellThem({ petName: 'Mochi', kind: 'vomit', anchor, vomits: [anchor], findings: [], courses: [], nowMs: local(11, 9) }),
    ).toBe('A vomit found at 7:02 AM.');
  });

  it('a stool: its time, the vomits beside it, what the photo shows', () => {
    const a = local(11, 9, 15);
    expect(
      tellThem({
        petName: 'Mochi',
        kind: 'stool',
        anchor: { at: iso(a), confidence: 'witnessed' },
        vomits: [{ at: iso(local(11, 6)), confidence: 'witnessed' }],
        findings: stoolFindings({ stool_consistency: 'type_7_watery', stool_blood_present: 'yes', stool_blood_type: 'fresh_red' }),
        courses: [],
        nowMs: local(11, 10),
      }),
    ).toBe('Stool logged at 9:15 AM; 1 vomit logged within a day of it; watery stool and fresh red blood in the photo.');
  });

  it('says a finding only when it is present: never "none", never model free text', () => {
    expect(vomitFindings({ blood_present: 'none_visible', foreign_material_present: 'no' })).toEqual([]);
    expect(vomitFindings({ blood_present: 'unsure', foreign_material_present: 'unsure' })).toEqual([]);
    expect(stoolFindings({ stool_blood_present: 'no', stool_mucus_present: 'no', stool_consistency: 'type_4_smooth_soft' })).toEqual([]);
    // The enum readers take no free-text field at all: `foreign_material_note`,
    // `description` and `read_text` cannot reach the line (Pattern 10).
    const row = { blood_present: 'fresh_red', foreign_material_present: 'yes', foreign_material_note: 'a hair tie', description: 'x' };
    expect(vomitFindings(row).join(' ')).not.toMatch(/hair tie|x$/);
  });
});

describe('clock words', () => {
  it('names hours, and the day when it is not today', () => {
    expect(clockWords(new Date(local(10, 21)))).toBe('9 PM');
    expect(clockWords(new Date(local(10, 0, 5)))).toBe('12:05 AM');
    expect(deadlineWords(local(10, 23), local(10, 21))).toBe('11 PM');
    expect(deadlineWords(local(11, 1, 30), local(10, 21))).toBe('1:30 AM tomorrow');
    expect(pastWords(local(9, 8), local(10, 21))).toBe('8 AM yesterday');
    expect(pastWords(local(7, 8), local(10, 21))).toBe('Jun 7, 8 AM');
  });
});

describe('no line asserts wellness (clinical-guardrails Pattern 1)', () => {
  const REASSURANCE = /\b(fine|okay|ok|healthy|well|normal|nothing to worry|no concern|all clear|probably|don[’']t worry|doing great|picky|safe)\b/i;
  it('holds over every template', () => {
    const a = local(10, 21);
    const lines = [
      ...(watchForList(input({ anchorMs: a, species: 'dog', birthDate: null }))?.lines ?? []),
      bloatLine('Mochi'),
      callTodayAction({ petName: 'Mochi', nowMs: local(10, 14), recordOnly: true }),
      callTodayAction({ petName: 'Mochi', nowMs: local(10, 21), recordOnly: true }),
      callTodayAction({ petName: 'Mochi', nowMs: local(10, 3), recordOnly: true }),
      CALL_TODAY_NO_WAIT,
    ];
    for (const line of lines) expect(line).not.toMatch(REASSURANCE);
    for (const line of lines) expect(line).not.toMatch(/!/);
  });
});
