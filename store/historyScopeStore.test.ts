// History v2's scope store (CUL-1160; spec §3.1, §3.9, §5.2; AC 13's store half).
//
// The pet switch is driven through the REAL pet store, never by calling a reset directly:
// what AC 13 needs is that every way the active pet changes (a switch, the fallback when
// the active pet is archived, sign-out's reset, a reload that resolves another pet) resets
// the scope, and only the pet store's own mutators can show that. The render test at the
// foot proves the reset lands before React paints the switch.

import React from 'react';
import { act, render } from '@testing-library/react-native';

import type { HistoryWindowKey, ResolvedWindow } from '../lib/historyWindows';
import {
  ALL_TYPES,
  defaultHistoryScope,
  effectiveSearch,
  filterFromTypeParam,
  filterId,
  historyScopeKey,
  historyScopeOf,
  sameFilter,
  useHistoryScopeStore,
  type HistoryFilter,
  type HistoryScope,
} from './historyScopeStore';
import { usePetStore, type Pet } from './petStore';

function makePet(id: string, name = id): Pet {
  return {
    id,
    name,
    species: 'dog',
    breed: null,
    date_of_birth: null,
    date_of_birth_precision: 'exact',
    sex: 'unknown',
    weight_kg: null,
    photo_path: null,
  };
}

const JORDANS_DOG = makePet('pet-1', 'Biscuit');
const SAMS_CAT = makePet('pet-2', 'Juniper');

const scope = () => historyScopeOf(useHistoryScopeStore.getState());
const store = () => useHistoryScopeStore.getState();

beforeEach(() => {
  // Sign-out, then a fresh load with Biscuit active: the history store follows both.
  usePetStore.getState().reset();
  usePetStore.getState().setPets([JORDANS_DOG, SAMS_CAT], JORDANS_DOG.id);
  useHistoryScopeStore.setState({ landTick: 0 });
});

describe('the defaults', () => {
  it('follows the active pet from the start, every field at its default', () => {
    expect(scope()).toEqual(defaultHistoryScope(JORDANS_DOG.id));
    expect(scope()).toEqual({
      petId: 'pet-1',
      filter: { kind: 'all' },
      window: { kind: 'all' },
      searchOpen: false,
      searchText: '',
      landedDay: null,
      stripWeek: null,
    });
    expect(store().pendingLanding).toBeNull();
  });
});

describe('every write names its pet; a stale one is dropped', () => {
  it('applies each setter for the pet the store is on', () => {
    const id = JORDANS_DOG.id;
    expect(store().setFilter(id, { kind: 'type', type: 'vomit' })).toBe(true);
    expect(store().setWindow(id, { kind: 'trial' })).toBe(true);
    expect(store().setSearchText(id, 'rabbit')).toBe(true);
    expect(store().setStripWeek(id, '2026-09-16')).toBe(true);
    expect(scope()).toMatchObject({
      filter: { kind: 'type', type: 'vomit' },
      window: { kind: 'trial' },
      searchOpen: true,
      searchText: 'rabbit',
      stripWeek: '2026-09-13', // normalised to its Sunday
    });
  });

  it('drops every write made for another pet and changes nothing', () => {
    const before = scope();
    const other = SAMS_CAT.id;
    expect(store().setFilter(other, { kind: 'symptoms' })).toBe(false);
    expect(store().setWindow(other, { kind: 'visit' })).toBe(false);
    expect(store().openSearch(other)).toBe(false);
    expect(store().setSearchText(other, 'tuna')).toBe(false);
    expect(store().closeSearch(other)).toBe(false);
    expect(store().landOn(other, '2026-09-16')).toBe(false);
    expect(store().clearLanded(other)).toBe(false);
    expect(store().setStripWeek(other, '2026-09-13')).toBe(false);
    expect(store().returnToToday(other)).toBe(false);
    expect(store().applyDoor(other, { filter: { kind: 'noticed' }, landOn: '2026-09-16' })).toBe(false);
    expect(scope()).toEqual(before);
    expect(store().pendingLanding).toBeNull();
  });

  it('a write for the new pet, made after a switch, lands; one for the old pet does not', () => {
    usePetStore.getState().selectPet(SAMS_CAT.id);
    expect(store().setFilter(JORDANS_DOG.id, { kind: 'symptoms' })).toBe(false);
    expect(store().setFilter(SAMS_CAT.id, { kind: 'type', type: 'meal' })).toBe(true);
    expect(scope()).toMatchObject({ petId: 'pet-2', filter: { kind: 'type', type: 'meal' } });
  });
});

