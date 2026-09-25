// History's day doorways against the rules CUL-1073 and CUL-1119 set (step 0 of History v2):
//
//   • a day link is read BY SENDER (H-7): the month's `?day=` and the widget's
//     `?date=&src=widget` are the owner's LOCAL day; the flag-off calendar's bare `?date=`
//     stays a UTC day until it retires at D2-8;
//   • every bound is parsed, never compared as text (C-40), in the read and in the live
//     insert of a freshly logged event;
//   • the widget's pet applies once per tap, spent on the same `ts` as its day.
//
// Its own file because `history.test.tsx` stubs `useWidgetPetLink` and hands the screen a
// frozen pet store — the two things this suite needs real. Everything else follows that
// suite's convention: the reads are stubbed to their wiring, the stores are real.
//
// Local days are built from local components (B-514), so the non-UTC CI job decides how
// far the local day sits from the UTC one; the UTC case is asserted with UTC literals.

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => mockParams,
    // Deps `[cb]`, the real implementation's shape (see history.test.tsx).
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
jest.mock('../../lib/haptics', () => ({ destructiveConfirm: jest.fn(), pullThreshold: jest.fn() }));
jest.mock('../../lib/sync', () => ({
  syncPendingEvents: jest.fn(() => Promise.resolve()),
  syncNow: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../lib/feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn(() => Promise.resolve([])),
  getBoundaryMarkers: jest.fn(() => Promise.resolve([])),
}));
// The screen's Remove confirm reaches lib/supabase (an import-time env guard) through
// lib/completionCard → lib/weight (CUL-1125); nothing here removes anything.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/db', () => ({
  getTimeline: jest.fn(),
  getEventAttachment: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../lib/undoLog', () => ({
  reverseLoggedEvent: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../lib/vetVisits', () => ({
  ...jest.requireActual('../../lib/vetVisits'),
  readVisitsForHistory: jest.fn(async () => []),
}));
jest.mock('../../store/syncStore', () => ({
  useSyncStore: (selector: (s: { hydrationTick: number }) => unknown) =>
    selector({ hydrationTick: 0 }),
}));
// The date control renders its day label, the pill the owner reads on landing.
jest.mock('../../components/history/DateScopeControl', () => {
  const { Text } = require('react-native');
  return {
    DateScopeControl: ({ dayLabel }: { dayLabel: string | null }) => (
      <Text testID="day-pill">{dayLabel ?? 'no day'}</Text>
    ),
  };
});
jest.mock('../../components/history/TypeScopeControl', () => ({ TypeScopeControl: () => null }));
// The bowl strip renders its arrangements' ids, so a test can see WHOSE bowl is up (CUL-1120).
jest.mock('../../components/history/FreeFeedingStrip', () => {
  const { Text } = require('react-native');
  return {
    FreeFeedingStrip: ({ arrangements }: { arrangements: { id: string }[] }) =>
      arrangements.map((a) => <Text key={a.id}>{`bowl ${a.id}`}</Text>),
  };
});
jest.mock('../../components/history/BoundaryMarkerRow', () => ({ BoundaryMarkerRow: () => null }));
// The label, and the Remove affordance so a failed Remove's rollback is reachable (CUL-1120).
jest.mock('../../components/history/EventRow', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    EventRow: ({ event, onDelete }: { event: { id: string }; onDelete: () => void }) => (
      <View>
        <Text>{`event ${event.id}`}</Text>
        <TouchableOpacity testID={`delete-${event.id}`} onPress={onDelete}>
          <Text>Remove</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});

import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import HistoryScreen from './history';
import { getTimeline } from '../../lib/db';
import { getActiveArrangementsForPet } from '../../lib/feedingArrangements';
import { readVisitsForHistory } from '../../lib/vetVisits';
import { reverseLoggedEvent } from '../../lib/undoLog';
import { usePetStore, type Pet } from '../../store/petStore';
import { useEventStore, type NyxEvent } from '../../store/eventStore';
import { useSnackbarStore } from '../../store/snackbarStore';
import { PREFILTER_SLACK_MS } from '../../lib/historyDateFilter';
import { __resetWidgetPetTapsForTest } from '../../lib/widgetPetTap';

