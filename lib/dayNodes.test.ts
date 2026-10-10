// lib/dayNodes.ts — the day's pipeline (History v2, HV-1 / CUL-1158; spec §5.5).
//
// REFACTOR SAFETY (C-18: a refactor-safety test is green BEFORE and AFTER, and it is a
// different thing from a guard): moving TodayCard's composition into `buildDay` changed
// nothing Home draws. Two halves.
//   1. The fixture day (the round-4 page's Sep 17: ten events, a look, two photographed
//      vomits) stated in explicit terms — six nodes in the day's order, the lane's 3 and
//      4 minutes, a read in its shipped words, a read still being produced — and asserted
//      through BOTH calls: `buildSpine`, the call TodayCard made before this PR (green
//      before), and `buildDayNodes`, the call it makes now (green after).
//   2. A sweep of days: `buildDay(events, facts)` IS `buildSpine` over the same facts,
//      field for field. That pins the one thing `lib/dayNodes.ts` owns — how the facts
//      are handed to the composition — so a fact dropped or crossed on the way (the
//      prior onsets, the photo set, the working set, the config) reds here. The floor
//      under it is a WITNESS per fact, a named day whose answer needs that fact, so the
//      sweep provably CAN see each one; 400 seeded random days add breadth, never the
//      floor (on their own they saw the prior onsets on 2 days in 400).
//
// HV-6 (CUL-1163) changed what the pipeline RETURNS, as §5.5 says it would (the run rule:
// the two meals the lane timed now keep their own rows), so the fixture day states the new
// answer. The equality halves did not move: both calls still draw that answer, field for
// field, which is what says HV-6 changed the rule and not the composition.
//
// TIMEZONE HONESTY (C-29, B-514): instants are offsets from LOCAL midnight, because a run
// breaks at the local day and the fixture must be one day in every zone; no assertion
// reads a clock string (the sweep compares both calls in the runner's own zone).

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { buildDay, buildDayNodes, type DayEvent, type DayNodeFacts } from './dayNodes';
import { buildSpine, type SpineAnalysisRow, type SpineInput } from './spineNode';
import { DEFAULT_MEAL_TIMING_CONFIG, type MealTimingConfig } from './mealTiming';

const BASE = new Date(2026, 8, 17, 0, 0, 0, 0).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (h: number, m: number): number => BASE + (h * 60 + m) * MIN;
const iso = (h: number, m: number): string => new Date(at(h, m)).toISOString();

function row(id: string, event_type: string, h: number, m: number, extra: Partial<DayEvent> = {}): DayEvent {
  return { id, pet_id: 'p1', event_type, occurred_at: iso(h, m), occurred_at_confidence: 'witnessed', ...extra };
}

const PR = { food_brand: 'Royal Canin', food_product_name: 'Selected Protein PR', food_type: 'meal' };

/** The Sep 17 shape, newest-first as the store hands it over. */
const SEP_17: DayEvent[] = [
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
  row('lk', 'check_in', 17, 14),
];

// The phone's copy of the read (HV-5, CUL-1162): four columns, never the words, never
// the hide stamp.
const analysisRow = (event_id: string, recommendation: string | null, status = 'completed'): SpineAnalysisRow => ({
  event_id,
  status,
  recommendation,
  updated_at: '2026-09-17T18:00:00+00:00',
  // Pre-stamp (migration 075's columns NULL): no photo-set compare.
  photo_set_key: null,
  rule_version: null,
  engine_flags: null,
  tier: null,
});

/** A meal row's feeding as the lane takes it: keyed by its event id, witnessed, unrated,
 *  the fixture's one food. Every built day's feedings are spelled here, once. */
const feedingOf = (meal: DayEvent) => ({
  id: meal.id,
  ms: Date.parse(meal.occurred_at),
  confidence: 'witnessed' as const,
  intakeRating: null,
  form: 'Royal Canin Selected Protein PR',
});

const SEP_17_FACTS: DayNodeFacts = {
  reads: {
    photographed: new Set(['v1', 'v2']),
    analysis: new Map([['v2', analysisRow('v2', 'worth_a_call')]]),
    // v1's read is being produced right now (C-30).
    working: new Set(['v1']),
  },
  timings: {
    feedings: SEP_17.filter((r) => r.event_type === 'meal').map(feedingOf),
    freeFedSpans: [],
    priorOnsets: [],
  },
};

