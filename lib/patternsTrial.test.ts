// Unit tests for "The trial so far" panel model (Signals v2 / B-755 PR 9, CUL-11).
// The DB wrapper (getTrialPanel) wires the sanctioned loaders; the load-bearing logic —
// windowing on the EVIDENCE bound, the phenotype counts through lib/mealTiming, the
// diet-structure ratios, the never-verdict copy — lives in the pure core, which is
// what these hit. dayIndexOf is injected so the window is pinned, not clock-dependent.

// patternsTrial imports lib/analytics + lib/dietTrialFacts, which pull
// feedingArrangements → lib/sync → lib/supabase and its fail-fast env check. The pure
// core exercised here touches none of that, so stub the edge of the graph exactly as
// dietTrialFacts.test.ts / dietTrialCard.test.ts do.
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import {
  buildTrialSoFar,
  trialContextLine,
  trialPhenotypeSampleLine,
  trialPhenotypeUntimedLine,
  trialTreatShareValue,
  trialMealsPerDayValue,
  trialHonestyLine,
  timingBandLabel,
  type TrialSoFarInput,
} from './patternsTrial';
import { DEFAULT_MEAL_TIMING_CONFIG, type FreeFedSpan } from './mealTiming';
import type { FeedingRow } from './patternsTiming';

const MS_PER_DAY = 86_400_000;
const at = (day: number, hour: number, min = 0): number =>
  day * MS_PER_DAY + hour * 3_600_000 + min * 60_000;
const dayIndexOf = (ms: number): number => Math.floor(ms / MS_PER_DAY);

// Trial window = days 100..130. Feedings/vomits span in- and out-of-window so the
// evidence-window clip is exercised.
function scenario(overrides: Partial<TrialSoFarInput> = {}): TrialSoFarInput {
  const feedings: FeedingRow[] = [
    { ms: at(90, 8), confidence: 'witnessed', form: 'Kibble', foodType: 'meal' }, // pre-trial
    { ms: at(105, 8), confidence: 'witnessed', form: 'Kibble', foodType: 'meal' },
    { ms: at(106, 12), confidence: 'witnessed', form: 'Treat', foodType: 'treat' },
    { ms: at(107, 12), confidence: 'witnessed', form: 'Treat', foodType: 'treat' },
    { ms: at(110, 20), confidence: 'witnessed', form: 'Wet', foodType: 'meal' },
    { ms: at(120, 9), confidence: 'witnessed', form: 'Kibble', foodType: 'meal' },
  ];
  const vomitOnsets = [
    { ms: at(90, 8, 15), confidence: 'witnessed' as const }, // rapid, OUT of window
    { ms: at(105, 8, 20), confidence: 'witnessed' as const }, // 20m rapid, in window
    { ms: at(111, 4), confidence: 'witnessed' as const }, // 8h long (after day110 20:00), in window
    { ms: at(120, 11), confidence: 'witnessed' as const }, // 2h mid, in window
    { ms: at(125, 10), confidence: 'estimated' as const }, // untimed (not witnessed), in window
  ];
  return {
    progress: { dayCounter: 25, targetDays: 31 },
    exposureRange: { startDayIndex: 100, endDayIndex: 130 },
    foodLabel: 'Royal Canin HP',
    vomitOnsets,
    feedings,
    freeFedSpans: [] as FreeFedSpan[],
    dayIndexOf,
    ...overrides,
  };
}

