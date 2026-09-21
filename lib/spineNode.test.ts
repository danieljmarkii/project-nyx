// lib/spineNode.ts — the spine's node model (D2-4 / CUL-1066).
//
// The five fixtures the issue names, as far as a pure model can carry them: the
// ten-event day (six nodes; the two vomits timed by the lane at 3 and 4 minutes), the
// quiet day (nothing), the safety day (a `worth_a_call` read in words, no image anywhere
// in the model), plus the read's states and the never-reassure line. The reduced-motion
// and VoiceOver fixtures are the renderer's (components/designV2/home/*.test.tsx).
//
// TIMEZONE HONESTY (C-29): instants are offsets from one UTC anchor; timing is a
// difference of instants; the clock STRINGS on a node come from `describeDayEvent` and
// follow the runner's zone, so the assertions below read structure and the timing line,
// never a clock string (those are pinned in `timeRangeLabel`'s own tests as literals).

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import {
  buildSpine,
  countLine,
  nodeReadOf,
  timeRangeLabel,
  timingLine,
  type SpineAnalysisRow,
  type SpineEventInput,
  type SpineInput,
} from './spineNode';
import { DEFAULT_MEAL_TIMING_CONFIG } from './mealTiming';

const BASE = Date.parse('2026-09-17T05:00:00Z');
const MIN = 60_000;
const at = (h: number, m: number): number => BASE + (h * 60 + m) * MIN;
const iso = (h: number, m: number): string => new Date(at(h, m)).toISOString();

function row(id: string, event_type: string, h: number, m: number, extra: Partial<SpineEventInput> = {}): SpineEventInput {
  return {
    id,
    pet_id: 'p1',
    event_type,
    occurred_at: iso(h, m),
    occurred_at_confidence: 'witnessed',
    ...extra,
  };
}

const PR = { food_brand: 'Royal Canin', food_product_name: 'Selected Protein PR', food_type: 'meal' };

/** The real Sep 17 shape, newest-first as the store hands it over. */
const SEP_17: SpineEventInput[] = [
  row('m7', 'meal', 22, 39, PR),
  row('m6', 'meal', 17, 39, PR),
  row('v2', 'vomit', 17, 11),
  row('c1', 'cough', 17, 9),
  row('m5', 'meal', 17, 7, PR),
  row('m4', 'meal', 15, 2, PR),
  row('m3', 'meal', 12, 41, PR),
  row('v1', 'vomit', 10, 58),
  row('m2', 'meal', 10, 55, PR),
  row('m1', 'meal', 5, 47, PR),
  // A look today — the header's, never a node and never counted (T-5).
  row('lk', 'check_in', 17, 14),
];

const feedingsOf = (rows: readonly SpineEventInput[]) =>
  rows
    .filter((r) => r.event_type === 'meal')
    .map((r) => ({ ms: Date.parse(r.occurred_at), confidence: 'witnessed' as const, form: 'Royal Canin Selected Protein PR' }));

function input(over: Partial<SpineInput> = {}): SpineInput {
  return {
    rows: SEP_17,
    photographed: new Set(['v1', 'v2']),
    analysis: new Map(),
    working: new Set(),
    feedings: feedingsOf(SEP_17),
    freeFedSpans: [],
    ...over,
  };
}

const landed = (event_id: string, recommendation: string | null, status = 'completed', read_text: string | null = null): SpineAnalysisRow => ({
  event_id, status, recommendation, read_text, dismissed_at: null,
});

