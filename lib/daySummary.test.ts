// Day Summary builder tests (B-661 PR 4). The load-bearing, bug-prone parts are
// the LOCAL-day clip (B-421) and the zero-log copy's G2 safety — both provable
// without a database. Timezone assertions are B-514-honest: they pass an explicit
// `timeZone` or build instants from local components, never a bare UTC literal
// standing in for a local-day question.

// The builder is pure, but it imports describeDayEvent (lib/dayEvents), whose
// `pluralize` import transitively drags in lib/analytics → lib/sync → lib/supabase,
// which throws at import time without env. Stub the leaf so the pure builder runs
// with no database or config (the same mock the other lib builders use).
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import type { TimelineRow } from './db';
import {
  buildDaySummary,
  localDayBoundsIso,
  petZeroLogLine,
  DAY_SUMMARY_ZERO_LOG,
  daySummaryEmptyTitle,
  type DaySummaryPetInput,
} from './daySummary';

// Minimal TimelineRow factory — only the columns the builder + describeDayEvent
// read need real values; everything else defaults to the null a non-matching join
// produces. `paired_dose_count` is NOT NULL in the shape, so it defaults to 0.
function mkRow(over: Partial<TimelineRow> & { id: string; occurred_at: string }): TimelineRow {
  return {
    pet_id: 'pet-1',
    event_type: 'vomit',
    occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null,
    occurred_at_latest: null,
    severity: null,
    notes: null,
    source: 'now',
    deleted_at: null,
    created_at: over.occurred_at,
    updated_at: over.occurred_at,
    food_item_id: null,
    quantity: null,
    food_brand: null,
    food_product_name: null,
    food_type: null,
    food_format: null,
    intake_rating: null,
    weight_kg: null,
    medication_item_id: null,
    adherence: null,
    how_given: null,
    paired_event_id: null,
    paired_vehicle_intake: null,
    paired_food_name: null,
    drug_generic_name: null,
    drug_brand_name: null,
    paired_dose_count: 0,
    paired_dose_event_id: null,
    paired_dose_drug_name: null,
    ...over,
  };
}

const pet = (id: string, name: string, rows: TimelineRow[]): DaySummaryPetInput => ({
  pet: { id, name, species: 'dog' },
  rows,
});

describe('buildDaySummary — local-day clip (B-421)', () => {
  it("keeps only events on the owner's local day, dropping earlier/later ones", () => {
    // Explicit UTC zone → the assertion is pinned to UTC on every runner.
    const nowMs = Date.parse('2026-08-02T12:00:00Z');
    const rows = [
      mkRow({ id: 'today-a', occurred_at: '2026-08-02T09:00:00Z' }),
      mkRow({ id: 'today-b', occurred_at: '2026-08-02T23:30:00Z' }),
      mkRow({ id: 'yesterday', occurred_at: '2026-08-01T23:00:00Z' }),
      mkRow({ id: 'tomorrow', occurred_at: '2026-08-03T00:30:00Z' }),
    ];
    const model = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs, timeZone: 'UTC' });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['today-a', 'today-b']);
    expect(model.sections[0].isZeroLog).toBe(false);
  });

  it('the local-day boundary is the OWNER’s zone, not UTC (same instant, two zones)', () => {
    // now 05:00Z; a single event 9h earlier at 20:00Z the previous UTC day.
    const nowMs = Date.parse('2026-08-02T05:00:00Z');
    const rows = [mkRow({ id: 'e', occurred_at: '2026-08-01T20:00:00Z' })];

    // In UTC the event is YESTERDAY (Aug 1 vs now Aug 2) → excluded.
    const utc = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs, timeZone: 'UTC' });
    expect(utc.sections[0].rows).toHaveLength(0);
    expect(utc.isEmpty).toBe(true);

    // In America/Los_Angeles (UTC-7) both now (Aug 1 22:00) and the event (Aug 1
    // 13:00) fall on Aug 1 local → the SAME local day → included. Same rows, same
    // now, different answer purely because the day boundary moved.
    const la = buildDaySummary({
      pets: [pet('pet-1', 'Biscuit', rows)],
      nowMs,
      timeZone: 'America/Los_Angeles',
    });
    expect(la.sections[0].rows.map((r) => r.id)).toEqual(['e']);
    expect(la.isEmpty).toBe(false);
  });

  it('buckets by local components on the device path (no timeZone arg)', () => {
    // Instants built from LOCAL components — honest under any runner zone, because
    // the assertion is about the local day and no zone is passed (device zone).
    const nowMs = new Date(2026, 7, 2, 14, 0).getTime();
    const rows = [
      mkRow({ id: 'today', occurred_at: new Date(2026, 7, 2, 8, 0).toISOString() }),
      mkRow({ id: 'last-night', occurred_at: new Date(2026, 7, 1, 23, 0).toISOString() }),
    ];
    const model = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['today']);
  });

  it('drops an unparseable occurred_at rather than throwing', () => {
    const nowMs = Date.parse('2026-08-02T12:00:00Z');
    const rows = [
      mkRow({ id: 'good', occurred_at: '2026-08-02T09:00:00Z' }),
      mkRow({ id: 'bad', occurred_at: 'not-a-date' }),
    ];
    const model = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs, timeZone: 'UTC' });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['good']);
  });
});

