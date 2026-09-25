import { create } from 'zustand';

import { EVENT_TYPES, type EventTypeKey } from '../constants/eventTypes';
import {
  ALL_TIME,
  sameWindow,
  weekStartOf,
  type HistoryWindowKey,
  type ResolvedWindow,
} from '../lib/historyWindows';
import { usePetStore } from './petStore';

// What History v2 is showing: the filter, the window, the search, the landed day and the
// strip's week (CUL-1160; docs/nyx-history-v2-requirements.md §3.1, §3.9, §5.2).
//
// WHY A STORE. Four surfaces read one scope, in four components HV-7, HV-8 and HV-9 build
// in parallel: the pinned row writes it, the list reads it, the strip pages and rings in
// it, and a link into History (HV-11) sets it before the screen may even be mounted. A
// prop chain through the screen would be three levels deep and would lose a link's
// request that arrives before the list does.
//
// ── A PET SWITCH RESETS ALL OF IT, SYNCHRONOUSLY (GAP-27, AC 13) ────────────────
//
// The store follows the pet store directly (the subscription at the foot of this file),
// so a switch, the fallback when the active pet is archived, and sign-out's `reset()`
// each put every field back to its default INSIDE the pet store's own update, before
// React renders anything. There is never a frame with one pet's name over another's
// filter, and nothing in the scope survives the switch: the window holds an identity
// ("since the trial"), never a date, so no trial or visit anchor can reach another pet
// even in principle; a course filter's key and a landed day are cleared outright.
//
// ── EVERY WRITE NAMES ITS PET, AND A STALE ONE IS DROPPED ───────────────────────
//
// The pet rides on the request (the `IntakeDoorRequest` rule in `uiStore.ts`): every
// setter takes the pet id it was made for and does nothing, returning false, unless that
// is the pet the store is on. A tap or a link that outlived a switch cannot re-point the
// new pet's scope, the same rule as a read that answers for another pet (CUL-1120).
//
// ── THE LANDED DAY IS TWO THINGS (§3.1) ─────────────────────────────────────────
//
//   • `landedDay` is STATE: the outline on the day card and the ring on the strip. It
//     stays until the owner's own scroll clears it (`clearLanded`); a programmatic
//     scroll never does, and neither does a filter or window change.
//   • The request to scroll there is ONE-SHOT (C-22). It sits in `pendingLanding`,
//     which nothing renders, and `landTick` counts requests so the list's effect re-runs
//     for a new one. The list calls `takeLanding()`, which reads and clears the request
//     in one synchronous step BEFORE the scroll: an effect that re-enters with a stale
//     closure, or a list that remounts, finds nothing and cannot fire it twice, while a
//     request made before the list mounted is still there when it does.
//
// Not persisted and not account state beyond the session: it lives in memory, and
// sign-out's pet `reset()` clears it through the same subscription.

/** What the list shows (§3.8): the type sheet's options. */
export type HistoryFilter =
  | { kind: 'all' }
  /** One event type. `check_in` is the look's parent and is Noticed, below, instead. */
  | { kind: 'type'; type: Exclude<EventTypeKey, 'check_in'> }
  | { kind: 'symptoms' }
  /** One medication course, keyed by `deriveMedicationCourses` (`lib/medicationHistory`),
   *  the vet report's course grain. */
  | { kind: 'course'; courseKey: string }
  | { kind: 'photographed' }
  | { kind: 'noted' }
  /** The daily look: no count anywhere under it (H-9). */
  | { kind: 'noticed' };

export const ALL_TYPES: HistoryFilter = { kind: 'all' };

/** The scope as the screen reads it. */
export interface HistoryScope {
  /** The pet this scope belongs to: the active pet, or null before one exists. */
  petId: string | null;
  filter: HistoryFilter;
  window: HistoryWindowKey;
  /** The search field is open (§3.7). Closing it clears the text: nothing is saved. */
  searchOpen: boolean;
  searchText: string;
  /** The day a strip tap or a link landed on: the outline and the ring. */
  landedDay: string | null;
  /** The strip's week, as its Sunday ('YYYY-MM-DD'). Null is the default: the week that
   *  holds the window's last day, which HV-8 resolves against the window's bounds. */
  stripWeek: string | null;
}

/** A link's whole request, applied at once (§5.8, AC 37): the filter and window it asks
 *  for, and the day it lands on. Fields left out keep their current value. */
export interface HistoryDoorRequest {
  filter?: HistoryFilter;
  window?: HistoryWindowKey;
  landOn?: string;
}