describe('buildSpine — the ten-event day', () => {
  it('renders ten events as six nodes, in the day’s order, the look excluded', () => {
    const model = buildSpine(input());
    expect(model.nodes.map((n) => (n.kind === 'compact' ? n.ids : n.id))).toEqual([
      ['m1', 'm2'], 'v1', ['m3', 'm4', 'm5'], 'c1', 'v2', ['m6', 'm7'],
    ]);
  });

  it('the count line is the day’s own population: 10 logged, the recap’s chips in the recap’s order', () => {
    const model = buildSpine(input());
    expect(model.total).toBe(10);
    expect(countLine(model)).toBe('10 logged · 2 vomits · 1 cough · 7 meals');
  });

  it('a vomit node states minutes after eating FROM THE LANE — 3 and 4 minutes, exactly', () => {
    const model = buildSpine(input());
    const v1 = model.nodes.find((n) => n.id === 'v1');
    const v2 = model.nodes.find((n) => n.id === 'v2');
    expect(v1?.kind === 'event' && v1.timing).toBe('3 min after eating');
    expect(v2?.kind === 'event' && v2.timing).toBe('4 min after eating');
  });

  it('a cough is never timed (the lane times vomiting only), and carries no read', () => {
    const c1 = buildSpine(input()).nodes.find((n) => n.id === 'c1');
    expect(c1?.kind === 'event' && c1.timing).toBeNull();
    expect(c1?.kind === 'event' && c1.read).toEqual({ state: 'none' });
  });

  it('a compact node names its count, the shared food and the range; its rows read type-first', () => {
    const model = buildSpine(input());
    const afternoon = model.nodes[2];
    if (afternoon.kind !== 'compact') throw new Error('expected a compact node');
    expect(afternoon.count).toBe(3);
    expect(afternoon.title).toBe('3 meals');
    expect(afternoon.detail).toBe('Royal Canin · Selected Protein PR');
    expect(afternoon.timeRange).toContain(' – ');
    expect(afternoon.rows.map((r) => r.title)).toEqual(['Meal', 'Meal', 'Meal']);
    expect(afternoon.rows[0].detail).toBe('Royal Canin · Selected Protein PR');
  });

  it('a compact node over different foods names no food', () => {
    const rows = [
      row('a', 'meal', 8, 0, PR),
      row('b', 'meal', 9, 0, { food_product_name: 'Whitefish', food_type: 'meal' }),
    ];
    const model = buildSpine(input({ rows, feedings: feedingsOf(rows), photographed: new Set() }));
    expect(model.nodes[0].kind === 'compact' && model.nodes[0].detail).toBeNull();
  });

  it('a run of treats is "N treats"', () => {
    const rows = [
      row('a', 'meal', 8, 0, { food_product_name: 'Temptations', food_type: 'treat' }),
      row('b', 'meal', 9, 0, { food_product_name: 'Temptations', food_type: 'treat' }),
    ];
    const model = buildSpine(input({ rows, feedings: [], photographed: new Set() }));
    expect(model.nodes[0].kind === 'compact' && model.nodes[0].title).toBe('2 treats');
  });

  it('treats and a meal in one run are TWO lines, never "3 meals" (F3 — the trial contaminant stays visible)', () => {
    const rows = [
      row('t1', 'meal', 8, 0, { food_product_name: 'Temptations', food_type: 'treat' }),
      row('t2', 'meal', 8, 5, { food_product_name: 'Temptations', food_type: 'treat' }),
      row('m1', 'meal', 9, 0, PR),
    ];
    const model = buildSpine(input({ rows, feedings: [], photographed: new Set() }));
    expect(model.nodes.map((n) => (n.kind === 'compact' ? n.title : n.title))).toEqual(['2 treats', 'Meal']);
  });

  it('a row with an unparseable instant is dropped, never drawn at the epoch (F6 — the door drops it too)', () => {
    const rows = [row('m', 'meal', 8, 0, PR), { ...row('x', 'vomit', 9, 0), occurred_at: 'not a date' }];
    const model = buildSpine(input({ rows, feedings: [], photographed: new Set() }));
    expect(model.total).toBe(1);
    expect(model.nodes.map((n) => n.id)).toEqual(['m']);
  });

  it('the photographed vomits carry the glyph fact; the meals do not', () => {
    const model = buildSpine(input());
    const v1 = model.nodes.find((n) => n.id === 'v1');
    expect(v1?.kind === 'event' && v1.photo).toBe(true);
    const morning = model.nodes[0];
    expect(morning.kind === 'compact' && morning.rows.every((r) => !r.photo)).toBe(true);
  });
});

