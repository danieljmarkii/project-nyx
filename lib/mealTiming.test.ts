// lib/mealTiming.ts — the shared meal-relative timing predicate (B-755 PR 1, CUL-6).
//
// This suite pins the behaviour PR 2 will lift ⑤ onto, so its job is twofold:
//   1. assert the raw timing facts (bands, collapse, eligibility) directly;
//   2. pin the TWO-TIER eligibility asymmetry and the gate ORDER, because those are
//      the parts a re-derivation gets silently wrong (the whole reason the file
//      exists — §3, G9).
//
// TIMEZONE HONESTY (B-514): every instant here is a fixed epoch offset from a UTC
// base, and every question this module answers is a DIFFERENCE of instants — there
// is no local-day boundary anywhere in meal-relative timing — so nothing in this
// file depends on the runner's clock. The non-UTC CI job exercises it unchanged.

import {
  DEFAULT_MEAL_TIMING_CONFIG,
  TIMING_BAND_ORDER,
  classifyEpisodeSet,
  classifyEpisodeTiming,
  classifyGapMinutes,
  collapseEpisodes,
  feedingIsTimeEligible,
  isFreeFedNear,
  nearestPrecedingFeeding,
  onsetIsTimeEligible,
  timedEligibleFeedings,
  type FeedingInput,
  type MealTimingConfig,
} from './mealTiming';

// A fixed UTC anchor; all fixtures are offsets from it. `Z` pins it to the epoch,
// so the numbers are identical under every runner timezone.
const BASE = Date.parse('2026-07-01T12:00:00Z');
const MIN = 60_000;
const HOUR = 3_600_000;
const at = (msFromBase: number): number => BASE + msFromBase;

// A tiny seeded PRNG so property sweeps are reproducible — a flaky property failure
// you cannot re-run is worse than none (the engine's calibration-ritual style).
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

describe('mealTiming — eligibility asymmetry (the load-bearing subtlety)', () => {
  it('a FEEDING is NULL-tolerant (meals are inherently witnessed)', () => {
    expect(feedingIsTimeEligible(null)).toBe(true);
    expect(feedingIsTimeEligible(undefined)).toBe(true);
    expect(feedingIsTimeEligible('witnessed')).toBe(true);
    expect(feedingIsTimeEligible('estimated')).toBe(false);
    expect(feedingIsTimeEligible('window')).toBe(false);
  });

  it('a SYMPTOM ONSET is strict-witnessed (a discovered onset cannot be timed)', () => {
    expect(onsetIsTimeEligible('witnessed')).toBe(true);
    // The asymmetry: NULL is a feeding pass but an onset FAIL.
    expect(onsetIsTimeEligible(null)).toBe(false);
    expect(onsetIsTimeEligible(undefined)).toBe(false);
    expect(onsetIsTimeEligible('estimated')).toBe(false);
    expect(onsetIsTimeEligible('window')).toBe(false);
  });
});

describe('mealTiming — classifyGapMinutes bands + boundaries', () => {
  it('places the shipped-default boundaries (≤30 rapid / ≥360 long) inclusively', () => {
    expect(classifyGapMinutes(0)).toBe('rapid');
    expect(classifyGapMinutes(30)).toBe('rapid'); // inclusive upper edge of rapid
    expect(classifyGapMinutes(30.0001)).toBe('mid');
    expect(classifyGapMinutes(120)).toBe('mid');
    expect(classifyGapMinutes(359.9)).toBe('mid');
    expect(classifyGapMinutes(360)).toBe('long'); // 6h, inclusive lower edge of long
    expect(classifyGapMinutes(1000)).toBe('long');
  });

  it('honours a custom longGapHours (4h → 240 min is long)', () => {
    const cfg: MealTimingConfig = { ...DEFAULT_MEAL_TIMING_CONFIG, longGapHours: 4 };
    expect(classifyGapMinutes(239, cfg)).toBe('mid');
    expect(classifyGapMinutes(240, cfg)).toBe('long');
  });

  it('lets rapid win when a misconfig overlaps the two boundaries (no both/neither)', () => {
    // longGapHours*60 = 30 = rapidWindowMinutes → 30 is both ≤rapid and ≥long; rapid wins.
    const cfg: MealTimingConfig = { ...DEFAULT_MEAL_TIMING_CONFIG, longGapHours: 0.5 };
    expect(classifyGapMinutes(30, cfg)).toBe('rapid');
  });

  it('PROPERTY: the band is monotone non-decreasing as the gap grows', () => {
    const rng = makeRng(101);
    for (let trial = 0; trial < 400; trial++) {
      const m1 = Math.floor(rng() * 1440);
      const m2 = m1 + Math.floor(rng() * 1440); // m2 >= m1
      const r1 = TIMING_BAND_ORDER[classifyGapMinutes(m1)];
      const r2 = TIMING_BAND_ORDER[classifyGapMinutes(m2)];
      expect(r2).toBeGreaterThanOrEqual(r1);
    }
  });
});