const mockGetTimeline = getTimeline as jest.Mock;
const mockArrangements = getActiveArrangementsForPet as jest.Mock;
const mockReadVisits = readVisitsForHistory as jest.Mock;
const mockReverse = reverseLoggedEvent as jest.Mock;

function makePet(id: string, name: string): Pet {
  return {
    id, name, species: 'dog', breed: null, date_of_birth: null,
    date_of_birth_precision: 'exact', sex: 'unknown', weight_kg: null, photo_path: null,
  };
}
const rex = makePet('p1', 'Rex');
const mochi = makePet('p2', 'Mochi');

const DAY = '2026-09-16';
/** Local midnight of DAY + n days (B-514: from components). */
const localMidnight = (n = 0) => new Date(2026, 8, 16 + n);
const shifted = (d: Date, ms: number) => new Date(d.getTime() + ms).toISOString();
/** The instant as a hydrated row spells it (PostgREST's `+00:00`, no millis). */
const hydrated = (d: Date) => d.toISOString().replace(/\.000Z$/, '+00:00');

function row(id: string, occurredAt: string, petId = 'p2') {
  return {
    id, pet_id: petId, event_type: 'meal', occurred_at: occurredAt, severity: null, notes: null,
    source: 'manual', deleted_at: null, created_at: occurredAt, updated_at: occurredAt,
  };
}

/** The bounds the LAST read asked the SQL for: [after, before]. */
const lastBounds = () => {
  const call = mockGetTimeline.mock.calls.at(-1)!;
  return { petId: call[0] as string, after: call[4] as string | null, before: call[5] as string | null };
};

const active = () => usePetStore.getState().activePet?.id ?? null;

beforeEach(() => {
  __resetWidgetPetTapsForTest();
  jest.clearAllMocks();
  mockParams = {};
  mockGetTimeline.mockResolvedValue([]);
  // Reset, not just cleared: a test below holds these reads open or fails them per pet,
  // and `clearAllMocks` keeps an implementation.
  mockArrangements.mockResolvedValue([]);
  mockReadVisits.mockResolvedValue([]);
  mockReverse.mockResolvedValue(undefined);
  usePetStore.setState({ pets: [rex, mochi], activePet: rex });
  useEventStore.setState({ todayEvents: [] });
});

