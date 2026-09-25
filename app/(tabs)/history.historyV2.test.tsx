// The History tab under `history_v2` — the async half of the flag-off proof (HV-1 /
// CUL-1158; spec §5.1, §7 AC 35; C-41).
//
// `guards/historyV2FlagOff.test.tsx` proves the SYNCHRONOUS half: the tab's first frame
// is byte-identical with `components/historyV2/` stubbed. It cannot see anything that
// waits on a read, and History's rows are exactly that shape — they land a tick after
// the page read answers. So this file renders the tab over a record that WOULD answer
// (the page read returns a row) and asserts, flag-off, that v1 draws that row and the
// v2 root never mounts, before or after the read settles; then, flag-on, that the v2
// root mounts and v1's page read is never issued (the two screens never run at once).
// An absence proves a gate only when the thing gated was available to leak: the
// flag-on case is what shows the v2 root CAN render here.
//
// STATED LIMIT (C-38): at HV-1 the v2 screen was its empty composition root and issued
// no read of its own, so what this file proved was the MOUNT. HV-9 (CUL-1166) gave the
// pinned row its read (`readHistoryRecord`), proven at the foot: flag-off, never issued,
// over a record that would answer. HV-7 (CUL-1164) extends it to the list's reads.
//
// The gate is the REAL one — `useHistoryV2` over the real app-config observable, the
// real opt-in store and the real auth store — so the flip test below drives it the way
// the Beta shelf's switch does. Only the reads and the heavy children are stubbed (the
// history.test.tsx convention).
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => ({}),
    // `[cb]`, mirroring the real implementation (history.test.tsx explains why).
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
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/db', () => ({
  getTimeline: jest.fn(),
  getEventAttachment: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn(() => Promise.resolve()) }));
// The pinned row's one read (HV-9): stubbed to a record that ANSWERS, so its absence
// flag-off proves the gate rather than an empty fixture (C-41).
jest.mock('../../lib/historyWindowFacts', () => ({ readHistoryRecord: jest.fn() }));
jest.mock('../../store/petStore', () => {
  const state = { activePet: { id: 'p1', name: 'Rex', species: 'dog' } };
  // `subscribe`: History v2's scope store follows the pet store from import on (HV-3).
  return { usePetStore: Object.assign(() => state, { getState: () => state, subscribe: () => () => {} }) };
});
jest.mock('../../lib/vetVisits', () => ({
  ...jest.requireActual('../../lib/vetVisits'),
  readVisitsForHistory: jest.fn(async () => []),
}));
jest.mock('../../store/syncStore', () => ({
  useSyncStore: (selector: (s: { hydrationTick: number }) => unknown) => selector({ hydrationTick: 0 }),
}));
jest.mock('../../components/history/DateScopeControl', () => ({ DateScopeControl: () => null }));
jest.mock('../../components/history/TypeScopeControl', () => ({ TypeScopeControl: () => null }));
jest.mock('../../components/history/FreeFeedingStrip', () => ({ FreeFeedingStrip: () => null }));
jest.mock('../../components/history/BoundaryMarkerRow', () => ({ BoundaryMarkerRow: () => null }));
jest.mock('../../components/history/EventRow', () => {
  const { Text, View } = require('react-native');
  return {
    EventRow: ({ event }: { event: { id: string } }) => (
      <View testID={`row-${event.id}`}>
        <Text>{`event ${event.id}`}</Text>
      </View>
    ),
  };
});

import { act, render, waitFor, within } from '@testing-library/react-native';
import HistoryTab from './history';
import { getTimeline } from '../../lib/db';
import { buildDayFacts } from '../../lib/historyDays';
import { readHistoryRecord, type HistoryRecordData } from '../../lib/historyWindowFacts';
import { __resetAppConfigForTest } from '../../hooks/useAppConfig';
import { ALLOWLIST_FLAGS_UNSET, APP_CONFIG_DEFAULTS } from '../../lib/appConfig';
import { useBetaOptInStore } from '../../lib/betaFeatures';
import { useAuthStore } from '../../store/authStore';
import { useEventStore } from '../../store/eventStore';

const mockGetTimeline = getTimeline as jest.Mock;
const mockReadRecord = readHistoryRecord as jest.MockedFunction<typeof readHistoryRecord>;
const V2_ROOT = 'history-v2-screen';

/** What the pinned row's read answers: one meal on the day the page read holds. */
function answeringHistoryRecord(): HistoryRecordData {
  const range = { fromDay: '2026-09-20', toDay: '2026-09-25' };
  const meal = {
    id: 'e1', eventType: 'meal', occurredAt: '2026-09-20T09:00:00Z', foodItemId: null, foodType: 'meal',
    intakeRating: null, isDose: false, medicationId: null, medicationItemId: null, adherence: null,
    hasPhoto: false, hasNote: false,
  };
  return {
    petId: 'p1',
    windowFacts: { petId: 'p1', today: '2026-09-25', firstRecordDay: '2026-09-20', trial: null, sinceVisit: null },
    range,
    recordDays: buildDayFacts({ rows: [meal], lookDays: [], range, freeFedFoodIds: new Set(), regimens: [] }),
    courses: [],
    notReadDays: new Map(),
  };
}