describe('mealTiming — collapseEpisodes (the re-log guard)', () => {
  it('empty and singleton pass through', () => {
    expect(collapseEpisodes([], 3)).toEqual([]);
    expect(collapseEpisodes([{ ms: at(0) }], 3)).toEqual([{ ms: at(0) }]);
  });

  it('collapses a re-logged bout (within the gap) to one onset event', () => {
    const events = [
      { ms: at(0), tag: 'a' },
      { ms: at(1 * MIN), tag: 'b' }, // 1 min later — same bout
      { ms: at(2 * HOUR), tag: 'c' }, // 2h later, still ≤3h from prev
    ];
    const episodes = collapseEpisodes(events, 3);
    // One chained episode; onset is the earliest event, with its fields intact.
    expect(episodes).toEqual([{ ms: at(0), tag: 'a' }]);
  });

  it('keeps genuinely distinct bouts (>gap apart) separate', () => {
    const events = [{ ms: at(0) }, { ms: at(4 * HOUR) }];
    expect(collapseEpisodes(events, 3)).toEqual([{ ms: at(0) }, { ms: at(4 * HOUR) }]);
  });

  it('chains a slow drip (each event ≤gap after the last) into ONE episode', () => {
    const events = [
      { ms: at(0) },
      { ms: at(2 * HOUR) },
      { ms: at(4 * HOUR) },
      { ms: at(6 * HOUR) },
    ];
    expect(collapseEpisodes(events, 3)).toEqual([{ ms: at(0) }]);
  });

  it('PROPERTY: episode onsets are independent of input order', () => {
    const rng = makeRng(202);
    for (let trial = 0; trial < 200; trial++) {
      const n = 1 + Math.floor(rng() * 12);
      const base: { ms: number }[] = [];
      let cursor = 0;
      for (let i = 0; i < n; i++) {
        cursor += Math.floor(rng() * 6 * HOUR); // 0..6h steps → mix of collapses + splits
        base.push({ ms: at(cursor) });
      }
      const shuffled = [...base];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const a = collapseEpisodes(base, 3).map((e) => e.ms);
      const b = collapseEpisodes(shuffled, 3).map((e) => e.ms);
      expect(b).toEqual(a);
    }
  });
});

describe('mealTiming — timedEligibleFeedings', () => {
  it('drops estimated/window, keeps null+witnessed, sorts ascending, maps form', () => {
    const feedings: FeedingInput[] = [
      { ms: at(3 * HOUR), confidence: 'witnessed', form: 'kibble' },
      { ms: at(1 * HOUR), confidence: null, form: null }, // legacy NULL kept
      { ms: at(2 * HOUR), confidence: 'estimated', form: 'treat' }, // dropped
      { ms: at(4 * HOUR), confidence: 'window' }, // dropped
      { ms: Number.NaN, confidence: 'witnessed' }, // non-finite dropped
    ];
    const out = timedEligibleFeedings(feedings);
    expect(out).toEqual([
      { ms: at(1 * HOUR), form: null },
      { ms: at(3 * HOUR), form: 'kibble' },
    ]);
  });
});

describe('mealTiming — nearestPrecedingFeeding', () => {
  const feedings = timedEligibleFeedings([
    { ms: at(0), form: 'breakfast' },
    { ms: at(5 * HOUR), form: 'lunch' },
    { ms: at(9 * HOUR), form: 'dinner' },
  ]);

  it('picks the largest instant at/before the onset within the lookback', () => {
    const onset = at(6 * HOUR); // between lunch (5h) and dinner (9h)
    expect(nearestPrecedingFeeding(onset, feedings)).toEqual({ ms: at(5 * HOUR), form: 'lunch' });
  });

  it('ignores feedings after the onset', () => {
    const onset = at(1 * HOUR); // only breakfast precedes
    expect(nearestPrecedingFeeding(onset, feedings)).toEqual({ ms: at(0), form: 'breakfast' });
  });

  it('returns null when the nearest feeding is older than the lookback', () => {
    const onset = at(0 + 25 * HOUR); // breakfast was 25h earlier; lookback is 24h
    expect(nearestPrecedingFeeding(onset, [{ ms: at(0), form: 'breakfast' }])).toBeNull();
  });

  it('includes a feeding exactly at the lookback boundary and exactly at the onset', () => {
    const onset = at(24 * HOUR);
    const exactlyLookback = [{ ms: at(0), form: 'x' }]; // 24h before → inclusive
    expect(nearestPrecedingFeeding(onset, exactlyLookback)).toEqual({ ms: at(0), form: 'x' });
    const atOnset = [{ ms: at(24 * HOUR), form: 'y' }]; // gap 0
    expect(nearestPrecedingFeeding(onset, atOnset)).toEqual({ ms: at(24 * HOUR), form: 'y' });
  });

  it('is order-independent (does not rely on a sorted input)', () => {
    const unsorted = [
      { ms: at(9 * HOUR), form: 'dinner' },
      { ms: at(0), form: 'breakfast' },
      { ms: at(5 * HOUR), form: 'lunch' },
    ];
    expect(nearestPrecedingFeeding(at(6 * HOUR), unsorted)).toEqual({ ms: at(5 * HOUR), form: 'lunch' });
  });
});