/** The call TodayCard made before HV-1, spelled exactly as it spelled it. */
function asSpineInput(events: readonly DayEvent[], { reads, timings }: DayNodeFacts): SpineInput {
  return {
    rows: events,
    photographed: reads.photographed,
    analysis: reads.analysis,
    working: reads.working,
    feedings: timings.feedings,
    freeFedSpans: timings.freeFedSpans,
    priorOnsets: timings.priorOnsets,
    config: timings.config,
    timedElsewhere: timings.timedElsewhere,
    runBreaks: timings.runBreaks,
    vomitsElsewhere: timings.vomitsElsewhere,
  };
}

/** What Home draws of a node, as the fixture states it. */
function shapeOf(nodes: ReturnType<typeof buildDayNodes>) {
  return nodes.map((n) =>
    n.kind === 'compact'
      ? { run: n.ids, title: n.title, food: n.detail }
      : { id: n.id, title: n.title, timing: n.timing, photo: n.photo, read: n.read.state === 'worth_a_call' ? n.read.label : n.read.state },
  );
}

const meal = (id: string) => ({ id, title: 'Meal', timing: null, photo: false, read: 'none' });

const SEP_17_NODES = [
  meal('m1'),
  // The meal v1's line was measured from: its own row (rule B, HV-6).
  meal('m2'),
  { id: 'v1', title: 'Vomit', timing: '3 min after eating', photo: true, read: 'pending' },
  { run: ['m3', 'm4'], title: '2 meals', food: 'Royal Canin · Selected Protein PR' },
  // The meal v2's line was measured from.
  meal('m5'),
  { id: 'c1', title: 'Cough', timing: null, photo: false, read: 'none' },
  { id: 'v2', title: 'Vomit', timing: '4 min after eating', photo: true, read: 'Worth a call' },
  { run: ['m6', 'm7'], title: '2 meals', food: 'Royal Canin · Selected Protein PR' },
];

describe('the fixture day: Home draws the same nodes before and after the move', () => {
  it('BEFORE — TodayCard’s old call (`buildSpine`) draws the eight lines', () => {
    expect(shapeOf(buildSpine(asSpineInput(SEP_17, SEP_17_FACTS)).nodes)).toEqual(SEP_17_NODES);
  });

  it('AFTER — the pipeline (`buildDayNodes`) draws the same eight', () => {
    expect(shapeOf(buildDayNodes(SEP_17, SEP_17_FACTS))).toEqual(SEP_17_NODES);
  });

  it('and the whole model — the count line’s figures included — is the old call’s, field for field', () => {
    const before = buildSpine(asSpineInput(SEP_17, SEP_17_FACTS));
    const after = buildDay(SEP_17, SEP_17_FACTS);
    expect(after).toEqual(before);
    expect(after.total).toBe(10); // the look is never counted (T-5)
  });
});

// ── The sweep ─────────────────────────────────────────────────────────────────────