describe('buildDaySummary — soft delete + ordering + reuse', () => {
  const nowMs = Date.parse('2026-08-02T20:00:00Z');
  const tz = 'UTC';

  it('never shows a soft-deleted event', () => {
    const rows = [
      mkRow({ id: 'live', occurred_at: '2026-08-02T09:00:00Z' }),
      mkRow({ id: 'gone', occurred_at: '2026-08-02T10:00:00Z', deleted_at: '2026-08-02T11:00:00Z' }),
    ];
    const model = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs, timeZone: tz });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['live']);
  });

  it('orders rows earliest-first regardless of input order', () => {
    const rows = [
      mkRow({ id: 'evening', occurred_at: '2026-08-02T19:00:00Z' }),
      mkRow({ id: 'morning', occurred_at: '2026-08-02T07:00:00Z' }),
      mkRow({ id: 'noon', occurred_at: '2026-08-02T12:00:00Z' }),
    ];
    const model = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs, timeZone: tz });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['morning', 'noon', 'evening']);
  });

  it('carries the event id (the doorway target) and describeDayEvent’s display', () => {
    const rows = [
      mkRow({
        id: 'meal-1',
        event_type: 'meal',
        occurred_at: '2026-08-02T08:00:00Z',
        food_brand: 'Hill’s',
        food_product_name: 'i/d',
        food_type: 'meal',
        intake_rating: 'refused',
      }),
    ];
    const [row] = buildDaySummary({
      pets: [pet('pet-1', 'Biscuit', rows)],
      nowMs,
      timeZone: tz,
    }).sections[0].rows;
    expect(row.id).toBe('meal-1');
    expect(row.title).toBe('Hill’s · i/d');
    // A refusal is surfaced plainly (describeDayEvent's INTAKE_PHRASE), never softened.
    expect(row.detail).toBe('refused');
    expect(row.category).toBe('meal');
  });
});

describe('buildDaySummary — multi-pet sections (§5.3)', () => {
  const nowMs = Date.parse('2026-08-02T20:00:00Z');
  const tz = 'UTC';

  it('renders one section per pet, in the input (active-first) order', () => {
    const model = buildDaySummary({
      pets: [
        pet('pet-2', 'Rex', [mkRow({ id: 'r1', pet_id: 'pet-2', occurred_at: '2026-08-02T09:00:00Z' })]),
        pet('pet-1', 'Biscuit', [mkRow({ id: 'b1', occurred_at: '2026-08-02T10:00:00Z' })]),
      ],
      nowMs,
      timeZone: tz,
    });
    expect(model.petCount).toBe(2);
    expect(model.sections.map((s) => s.petName)).toEqual(['Rex', 'Biscuit']);
    expect(model.isEmpty).toBe(false);
  });

  it('marks a pet with nothing today as zero-log without emptying the screen', () => {
    const model = buildDaySummary({
      pets: [
        pet('pet-1', 'Biscuit', [mkRow({ id: 'b1', occurred_at: '2026-08-02T10:00:00Z' })]),
        pet('pet-2', 'Rex', []),
      ],
      nowMs,
      timeZone: tz,
    });
    expect(model.sections[0].isZeroLog).toBe(false);
    expect(model.sections[1].isZeroLog).toBe(true);
    // One pet logged → the whole screen is NOT the empty state.
    expect(model.isEmpty).toBe(false);
  });

  it('is the whole-screen empty state only when NO pet has anything today', () => {
    const model = buildDaySummary({
      pets: [pet('pet-1', 'Biscuit', []), pet('pet-2', 'Rex', [])],
      nowMs,
      timeZone: tz,
    });
    expect(model.isEmpty).toBe(true);
  });

  it('treats an account with no pets as the (vacuous) empty state, never a crash', () => {
    const model = buildDaySummary({ pets: [], nowMs, timeZone: tz });
    expect(model).toEqual({ sections: [], isEmpty: true, petCount: 0 });
  });

  it('never shows another pet’s row under this pet (defense-in-depth pet scope)', () => {
    // A row whose pet_id disagrees with its bucket is dropped — the guard against a
    // future combined-query refactor cross-wiring two pets' records. The loader
    // scopes per pet today, so this can only be exercised by handing the builder a
    // deliberately mis-bucketed row.
    const model = buildDaySummary({
      pets: [
        pet('pet-1', 'Biscuit', [
          mkRow({ id: 'mine', pet_id: 'pet-1', occurred_at: '2026-08-02T09:00:00Z' }),
          mkRow({ id: 'not-mine', pet_id: 'pet-2', occurred_at: '2026-08-02T10:00:00Z' }),
        ]),
      ],
      nowMs,
      timeZone: tz,
    });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['mine']);
  });
});

