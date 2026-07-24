// Pure logic of the per-pet widget snapshot (lib/widgetSnapshot.ts, B-290 W3):
// the today-state classification the widget's status column renders, and the
// local-day windowing that keeps "today" aligned with the kitchen clock. The
// file I/O half (publishWidgetSnapshots) is thin App Group glue verified
// on-device (§4.1); the shape the widget consumes is pinned here.

jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { appleSharedContainers: {} },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));

import {
  buildWidgetSnapshot,
  localDayBounds,
  WIDGET_SNAPSHOT_SCHEMA_VERSION,
  type SnapshotPet,
} from './widgetSnapshot';

const PET: SnapshotPet = { id: 'pet-1', name: 'Pixel', species: 'cat' };

const base = {
  generatedAt: '2026-07-24T20:00:00.000Z',
  dayKey: '2026-07-24',
  freeFed: false,
  todayMeals: [] as { occurred_at: string; food_type: string | null }[],
};

describe('buildWidgetSnapshot', () => {
  it('splits meals from treats by food_type and tracks the latest of each', () => {
    const snap = buildWidgetSnapshot(PET, {
      ...base,
      todayMeals: [
        { occurred_at: '2026-07-24T08:00:00.000Z', food_type: 'meal' },
        { occurred_at: '2026-07-24T12:30:00.000Z', food_type: 'meal' },
        { occurred_at: '2026-07-24T15:00:00.000Z', food_type: 'treat' },
      ],
    });
    expect(snap.today).toEqual({
      mealCount: 2,
      treatCount: 1,
      lastMealAt: '2026-07-24T12:30:00.000Z',
      lastTreatAt: '2026-07-24T15:00:00.000Z',
    });
  });

  it('counts an unknown-food row (food_type null) as a meal — matching History', () => {
    const snap = buildWidgetSnapshot(PET, {
      ...base,
      todayMeals: [{ occurred_at: '2026-07-24T08:00:00.000Z', food_type: null }],
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

  it('carries identity, the day key, and the bowl fact; W4 fields publish empty', () => {
    const snap = buildWidgetSnapshot(PET, { ...base, freeFed: true });
    expect(snap.schemaVersion).toBe(WIDGET_SNAPSHOT_SCHEMA_VERSION);
    expect(snap.petId).toBe('pet-1');
    expect(snap.petName).toBe('Pixel');
    expect(snap.dayKey).toBe('2026-07-24');
    expect(snap.freeFed).toBe(true);
    // The W4 resolution-lib fields exist (the W5 renderer contract) but are
    // empty — an empty field renders as nothing-to-offer, never a fabrication.
    expect(snap.slots).toEqual([]);
    expect(snap.mealChoices).toEqual([]);
    expect(snap.treatChoices).toEqual([]);
    expect(snap.trialDay).toBeNull();
  });

  it('has no field that could carry Signal/AI copy or monetization state (D9 by construction)', () => {
    // The contract is the guardrail: a widget cannot render what the snapshot
    // cannot express. A new key here must survive the D9/§8 review.
    const snap = buildWidgetSnapshot(PET, base);
    expect(Object.keys(snap).sort()).toEqual(
      [
        'dayKey', 'freeFed', 'generatedAt', 'mealChoices', 'petId', 'petName',
        'schemaVersion', 'slots', 'species', 'today', 'treatChoices', 'trialDay',
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
