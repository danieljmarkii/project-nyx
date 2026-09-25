// Every registered link into History lands as its row says, in both flag states and when the
// flag flips after mount (History v2 · the record you can read, HV-11 / CUL-1168; spec §5.8,
// AC 37; the rows are `lib/historyDoors.ts`).
//
// The tab is the REAL gate (`useHistoryV2` over the real app-config observable, opt-in store
// and auth store, the `history.historyV2.test.tsx` arrangement) over v1's REAL screen, whose
// landing is read off the page read it issues (the type and the bounds; the
// `history.doorway.test.tsx` convention). v2's screen is replaced by a probe that runs the
// REAL door hook and nothing else: v2's landing is the scope store, which the pill (HV-9),
// the strip's week (HV-8) and the count line (HV-7) all read, and `applyDoor` writes the
// filter, the window and the landing in ONE update, so they agree by construction; each of
// those surfaces pins its own reading of the store in its own suite.
//
// The links are built by the senders' own builders wherever one exists (C-34), with the
// params each would carry in the flag state under test.
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
  syncPendingLooks: jest.fn(),
}));
jest.mock('../../lib/feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn(() => Promise.resolve([])),
  getBoundaryMarkers: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/db', () => ({
  getTimeline: jest.fn(() => Promise.resolve([])),
  getEventAttachment: jest.fn(() => Promise.resolve(null)),
  getDb: jest.fn(),
}));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn(() => Promise.resolve()) }));
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
// v2's screen, reduced to the door: the real hook, no reads.
jest.mock('../../components/historyV2/HistoryScreen', () => {
  const { View } = require('react-native');
  const { useHistoryDoor } = require('../../hooks/useHistoryDoor');
  return {
    HistoryScreen: () => {
      useHistoryDoor();
      return <View testID="history-v2-screen" />;
    },
  };
});

import { act, render, waitFor } from '@testing-library/react-native';
import HistoryTab from './history';
import { getTimeline } from '../../lib/db';
import { ASK_HISTORY_V1, resolveTapThrough, type AskHistoryReach } from '../../lib/ask';
import { historyDayHref, PREFILTER_SLACK_MS } from '../../lib/historyDateFilter';
import { historyHref, rundownHistoryHref, HISTORY_DOORS, type HistoryDoorId } from '../../lib/historyDoors';
import { lookMoreTodayHref } from '../../lib/lookCard';
import { noticedCardHref } from '../../lib/lookPatterns';
import { toLocalDayKey } from '../../lib/utils';
import { __resetWidgetPetTapsForTest } from '../../lib/widgetPetTap';
import { __resetHistoryDoorForTest } from '../../hooks/useHistoryDoor';
import { __resetAppConfigForTest } from '../../hooks/useAppConfig';
import { ALLOWLIST_FLAGS_UNSET, APP_CONFIG_DEFAULTS } from '../../lib/appConfig';
import { useBetaOptInStore } from '../../lib/betaFeatures';
import { useAuthStore } from '../../store/authStore';
import { usePetStore, type Pet } from '../../store/petStore';
import { useEventStore } from '../../store/eventStore';
import { defaultHistoryScope, useHistoryScopeStore, type HistoryFilter } from '../../store/historyScopeStore';
import type { HistoryWindowKey } from '../../lib/historyWindows';

const mockGetTimeline = getTimeline as jest.Mock;

function makePet(id: string, name: string): Pet {
  return {
    id, name, species: 'dog', breed: null, date_of_birth: null,
    date_of_birth_precision: 'exact', sex: 'unknown', weight_kg: null, photo_path: null,
  };
}
const rex = makePet('p1', 'Rex');
const mochi = makePet('p2', 'Mochi');

/** `u1` allowlisted and opted in, or not. */
function arrange(on: boolean): void {
  __resetAppConfigForTest({
    values: APP_CONFIG_DEFAULTS,
    allowlist: { ...ALLOWLIST_FLAGS_UNSET, history_v2: { enabled: false, allowlist: ['u1'] } },
  });
  useBetaOptInStore.getState().reset();
  if (on) useBetaOptInStore.getState().setOptIn('history_v2', true);
}
const flip = (on: boolean) => act(() => useBetaOptInStore.getState().setOptIn('history_v2', on));

/** What v1's LAST page read asked for: the type, and the SQL bounds (widened by the slack). */
function v1Read(): { type: string | null; after: string | null; before: string | null } {
  const call = mockGetTimeline.mock.calls.at(-1)!;
  return { type: call[3] as string | null, after: call[4] as string | null, before: call[5] as string | null };
}
const slackBefore = (d: Date) => new Date(d.getTime() - PREFILTER_SLACK_MS).toISOString();
const slackAfter = (d: Date) => new Date(d.getTime() + PREFILTER_SLACK_MS).toISOString();
const localMidnight = (key: string, plus = 0) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d + plus);
};

const scope = () => useHistoryScopeStore.getState();
const V2_REACH: AskHistoryReach = { historyV2: true, trialWindowOffered: true };
const ALL: HistoryFilter = { kind: 'all' };
const ALL_TIME: HistoryWindowKey = { kind: 'all' };
const DAY = '2026-09-16';