interface HistoryScopeState extends HistoryScope {
  /** The one-shot scroll request (C-22). Never rendered: read it with `takeLanding`. */
  pendingLanding: string | null;
  /** Counts landing requests; the list's effect depends on it. Only ever counts up. */
  landTick: number;

  setFilter: (petId: string, filter: HistoryFilter) => boolean;
  setWindow: (petId: string, window: HistoryWindowKey) => boolean;
  openSearch: (petId: string) => boolean;
  setSearchText: (petId: string, text: string) => boolean;
  closeSearch: (petId: string) => boolean;
  /** Land on a day: the outline, the strip's week, and the one-shot scroll request. */
  landOn: (petId: string, day: string) => boolean;
  /** The list consumes the scroll request: read and cleared in one step (C-22). */
  takeLanding: () => string | null;
  /** The owner's own scroll: the outline and ring go, and an unconsumed request with them. */
  clearLanded: (petId: string) => boolean;
  /** The strip's pager: a week (normalised to its Sunday), or null for the default. */
  setStripWeek: (petId: string, week: string | null) => boolean;
  /** Tapping History again (§3.1): the strip back to this week, the landed state cleared.
   *  The scroll to the top is the screen's. */
  returnToToday: (petId: string) => boolean;
  /** A link into History: its filter, window and landing in ONE update, so the pill, the
   *  strip's week and the count line agree however the request was put together. False
   *  when it was for another pet (nothing applied) or asked to land on a day that is not
   *  a day (the rest applied). */
  applyDoor: (petId: string, request: HistoryDoorRequest) => boolean;
}

/** Every field at its default, for one pet: All types, All time, search closed, nothing
 *  landed, the strip on its default week (§3.9's reset list). */
export function defaultHistoryScope(petId: string | null): HistoryScope {
  return {
    petId,
    filter: ALL_TYPES,
    window: ALL_TIME,
    searchOpen: false,
    searchText: '',
    landedDay: null,
    stripWeek: null,
  };
}

/** A filter's stable id: the scope key's filter part, and what `sameFilter` compares. */
export function filterId(filter: HistoryFilter): string {
  switch (filter.kind) {
    case 'type':
      return `type:${filter.type}`;
    case 'course':
      return `course:${filter.courseKey}`;
    default:
      return filter.kind;
  }
}

export function sameFilter(a: HistoryFilter, b: HistoryFilter): boolean {
  return filterId(a) === filterId(b);
}

/**
 * A `?type=` link value (v1's, which every existing sender uses) as a filter. A look's
 * `check_in` is Noticed; any other real event type is that type; anything else is All
 * types, v1's rule (`coerceEventTypeKey`): a bad link shows more, never a crash.
 * `hasOwnProperty`, so an inherited key like `toString` cannot pass as a type.
 */
export function filterFromTypeParam(value: string | null | undefined): HistoryFilter {
  if (!value || !Object.prototype.hasOwnProperty.call(EVENT_TYPES, value)) return ALL_TYPES;
  const type = value as EventTypeKey;
  return type === 'check_in' ? { kind: 'noticed' } : { kind: 'type', type };
}

/** The search the query takes: the trimmed text while the field is open, else none. */
export function effectiveSearch(scope: Pick<HistoryScope, 'searchOpen' | 'searchText'>): string | null {
  const text = scope.searchText.trim();
  return scope.searchOpen && text.length > 0 ? text : null;
}

/**
 * The key a read is tagged with (HV-7): everything that decides which rows the read
 * returns. A read that answers under a different key is for a scope no longer on screen
 * and is dropped (CUL-1120's shape, AC 12).
 *
 * It takes the RESOLVED window, not the window's name, because the name does not fix the
 * dates: *Last 7 days* moves at midnight, and *Since the last vet visit* moves when a
 * newer visit syncs in, while the name stays the same. Keyed on the name, a read made
 * before midnight that answered after it would paint days the pill no longer names (the
 * adversarial pass on CUL-1160). The facts' pet rides along too, so a window resolved
 * from another pet's record never matches this pet's key. The landed day and the strip's
 * week are not part of it: neither changes a row.
 */
export function historyScopeKey(
  scope: HistoryScope,
  window: Pick<ResolvedWindow, 'bounds' | 'petId'>,
): string {
  return JSON.stringify([
    scope.petId,
    window.petId,
    filterId(scope.filter),
    window.bounds.fromDay,
    window.bounds.toDay,
    effectiveSearch(scope),
  ]);
}