describe('buildSpine — the timing is the lane’s, never imputed', () => {
  it('a discovered (not witnessed) vomit gets nothing', () => {
    const rows = [row('m', 'meal', 8, 0, PR), row('v', 'vomit', 8, 10, { occurred_at_confidence: 'estimated' })];
    const v = buildSpine(input({ rows, feedings: feedingsOf(rows), photographed: new Set() })).nodes.find((n) => n.id === 'v');
    expect(v?.kind === 'event' && v.timing).toBeNull();
  });

  it('a vomit with no preceding feeding in the lookback gets nothing', () => {
    const rows = [row('v', 'vomit', 8, 10)];
    const v = buildSpine(input({ rows, feedings: [], photographed: new Set() })).nodes[0];
    expect(v.kind === 'event' && v.timing).toBeNull();
  });

  it('a free-fed span over the onset gets nothing', () => {
    const rows = [row('m', 'meal', 8, 0, PR), row('v', 'vomit', 8, 10)];
    const spans = [{ fromMs: at(0, 0), untilMs: at(23, 59) }];
    const v = buildSpine(input({ rows, feedings: feedingsOf(rows), freeFedSpans: spans, photographed: new Set() })).nodes.find((n) => n.id === 'v');
    expect(v?.kind === 'event' && v.timing).toBeNull();
  });

  it('a second vomit inside the lane’s episode gap is the SAME episode — only the opener is timed', () => {
    // The lane collapses two rows twenty minutes apart into one episode and times the
    // first; the second is not on the lane, so it is not timed here either.
    const rows = [row('m', 'meal', 8, 0, PR), row('v1', 'vomit', 8, 3), row('v2', 'vomit', 8, 23)];
    const model = buildSpine(input({ rows, feedings: feedingsOf(rows), photographed: new Set() }));
    const v1 = model.nodes.find((n) => n.id === 'v1');
    const v2 = model.nodes.find((n) => n.id === 'v2');
    expect(v1?.kind === 'event' && v1.timing).toBe('3 min after eating');
    expect(v2?.kind === 'event' && v2.timing).toBeNull();
    expect(DEFAULT_MEAL_TIMING_CONFIG.episodeGapHours).toBeGreaterThan(20 / 60);
  });

  it('yesterday’s bowl times a 6 AM vomit — the feedings are the caller’s lookback, not today’s rows', () => {
    const rows = [row('v', 'vomit', 6, 0)];
    const lastNight = [{ ms: at(4, 30), confidence: 'witnessed' as const, form: null }];
    const v = buildSpine(input({ rows, feedings: lastNight, photographed: new Set() })).nodes[0];
    expect(v.kind === 'event' && v.timing).toBe('1 h 30 min after eating');
  });

  it('a bout that straddles midnight is ONE episode, as it is on the lane — the 00:30 row gets nothing (F2)', () => {
    // Supper 22:00, vomit 23:00 (yesterday), vomit 00:30 (today). The lane collapses the
    // two into one episode opened at 23:00 and times it at 60 min; Home's first draft
    // windowed before collapsing and printed "2 h 30 min after eating" on the 00:30 row —
    // a number the lane never computed. The prior onset is the caller's (the read reaches
    // back by the episode gap), and an episode it opens is the lane's, not this row's.
    const rows = [row('v', 'vomit', 0, 30)];
    const supper = [{ ms: at(-2, 0), confidence: 'witnessed' as const, form: null }];
    const prior = [{ ms: at(-1, 0), confidence: 'witnessed' as const }];
    const v = buildSpine(input({ rows, feedings: supper, priorOnsets: prior, photographed: new Set() })).nodes[0];
    expect(v.kind === 'event' && v.timing).toBeNull();
    // Without the prior onset the same row IS an episode opener, timed in the mid band.
    const alone = buildSpine(input({ rows, feedings: supper, priorOnsets: [], photographed: new Set() })).nodes[0];
    expect(alone.kind === 'event' && alone.timing).toBe('2 h 30 min after eating');
  });

  it('the LONG band speaks the lane’s band label, never "12 h after eating" off an unlogged dinner (F8)', () => {
    const rows = [row('v', 'vomit', 20, 0)];
    const breakfastOnly = [{ ms: at(8, 0), confidence: 'witnessed' as const, form: null }];
    const v = buildSpine(input({ rows, feedings: breakfastOnly, photographed: new Set() })).nodes[0];
    expect(v.kind === 'event' && v.timing).toBe('6h or more after eating');
  });
});

