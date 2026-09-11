import { mergeTimelineItems, type ListItem } from './historyTimeline';
import type { NyxEvent } from '../store/eventStore';
import type { BoundaryMarker } from './feedingArrangements';
import type { HistoryVisitRow } from './vetVisits';

// The History stream's merge rule (CUL-904 VV-6, extracted from the screen).
//
// This file exists because the screen-level version of the withholding test below
// PASSED OVER ITS OWN MUTATION: the row the rule withholds sorts to the bottom of
// the list, and a FlatList under test only mounts its first window, so deleting the
// rule changed nothing observable in the rendered tree. The effect is in the data,
// so the assertion is over the data (C-18: a guard is proven by breaking the
// source, and one that cannot be broken is not measuring anything).
//
// Fixtures are built from LOCAL components — the day boundary is local midnight and
// the CI matrix runs this at UTC+14 / +12:45 / −10 (C-29).

function localMs(y: number, m: number, d: number, h = 0): number {
  return new Date(y, m - 1, d, h).getTime();
}

function ev(id: string, y: number, m: number, d: number, h = 9): NyxEvent {
  return {
    id,
    pet_id: 'p1',
    event_type: 'meal',
    occurred_at: new Date(y, m - 1, d, h).toISOString(),
    severity: null,
    notes: null,
    source: 'manual',
    deleted_at: null,
    created_at: new Date(y, m - 1, d, h).toISOString(),
    updated_at: new Date(y, m - 1, d, h).toISOString(),
  } as NyxEvent;
}

function marker(id: string, y: number, m: number, d: number): BoundaryMarker {
  return {
    id,
    kind: 'started',
    date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    sortMs: localMs(y, m, d),
    foodLabel: 'Tiki Cat · Chicken',
  };
}

function visit(id: string, y: number, m: number, d: number): HistoryVisitRow {
  return {
    id,
    petId: 'p1',
    visitedAt: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    sortMs: localMs(y, m, d),
    reason: 'GI follow-up',
    where: 'Riverside Animal Hospital',
  };
}

const BASE = {
  events: [] as NyxEvent[],
  markers: [] as BoundaryMarker[],
  visits: [] as HistoryVisitRow[],
  typeFilter: null as string | null,
  after: null as string | null,
  before: null as string | null,
  hasMore: false,
};

const kinds = (items: ListItem[]) =>
  items.map((i) => (i.kind === 'event' ? `e:${i.event.id}` : i.kind === 'marker' ? `m:${i.marker.id}` : `v:${i.visit.id}`));

describe('mergeTimelineItems', () => {
  it('interleaves a visit into the event stream at the foot of its own day', () => {
    const out = mergeTimelineItems({
      ...BASE,
      events: [ev('e1', 2026, 7, 31), ev('e2', 2026, 7, 30, 14), ev('e3', 2026, 7, 29)],
      visits: [visit('v1', 2026, 7, 30)],
    });

    // The visit's sort key is LOCAL MIDNIGHT of its day, so it sits below that
    // day's events and above the previous day's — the BoundaryMarker convention,
    // and the only honest position for a row that records a day and not a time.
    expect(kinds(out)).toEqual(['e:e1', 'e:e2', 'v:v1', 'e:e3']);
  });

  it('drops both non-event kinds under a type lens', () => {
    const out = mergeTimelineItems({
      ...BASE,
      typeFilter: 'meal',
      events: [ev('e1', 2026, 7, 31)],
      markers: [marker('m1', 2026, 7, 30)],
      visits: [visit('v1', 2026, 7, 30)],
    });

    expect(kinds(out)).toEqual(['e:e1']);
  });

  it('withholds a row older than the oldest loaded event while more remain unpaginated', () => {
    const out = mergeTimelineItems({
      ...BASE,
      hasMore: true,
      events: [ev('e1', 2026, 8, 20), ev('e2', 2026, 8, 10)],
      markers: [marker('m1', 2026, 1, 5)],
      visits: [visit('v1', 2026, 1, 5)],
    });

    // Rendering either now would put a January row above August events that have
    // simply not loaded yet. THE MUTATION THIS CATCHES: deleting the tail clause
    // from `inScope`. The screen-level version of this assertion could not — the
    // withheld rows sort to the bottom, below a FlatList's render window.
    expect(kinds(out)).toEqual(['e:e1', 'e:e2']);
  });

  it('releases them once the stream is fully paged', () => {
    const out = mergeTimelineItems({
      ...BASE,
      hasMore: false,
      events: [ev('e1', 2026, 8, 20), ev('e2', 2026, 8, 10)],
      markers: [marker('m1', 2026, 1, 5)],
      visits: [visit('v1', 2026, 1, 5)],
    });

    expect(kinds(out)).toEqual(['e:e1', 'e:e2', 'm:m1', 'v:v1']);
  });

  it('shows them with no events at all — there is no tail to be below', () => {
    const out = mergeTimelineItems({
      ...BASE,
      hasMore: true,
      visits: [visit('v1', 2026, 1, 5)],
      markers: [marker('m1', 2026, 1, 6)],
    });

    expect(kinds(out)).toEqual(['m:m1', 'v:v1']);
  });

  it('applies the scope bounds to a visit exactly as it does to a marker', () => {
    const within = { ...BASE, after: new Date(2026, 6, 1).toISOString() };

    // One population, one rule (C-4): a visit and a marker on the same day must
    // both be in scope or both be out. Two predicates here is how the two kinds
    // start disagreeing about which day is on screen.
    const before = mergeTimelineItems({
      ...within,
      markers: [marker('m1', 2026, 6, 30)],
      visits: [visit('v1', 2026, 6, 30)],
    });
    expect(kinds(before)).toEqual([]);

    const after = mergeTimelineItems({
      ...within,
      markers: [marker('m1', 2026, 7, 2)],
      visits: [visit('v1', 2026, 7, 2)],
    });
    expect(kinds(after)).toEqual(['m:m1', 'v:v1']);
  });

  it('drops a visit past a single-day filter\'s upper bound', () => {
    const out = mergeTimelineItems({
      ...BASE,
      after: new Date(2026, 6, 30).toISOString(),
      before: new Date(2026, 6, 31).toISOString(),
      visits: [visit('v1', 2026, 7, 30), visit('v2', 2026, 7, 31)],
    });

    expect(kinds(out)).toEqual(['v:v1']);
  });
});
