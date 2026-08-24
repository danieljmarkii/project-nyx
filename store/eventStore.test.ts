import { useEventStore, NyxEvent } from './eventStore';

// restoreToToday (CUL-575) — the rollback half of an optimistic delete. History
// removes the row before the write lands; when the write fails it puts the row back,
// and Home has to get it back too (Home reloads Today on mount and on a hydration
// tick, not on focus, so "the next read" can be a long time away).

function ev(id: string, occurredAt: string): NyxEvent {
  return {
    id,
    pet_id: 'p1',
    event_type: 'meal',
    occurred_at: occurredAt,
    severity: null,
    notes: null,
    source: 'manual',
    deleted_at: null,
    created_at: occurredAt,
    updated_at: occurredAt,
  };
}

// Today is held newest-first, so these are in render order.
const noon = ev('noon', '2026-08-24T12:00:00Z');
const nine = ev('nine', '2026-08-24T09:00:00Z');
const seven = ev('seven', '2026-08-24T07:00:00Z');

beforeEach(() => {
  useEventStore.setState({ todayEvents: [] });
});

describe('restoreToToday', () => {
  it('puts the event back where it was, not at the top', () => {
    useEventStore.setState({ todayEvents: [noon, seven] });
    useEventStore.getState().restoreToToday(nine);
    expect(useEventStore.getState().todayEvents.map((e) => e.id)).toEqual([
      'noon', 'nine', 'seven',
    ]);
  });

  it('appends an event older than everything held', () => {
    useEventStore.setState({ todayEvents: [noon, nine] });
    useEventStore.getState().restoreToToday(seven);
    expect(useEventStore.getState().todayEvents.map((e) => e.id)).toEqual([
      'noon', 'nine', 'seven',
    ]);
  });

  it('restores into an empty Today', () => {
    useEventStore.getState().restoreToToday(nine);
    expect(useEventStore.getState().todayEvents.map((e) => e.id)).toEqual(['nine']);
  });

  // A retry, a double-tap, or a re-render must not leave the owner looking at the
  // same meal twice — which would read as a second feeding that never happened.
  it('is idempotent — a second restore does not duplicate the row', () => {
    useEventStore.getState().restoreToToday(nine);
    useEventStore.getState().restoreToToday(nine);
    expect(useEventStore.getState().todayEvents).toHaveLength(1);
  });

  // The round trip the delete path actually performs.
  it('undoes removeFromToday exactly', () => {
    useEventStore.setState({ todayEvents: [noon, nine, seven] });
    useEventStore.getState().removeFromToday('nine');
    useEventStore.getState().restoreToToday(nine);
    expect(useEventStore.getState().todayEvents.map((e) => e.id)).toEqual([
      'noon', 'nine', 'seven',
    ]);
  });
});
