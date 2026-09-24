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
jest.mock('../../components/history/FreeFeedingStrip', () => ({ FreeFeedingStrip: () => null }));
jest.mock('../../components/history/BoundaryMarkerRow', () => ({ BoundaryMarkerRow: () => null }));
jest.mock('../../components/history/EventRow', () => {
  const { Text } = require('react-native');
  return {
    EventRow: ({ event }: { event: { id: string } }) => <Text>{`event ${event.id}`}</Text>,
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import HistoryScreen from './history';
import { getTimeline } from '../../lib/db';
import { usePetStore, type Pet } from '../../store/petStore';
import { useEventStore, type NyxEvent } from '../../store/eventStore';
import { PREFILTER_SLACK_MS } from '../../lib/historyDateFilter';

const mockGetTimeline = getTimeline as jest.Mock;

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
  jest.clearAllMocks();
  mockParams = {};
  mockGetTimeline.mockResolvedValue([]);
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
    // The widget's pet is already the active one: this case is about the day. (Arriving on
    // ANOTHER pet races the read already in flight for the old one, and the new pet's read
    // is dropped — CUL-1120, Bundle C; the pet's own rule is the last describe below.)
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
