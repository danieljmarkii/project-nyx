// Pure logic of the per-pet widget snapshot (lib/widgetSnapshot.ts, Widget V2):
// the today-state classification the widget tiles render, the local-day windowing,
// the resolution-lib integration (learned slots, trial day), and the v2 block
// assembly (today's events by class, the up-next window, the 7-day pips, the trial
// strip). The file I/O half (publishWidgetSnapshots) is thin App Group glue
// verified on-device; the shape the widget consumes is pinned here. The resolution
// logic itself is exercised exhaustively in widgetResolution.test.ts and the v2
// builders in widgetSnapshotV2.test.ts — this suite pins the WIRING.

jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { appleSharedContainers: {} },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));
jest.mock('./db', () => ({ getDb: jest.fn() }));
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

function mealRow(occurred_at: string, food_type: string | null, extras: Partial<SnapshotMealRow> = {}): SnapshotMealRow {
  return {
    occurred_at,
    food_type,
    food_item_id: extras.food_item_id ?? null,
    brand: extras.brand ?? null,
    product_name: extras.product_name ?? null,
  };
}

// `generatedAt` is built from device-LOCAL components (the sibling suites'
// convention): buildWidgetSnapshot reads it in the DEVICE zone (the trial day
// counter, the v2 local-day filter) and takes no zone argument by design (the
// publisher runs on the device, whose own zone IS the owner's midnight, B-421).
// `dayBounds` stays an explicit UTC window here on purpose for the meal-split
// tests — it is a caller-computed INPUT and those tests never read the clock and
// the window together. The v2-wiring tests below use a local-consistent fixture.
const NOW_LOCAL = new Date(2026, 6, 24, 20, 0);

const base = {
  generatedAt: NOW_LOCAL.toISOString(),
  dayKey: '2026-07-24',
  freeFed: false,
  bowlConfirmedAt: null as string | null,
  meals: [] as SnapshotMealRow[],
  dayBounds: {
    startMs: Date.parse('2026-07-24T00:00:00.000Z'),
    endMs: Date.parse('2026-07-25T00:00:00.000Z'),
  },
  trial: null,
};

describe('buildWidgetSnapshot — the today split (meals/treats)', () => {
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
        mealRow('2026-07-24T00:00:00+00:00', 'meal'),
        mealRow('2026-07-23T23:59:30.000Z', 'meal'),
        mealRow('2026-07-25T00:00:00.000Z', 'meal'),
      ],
    });
    expect(snap.today.mealCount).toBe(1);
    expect(snap.today.lastMealAt).toBe('2026-07-24T00:00:00+00:00');
  });

  it('counts an unknown-food row (food_type null) as a meal — matching History', () => {
    const snap = buildWidgetSnapshot(PET, { ...base, meals: [mealRow('2026-07-24T08:00:00.000Z', null)] });
    expect(snap.today.mealCount).toBe(1);
    expect(snap.today.treatCount).toBe(0);
  });

  it('renders an unlogged day as honest zeros/nulls — a gap, never an assumed state', () => {
    const snap = buildWidgetSnapshot(PET, base);
    expect(snap.today).toEqual({ mealCount: 0, treatCount: 0, lastMealAt: null, lastTreatAt: null });
  });

  it('carries identity, the day key, and the bowl fact; sparse history yields NO learned slots', () => {
    const snap = buildWidgetSnapshot(PET, { ...base, freeFed: true });
    expect(snap.schemaVersion).toBe(WIDGET_SNAPSHOT_SCHEMA_VERSION);
    expect(snap.petId).toBe('pet-1');
    expect(snap.dayKey).toBe('2026-07-24');
    expect(snap.freeFed).toBe(true);
    expect(snap.slots).toEqual([]);
    expect(snap.trialDay).toBeNull();
  });

  it('learns slots + the trial day counter from history (resolution wiring)', () => {
    const meals: SnapshotMealRow[] = [];
    for (let d = 18; d <= 23; d++) {
      meals.push(mealRow(`2026-07-${d}T07:00:00.000Z`, 'meal', { food_item_id: 'food-1', brand: "Hill's", product_name: 'z/d' }));
    }
    const snap = buildWidgetSnapshot(PET, {
      ...base,
      meals,
      trial: { startedAt: '2026-07-13', targetDurationDays: 28, foodItemId: 'food-1', foodLabel: "Hill's z/d" },
    });
    expect(snap.slots).toHaveLength(1);
    expect(snap.slots[0].loggedAt).toBeNull(); // today's gap is honest
    expect(snap.trialDay).toBe(12); // 2026-07-13 → day 12 on 07-24 (B-084 math)
    expect(snap.trialTargetDays).toBe(28);
  });
});