describe('buildTrialSoFar — phenotype rows through lib/mealTiming, windowed on the evidence bound', () => {
  it('counts only in-window episodes, split by phenotype', () => {
    const m = buildTrialSoFar(scenario())!;
    expect(m).not.toBeNull();
    const [rapid, mid, long] = m.phenotype.bandRows;
    expect([rapid.count, mid.count, long.count]).toEqual([1, 1, 1]);
    expect(m.phenotype.timeableCount).toBe(3);
    expect(m.phenotype.untimedCount).toBe(1); // day125 estimated → not_witnessed
    expect(m.phenotype.totalCount).toBe(4);
    // The pre-trial rapid episode (day 90) is clipped by the window, not counted.
    expect(rapid.medianMinutes).toBe(20);
  });

  it('diet-structure: treat share over classifiable feedings, meals per logged day', () => {
    const m = buildTrialSoFar(scenario())!;
    // In window: meals {105,110,120}=3, treats {106,107}=2 → 2/5 = 40%.
    expect(m.structure.treatShare).toBeCloseTo(0.4, 10);
    expect(m.structure.classifiableFeedings).toBe(5);
    // Logged days in window: {105,106,107,110,120} = 5; meals 3 → 0.6/day.
    expect(m.structure.loggedDays).toBe(5);
    expect(m.structure.mealsPerDay).toBeCloseTo(0.6, 10);
  });

  it('collapse-then-window: a bout straddling the window start collapses to its (pre-window) onset', () => {
    const s = scenario({
      vomitOnsets: [
        { ms: at(99, 23), confidence: 'witnessed' }, // bout onset, pre-window
        { ms: at(100, 1), confidence: 'witnessed' }, // 2h later — SAME episode, in-window instant
      ],
      feedings: [{ ms: at(99, 22), confidence: 'witnessed', form: 'Kibble', foodType: 'meal' }],
    });
    const m = buildTrialSoFar(s)!;
    // One episode, placed by its collapsed onset (day 99) → OUT of window. Never split
    // into a phantom in-window episode.
    expect(m.phenotype.totalCount).toBe(0);
  });

  it('returns null when there is no placeable window (no trial / unparseable start)', () => {
    expect(buildTrialSoFar(scenario({ exposureRange: null }))).toBeNull();
    expect(buildTrialSoFar(scenario({ progress: null }))).toBeNull();
  });

  it('flags an overrun trial (dayCounter past target) without inventing "N of M"', () => {
    const m = buildTrialSoFar(scenario({ progress: { dayCounter: 61, targetDays: 56 } }))!;
    expect(m.overrun).toBe(true);
    expect(trialContextLine(m)).toBe('Royal Canin HP · Day 61 — the 56-day window is done');
  });
});

describe('copy — count-anchored, never verdicted (§2 L2 / §6)', () => {
  it('band labels are the same timing-only words the Timing panel uses (G9)', () => {
    const cfg = DEFAULT_MEAL_TIMING_CONFIG;
    expect(timingBandLabel('long', cfg)).toBe('6h or more after eating');
  });

  it('the context line reads "food · Day N of M" and both numbers always print', () => {
    const m = buildTrialSoFar(scenario())!;
    expect(trialContextLine(m)).toBe('Royal Canin HP · Day 25 of 31');
    expect(trialPhenotypeSampleLine(m.phenotype)).toBe('3 timed of 4 vomiting episodes during the trial');
    expect(trialPhenotypeUntimedLine(m.phenotype)).toMatch(/1 more episode couldn't be timed/);
  });

  it('diet-structure values render honestly (percent / one-decimal rate) and the no-data forms', () => {
    const m = buildTrialSoFar(scenario())!;
    expect(trialTreatShareValue(m.structure)).toBe('40% of feedings');
    expect(trialMealsPerDayValue(m.structure)).toBe('0.6 per day');
    expect(trialTreatShareValue({ treatShare: null, mealsPerDay: null, loggedDays: 0, classifiableFeedings: 0 })).toBe('no feedings logged');
    expect(trialMealsPerDayValue({ treatShare: null, mealsPerDay: null, loggedDays: 0, classifiableFeedings: 0 })).toBe('no days logged');
  });

  it('the honesty line says WHAT-not-WHY and carries no verdict/attribution', () => {
    const line = trialHonestyLine().toLowerCase();
    expect(line).toMatch(/not why/);
    expect(line).not.toMatch(/working|helping|improv|ruled out|\bclean\b|because of|caused/);
    expect(trialHonestyLine()).not.toContain('!');
  });
});
