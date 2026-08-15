// buildTodayLane / laneEventPosition (DR-2 §3) — the Home recap band's lane model.
//
// Timezone-honest fixtures (B-514): instants are built from LOCAL components, never a
// UTC literal, because `laneEventPosition` reads the LOCAL clock hour (`getHours`) — so
// the round-trip is invariant across the non-UTC CI zones.

// The builder is pure, but it reaches buildCountChips (lib/daySummary) and
// eventTintCategory (lib/dayEvents), whose transitive imports drag in
// lib/analytics → lib/sync → lib/supabase, which throws at import time without env.
// Stub the leaf so the pure builder runs with no database or config (the same mock
// daySummary.test.ts and the other lib builders use).
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { buildTodayLane, laneEventPosition } from './todayLane';

/** A local instant at hour:minute today (2026-07-24), as the ISO string a NyxEvent
 *  carries. Read back local-clock, it recovers the same hour in any runner zone. */
function at(hour: number, minute = 0): string {
  return new Date(2026, 6, 24, hour, minute, 0, 0).toISOString();
}

const SPAN = 18; // LANE_END_HOUR - LANE_START_HOUR (24 - 6)

describe('laneEventPosition — the 6a→12a track, clamped to [0,1]', () => {
  it('maps the axis anchors: 6a→0, noon→1/3, 6p→2/3, ~midnight→~1', () => {
    expect(laneEventPosition(at(6))).toBeCloseTo(0, 5);
    expect(laneEventPosition(at(12))).toBeCloseTo(1 / 3, 5);
    expect(laneEventPosition(at(18))).toBeCloseTo(2 / 3, 5);
    expect(laneEventPosition(at(23, 59))).toBeCloseTo((23 + 59 / 60 - 6) / SPAN, 5);
  });

  it('positions a mid-morning event by its real minute', () => {
    // 7:42a → the mock's Hill's z/d dot (~9%).
    expect(laneEventPosition(at(7, 42))).toBeCloseTo((7 + 42 / 60 - 6) / SPAN, 5);
  });

  it('clamps a pre-6am event to the start — it still shows, never falls off-track', () => {
    expect(laneEventPosition(at(3))).toBe(0);
    expect(laneEventPosition(at(0, 30))).toBe(0);
  });

  it('never returns NaN on an unparseable instant', () => {
    expect(laneEventPosition('not-a-date')).toBe(0);
  });
});

describe('buildTodayLane', () => {
  it('emits one dot per event, EARLIEST-FIRST, tinted by category', () => {
    const model = buildTodayLane([
      { id: 'b', event_type: 'medication', occurred_at: at(8, 5) },
      { id: 'a', event_type: 'meal', occurred_at: at(7, 42) },
    ]);
    expect(model.dots.map((d) => d.key)).toEqual(['a', 'b']); // sorted, not input order
    expect(model.dots[0]).toMatchObject({ key: 'a', category: 'meal' });
    expect(model.dots[1]).toMatchObject({ key: 'b', category: 'medication' });
    expect(model.dots[0].position).toBeCloseTo((7 + 42 / 60 - 6) / SPAN, 5);
  });

  it('counts the day identically to the recap C2 (one source): symptom → meals → doses', () => {
    const model = buildTodayLane([
      { id: 'm1', event_type: 'meal', occurred_at: at(7) },
      { id: 'm2', event_type: 'meal', occurred_at: at(18) },
      { id: 'd1', event_type: 'medication', occurred_at: at(8) },
    ]);
    expect(model.counts).toEqual([
      { key: 'meal', label: '2 meals', tone: 'neutral' },
      { key: 'medication', label: '1 dose', tone: 'neutral' },
    ]);
  });

  it('leads the counts with a symptom (rose tone) and tints its dot symptom', () => {
    const model = buildTodayLane([
      { id: 'v1', event_type: 'vomit', occurred_at: at(9) },
      { id: 'm1', event_type: 'meal', occurred_at: at(7) },
    ]);
    expect(model.counts[0]).toEqual({ key: 'vomit', label: '1 vomit', tone: 'symptom' });
    expect(model.dots.find((d) => d.key === 'v1')?.category).toBe('symptom');
  });

  it('treats a non-meal/med/symptom event as "other"', () => {
    const model = buildTodayLane([{ id: 'w', event_type: 'weight_check', occurred_at: at(10) }]);
    expect(model.dots[0].category).toBe('other');
  });

  it('orders the "other" count chips by time regardless of input order (recap parity)', () => {
    // `stool_normal` + `weight_check` both bucket to "other" (no fixed order list), so
    // their chip order is ENCOUNTER order. Home feeds events latest-first (its DB query
    // is `ORDER BY occurred_at DESC`); the count line must still list them in the same
    // earliest-first order the night recap counts in — so the two surfaces never disagree.
    const stoolEarly = { id: 's', event_type: 'stool_normal', occurred_at: at(8) };
    const weighLate = { id: 'w', event_type: 'weight_check', occurred_at: at(17) };
    const latestFirst = buildTodayLane([weighLate, stoolEarly]);
    const earliestFirst = buildTodayLane([stoolEarly, weighLate]);
    // Earliest-first output whichever way the caller ordered the input.
    expect(latestFirst.counts.map((c) => c.key)).toEqual(['stool_normal', 'weight_check']);
    expect(latestFirst.counts).toEqual(earliestFirst.counts);
    // …and the dots agree with the counts (same sorted source).
    expect(latestFirst.dots.map((d) => d.key)).toEqual(['s', 'w']);
  });

  it('is empty on a zero-log day — no dots, no count line', () => {
    const model = buildTodayLane([]);
    expect(model.dots).toEqual([]);
    expect(model.counts).toEqual([]);
  });
});
