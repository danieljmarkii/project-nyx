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
// Mutable so the type-lens test can arrive through the same doorway Ask uses
// (?type=&window=&ts=) rather than reaching into the screen's state.
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => mockParams,
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
// CUL-904 VV-6 — the vet-visit timeline row, behind the `vet_visits` rollout flag.
// Mutable so one suite can drive both sides of the gate.
let mockVetVisitsFlag = false;
jest.mock('../../hooks/useAppConfig', () => ({
  useAllowlistFlag: () => mockVetVisitsFlag,
}));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => mockVetVisitsFlag }));
// The READ is stubbed; every pure rule in the module is the real one
// (`jest.requireActual`), because the rule is not what needs standing in — C-34,
// where a mock that replaced a pure predicate hid the defect it was covering for.
// `readVisitsForHistory` itself is driven against a stubbed DB in
// lib/vetVisitsHome.test.ts; this suite owns the screen's half.
jest.mock('../../lib/vetVisits', () => ({
  ...jest.requireActual('../../lib/vetVisits'),
  readVisitsForHistory: jest.fn(async () => []),
}));
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
import { router } from 'expo-router';
import { getTimeline } from '../../lib/db';
import { readVisitsForHistory } from '../../lib/vetVisits';
import { reverseLoggedEvent } from '../../lib/undoLog';
import { useEventStore, NyxEvent } from '../../store/eventStore';
import { useSnackbarStore } from '../../store/snackbarStore';

const mockGetTimeline = getTimeline as jest.Mock;
const mockReadVisits = readVisitsForHistory as jest.Mock;
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
  mockParams = {};
  mockVetVisitsFlag = false;
  mockReadVisits.mockResolvedValue([]);
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

// ── The vet visit row (CUL-904 VV-6; spec §4.1 History + §7 AC 10) ──────────────
//
// The gate's other half. `guards/vetVisitsFlagOff.test.tsx` compares whole trees
// but renders them SYNCHRONOUSLY, so it cannot see a row whose render waits on an
// async read — measured in VV-6 by deleting the gate below and watching that suite
// stay green. This is where the row's flag is actually falsifiable, because the
// data is controllable here and the effects are flushed.

/** Local midnight of a 'YYYY-MM-DD', the shape readVisitsForHistory returns. */
function visitRow(id: string, visitedAt: string, over: Record<string, unknown> = {}) {
  const [y, m, d] = visitedAt.split('-').map(Number);
  return {
    id,
    petId: 'p1',
    visitedAt,
    sortMs: new Date(y, m - 1, d).getTime(),
    reason: 'GI follow-up',
    where: 'Riverside Animal Hospital · Dr. Chen',
    ...over,
  };
}