/** A small seeded PRNG (mulberry32): the sweep is random in shape, fixed in value. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES = ['meal', 'meal', 'meal', 'vomit', 'vomit', 'cough', 'medication', 'weight', 'stool_normal', 'check_in'];
const FOODS = [
  { food_brand: 'Royal Canin', food_product_name: 'Selected Protein PR', food_type: 'meal' },
  { food_brand: 'Hill’s', food_product_name: 'z/d', food_type: 'meal' },
  { food_brand: 'Temptations', food_product_name: 'Tuna', food_type: 'treat' },
];
const STATUSES = ['completed', 'uncertain', 'failed', 'pending', 'capped'];
const RECS: (string | null)[] = ['worth_a_call', 'monitor', 'not_enough_to_say', null, 'looks_fine_to_me'];
const CONFIDENCES = ['witnessed', 'witnessed', 'estimated', 'window', null] as const;
const CUSTOM_CONFIG: MealTimingConfig = { ...DEFAULT_MEAL_TIMING_CONFIG, episodeGapHours: 1, rapidWindowMinutes: 10 };

interface SweepDay {
  events: DayEvent[];
  facts: DayNodeFacts;
}

function randomDay(rand: () => number): SweepDay {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const n = Math.floor(rand() * 13);
  const events: DayEvent[] = [];
  for (let i = 0; i < n; i++) {
    const type = pick(TYPES);
    const ms = BASE + Math.floor(rand() * 24 * 60) * MIN;
    const confidence = type === 'vomit' ? pick(CONFIDENCES) : 'witnessed';
    events.push({
      id: `e${i}`,
      pet_id: 'p1',
      event_type: type,
      // One row in forty is unparseable: both calls must drop it the same way.
      occurred_at: rand() < 0.025 ? 'not-a-date' : new Date(ms).toISOString(),
      occurred_at_confidence: confidence,
      occurred_at_earliest: confidence === 'window' ? new Date(ms - HOUR).toISOString() : null,
      occurred_at_latest: confidence === 'window' ? new Date(ms).toISOString() : null,
      ...(type === 'meal' ? { ...pick(FOODS), intake_rating: pick(['all', 'most', 'some', 'refused', null]) } : {}),
      ...(type === 'medication' ? { drug_generic_name: 'prednisolone', adherence: pick(['given', 'refused', null]) } : {}),
    });
  }
  const ids = events.map((e) => e.id);
  const subset = (p: number) => new Set([...ids.filter(() => rand() < p), ...(rand() < 0.2 ? ['stray'] : [])]);
  const analysis = new Map<string, SpineAnalysisRow>();
  for (const id of ids) {
    if (rand() < 0.4) {
      analysis.set(id, {
        event_id: id,
        status: pick(STATUSES),
        recommendation: pick(RECS),
        updated_at: new Date(BASE).toISOString(),
        photo_set_key: null,
        rule_version: null,
        engine_flags: null,
        tier: null,
      });
    }
  }
  const feedings = Array.from({ length: Math.floor(rand() * 6) }, (_, k) => ({
    id: `f${k}`,
    ms: BASE - 12 * HOUR + Math.floor(rand() * 36 * 60) * MIN,
    confidence: pick(['witnessed', null, 'estimated'] as const),
    intakeRating: pick(['all', 'most', 'some', 'picked', 'refused', null] as const),
    form: pick(['Royal Canin Selected Protein PR', null]),
  }));
  const spanStart = BASE + Math.floor(rand() * 20) * HOUR;
  return {
    events,
    facts: {
      reads: { photographed: subset(0.5), analysis, working: subset(0.3) },
      timings: {
        feedings,
        freeFedSpans: rand() < 0.2 ? [{ fromMs: spanStart, untilMs: spanStart + 3 * HOUR }] : [],
        // Onsets just before the day, inside or outside the episode gap: a 00:30 vomit
        // absorbed into last night's bout gets no line, and only the prior onset says so.
        priorOnsets:
          rand() < 0.6
            ? Array.from({ length: 1 + Math.floor(rand() * 2) }, () => ({
                ms: BASE - Math.floor(rand() * 4 * 60) * MIN,
                confidence: pick(['witnessed', 'estimated'] as const),
              }))
            : undefined,
        config: rand() < 0.3 ? CUSTOM_CONFIG : undefined,
      },
    },
  };
}

const DAYS = Array.from({ length: 400 }, (_, i) => randomDay(prng(1158 + i)));

// ── The witnesses: a day built to need each fact ──────────────────────────────────
// The equality below can red on a fact dropped on the way only if some day's answer
// depends on that fact. On the random days alone the prior onsets decide the answer on 2
// days in 400 and the config on 3 (measured): a floor that held by the generator's luck,
// and that any edit to its draws can zero. Giving the feedings the two fields CUL-1159
// makes required zeroed the prior onsets, measured on a test merge. So each fact is
// NAMED against a day that needs it: the Sep 17 fixture for the four common facts, and
// three days built in the lane's own terms for the three that only matter in rare shapes.

const WITHOUT = {
  photographed: (f: DayNodeFacts): DayNodeFacts => ({ ...f, reads: { ...f.reads, photographed: new Set<string>() } }),
  analysis: (f: DayNodeFacts): DayNodeFacts => ({ ...f, reads: { ...f.reads, analysis: new Map() } }),
  working: (f: DayNodeFacts): DayNodeFacts => ({ ...f, reads: { ...f.reads, working: new Set<string>() } }),
  feedings: (f: DayNodeFacts): DayNodeFacts => ({ ...f, timings: { ...f.timings, feedings: [] } }),
  freeFedSpans: (f: DayNodeFacts): DayNodeFacts => ({ ...f, timings: { ...f.timings, freeFedSpans: [] } }),
  priorOnsets: (f: DayNodeFacts): DayNodeFacts => ({ ...f, timings: { ...f.timings, priorOnsets: undefined } }),
  config: (f: DayNodeFacts): DayNodeFacts => ({ ...f, timings: { ...f.timings, config: undefined } }),
  timedElsewhere: (f: DayNodeFacts): DayNodeFacts => ({ ...f, timings: { ...f.timings, timedElsewhere: undefined } }),
  runBreaks: (f: DayNodeFacts): DayNodeFacts => ({ ...f, timings: { ...f.timings, runBreaks: undefined } }),
  vomitsElsewhere: (f: DayNodeFacts): DayNodeFacts => ({ ...f, timings: { ...f.timings, vomitsElsewhere: undefined } }),
};
type Fact = keyof typeof WITHOUT;

/** Does withholding `fact` change the composition's own answer for this day? */
function needs({ events, facts }: SweepDay, fact: Fact): boolean {
  const whole = JSON.stringify(buildSpine(asSpineInput(events, facts)));
  return JSON.stringify(buildSpine(asSpineInput(events, WITHOUT[fact](facts)))) !== whole;
}