/** The scope fields of the store's state, for `historyScopeKey` and for tests. */
export function historyScopeOf(state: HistoryScope): HistoryScope {
  const { petId, filter, window, searchOpen, searchText, landedDay, stripWeek } = state;
  return { petId, filter, window, searchOpen, searchText, landedDay, stripWeek };
}

export const useHistoryScopeStore = create<HistoryScopeState>((set, get) => {
  /** Apply `patch` only when it was made for the pet the store is on. A patch of null is
   *  a refused request (a day that is not a day); an empty one is already true, and
   *  writes nothing, so no subscriber hears a change that did not happen. */
  const forPet = (
    petId: string,
    patch: (state: HistoryScopeState) => Partial<HistoryScopeState> | null,
  ): boolean => {
    const state = get();
    if (petId !== state.petId) return false;
    const next = patch(state);
    if (next === null) return false;
    if (Object.keys(next).length > 0) set(next);
    return true;
  };

  /** A landing's fields, or null for a day that is not a real calendar day. */
  const landing = (state: HistoryScopeState, day: string): Partial<HistoryScopeState> | null => {
    const week = weekStartOf(day);
    if (week === null) return null;
    return { landedDay: day, pendingLanding: day, landTick: state.landTick + 1, stripWeek: week };
  };

  return {
    ...defaultHistoryScope(usePetStore.getState().activePet?.id ?? null),
    pendingLanding: null,
    landTick: 0,

    // A filter change keeps the strip's week: the same days, marked for the new filter.
    setFilter: (petId, filter) =>
      forPet(petId, (s) => (sameFilter(s.filter, filter) ? {} : { filter })),

    // A window change moves the strip to the new window's default week.
    setWindow: (petId, window) =>
      forPet(petId, (s) => (sameWindow(s.window, window) ? {} : { window, stripWeek: null })),

    openSearch: (petId) => forPet(petId, (s) => (s.searchOpen ? {} : { searchOpen: true })),
    setSearchText: (petId, text) =>
      forPet(petId, (s) =>
        s.searchOpen && s.searchText === text ? {} : { searchOpen: true, searchText: text },
      ),
    closeSearch: (petId) =>
      forPet(petId, (s) =>
        !s.searchOpen && s.searchText === '' ? {} : { searchOpen: false, searchText: '' },
      ),

    landOn: (petId, day) => forPet(petId, (s) => landing(s, day)),

    takeLanding: () => {
      const day = get().pendingLanding;
      if (day !== null) set({ pendingLanding: null });
      return day;
    },

    clearLanded: (petId) => forPet(petId, () => ({ landedDay: null, pendingLanding: null })),

    setStripWeek: (petId, week) =>
      forPet(petId, () => {
        if (week === null) return { stripWeek: null };
        const sunday = weekStartOf(week);
        return sunday === null ? null : { stripWeek: sunday };
      }),

    returnToToday: (petId) =>
      forPet(petId, () => ({ landedDay: null, pendingLanding: null, stripWeek: null })),

    // A day that is not a day is skipped and the rest still applies: a bad link degrades
    // to showing more (v1's rule), never to ignoring the filter it asked for. The answer
    // is then false, so a caller can tell the link did not land where it asked.
    applyDoor: (petId, request) => {
      let landingRefused = false;
      const applied = forPet(petId, (s) => {
        const next: Partial<HistoryScopeState> = {};
        if (request.filter && !sameFilter(s.filter, request.filter)) next.filter = request.filter;
        if (request.window && !sameWindow(s.window, request.window)) {
          next.window = request.window;
          next.stripWeek = null;
        }
        // Last, so the landed day's week wins over the window's default.
        if (request.landOn !== undefined) {
          const landed = landing(s, request.landOn);
          if (landed) Object.assign(next, landed);
          else landingRefused = true;
        }
        return next;
      });
      return applied && !landingRefused;
    },
  };
});

/**
 * Follow the active pet. Runs inside the pet store's own update, so the reset lands before
 * React renders the switch (the header). Compared against THIS store's pet rather than the
 * pet store's previous state, so the two converge on every pet-store change whatever
 * happened in between.
 */
usePetStore.subscribe((petState) => {
  const petId = petState.activePet?.id ?? null;
  if (petId === useHistoryScopeStore.getState().petId) return;
  useHistoryScopeStore.setState({ ...defaultHistoryScope(petId), pendingLanding: null });
});
