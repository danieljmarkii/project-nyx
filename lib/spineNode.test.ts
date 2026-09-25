// lib/spineNode.ts — the day's node model (D2-4 / CUL-1066; the row's rules since History
// v2 HV-6 / CUL-1163, spec §3.6).
//
// The fixtures D2-4 named, as far as a pure model can carry them: the ten-event day (the
// two vomits timed by the lane at 3 and 4 minutes, and since HV-6 the two meals they were
// timed from kept as their own rows), the quiet day (nothing), the safety day (the rose,
// no image anywhere in the model), the read's states and the never-reassure line. HV-6
// adds the row's rules as the pure half of AC 16 and AC 18: runs, the product name, the
// dose row, the meal's "with", the time tags, the weight, and the read gate (CUL-1197).
// The reduced-motion and VoiceOver fixtures are the renderer's (components/dayRow/*.test.tsx).
//
// TIMEZONE HONESTY (C-29, B-514): instants are offsets from LOCAL midnight of Sep 17,
// built from local components, because the run rule breaks at the local day (a run never
// crosses midnight) and "the day" must be one local day in every zone the CI runs. Timing
// is a difference of instants; the clock STRINGS on a node come from `describeDayEvent`
// and follow the runner's zone, so the assertions below read structure and the timing
// line, never a clock string (those are pinned in `timeRangeLabel`'s own tests).

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import {
  buildSpine,
  countLine,
  nodeReadOf,
  runFormatsLine,
  timeRangeLabel,
  timingLine,
  timingsByRow,
  type SpineAnalysisRow,
  type SpineEventInput,
  type SpineInput,
} from './spineNode';
import { DEFAULT_MEAL_TIMING_CONFIG, type FeedingInput, type IntakeRating } from './mealTiming';

const BASE = new Date(2026, 8, 17, 0, 0, 0, 0).getTime();
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

// Shaped the way `readFeedingsSince` hands them over: the row's EVENT id and its own rating.
const feedingsOf = (rows: readonly SpineEventInput[]): FeedingInput[] =>
  rows
    .filter((r) => r.event_type === 'meal')
    .map((r) => ({
      id: r.id,
      ms: Date.parse(r.occurred_at),
      confidence: 'witnessed' as const,
      intakeRating: (r.intake_rating as IntakeRating | null | undefined) ?? null,
      form: 'Royal Canin Selected Protein PR',
    }));

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

/** A row of the phone's copy (HV-5): four columns, no words, no hide stamp. */
const landed = (event_id: string, recommendation: string | null, status = 'completed'): SpineAnalysisRow => ({
  event_id, status, recommendation, updated_at: '2026-09-17T12:00:00+00:00',
});

/** Each line as the day reads: a run's ids, or a single id. */
const linesOf = (model: ReturnType<typeof buildSpine>) =>
  model.nodes.map((n) => (n.kind === 'compact' ? n.ids : n.id));

/** Every event node, runs opened. */
const eventsOf = (model: ReturnType<typeof buildSpine>) =>
  model.nodes.flatMap((n) => (n.kind === 'compact' ? n.rows : [n]));