/** A day of witnessed meals and vomits, its feedings the meals, no photo and no read. */
function timedDay(rows: DayEvent[], timings: Partial<DayNodeFacts['timings']>): SweepDay {
  return {
    events: rows,
    facts: {
      reads: { photographed: new Set(), analysis: new Map(), working: new Set() },
      timings: {
        feedings: rows.filter((r) => r.event_type === 'meal').map(feedingOf),
        freeFedSpans: [],
        ...timings,
      },
    },
  };
}

const SEP_17_DAY: SweepDay = { events: SEP_17, facts: SEP_17_FACTS };

interface Witness {
  fact: Fact;
  why: string;
  day: SweepDay;
  /** For a timing witness: the row whose line the fact decides, and whether it has one
   *  WITH the fact handed over (withholding the fact must flip it). */
  timed?: { row: string; withFact: boolean };
}

const WITNESSES: Witness[] = [
  { fact: 'photographed', why: 'Sep 17: both vomits carry a photo', day: SEP_17_DAY },
  { fact: 'analysis', why: 'Sep 17: v2’s read has landed', day: SEP_17_DAY },
  { fact: 'working', why: 'Sep 17: v1’s read is being produced', day: SEP_17_DAY },
  { fact: 'feedings', why: 'Sep 17: both vomits are timed from a meal', day: SEP_17_DAY },
  {
    fact: 'priorOnsets',
    why: 'a bout that began at 23:30 absorbs the 00:15 vomit into last night’s episode',
    day: timedDay([row('wp-v', 'vomit', 0, 15), row('wp-m', 'meal', 0, 10, PR)], {
      priorOnsets: [{ ms: at(0, -30), confidence: 'witnessed' }],
    }),
    timed: { row: 'wp-v', withFact: false },
  },
  {
    fact: 'config',
    why: 'two vomits 90 minutes apart are one episode at the lane’s gap and two at the custom 1 hour',
    day: timedDay(
      [row('wc-v2', 'vomit', 9, 35), row('wc-m2', 'meal', 9, 30, PR), row('wc-v1', 'vomit', 8, 5), row('wc-m1', 'meal', 8, 0, PR)],
      { config: CUSTOM_CONFIG },
    ),
    timed: { row: 'wc-v2', withFact: true },
  },
  {
    fact: 'freeFedSpans',
    why: 'a vomit inside a free-fed span is not timed',
    day: timedDay([row('wf-v', 'vomit', 12, 5), row('wf-m', 'meal', 12, 0, PR)], {
      freeFedSpans: [{ fromMs: at(11, 0), untilMs: at(14, 0) }],
    }),
    timed: { row: 'wf-v', withFact: false },
  },
  {
    fact: 'timedElsewhere',
    why: 'last night’s 10 PM bowl, the one a 2 AM vomit on the next card was timed from, keeps its own row (HV-6)',
    day: timedDay([row('we-m1', 'meal', 18, 0, PR), row('we-m2', 'meal', 22, 0, PR)], {
      timedElsewhere: new Set(['we-m2']),
    }),
  },
  {
    fact: 'runBreaks',
    why: 'a 9:00 AM look History draws between the 6:20 and 10:45 AM meals keeps them two rows (CUL-1719)',
    day: timedDay([row('wb-m2', 'meal', 10, 45, PR), row('wb-m1', 'meal', 6, 20, PR)], { runBreaks: [at(9, 0)] }),
  },
  {
    fact: 'vomitsElsewhere',
    why: 'an 11:50 PM bowl before a 12:10 AM vomit on the next card keeps its own row (CUL-1737)',
    day: timedDay([row('wv-m2', 'meal', 23, 50, PR), row('wv-m1', 'meal', 22, 0, PR)], {
      vomitsElsewhere: [{ fromMs: at(24, 10), toMs: at(24, 10) }],
    }),
  },
];