/** A page read that answers with one meal — the record the flag-off screen must draw. */
function answeringRecord(): void {
  mockGetTimeline.mockResolvedValue([
    {
      id: 'e1',
      pet_id: 'p1',
      event_type: 'meal',
      occurred_at: '2026-09-20T09:00:00Z',
      severity: null,
      notes: null,
      source: 'manual',
      deleted_at: null,
      created_at: '2026-09-20T09:00:00Z',
      updated_at: '2026-09-20T09:00:00Z',
    },
  ]);
}

/** `u1` allowlisted for history_v2 (Gate 1), and the shelf switch set (Gate 2). */
function arrange({ eligible, optedIn }: { eligible: boolean; optedIn: boolean }): void {
  __resetAppConfigForTest({
    values: APP_CONFIG_DEFAULTS,
    allowlist: { ...ALLOWLIST_FLAGS_UNSET, history_v2: { enabled: false, allowlist: eligible ? ['u1'] : [] } },
  });
  useBetaOptInStore.getState().reset();
  if (optedIn) useBetaOptInStore.getState().setOptIn('history_v2', true);
}

/** Let every pending read resolve and its state land. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u1' } } as never);
  useEventStore.setState({ todayEvents: [] });
  answeringRecord();
  mockReadRecord.mockResolvedValue(answeringHistoryRecord());
});

afterAll(() => {
  __resetAppConfigForTest();
  useBetaOptInStore.getState().reset();
});

describe('flag-off: v1 draws the answered record and the v2 root never mounts (C-41)', () => {
  it.each([
    ['unset (the dark seed reaches nobody)', { eligible: false, optedIn: false }],
    ['eligible but not opted in (eligibility turns nothing on)', { eligible: true, optedIn: false }],
    ['opted in but not eligible (a switch to nothing)', { eligible: false, optedIn: true }],
  ])('%s', async (_label, gates) => {
    arrange(gates);
    const view = render(<HistoryTab />);
    expect(view.queryByTestId(V2_ROOT)).toBeNull();

    // The read answered and v1 drew it: the thing a v2 leak would have to beat.
    expect(await view.findByTestId('row-e1')).toBeTruthy();
    expect(mockGetTimeline).toHaveBeenCalled();
    await settle();
    expect(view.queryByTestId(V2_ROOT)).toBeNull();
  });
});

describe('flag-on: the v2 root mounts and v1 never runs', () => {
  it('eligible AND opted in → the v2 composition root; v1’s page read is never issued', async () => {
    arrange({ eligible: true, optedIn: true });
    const view = render(<HistoryTab />);

    expect(view.getByTestId(V2_ROOT)).toBeTruthy();
    await settle();
    expect(mockGetTimeline).not.toHaveBeenCalled();
    expect(view.queryByTestId('row-e1')).toBeNull();
  });
});

describe('the flag flipping while the tab is mounted swaps the screen', () => {
  it('off → on → off, with v1’s hooks never re-ordered under React', async () => {
    // The gate is two components, not an early return in v1's body, so a flip mounts
    // one screen and unmounts the other; an early return would change v1's hook count
    // mid-life, which React reports and then throws on.
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    arrange({ eligible: true, optedIn: false });
    const view = render(<HistoryTab />);
    expect(await view.findByTestId('row-e1')).toBeTruthy();

    act(() => useBetaOptInStore.getState().setOptIn('history_v2', true));
    expect(view.getByTestId(V2_ROOT)).toBeTruthy();
    expect(view.queryByTestId('row-e1')).toBeNull();

    act(() => useBetaOptInStore.getState().setOptIn('history_v2', false));
    expect(view.queryByTestId(V2_ROOT)).toBeNull();
    await waitFor(() => expect(view.getByTestId('row-e1')).toBeTruthy());

    const hookErrors = errors.mock.calls.filter((c) => /hooks?/i.test(String(c[0])));
    expect(hookErrors).toEqual([]);
    errors.mockRestore();
  });
});

describe('the pinned row reads the record only under the flag (HV-9 / CUL-1166; C-41)', () => {
  it('flag-off: its read is never issued, over a record that would answer', async () => {
    arrange({ eligible: true, optedIn: false });
    const view = render(<HistoryTab />);
    expect(await view.findByTestId('row-e1')).toBeTruthy();
    await settle();
    expect(mockReadRecord).not.toHaveBeenCalled();
    expect(view.queryByTestId('history-v2-pinned-row')).toBeNull();
  });

  it('flag-on: it reads the active pet’s record and names whose record it is', async () => {
    arrange({ eligible: true, optedIn: true });
    const view = render(<HistoryTab />);
    await settle();
    expect(mockReadRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), false);
    expect(within(view.getByTestId('history-v2-pinned-row')).getByText('Rex')).toBeTruthy();
  });
});