// ── B-422 — the staleness gate reaches the header counter AND the v2 trial strip ──
//
// Nothing auto-completes a trial and §4.3's milestone needs an owner tap, so a
// trial nobody closed stays `status = 'active'` indefinitely — stale-active is the
// steady state. The gate drops it from BOTH the "Day N of M" header counter and the
// ground-band trial strip, so neither can render a trial that is months over.
describe('a trial past its effective end (B-422)', () => {
  const staleTrial = {
    // Day 1 of 28 on 2026-01-01 → target ends 2026-01-28, grace ends 2026-02-25.
    startedAt: '2026-01-01',
    targetDurationDays: 28,
    foodItemId: 'food-1',
    foodLabel: "Hill's z/d",
  };
  const coverage = { daysLogged: 10, daysElapsed: 28 };

  it('retires the day counter AND the trial strip on a stale trial', () => {
    const snap = buildWidgetSnapshot(PET, {
      ...base,
      trial: staleTrial,
      trialCoverage: coverage,
      trialCoveredDayIndices: [],
    });
    expect(snap.trialDay).toBeNull();
    expect(snap.trialTargetDays).toBeNull();
    expect(snap.trial).toBeNull(); // the strip goes too — never "Day 412 of 56"
  });

  it('keeps a trial merely in overrun, inside its grace — counter and strip both render', () => {
    // Day 1 on 2026-07-01, 14-day target → target ends 07-14, grace runs to 08-11;
    // today is 07-24.
    const snap = buildWidgetSnapshot(PET, {
      ...base,
      trial: { ...staleTrial, startedAt: '2026-07-01', targetDurationDays: 14 },
      trialCoverage: { daysLogged: 20, daysElapsed: 24 },
      trialCoveredDayIndices: [],
    });
    expect(snap.trialDay).toBe(24);
    expect(snap.trial).toMatchObject({ daysLogged: 20, daysElapsed: 24 });
  });
});