// ── AC 13 (the store half): a pet switch resets every scope ──────────────────────

/** Every non-default value each field can hold, applied at once. The filters and windows
 *  are exhaustive over their kinds, so a new kind has to be added here to be covered. */
const FILTERS: HistoryFilter[] = [
  { kind: 'type', type: 'vomit' },
  { kind: 'symptoms' },
  { kind: 'course', courseKey: 'regimen-prednisone' },
  { kind: 'photographed' },
  { kind: 'noted' },
  { kind: 'noticed' },
];
const WINDOWS: HistoryWindowKey[] = [
  { kind: 'today' },
  { kind: 'last', days: 14 },
  { kind: 'trial' },
  { kind: 'visit' },
  { kind: 'month', month: '2026-08' },
];

/** Put Biscuit's scope into one fully non-default state. */
function dirty(filter: HistoryFilter, window: HistoryWindowKey) {
  const id = JORDANS_DOG.id;
  store().setFilter(id, filter);
  store().setWindow(id, window);
  store().setSearchText(id, 'rabbit');
  store().landOn(id, '2026-08-03');
  store().setStripWeek(id, '2026-07-26');
  const s = scope();
  // Non-vacuity: every field really is off its default before the switch.
  const defaults = defaultHistoryScope(id);
  for (const field of ['filter', 'window', 'searchOpen', 'searchText', 'landedDay', 'stripWeek'] as const) {
    expect(s[field]).not.toEqual(defaults[field]);
  }
  expect(store().pendingLanding).toBe('2026-08-03');
}

const SWITCHES: [string, () => void, string | null][] = [
  ['a switch to the other pet', () => usePetStore.getState().selectPet(SAMS_CAT.id), 'pet-2'],
  ['archiving the active pet (the fallback)', () => usePetStore.getState().removePet(JORDANS_DOG.id), 'pet-2'],
  ['sign-out', () => usePetStore.getState().reset(), null],
  ['a reload that resolves another pet', () => usePetStore.getState().setPets([SAMS_CAT]), 'pet-2'],
];

describe('AC 13: a pet switch resets every scope, and nothing carries', () => {
  describe.each(SWITCHES)('%s', (_name, doSwitch, nextPet) => {
    it.each(FILTERS.flatMap((f) => WINDOWS.map((w) => [filterId(f), f, w] as const)))(
      'under %s, window %j',
      (_id, filter, window) => {
        dirty(filter, window);
        doSwitch();
        expect(scope()).toEqual(defaultHistoryScope(nextPet));
        // The one-shot request goes too: a landing on the old pet's day never fires on
        // the new pet's list.
        expect(store().pendingLanding).toBeNull();
        expect(store().takeLanding()).toBeNull();
      },
    );
  });

  it('a pet-store change that keeps the same pet resets nothing', () => {
    dirty({ kind: 'symptoms' }, { kind: 'trial' });
    const before = scope();
    usePetStore.getState().updatePet({ name: 'Biscuit II' });
    usePetStore.getState().setPets([JORDANS_DOG, SAMS_CAT]);
    expect(scope()).toEqual(before);
  });

  it('switching back does not restore the old scope: nothing is remembered per pet', () => {
    dirty({ kind: 'noted' }, { kind: 'visit' });
    usePetStore.getState().selectPet(SAMS_CAT.id);
    usePetStore.getState().selectPet(JORDANS_DOG.id);
    expect(scope()).toEqual(defaultHistoryScope(JORDANS_DOG.id));
  });
});

// ── The landed day (§3.1, C-22) ──────────────────────────────────────────────────

