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
  feedingIsEatingAnchor,
  type FeedingInput,
  type IntakeRating,
  type MealTimingConfig,
} from './mealTiming';

// A fixed UTC anchor; all fixtures are offsets from it. `Z` pins it to the epoch,
// so the numbers are identical under every runner timezone.
const BASE = Date.parse('2026-07-01T12:00:00Z');
const MIN = 60_000;
const HOUR = 3_600_000;
const at = (msFromBase: number): number => BASE + msFromBase;

// Every intake rating a feeding can carry, unrated included — the property sweeps draw from it.
const RATINGS: readonly (IntakeRating | null)[] = ['refused', 'picked', 'some', 'most', 'all', null];

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
  it('drops estimated/window, keeps null+witnessed, sorts ascending, maps id + form', () => {
    const feedings: FeedingInput[] = [
      { id: 'k', ms: at(3 * HOUR), confidence: 'witnessed', intakeRating: null, form: 'kibble' },
      { id: 'n', ms: at(1 * HOUR), confidence: null, intakeRating: null, form: null }, // legacy NULL kept
      { id: 'e', ms: at(2 * HOUR), confidence: 'estimated', intakeRating: null, form: 'treat' }, // dropped
      { id: 'w', ms: at(4 * HOUR), confidence: 'window', intakeRating: null }, // dropped
      { id: 'x', ms: Number.NaN, confidence: 'witnessed', intakeRating: null }, // non-finite dropped
    ];
    const out = timedEligibleFeedings(feedings);
    expect(out).toEqual([
      { id: 'n', ms: at(1 * HOUR), form: null },
      { id: 'k', ms: at(3 * HOUR), form: 'kibble' },
    ]);
  });

  it('CUL-1122: drops a Refused feeding and keeps every other rating, meal or treat alike', () => {
    const feedings: FeedingInput[] = [
      { id: 'refused', ms: at(1 * HOUR), confidence: 'witnessed', intakeRating: 'refused', form: 'kibble' },
      { id: 'refused-treat', ms: at(2 * HOUR), confidence: 'witnessed', intakeRating: 'refused', form: 'treat' },
      { id: 'picked', ms: at(3 * HOUR), confidence: 'witnessed', intakeRating: 'picked' },
      { id: 'some', ms: at(4 * HOUR), confidence: 'witnessed', intakeRating: 'some' },
      { id: 'most', ms: at(5 * HOUR), confidence: null, intakeRating: 'most' },
      { id: 'all', ms: at(6 * HOUR), confidence: 'witnessed', intakeRating: 'all', form: 'treat' },
      { id: 'unrated', ms: at(7 * HOUR), confidence: 'witnessed', intakeRating: null },
    ];
    expect(timedEligibleFeedings(feedings).map((f) => f.id)).toEqual(['picked', 'some', 'most', 'all', 'unrated']);
  });
});