/** Every day the equality runs over: each witness day once, then the random ones. */
const SWEEP: SweepDay[] = [...new Set(WITNESSES.map((w) => w.day)), ...DAYS];

describe('the sweep: `buildDay` IS the old call, over the witness days and 400 random ones', () => {
  it('field for field — nodes, count and chips — and `buildDayNodes` is its nodes', () => {
    for (const { events, facts } of SWEEP) {
      const before = buildSpine(asSpineInput(events, facts));
      expect(buildDay(events, facts)).toEqual(before);
      expect(buildDayNodes(events, facts)).toEqual(before.nodes);
    }
  });
});

describe('the floor under the equality: the sweep can SEE every fact it hands over', () => {
  // An equality over facts that never change the output proves nothing about how they
  // are handed over, so every fact has a named day whose answer needs it.
  it('every fact the pipeline hands over has a witness', () => {
    const facts = Object.keys(WITHOUT) as Fact[];
    expect(facts.filter((fact) => !WITNESSES.some((w) => w.fact === fact))).toEqual([]);
  });

  it.each(WITNESSES)('$fact — $why', (w) => {
    expect(needs(w.day, w.fact)).toBe(true);
    if (!w.timed) return;
    const timingOf = (facts: DayNodeFacts) => {
      const node = buildDayNodes(w.day.events, facts).find((n) => n.kind === 'event' && n.id === w.timed?.row);
      if (!node || node.kind !== 'event') throw new Error(`${w.timed?.row} is not an event node`);
      return node.timing;
    };
    expect(timingOf(w.day.facts) !== null).toBe(w.timed.withFact);
    expect(timingOf(WITHOUT[w.fact](w.day.facts)) !== null).toBe(!w.timed.withFact);
  });
});