interface DoorCase {
  door: HistoryDoorId;
  name: string;
  /** The params the sender pushes with the flag OFF (null: that sender does not reach
   *  History flag off, e.g. Ask's 14 days). */
  offParams: Record<string, string> | null;
  /** …and with the flag ON. */
  onParams: Record<string, string>;
  /** v1's page read for `offParams`. */
  v1: () => { type: string | null; after: string | null; before: string | null };
  /** v2's scope for `onParams` (null: the link asks for nothing and the scope stays). */
  v2: { filter: HistoryFilter; window: HistoryWindowKey; landedDay: string | null } | null;
  /** The pet on screen after the tap. */
  pet?: string;
}

const paramsOfString = (route: string) => Object.fromEntries(new URLSearchParams(route.slice(route.indexOf('?') + 1)));
const ask = (w: string, reach: AskHistoryReach) => {
  const nav = resolveTapThrough({ kind: 'filter', symptomType: 'vomit', window: w }, reach);
  return nav && nav.pathname === '/(tabs)/history' ? { ...nav.params, ts: '7' } : null;
};
const rundown = (scoped: boolean) => {
  const href = rundownHistoryHref({ scope: 'since-visit' }, scoped, 7);
  return typeof href === 'string' ? {} : href.params;
};
const today = () => toLocalDayKey(new Date());

const CASES: DoorCase[] = [
  {
    door: 'widget-day',
    name: 'the widget (frozen): its local day, on its pet',
    offParams: { date: DAY, ts: '7', pet: 'p2', src: 'widget' },
    onParams: { date: DAY, ts: '7', pet: 'p2', src: 'widget' },
    v1: () => ({ type: null, after: slackBefore(localMidnight(DAY)), before: slackAfter(localMidnight(DAY, 1)) }),
    v2: { filter: ALL, window: ALL_TIME, landedDay: DAY },
    pet: 'p2',
  },
  {
    door: 'month-day',
    name: 'the month\'s day',
    offParams: historyDayHref(DAY, 7).params,
    onParams: historyDayHref(DAY, 7).params,
    v1: () => ({ type: null, after: slackBefore(localMidnight(DAY)), before: slackAfter(localMidnight(DAY, 1)) }),
    v2: { filter: ALL, window: ALL_TIME, landedDay: DAY },
  },
  {
    door: 'calendar-day',
    name: 'the flag-off calendar\'s UTC day',
    offParams: { date: DAY, ts: '7' },
    onParams: { date: DAY, ts: '7' },
    v1: () => ({
      type: null,
      after: slackBefore(new Date(`${DAY}T00:00:00.000Z`)),
      before: slackAfter(new Date(Date.parse(`${DAY}T00:00:00.000Z`) + 86_400_000)),
    }),
    v2: { filter: ALL, window: ALL_TIME, landedDay: DAY },
  },
  {
    door: 'look-more-today',
    name: 'the look card\'s more today',
    offParams: paramsOfString(lookMoreTodayHref(7)),
    onParams: paramsOfString(lookMoreTodayHref(7)),
    v1: () => ({ type: 'check_in', after: slackBefore(localMidnight(today())), before: null }),
    v2: { filter: { kind: 'noticed' }, window: { kind: 'today' }, landedDay: null },
  },
  {
    door: 'noticed-card',
    name: 'Patterns\' What you noticed',
    offParams: paramsOfString(noticedCardHref(7)),
    onParams: paramsOfString(noticedCardHref(7)),
    v1: () => ({ type: 'check_in', after: null, before: null }),
    v2: { filter: { kind: 'noticed' }, window: ALL_TIME, landedDay: null },
  },
  {
    door: 'ask-provenance',
    name: 'Ask, the last 7 days',
    offParams: ask('7d', ASK_HISTORY_V1),
    onParams: ask('7d', V2_REACH) as Record<string, string>,
    v1: () => ({ type: 'vomit', after: expect.any(String), before: null }),
    v2: { filter: { kind: 'type', type: 'vomit' }, window: { kind: 'last', days: 7 }, landedDay: null },
  },
  {
    door: 'ask-provenance',
    name: 'Ask, since the trial started (CUL-498: flag off it never reaches History)',
    offParams: ask('since_trial_start', ASK_HISTORY_V1),
    onParams: ask('since_trial_start', V2_REACH) as Record<string, string>,
    v1: () => ({ type: null, after: null, before: null }),
    v2: { filter: { kind: 'type', type: 'vomit' }, window: { kind: 'trial' }, landedDay: null },
  },
  {
    door: 'ask-chip',
    name: 'Ask\'s History chip',
    offParams: { date: 'today', ts: '7' },
    onParams: { date: 'today', ts: '7' },
    v1: () => ({ type: null, after: slackBefore(localMidnight(today())), before: null }),
    v2: { filter: ALL, window: { kind: 'today' }, landedDay: null },
  },
  {
    door: 'medication-course',
    name: 'a past course\'s doses',
    offParams: historyHref({ type: 'medication', course: 'reg-1' }, 7).params,
    onParams: historyHref({ type: 'medication', course: 'reg-1' }, 7).params,
    v1: () => ({ type: 'medication', after: null, before: null }),
    v2: { filter: { kind: 'course', courseKey: 'reg-1' }, window: ALL_TIME, landedDay: null },
  },
  {
    door: 'rundown',
    name: 'the rundown\'s since-visit tile',
    offParams: rundown(false),
    onParams: rundown(true),
    v1: () => ({ type: null, after: null, before: null }),
    v2: { filter: ALL, window: { kind: 'visit' }, landedDay: null },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  __resetWidgetPetTapsForTest();
  __resetHistoryDoorForTest();
  mockParams = {};
  useAuthStore.setState({ user: { id: 'u1' } } as never);
  useEventStore.setState({ todayEvents: [] });
  usePetStore.setState({ pets: [rex, mochi], activePet: rex });
  useHistoryScopeStore.setState({ ...defaultHistoryScope(rex.id), pendingLanding: null });
});