describe('localDayBoundsIso (device-zone prefetch bounds)', () => {
  it('returns local-midnight-today .. local-midnight-tomorrow (B-514: built from components)', () => {
    const now = new Date(2026, 7, 2, 14, 30, 15);
    const { after, before } = localDayBoundsIso(now.getTime());
    expect(after).toBe(new Date(2026, 7, 2, 0, 0, 0, 0).toISOString());
    expect(before).toBe(new Date(2026, 7, 3, 0, 0, 0, 0).toISOString());
  });

  it('advances the date by exactly one local day across a month boundary', () => {
    const now = new Date(2026, 7, 31, 21, 0);
    const { after, before } = localDayBoundsIso(now.getTime());
    expect(after).toBe(new Date(2026, 7, 31, 0, 0).toISOString());
    expect(before).toBe(new Date(2026, 8, 1, 0, 0).toISOString());
  });
});

describe('zero-log copy — G2: record state, never a wellness verdict', () => {
  // The clinical-guardrails invariant applied to an empty day: nothing here may
  // read a silent record as reassurance. This is the enforcement, not the review.
  const FORBIDDEN = [
    'all clear', 'all quiet', 'all good', 'nothing wrong', 'healthy', 'fine',
    'great', 'perfect', 'no problems', 'no issues', 'well', "you're good",
  ];
  const strings = [
    DAY_SUMMARY_ZERO_LOG.title,
    DAY_SUMMARY_ZERO_LOG.body,
    DAY_SUMMARY_ZERO_LOG.cta,
    petZeroLogLine('Biscuit'),
    daySummaryEmptyTitle('Biscuit'),
    daySummaryEmptyTitle(null),
  ];

  it('contains no reassurance / wellness-verdict language', () => {
    for (const s of strings) {
      const lower = s.toLowerCase();
      for (const bad of FORBIDDEN) {
        expect(lower).not.toContain(bad);
      }
    }
  });

  it('uses no exclamation marks (nyx-voice)', () => {
    for (const s of strings) expect(s).not.toContain('!');
  });

  it('names the pet in the per-pet line (a record fact about THIS pet’s day)', () => {
    expect(petZeroLogLine('Biscuit')).toContain('Biscuit');
    expect(petZeroLogLine('Biscuit').toLowerCase()).toContain('record');
  });

  it('names the pet in the single-pet empty title, stays neutral without one', () => {
    // Pattern 1 — the single-pet zero-log title names the pet (the wedge owner's
    // commonest empty state); a no-pet / multi-pet-all-empty screen can't pick one.
    expect(daySummaryEmptyTitle('Biscuit')).toContain('Biscuit');
    expect(daySummaryEmptyTitle(null)).toBe(DAY_SUMMARY_ZERO_LOG.title);
    expect(daySummaryEmptyTitle(undefined)).toBe(DAY_SUMMARY_ZERO_LOG.title);
    // A title, not the inline sentence — no trailing period.
    expect(daySummaryEmptyTitle('Biscuit').endsWith('.')).toBe(false);
  });
});
