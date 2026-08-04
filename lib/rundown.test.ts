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
  medHistoryCutoffMs,
  courseRecencyMs,
  formatMedDate,
  formatMedDateRange,
  doseCountPhrase,
  pastMedTileValue,
  pastMedEndDetail,
  earlierCoursesTile,
  pastMedCourseTile,
  splitPastCourses,
  buildPastMedications,
  pastMedsSectionLabel,
  RUNDOWN_MED_HISTORY_MONTHS,
  TIME_BANDS,
  TIMING_MIN_EVENTS,
  type TimingCluster,
  type Rundown,
  type MedItemName,
} from './rundown';
import type { MedicationCourse } from './medicationHistory';
import { dayKeyToLocalDate } from './utils';

// A derived MedicationCourse fixture for the pure past-meds copy/split tests — full defaults
// (a quiet, ended-less regimen course), overridable. The buildRundown integration test below
// exercises the real `deriveMedicationCourses` end-to-end; these pin rundown's OWN logic.
function course(over: Partial<MedicationCourse> = {}): MedicationCourse {
  return {
    key: 'reg-1',
    source: 'regimen',
    regimenId: 'reg-1',
    medicationItemId: 'item-1',
    drugName: 'Metronidazole',
    isActive: false,
    tally: { given: 0, partial: 0, missed: 0, refused: 0, unrated: 0 },
    dosesLogged: 0,
    firstDoseIso: null,
    lastDoseIso: null,
    firstDoseDay: null,
    lastDoseDay: null,
    startedAt: null,
    dosesPerDay: null,
    scheduleNotes: null,
    route: null,
    doseAmount: null,
    plannedDoses: null,
    targetDurationDays: null,
    runDays: null,
    end: { kind: 'none', lastDoseIso: null },
    ...over,
  };
}

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

// ── Past medications (B-140 PR 4) — pure copy, windowing, and the H1 register ──────
// The reassurance/H1 invariants are re-asserted end-to-end in buildRundown's own
// past-meds case below (clinical-guardrails Pattern 8); these pin the pieces.

describe('medHistoryCutoffMs / pastMedsSectionLabel', () => {
  it('is roughly 12 months before now (zone-robust range)', () => {
    const now = Date.parse('2026-08-04T12:00:00Z');
    const daysBefore = (now - medHistoryCutoffMs(now)) / 86_400_000;
    expect(daysBefore).toBeGreaterThanOrEqual(360);
    expect(daysBefore).toBeLessThanOrEqual(372);
    expect(RUNDOWN_MED_HISTORY_MONTHS).toBe(12);
  });
  it('labels the section from the same window constant (pins the copy)', () => {
    expect(pastMedsSectionLabel()).toBe('Medications — past 12 months');
  });
});

describe('courseRecencyMs', () => {
  it('prefers the last dose (an instant), then the ended date, then the start', () => {
    // A real instant → its absolute ms.
    expect(courseRecencyMs(course({ lastDoseIso: '2026-07-10T09:00:00Z' }))).toBe(
      Date.parse('2026-07-10T09:00:00Z'),
    );
    // A DATE-only field → LOCAL midnight (via dayKeyToLocalDate), NOT Date.parse's UTC
    // midnight — so the split compares on the same local basis as medHistoryCutoffMs (B-441).
    expect(
      courseRecencyMs(
        course({ lastDoseIso: null, end: { kind: 'ended', status: 'completed', endedAt: '2026-03-16' } }),
      ),
    ).toBe(dayKeyToLocalDate('2026-03-16')!.getTime());
    expect(courseRecencyMs(course({ lastDoseIso: null, startedAt: '2026-02-01' }))).toBe(
      dayKeyToLocalDate('2026-02-01')!.getTime(),
    );
  });
  it('is null (→ never folded) when the course carries no usable date', () => {
    expect(courseRecencyMs(course({ lastDoseIso: null, startedAt: null }))).toBeNull();
  });
});