afterAll(() => {
  __resetAppConfigForTest();
  useBetaOptInStore.getState().reset();
});

it('every registered door has a case here', () => {
  expect([...new Set(CASES.map((c) => c.door))].sort()).toEqual(HISTORY_DOORS.map((d) => d.id).sort());
});

describe.each(CASES)('$door — $name', (c) => {
  it('flag off: v1 lands where the row says', async () => {
    arrange(false);
    mockParams = c.offParams ?? {};
    render(<HistoryTab />);
    await waitFor(() => expect(mockGetTimeline).toHaveBeenCalled());
    await waitFor(() => expect(v1Read()).toEqual(c.v1()));
    expect(usePetStore.getState().activePet?.id).toBe(c.pet ?? rex.id);
  });

  it('flag on: v2 lands where the row says', () => {
    arrange(true);
    mockParams = c.onParams;
    const view = render(<HistoryTab />);
    expect(view.getByTestId('history-v2-screen')).toBeTruthy();
    expect(usePetStore.getState().activePet?.id).toBe(c.pet ?? rex.id);
    if (c.v2 === null) return;
    expect({ filter: scope().filter, window: scope().window, landedDay: scope().landedDay }).toEqual(c.v2);
    if (c.v2.landedDay) {
      // The strip's week holds the landed day, and the scroll request is pending for the list.
      expect(scope().stripWeek).toBe('2026-09-13');
      expect(scope().pendingLanding).toBe(c.v2.landedDay);
    }
  });

  it('the flag flips on after mount: v2 lands the link v1 was showing', async () => {
    // A link that never reaches History flag off has nothing on screen to flip under.
    if (c.offParams === null) return;
    arrange(false);
    mockParams = c.offParams;
    const view = render(<HistoryTab />);
    await waitFor(() => expect(mockGetTimeline).toHaveBeenCalled());
    flip(true);
    expect(view.getByTestId('history-v2-screen')).toBeTruthy();
    // v2 reads the flag-off link: where it names the same scope it lands the same way; a
    // link that differs by flag is the rundown's, bare flag off, so v2 keeps its default.
    const same = JSON.stringify(c.offParams) === JSON.stringify(c.onParams);
    const expected = same ? c.v2 : { filter: ALL, window: ALL_TIME, landedDay: null };
    expect(same || c.door === 'rundown').toBe(true);
    expect({ filter: scope().filter, window: scope().window, landedDay: scope().landedDay }).toEqual(expected);
    expect(usePetStore.getState().activePet?.id).toBe(c.pet ?? rex.id);
  });
});

describe('the flag flipping never re-applies a spent tap (HV-11)', () => {
  it('the widget\'s pet: switched once, and a flip after the owner moved on neither switches back nor lands late', async () => {
    arrange(false);
    mockParams = { date: DAY, ts: '9', pet: 'p2', src: 'widget' };
    const view = render(<HistoryTab />);
    await waitFor(() => expect(mockGetTimeline).toHaveBeenCalled());
    expect(usePetStore.getState().activePet?.id).toBe('p2');
    // The owner switches back to Rex; then the flag flips and v2 mounts over the same link.
    act(() => usePetStore.getState().selectPet(rex.id));
    flip(true);
    expect(view.getByTestId('history-v2-screen')).toBeTruthy();
    expect(usePetStore.getState().activePet?.id).toBe(rex.id);
    expect(scope().landedDay).toBeNull();
    // Nor does it land later on Mochi, when the owner goes back.
    act(() => usePetStore.getState().selectPet(mochi.id));
    expect(scope().landedDay).toBeNull();
  });

  it('a link applied in v2, then off and on again: the owner\'s choice since is kept', () => {
    arrange(true);
    mockParams = ask('7d', V2_REACH) as Record<string, string>;
    render(<HistoryTab />);
    expect(scope().filter).toEqual({ kind: 'type', type: 'vomit' });
    act(() => {
      scope().setFilter(rex.id, { kind: 'symptoms' });
    });
    flip(false);
    flip(true);
    expect(scope().filter).toEqual({ kind: 'symptoms' });
  });
});
