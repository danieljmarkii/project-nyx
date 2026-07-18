// These tests exercise only the PURE helpers; mock ./db so the static getDb
// import in rundown.ts doesn't pull expo-sqlite into the jest environment (the
// orchestrator's DB reads are covered by the aggregate layer's own tests).
// Controllable local-DB mock (names are `mock`-prefixed so the hoisted factory
// may close over them). Default: an empty store. Individual tests set per-query
// implementations via mockGetAllAsync/mockGetFirstAsync.
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
const mockGetFirstAsync = jest.fn().mockResolvedValue(null);
jest.mock('./db', () => ({
  getDb: () => ({ getAllAsync: mockGetAllAsync, getFirstAsync: mockGetFirstAsync }),
}));
// Break the transitive import chain to ./supabase (which throws without env
// config) — analytics and weight both reach it. Stub the client + ./sync at the
// root so the modules under test load cleanly; ./utils stays real
// (distinctLocalDays uses the real toLocalDayKey).
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('./sync', () => ({}));
// Override only the async aggregate WRAPPERS the orchestrator calls; keep the
// real pure cores (calendarWindow / WINDOW_DAYS / isNotEnoughData / computeWeightTrend).
const mockGetSymptomCounts = jest.fn().mockResolvedValue([]);
const mockGetIntakeRate = jest.fn().mockResolvedValue({ status: 'not_enough_data', samples: 0, needed: 4 });
const mockGetWeightHistory = jest.fn().mockResolvedValue([]);
jest.mock('./analytics', () => ({
  ...jest.requireActual('./analytics'),
  getSymptomCounts: (...a: unknown[]) => mockGetSymptomCounts(...a),
  getIntakeRate: (...a: unknown[]) => mockGetIntakeRate(...a),
}));
jest.mock('./weight', () => ({
  ...jest.requireActual('./weight'),
  getWeightHistory: (...a: unknown[]) => mockGetWeightHistory(...a),
}));

import {
  buildRundown,
  computeTimingCluster,
  computeWeightRange,
  distinctLocalDays,
  symptomTileValue,
  timingTileValue,
  weightTileValue,
  weighInCountLabel,
  appetiteTileValue,
  frequencyLabel,
  lastDoseLabel,
  sinceVisitValue,
  sinceVisitTap,
  visitDateLabel,
  rundownDateLine,
  rundownToPlainText,
  TIME_BANDS,
  TIMING_MIN_EVENTS,
  type TimingCluster,
  type Rundown,
} from './rundown';

describe('computeTimingCluster', () => {
  it('returns null below the minimum event floor', () => {
    expect(computeTimingCluster([1, 2])).toBeNull();
    expect(TIMING_MIN_EVENTS).toBe(3);
  });

  it('reports a clear overnight cluster', () => {
    // 5 of 7 between 12am–8am — the mock's canonical shape.
    const cluster = computeTimingCluster([1, 2, 3, 4, 5, 14, 20]);
    expect(cluster).not.toBeNull();
    expect(cluster?.band.key).toBe('overnight');
    expect(cluster?.count).toBe(5);
    expect(cluster?.total).toBe(7);
  });

  it('returns null when events are spread with no majority band', () => {
    // 3 bands, evenly split → no band holds ≥ half.
    expect(computeTimingCluster([1, 2, 10, 11, 18, 20])).toBeNull();
  });

  it('resolves a tie toward the earliest band (keeps overnight legible)', () => {
    // 2 overnight (0–8), 2 evening (16–24), total 4 → each 50%; earliest wins.
    const cluster = computeTimingCluster([1, 6, 18, 22]);
    expect(cluster?.band.key).toBe('overnight');
    expect(cluster?.count).toBe(2);
  });

  it('ignores out-of-range / non-integer hours', () => {
    const cluster = computeTimingCluster([1, 2, 3, -1, 24, 12.5, NaN]);
    expect(cluster?.total).toBe(3);
    expect(cluster?.band.key).toBe('overnight');
  });

  it('covers the full clock across the three bands with no gap', () => {
    expect(TIME_BANDS.map((b) => [b.startHour, b.endHour])).toEqual([
      [0, 8],
      [8, 16],
      [16, 24],
    ]);
  });
});

