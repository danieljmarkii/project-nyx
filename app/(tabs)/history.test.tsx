// History screen state wiring (CUL-575). The defect this pins: the tab had ONE
// "nothing on screen" state — the empty list — so a read that FAILED and a read that
// hadn't finished both rendered "Nothing logged yet", i.e. the app asserting an empty
// record over a read it never completed. The day-summary screen refuses to do exactly
// this; these tests hold History to the same line, and cover the delete-failure
// rollback that used to happen in silence.
//
// Mocks follow the app-screen convention (see app/day-summary.test.tsx): the row
// components and scope controls are stubbed to their wiring, the DB/sync/haptics
// modules are stubbed off, and the stores under test are real.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), []);
    },
  };
});
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
jest.mock('../../hooks/useWidgetPetLink', () => ({ useWidgetPetLink: () => {} }));
jest.mock('../../lib/haptics', () => ({ destructiveConfirm: jest.fn(), pullThreshold: jest.fn() }));
jest.mock('../../lib/sync', () => ({
  syncPendingEvents: jest.fn(() => Promise.resolve()),
  syncNow: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../lib/feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn(() => Promise.resolve([])),
  getBoundaryMarkers: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../lib/db', () => ({
  getTimeline: jest.fn(),
}));
// Mocked for the same reason store/momentStore.test.ts mocks it: lib/undoLog pulls in
// lib/sync and (since CUL-641) lib/weight, both of which reach lib/supabase, whose
// import-time env guard throws under jest. lib/undoLog.test.ts owns what the reversal
// actually writes; this suite owns the screen's half — that Remove routes through the
// shared reversal at all, and what it does when that write fails.
jest.mock('../../lib/undoLog', () => ({
  reverseLoggedEvent: jest.fn(() => Promise.resolve()),
}));
// One STABLE object, not a fresh literal per render: the screen's loaders are
// useCallback'd on `activePet`, so a new identity each render re-fires the
// hydration effect forever (the real zustand store hands back a stable reference).
jest.mock('../../store/petStore', () => {
  const activePet = { id: 'p1', name: 'Rex', species: 'dog' };
  const state = { activePet };
  return {
    usePetStore: Object.assign(() => state, { getState: () => mockPetState }),
  };
});
// Mutable so a test can simulate the owner switching pets mid-write.
let mockPetState: { activePet: { id: string } | null } = { activePet: { id: 'p1' } };
jest.mock('../../store/syncStore', () => ({
  useSyncStore: (selector: (s: { hydrationTick: number }) => unknown) =>
    selector({ hydrationTick: 0 }),
}));
// The scope controls own their own sheets; this file is about what the list renders.
jest.mock('../../components/history/DateScopeControl', () => ({ DateScopeControl: () => null }));
jest.mock('../../components/history/TypeScopeControl', () => ({ TypeScopeControl: () => null }));
jest.mock('../../components/history/FreeFeedingStrip', () => ({ FreeFeedingStrip: () => null }));
jest.mock('../../components/history/BoundaryMarkerRow', () => ({ BoundaryMarkerRow: () => null }));
// EventRow stubbed to its wiring: the label (so a row is identifiable) and the
// delete affordance (so the failure path is reachable).
jest.mock('../../components/history/EventRow', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    EventRow: ({ event, onDelete }: { event: { id: string }; onDelete: () => void }) => (
      <View testID={`row-${event.id}`}>
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
import { reverseLoggedEvent } from '../../lib/undoLog';
import { useEventStore, NyxEvent } from '../../store/eventStore';
import { useSnackbarStore } from '../../store/snackbarStore';

const mockGetTimeline = getTimeline as jest.Mock;
// CUL-641 — Remove is no longer a bare softDeleteEvent; it is the SAME reversal the
// completion card's Undo performs, so a side-effect added to one is inherited by both.
const mockReverse = reverseLoggedEvent as jest.Mock;

function row(id: string, occurredAt = '2026-08-24T09:00:00Z') {
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

let showSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockPetState = { activePet: { id: 'p1' } };
  useEventStore.setState({ todayEvents: [] });
  showSpy = jest.spyOn(useSnackbarStore.getState(), 'show').mockImplementation(() => {});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Fire the destructive button of the last Alert.alert confirm. */
async function confirmRemove() {
  const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1) ?? [];
  const remove = (buttons as { text: string; onPress?: () => void }[]).find(
    (b) => b.text === 'Remove',
  );
  await act(async () => { await remove?.onPress?.(); });
}

describe('History — the read states', () => {
  it('shows skeleton rows while the first read is in flight, never the empty state', async () => {
    // A read that hasn't answered yet.
    mockGetTimeline.mockReturnValue(new Promise(() => {}));
    const { queryByText, queryByTestId } = render(<HistoryScreen />);

    // Hidden from assistive tech by design, so the query has to opt in.
    expect(queryByTestId('history-skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(queryByText('Nothing logged yet')).toBeNull();
  });

  it('renders an error state with a retry when the read fails — NOT "Nothing logged yet"', async () => {
    mockGetTimeline.mockRejectedValue(new Error('disk gone'));
    const { getByText, queryByText } = render(<HistoryScreen />);

    await waitFor(() => expect(getByText("Couldn't load history")).toBeTruthy());
    // The whole point: the app never claims the record is empty over a failed read.
    expect(queryByText('Nothing logged yet')).toBeNull();
    expect(getByText('Try again')).toBeTruthy();
    // ...and the error names the pet, not the exception (no provider string on screen).
    expect(getByText("Something went wrong loading Rex's history.")).toBeTruthy();
    expect(queryByText(/disk gone/)).toBeNull();
  });

  it('retry re-reads, and a read that succeeds takes the error state down', async () => {
    mockGetTimeline.mockRejectedValueOnce(new Error('transient'));
    const { getByText, queryByText } = render(<HistoryScreen />);
    await waitFor(() => expect(getByText("Couldn't load history")).toBeTruthy());

    mockGetTimeline.mockResolvedValueOnce([row('e1')]);
    await act(async () => { fireEvent.press(getByText('Try again')); });

    await waitFor(() => expect(getByText('event e1')).toBeTruthy());
    expect(queryByText("Couldn't load history")).toBeNull();
  });

  it('still renders the designed empty state when the read succeeds with no rows', async () => {
    mockGetTimeline.mockResolvedValue([]);
    const { getByText, queryByText, queryByTestId } = render(<HistoryScreen />);

    await waitFor(() => expect(getByText('Nothing logged yet')).toBeTruthy());
    expect(queryByText("Couldn't load history")).toBeNull();
    expect(queryByTestId('history-skeleton', { includeHiddenElements: true })).toBeNull();
  });
});

describe('History — a delete that fails', () => {
  const e1 = row('e1');

  async function renderWithOneRow() {
    mockGetTimeline.mockResolvedValue([e1]);
    const view = render(<HistoryScreen />);
    await waitFor(() => expect(view.getByText('event e1')).toBeTruthy());
    return view;
  }

  it('says so, instead of the row silently reappearing', async () => {
    const view = await renderWithOneRow();
    mockReverse.mockRejectedValueOnce(new Error('write failed'));

    fireEvent.press(view.getByTestId('delete-e1'));
    await confirmRemove();

    await waitFor(() => expect(view.getByText('event e1')).toBeTruthy());
    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Couldn't remove that log. It's still in history." }),
    );
    // Never the raw write error (the owner-facing copy guard's B-399 rule).
    expect(showSpy.mock.calls[0][0].message).not.toMatch(/write failed/);
  });

  it('puts the event back in Today too, so Home stops hiding it', async () => {
    useEventStore.setState({ todayEvents: [e1 as unknown as NyxEvent] });
    const view = await renderWithOneRow();
    mockReverse.mockRejectedValueOnce(new Error('write failed'));

    fireEvent.press(view.getByTestId('delete-e1'));
    await confirmRemove();

    await waitFor(() =>
      expect(useEventStore.getState().todayEvents.map((e) => e.id)).toEqual(['e1']),
    );
  });

  it('leaves Today alone when the deleted event was not in it', async () => {
    const view = await renderWithOneRow();
    mockReverse.mockRejectedValueOnce(new Error('write failed'));

    fireEvent.press(view.getByTestId('delete-e1'));
    await confirmRemove();

    // An older event restored into Today would read as a feeding that happened today.
    await waitFor(() => expect(view.getByText('event e1')).toBeTruthy());
    expect(useEventStore.getState().todayEvents).toEqual([]);
  });

  // Today is ONE global list scoped to whoever was active when it loaded, so a
  // rollback that lands after a pet switch would put Rex's meal on the other pet's
  // Home — the wrong-pet class, arriving silently.
  it('does not restore into another pet\'s Today after a pet switch', async () => {
    useEventStore.setState({ todayEvents: [e1 as unknown as NyxEvent] });
    const view = await renderWithOneRow();
    mockReverse.mockImplementationOnce(async () => {
      mockPetState = { activePet: { id: 'p2' } };
      throw new Error('write failed');
    });

    fireEvent.press(view.getByTestId('delete-e1'));
    await confirmRemove();

    // The row still comes back in History (that list is the deleting pet's own view).
    await waitFor(() => expect(view.getByText('event e1')).toBeTruthy());
    expect(useEventStore.getState().todayEvents).toEqual([]);
  });

  it('says nothing when the delete succeeds', async () => {
    const view = await renderWithOneRow();
    mockReverse.mockResolvedValueOnce(undefined);

    fireEvent.press(view.getByTestId('delete-e1'));
    await confirmRemove();

    await waitFor(() => expect(view.queryByText('event e1')).toBeNull());
    expect(showSpy).not.toHaveBeenCalled();
  });

  it('goes through the SHARED reversal, not a delete path of its own (CUL-641)', async () => {
    // The whole defect was that Remove and the completion card's Undo were separate
    // delete paths, so a side-effect added to the write path (re-pointing
    // pets.weight_kg) reached neither and nobody could see it from inside either one.
    // Asserting the call by name is what keeps this path from quietly growing its own
    // semantics again; `guards/reversePath.test.ts` is the build-level half.
    //
    // No restore value from here, and that is deliberate: this screen removes an
    // arbitrary historical row and cannot know what snapshot it displaced. Omission is
    // what tells the reconcile to leave an owner's profile weight alone rather than
    // null it (lib/weight.ts, delete side).
    const view = await renderWithOneRow();

    fireEvent.press(view.getByTestId('delete-e1'));
    await confirmRemove();

    await waitFor(() => expect(mockReverse).toHaveBeenCalledWith('e1'));
  });
});