// ── CUL-1719: a look History draws among the rows breaks a run it falls inside ────────
// The pipeline leaves looks out of its rows (T-5), and History's card threads each answered
// look in by its time (CUL-1244). A run folded over a look's instant sat at its first
// member's time, so a 9:00 AM look drawn there printed after the 10:45 AM meal. Rule B's
// own sentence: a run never crosses a row between its members in time.
describe('CUL-1719 — a look between a run’s members in time breaks the run', () => {
  const MEALS = [row('c-m2', 'meal', 10, 45, PR), row('c-m1', 'meal', 6, 20, PR)];
  const factsWith = (runBreaks?: number[]): DayNodeFacts => ({
    reads: { photographed: new Set(), analysis: new Map(), working: new Set() },
    timings: { feedings: MEALS.map(feedingOf), freeFedSpans: [], ...(runBreaks ? { runBreaks } : {}) },
  });
  const shape = (facts: DayNodeFacts) => buildDayNodes(MEALS, facts).map((n) => (n.kind === 'compact' ? n.ids : n.id));

  it('the convening’s day with no look: one run, 6:20 – 10:45 AM', () => {
    expect(shape(factsWith())).toEqual([['c-m1', 'c-m2']]);
    // No break and an empty list are the same day (Home's call is unchanged).
    expect(buildDay(MEALS, factsWith([]))).toEqual(buildDay(MEALS, factsWith()));
  });

  it('a 9:00 AM look: the 6:20 meal and the 10:45 meal each keep their own row', () => {
    expect(shape(factsWith([at(9, 0)]))).toEqual(['c-m1', 'c-m2']);
  });

  it('a look before, after, or at the last member’s minute leaves the run whole', () => {
    for (const t of [at(5, 0), at(11, 30), at(10, 45), at(23, 59)]) {
      expect(shape(factsWith([t]))).toEqual([['c-m1', 'c-m2']]);
    }
  });

  it('a look at the first member’s minute sits after it, so it breaks (the card threads it after the 6:20 meal)', () => {
    expect(shape(factsWith([at(6, 20)]))).toEqual(['c-m1', 'c-m2']);
  });

  it('a run of three keeps the half on each side whole', () => {
    const three = [row('t-m3', 'meal', 18, 0, PR), ...MEALS];
    const nodes = buildDayNodes(three, {
      reads: { photographed: new Set(), analysis: new Map(), working: new Set() },
      timings: { feedings: three.map(feedingOf), freeFedSpans: [], runBreaks: [at(12, 0)] },
    });
    expect(nodes.map((n) => (n.kind === 'compact' ? n.ids : n.id))).toEqual([['c-m1', 'c-m2'], 't-m3']);
  });
});

