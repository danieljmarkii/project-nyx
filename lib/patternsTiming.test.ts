// Unit tests for the Patterns "Timing" panel model (Signals v2 / B-755 PR 9, CUL-11).
// The DB wrapper (getTimingPanel) is thin I/O; the load-bearing logic — and the G9
// guarantee that all timing runs through lib/mealTiming — lives in the pure core and
// the geometry, which is what these hit.

import {
  buildTimingDistribution,
  patternsTimingPos,
  patternsTimingAxis,
  parseFreeFedSpans,
  timingBandLabel,
  timingPanelLead,
  timingSampleLine,
  timingUntimedLine,
  timingUntimedBreakdown,
  timingBandMedianLabel,
  timingNoneTimeableLine,
  PATTERNS_TIMING_AXIS_MAX_MIN,
  PATTERNS_TIMING_EARLY_FRAC,
  type TimingDistributionInput,
} from './patternsTiming';
import { DEFAULT_MEAL_TIMING_CONFIG, type FeedingInput } from './mealTiming';

const ms = (iso: string): number => Date.parse(iso);

// A record spanning rapid / mid / long eligible episodes + one of each untimed reason.
function scenario(): TimingDistributionInput {
  const feedings: FeedingInput[] = [
    { ms: ms('2026-05-01T08:00:00Z'), confidence: 'witnessed', form: 'Kibble' }, // F1
    { ms: ms('2026-05-01T20:00:00Z'), confidence: 'witnessed', form: 'Wet' }, // F2
    { ms: ms('2026-05-03T09:00:00Z'), confidence: 'witnessed', form: 'Kibble' }, // F3
    { ms: ms('2026-05-09T07:00:00Z'), confidence: 'witnessed', form: 'Kibble' }, // F6
  ];
  const vomitOnsets = [
    { ms: ms('2026-05-01T08:15:00Z'), confidence: 'witnessed' as const }, // V1 → 15m rapid
    { ms: ms('2026-05-02T03:00:00Z'), confidence: 'witnessed' as const }, // V2 → 7h long
    { ms: ms('2026-05-03T11:00:00Z'), confidence: 'witnessed' as const }, // V3 → 2h mid
    { ms: ms('2026-05-05T12:00:00Z'), confidence: 'estimated' as const }, // V4 → not_witnessed
    { ms: ms('2026-05-07T10:00:00Z'), confidence: 'witnessed' as const }, // V5 → no preceding feeding in 24h
    { ms: ms('2026-05-09T09:00:00Z'), confidence: 'witnessed' as const }, // V6 → free-fed
  ];
  // A free-choice bowl down all of 05-09 makes V6's "minutes since eating" fiction.
  const freeFedSpans = parseFreeFedSpans([{ active_from: '2026-05-09', active_until: '2026-05-09' }]);
  return { vomitOnsets, feedings, freeFedSpans };
}

describe('patternsTimingPos — the shared-band geometry', () => {
  it('pins the anchors: ate→0, rapid window→EARLY_FRAC, cap→1', () => {
    expect(patternsTimingPos(0)).toBe(0);
    expect(patternsTimingPos(DEFAULT_MEAL_TIMING_CONFIG.rapidWindowMinutes)).toBeCloseTo(
      PATTERNS_TIMING_EARLY_FRAC,
      10,
    );
    expect(patternsTimingPos(PATTERNS_TIMING_AXIS_MAX_MIN)).toBeCloseTo(1, 10);
  });

  it('clamps a late outlier to the lane end rather than overflowing', () => {
    expect(patternsTimingPos(PATTERNS_TIMING_AXIS_MAX_MIN + 600)).toBeCloseTo(1, 10);
    // A 24h-lookback episode (1440 min) still pins to 1, never > 1.
    expect(patternsTimingPos(1440)).toBeCloseTo(1, 10);
  });

  it('is monotonic non-decreasing across the whole range (time order = left→right)', () => {
    let prev = -1;
    for (let m = 0; m <= 600; m += 3) {
      const p = patternsTimingPos(m);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = p;
    }
  });

  it('degenerate config never yields NaN/Infinity', () => {
    const bad = { ...DEFAULT_MEAL_TIMING_CONFIG, rapidWindowMinutes: 0 };
    expect(Number.isFinite(patternsTimingPos(60, bad))).toBe(true);
  });
});