describe('History — a day link is read by sender (CUL-1073, H-7)', () => {
  it('the month\'s door (?day=) reads the LOCAL day, and places the synced edges by their instant', async () => {
    usePetStore.setState({ activePet: mochi });
    mockParams = { day: DAY, ts: '1' };
    mockGetTimeline.mockResolvedValue([
      // Newest first, as the query returns them: slack past each edge rides in and is dropped.
      row('next-midnight-synced', hydrated(localMidnight(1))),
      row('last-minute', shifted(localMidnight(1), -60_000)),
      row('noon', new Date(2026, 8, 16, 12).toISOString()),
      row('midnight-synced', hydrated(localMidnight(0))),
      row('second-before', shifted(localMidnight(0), -1000)),
    ]);

    const { findByText, queryByText, getByTestId } = render(<HistoryScreen />);
    await findByText('event noon');

    // The SQL got the local day, a prefilter minute wider each side (C-40).
    expect(lastBounds()).toEqual({
      petId: 'p2',
      after: shifted(localMidnight(0), -PREFILTER_SLACK_MS),
      before: shifted(localMidnight(1), PREFILTER_SLACK_MS),
    });
    expect(queryByText('event midnight-synced')).toBeTruthy(); // a text bound drops it
    expect(queryByText('event last-minute')).toBeTruthy();
    expect(queryByText('event next-midnight-synced')).toBeNull(); // a text bound keeps it
    expect(queryByText('event second-before')).toBeNull();
    // The pill names the day the door named.
    expect(getByTestId('day-pill').props.children).toBe('Sep 16');
  });

  it('the widget\'s ?date= (src=widget) is the LOCAL day too — the frozen sender always meant one', async () => {
    // The widget's pet is already the active one: this case is about the day. Arriving on
    // ANOTHER pet is the CUL-1120 describe at the foot of this file.
    usePetStore.setState({ activePet: mochi });
    mockParams = { date: DAY, ts: '1', pet: 'p2', src: 'widget' };
    render(<HistoryScreen />);
    await waitFor(() => expect(mockGetTimeline).toHaveBeenCalled());
    expect(lastBounds()).toMatchObject({
      petId: 'p2',
      after: shifted(localMidnight(0), -PREFILTER_SLACK_MS),
      before: shifted(localMidnight(1), PREFILTER_SLACK_MS),
    });
  });

  it('a bare ?date= (the flag-off calendar) keeps its UTC day until D2-8', async () => {
    mockParams = { date: DAY, ts: '1' };
    render(<HistoryScreen />);
    await waitFor(() => expect(mockGetTimeline).toHaveBeenCalled());
    expect(lastBounds()).toMatchObject({
      after: '2026-09-15T23:59:00.000Z',
      before: '2026-09-17T00:01:00.000Z',
    });
  });

  it('a door tapped while the tab is already mounted lands on its day (a new ts, not a remount)', async () => {
    const { rerender, getByTestId } = render(<HistoryScreen />);
    await waitFor(() => expect(mockGetTimeline).toHaveBeenCalled());
    expect(lastBounds()).toMatchObject({ after: null, before: null });

    mockParams = { day: DAY, ts: '2' };
    rerender(<HistoryScreen />);
    await waitFor(() => expect(lastBounds().after).toBe(shifted(localMidnight(0), -PREFILTER_SLACK_MS)));
    expect(getByTestId('day-pill').props.children).toBe('Sep 16');
  });

  it('a freshly logged event joins the day by its instant, never by its spelling (the live insert, C-40)', async () => {
    usePetStore.setState({ activePet: mochi });
    mockParams = { day: DAY, ts: '1' };
    mockGetTimeline.mockResolvedValue([row('noon', new Date(2026, 8, 16, 12).toISOString())]);
    const { findByText, queryByText } = render(<HistoryScreen />);
    await findByText('event noon');

    // A synced row at the NEXT local midnight: text says it is before the day's end.
    const outside = row('next-midnight', hydrated(localMidnight(1))) as unknown as NyxEvent;
    act(() => useEventStore.setState({ todayEvents: [outside] }));
    expect(queryByText('event next-midnight')).toBeNull();

    // One at this day's local midnight: text says it is before the day's start.
    const inside = row('midnight', hydrated(localMidnight(0))) as unknown as NyxEvent;
    act(() => useEventStore.setState({ todayEvents: [inside, outside] }));
    await findByText('event midnight');
  });
});

describe('History — paging counts the query, not the list (CUL-1073)', () => {
  it('a full page with an edge row dropped still offers more, and the next page starts after it', async () => {
    usePetStore.setState({ activePet: mochi });
    mockParams = { day: DAY, ts: '1' };
    mockGetTimeline.mockImplementation(async (_pet: string, limit: number, offset: number) =>
      offset === 0
        ? [
            // Inside the prefilter's minute past the day's end: fetched, then dropped.
            row('slack', shifted(localMidnight(1), 30_000)),
            ...Array.from({ length: limit - 1 }, (_, i) =>
              row(`e${i}`, shifted(localMidnight(1), -(i + 1) * 60_000))),
          ]
        : []);
    const view = render(<HistoryScreen />);
    await view.findByText('event e0');
    expect(view.queryByText('event slack')).toBeNull();

    // One row short of a page on screen, from a FULL page of the query: there may be more,
    // and the next read starts where the query left off. Counting the list instead would
    // hide "Load more" and silently end the day at the dropped row.
    await act(async () => { fireEvent.press(view.getByText('Load more')); });
    const limit = mockGetTimeline.mock.calls[0][1] as number;
    expect(mockGetTimeline.mock.calls.at(-1)?.[2]).toBe(limit);
  });
});

describe('History — the widget\'s pet applies once per tap (CUL-1119)', () => {
  it('opens on the widget\'s pet; a later switch in the app sticks; a new tap applies again', async () => {
    mockParams = { date: DAY, ts: 'T1', pet: 'p2', src: 'widget' };
    const { rerender } = render(<HistoryScreen />);
    await waitFor(() => expect(active()).toBe('p2'));

    // The owner switches with the FAB's chip. The tab stays mounted, params and all.
    await act(async () => {});
    const readsBefore = mockGetTimeline.mock.calls.length;
    act(() => usePetStore.getState().selectPet('p1'));
    rerender(<HistoryScreen />);
    await act(async () => {});
    expect(active()).toBe('p1');
    // And the list re-reads for the owner's pet, not the widget's.
    await waitFor(() => expect(mockGetTimeline.mock.calls.length).toBeGreaterThan(readsBefore));
    expect(lastBounds().petId).toBe('p1');

    // A new tap on the widget is a new nonce: its pet applies again.
    mockParams = { ...mockParams, ts: 'T2' };
    rerender(<HistoryScreen />);
    await waitFor(() => expect(active()).toBe('p2'));
  });
});