describe('the landed day: an outline that stays, a request that fires once', () => {
  const id = JORDANS_DOG.id;

  it('landing sets the outline, the strip’s week and one pending request', () => {
    expect(store().landOn(id, '2026-09-16')).toBe(true);
    expect(scope()).toMatchObject({ landedDay: '2026-09-16', stripWeek: '2026-09-13' });
    expect(store().pendingLanding).toBe('2026-09-16');
    expect(store().landTick).toBe(1);
  });

  it('the request is taken exactly once, so a stale re-entry cannot scroll twice', () => {
    // The C-22 failure, replayed: the list's effect runs, then runs again with the same
    // tick (a passive effect scheduled before the first one finished). Count the scrolls.
    store().landOn(id, '2026-09-16');
    const scrolls: string[] = [];
    const listEffect = () => {
      const day = store().takeLanding();
      if (day) scrolls.push(day);
    };
    listEffect();
    listEffect();
    expect(scrolls).toEqual(['2026-09-16']);
    // The outline outlives the request: only the owner's own scroll clears it.
    expect(scope().landedDay).toBe('2026-09-16');
  });

  it('a request made before the list mounts is still there when it does', () => {
    // A link lands on a day while History is not on screen; the list's first effect,
    // at mount, is what takes it.
    store().landOn(id, '2026-08-03');
    expect(store().takeLanding()).toBe('2026-08-03');
    // And a remount after that finds nothing.
    expect(store().takeLanding()).toBeNull();
  });

  it('every new landing is a new tick, even to the same day', () => {
    store().landOn(id, '2026-09-16');
    store().takeLanding();
    store().landOn(id, '2026-09-16');
    expect(store().landTick).toBe(2);
    expect(store().takeLanding()).toBe('2026-09-16');
  });

  it('a filter or window change leaves the outline (only the owner’s scroll clears it)', () => {
    store().landOn(id, '2026-09-16');
    store().setFilter(id, { kind: 'symptoms' });
    store().setWindow(id, { kind: 'last', days: 30 });
    expect(scope().landedDay).toBe('2026-09-16');
  });

  it('the owner’s scroll clears the outline and any request not yet taken', () => {
    store().landOn(id, '2026-09-16');
    store().clearLanded(id);
    expect(scope().landedDay).toBeNull();
    expect(store().takeLanding()).toBeNull();
  });

  it('tapping History again clears the landing and puts the strip back on its default week', () => {
    store().landOn(id, '2026-08-03');
    store().returnToToday(id);
    expect(scope()).toMatchObject({ landedDay: null, stripWeek: null });
    expect(store().takeLanding()).toBeNull();
  });

  it('refuses a day that is not a day, and changes nothing', () => {
    const before = scope();
    expect(store().landOn(id, '2026-02-30')).toBe(false);
    expect(store().landOn(id, '2026-09-16T10:00:00.000Z')).toBe(false);
    expect(scope()).toEqual(before);
    expect(store().landTick).toBe(0);
  });
});

describe('the strip’s week', () => {
  const id = JORDANS_DOG.id;

  it('a window change moves the strip to the new window’s default week; a filter change does not', () => {
    store().setStripWeek(id, '2026-08-02');
    store().setFilter(id, { kind: 'type', type: 'vomit' });
    expect(scope().stripWeek).toBe('2026-08-02');
    store().setWindow(id, { kind: 'month', month: '2026-08' });
    expect(scope().stripWeek).toBeNull();
  });

  it('refuses a week that is not a day', () => {
    store().setStripWeek(id, '2026-08-02');
    expect(store().setStripWeek(id, 'soon')).toBe(false);
    expect(scope().stripWeek).toBe('2026-08-02');
  });

  it('re-picking the current window is not a change, so the strip stays where it is', () => {
    store().setWindow(id, { kind: 'last', days: 7 });
    store().setStripWeek(id, '2026-09-13');
    const heard = jest.fn();
    const unsubscribe = useHistoryScopeStore.subscribe(heard);
    store().setWindow(id, { kind: 'last', days: 7 });
    unsubscribe();
    expect(heard).not.toHaveBeenCalled();
    expect(scope().stripWeek).toBe('2026-09-13');
  });
});