describe('formatMedDate', () => {
  it('formats a day key as "Mon D", picking the right day (TZ-stable)', () => {
    expect(formatMedDate('2026-03-16')).toMatch(/^\w+ 16$/);
  });
  it('slices a stray datetime to its calendar day', () => {
    expect(formatMedDate('2026-03-16T09:00:00Z')).toMatch(/^\w+ 16$/);
  });
  it('returns null for absent/malformed input (never a guessed date)', () => {
    expect(formatMedDate(null)).toBeNull();
    expect(formatMedDate('garbage')).toBeNull();
  });
});

describe('formatMedDateRange', () => {
  it('collapses a same-month range to "Mon D – D"', () => {
    expect(formatMedDateRange('2026-03-03', '2026-03-16')).toMatch(/ – 16$/);
  });
  it('keeps both months across a same-year boundary', () => {
    expect(formatMedDateRange('2026-03-30', '2026-04-02')).toMatch(/– \w+ 2$/);
  });
  it('carries both years across a year boundary (never a bare "Dec 30 – Jan 2")', () => {
    const r = formatMedDateRange('2025-12-30', '2026-01-02');
    expect(r).toContain('2025');
    expect(r).toContain('2026');
    expect(r).toMatch(/^\w+ 30, 2025 – \w+ 2, 2026$/);
  });
  it('renders a single day when the endpoints coincide', () => {
    const r = formatMedDateRange('2026-02-11', '2026-02-11');
    expect(r).toMatch(/^\w+ 11$/);
    expect(r).not.toContain('–');
  });
  it('renders the one known endpoint, or null when neither is known', () => {
    expect(formatMedDateRange('2026-02-11', null)).toMatch(/^\w+ 11$/);
    expect(formatMedDateRange(null, '2026-02-11')).toMatch(/^\w+ 11$/);
    expect(formatMedDateRange(null, null)).toBeNull();
  });
});

describe('doseCountPhrase', () => {
  it('pluralises', () => {
    expect(doseCountPhrase(1)).toBe('1 dose');
    expect(doseCountPhrase(26)).toBe('26 doses');
    expect(doseCountPhrase(0)).toBe('0 doses');
  });
});

describe('pastMedTileValue', () => {
  it('an ended course leads with its window, then length, then count', () => {
    const v = pastMedTileValue(
      course({
        startedAt: '2026-03-03',
        runDays: 14,
        dosesLogged: 26,
        end: { kind: 'ended', status: 'completed', endedAt: '2026-03-16' },
      }),
    );
    expect(v).toMatch(/ – 16 · 14 days · 26 doses$/);
  });
  it('a no-end course leads with the dose count, then the logged span', () => {
    const v = pastMedTileValue(
      course({
        source: 'doses',
        drugName: null,
        dosesLogged: 3,
        firstDoseDay: '2026-06-02',
        lastDoseDay: '2026-06-09',
        end: { kind: 'none', lastDoseIso: '2026-06-09T09:00:00Z' },
      }),
    );
    expect(v).toMatch(/^3 doses · \w+ 2 – 9$/);
  });
  it('a single logged dose reads "1 dose · Mon D"', () => {
    const v = pastMedTileValue(
      course({
        source: 'doses',
        drugName: null,
        dosesLogged: 1,
        firstDoseDay: '2026-02-11',
        lastDoseDay: '2026-02-11',
      }),
    );
    expect(v).toMatch(/^1 dose · \w+ 11$/);
  });
});