describe('mealTiming — isFreeFedNear', () => {
  it('is true when a bowl overlaps [onset - lookback, onset]', () => {
    const onset = at(10 * HOUR);
    const spans = [{ fromMs: at(2 * HOUR), untilMs: at(4 * HOUR) }]; // inside the 24h window
    expect(isFreeFedNear(onset, spans)).toBe(true);
  });

  it('is false when the bowl ended before the lookback opened', () => {
    const onset = at(30 * HOUR); // lookback opens at 6h
    const spans = [{ fromMs: at(0), untilMs: at(5 * HOUR) }]; // ended at 5h, before 6h
    expect(isFreeFedNear(onset, spans)).toBe(false);
  });

  it('is false for a bowl that starts after the onset', () => {
    const onset = at(2 * HOUR);
    const spans = [{ fromMs: at(3 * HOUR), untilMs: at(9 * HOUR) }];
    expect(isFreeFedNear(onset, spans)).toBe(false);
  });

  it('handles an open bowl (untilMs = +Infinity)', () => {
    const onset = at(10 * HOUR);
    const spans = [{ fromMs: at(1 * HOUR), untilMs: Number.POSITIVE_INFINITY }];
    expect(isFreeFedNear(onset, spans)).toBe(true);
  });
});

describe('mealTiming — classifyEpisodeTiming (the one predicate + gate ORDER)', () => {
  const feedings: FeedingInput[] = [{ ms: at(0), confidence: 'witnessed', form: 'kibble' }];
  const noBowls: { fromMs: number; untilMs: number }[] = [];

  it('rung 1: a discovered onset is not_witnessed — even when everything else would time', () => {
    // A feeding sits 12 min before, no bowl — yet a non-witnessed onset never times.
    const r = classifyEpisodeTiming({ onsetMs: at(12 * MIN), confidence: 'estimated' }, feedings, noBowls);
    expect(r).toEqual({ eligible: false, reason: 'not_witnessed' });
  });

  it('rung 2: free-fed beats a present feeding (order: witnessed → free-fed → feeding)', () => {
    const bowls = [{ fromMs: at(-2 * HOUR), untilMs: at(20 * HOUR) }];
    const r = classifyEpisodeTiming({ onsetMs: at(12 * MIN), confidence: 'witnessed' }, feedings, bowls);
    expect(r).toEqual({ eligible: false, reason: 'free_fed' });
  });

  it('rung 3: witnessed + not free-fed + no feeding in 24h → no_preceding_feeding', () => {
    const r = classifyEpisodeTiming({ onsetMs: at(25 * HOUR), confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toEqual({ eligible: false, reason: 'no_preceding_feeding' });
  });

  it('eligible RAPID: witnessed onset 12 min after the meal', () => {
    const r = classifyEpisodeTiming({ onsetMs: at(12 * MIN), confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toEqual({ eligible: true, minutesSinceFeeding: 12, band: 'rapid', feedingForm: 'kibble' });
  });

  it('eligible MID: witnessed onset 2h after the meal', () => {
    const r = classifyEpisodeTiming({ onsetMs: at(2 * HOUR), confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toMatchObject({ eligible: true, minutesSinceFeeding: 120, band: 'mid' });
  });

  it('eligible LONG: witnessed onset 6.5h after the meal (the empty-stomach band)', () => {
    const r = classifyEpisodeTiming({ onsetMs: at(6.5 * HOUR), confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toMatchObject({ eligible: true, minutesSinceFeeding: 390, band: 'long' });
  });
});

describe('mealTiming — classifyEpisodeSet (the distribution the surfaces read)', () => {
  it('splits eligible/ineligible, counts bands, and keeps honest denominators', () => {
    const feedings: FeedingInput[] = [{ ms: at(0), confidence: 'witnessed', form: 'kibble' }];
    const episodes = [
      { onsetMs: at(10 * MIN), confidence: 'witnessed' as const }, // rapid
      { onsetMs: at(7 * HOUR), confidence: 'witnessed' as const }, // long
      { onsetMs: at(2 * HOUR), confidence: 'witnessed' as const }, // mid
      { onsetMs: at(30 * MIN), confidence: 'estimated' as const }, // ineligible: not_witnessed
      { onsetMs: at(48 * HOUR), confidence: 'witnessed' as const }, // ineligible: no feeding in 24h
    ];
    const dist = classifyEpisodeSet(episodes, feedings, []);

    expect(dist.bandCounts).toEqual({ rapid: 1, mid: 1, long: 1 });
    expect(dist.eligibleCount).toBe(3);
    expect(dist.totalCount).toBe(5);
    // The two untimed episodes are DISCLOSED as a count, never dropped (§2 L3).
    expect(dist.ineligible.map((e) => e.reason).sort()).toEqual(['no_preceding_feeding', 'not_witnessed']);
    // Denominator discipline: the band counts sum to the eligible denominator, never the total.
    const bandSum = dist.bandCounts.rapid + dist.bandCounts.mid + dist.bandCounts.long;
    expect(bandSum).toBe(dist.eligibleCount);
    expect(dist.eligibleCount + dist.ineligible.length).toBe(dist.totalCount);
  });

  it('PROPERTY: bandCounts always sum to eligibleCount, and eligible+ineligible = total', () => {
    const rng = makeRng(303);
    for (let trial = 0; trial < 150; trial++) {
      const feedings: FeedingInput[] = [];
      const fCount = Math.floor(rng() * 6);
      for (let i = 0; i < fCount; i++) {
        feedings.push({ ms: at(Math.floor(rng() * 24 * HOUR)), confidence: rng() < 0.5 ? 'witnessed' : null });
      }
      const confs = ['witnessed', 'estimated', 'window', null] as const;
      const episodes: { onsetMs: number; confidence: (typeof confs)[number] }[] = [];
      const eCount = Math.floor(rng() * 10);
      for (let i = 0; i < eCount; i++) {
        episodes.push({ onsetMs: at(Math.floor(rng() * 30 * HOUR)), confidence: confs[Math.floor(rng() * 4)] });
      }
      const dist = classifyEpisodeSet(episodes, feedings, []);
      const bandSum = dist.bandCounts.rapid + dist.bandCounts.mid + dist.bandCounts.long;
      expect(bandSum).toBe(dist.eligibleCount);
      expect(dist.eligibleCount + dist.ineligible.length).toBe(dist.totalCount);
      expect(dist.totalCount).toBe(episodes.length);
    }
  });
});

// A behaviour-parity pin for PR 2's drop-in: the exact per-episode facts detector ⑤
// computes today, reproduced through this module. If PR 2 rewires ⑤ onto
// classifyEpisodeSet and any of these change, the drop-in was not behaviour-preserving.
describe('mealTiming — parity with detector ⑤ as shipped (guards the PR-2 drop-in)', () => {
  it('reproduces ⑤ eligibility: witnessed+timed in / discovered out / free-fed out', () => {
    const feedings: FeedingInput[] = [
      { ms: at(0), confidence: 'witnessed', form: 'dry treat' },
      { ms: at(8 * HOUR), confidence: 'witnessed', form: 'kibble' },
    ];
    const bowls = [{ fromMs: at(20 * HOUR), untilMs: at(40 * HOUR) }]; // a later free-fed window
    const episodes = [
      { onsetMs: at(15 * MIN), confidence: 'witnessed' as const }, // 15 min after treat → rapid, eligible
      { onsetMs: at(30 * MIN), confidence: 'window' as const }, // discovered → excluded from BOTH sides
      { onsetMs: at(25 * HOUR), confidence: 'witnessed' as const }, // inside the free-fed bowl → excluded
    ];
    const dist = classifyEpisodeSet(episodes, feedings, bowls);

    // Exactly one eligible episode — the rapid one — and it names the treat form for evidence.
    expect(dist.eligibleCount).toBe(1);
    expect(dist.eligible[0]).toMatchObject({ band: 'rapid', minutesSinceFeeding: 15, feedingForm: 'dry treat' });
    // The discovered and the free-fed episodes are ineligible for the reasons ⑤ excludes them.
    const reasons = dist.ineligible.map((e) => e.reason).sort();
    expect(reasons).toEqual(['free_fed', 'not_witnessed']);
  });
});
