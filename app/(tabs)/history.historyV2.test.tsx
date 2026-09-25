// The History tab under `history_v2` — the async half of the flag-off proof (HV-1 /
// CUL-1158, extended to the real reads by HV-7 / CUL-1164; spec §5.1, §7 AC 35; C-41).
//
// `guards/historyV2FlagOff.test.tsx` proves the SYNCHRONOUS half: the tab's first frame
// is byte-identical with `components/historyV2/` stubbed. It cannot see anything that
// waits on a read, and History's rows are exactly that shape — they land a tick after
// the page read answers. So this file renders the tab over a record that WOULD answer,
// in BOTH screens' reads, and asserts:
//   • flag-off: v1 draws its row, the v2 root never mounts, and NOT ONE of v2's reads is
//     issued (the list's: the window's facts, the numbers, the page, the whole days, the
//     courses, the trial, the visit bound; and the pinned row's record read, HV-9), before
//     or after every read settles;
//   • flag-on: the v2 root mounts, v2's reads ARE issued and its row is drawn from them, and
//     v1's page read is never issued (the two screens never run at once).
// An absence proves a gate only when the thing gated was available to leak: the flag-on
// case is what shows each v2 read CAN run here, over the same fixture.
//
// The gate is the REAL one — `useHistoryV2` over the real app-config observable, the
// real opt-in store and the real auth store — so the flip test below drives it the way
// the Beta shelf's switch does. Only the reads and the heavy children are stubbed (the
// history.test.tsx convention); the numbers' rules stay real (`jest.requireActual`, C-34).
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => ({}),
    useNavigation: () => ({ isFocused: () => true, addListener: () => () => {} }),
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
  getDb: jest.fn(() => ({})),
}));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn(() => Promise.resolve()) }));
// The pinned row's one read (HV-9): stubbed to a record that ANSWERS, so its absence
// flag-off proves the gate rather than an empty fixture (C-41). The rest of the module
// stays real: the list assembles its window facts through `readWindowFacts`, over the
// reads stubbed below, and a mock narrower than that would hide the dependency (C-39).
jest.mock('../../lib/historyWindowFacts', () => ({
  ...jest.requireActual('../../lib/historyWindowFacts'),
  readHistoryRecord: jest.fn(),
}));
jest.mock('../../store/petStore', () => {
  const pet = { id: 'p1', name: 'Rex', species: 'dog', sex: 'male' };
  const state = { activePet: pet, pets: [pet] };
  const hook = (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state);
  // `subscribe`: History v2's scope and list stores follow the pet store (HV-3, HV-7).
  return { usePetStore: Object.assign(hook, { getState: () => state, subscribe: () => () => {} }) };
});
jest.mock('../../lib/vetVisits', () => ({
  ...jest.requireActual('../../lib/vetVisits'),
  readVisitsForHistory: jest.fn(async () => []),
}));
// v2's reads: each answers with a record (below), so a leak would have something to draw.
jest.mock('../../lib/historyQueries', () => ({
  ...jest.requireActual('../../lib/historyQueries'),
  readRecordStartDay: jest.fn(async () => '2026-09-20'),
  readHistoryFacts: jest.fn(async () => mockFacts()),
  readDayPage: jest.fn(async () => mockPage()),
  readWholeDays: jest.fn(async () => new Map()),
  readHistoryCourses: jest.fn(async () => []),
}));
jest.mock('../../lib/dietTrialFacts', () => ({
  ...jest.requireActual('../../lib/dietTrialFacts'),
  loadTrialPredicateFacts: jest.fn(async () => null),
}));
jest.mock('../../lib/visitWindow', () => ({
  ...jest.requireActual('../../lib/visitWindow'),
  readLatestVisitBefore: jest.fn(async () => null),
}));
jest.mock('../../lib/spineReads', () => ({
  readAnalysisRows: jest.fn(async () => new Map()),
  readAnalysisCopy: jest.fn(async () => new Map()),
  readFeedingsSince: jest.fn(async () => []),
  readFreeFedSpans: jest.fn(async () => []),
  readVomitOnsetsSince: jest.fn(async () => []),
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
import {
  readDayPage,
  readHistoryCourses,
  readHistoryFacts,
  readRecordStartDay,
  readWholeDays,
  type DayPage,
  type HistoryRow,
} from '../../lib/historyQueries';
import { buildDayFacts, firstDaysOf, type HistoryFacts } from '../../lib/historyDays';
import { loadTrialPredicateFacts } from '../../lib/dietTrialFacts';
import { readHistoryRecord, type HistoryRecordData } from '../../lib/historyWindowFacts';
import { readLatestVisitBefore } from '../../lib/visitWindow';
import { toLocalDayKey } from '../../lib/utils';
import { __resetAppConfigForTest } from '../../hooks/useAppConfig';
import { ALLOWLIST_FLAGS_UNSET, APP_CONFIG_DEFAULTS } from '../../lib/appConfig';
import { useBetaOptInStore } from '../../lib/betaFeatures';
import { useAuthStore } from '../../store/authStore';
import { useEventStore } from '../../store/eventStore';
import { useHistoryListStore } from '../../store/historyListStore';

const mockGetTimeline = getTimeline as jest.Mock;
const mockReadRecord = readHistoryRecord as jest.MockedFunction<typeof readHistoryRecord>;
const V2_ROOT = 'history-v2-screen';

/** Every read v2 makes that v1 never does: the gate's async half is their absence. */
const V2_READS: ReadonlyArray<[string, jest.Mock]> = [
  ['readRecordStartDay', readRecordStartDay as jest.Mock],
  ['readHistoryFacts', readHistoryFacts as jest.Mock],
  ['readDayPage', readDayPage as jest.Mock],
  ['readWholeDays', readWholeDays as jest.Mock],
  ['readHistoryCourses', readHistoryCourses as jest.Mock],
  ['loadTrialPredicateFacts', loadTrialPredicateFacts as jest.Mock],
  ['readLatestVisitBefore', readLatestVisitBefore as jest.Mock],
  // The pinned row's record read (HV-9).
  ['readHistoryRecord', readHistoryRecord as jest.Mock],
];

// ── The record both screens would draw: one meal, today, at 9 AM local ──────────

const TODAY = toLocalDayKey(new Date());
const MEAL_AT = new Date(new Date().setHours(9, 0, 0, 0)).toISOString();

/** A v2 page row as `readDayPage` hands it over: the `getTimeline` row plus HV-4's four. */
function mealRow(): HistoryRow {
  return {
    id: 'e1',
    pet_id: 'p1',
    event_type: 'meal',
    occurred_at: MEAL_AT,
    occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null,
    occurred_at_latest: null,
    severity: null,
    notes: null,
    source: 'manual',
    deleted_at: null,
    created_at: MEAL_AT,
    updated_at: MEAL_AT,
    medication_id: null,
    has_photo: false,
    course_key: null,
    look_local_day: null,
  } as HistoryRow;
}

function mockPage(): DayPage {
  return { days: [{ day: TODAY, rows: [mealRow()] }], span: { fromDay: TODAY, toDay: TODAY }, next: null };
}

/** The facts through the REAL builders, over the same row: the shape the read returns. */
function mockFacts(): HistoryFacts {
  const range = { fromDay: TODAY, toDay: TODAY };
  return {
    // The pet every row here belongs to (the mocked pet store's).
    petId: 'p1',
    range,
    days: buildDayFacts({
      rows: [
        {
          id: 'e1', eventType: 'meal', occurredAt: MEAL_AT, foodItemId: null, foodType: null, intakeRating: null,
          isDose: false, medicationId: null, medicationItemId: null, adherence: null, hasPhoto: false, hasNote: false,
        },
      ],
      lookDays: [],
      range,
      freeFedFoodIds: new Set(),
      regimens: [],
    }),
    firsts: firstDaysOf([{ eventType: 'meal', firstMs: Date.parse(MEAL_AT), firstPhotoMs: null, firstNoteMs: null }], null),
    duplicates: { total: 0, byType: {} },
  };
}

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
      occurred_at: MEAL_AT,
      severity: null,
      notes: null,
      source: 'manual',
      deleted_at: null,
      created_at: MEAL_AT,
      updated_at: MEAL_AT,
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

function expectNoV2Read(): void {
  for (const [name, mock] of V2_READS) {
    expect([name, mock.mock.calls.length]).toEqual([name, 0]);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u1' } } as never);
  useEventStore.setState({ todayEvents: [] });
  useHistoryListStore.getState().reset();
  answeringRecord();
  mockReadRecord.mockResolvedValue(answeringHistoryRecord());
});

afterAll(() => {
  __resetAppConfigForTest();
  useBetaOptInStore.getState().reset();
});

describe('flag-off: v1 draws the answered record, the v2 root never mounts, and no v2 read is issued (C-41)', () => {
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
    // HV-7: not one of v2's reads ran, over a record every one of them would answer.
    expectNoV2Read();
    expect(useHistoryListStore.getState().snapshot).toBeNull();
  });
});

describe('flag-on: the v2 root mounts, its reads run and draw, and v1 never runs', () => {
  it('eligible AND opted in → the v2 screen reads the record and draws its row; v1’s page read is never issued', async () => {
    arrange({ eligible: true, optedIn: true });
    const view = render(<HistoryTab />);

    expect(view.getByTestId(V2_ROOT)).toBeTruthy();
    // The row, drawn by the shared row over v2's own read: the leak the flag-off case
    // shows cannot happen is possible, here, over the same fixture.
    expect(await view.findByTestId('spine-node-e1')).toBeTruthy();
    for (const [name, mock] of V2_READS.filter(([n]) => n !== 'readWholeDays')) {
      expect([name, mock.mock.calls.length > 0]).toEqual([name, true]);
    }
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
    expectNoV2Read();

    act(() => useBetaOptInStore.getState().setOptIn('history_v2', true));
    expect(view.getByTestId(V2_ROOT)).toBeTruthy();
    expect(view.queryByTestId('row-e1')).toBeNull();
    expect(await view.findByTestId('spine-node-e1')).toBeTruthy();

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
