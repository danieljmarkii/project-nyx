// What the History timeline actually shows, extracted pure so the rule is testable
// without mounting the screen — the same reason `lib/historyDateFilter.ts` exists
// (B-308), and for VV-6 (CUL-904) a necessary one rather than a tidy one.
//
// WHY IT HAD TO COME OUT OF THE SCREEN. The rule below withholds a row that would
// otherwise render at the very BOTTOM of the list, and a `FlatList` under test only
// mounts its first window — so a screen-level test of the withholding passes
// whether the rule is there or not. Measured: deleting the unpaginated-tail clause
// left the screen test green, because the row it should have started rendering was
// fifty rows below the fold. A rule whose whole effect is at the tail of a
// virtualized list is not observable from the rendered tree, so it is asserted over
// the data instead.

import type { NyxEvent } from '../store/eventStore';
import type { BoundaryMarker } from './feedingArrangements';
import type { HistoryVisitRow } from './vetVisits';

// History renders three kinds of timeline row: discrete events, the quiet
// free-feeding lifecycle boundary markers (§6a), and — behind the `vet_visits`
// flag — a vet visit (CUL-904 VV-6). They are merged into one desc stream so a
// "Started free-feeding" sits at the foot of its calendar day.
//
// A visit is NOT an `events` row and never becomes one (spec AC 10). It arrives
// from `vet_visits` through its own read, renders through its own component, and
// is dropped from this list before any code that counts anything sees it — which
// is why it is a third `kind` here rather than a `NyxEvent` with a special type.
export type ListItem =
  | { kind: 'event'; event: NyxEvent }
  | { kind: 'marker'; marker: BoundaryMarker }
  | { kind: 'visit'; visit: HistoryVisitRow };

export function itemSortMs(item: ListItem): number {
  switch (item.kind) {
    case 'event': return new Date(item.event.occurred_at).getTime();
    case 'marker': return item.marker.sortMs;
    // Local midnight of the visit's calendar day (lib/vetVisits.ts) — the marker
    // convention, so a visit sits at the foot of its day beside them.
    case 'visit': return item.visit.sortMs;
  }
}

export interface TimelineInput {
  events: ReadonlyArray<NyxEvent>;
  markers: ReadonlyArray<BoundaryMarker>;
  visits: ReadonlyArray<HistoryVisitRow>;
  /** The type lens, or null for all events. */
  typeFilter: string | null;
  /** The scope's [after, before) bounds, as ISO instants (`effectiveRange`). */
  after: string | null;
  before: string | null;
  /** Whether more events remain unpaginated. */
  hasMore: boolean;
}

/**
 * The merged, descending stream.
 *
 * Neither non-event kind is a `NyxEvent`, so both appear only when the list isn't
 * type-filtered: a "Vomit" filter shouldn't surface feeding boundaries, and the
 * type lens is a lens over EVENTS, so a visit has no honest answer to it (VV-6's
 * on-the-fly decision — the all-events lens only; its own lens chip was the
 * alternative and is not v1).
 */
export function mergeTimelineItems(input: TimelineInput): ListItem[] {
  const { events, markers, visits, typeFilter, after, before, hasMore } = input;
  const eventItems: ListItem[] = events.map((e) => ({ kind: 'event', event: e }));
  if (typeFilter !== null) return eventItems;

  const cutoffMs = after ? new Date(after).getTime() : null;
  const beforeMs = before ? new Date(before).getTime() : null;
  const oldestEventMs = events.length > 0
    ? new Date(events[events.length - 1].occurred_at).getTime()
    : null;

  // ONE rule, applied to both kinds, rather than the same three predicates written
  // twice. A visit and a marker are in the stream on identical terms — a dated row
  // that is not an event — so a change to the scope or the tail rule must reach
  // both, or the two start disagreeing about which day is on screen.
  const inScope = (sortMs: number): boolean => {
    if (cutoffMs !== null && sortMs < cutoffMs) return false;
    // Single-day filter: drop rows past the day's upper bound too (B-308).
    if (beforeMs !== null && sortMs >= beforeMs) return false;
    // While more events remain unpaginated, a row older than the oldest loaded
    // event is WITHHELD — otherwise it renders above events that have simply not
    // loaded yet, i.e. in the wrong place in the owner's own history. It returns
    // once the stream is fully paged (or when there are no events at all).
    if (oldestEventMs !== null && hasMore && sortMs < oldestEventMs) return false;
    return true;
  };

  const markerItems: ListItem[] = markers
    .filter((m) => inScope(m.sortMs))
    .map((m) => ({ kind: 'marker' as const, marker: m }));

  const visitItems: ListItem[] = visits
    .filter((v) => inScope(v.sortMs))
    .map((v) => ({ kind: 'visit' as const, visit: v }));

  return [...eventItems, ...markerItems, ...visitItems]
    .sort((a, b) => itemSortMs(b) - itemSortMs(a));
}