describe('timingLine', () => {
  it('speaks minutes under an hour, hours above, and a remainder of five or more', () => {
    expect(timingLine(3, 'rapid')).toBe('3 min after eating');
    expect(timingLine(59.4, 'mid')).toBe('59 min after eating');
    expect(timingLine(120, 'mid')).toBe('2 h after eating');
    expect(timingLine(124, 'mid')).toBe('2 h after eating');
    expect(timingLine(140, 'mid')).toBe('2 h 20 min after eating');
    expect(timingLine(-1, 'rapid')).toBe('0 min after eating');
  });
  it('the long band is the lane\u2019s label, whatever the number', () => {
    expect(timingLine(360, 'long')).toBe('6h or more after eating');
    expect(timingLine(1440, 'long')).toBe('6h or more after eating');
  });
});

describe('timeRangeLabel', () => {
  it('writes a shared meridiem once, on the later time', () => {
    expect(timeRangeLabel('12:41 PM', '5:07 PM')).toBe('12:41 – 5:07 PM');
    expect(timeRangeLabel('5:47 AM', '10:55 AM')).toBe('5:47 – 10:55 AM');
  });
  it('keeps both when they differ, or when a member is approximate', () => {
    expect(timeRangeLabel('10:55 AM', '12:41 PM')).toBe('10:55 AM – 12:41 PM');
    expect(timeRangeLabel('~12:41 PM', '5:07 PM')).toBe('~12:41 – 5:07 PM');
    expect(timeRangeLabel('by 12:41 PM', '17:07')).toBe('by 12:41 PM – 17:07');
  });
});