describe('computeWeightRange', () => {
  it('returns null with no readings', () => {
    expect(computeWeightRange([])).toBeNull();
    expect(computeWeightRange([NaN, Infinity])).toBeNull();
  });

  it('collapses a single reading to a point', () => {
    expect(computeWeightRange([9.5])).toEqual({ minLbs: 9.5, maxLbs: 9.5, count: 1 });
  });

  it('reports min/max over a series', () => {
    expect(computeWeightRange([9.5, 9.3, 9.7, 9.4])).toEqual({
      minLbs: 9.3,
      maxLbs: 9.7,
      count: 4,
    });
  });
});

describe('distinctLocalDays', () => {
  it('counts distinct local calendar days (midday UTC is TZ-robust)', () => {
    expect(
      distinctLocalDays([
        '2026-07-10T12:00:00Z',
        '2026-07-10T18:00:00Z',
        '2026-07-11T12:00:00Z',
      ]),
    ).toBe(2);
  });

  it('ignores unparseable timestamps', () => {
    expect(distinctLocalDays(['not-a-date', '2026-07-10T12:00:00Z'])).toBe(1);
    expect(distinctLocalDays([])).toBe(0);
  });
});

describe('symptomTileValue', () => {
  it('formats the 30-day count and this-week count', () => {
    expect(symptomTileValue(7, 3)).toBe('7 in 30 days · 3 this week');
  });
  it('says "none this week" for a zero week count (never blank)', () => {
    expect(symptomTileValue(4, 0)).toBe('4 in 30 days · none this week');
  });
});

describe('timingTileValue', () => {
  it('is a factual recount, no "clustered" verdict', () => {
    const cluster: TimingCluster = {
      band: { key: 'overnight', label: '12am–8am', startHour: 0, endHour: 8 },
      count: 5,
      total: 7,
    };
    expect(timingTileValue(cluster)).toBe('5 of 7 between 12am–8am');
  });
});

describe('weightTileValue / weighInCountLabel', () => {
  it('renders a range in lbs', () => {
    expect(weightTileValue({ minLbs: 9.3, maxLbs: 9.7, count: 6 })).toBe('9.3–9.7 lbs');
  });
  it('renders a single value when min === max', () => {
    expect(weightTileValue({ minLbs: 9.5, maxLbs: 9.5, count: 1 })).toBe('9.5 lbs');
  });
  it('pluralises weigh-ins', () => {
    expect(weighInCountLabel(1)).toBe('1 weigh-in');
    expect(weighInCountLabel(6)).toBe('6 weigh-ins');
  });
});

describe('appetiteTileValue', () => {
  it('reports a finished-of-rated fraction, never a verdict or "picky"', () => {
    const value = appetiteTileValue({
      rate: 24 / 28,
      finishedMeals: 24,
      ratedMeals: 28,
      freeFedExcluded: 0,
      intakeNotDirectlyObserved: false,
    });
    expect(value).toBe('24 of 28 meals finished');
    expect(value).not.toMatch(/picky|usual|good|fine|normal|healthy/i);
  });

  it('is honest about a data gap rather than guessing', () => {
    expect(appetiteTileValue({ status: 'not_enough_data' })).toBe(
      'Too few meals logged to read appetite',
    );
  });
});

describe('frequencyLabel', () => {
  it('maps a null schedule to As needed (PRN)', () => {
    expect(frequencyLabel(null)).toBe('As needed');
  });
  it('names the common schedules', () => {
    expect(frequencyLabel(1)).toBe('Once a day');
    expect(frequencyLabel(2)).toBe('Twice a day');
    expect(frequencyLabel(3)).toBe('3× a day');
    expect(frequencyLabel(5)).toBe('5× a day');
  });
});

describe('lastDoseLabel', () => {
  it('is honest — "no dose logged yet", never "none needed"', () => {
    expect(lastDoseLabel(null)).toBe('no dose logged yet');
    expect(lastDoseLabel('garbage')).toBe('no dose logged yet');
  });
  it('prefixes a real date with "last"', () => {
    expect(lastDoseLabel('2026-07-10T09:00:00Z')).toMatch(/^last /);
  });
});