describe('History — the vet visit row', () => {
  it('renders a visit in the stream, with the record it names', async () => {
    mockVetVisitsFlag = true;
    mockGetTimeline.mockResolvedValue([]);
    mockReadVisits.mockResolvedValue([visitRow('v1', '2026-07-30')]);

    const { getByText } = render(<HistoryScreen />);

    await waitFor(() => expect(getByText('Vet visit')).toBeTruthy());
    expect(getByText('GI follow-up')).toBeTruthy();
    expect(getByText('Riverside Animal Hospital · Dr. Chen')).toBeTruthy();
  });

  it('opens the VISIT, not an event screen', async () => {
    mockVetVisitsFlag = true;
    mockGetTimeline.mockResolvedValue([]);
    mockReadVisits.mockResolvedValue([visitRow('v1', '2026-07-30')]);

    const { getByText } = render(<HistoryScreen />);
    await waitFor(() => expect(getByText('Vet visit')).toBeTruthy());
    fireEvent.press(getByText('Vet visit'));

    // Its Edit — and its Delete, once CUL-19 has deployed the reader that honours
    // `deleted_at` — live on the visit. A record's controls belong on the record,
    // which is why this row carries neither.
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/vet-visits/[id]',
      params: { id: 'v1' },
    });
  });

  it('flag-off: no row, and no read of the table at all', async () => {
    mockVetVisitsFlag = false;
    mockGetTimeline.mockResolvedValue([]);
    // The read would answer if it were called, so a missing row can only mean the
    // gate held — rather than the fixture simply being empty, which is the way
    // this test would otherwise pass over the defect.
    mockReadVisits.mockResolvedValue([visitRow('v1', '2026-07-30')]);

    const { queryByText, getByText } = render(<HistoryScreen />);

    await waitFor(() => expect(getByText('Nothing logged yet')).toBeTruthy());
    expect(queryByText('Vet visit')).toBeNull();
    // Dark means dark (G0): the flag gates the READ as well as the row, so a
    // non-allowlisted owner's device never queries the companion's tables.
    expect(mockReadVisits).not.toHaveBeenCalled();
  });

  it('a type lens is a lens over EVENTS, so the visit leaves with the markers', async () => {
    mockVetVisitsFlag = true;
    mockParams = { type: 'meal', window: '30d', ts: '1' };
    mockGetTimeline.mockResolvedValue([row('e1')]);
    mockReadVisits.mockResolvedValue([visitRow('v1', '2026-07-30')]);

    const { getByText, queryByText } = render(<HistoryScreen />);

    await waitFor(() => expect(getByText('event e1')).toBeTruthy());
    // A visit has no honest answer to "show me only vomit", the same reason a
    // free-feeding boundary does not appear under one. VV-6's on-the-fly decision:
    // the all-events lens only; its own lens chip was the alternative and is not v1.
    expect(queryByText('Vet visit')).toBeNull();
  });

  // The withholding rule (a row older than the oldest loaded event, while more
  // remain unpaginated) is NOT tested here. It was, and the test passed over its
  // own mutation: the row it withholds sorts to the bottom of the list, below a
  // FlatList's render window, so deleting the rule changed nothing this suite
  // could see. It moved to lib/historyTimeline.test.ts, over the data.

  it('is not an events row: the timeline query is untouched and it renders through its own component', async () => {
    mockVetVisitsFlag = true;
    mockGetTimeline.mockResolvedValue([row('e1')]);
    mockReadVisits.mockResolvedValue([visitRow('v1', '2026-07-30')]);

    const { getByText, queryByTestId } = render(<HistoryScreen />);
    await waitFor(() => expect(getByText('Vet visit')).toBeTruthy());

    // AC 10, the screen's half: a visit never becomes an `events` row. The
    // EventRow stub in this file renders `row-<id>`, so its absence for `v1` is
    // the mechanical form of "it did not go through the event path" — and
    // `getTimeline` is called only with an event type filter, never a visit one.
    expect(queryByTestId('row-v1')).toBeNull();
    expect(getByText('event e1')).toBeTruthy();
    for (const call of mockGetTimeline.mock.calls) {
      expect(call).not.toContain('vet_visit');
    }
  });

  it('the retry re-reads visits too, not just the timeline', async () => {
    mockVetVisitsFlag = true;
    mockGetTimeline.mockRejectedValueOnce(new Error('transient'));
    const { getByText } = render(<HistoryScreen />);
    await waitFor(() => expect(getByText("Couldn't load history")).toBeTruthy());

    const before = mockReadVisits.mock.calls.length;
    mockGetTimeline.mockResolvedValueOnce([]);
    mockReadVisits.mockResolvedValue([visitRow('v1', '2026-07-30')]);
    await act(async () => { fireEvent.press(getByText('Try again')); });

    // The visit read is wired into all four of the screen's refresh paths — focus,
    // the hydration tick, pull-to-refresh and this retry. A loader wired into fewer
    // of them than the timeline is how a stream comes back showing one half of a
    // sync; the retry is the one this suite can drive through a real control.
    expect(mockReadVisits.mock.calls.length).toBeGreaterThan(before);
    await waitFor(() => expect(getByText('Vet visit')).toBeTruthy());
  });
});