describe('pastMedEndDetail (H1 — ending only from an owner action)', () => {
  it('renders "Ended {date}" ONLY for an owner-ended course', () => {
    expect(
      pastMedEndDetail(course({ end: { kind: 'ended', status: 'completed', endedAt: '2026-03-16' } })),
    ).toMatch(/^Ended \w+ 16$/);
    // Ended but the date did not survive: still "Ended", never a guessed date.
    expect(
      pastMedEndDetail(course({ end: { kind: 'ended', status: 'stopped', endedAt: null } })),
    ).toBe('Ended');
  });
  it('renders "No end recorded" for silence — never "completed"/"ongoing"/a wellness word', () => {
    const d = pastMedEndDetail(course({ end: { kind: 'none', lastDoseIso: null } }));
    expect(d).toBe('No end recorded');
    expect(d).not.toMatch(/\b(complete|completed|ongoing|active|fine|well|good|normal)\b/i);
  });
});

describe('earlierCoursesTile (the D3 fold)', () => {
  it('is a quiet, non-tappable disclosure with a pluralised count', () => {
    expect(earlierCoursesTile(3)).toEqual({
      key: 'meds_past',
      label: 'Earlier',
      value: '3 earlier courses, over a year ago',
      tap: null,
      empty: true,
    });
    expect(earlierCoursesTile(1).value).toBe('1 earlier course, over a year ago');
  });
});

describe('pastMedCourseTile (tap targets)', () => {
  it('a regimen course taps to its detail screen', () => {
    expect(pastMedCourseTile(course({ source: 'regimen', regimenId: 'reg-9' }), 'Metronidazole').tap).toEqual(
      { kind: 'medication', medicationId: 'reg-9' },
    );
  });
  it('a dose-derived course (no regimen) taps to History', () => {
    expect(
      pastMedCourseTile(course({ source: 'doses', regimenId: null, drugName: null }), 'Zyrtec').tap,
    ).toEqual({ kind: 'history' });
  });
});

describe('splitPastCourses', () => {
  const now = Date.parse('2026-08-04T12:00:00Z');
  it('shows recent past courses, folds older ones, and drops active courses', () => {
    const recent = course({ key: 'recent', lastDoseIso: '2026-07-01T12:00:00Z' });
    const old = course({ key: 'old', lastDoseIso: '2024-01-01T12:00:00Z' });
    const active = course({ key: 'active', isActive: true, lastDoseIso: '2026-08-01T12:00:00Z' });
    const { shown, earlierCount } = splitPastCourses([recent, old, active], now);
    expect(shown.map((c) => c.key)).toEqual(['recent']);
    expect(earlierCount).toBe(1);
  });
});