describe('a link into History, applied at once (AC 37’s store half)', () => {
  const id = JORDANS_DOG.id;

  it('the landed day’s week wins over the window’s default, however the request is built', () => {
    store().applyDoor(id, {
      filter: { kind: 'type', type: 'vomit' },
      window: { kind: 'trial' },
      landOn: '2026-08-03',
    });
    expect(scope()).toMatchObject({
      filter: { kind: 'type', type: 'vomit' },
      window: { kind: 'trial' },
      landedDay: '2026-08-03',
      stripWeek: '2026-08-02',
    });
    expect(store().takeLanding()).toBe('2026-08-03');
  });

  it('leaves out what the link does not ask for', () => {
    store().setSearchText(id, 'rabbit');
    store().applyDoor(id, { window: { kind: 'visit' } });
    expect(scope()).toMatchObject({ filter: ALL_TYPES, window: { kind: 'visit' }, searchText: 'rabbit' });
    expect(store().pendingLanding).toBeNull();
  });

  it('a day that is not a day is skipped, the rest still applies, and the answer says so', () => {
    // False, so a caller can tell the link did not land where it asked; the filter it
    // asked for is shown anyway (a bad link shows more, never less).
    expect(store().applyDoor(id, { filter: { kind: 'noticed' }, landOn: 'yesterday' })).toBe(false);
    expect(scope()).toMatchObject({ filter: { kind: 'noticed' }, landedDay: null });
    expect(store().takeLanding()).toBeNull();
  });

  it('a whole request that applies answers true', () => {
    expect(store().applyDoor(id, { window: { kind: 'last', days: 7 }, landOn: '2026-09-16' })).toBe(true);
  });
});

