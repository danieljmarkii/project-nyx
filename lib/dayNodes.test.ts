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
// TIMEZONE HONESTY (C-29): instants are offsets from one UTC anchor; no assertion reads a
// clock string (the sweep compares both calls in the runner's own zone).

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { buildDay, buildDayNodes, type DayEvent, type DayNodeFacts } from './dayNodes';
import { buildSpine, type SpineAnalysisRow, type SpineInput } from './spineNode';
import { DEFAULT_MEAL_TIMING_CONFIG, type MealTimingConfig } from './mealTiming';

const BASE = Date.parse('2026-09-17T05:00:00Z');
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
  };
}

/** What Home draws of a node, as the fixture states it. */
function shapeOf(nodes: ReturnType<typeof buildDayNodes>) {
  return nodes.map((n) =>
    n.kind === 'compact'
      ? { run: n.ids, title: n.title, food: n.detail }
      : { id: n.id, title: n.title, timing: n.timing, photo: n.photo, read: n.read.state === 'landed' ? n.read.label : n.read.state },
  );
}

const SEP_17_NODES = [
  { run: ['m1', 'm2'], title: '2 meals', food: 'Royal Canin · Selected Protein PR' },
  { id: 'v1', title: 'Vomit', timing: '3 min after eating', photo: true, read: 'pending' },
  { run: ['m3', 'm4', 'm5'], title: '3 meals', food: 'Royal Canin · Selected Protein PR' },
  { id: 'c1', title: 'Cough', timing: null, photo: false, read: 'none' },
  { id: 'v2', title: 'Vomit', timing: '4 min after eating', photo: true, read: 'Worth a call' },
  { run: ['m6', 'm7'], title: '2 meals', food: 'Royal Canin · Selected Protein PR' },
];

describe('the fixture day: Home draws the same nodes before and after the move', () => {
  it('BEFORE — TodayCard’s old call (`buildSpine`) draws the six nodes', () => {
    expect(shapeOf(buildSpine(asSpineInput(SEP_17, SEP_17_FACTS)).nodes)).toEqual(SEP_17_NODES);
  });

  it('AFTER — the pipeline (`buildDayNodes`) draws the same six', () => {
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