describe('mealTiming — nearestPrecedingFeeding', () => {
  const feedings = timedEligibleFeedings([
    { id: 'b', ms: at(0), intakeRating: null, form: 'breakfast' },
    { id: 'l', ms: at(5 * HOUR), intakeRating: null, form: 'lunch' },
    { id: 'd', ms: at(9 * HOUR), intakeRating: null, form: 'dinner' },
  ]);

  it('picks the largest instant at/before the onset within the lookback', () => {
    const onset = at(6 * HOUR); // between lunch (5h) and dinner (9h)
    expect(nearestPrecedingFeeding(onset, feedings)).toEqual({ id: 'l', ms: at(5 * HOUR), form: 'lunch' });
  });

  it('ignores feedings after the onset', () => {
    const onset = at(1 * HOUR); // only breakfast precedes
    expect(nearestPrecedingFeeding(onset, feedings)).toEqual({ id: 'b', ms: at(0), form: 'breakfast' });
  });

  it('returns null when the nearest feeding is older than the lookback', () => {
    const onset = at(0 + 25 * HOUR); // breakfast was 25h earlier; lookback is 24h
    expect(nearestPrecedingFeeding(onset, [{ id: 'b', ms: at(0), form: 'breakfast' }])).toBeNull();
  });

  it('includes a feeding exactly at the lookback boundary and exactly at the onset', () => {
    const onset = at(24 * HOUR);
    const exactlyLookback = [{ id: 'x', ms: at(0), form: 'x' }]; // 24h before → inclusive
    expect(nearestPrecedingFeeding(onset, exactlyLookback)).toEqual({ id: 'x', ms: at(0), form: 'x' });
    const atOnset = [{ id: 'y', ms: at(24 * HOUR), form: 'y' }]; // gap 0
    expect(nearestPrecedingFeeding(onset, atOnset)).toEqual({ id: 'y', ms: at(24 * HOUR), form: 'y' });
  });

  it('is order-independent (does not rely on a sorted input)', () => {
    const unsorted = [
      { id: 'd', ms: at(9 * HOUR), form: 'dinner' },
      { id: 'b', ms: at(0), form: 'breakfast' },
      { id: 'l', ms: at(5 * HOUR), form: 'lunch' },
    ];
    expect(nearestPrecedingFeeding(at(6 * HOUR), unsorted)).toEqual({ id: 'l', ms: at(5 * HOUR), form: 'lunch' });
  });

  it('B-788 — same-ms tie keeps the FIRST feeding in input order (a KNOWN divergence from the v27 ⑤ engine, which kept the last)', () => {
    // Two feedings at the IDENTICAL instant, different forms. This function keeps the FIRST in
    // iteration order (strict `f.ms > best.ms`, mealTiming.ts:302 — a later equal-ms never overwrites).
    // The deployed v27 inline `nearestPreceding` overwrote on every qualifier, so it kept the LAST.
    // The B-777 adversarial fuzz surfaced this: on a same-ms tie it flips ⑤'s `feedingFormsInEvidence`
    // (evidence-form label only — no band, count, rank, or firing decision moves — but the label rides
    // into the vet report, so ⑤ is NOT strictly byte-identical vs v27 here). Pinned so the tie-break
    // can't drift again silently while B-788 is open (aligning this SHARED predicate to v27's
    // last-of-equal-ms also moves the client Patterns render + the report → a Data/T&S call). If B-788
    // restores v27's behaviour, this expectation becomes `form: 'FormB'`.
    const onset = at(6 * HOUR);
    const tie = [
      { id: 'a', ms: at(5 * HOUR), form: 'FormA' },
      { id: 'b', ms: at(5 * HOUR), form: 'FormB' },
    ];
    expect(nearestPrecedingFeeding(onset, tie)).toEqual({ id: 'a', ms: at(5 * HOUR), form: 'FormA' });
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
  const feedings: FeedingInput[] = [{ id: 'k', ms: at(0), confidence: 'witnessed', intakeRating: null, form: 'kibble' }];
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
    expect(r).toEqual({ eligible: true, minutesSinceFeeding: 12, band: 'rapid', feedingId: 'k', feedingForm: 'kibble' });
  });

  it('eligible MID: witnessed onset 2h after the meal', () => {
    const r = classifyEpisodeTiming({ onsetMs: at(2 * HOUR), confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toMatchObject({ eligible: true, minutesSinceFeeding: 120, band: 'mid' });
  });

  it('eligible LONG: witnessed onset 6.5h after the meal (the empty-stomach band)', () => {
    const r = classifyEpisodeTiming({ onsetMs: at(6.5 * HOUR), confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toMatchObject({ eligible: true, minutesSinceFeeding: 390, band: 'long' });
  });

  it('a NON-FINITE onset never classifies as eligible with a NaN band (adversarial NIT)', () => {
    // Regression: a NaN onset once passed every nearest-preceding comparison and returned
    // {eligible:true, minutesSinceFeeding:NaN, band:'mid'}. It must be ineligible instead.
    const r = classifyEpisodeTiming({ onsetMs: Number.NaN, confidence: 'witnessed' }, feedings, noBowls);
    expect(r.eligible).toBe(false);
    // The helpers reject it directly too (belt-and-suspenders for direct callers).
    expect(nearestPrecedingFeeding(Number.NaN, timedEligibleFeedings(feedings))).toBeNull();
    expect(isFreeFedNear(Number.NaN, [{ fromMs: at(-HOUR), untilMs: at(HOUR) }])).toBe(false);
  });
});

describe('mealTiming — classifyEpisodeSet (the distribution the surfaces read)', () => {
  it('splits eligible/ineligible, counts bands, and keeps honest denominators', () => {
    const feedings: FeedingInput[] = [{ id: 'k', ms: at(0), confidence: 'witnessed', intakeRating: null, form: 'kibble' }];
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
        feedings.push({
          id: `f${i}`,
          ms: at(Math.floor(rng() * 24 * HOUR)),
          confidence: rng() < 0.5 ? 'witnessed' : null,
          intakeRating: RATINGS[Math.floor(rng() * RATINGS.length)],
        });
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
      { id: 't', ms: at(0), confidence: 'witnessed', intakeRating: null, form: 'dry treat' },
      { id: 'k', ms: at(8 * HOUR), confidence: 'witnessed', intakeRating: null, form: 'kibble' },
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
    expect(dist.eligible[0]).toMatchObject({ band: 'rapid', minutesSinceFeeding: 15, feedingId: 't', feedingForm: 'dry treat' });
    // The discovered and the free-fed episodes are ineligible for the reasons ⑤ excludes them.
    const reasons = dist.ineligible.map((e) => e.reason).sort();
    expect(reasons).toEqual(['free_fed', 'not_witnessed']);
  });
});

// ── CUL-1122: a refused bowl is not eating (HV-2 / CUL-1159) ──────────────────
//
// The ruling (Dr. Chen lens, recorded on CUL-1122): a feeding anchors when food went in. Refused
// never does; Picked at, Some, Most, All and an unrated bowl do; the rule reads the rating, never the
// food type. The named counterexamples below are the issue's own.

describe('mealTiming — CUL-1122: which ratings are eating', () => {
  it('the ruling, one row per rating: only Refused is not an eating anchor', () => {
    expect(feedingIsEatingAnchor('refused')).toBe(false);
    expect(feedingIsEatingAnchor('picked')).toBe(true);
    expect(feedingIsEatingAnchor('some')).toBe(true);
    expect(feedingIsEatingAnchor('most')).toBe(true);
    expect(feedingIsEatingAnchor('all')).toBe(true);
    // Unrated is presumed eaten (exception-only rating, CUL-1118): never an invented refusal.
    expect(feedingIsEatingAnchor(null)).toBe(true);
    expect(feedingIsEatingAnchor(undefined)).toBe(true);
    // A value outside the enum anchors, as every feeding did before the rating was read.
    expect(feedingIsEatingAnchor('licked' as IntakeRating)).toBe(true);
  });
});

describe('mealTiming — CUL-1122: the named counterexamples', () => {
  // A local 8 AM breakfast and a 10 PM dinner on one day, as offsets from BASE (the numbers are
  // differences of instants, so the wall-clock names are labels, not a time zone).
  const H8 = at(0);
  const H22 = at(14 * HOUR);
  const noBowls: { fromMs: number; untilMs: number }[] = [];

  it('Pixel refuses the 10 PM bowl and vomits at 10:05 — timed from the 8 AM meal she ate, 845 min, long band', () => {
    const feedings: FeedingInput[] = [
      { id: 'breakfast', ms: H8, confidence: 'witnessed', intakeRating: null, form: 'kibble' },
      { id: 'dinner', ms: H22, confidence: 'witnessed', intakeRating: 'refused', form: 'kibble' },
    ];
    const r = classifyEpisodeTiming({ onsetMs: H22 + 5 * MIN, confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toEqual({
      eligible: true,
      minutesSinceFeeding: 14 * 60 + 5,
      band: 'long',
      feedingId: 'breakfast',
      feedingForm: 'kibble',
    });
  });

  it('Pixel with nothing eaten in the lookback — refused_only, never timed, never "no meal logged"', () => {
    const feedings: FeedingInput[] = [
      { id: 'two-days-ago', ms: H22 - 30 * HOUR, confidence: 'witnessed', intakeRating: 'all' }, // outside 24h
      { id: 'dinner', ms: H22, confidence: 'witnessed', intakeRating: 'refused' },
    ];
    const r = classifyEpisodeTiming({ onsetMs: H22 + 5 * MIN, confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toEqual({ eligible: false, reason: 'refused_only' });
  });

  it('a refusal OUTSIDE the lookback is not a reason — nothing logged in the prior day is no_preceding_feeding', () => {
    const feedings: FeedingInput[] = [
      { id: 'old-refusal', ms: H22 - 30 * HOUR, confidence: 'witnessed', intakeRating: 'refused' },
    ];
    const r = classifyEpisodeTiming({ onsetMs: H22 + 5 * MIN, confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toEqual({ eligible: false, reason: 'no_preceding_feeding' });
  });

  it('a refusal whose time is a guess is not a reason either — only time-trustworthy feedings are read at all', () => {
    const feedings: FeedingInput[] = [
      { id: 'estimated-refusal', ms: H22, confidence: 'estimated', intakeRating: 'refused' },
    ];
    const r = classifyEpisodeTiming({ onsetMs: H22 + 5 * MIN, confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toEqual({ eligible: false, reason: 'no_preceding_feeding' });
  });

  it('a staple dinner at 6 PM followed by a refused treat at 9 PM — a 9:10 vomit is 190 min after dinner', () => {
    const dinner = at(10 * HOUR);
    const feedings: FeedingInput[] = [
      { id: 'dinner', ms: dinner, confidence: 'witnessed', intakeRating: 'all', form: 'kibble' },
      { id: 'snack', ms: dinner + 3 * HOUR, confidence: 'witnessed', intakeRating: 'refused', form: 'dry treat' },
    ];
    const r = classifyEpisodeTiming({ onsetMs: dinner + 3 * HOUR + 10 * MIN, confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toEqual({ eligible: true, minutesSinceFeeding: 190, band: 'mid', feedingId: 'dinner', feedingForm: 'kibble' });
  });

  it('a picked-at vehicle meal carrying a dose at 1 PM — a 1:10 vomit is 10 min after it, and names it', () => {
    const lunch = at(5 * HOUR);
    const feedings: FeedingInput[] = [
      { id: 'breakfast', ms: H8, confidence: 'witnessed', intakeRating: 'all' },
      { id: 'vehicle', ms: lunch, confidence: 'witnessed', intakeRating: 'picked', form: 'wet' },
    ];
    const r = classifyEpisodeTiming({ onsetMs: lunch + 10 * MIN, confidence: 'witnessed' }, feedings, noBowls);
    expect(r).toEqual({ eligible: true, minutesSinceFeeding: 10, band: 'rapid', feedingId: 'vehicle', feedingForm: 'wet' });
  });

  it('a refused TREAT never anchors; a treat she ate does', () => {
    const feedings: FeedingInput[] = [
      { id: 'meal', ms: H8, confidence: 'witnessed', intakeRating: null, form: 'kibble' },
      { id: 'treat-refused', ms: H8 + 4 * HOUR, confidence: 'witnessed', intakeRating: 'refused', form: 'dry treat' },
      { id: 'treat-eaten', ms: H8 + 6 * HOUR, confidence: 'witnessed', intakeRating: 'all', form: 'dry treat' },
    ];
    const afterRefused = classifyEpisodeTiming({ onsetMs: H8 + 4 * HOUR + 5 * MIN, confidence: 'witnessed' }, feedings, noBowls);
    expect(afterRefused).toMatchObject({ eligible: true, feedingId: 'meal', minutesSinceFeeding: 245, band: 'mid' });
    const afterEaten = classifyEpisodeTiming({ onsetMs: H8 + 6 * HOUR + 5 * MIN, confidence: 'witnessed' }, feedings, noBowls);
    expect(afterEaten).toMatchObject({ eligible: true, feedingId: 'treat-eaten', minutesSinceFeeding: 5, band: 'rapid' });
  });

  it('the gate order holds with a refusal present: a discovered onset and a free-fed bowl still win', () => {
    const feedings: FeedingInput[] = [{ id: 'dinner', ms: H22, confidence: 'witnessed', intakeRating: 'refused' }];
    const onset = H22 + 5 * MIN;
    expect(classifyEpisodeTiming({ onsetMs: onset, confidence: 'estimated' }, feedings, noBowls)).toEqual({
      eligible: false,
      reason: 'not_witnessed',
    });
    const bowl = [{ fromMs: H22 - HOUR, untilMs: H22 + HOUR }];
    expect(classifyEpisodeTiming({ onsetMs: onset, confidence: 'witnessed' }, feedings, bowl)).toEqual({
      eligible: false,
      reason: 'free_fed',
    });
  });
});

describe('mealTiming — CUL-1122 properties over random records with refusals', () => {
  const LOOKBACK = DEFAULT_MEAL_TIMING_CONFIG.feedingLookbackHours * HOUR;

  function randomRecord(rng: () => number) {
    const feedings: FeedingInput[] = [];
    const fCount = Math.floor(rng() * 8);
    for (let i = 0; i < fCount; i++) {
      const confs = ['witnessed', null, 'estimated'] as const;
      feedings.push({
        id: `f${i}`,
        ms: at(Math.floor(rng() * 48 * HOUR)),
        confidence: confs[Math.floor(rng() * confs.length)],
        intakeRating: RATINGS[Math.floor(rng() * RATINGS.length)],
      });
    }
    const episodes: { onsetMs: number; confidence: 'witnessed' }[] = [];
    const eCount = 1 + Math.floor(rng() * 8);
    for (let i = 0; i < eCount; i++) episodes.push({ onsetMs: at(Math.floor(rng() * 50 * HOUR)), confidence: 'witnessed' });
    return { feedings, episodes };
  }

  const eatenAndTimed = (f: FeedingInput) =>
    (f.confidence == null || f.confidence === 'witnessed') && f.intakeRating !== 'refused' && Number.isFinite(f.ms);

  it('PROPERTY: an eligible episode is timed from the LATEST eaten, time-trustworthy feeding in its lookback — never a refused one', () => {
    const rng = makeRng(1122);
    let eligibleSeen = 0;
    for (let trial = 0; trial < 400; trial++) {
      const { feedings, episodes } = randomRecord(rng);
      const dist = classifyEpisodeSet(episodes, feedings, []);
      for (const e of dist.eligible) {
        eligibleSeen++;
        const anchor = feedings.find((f) => f.id === e.feedingId);
        expect(anchor).toBeDefined();
        expect(anchor!.intakeRating).not.toBe('refused');
        expect(eatenAndTimed(anchor!)).toBe(true);
        expect(anchor!.ms).toBeLessThanOrEqual(e.onsetMs);
        expect(e.onsetMs - anchor!.ms).toBeLessThanOrEqual(LOOKBACK);
        expect(e.minutesSinceFeeding).toBe((e.onsetMs - anchor!.ms) / MIN);
        // Nothing she ate sits between the anchor and the onset.
        const later = feedings.filter((f) => eatenAndTimed(f) && f.ms > anchor!.ms && f.ms <= e.onsetMs);
        expect(later).toEqual([]);
      }
    }
    expect(eligibleSeen).toBeGreaterThan(200); // non-vacuity: the sweep checked real timings
  });

  it('PROPERTY: deleting every refused feeding changes no timing — it only turns refused_only into no_preceding_feeding', () => {
    const rng = makeRng(2211);
    let refusedOnlySeen = 0;
    for (let trial = 0; trial < 400; trial++) {
      const { feedings, episodes } = randomRecord(rng);
      const withRefusals = classifyEpisodeSet(episodes, feedings, []);
      const without = classifyEpisodeSet(episodes, feedings.filter((f) => f.intakeRating !== 'refused'), []);
      expect(withRefusals.eligible).toEqual(without.eligible);
      expect(withRefusals.bandCounts).toEqual(without.bandCounts);
      expect(withRefusals.ineligible.length).toBe(without.ineligible.length);
      withRefusals.ineligible.forEach((e, i) => {
        const bare = without.ineligible[i];
        expect(bare.onsetMs).toBe(e.onsetMs);
        if (e.reason === 'refused_only') {
          refusedOnlySeen++;
          expect(bare.reason).toBe('no_preceding_feeding');
          // …and the record really does hold a trustworthy refusal inside this episode's lookback.
          const refusalInLookback = feedings.some(
            (f) =>
              f.intakeRating === 'refused' &&
              (f.confidence == null || f.confidence === 'witnessed') &&
              f.ms <= e.onsetMs &&
              e.onsetMs - f.ms <= LOOKBACK,
          );
          expect(refusalInLookback).toBe(true);
        } else {
          expect(bare.reason).toBe(e.reason);
        }
      });
    }
    expect(refusedOnlySeen).toBeGreaterThan(20); // non-vacuity: the refused_only branch was exercised
  });
});