describe('sinceVisitValue', () => {
  it('joins both deltas', () => {
    expect(sinceVisitValue({ newFoods: 2, newMeds: 1 })).toBe('2 new foods · 1 new med');
  });
  it('singular/plural per part', () => {
    expect(sinceVisitValue({ newFoods: 1, newMeds: 0 })).toBe('1 new food');
    expect(sinceVisitValue({ newFoods: 0, newMeds: 2 })).toBe('2 new meds');
  });
  it('states nothing changed plainly', () => {
    expect(sinceVisitValue({ newFoods: 0, newMeds: 0 })).toBe('No new foods or meds logged');
  });
});

describe('sinceVisitTap', () => {
  it('routes a food change to Foods', () => {
    expect(sinceVisitTap({ newFoods: 2, newMeds: 0 })).toEqual({ kind: 'foods' });
    expect(sinceVisitTap({ newFoods: 1, newMeds: 1 })).toEqual({ kind: 'foods' });
  });
  it('routes a MED-ONLY change to meds (never the food library)', () => {
    expect(sinceVisitTap({ newFoods: 0, newMeds: 1 })).toEqual({ kind: 'meds' });
  });
  it('routes no change to History', () => {
    expect(sinceVisitTap({ newFoods: 0, newMeds: 0 })).toEqual({ kind: 'history' });
  });
});

describe('rundownDateLine', () => {
  it('self-dates the artifact with its window (P6 record hygiene)', () => {
    const line = rundownDateLine(Date.parse('2026-07-18T12:00:00Z'));
    expect(line).toMatch(/^As of /);
    expect(line).toContain('last 30 days');
  });
});

describe('visitDateLabel', () => {
  it('prefixes with "Since"', () => {
    expect(visitDateLabel('2026-07-02')).toMatch(/^Since /);
  });
  it('falls back gracefully on a bad date', () => {
    expect(visitDateLabel('nope')).toBe('Since your last visit');
  });
});

describe('rundownToPlainText', () => {
  const rundown: Rundown = {
    petName: 'Pixel',
    generatedAtMs: 0,
    tiles: [
      { key: 'symptoms', label: 'Vomiting', value: '7 in 30 days · 3 this week', tap: null },
      {
        key: 'timing',
        label: 'Timing',
        value: '5 of 7 · 12am–8am',
        detail: 'Vomiting',
        tap: null,
      },
      { key: 'weight', label: 'Weight', value: 'No weigh-ins logged', tap: null, empty: true },
    ],
  };

  it('renders a titled, denominator-carrying plain-text artifact', () => {
    const text = rundownToPlainText(rundown);
    expect(text).toContain('Pixel — visit rundown');
    expect(text).toMatch(/As of .+ · last 30 days/);
    expect(text).toContain('Vomiting: 7 in 30 days · 3 this week');
    expect(text).toContain('Timing: 5 of 7 · 12am–8am (Vomiting)');
    expect(text).toContain('Weight: No weigh-ins logged');
    expect(text).toContain("From Culprit — your pet's logged record.");
  });

  it('carries no verdict / reassurance vocabulary', () => {
    expect(rundownToPlainText(rundown)).not.toMatch(/\b(fine|healthy|normal|picky|good|well)\b/i);
  });
});

// ── Orchestrator (buildRundown) — the never-reassure invariant as a TEST, not a
// comment (clinical-guardrails Pattern 8). The empty-store case is where
// reassurance-by-absence is the real hazard; a populated case pins the tile
// assembly + tap targets.
const REASSURANCE_RE = /\b(fine|okay|healthy|nothing to worry|well|normal|good|picky|stable|all clear)\b/i;

function assertNoReassuranceAcrossTiles(r: Rundown): void {
  for (const tile of r.tiles) {
    for (const s of [tile.label, tile.value, tile.detail ?? '']) {
      expect(s).not.toMatch(REASSURANCE_RE);
      expect(s).not.toContain('!');
    }
  }
}