describe('patternsTimingAxis', () => {
  it('reads "ate · 30m · 1h · 2h · 4h · 8h+" on the shipped defaults', () => {
    const axis = patternsTimingAxis();
    expect(axis.map((t) => t.label)).toEqual(['ate', '30m', '1h', '2h', '4h', '8h+']);
    // The doubling grid lands evenly in the log tail.
    expect(axis.map((t) => Number(t.pos.toFixed(4)))).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
});

describe('buildTimingDistribution — the full-record distribution through lib/mealTiming', () => {
  it('bands the eligible episodes and discloses each untimed reason as a count', () => {
    const m = buildTimingDistribution(scenario());
    expect(m.eligibleCount).toBe(3);
    expect(m.untimedCount).toBe(3); // not_witnessed + no_preceding + free_fed
    expect(m.totalCount).toBe(6);
    const [rapid, mid, long] = m.bandRows;
    expect([rapid.count, mid.count, long.count]).toEqual([1, 1, 1]);
    expect(rapid.medianMinutes).toBe(15);
    expect(mid.medianMinutes).toBe(120);
    expect(long.medianMinutes).toBe(420);
  });

  it('breaks the untimed count out by reason, never imputing them onto the lane', () => {
    const m = buildTimingDistribution(scenario());
    expect(m.untimedReasons).toEqual({ not_witnessed: 1, no_preceding_feeding: 1, free_fed: 1 });
    const breakdown = timingUntimedBreakdown(m)!;
    expect(breakdown).toMatch(/1 discovered later/);
    expect(breakdown).toMatch(/no meal logged in the prior day/);
    expect(breakdown).toMatch(/free-fed bowl/);
  });

  it('places dots at true positions, ascending, one per timeable episode', () => {
    const m = buildTimingDistribution(scenario());
    expect(m.dots).toHaveLength(3);
    const positions = m.dots.map((d) => d.pos);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions); // already ascending
    expect(m.dots.map((d) => d.band)).toEqual(['rapid', 'mid', 'long']);
  });

  it('counts the FULL record — a years-old episode is not windowed out', () => {
    const base = scenario();
    const withOld: TimingDistributionInput = {
      ...base,
      feedings: [{ ms: ms('2020-01-01T08:00:00Z'), confidence: 'witnessed', form: 'Kibble' }, ...base.feedings],
      vomitOnsets: [{ ms: ms('2020-01-01T08:10:00Z'), confidence: 'witnessed' }, ...base.vomitOnsets],
    };
    const m = buildTimingDistribution(withOld);
    expect(m.eligibleCount).toBe(4); // the 2020 rapid episode is included
    expect(m.bandRows[0].count).toBe(2); // two rapid now
  });

  it('collapses a re-logged bout into one episode (3h gap rule, via lib/mealTiming)', () => {
    const input: TimingDistributionInput = {
      feedings: [{ ms: ms('2026-05-01T08:00:00Z'), confidence: 'witnessed', form: 'Kibble' }],
      vomitOnsets: [
        { ms: ms('2026-05-01T08:15:00Z'), confidence: 'witnessed' },
        { ms: ms('2026-05-01T09:00:00Z'), confidence: 'witnessed' }, // 45m later — same episode
      ],
      freeFedSpans: [],
    };
    const m = buildTimingDistribution(input);
    expect(m.totalCount).toBe(1);
    expect(m.eligibleCount).toBe(1);
  });

  it('a pet with episodes but none timeable → 0 eligible, honest untimed count', () => {
    const input: TimingDistributionInput = {
      feedings: [],
      vomitOnsets: [
        { ms: ms('2026-05-01T08:15:00Z'), confidence: 'witnessed' },
        { ms: ms('2026-05-02T08:15:00Z'), confidence: 'estimated' },
      ],
      freeFedSpans: [],
    };
    const m = buildTimingDistribution(input);
    expect(m.eligibleCount).toBe(0);
    expect(m.dots).toHaveLength(0);
    expect(m.untimedCount).toBe(2);
    expect(m.totalCount).toBe(2);
  });
});

describe('parseFreeFedSpans — parity with the engine classifyArrangements', () => {
  it('covers the whole active_until DAY (+1 day) and keeps an open bowl open', () => {
    const [closed] = parseFreeFedSpans([{ active_from: '2026-05-01', active_until: '2026-05-01' }]);
    expect(closed.fromMs).toBe(Date.parse('2026-05-01'));
    expect(closed.untilMs).toBe(Date.parse('2026-05-01') + 86_400_000);
    const [open] = parseFreeFedSpans([{ active_from: '2026-05-01', active_until: null }]);
    expect(open.untilMs).toBe(Infinity);
    const [openBoth] = parseFreeFedSpans([{ active_from: null, active_until: null }]);
    expect(openBoth.fromMs).toBe(-Infinity);
  });

  it('drops inverted / unparseable spans', () => {
    expect(parseFreeFedSpans([{ active_from: '2026-05-05', active_until: '2026-05-01' }])).toEqual([]);
    expect(parseFreeFedSpans([{ active_from: 'not-a-date', active_until: null }])).toEqual([]);
  });
});

describe('copy — nyx-voice + the §6 guardrail spine', () => {
  const cfg = DEFAULT_MEAL_TIMING_CONFIG;

  it('band labels are timing-only: no mechanism, no syndrome, no verdict', () => {
    const labels = (['rapid', 'mid', 'long'] as const).map((b) => timingBandLabel(b, cfg));
    expect(labels).toEqual([
      'Within 30 min of eating',
      '30 min to 6h after eating',
      '6h or more after eating',
    ]);
    for (const s of labels) {
      expect(s.toLowerCase()).not.toMatch(/empty stomach|bilious|picky|preference|working|clear/);
      expect(s).not.toContain('!');
    }
  });

  it('the sample line always prints both count and denominator', () => {
    const m = buildTimingDistribution(scenario());
    expect(timingSampleLine(m)).toBe('3 timed of 6 episodes · whole record');
  });

  it('untimed line is a count and is null when everything could be timed', () => {
    const m = buildTimingDistribution(scenario());
    expect(timingUntimedLine(m)).toMatch(/3 episodes couldn't be timed/);
    const allTimed = buildTimingDistribution({
      feedings: [{ ms: ms('2026-05-01T08:00:00Z'), confidence: 'witnessed', form: 'Kibble' }],
      vomitOnsets: [{ ms: ms('2026-05-01T08:15:00Z'), confidence: 'witnessed' }],
      freeFedSpans: [],
    });
    expect(timingUntimedLine(allTimed)).toBeNull();
  });

  it('band median labels read in minutes, then hours past 90 min', () => {
    expect(timingBandMedianLabel(15)).toBe('typically about 15 min');
    expect(timingBandMedianLabel(420)).toBe('typically about 7h');
    expect(timingBandMedianLabel(null)).toBeNull();
  });

  it('the none-timeable + lead lines name the pet and never reassure', () => {
    expect(timingNoneTimeableLine('Nyx', 4)).toMatch(/None of Nyx's 4 logged vomiting episodes/);
    expect(timingNoneTimeableLine('Nyx', 4)).not.toMatch(/fine|healthy|nothing to worry|all clear/i);
    expect(timingPanelLead('Nyx')).toContain('Nyx');
    expect(timingPanelLead('Nyx')).not.toContain('!');
  });
});