// ── A read answers only for the pet on screen (CUL-1120) ────────────────────────────
//
// Every read on this screen is async, and the pet it was asked for can change while it
// is out: a switch in the FAB's chip, or the widget's pet arriving a render after the
// first read started (the Bundle A evidence). Three failures of the CUL-574 class:
//   • the new pet's read DROPPED because the old one was still in flight, so the old
//     rows land under the new pet's name and stay there;
//   • an old read answering LAST over the new pet's rows;
//   • the new pet's read FAILING with the old pet's rows still up: a list that is not
//     empty never shows the error state, so nothing said anything was wrong.

describe('History — a read answers only for the pet on screen (CUL-1120)', () => {
  type Held = {
    petId: string;
    after: string | null;
    resolve: (rows: unknown[]) => void;
    reject: (e: Error) => void;
  };
  /** Every list read waits for the test to answer it; `held` is in the order asked. */
  function holdReads(): Held[] {
    const held: Held[] = [];
    mockGetTimeline.mockImplementation(
      (petId: string, _limit: number, _offset: number, _type: unknown, after: string | null) =>
        new Promise((resolve, reject) => { held.push({ petId, after, resolve, reject }); }),
    );
    return held;
  }
  const readsFor = (held: Held[], petId: string) => held.filter((r) => r.petId === petId);
  async function answer(reads: Held[], rows: unknown[]) {
    await act(async () => { reads.forEach((r) => r.resolve(rows)); });
  }

  const rexMeal = () => row('rex-meal', new Date(2026, 8, 16, 8).toISOString(), 'p1');
  const mochiMeal = () => row('mochi-meal', new Date(2026, 8, 16, 9).toISOString(), 'p2');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a switch while the old pet\'s read is out still reads the new pet, and the old answer landing last is dropped', async () => {
    const held = holdReads();
    const view = render(<HistoryScreen />);
    await waitFor(() => expect(readsFor(held, 'p1').length).toBeGreaterThan(0));

    act(() => usePetStore.getState().selectPet('p2'));
    // Rex's read is still out. Before the fix, Mochi's was never asked at all.
    await waitFor(() => expect(readsFor(held, 'p2').length).toBeGreaterThan(0));

    await answer(readsFor(held, 'p2'), [mochiMeal()]);
    await view.findByText('event mochi-meal');

    // The OLDER read answers last, with the other pet's rows.
    await answer(readsFor(held, 'p1'), [rexMeal()]);
    expect(view.queryByText('event rex-meal')).toBeNull();
    expect(view.getByText('event mochi-meal')).toBeTruthy();
  });

  it('the widget arriving on another pet lists THAT pet\'s rows (the Bundle A case)', async () => {
    const held = holdReads();
    mockParams = { date: DAY, ts: 'T1', pet: 'p2', src: 'widget' };
    const view = render(<HistoryScreen />);
    await waitFor(() => expect(active()).toBe('p2'));
    await waitFor(() => expect(readsFor(held, 'p2').length).toBeGreaterThan(0));
    // The race this case is about: a read went out for the pet the screen mounted on,
    // before the link selected the widget's pet in the same flush.
    expect(readsFor(held, 'p1').length).toBeGreaterThan(0);

    const noon = new Date(2026, 8, 16, 12).toISOString();
    await answer(readsFor(held, 'p2'), [row('mochi-noon', noon, 'p2')]);
    await answer(readsFor(held, 'p1'), [row('rex-noon', noon, 'p1')]);

    expect(view.getByText('event mochi-noon')).toBeTruthy();
    expect(view.queryByText('event rex-noon')).toBeNull();
  });

  it('when the new pet\'s read fails, the error names the new pet and the old rows are gone', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetTimeline.mockImplementation(async (petId: string) => {
      if (petId === 'p1') return [rexMeal()];
      throw new Error('disk gone');
    });
    const view = render(<HistoryScreen />);
    await view.findByText('event rex-meal');

    act(() => usePetStore.getState().selectPet('p2'));

    await view.findByText("Couldn't load history");
    expect(view.getByText("Something went wrong loading Mochi's history.")).toBeTruthy();
    expect(view.queryByText('event rex-meal')).toBeNull();
  });

  it('a switch draws the skeleton until the new pet answers: never the old rows, never the empty state', async () => {
    mockGetTimeline.mockImplementation((petId: string) =>
      petId === 'p1' ? Promise.resolve([rexMeal()]) : new Promise(() => {}));
    const view = render(<HistoryScreen />);
    await view.findByText('event rex-meal');

    act(() => usePetStore.getState().selectPet('p2'));
    // Let every read that CAN answer do so (the visits, the bowl); the list's never does.
    await act(async () => {});

    expect(view.queryByText('event rex-meal')).toBeNull();
    expect(view.queryByTestId('history-skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByText('Nothing logged yet')).toBeNull();
  });

  it('a door tapped while a read is out lands on its day: the newer read wins, the older is dropped', async () => {
    const held = holdReads();
    const view = render(<HistoryScreen />);
    await waitFor(() => expect(held.length).toBeGreaterThan(0));
    const unscoped = [...held];

    mockParams = { day: DAY, ts: '2' };
    view.rerender(<HistoryScreen />);
    // Same pet, so no pet check can see this one: before the fix the door's read was
    // dropped because the first was still out, and the list sat under the day's pill.
    const dayAfter = shifted(localMidnight(0), -PREFILTER_SLACK_MS);
    await waitFor(() => expect(held.some((r) => r.after === dayAfter)).toBe(true));

    await answer(held.filter((r) => r.after === dayAfter), [
      row('noon', new Date(2026, 8, 16, 12).toISOString(), 'p1'),
    ]);
    await view.findByText('event noon');
    // The unscoped read answers last, with a row from another week.
    await answer(unscoped, [row('last-week', new Date(2026, 8, 9, 12).toISOString(), 'p1')]);

    expect(view.queryByText('event last-week')).toBeNull();
    expect(view.getByText('event noon')).toBeTruthy();
    expect(view.getByTestId('day-pill').props.children).toBe('Sep 16');
  });

  it('the bowl strip shows only the pet on screen\'s bowl, whatever order its reads answer in', async () => {
    const bowls: { petId: string; resolve: (a: unknown[]) => void }[] = [];
    mockArrangements.mockImplementation((petId: string) =>
      new Promise((resolve) => { bowls.push({ petId, resolve }); }));
    const bowl = (id: string) => ({
      id, food_item_id: 'f1', active_from: null, updated_at: '2026-09-01T00:00:00Z',
      brand: 'Royal Canin', product_name: 'Selected Protein PR', format: 'dry_kibble',
    });
    const view = render(<HistoryScreen />);
    await waitFor(() => expect(bowls.some((b) => b.petId === 'p1')).toBe(true));

    act(() => usePetStore.getState().selectPet('p2'));
    await waitFor(() => expect(bowls.some((b) => b.petId === 'p2')).toBe(true));

    await act(async () => {
      bowls.filter((b) => b.petId === 'p2').forEach((b) => b.resolve([bowl('mochi-bowl')]));
    });
    await view.findByText('bowl mochi-bowl');
    await act(async () => {
      bowls.filter((b) => b.petId === 'p1').forEach((b) => b.resolve([bowl('rex-bowl')]));
    });

    expect(view.queryByText('bowl rex-bowl')).toBeNull();
    expect(view.getByText('bowl mochi-bowl')).toBeTruthy();
  });

  it('a switch takes the old pet\'s bowl down at once, before the new pet\'s read answers', async () => {
    mockArrangements.mockImplementation((petId: string) =>
      petId === 'p1'
        ? Promise.resolve([{
          id: 'rex-bowl', food_item_id: 'f1', active_from: null, updated_at: '2026-09-01T00:00:00Z',
          brand: 'Royal Canin', product_name: 'Selected Protein PR', format: 'dry_kibble',
        }])
        : new Promise(() => {}));
    const view = render(<HistoryScreen />);
    await view.findByText('bowl rex-bowl');

    act(() => usePetStore.getState().selectPet('p2'));
    await act(async () => {});

    expect(view.queryByText('bowl rex-bowl')).toBeNull();
  });

  it('a Today row for another pet never enters the list (the live insert)', async () => {
    mockGetTimeline.mockImplementation(async (petId: string) =>
      petId === 'p2' ? [mochiMeal()] : [rexMeal()]);
    usePetStore.setState({ activePet: mochi });
    const view = render(<HistoryScreen />);
    await view.findByText('event mochi-meal');

    // Today's list still holding the previous pet's rows: `loadTodayEvents` answering
    // late for Rex after the switch to Mochi.
    const rexToday = row('rex-today', new Date().toISOString(), 'p1') as unknown as NyxEvent;
    act(() => useEventStore.setState({ todayEvents: [rexToday] }));

    expect(view.queryByText('event rex-today')).toBeNull();
    expect(view.getByText('event mochi-meal')).toBeTruthy();
  });

  it('a vet visit read that fails after a switch does not leave the old pet\'s visit up', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const [y, m, d] = [2026, 9, 10];
    mockReadVisits.mockImplementation(async (petId: string) => {
      if (petId !== 'p1') throw new Error('disk gone');
      return [{
        id: 'rex-visit', petId: 'p1', visitedAt: '2026-09-10', sortMs: new Date(y, m - 1, d).getTime(),
        reason: 'GI follow-up', where: 'Riverside Animal Hospital',
      }];
    });
    const view = render(<HistoryScreen />);
    await view.findByText('Vet visit');

    act(() => usePetStore.getState().selectPet('p2'));

    await view.findByText("Couldn't load history");
    expect(view.queryByText('Vet visit')).toBeNull();
  });

  it('a Remove that fails after a switch does not put the old pet\'s row into the new pet\'s list', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockGetTimeline.mockImplementation(async (petId: string) =>
      petId === 'p1' ? [rexMeal()] : [mochiMeal()]);
    let failReverse!: (e: Error) => void;
    mockReverse.mockImplementationOnce(
      () => new Promise((_resolve, reject) => { failReverse = reject; }));
    const view = render(<HistoryScreen />);
    await view.findByText('event rex-meal');

    fireEvent.press(view.getByTestId('delete-rex-meal'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1) ?? [];
    const remove = (buttons as { text: string; onPress: () => Promise<void> }[])
      .find((b) => b.text === 'Remove')!;
    let removal!: Promise<void>;
    act(() => { removal = remove.onPress(); });

    // The write is still out when the owner switches, and Mochi's rows land.
    act(() => usePetStore.getState().selectPet('p2'));
    await view.findByText('event mochi-meal');

    jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => { failReverse(new Error('write failed')); await removal; });

    expect(view.queryByText('event rex-meal')).toBeNull();
    expect(view.getByText('event mochi-meal')).toBeTruthy();
  });

  it('a failed Load more\'s Try again does nothing once a newer read has replaced the list', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const show = jest.spyOn(useSnackbarStore.getState(), 'show').mockImplementation(() => {});
    mockGetTimeline.mockImplementation(async (petId: string, limit: number, offset: number) => {
      if (petId === 'p2') return [mochiMeal()];
      if (offset > 0) throw new Error('disk gone');
      return Array.from({ length: limit }, (_, i) =>
        row(`rex${i}`, new Date(2026, 8, 16, 8, 59 - (i % 60), 0, i).toISOString(), 'p1'));
    });
    const view = render(<HistoryScreen />);
    await view.findByText('event rex0');

    await act(async () => { fireEvent.press(view.getByText('Load more')); });
    await waitFor(() => expect(show).toHaveBeenCalled());
    const retry = show.mock.calls.at(-1)?.[0].onAction;
    expect(retry).toBeDefined();

    act(() => usePetStore.getState().selectPet('p2'));
    await view.findByText('event mochi-meal');

    // The retry was for Rex's list at Rex's offset. Run now, it would page Mochi's list
    // from a place in Rex's.
    const reads = mockGetTimeline.mock.calls.length;
    await act(async () => { retry?.(); });
    expect(mockGetTimeline.mock.calls.length).toBe(reads);
  });
});
