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
    // Deps `[cb]`, NOT `[]` — this mirrors the real implementation and the
    // difference is load-bearing. expo-router's `useFocusEffect` runs its outer
    // effect on `[effect, navigation, optionalNavigation]` and invokes the callback
    // IMMEDIATELY when `navigation.isFocused()`, so a change to the memoized
    // callback's identity re-runs the whole focus body without any navigation
    // happening. A `[]` mock cannot express that, which is why the first version of
    // this screen could put a config flag in the focus callback's deps and have
    // every test stay green over a full timeline reset.
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
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
// The Remove confirm's composer (lib/completionCard, CUL-1125) reaches lib/weight, which
// imports the Supabase client at module scope, and its env guard throws under jest.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/db', () => ({
  getTimeline: jest.fn(),
  // Remove asks the record for a photo before its confirm (CUL-1125). No photo unless
  // a test says so.
  getEventAttachment: jest.fn(() => Promise.resolve(null)),
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
    // `subscribe`, and `state` until `mockPetState` is assigned: History v2's scope store
    // reads and follows the pet store from import on (HV-3), before this file's body runs.
    usePetStore: Object.assign(() => state, { getState: () => mockPetState ?? state, subscribe: () => () => {} }),
  };
});
// Mutable so a test can simulate the owner switching pets mid-write.
let mockPetState: { activePet: { id: string } | null } = { activePet: { id: 'p1' } };
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
// EventRow stubbed to its wiring: the label (so a row is identifiable), the delete
// affordance (so the failure path is reachable), and a dose's course name (so the row
// mapper's line for it is checkable, CUL-1124).
jest.mock('../../components/history/EventRow', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    EventRow: ({ event, onDelete }: {
      event: { id: string; regimen_drug_name?: string | null };
      onDelete: () => void;
    }) => (
      <View testID={`row-${event.id}`}>
        <Text>{`event ${event.id}`}</Text>
        {event.regimen_drug_name ? <Text>{`course ${event.regimen_drug_name}`}</Text> : null}
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
import { getEventAttachment, getTimeline } from '../../lib/db';
import { readVisitsForHistory } from '../../lib/vetVisits';
import { reverseLoggedEvent } from '../../lib/undoLog';
import { useEventStore, NyxEvent } from '../../store/eventStore';
import { useSnackbarStore } from '../../store/snackbarStore';

const mockGetTimeline = getTimeline as jest.Mock;
const mockGetEventAttachment = getEventAttachment as jest.Mock;
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
  mockReadVisits.mockResolvedValue([]);
  mockGetEventAttachment.mockResolvedValue(null);
  mockPetState = { activePet: { id: 'p1' } };
  useEventStore.setState({ todayEvents: [] });
  showSpy = jest.spyOn(useSnackbarStore.getState(), 'show').mockImplementation(() => {});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Fire the destructive button of the last Alert.alert confirm. The confirm lands a
 *  tick after the press, once the record has been asked for a photo (CUL-1125). */
async function confirmRemove() {
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
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
    // Every OTHER read answers (the visits, the bowl), inside act: the list's read being
    // out is enough on its own to hold the skeleton up.
    await act(async () => {});

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

// ── What the Remove confirm names (CUL-1125) ─────────────────────────────────────
//
// History's Remove is the likeliest door to a weeks-old record, and it used to name a
// look's note and nothing else: a meal whose note the owner typed, or a photographed
// vomit, went with no word about either. It now says what the record screen and the
// completion card's Undo say, from the one composer they share. The photo needs a read
// (History's rows never carry attachments); the note rides on the row.

describe('History — the Remove confirm names what goes with the record', () => {
  /** The body (second argument) of the confirm, once it has landed. */
  async function confirmBody(): Promise<string> {
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    return (Alert.alert as jest.Mock).mock.calls.at(-1)?.[1] as string;
  }

  /** A row with the note / look columns a test sets on top of `row()`'s defaults. */
  async function pressRemoveOn(r: { id: string } & Record<string, unknown>) {
    mockGetTimeline.mockResolvedValue([r]);
    const view = render(<HistoryScreen />);
    await waitFor(() => expect(view.getByText(`event ${r.id}`)).toBeTruthy());
    fireEvent.press(view.getByTestId(`delete-${r.id}`));
    return view;
  }

  it('names a note the owner typed on a meal', async () => {
    await pressRemoveOn({ ...row('e1'), notes: 'Only ate the topper' });
    expect(await confirmBody()).toBe(
      'This will remove the Meal from history. The note you wrote will be removed with it.',
    );
  });

  it('names the photo, asked of the record', async () => {
    mockGetEventAttachment.mockResolvedValue({ id: 'att-1', local_uri: 'file:///x.jpg' });
    await pressRemoveOn({ ...row('e1'), event_type: 'vomit' });
    expect(await confirmBody()).toBe(
      'This will remove the Vomit from history. The photo you attached will be removed with it.',
    );
    expect(mockGetEventAttachment).toHaveBeenCalledWith('e1');
  });

  it('names BOTH, as one sentence — never the note alone over a photographed record', async () => {
    mockGetEventAttachment.mockResolvedValue({ id: 'att-1', local_uri: 'file:///x.jpg' });
    await pressRemoveOn({ ...row('e1'), event_type: 'vomit', notes: 'Grass first' });
    expect(await confirmBody()).toBe(
      'This will remove the Vomit from history. ' +
        'The photo you attached and the note you wrote will be removed with it.',
    );
  });

  it('still names a look\'s note, and calls the look what you noticed', async () => {
    await pressRemoveOn({
      ...row('e1'),
      event_type: 'check_in',
      look_outcome: 'off',
      look_words: '[]',
      look_note: 'Hung back on the walk',
    });
    expect(await confirmBody()).toBe(
      'This will remove what you noticed from history. The note you wrote will be removed with it.',
    );
  });

  it('says only what goes: a bare record gets the lead alone', async () => {
    await pressRemoveOn(row('e1'));
    expect(await confirmBody()).toBe('This will remove the Meal from history.');
  });

  // The confirm now waits on a read, so a second tap can land before it is up (the
  // CUL-1125 review). One Remove, one confirm.
  it('a second tap while the photo check is out raises one confirm, not two', async () => {
    let release!: (v: unknown) => void;
    mockGetEventAttachment.mockReturnValue(new Promise((r) => { release = r; }));
    const view = await pressRemoveOn(row('e1'));
    fireEvent.press(view.getByTestId('delete-e1'));
    await act(async () => { release(null); });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockGetEventAttachment).toHaveBeenCalledTimes(1);
  });

  it('the guard lets go: after a failed check, the next Remove still raises its confirm', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetEventAttachment.mockRejectedValueOnce(new Error('database is locked'));
    const view = await pressRemoveOn(row('e1'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    fireEvent.press(view.getByTestId('delete-e1'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a failed photo read makes no photo claim, and the confirm still comes', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetEventAttachment.mockRejectedValue(new Error('database is locked'));
    await pressRemoveOn({ ...row('e1'), notes: 'A note' });
    expect(await confirmBody()).toBe(
      'This will remove the Meal from history. The note you wrote will be removed with it.',
    );
    expect(warn).toHaveBeenCalled();
  });
});

// ── Paging after a Remove (CUL-1078) ─────────────────────────────────────────────
//
// `getTimeline` is OFFSET-paginated. A removed row leaves the table, so every row
// after it moves up one place, and a next page read from the old offset starts one
// row too far in. The skipped row is never shown and nothing says so.

describe('History — paging after a Remove', () => {
  /** A full first page, sized by the screen's own `limit` argument rather than a
   *  restated constant, so "Load more" is on screen. Later pages come back empty. */
  function fullFirstPage() {
    mockGetTimeline.mockImplementation(async (_pet: string, limit: number, offset: number) =>
      offset === 0
        ? Array.from({ length: limit }, (_, i) =>
            row(`e${i}`, new Date(Date.UTC(2026, 7, 24, 9) - i * 60_000).toISOString()))
        : []);
  }

  const offsetOfLastRead = () => mockGetTimeline.mock.calls.at(-1)?.[2];
  const pageSize = () => mockGetTimeline.mock.calls[0][1] as number;

  it('reads the next page from one row earlier once a Remove has landed', async () => {
    fullFirstPage();
    const view = render(<HistoryScreen />);
    await waitFor(() => expect(view.getByText('event e0')).toBeTruthy());

    fireEvent.press(view.getByTestId('delete-e0'));
    await confirmRemove();
    await waitFor(() => expect(view.queryByText('event e0')).toBeNull());

    await act(async () => { fireEvent.press(view.getByText('Load more')); });

    expect(offsetOfLastRead()).toBe(pageSize() - 1);
  });

  it('keeps the offset when the Remove fails and the row comes back', async () => {
    fullFirstPage();
    const view = render(<HistoryScreen />);
    await waitFor(() => expect(view.getByText('event e0')).toBeTruthy());
    mockReverse.mockRejectedValueOnce(new Error('write failed'));

    fireEvent.press(view.getByTestId('delete-e0'));
    await confirmRemove();
    await waitFor(() => expect(view.getByText('event e0')).toBeTruthy());

    await act(async () => { fireEvent.press(view.getByText('Load more')); });

    // The row is still in the table, so nothing after it moved.
    expect(offsetOfLastRead()).toBe(pageSize());
  });
});

// ── The vet visit row (CUL-904 VV-6; spec §4.1 History + §7 AC 10) ──────────────
//
// The row renders for every account since GA (CUL-905). Its reads are asserted
// here rather than through a whole-tree snapshot because the row waits on an async
// read, and this is where the data is controllable and the effects are flushed.

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
    mockGetTimeline.mockResolvedValue([]);
    mockReadVisits.mockResolvedValue([visitRow('v1', '2026-07-30')]);

    const { getByText } = render(<HistoryScreen />);

    await waitFor(() => expect(getByText('Vet visit')).toBeTruthy());
    expect(getByText('GI follow-up')).toBeTruthy();
    expect(getByText('Riverside Animal Hospital · Dr. Chen')).toBeTruthy();
  });

  it('opens the VISIT, not an event screen', async () => {
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

  it('a type lens is a lens over EVENTS, so the visit leaves with the markers', async () => {
    mockParams = { type: 'meal', window: '30d', ts: '1' };
    // A row the 30-day read can return, anchored to the clock (C-29): the page places
    // each row on its parsed instant (CUL-1073), so a row outside the window is dropped
    // the way the real query drops it (C-35).
    mockGetTimeline.mockResolvedValue([row('e1', new Date(Date.now() - 86_400_000).toISOString())]);
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

// ── What code-reviewer found on the VV-6 diff, each pinned ─────────────────────

describe('History — the visit read is a second source, and the screen treats it as one', () => {
  it('does not say "Nothing logged yet" over a pet whose only record is a vet visit', async () => {
    // The timeline answers EMPTY and answers FIRST — the ordinary case for a pet
    // with a visit and no logged events, and the one that used to render a claim
    // about the record before the second source had spoken.
    mockGetTimeline.mockResolvedValue([]);
    let release!: (rows: unknown[]) => void;
    mockReadVisits.mockReturnValue(new Promise((res) => { release = res; }));

    const { queryByText, getByText, queryByTestId } = render(<HistoryScreen />);

    await waitFor(() =>
      expect(queryByTestId('history-skeleton', { includeHiddenElements: true })).toBeTruthy());
    expect(queryByText('Nothing logged yet')).toBeNull();

    await act(async () => { release([visitRow('v1', '2026-07-30')]); });
    await waitFor(() => expect(getByText('Vet visit')).toBeTruthy());
    expect(queryByText('Nothing logged yet')).toBeNull();
  });

  it('renders the error state when the VISIT read fails — not an empty record', async () => {
    mockGetTimeline.mockResolvedValue([]);
    mockReadVisits.mockRejectedValue(new Error('disk gone'));

    const { getByText, queryByText } = render(<HistoryScreen />);

    // Permanent, not a frame: `loaded` is true and `events` is [], so before this
    // the screen settled on "Nothing logged yet" and stayed there — the app
    // asserting an empty record over a read that failed (CUL-575's own sentence).
    await waitFor(() => expect(getByText("Couldn't load history")).toBeTruthy());
    expect(queryByText('Nothing logged yet')).toBeNull();
    expect(queryByText(/disk gone/)).toBeNull();
  });

  it('an older visit read resolving last cannot clobber the fresher rows', async () => {
    mockGetTimeline.mockRejectedValueOnce(new Error('transient'));
    const deferred: Array<(rows: unknown[]) => void> = [];
    mockReadVisits.mockImplementation(
      () => new Promise((res) => { deferred.push(res as (rows: unknown[]) => void); }));

    const { getByText, queryByText } = render(<HistoryScreen />);
    await waitFor(() => expect(getByText("Couldn't load history")).toBeTruthy());

    // A second read starts while the first is still open — the shape an owner
    // produces by editing a visit and navigating back while a hydration-tick read
    // is in flight. The pet never changes, so the pet check cannot see this.
    mockGetTimeline.mockResolvedValue([]);
    await act(async () => { fireEvent.press(getByText('Try again')); });
    expect(deferred.length).toBeGreaterThan(1);

    // The NEWER read answers with the real record...
    await act(async () => { deferred[deferred.length - 1]([visitRow('fresh', '2026-08-01')]); });
    await waitFor(() => expect(getByText('Vet visit')).toBeTruthy());

    // ...and then the OLDEST one comes back with what the record used to hold.
    await act(async () => { deferred[0]([]); });

    // Without the monotonic guard this `setVisits([])` wins and the row the owner
    // is looking at disappears, with nothing to bring it back until the next focus.
    expect(getByText('Vet visit')).toBeTruthy();
    expect(queryByText('Nothing logged yet')).toBeNull();
  });
});

// ── A dose's course name reaches the row (CUL-1124) ─────────────────────────────
//
// `rowToEvent` is an explicit mapper and the field is OPTIONAL on NyxEvent, so leaving
// its line out compiles clean (the B-568 trap): every dose of a course typed in by hand
// would go back to reading "Medication" with nothing red anywhere.

describe('History — the row mapper carries a dose\'s course name', () => {
  it('a dose of a course typed in by hand reaches the row with the course\'s name', async () => {
    mockGetTimeline.mockResolvedValue([{
      ...row('d1'),
      event_type: 'medication',
      medication_item_id: null,
      adherence: 'refused',
      regimen_drug_name: 'Metronidazole',
    }]);
    const { findByText } = render(<HistoryScreen />);
    await findByText('course Metronidazole');
  });
});