describe('buildPastMedications', () => {
  const now = Date.parse('2026-08-04T12:00:00Z');
  const names = new Map<string, MedItemName>([
    ['item-zyrtec', { generic: 'cetirizine', brand: 'Zyrtec' }],
  ]);
  // Recency order (newest last dose first), as the derivation would hand them over.
  const orphan = course({
    key: 'item:item-zyrtec',
    source: 'doses',
    regimenId: null,
    drugName: null,
    medicationItemId: 'item-zyrtec',
    dosesLogged: 3,
    firstDoseDay: '2026-06-02',
    lastDoseDay: '2026-06-09',
    lastDoseIso: '2026-06-09T12:00:00Z',
    end: { kind: 'none', lastDoseIso: '2026-06-09T12:00:00Z' },
  });
  const ended = course({
    key: 'reg-metro',
    source: 'regimen',
    regimenId: 'reg-metro',
    drugName: 'Metronidazole',
    startedAt: '2026-03-03',
    runDays: 14,
    dosesLogged: 26,
    lastDoseIso: '2026-03-16T12:00:00Z',
    end: { kind: 'ended', status: 'completed', endedAt: '2026-03-16' },
  });

  it('names each course (brand-first for dose-derived) and sets the register + tap', () => {
    const tiles = buildPastMedications([orphan, ended], names, now);
    expect(tiles).toHaveLength(2);
    expect(tiles[0].label).toBe('Zyrtec'); // brand-first (B-171)
    expect(tiles[0].value).toContain('3 doses');
    expect(tiles[0].detail).toBe('No end recorded');
    expect(tiles[0].tap).toEqual({ kind: 'history' });
    expect(tiles[1].label).toBe('Metronidazole');
    expect(tiles[1].detail).toMatch(/^Ended /);
    expect(tiles[1].tap).toEqual({ kind: 'medication', medicationId: 'reg-metro' });
  });

  it('falls back to "Medication" for a dose-derived course with no cached name', () => {
    const nameless = course({ source: 'doses', regimenId: null, drugName: null, medicationItemId: 'item-unknown' });
    expect(buildPastMedications([nameless], names, now)[0].label).toBe('Medication');
  });

  it('appends the folded "earlier courses" row when older courses exist', () => {
    const old = course({ key: 'old', drugName: 'Prednisolone', lastDoseIso: '2024-05-01T12:00:00Z' });
    const tiles = buildPastMedications([ended, old], names, now);
    // ended shown; old folded → the final row is the fold, non-tappable.
    expect(tiles[tiles.length - 1]).toEqual(earlierCoursesTile(1));
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
    pastMedications: [],
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

  it('delineates the past-meds section under its own heading when present', () => {
    const withPast: Rundown = {
      ...rundown,
      pastMedications: [
        { key: 'meds_past', label: 'Metronidazole', value: 'Mar 3 – 16 · 14 days · 26 doses', detail: 'Ended Mar 16', tap: null },
        earlierCoursesTile(2),
      ],
    };
    const text = rundownToPlainText(withPast);
    expect(text).toContain(pastMedsSectionLabel());
    expect(text).toContain('Metronidazole: Mar 3 – 16 · 14 days · 26 doses (Ended Mar 16)');
    expect(text).toContain('Earlier: 2 earlier courses, over a year ago');
    // The section sits above the sign-off, not after it.
    expect(text.indexOf(pastMedsSectionLabel())).toBeLessThan(text.indexOf('From Culprit'));
  });
});

// ── Orchestrator (buildRundown) — the never-reassure invariant as a TEST, not a
// comment (clinical-guardrails Pattern 8). The empty-store case is where
// reassurance-by-absence is the real hazard; a populated case pins the tile
// assembly + tap targets.
const REASSURANCE_RE = /\b(fine|okay|healthy|nothing to worry|well|normal|good|picky|stable|all clear)\b/i;

function assertNoReassuranceAcrossTiles(r: Rundown): void {
  // Every rendered string, including the past-meds block (H1/reassurance ride on it too).
  for (const tile of [...r.tiles, ...r.pastMedications]) {
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
    // No regimens, no doses → no past-meds block (silence, not an empty-state finding).
    expect(r.pastMedications).toEqual([]);

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
      // readActiveRegimens (the "Current meds" block) — matched by its status filter.
      if (sql.includes("status = 'active'")) {
        return [{ id: 'reg-1', drug_name: 'Cerenia', doses_per_day: null, last_dose: '2026-07-10T09:00:00Z' }];
      }
      // The three past-meds reads have no history in this test → empty (past block absent).
      if (sql.includes('target_duration_doses')) return []; // readAllRegimens
      if (sql.includes('ma.medication_id AS medication_id')) return []; // readAllDoses
      if (sql.includes('medication_items_cache')) return []; // readMedicationItemNames
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
    expect(r.pastMedications).toEqual([]);

    assertNoReassuranceAcrossTiles(r);
  });

  it('builds the past-meds block end-to-end (ended + dose-derived), excluding active courses', async () => {
    // Two regimens (one active, one owner-ended) + an ad-hoc dose-derived course. The whole
    // path — local rows → deriveMedicationCourses → the block — offline and deterministic.
    mockGetAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes("status = 'active'")) {
        // Current-meds block: the active course only.
        return [{ id: 'reg-amox', drug_name: 'Amoxicillin', doses_per_day: 2, last_dose: '2026-08-01T12:00:00Z' }];
      }
      if (sql.includes('target_duration_doses')) {
        // readAllRegimens — active + ended, both statuses (the amnesia B-140 undoes).
        return [
          {
            id: 'reg-amox', medication_item_id: 'item-amox', drug_name: 'Amoxicillin', dose_amount: '50 mg',
            route: 'oral', doses_per_day: 2, schedule_notes: null, started_at: '2026-07-28',
            target_duration_days: 10, target_duration_doses: null, status: 'active', ended_at: null,
          },
          {
            id: 'reg-metro', medication_item_id: 'item-metro', drug_name: 'Metronidazole', dose_amount: '250 mg',
            route: 'oral', doses_per_day: 2, schedule_notes: null, started_at: '2026-03-03',
            target_duration_days: 14, target_duration_doses: null, status: 'completed', ended_at: '2026-03-16',
          },
        ];
      }
      if (sql.includes('ma.medication_id AS medication_id')) {
        // readAllDoses: 2 linked to the active regimen, 2 to the ended one, 3 ad-hoc (orphan).
        return [
          { medication_id: 'reg-amox', medication_item_id: 'item-amox', adherence: 'given', deleted_at: null, occurred_at: '2026-07-30T12:00:00Z' },
          { medication_id: 'reg-amox', medication_item_id: 'item-amox', adherence: 'given', deleted_at: null, occurred_at: '2026-08-01T12:00:00Z' },
          { medication_id: 'reg-metro', medication_item_id: 'item-metro', adherence: 'given', deleted_at: null, occurred_at: '2026-03-05T12:00:00Z' },
          { medication_id: 'reg-metro', medication_item_id: 'item-metro', adherence: 'given', deleted_at: null, occurred_at: '2026-03-15T12:00:00Z' },
          { medication_id: null, medication_item_id: 'item-zyrtec', adherence: 'given', deleted_at: null, occurred_at: '2026-06-02T12:00:00Z' },
          { medication_id: null, medication_item_id: 'item-zyrtec', adherence: 'given', deleted_at: null, occurred_at: '2026-06-05T12:00:00Z' },
          { medication_id: null, medication_item_id: 'item-zyrtec', adherence: 'given', deleted_at: null, occurred_at: '2026-06-09T12:00:00Z' },
        ];
      }
      if (sql.includes('medication_items_cache')) {
        return [{ id: 'item-zyrtec', generic_name: 'cetirizine', brand_name: 'Zyrtec' }];
      }
      if (sql.includes('event_type = ?')) return [];
      return [];
    });

    const r = await buildRundown('pet-1', 'Pixel', Date.parse('2026-08-04T12:00:00Z'));

    // The active course drives the current-meds tile and is NOT duplicated into the past block.
    expect(r.tiles.find((t) => t.key === 'meds')?.label).toBe('Amoxicillin');
    const past = r.pastMedications;
    expect(past.map((t) => t.label)).not.toContain('Amoxicillin');

    // The ended regimen renders with its window + length + count, and "Ended" (H1: owner action).
    const metro = past.find((t) => t.label === 'Metronidazole');
    expect(metro).toBeDefined();
    expect(metro?.value).toContain('14 days'); // DATE-derived span — TZ-stable
    expect(metro?.value).toContain('2 doses');
    expect(metro?.detail).toMatch(/^Ended /);
    expect(metro?.tap).toEqual({ kind: 'medication', medicationId: 'reg-metro' });

    // The ad-hoc course renders brand-first, "No end recorded" (H1: silence never an ending).
    const zyrtec = past.find((t) => t.label === 'Zyrtec');
    expect(zyrtec).toBeDefined();
    expect(zyrtec?.value).toContain('3 doses');
    expect(zyrtec?.detail).toBe('No end recorded');
    expect(zyrtec?.tap).toEqual({ kind: 'history' });

    assertNoReassuranceAcrossTiles(r);
  });
});