describe('search (§3.7): nothing is saved', () => {
  const id = JORDANS_DOG.id;

  it('closing the field clears the text', () => {
    store().setSearchText(id, 'rabbit');
    store().closeSearch(id);
    expect(scope()).toMatchObject({ searchOpen: false, searchText: '' });
  });

  it('a search write that changes nothing is not a change', () => {
    // A second tap on the search button, or a keystroke that re-sends the same text,
    // must not wake every subscriber (the rule `setFilter` and `setWindow` already keep).
    store().openSearch(id);
    store().setSearchText(id, 'rabbit');
    const heard = jest.fn();
    const unsubscribe = useHistoryScopeStore.subscribe(heard);
    expect(store().openSearch(id)).toBe(true);
    expect(store().setSearchText(id, 'rabbit')).toBe(true);
    store().closeSearch(id);
    expect(heard).toHaveBeenCalledTimes(1); // the close, and only the close
    expect(store().closeSearch(id)).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('the query takes the trimmed text while the field is open, and nothing otherwise', () => {
    expect(effectiveSearch({ searchOpen: true, searchText: '  rabbit ' })).toBe('rabbit');
    expect(effectiveSearch({ searchOpen: true, searchText: '   ' })).toBeNull();
    expect(effectiveSearch({ searchOpen: false, searchText: 'rabbit' })).toBeNull();
  });
});

describe('the scope key: what decides the rows, and nothing else', () => {
  const base: HistoryScope = defaultHistoryScope('pet-1');
  const WEEK: Pick<ResolvedWindow, 'bounds' | 'petId'> = {
    bounds: { fromDay: '2026-09-15', toDay: '2026-09-21' },
    petId: 'pet-1',
  };
  const key = (patch: Partial<HistoryScope>, window = WEEK) => historyScopeKey({ ...base, ...patch }, window);

  it('changes with the pet, the filter, the dates and the search', () => {
    const k = key({});
    expect(key({ petId: 'pet-2' })).not.toBe(k);
    expect(key({ filter: { kind: 'type', type: 'vomit' } })).not.toBe(k);
    expect(key({ filter: { kind: 'course', courseKey: 'item:unspecified' } })).not.toBe(k);
    expect(key({}, { ...WEEK, bounds: { fromDay: '2026-09-14', toDay: '2026-09-21' } })).not.toBe(k);
    expect(key({}, { ...WEEK, bounds: { fromDay: '2026-09-15', toDay: '2026-09-20' } })).not.toBe(k);
    expect(key({ searchOpen: true, searchText: 'rabbit' })).not.toBe(k);
  });

  it('follows the DATES, not the window’s name, so a read from before midnight is dropped after it', () => {
    // *Last 7 days* at 11:59 PM and at 12:01 AM: one name, two sets of rows (the
    // adversarial pass's finding 3). The same holds when a newer visit syncs in under
    // *Since the last vet visit*.
    const beforeMidnight = key({ window: { kind: 'last', days: 7 } });
    const afterMidnight = key(
      { window: { kind: 'last', days: 7 } },
      { ...WEEK, bounds: { fromDay: '2026-09-16', toDay: '2026-09-22' } },
    );
    expect(afterMidnight).not.toBe(beforeMidnight);
  });

  it('never matches a window resolved from another pet’s record', () => {
    expect(key({}, { ...WEEK, petId: 'pet-2' })).not.toBe(key({}));
  });

  it('does not change with the landed day, the strip’s week or a search that finds nothing yet', () => {
    const k = key({});
    expect(key({ landedDay: '2026-09-16', stripWeek: '2026-09-13' })).toBe(k);
    expect(key({ searchOpen: true, searchText: '  ' })).toBe(k);
    expect(key({ searchOpen: true, searchText: 'rabbit ' })).toBe(key({ searchOpen: true, searchText: ' rabbit' }));
  });

  it('cannot be forged by a search that looks like another field', () => {
    // The key is a JSON tuple, so text containing a separator cannot collide with a
    // different filter or window.
    expect(key({ searchOpen: true, searchText: 'symptoms' })).not.toBe(key({ filter: { kind: 'symptoms' } }));
    expect(key({ searchOpen: true, searchText: '","all' })).not.toBe(key({}));
  });
});

describe('the ?type= link value (v1’s vocabulary)', () => {
  it.each<[string | null | undefined, HistoryFilter]>([
    ['vomit', { kind: 'type', type: 'vomit' }],
    ['medication', { kind: 'type', type: 'medication' }],
    ['check_in', { kind: 'noticed' }], // the Noticed card's link (lib/lookCard.ts)
    ['toString', ALL_TYPES], // inherited, not an event type
    ['scratch_everything', ALL_TYPES],
    ['', ALL_TYPES],
    [undefined, ALL_TYPES],
    [null, ALL_TYPES],
  ])('%p → %j', (value, expected) => {
    expect(filterFromTypeParam(value)).toEqual(expected);
  });

  it('two filters are the same exactly when their ids are', () => {
    expect(sameFilter({ kind: 'course', courseKey: 'a' }, { kind: 'course', courseKey: 'a' })).toBe(true);
    expect(sameFilter({ kind: 'course', courseKey: 'a' }, { kind: 'course', courseKey: 'b' })).toBe(false);
    expect(sameFilter({ kind: 'type', type: 'vomit' }, { kind: 'symptoms' })).toBe(false);
  });
});

// ── The reset lands before React paints the switch ───────────────────────────────

describe('no frame shows one pet’s name over another pet’s scope', () => {
  it('every render after a switch reads the new pet with a default scope', () => {
    // A screen that reads the two stores separately, as HV-7's will, recording what each
    // render saw. If the reset ran a render later (an effect calling a focus method),
    // one recorded frame would pair Juniper with Biscuit's vomit filter.
    const frames: { pet: string | undefined; filter: string; window: string }[] = [];
    function Probe() {
      const pet = usePetStore((s) => s.activePet?.id);
      const filter = useHistoryScopeStore((s) => s.filter);
      const window = useHistoryScopeStore((s) => s.window);
      frames.push({ pet, filter: filterId(filter), window: window.kind });
      return null;
    }

    dirty({ kind: 'type', type: 'vomit' }, { kind: 'trial' });
    render(React.createElement(Probe));
    act(() => {
      usePetStore.getState().selectPet(SAMS_CAT.id);
    });

    const afterSwitch = frames.filter((f) => f.pet === SAMS_CAT.id);
    expect(afterSwitch.length).toBeGreaterThan(0); // non-vacuity: the switch did render
    expect(afterSwitch.every((f) => f.filter === 'all' && f.window === 'all')).toBe(true);
    expect(frames[0]).toEqual({ pet: JORDANS_DOG.id, filter: 'type:vomit', window: 'trial' });
  });
});