// ── CUL-1737: a meal eaten within 30 minutes before ANY vomit keeps its own row ──────
// The timing anchor covers only a witnessed episode opener with a feeding before it, so a
// meal minutes before a found vomit, the second vomit of a bout, or a vomit in a free-fed
// span folded into the run above the vomit. Through `buildDay`, the one pipeline Home and
// History call; instants are offsets from LOCAL midnight (B-514), so each day is one day in
// every zone the non-UTC job runs.
describe('CUL-1737 — a meal within 30 minutes before any vomit is never folded into a run', () => {
  const NO_READS = { photographed: new Set<string>(), analysis: new Map(), working: new Set<string>() };
  const shape = (rows: DayEvent[], timings: Partial<DayNodeFacts['timings']> = {}) =>
    buildDayNodes(rows, {
      reads: NO_READS,
      timings: { feedings: rows.filter((r) => r.event_type === 'meal').map(feedingOf), freeFedSpans: [], ...timings },
    }).map((n) => (n.kind === 'compact' ? n.ids : n.id));
  const found = (id: string, h: number, m: number, earliest?: [number, number]) =>
    row(id, 'vomit', h, m, {
      occurred_at_confidence: 'window',
      occurred_at_earliest: earliest ? iso(earliest[0], earliest[1]) : null,
      occurred_at_latest: iso(h, m),
    });

  it('the mock’s day: 8:00 AM and 12:30 PM share a line, the 1:05 PM meal stands alone, then the vomit found at 1:30', () => {
    const day = [found('v', 13, 30), row('m3', 'meal', 13, 5, PR), row('m2', 'meal', 12, 30, PR), row('m1', 'meal', 8, 0, PR)];
    expect(shape(day)).toEqual([['m1', 'm2'], 'm3', 'v']);
  });

  it('the second vomit of a bout (never timed): the meal 20 minutes before it is its own row', () => {
    const day = [
      row('v2', 'vomit', 11, 0),
      row('b3', 'meal', 10, 40, PR),
      row('b2', 'meal', 10, 20, PR),
      row('b1', 'meal', 10, 0, PR),
      row('v1', 'vomit', 9, 10),
      row('a1', 'meal', 9, 0, PR),
    ];
    // v1 opens the bout and is timed from a1; v2 is inside the episode gap, so no line.
    const nodes = buildDayNodes(day, {
      reads: NO_READS,
      timings: { feedings: day.filter((r) => r.event_type === 'meal').map(feedingOf), freeFedSpans: [] },
    });
    const v2 = nodes.find((n) => n.kind === 'event' && n.id === 'v2');
    expect(v2?.kind === 'event' ? v2.timing : 'missing').toBeNull();
    expect(shape(day)).toEqual(['a1', 'v1', ['b1', 'b2'], 'b3', 'v2']);
  });

  it('a vomit in a free-fed span (never timed): the meal before it in the window is its own row', () => {
    const day = [row('v', 'vomit', 12, 45), row('m3', 'meal', 12, 30, PR), row('m2', 'meal', 11, 30, PR), row('m1', 'meal', 11, 0, PR)];
    const span = [{ fromMs: at(10, 0), untilMs: at(14, 0) }];
    const nodes = buildDayNodes(day, {
      reads: NO_READS,
      timings: { feedings: day.filter((r) => r.event_type === 'meal').map(feedingOf), freeFedSpans: span },
    });
    const v = nodes.find((n) => n.kind === 'event' && n.id === 'v');
    expect(v?.kind === 'event' ? v.timing : 'missing').toBeNull();
    expect(shape(day, { freeFedSpans: span })).toEqual([['m1', 'm2'], 'm3', 'v']);
  });

  it('a found vomit with a window: every meal from 30 minutes before its earliest bound to its latest is its own row', () => {
    // Found at 11:00, last seen fine at 9:20: the span is 8:50 – 11:00.
    const day = [
      row('m6', 'meal', 11, 30, PR),
      found('v', 11, 0, [9, 20]),
      row('m5', 'meal', 10, 30, PR),
      row('m4', 'meal', 9, 0, PR),
      row('m3', 'meal', 8, 50, PR),
      row('m2', 'meal', 8, 0, PR),
      row('m1', 'meal', 7, 0, PR),
    ];
    expect(shape(day)).toEqual([['m1', 'm2'], 'm3', 'm4', 'm5', 'v', 'm6']);
  });

  it('a found vomit with no earliest bound counts from its recorded time alone', () => {
    const day = [found('v', 11, 0), row('m3', 'meal', 10, 30, PR), row('m2', 'meal', 10, 29, PR), row('m1', 'meal', 9, 0, PR)];
    expect(shape(day)).toEqual([['m1', 'm2'], 'm3', 'v']);
  });

  it('30:00 before is inside the window: that meal keeps its row', () => {
    const day = [found('v', 13, 0), row('m3', 'meal', 12, 30, PR), row('m2', 'meal', 11, 30, PR), row('m1', 'meal', 11, 0, PR)];
    expect(shape(day)).toEqual([['m1', 'm2'], 'm3', 'v']);
  });

  it('30:01 before is outside: that meal joins the run above the vomit', () => {
    const day = [
      found('v', 13, 0),
      row('m3', 'meal', 12, 29 + 59 / 60, PR),
      row('m2', 'meal', 11, 30, PR),
      row('m1', 'meal', 11, 0, PR),
    ];
    expect(shape(day)).toEqual([['m1', 'm2', 'm3'], 'v']);
  });

  it('a meal after a seen vomit is not on this rule', () => {
    const day = [row('m3', 'meal', 14, 0, PR), row('m2', 'meal', 13, 10, PR), row('v', 'vomit', 13, 0), row('m1', 'meal', 9, 0, PR)];
    expect(shape(day)).toEqual(['m1', 'v', ['m2', 'm3']]);
  });

  it('a later meal inside the window before a TIMED vomit is its own row too, not only the anchor', () => {
    // Two bowls within 30 minutes of a witnessed vomit: the lane times from the nearer one;
    // the other folded with breakfast before.
    const day = [row('v', 'vomit', 13, 0), row('m3', 'meal', 12, 50, PR), row('m2', 'meal', 12, 40, PR), row('m1', 'meal', 8, 0, PR)];
    expect(shape(day)).toEqual(['m1', 'm2', 'm3', 'v']);
  });

  it('only a vomit: a cough, stool or other symptom in the window leaves the run as it was', () => {
    for (const type of ['cough', 'diarrhea', 'lethargy']) {
      const day = [row('x', type, 13, 0), row('m2', 'meal', 12, 50, PR), row('m1', 'meal', 12, 0, PR)];
      expect(shape(day)).toEqual([['m1', 'm2'], 'x']);
    }
  });
});
