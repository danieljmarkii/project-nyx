// Pure logic of the per-pet widget snapshot (lib/widgetSnapshot.ts, B-290
// W3+W4): the today-state classification the widget's status column renders,
// the local-day windowing, and — since W4 — the resolution-lib integration
// (learned slots, meal choices, treat shortlist, trial day) that fills the
// picker fields. The file I/O half (publishWidgetSnapshots) is thin App Group
// glue verified on-device (§4.1); the shape the widget consumes is pinned here.
// The resolution logic itself is exercised exhaustively in
// widgetResolution.test.ts — this suite pins the WIRING.

jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { appleSharedContainers: {} },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));
jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));
jest.mock('./appGroup', () => ({
  APP_GROUP_ID: 'group.test',
  getCaptureInboxDirectory: jest.fn(() => null),
  getSnapshotDirectory: jest.fn(() => null),
  clearWidgetData: jest.fn(),
}));

import {
  buildWidgetSnapshot,
  localDayBounds,
  WIDGET_SNAPSHOT_SCHEMA_VERSION,
  type SnapshotMealRow,
  type SnapshotPet,
} from './widgetSnapshot';

const PET: SnapshotPet = { id: 'pet-1', name: 'Pixel', species: 'cat' };

function mealRow(
  occurred_at: string,
  food_type: string | null,
  extras: Partial<SnapshotMealRow> = {},
): SnapshotMealRow {
  return {
    occurred_at,
    food_type,
    food_item_id: extras.food_item_id ?? null,
    brand: extras.brand ?? null,
    product_name: extras.product_name ?? null,
  };
}

const base = {
  generatedAt: '2026-07-24T20:00:00.000Z',
  dayKey: '2026-07-24',
  freeFed: false,
  meals: [] as SnapshotMealRow[],
  // The UTC calendar day 2026-07-24 as the authoritative window (a UTC-aligned
  // "device" for test determinism).
  dayBounds: {
    startMs: Date.parse('2026-07-24T00:00:00.000Z'),
    endMs: Date.parse('2026-07-25T00:00:00.000Z'),
  },
  trial: null,
};