// ── v2 block assembly (spec §3) ───────────────────────────────────────────────
//
// A local-consistent fixture: dayBounds from localDayBounds(NOW_LOCAL) and every
// event timestamp built from local components, so the meal-split window and the v2
// local-day filter agree in EVERY runner zone (the "App (jest, non-UTC timezones)"
// CI job runs UTC+14 / UTC+12:45 / UTC−10).
describe('the v2 block', () => {
  const at = (h: number, m = 0) => new Date(2026, 6, 24, h, m).toISOString();
  const b = localDayBounds(NOW_LOCAL);
  const v2base = { ...base, dayBounds: { startMs: b.startMs, endMs: b.endMs } };

  it('folds today’s meals + treats + meds + symptoms into todayByClass', () => {
    const snap = buildWidgetSnapshot(PET, {
      ...v2base,
      meals: [
        mealRow(at(7, 42), 'meal', { food_item_id: 'f1', brand: "Hill's", product_name: 'z/d' }),
        mealRow(at(15, 5), 'treat', { food_item_id: 't1', brand: 'Dental', product_name: 'chew' }),
      ],
      medDoses: [{ name: 'Amoxicillin', occurredAt: at(8) }],
      medExpectedToday: 2,
      symptomEvents: [{ label: 'Vomiting', occurredAt: at(16, 40) }],
    });
    expect(snap.todayByClass?.meals).toMatchObject({ count: 1, names: ["Hill's z/d"] });
    expect(snap.todayByClass?.treats).toMatchObject({ count: 1, names: ['Dental chew'] });
    expect(snap.todayByClass?.meds).toMatchObject({ count: 1, names: ['Amoxicillin'], expectedToday: 2 });
    expect(snap.todayByClass?.symptoms).toMatchObject({ count: 1, leadingType: 'Vomiting' });
  });

  it('carries medExpectedToday = null through when the cadence is not known', () => {
    const snap = buildWidgetSnapshot(PET, {
      ...v2base,
      medDoses: [{ name: 'Gabapentin', occurredAt: at(8) }],
      medExpectedToday: null,
    });
    expect(snap.todayByClass?.meds.expectedToday).toBeNull();
  });

  it('builds the up-next tile from a learned unlogged window', () => {
    // A ~6p routine on 6 prior local days, with nothing logged today — the next
    // unlogged window. LOCAL-component instants (B-514): a UTC '18:00Z' would land
    // on a different local day at UTC±extremes and shift one meal into "today",
    // logging the slot and emptying the tile.
    const now = new Date(2026, 6, 24, 16, 0); // 4pm local — the 6pm window is ahead
    const bounds = localDayBounds(now);
    const meals: SnapshotMealRow[] = [];
    for (let d = 18; d <= 23; d++) {
      meals.push(mealRow(new Date(2026, 6, d, 18, 0).toISOString(), 'meal', { food_item_id: 'f1', brand: "Hill's", product_name: 'z/d' }));
    }
    const snap = buildWidgetSnapshot(PET, {
      ...v2base,
      generatedAt: now.toISOString(),
      dayBounds: { startMs: bounds.startMs, endMs: bounds.endMs },
      meals,
    });
    expect(snap.upNext).not.toBeNull();
    expect(snap.upNext?.label).toBe('Dinner');
  });

  it('builds the 7-day pips from the coverage row', () => {
    const snap = buildWidgetSnapshot(PET, {
      ...v2base,
      sevenDayEvents: [
        { occurredAt: at(8), isSymptom: false },
        { occurredAt: at(16), isSymptom: true },
      ],
    });
    expect(snap.sevenDays).toHaveLength(7);
    expect(snap.sevenDays?.[6]).toMatchObject({ dayKey: '2026-07-24', logged: true, symptomLogged: true });
  });

  it('paints the trial strip from the shared coverage numbers + covered-day indices', () => {
    const trial = { startedAt: '2026-07-13', targetDurationDays: 28, foodItemId: 'f1', foodLabel: "Hill's z/d" };
    const { localDayIndexOf } = require('./utils');
    const start = localDayIndexOf('2026-07-13');
    const snap = buildWidgetSnapshot(PET, {
      ...v2base,
      trial,
      trialCoverage: { daysLogged: 2, daysElapsed: 12 },
      trialCoveredDayIndices: [start, start + 3],
    });
    expect(snap.trial).toMatchObject({ day: 12, target: 28, daysLogged: 2, daysElapsed: 12 });
    expect(snap.trial?.stripDays).toHaveLength(12);
    expect(snap.trial?.stripDays[0].logged).toBe(true);
    expect(snap.trial?.stripDays[3].logged).toBe(true);
    expect(snap.trial?.stripDays[1].logged).toBe(false);
  });

  it('has no field that could carry Signal/AI copy or monetization state (D9 by construction)', () => {
    const snap = buildWidgetSnapshot(PET, base);
    expect(Object.keys(snap).sort()).toEqual(
      [
        'bowlConfirmedAt', 'dayKey', 'freeFed', 'generatedAt', 'petId', 'petName',
        'schemaVersion', 'sevenDays', 'slots', 'species', 'today', 'todayByClass',
        'trial', 'trialDay', 'trialTargetDays', 'upNext',
      ].sort(),
    );
  });
});

describe('localDayBounds', () => {
  it('brackets the given time inside a 24h device-local window', () => {
    const now = new Date(2026, 6, 24, 21, 30);
    const { startIso, endIso } = localDayBounds(now);
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    expect(start).toBeLessThanOrEqual(now.getTime());
    expect(end).toBeGreaterThan(now.getTime());
    expect(end - start).toBe(24 * 60 * 60 * 1000);
  });

  it('starts at the LOCAL midnight, not the UTC rollover', () => {
    const now = new Date(2026, 6, 24, 0, 5);
    const { startIso } = localDayBounds(now);
    expect(new Date(startIso).getTime()).toBe(new Date(2026, 6, 24, 0, 0).getTime());
  });
});