describe('buildRundown', () => {
  beforeEach(() => {
    mockGetAllAsync.mockReset().mockResolvedValue([]);
    mockGetFirstAsync.mockReset().mockResolvedValue(null);
    mockGetSymptomCounts.mockReset().mockResolvedValue([]);
    mockGetIntakeRate.mockReset().mockResolvedValue({ status: 'not_enough_data', samples: 0, needed: 4 });
    mockGetWeightHistory.mockReset().mockResolvedValue([]);
  });

  it('an empty record yields honest empty states with NO reassurance', async () => {
    const r = await buildRundown('pet-1', 'Pixel', Date.parse('2026-07-18T12:00:00Z'));
    const byKey = (k: string) => r.tiles.find((t) => t.key === k);

    // Symptoms: coverage fact, never wellness (G2).
    expect(byKey('symptoms')?.value).toBe('None logged in 30 days');
    // No timing tile without symptoms.
    expect(byKey('timing')).toBeUndefined();
    // Appetite: honest data-gap, not a guess.
    expect(byKey('appetite')?.value).toBe('Too few meals logged to read appetite');
    expect(byKey('weight')?.value).toBe('No weigh-ins logged');
    expect(byKey('meds')?.value).toBe('None active');
    expect(byKey('since_visit')?.value).toBe('No prior visit logged');

    assertNoReassuranceAcrossTiles(r);
  });

  it('assembles the populated rundown (counts, timing, meds, since-visit) with NO reassurance', async () => {
    mockGetSymptomCounts.mockImplementation(async (_petId: string, window: string) =>
      window === 'week'
        ? [{ symptomType: 'vomit', current: 3, prior: 2, delta: 1 }]
        : [{ symptomType: 'vomit', current: 7, prior: 5, delta: 2 }],
    );
    mockGetIntakeRate.mockResolvedValue({
      rate: 24 / 28,
      finishedMeals: 24,
      ratedMeals: 28,
      freeFedExcluded: 0,
      intakeNotDirectlyObserved: false,
    });
    mockGetWeightHistory.mockResolvedValue([
      { weightKg: 4.2, occurredAt: '2026-06-20T12:00:00Z' },
      { weightKg: 4.3, occurredAt: '2026-07-10T12:00:00Z' },
    ]);

    mockGetAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM medications')) {
        return [{ id: 'reg-1', drug_name: 'Cerenia', doses_per_day: null, last_dose: '2026-07-10T09:00:00Z' }];
      }
      if (sql.includes('event_type = ?')) {
        // 7 vomit events all at the same instant → one band, TZ-robust 7-of-7 cluster.
        return Array.from({ length: 7 }, () => ({ occurred_at: '2026-07-14T05:00:00Z' }));
      }
      // readEventTimestamps (days-logged)
      return [{ occurred_at: '2026-07-14T12:00:00Z' }, { occurred_at: '2026-07-15T12:00:00Z' }];
    });
    mockGetFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('MAX(visited_at)')) return { visited_at: '2026-07-02' };
      if (sql.includes('FROM meals')) return { n: 2 }; // new foods
      if (sql.includes('FROM medications')) return { n: 1 }; // new meds
      return null;
    });

    const r = await buildRundown('pet-1', 'Pixel', Date.parse('2026-07-18T12:00:00Z'));
    const byKey = (k: string) => r.tiles.find((t) => t.key === k);

    expect(byKey('symptoms')?.value).toBe('7 in 30 days · 3 this week');
    expect(byKey('symptoms')?.tap).toEqual({ kind: 'symptom', symptomType: 'vomit' });
    expect(byKey('timing')?.value).toMatch(/^7 of 7 between /);
    expect(byKey('timing')?.detail).toBe('Vomit'); // the app's canonical symptomLabel
    expect(byKey('appetite')?.value).toBe('24 of 28 meals finished');
    expect(byKey('appetite')?.detail).toMatch(/meals logged on \d+ of 30 days/);
    expect(byKey('weight')?.value).toMatch(/lbs$/);
    expect(byKey('meds')?.label).toBe('Cerenia');
    expect(byKey('meds')?.value).toMatch(/^As needed · last /);
    expect(byKey('since_visit')?.value).toBe('2 new foods · 1 new med');
    expect(byKey('since_visit')?.tap).toEqual({ kind: 'foods' });

    assertNoReassuranceAcrossTiles(r);
  });
});