describe('buildWidgetSnapshot', () => {
  it('splits meals from treats by food_type and tracks the latest of each', () => {
    const snap = buildWidgetSnapshot(PET, {
      ...base,
      meals: [
        mealRow('2026-07-24T08:00:00.000Z', 'meal'),
        mealRow('2026-07-24T12:30:00.000Z', 'meal'),
        mealRow('2026-07-24T15:00:00.000Z', 'treat'),
      ],
    });
    expect(snap.today).toEqual({
      mealCount: 2,
      treatCount: 1,
      lastMealAt: '2026-07-24T12:30:00.000Z',
      lastTreatAt: '2026-07-24T15:00:00.000Z',
    });
  });

  it('applies the authoritative ms window, not the lexical SQL prefilter (B-055 class)', () => {
    const snap = buildWidgetSnapshot(PET, {
      ...base,
      meals: [
        // Hydrated offset form on the exact start-boundary second — lexically
        // ('+00:00' vs 'Z') this is the row a TEXT compare can misjudge; the
        // parsed-ms filter must count it.
        mealRow('2026-07-24T00:00:00+00:00', 'meal'),
        // In the lookback window but yesterday — history for slot learning,
        // never a today count.
        mealRow('2026-07-23T23:59:30.000Z', 'meal'),
        // And tomorrow's boundary second is OUT ([start, end)).
        mealRow('2026-07-25T00:00:00.000Z', 'meal'),
      ],
    });
    expect(snap.today.mealCount).toBe(1);
    expect(snap.today.lastMealAt).toBe('2026-07-24T00:00:00+00:00');
  });

  it('picks the latest by parsed time across mixed timestamp formats', () => {
    const snap = buildWidgetSnapshot(PET, {
      ...base,
      meals: [
        // Lexically '2026-07-24T12:00:00+00:00' > '2026-07-24T08:00:00.000Z'
        // is format-dependent; parsed ms must decide.
        mealRow('2026-07-24T12:00:00+00:00', 'meal'),
        mealRow('2026-07-24T08:00:00.000Z', 'meal'),
      ],
    });
    expect(snap.today.lastMealAt).toBe('2026-07-24T12:00:00+00:00');
  });

  it('counts an unknown-food row (food_type null) as a meal — matching History', () => {
    const snap = buildWidgetSnapshot(PET, {
      ...base,
      meals: [mealRow('2026-07-24T08:00:00.000Z', null)],
    });
    expect(snap.today.mealCount).toBe(1);
    expect(snap.today.treatCount).toBe(0);
  });

  it('renders an unlogged day as honest zeros/nulls — a gap, never an assumed state', () => {
    const snap = buildWidgetSnapshot(PET, base);
    expect(snap.today).toEqual({
      mealCount: 0,
      treatCount: 0,
      lastMealAt: null,
      lastTreatAt: null,
    });
  });

  it('carries identity, the day key, and the bowl fact; sparse history yields EMPTY picker fields', () => {
    const snap = buildWidgetSnapshot(PET, { ...base, freeFed: true });
    expect(snap.schemaVersion).toBe(WIDGET_SNAPSHOT_SCHEMA_VERSION);
    expect(snap.petId).toBe('pet-1');
    expect(snap.petName).toBe('Pixel');
    expect(snap.dayKey).toBe('2026-07-24');
    expect(snap.freeFed).toBe(true);
    // No routine in the history → the resolution lib offers NOTHING — an empty
    // field renders as nothing-to-offer, never a fabricated choice.
    expect(snap.slots).toEqual([]);
    expect(snap.mealChoices).toEqual([]);
    expect(snap.treatChoices).toEqual([]);
    expect(snap.trialDay).toBeNull();
    expect(snap.trialTargetDays).toBeNull();
  });

  it('fills the picker fields from history: slots, choices, shortlist, trial day (W4 wiring)', () => {
    // A 7:00Z routine on 6 prior days + a treat habit; today unlogged.
    const meals: SnapshotMealRow[] = [];
    for (let d = 18; d <= 23; d++) {
      meals.push(
        mealRow(`2026-07-${d}T07:00:00.000Z`, 'meal', {
          food_item_id: 'food-1',
          brand: "Hill's",
          product_name: 'z/d',
        }),
      );
    }
    meals.push(
      mealRow('2026-07-22T15:00:00.000Z', 'treat', {
        food_item_id: 'treat-1',
        brand: 'Temptations',
        product_name: 'Chicken',
      }),
    );
    const snap = buildWidgetSnapshot(PET, {
      ...base,
      meals,
      trial: {
        startedAt: '2026-07-13',
        targetDurationDays: 28,
        foodItemId: 'food-1',
        foodLabel: "Hill's z/d",
      },
    });
    expect(snap.slots).toHaveLength(1);
    expect(snap.slots[0].loggedAt).toBeNull(); // today's gap is honest
    expect(snap.mealChoices[0]).toEqual({
      foodItemId: 'food-1',
      label: expect.stringContaining("Hill's z/d"),
    });
    expect(snap.treatChoices).toEqual([
      { foodItemId: 'treat-1', label: 'Temptations Chicken' },
    ]);
    expect(snap.trialDay).toBe(12); // 2026-07-13 → day 12 on 07-24 (B-084 math)
    expect(snap.trialTargetDays).toBe(28);
  });

  it('has no field that could carry Signal/AI copy or monetization state (D9 by construction)', () => {
    // The contract is the guardrail: a widget cannot render what the snapshot
    // cannot express. A new key here must survive the D9/§8 review.
    const snap = buildWidgetSnapshot(PET, base);
    expect(Object.keys(snap).sort()).toEqual(
      [
        'dayKey', 'freeFed', 'generatedAt', 'mealChoices', 'petId', 'petName',
        'schemaVersion', 'slots', 'species', 'today', 'treatChoices', 'trialDay',
        'trialTargetDays',
      ].sort(),
    );
  });
});

describe('localDayBounds', () => {
  it('brackets the given time inside a 24h device-local window', () => {
    const now = new Date(2026, 6, 24, 21, 30); // device-local 21:30
    const { startIso, endIso } = localDayBounds(now);
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    expect(start).toBeLessThanOrEqual(now.getTime());
    expect(end).toBeGreaterThan(now.getTime());
    expect(end - start).toBe(24 * 60 * 60 * 1000);
  });

  it('starts at the LOCAL midnight, not the UTC rollover', () => {
    const now = new Date(2026, 6, 24, 0, 5); // five past local midnight
    const { startIso } = localDayBounds(now);
    expect(new Date(startIso).getTime()).toBe(new Date(2026, 6, 24, 0, 0).getTime());
  });
});