describe('the read on a node — nodeReadOf', () => {
  it('no row and nothing working: the node says nothing', () => {
    expect(nodeReadOf(undefined, false)).toEqual({ state: 'none' });
  });
  it('no row but the server was asked: pending (C-30 — the working fact, not the box)', () => {
    expect(nodeReadOf(undefined, true)).toEqual({ state: 'pending' });
  });
  it('a pending row is pending whether or not this runtime asked', () => {
    expect(nodeReadOf(landed('v', null, 'pending'), false)).toEqual({ state: 'pending' });
  });
  it('a landed monitor reads in the shipped words, in the quiet tone, with its sentence', () => {
    expect(nodeReadOf(landed('v', 'monitor', 'completed', 'Second one today.'), false)).toEqual({
      state: 'landed', verdict: 'monitor', label: 'Keep an eye out', tone: 'quiet', readText: 'Second one today.',
    });
  });
  it('a landed worth_a_call reads in the rose (attention) tone', () => {
    const r = nodeReadOf(landed('v', 'worth_a_call'), false);
    expect(r.state === 'landed' && r.tone).toBe('attn');
    expect(r.state === 'landed' && r.label).toBe('Worth a call');
  });
  it('not_enough_to_say is the muted tone', () => {
    const r = nodeReadOf(landed('v', 'not_enough_to_say', 'uncertain'), false);
    expect(r.state === 'landed' && r.tone).toBe('muted');
    expect(r.state === 'landed' && r.label).toBe('Not enough to say yet');
  });
  it('an escalation SURVIVES a failed or capped row — escalate on presence', () => {
    for (const status of ['failed', 'capped', 'read_disabled']) {
      const r = nodeReadOf(landed('v', 'worth_a_call', status), false);
      expect(r.state).toBe('landed');
      expect(r.state === 'landed' && r.tone).toBe('attn');
    }
  });
  it('a failed / capped row with no recommendation says NOTHING — absence is never wellness', () => {
    for (const status of ['failed', 'capped', 'read_disabled']) {
      expect(nodeReadOf(landed('v', null, status), false)).toEqual({ state: 'none' });
    }
  });
  it('a calm verdict on a failed row does not render calm (only completed / uncertain may)', () => {
    // A 'monitor' left on a row whose status later became 'failed' is not a read that
    // stands; the escalation branch is the only one that outlives a failure.
    expect(nodeReadOf(landed('v', 'monitor', 'failed'), false)).toEqual({ state: 'none' });
  });
  it('a read the owner hid on the record is hidden here too', () => {
    expect(nodeReadOf({ ...landed('v', 'worth_a_call'), dismissed_at: '2026-09-17T20:00:00Z' }, false)).toEqual({ state: 'none' });
  });
  it('an unknown recommendation fails toward the rose, never toward calm', () => {
    const r = nodeReadOf(landed('v', 'looks_fine_to_me'), false);
    expect(r.state === 'landed' && r.tone).toBe('attn');
  });
  it('a read the record holds attaches to its SYMPTOM row even when the local photo fact is missing (F5 — a lagging attachment read never hides an escalation)', () => {
    const model = buildSpine(input({ photographed: new Set(), analysis: new Map([['v1', landed('v1', 'worth_a_call')]]) }));
    const v1 = model.nodes.find((n) => n.id === 'v1');
    expect(v1?.kind === 'event' && v1.read).toMatchObject({ state: 'landed', tone: 'attn' });
    expect(v1?.kind === 'event' && v1.photo).toBe(false);
  });

  it('a read never attaches to a MEAL, whatever the map holds', () => {
    const model = buildSpine(input({ analysis: new Map([['m1', landed('m1', 'worth_a_call')]]), working: new Set(['m2']) }));
    const morning = model.nodes[0];
    expect(morning.kind === 'compact' && morning.rows.every((r) => r.read.state === 'none')).toBe(true);
  });
});

describe('the safety day and the quiet day', () => {
  it('safety: the worth-a-call read is words on the node, and no image exists anywhere in the model', () => {
    const model = buildSpine(input({ analysis: new Map([['v2', landed('v2', 'worth_a_call', 'completed', 'Streaks of red in tonight’s photo are worth a call to your vet today.')]]) }));
    const v2 = model.nodes.find((n) => n.id === 'v2');
    expect(v2?.kind === 'event' && v2.read).toMatchObject({ state: 'landed', label: 'Worth a call', tone: 'attn' });
    // No node carries a URI, a path or an image of any kind — the model has no field for one.
    const serialized = JSON.stringify(model);
    expect(serialized).not.toMatch(/uri|storage_path|local_uri|image/i);
  });

  it('quiet: nothing logged is an empty model with no count line', () => {
    const model = buildSpine(input({ rows: [], feedings: [], photographed: new Set() }));
    expect(model).toEqual({ total: 0, counts: [], nodes: [] });
    expect(countLine(model)).toBeNull();
  });

  it('a day holding only a look is still the quiet day', () => {
    const model = buildSpine(input({ rows: [row('lk', 'check_in', 9, 0)], feedings: [], photographed: new Set() }));
    expect(model.total).toBe(0);
    expect(model.nodes).toEqual([]);
  });
});