describe('buildSpine — the ten-event day', () => {
  it('renders ten events as eight lines, in the day’s order, the look excluded; each timed meal is its own row', () => {
    // m2 (10:55) is the meal v1 (10:58) was timed from and m5 (17:07) the meal v2 (17:11)
    // was: rule B keeps each on its own line, under the words that name it.
    const model = buildSpine(input());
    expect(linesOf(model)).toEqual(['m1', 'm2', 'v1', ['m3', 'm4'], 'm5', 'c1', 'v2', ['m6', 'm7']]);
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

  it('a compact node names its count, its one product and the range; its rows read type-first (rule K)', () => {
    const model = buildSpine(input());
    const afternoon = model.nodes[3];
    if (afternoon.kind !== 'compact') throw new Error('expected a compact node');
    expect(afternoon.count).toBe(2);
    expect(afternoon.title).toBe('2 meals');
    expect(afternoon.detail).toBe('Royal Canin · Selected Protein PR');
    // No member carries a format tag, so there is no count of formats to speak.
    expect(afternoon.formats).toBeNull();
    expect(afternoon.timeRange).toContain(' – ');
    expect(afternoon.rows.map((r) => r.title)).toEqual(['Meal', 'Meal']);
    expect(afternoon.rows[0].detail).toBe('Royal Canin · Selected Protein PR');
  });

  it('two products are two rows, never a run that names no food (rule B)', () => {
    const rows = [
      row('a', 'meal', 8, 0, PR),
      row('b', 'meal', 9, 0, { food_product_name: 'Whitefish', food_type: 'meal' }),
    ];
    const model = buildSpine(input({ rows, feedings: feedingsOf(rows), photographed: new Set() }));
    expect(linesOf(model)).toEqual(['a', 'b']);
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
    expect(eventsOf(model).filter((n) => n.category === 'meal').every((r) => !r.photo)).toBe(true);
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
    const lastNight = [{ id: 'last-night', ms: at(4, 30), confidence: 'witnessed' as const, intakeRating: null, form: null }];
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
    const supper = [{ id: 'supper', ms: at(-2, 0), confidence: 'witnessed' as const, intakeRating: null, form: null }];
    const prior = [{ ms: at(-1, 0), confidence: 'witnessed' as const }];
    const v = buildSpine(input({ rows, feedings: supper, priorOnsets: prior, photographed: new Set() })).nodes[0];
    expect(v.kind === 'event' && v.timing).toBeNull();
    // Without the prior onset the same row IS an episode opener, timed in the mid band.
    const alone = buildSpine(input({ rows, feedings: supper, priorOnsets: [], photographed: new Set() })).nodes[0];
    expect(alone.kind === 'event' && alone.timing).toBe('2 h 30 min after eating');
  });

  it('the LONG band speaks the lane’s band label, never "12 h after eating" off an unlogged dinner (F8)', () => {
    const rows = [row('v', 'vomit', 20, 0)];
    const breakfastOnly = [{ id: 'breakfast', ms: at(8, 0), confidence: 'witnessed' as const, intakeRating: null, form: null }];
    const v = buildSpine(input({ rows, feedings: breakfastOnly, photographed: new Set() })).nodes[0];
    expect(v.kind === 'event' && v.timing).toBe('6h or more after eating');
  });
});

// ── HV-2 / CUL-1159 + CUL-1122: the line names its meal, and a refused bowl is not eating ──────

describe('timingsByRow — every line names the meal it measured from (HV-2)', () => {
  const cfg = DEFAULT_MEAL_TIMING_CONFIG;

  it('the ten-event day: each timed vomit carries its line AND the meal row it was measured from', () => {
    const lines = timingsByRow(SEP_17, [], feedingsOf(SEP_17), [], cfg);
    expect(Object.fromEntries(lines)).toEqual({
      v1: { text: '3 min after eating', mealId: 'm2' }, // 10:55 meal → 10:58 vomit
      v2: { text: '4 min after eating', mealId: 'm5' }, // 17:07 meal → 17:11 vomit
    });
    // The id is a real meal row of the day, so a surface can find it and keep it its own line.
    for (const line of lines.values()) {
      expect(SEP_17.find((r) => r.id === line.mealId)?.event_type).toBe('meal');
    }
  });

  it('the node shows the same words the map holds — the text did not move', () => {
    const lines = timingsByRow(SEP_17, [], feedingsOf(SEP_17), [], cfg);
    const model = buildSpine(input());
    for (const [id, line] of lines) {
      const node = model.nodes.find((n) => n.id === id);
      expect(node?.kind === 'event' && node.timing).toBe(line.text);
    }
  });

  it('Pixel refuses the 10 PM bowl and vomits at 10:05 — the line measures from the 8 AM meal she ate, never the bowl', () => {
    const rows = [
      row('breakfast', 'meal', 8, 0, PR),
      row('dinner', 'meal', 22, 0, { ...PR, intake_rating: 'refused' }),
      row('v', 'vomit', 22, 5),
    ];
    const lines = timingsByRow(rows, [], feedingsOf(rows), [], cfg);
    expect(lines.get('v')).toEqual({ text: '6h or more after eating', mealId: 'breakfast' });
    const v = buildSpine(input({ rows, feedings: feedingsOf(rows), photographed: new Set() })).nodes.find((n) => n.id === 'v');
    expect(v?.kind === 'event' && v.timing).toBe('6h or more after eating');
    // Before CUL-1122 this row read "5 min after eating".
    expect(v?.kind === 'event' && v.timing).not.toBe('5 min after eating');
  });

  it('Pixel with nothing eaten in the lane’s window — no line at all, never a number off the refused bowl', () => {
    const rows = [row('dinner', 'meal', 22, 0, { ...PR, intake_rating: 'refused' }), row('v', 'vomit', 22, 5)];
    expect(timingsByRow(rows, [], feedingsOf(rows), [], cfg).size).toBe(0);
    const v = buildSpine(input({ rows, feedings: feedingsOf(rows), photographed: new Set() })).nodes.find((n) => n.id === 'v');
    expect(v?.kind === 'event' && v.timing).toBeNull();
  });

  it('a staple dinner at 6 PM, then a refused treat at 9 PM — a 9:10 vomit is 3 h 10 min after dinner, and names dinner', () => {
    const rows = [
      row('dinner', 'meal', 18, 0, { ...PR, intake_rating: 'all' }),
      row('snack', 'meal', 21, 0, { food_brand: 'Acme', food_product_name: 'Treat', food_type: 'treat', intake_rating: 'refused' }),
      row('v', 'vomit', 21, 10),
    ];
    expect(timingsByRow(rows, [], feedingsOf(rows), [], cfg).get('v')).toEqual({
      text: '3 h 10 min after eating',
      mealId: 'dinner',
    });
  });

  it('a picked-at vehicle meal carrying a dose at 1 PM — a 1:10 vomit is 10 min after it, and names the vehicle', () => {
    const rows = [
      row('breakfast', 'meal', 8, 0, PR),
      row('vehicle', 'meal', 13, 0, { ...PR, intake_rating: 'picked' }),
      row('dose', 'medication', 13, 0, { drug_generic_name: 'prednisone', adherence: 'given' }),
      row('v', 'vomit', 13, 10),
    ];
    expect(timingsByRow(rows, [], feedingsOf(rows), [], cfg).get('v')).toEqual({
      text: '10 min after eating',
      mealId: 'vehicle',
    });
  });

  it('keeps its call signature: the five parameters, the same keys, the row that opened the episode', () => {
    expect(timingsByRow.length).toBe(5);
    const rows = [row('m', 'meal', 8, 0, PR), row('v1', 'vomit', 8, 3), row('v2', 'vomit', 8, 23)];
    expect([...timingsByRow(rows, [], feedingsOf(rows), [], cfg).keys()]).toEqual(['v1']);
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
  it('a range with equal ends is one time, never "8:00 – 8:00 PM" (BRK-12)', () => {
    expect(timeRangeLabel('08:00 PM', '08:00 PM')).toBe('08:00 PM');
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
  it('a finished monitor is CALM, and a calm node carries no words at all (§3.6 rule 7: n=1 never reassures)', () => {
    expect(nodeReadOf(landed('v', 'monitor', 'completed'), false)).toEqual({ state: 'calm' });
  });
  it('a landed worth_a_call is the rose, in its own words', () => {
    expect(nodeReadOf(landed('v', 'worth_a_call'), false)).toEqual({ state: 'worth_a_call', label: 'Worth a call' });
  });
  it('an unclear read (not_enough_to_say) is never calm: on a photographed row it is unread (the PM’s 2026-09-25 ruling)', () => {
    const photographedVomit = { eventType: 'vomit', hasPhoto: true };
    expect(nodeReadOf(landed('v', 'not_enough_to_say', 'uncertain'), false, photographedVomit)).toEqual({ state: 'unread' });
    // No photo on this phone (a photoless stool's contextual read): nothing, never "Photo not read" under no photo.
    expect(nodeReadOf(landed('v', 'not_enough_to_say', 'uncertain'), false, { eventType: 'stool_normal', hasPhoto: false })).toEqual({
      state: 'none',
    });
  });
  it('an escalation SURVIVES a failed or capped row — escalate on presence', () => {
    for (const status of ['failed', 'capped', 'read_disabled']) {
      expect(nodeReadOf(landed('v', 'worth_a_call', status), false)).toEqual({ state: 'worth_a_call', label: 'Worth a call' });
    }
  });
  it('a failed / capped row with no recommendation is never calm — absence is never wellness', () => {
    const photographedVomit = { eventType: 'vomit', hasPhoto: true };
    for (const status of ['failed', 'capped', 'read_disabled']) {
      // With the event known, the read that was expected and never landed is UNREAD…
      expect(nodeReadOf(landed('v', null, status), false, photographedVomit)).toEqual({ state: 'unread' });
      // …and a two-argument caller, which cannot tell it from no photo, says nothing.
      expect(nodeReadOf(landed('v', null, status), false)).toEqual({ state: 'none' });
    }
  });
  it('a calm verdict on a failed row does not render calm (only completed / uncertain may)', () => {
    // A 'monitor' left on a row whose status later became 'failed' is not a read that
    // stands; the escalation branch is the only one that outlives a failure.
    expect(nodeReadOf(landed('v', 'monitor', 'failed'), false)).toEqual({ state: 'none' });
    expect(nodeReadOf(landed('v', 'monitor', 'failed'), false, { eventType: 'vomit', hasPhoto: true })).toEqual({
      state: 'unread',
    });
  });
  it('Hide never silences the rose here: the copy has no hide stamp, and one handed in is ignored (H-4a)', () => {
    // The reversal of what this block used to pin (`spineNode.ts:214`): hiding the words
    // on the record dropped "Worth a call" from Home while the month and the Signal
    // screen kept it. Hide hides WORDS.
    const hidden = { ...landed('v', 'worth_a_call'), dismissed_at: '2026-09-17T20:00:00Z' } as unknown as SpineAnalysisRow;
    expect(nodeReadOf(hidden, false)).toEqual({ state: 'worth_a_call', label: 'Worth a call' });
  });
  it('an unknown recommendation fails toward the rose, never toward calm, and is spoken in the rose’s words', () => {
    expect(nodeReadOf(landed('v', 'looks_fine_to_me'), false)).toEqual({ state: 'worth_a_call', label: 'Worth a call' });
  });
  it('a photographed vomit whose read the phone does not hold is UNREAD, never nothing (AC 21, the model half)', () => {
    expect(nodeReadOf(undefined, false, { eventType: 'vomit', hasPhoto: true })).toEqual({ state: 'unread' });
    expect(nodeReadOf(undefined, false, { eventType: 'diarrhea', hasPhoto: true })).toEqual({ state: 'unread' });
    // No read is expected: an unphotographed vomit, a photographed cough.
    expect(nodeReadOf(undefined, false, { eventType: 'vomit', hasPhoto: false })).toEqual({ state: 'none' });
    expect(nodeReadOf(undefined, false, { eventType: 'cough', hasPhoto: true })).toEqual({ state: 'none' });
  });
  it('a read in flight shows the tick over a calm verdict, never over the rose', () => {
    const expect_ = { eventType: 'vomit', hasPhoto: true };
    expect(nodeReadOf(landed('v', 'monitor'), true, expect_)).toEqual({ state: 'pending' });
    expect(nodeReadOf(landed('v', 'worth_a_call'), true, expect_)).toEqual({ state: 'worth_a_call', label: 'Worth a call' });
  });
  it('a read the record holds attaches to its SYMPTOM row even when the local photo fact is missing (F5 — a lagging attachment read never hides an escalation)', () => {
    const model = buildSpine(input({ photographed: new Set(), analysis: new Map([['v1', landed('v1', 'worth_a_call')]]) }));
    const v1 = model.nodes.find((n) => n.id === 'v1');
    expect(v1?.kind === 'event' && v1.read).toEqual({ state: 'worth_a_call', label: 'Worth a call' });
    expect(v1?.kind === 'event' && v1.photo).toBe(false);
  });

  it('buildSpine: a photographed vomit with no read on the phone is unread; one with no photo says nothing', () => {
    // The default day photographs v1 and v2 and the phone holds no read for either.
    const model = buildSpine(input({ photographed: new Set(['v1']) }));
    const v1 = model.nodes.find((n) => n.id === 'v1');
    const v2 = model.nodes.find((n) => n.id === 'v2');
    expect(v1?.kind === 'event' && v1.read).toEqual({ state: 'unread' });
    expect(v2?.kind === 'event' && v2.read).toEqual({ state: 'none' });
  });

  it('buildSpine: Hide never takes the rose off a node', () => {
    const hidden = { ...landed('v2', 'worth_a_call'), dismissed_at: '2026-09-17T20:00:00Z' } as unknown as SpineAnalysisRow;
    const model = buildSpine(input({ analysis: new Map([['v2', hidden]]) }));
    const v2 = model.nodes.find((n) => n.id === 'v2');
    expect(v2?.kind === 'event' && v2.read).toEqual({ state: 'worth_a_call', label: 'Worth a call' });
  });

  it('a read never attaches to a MEAL or a DOSE, whatever the map holds', () => {
    const rows = [...SEP_17, row('d', 'medication', 9, 0, { drug_generic_name: 'Prednisone', adherence: 'given' })];
    const model = buildSpine(
      input({
        rows,
        analysis: new Map([['m1', landed('m1', 'worth_a_call')], ['d', landed('d', 'worth_a_call')]]),
        working: new Set(['m2']),
      }),
    );
    for (const n of eventsOf(model).filter((e) => e.category === 'meal' || e.category === 'medication')) {
      expect(n.read).toEqual({ state: 'none' });
    }
  });

  it('CUL-1197: a photographed normal stool carries its read, whatever its tint — the rose, and unread when none landed', () => {
    const rows = [row('s1', 'stool_normal', 9, 0), row('s2', 'stool_normal', 10, 0)];
    const model = buildSpine(
      input({ rows, feedings: [], photographed: new Set(['s1', 's2']), analysis: new Map([['s1', landed('s1', 'worth_a_call')]]) }),
    );
    const byId = new Map(eventsOf(model).map((n) => [n.id, n]));
    expect(byId.get('s1')?.category).toBe('other');
    expect(byId.get('s1')?.read).toEqual({ state: 'worth_a_call', label: 'Worth a call' });
    expect(byId.get('s2')?.read).toEqual({ state: 'unread' });
  });

  it('a row re-typed after its read landed keeps the rose (the predicate stands it on any type)', () => {
    const rows = [row('c', 'cough', 9, 0)];
    const model = buildSpine(input({ rows, feedings: [], photographed: new Set(), analysis: new Map([['c', landed('c', 'worth_a_call')]]) }));
    expect(eventsOf(model)[0].read).toEqual({ state: 'worth_a_call', label: 'Worth a call' });
  });
});

describe('the safety day and the quiet day', () => {
  it('safety: the worth-a-call read is words on the node, and no image exists anywhere in the model', () => {
    const model = buildSpine(input({ analysis: new Map([['v2', landed('v2', 'worth_a_call', 'completed')]]) }));
    const v2 = model.nodes.find((n) => n.id === 'v2');
    expect(v2?.kind === 'event' && v2.read).toEqual({ state: 'worth_a_call', label: 'Worth a call' });
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

// ── HV-6 / CUL-1163: the row's rules, the pure half (spec §3.6, AC 16, AC 18) ────────────

const DRY = { food_brand: 'Royal Canin', food_product_name: 'Selected Protein PR, Dry', food_type: 'meal', food_format: 'dry_kibble' };
const WET = { food_brand: 'Royal Canin', food_product_name: 'Selected Protein PR, Wet', food_type: 'meal', food_format: 'wet_canned' };

/** A day with no reads, no photos and no lane: only the rows speak. */
const bare = (rows: SpineEventInput[], over: Partial<SpineInput> = {}) =>
  buildSpine(input({ rows, feedings: [], photographed: new Set(), ...over }));

const byIdOf = (model: ReturnType<typeof buildSpine>) => new Map(eventsOf(model).map((n) => [n.id, n]));

describe('rule K — every meal named, and a run names its one product and counts its formats', () => {
  it('wet and dry of one product join, named without the word the tag already says: "4 meals · Royal Canin · Selected Protein PR", "1 wet · 3 dry"', () => {
    const model = bare([row('a', 'meal', 8, 0, DRY), row('b', 'meal', 9, 0, WET), row('c', 'meal', 10, 0, DRY), row('d', 'meal', 11, 0, DRY)]);
    expect(linesOf(model)).toEqual([['a', 'b', 'c', 'd']]);
    const run = model.nodes[0];
    if (run.kind !== 'compact') throw new Error('expected a run');
    expect(run.title).toBe('4 meals');
    expect(run.detail).toBe('Royal Canin · Selected Protein PR');
    expect(run.formats).toBe('1 wet · 3 dry');
  });

  it('a run of one format says so: "all dry"', () => {
    const model = bare([row('a', 'meal', 8, 0, DRY), row('b', 'meal', 9, 0, DRY)]);
    expect(model.nodes[0].kind === 'compact' && model.nodes[0].formats).toBe('all dry');
  });

  it('a single meal reads "Meal · Royal Canin · Selected Protein PR" beside its DRY tag, never "…, Dry  DRY"', () => {
    const [meal] = eventsOf(bare([row('a', 'meal', 8, 0, DRY)]));
    expect(meal).toMatchObject({ title: 'Meal', detail: 'Royal Canin · Selected Protein PR', formatTag: 'DRY' });
  });

  it('a name whose trailing word disagrees with its recorded format keeps it: the record is shown, not corrected', () => {
    const [meal] = eventsOf(bare([row('a', 'meal', 8, 0, { ...WET, food_format: 'dry_kibble' })]));
    expect(meal).toMatchObject({ detail: 'Royal Canin · Selected Protein PR, Wet', formatTag: 'DRY' });
  });

  it('an unnamed meal reads "Meal" and never joins a run (it could not be named)', () => {
    const model = bare([row('a', 'meal', 8, 0, { food_type: 'meal' }), row('b', 'meal', 9, 0, { food_type: 'meal' })]);
    expect(linesOf(model)).toEqual(['a', 'b']);
    expect(eventsOf(model)[0]).toMatchObject({ title: 'Meal', detail: null });
  });

  it('runFormatsLine: wet before dry, every member counted, nothing when a member has no tag', () => {
    expect(runFormatsLine(['DRY', 'WET', 'DRY', 'DRY'])).toBe('1 wet · 3 dry');
    expect(runFormatsLine(['WET', 'WET'])).toBe('all wet');
    expect(runFormatsLine(['RAW', 'DRY'])).toBe('1 dry · 1 raw');
    expect(runFormatsLine(['DRY', null])).toBeNull();
    expect(runFormatsLine([null, null])).toBeNull();
  });
});

describe('the dose row (AC 18) — its name, its four chips, its vehicle from the stored pair', () => {
  it('names the drug from the item, else the course, else only "Medication" (the PM’s ruling: never "no medicine named")', () => {
    const byId = byIdOf(
      bare([
        row('item', 'medication', 8, 0, { drug_generic_name: 'Prednisone', regimen_drug_name: 'Pred course', adherence: 'given' }),
        row('course', 'medication', 9, 0, { regimen_drug_name: 'Prednisolone', adherence: 'given' }),
        row('none', 'medication', 10, 0, { adherence: 'refused' }),
      ]),
    );
    expect(byId.get('item')?.title).toBe('Prednisone');
    expect(byId.get('course')?.title).toBe('Prednisolone');
    expect(byId.get('none')?.title).toBe('Medication');
    expect(JSON.stringify([...byId.values()])).not.toMatch(/no medicine named/i);
  });

  it('every adherence reaches the row, named or not: Given, Partial, Missed, Refused (GAP-2)', () => {
    for (const adherence of ['given', 'partial', 'missed', 'refused'] as const) {
      for (const named of [true, false]) {
        const [dose] = eventsOf(bare([row('d', 'medication', 8, 0, { adherence, drug_generic_name: named ? 'Prednisone' : null })]));
        expect(dose.dose?.adherence).toBe(adherence);
      }
    }
  });

  it('an unrated dose shows no chip, unless the meal it rode in was refused or picked at: then it is in doubt', () => {
    const rows = (vehicleIntake: string | null) => [
      row('lunch', 'meal', 13, 0, { ...WET, intake_rating: vehicleIntake }),
      row('d', 'medication', 13, 0, { drug_generic_name: 'Prednisone', adherence: null, paired_event_id: 'lunch', how_given: 'in_food' }),
    ];
    const doseOf = (vehicleIntake: string | null) => byIdOf(bare(rows(vehicleIntake))).get('d')?.dose;
    expect(doseOf('refused')).toMatchObject({ adherence: null, inDoubt: true });
    expect(doseOf('picked')).toMatchObject({ adherence: null, inDoubt: true });
    expect(doseOf('some')).toMatchObject({ adherence: null, inDoubt: false });
    expect(doseOf(null)).toMatchObject({ adherence: null, inDoubt: false });
    // A standalone unrated dose is never "Unconfirmed".
    const [alone] = eventsOf(bare([row('d', 'medication', 8, 0, { adherence: null })]));
    expect(alone.dose).toMatchObject({ inDoubt: false, vehicle: null });
  });

  it('the vehicle is the STORED pair: a same-minute meal that is not the pair is never named (GAP-3)', () => {
    const byId = byIdOf(
      bare([
        row('lunch', 'meal', 13, 0, { ...WET, intake_rating: 'picked' }),
        row('decoy', 'meal', 13, 20, DRY),
        row('d', 'medication', 13, 20, { drug_generic_name: 'Prednisone', adherence: 'partial', paired_event_id: 'lunch', how_given: 'in_food' }),
      ]),
    );
    const lunchTime = byId.get('lunch')?.time;
    expect(byId.get('d')?.dose).toMatchObject({
      vehicle: `in the ${lunchTime} meal`,
      vehicleIntake: { phrase: 'picked at', tone: 'attn' },
    });
    expect(byId.get('lunch')?.carries).toBe('with Prednisone');
    expect(byId.get('decoy')?.carries).toBeNull();
  });

  it('a vehicle meal that was finished adds nothing beside the dose; a "some" one says so in grey', () => {
    const doseFor = (intake: string) =>
      byIdOf(
        bare([
          row('m', 'meal', 13, 0, { ...WET, intake_rating: intake }),
          row('d', 'medication', 13, 0, { drug_generic_name: 'Prednisone', adherence: 'given', paired_event_id: 'm' }),
        ]),
      ).get('d')?.dose;
    expect(doseFor('all')?.vehicleIntake).toBeNull();
    expect(doseFor('most')?.vehicleIntake).toBeNull();
    expect(doseFor('some')?.vehicleIntake).toEqual({ phrase: 'some eaten', tone: 'mid' });
    expect(doseFor('refused')?.vehicleIntake).toEqual({ phrase: 'refused', tone: 'attn' });
  });

  it('a treat vehicle is "in the … treat"; an unpaired dose says how it was given, every recorded vehicle in words', () => {
    const byId = byIdOf(
      bare([
        row('t', 'meal', 13, 0, { food_brand: 'Temptations', food_product_name: 'Tasty Chicken', food_type: 'treat', food_format: 'treat' }),
        row('d', 'medication', 13, 0, { drug_generic_name: 'Prednisone', adherence: 'given', paired_event_id: 't' }),
      ]),
    );
    expect(byId.get('d')?.dose?.vehicle).toBe(`in the ${byId.get('t')?.time} treat`);
    const words = (how_given: string | null) =>
      eventsOf(bare([row('d', 'medication', 8, 0, { adherence: 'given', how_given })]))[0].dose?.vehicle;
    expect(words('direct')).toBe('directly');
    expect(words('in_food')).toBe('in food');
    expect(words('in_treat')).toBe('in a treat');
    expect(words('in_pill_pocket')).toBe('in a pill pocket');
    expect(words('other')).toBe('another way');
    expect(words(null)).toBeNull();
  });

  it('the meal names the doses it carried, and is its own row (a dose’s vehicle never folds)', () => {
    const model = bare([
      row('a', 'meal', 8, 0, DRY),
      row('lunch', 'meal', 9, 0, DRY),
      row('c', 'meal', 10, 0, DRY),
      row('d1', 'medication', 9, 0, { drug_generic_name: 'Prednisone', adherence: 'given', paired_event_id: 'lunch' }),
      row('d2', 'medication', 9, 0, { drug_generic_name: 'Cerenia', adherence: 'given', paired_event_id: 'lunch' }),
    ]);
    expect(byIdOf(model).get('lunch')?.carries).toBe('with Prednisone and Cerenia');
    expect(linesOf(model).flat()).toContain('lunch');
    expect(model.nodes.find((n) => n.kind === 'compact' && n.ids.includes('lunch'))).toBeUndefined();
  });
});

describe('the rest of the row — the time tag, the weight, the chips’ facts', () => {
  it('a found time carries FOUND and an estimated one ESTIMATED; a witnessed or legacy one carries nothing', () => {
    const byId = byIdOf(
      bare([
        row('found', 'vomit', 7, 0, { occurred_at_confidence: 'window', occurred_at_latest: iso(7, 2) }),
        row('est', 'vomit', 8, 0, { occurred_at_confidence: 'estimated' }),
        row('seen', 'vomit', 9, 0, { occurred_at_confidence: 'witnessed' }),
        row('legacy', 'vomit', 10, 0, { occurred_at_confidence: null }),
      ]),
    );
    expect(byId.get('found')?.timeTag).toBe('found');
    expect(byId.get('est')?.timeTag).toBe('estimated');
    expect(byId.get('seen')?.timeTag).toBeNull();
    expect(byId.get('legacy')?.timeTag).toBeNull();
  });

  it('an estimated meal is its own row: a run’s time column cannot carry its tag', () => {
    const model = bare([row('a', 'meal', 8, 0, DRY), row('b', 'meal', 9, 0, DRY), row('c', 'meal', 10, 0, DRY)].map((r) =>
      r.id === 'b' ? { ...r, occurred_at_confidence: 'estimated' } : r,
    ));
    expect(linesOf(model)).toEqual(['a', 'b', 'c']);
  });

  it('a weight carries its value in pounds, and no trend', () => {
    const [w] = eventsOf(bare([row('w', 'weight_check', 8, 0, { weight_kg: 4.5 })]));
    expect(w).toMatchObject({ title: 'Weight', detail: '9.9 lbs' });
  });

  it('a meal carries its recorded intake for its chip; unrated carries nothing', () => {
    const byId = byIdOf(bare([row('r', 'meal', 8, 0, { ...DRY, intake_rating: 'refused' }), row('u', 'meal', 12, 0, DRY)]));
    expect(byId.get('r')?.intake).toBe('refused');
    expect(byId.get('u')?.intake).toBeNull();
  });
});

describe('the timed meal is stable across reads (HV-2’s handoff: same-instant ties)', () => {
  it('two eaten bowls at one instant: the same one is timed, and so kept as its own row, whatever order SQLite hands them over in', () => {
    const rows = [row('bowl-b', 'meal', 12, 0, DRY), row('bowl-a', 'meal', 12, 0, WET), row('v', 'vomit', 12, 10)];
    const feedings = feedingsOf(rows);
    const one = buildSpine(input({ rows, feedings, photographed: new Set() }));
    const other = buildSpine(input({ rows, feedings: [...feedings].reverse(), photographed: new Set() }));
    expect(linesOf(one)).toEqual(linesOf(other));
    expect(timingsByRow(rows, [], feedings, [], DEFAULT_MEAL_TIMING_CONFIG).get('v')?.mealId).toBe(
      timingsByRow(rows, [], [...feedings].reverse(), [], DEFAULT_MEAL_TIMING_CONFIG).get('v')?.mealId,
    );
  });
});

describe('the meal a line on ANOTHER day measures from keeps its own row (History draws one card per day)', () => {
  it('last night’s 10 PM bowl, named by a 2 AM vomit on the next card, is never folded into the evening’s run', () => {
    const rows = [row('m18', 'meal', 18, 0, DRY), row('m22', 'meal', 22, 0, DRY)];
    expect(linesOf(bare(rows))).toEqual([['m18', 'm22']]);
    expect(linesOf(bare(rows, { timedElsewhere: new Set(['m22']) }))).toEqual(['m18', 'm22']);
  });
});
