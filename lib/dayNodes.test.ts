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
//   2. A seeded sweep of random days: `buildDay(events, facts)` IS `buildSpine` over the
//      same facts, field for field. That pins the one thing `lib/dayNodes.ts` owns — how
//      the facts are handed to the composition — so a fact dropped or crossed on the way
//      (the prior onsets, the photo set, the working set, the config) reds here. The
//      sweep's own floor proves it CAN see each of those, rather than assuming it.
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

const analysisRow = (event_id: string, recommendation: string | null, status = 'completed'): SpineAnalysisRow => ({
  event_id,
  status,
  recommendation,
  read_text: recommendation ? 'Streaks of red in tonight’s photo are worth a call to your vet today.' : null,
  dismissed_at: null,
});

const SEP_17_FACTS: DayNodeFacts = {
  reads: {
    photographed: new Set(['v1', 'v2']),
    analysis: new Map([['v2', analysisRow('v2', 'worth_a_call')]]),
    // v1's read is being produced right now (C-30).
    working: new Set(['v1']),
  },
  timings: {
    feedings: SEP_17.filter((r) => r.event_type === 'meal').map((r) => ({
      ms: Date.parse(r.occurred_at),
      confidence: 'witnessed' as const,
      form: 'Royal Canin Selected Protein PR',
    })),
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

interface RandomDay {
  events: DayEvent[];
  facts: DayNodeFacts;
}

function randomDay(rand: () => number): RandomDay {
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
        read_text: rand() < 0.5 ? 'A read.' : null,
        dismissed_at: rand() < 0.2 ? new Date(BASE).toISOString() : null,
      });
    }
  }
  const feedings = Array.from({ length: Math.floor(rand() * 6) }, () => ({
    ms: BASE - 12 * HOUR + Math.floor(rand() * 36 * 60) * MIN,
    confidence: pick(['witnessed', null, 'estimated'] as const),
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

describe('the sweep: `buildDay` IS the old call, over 400 random days', () => {
  it('field for field — nodes, count and chips — and `buildDayNodes` is its nodes', () => {
    for (const { events, facts } of DAYS) {
      const before = buildSpine(asSpineInput(events, facts));
      expect(buildDay(events, facts)).toEqual(before);
      expect(buildDayNodes(events, facts)).toEqual(before.nodes);
    }
  });

  it('the sweep can SEE every fact it hands over (the floor under the equality)', () => {
    // An equality over facts that never change the output proves nothing about how they
    // are handed over. So, per fact: on how many days does withholding it change the
    // composition's own answer? Every count must be non-zero, or the sweep above could
    // not red on that fact going missing.
    const without = {
      photographed: (f: DayNodeFacts) => ({ ...f, reads: { ...f.reads, photographed: new Set<string>() } }),
      analysis: (f: DayNodeFacts) => ({ ...f, reads: { ...f.reads, analysis: new Map() } }),
      working: (f: DayNodeFacts) => ({ ...f, reads: { ...f.reads, working: new Set<string>() } }),
      feedings: (f: DayNodeFacts) => ({ ...f, timings: { ...f.timings, feedings: [] } }),
      freeFedSpans: (f: DayNodeFacts) => ({ ...f, timings: { ...f.timings, freeFedSpans: [] } }),
      priorOnsets: (f: DayNodeFacts) => ({ ...f, timings: { ...f.timings, priorOnsets: undefined } }),
      config: (f: DayNodeFacts) => ({ ...f, timings: { ...f.timings, config: undefined } }),
    };
    const sensitive: Record<string, number> = {};
    for (const [fact, drop] of Object.entries(without)) {
      sensitive[fact] = DAYS.filter(({ events, facts }) => {
        const whole = JSON.stringify(buildSpine(asSpineInput(events, facts)));
        return JSON.stringify(buildSpine(asSpineInput(events, drop(facts)))) !== whole;
      }).length;
    }
    for (const count of Object.values(sensitive)) expect(count).toBeGreaterThan(0);
  });
});
