// Every registered link into History lands as its row says (History v2 · the record you can
// read, HV-11 / CUL-1168; spec §5.8, AC 37; the rows are `lib/historyDoors.ts`), and a
// remount over the same link applies nothing twice. Since GA (HV-14 / CUL-1175) the tab is
// History v2 alone.
//
// The screen is replaced by a probe that runs the REAL door hook and nothing else: the
// landing is the scope store, which the pill (HV-9), the strip's week (HV-8) and the count
// line (HV-7) all read, and `applyDoor` writes the filter, the window and the landing in ONE
// update, so they agree by construction; each of those surfaces pins its own reading of the
// store in its own suite.
//
// The links are built by the senders' own builders wherever one exists (C-34).
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/db', () => ({ getDb: jest.fn() }));
// The screen, reduced to the door: the real hook, no reads.
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

import { act, render } from '@testing-library/react-native';
import HistoryTab from './history';
import { resolveTapThrough, type AskHistoryReach } from '../../lib/ask';
import { historyDayHref } from '../../lib/historyDateFilter';
import { historyHref, rundownHistoryHref, HISTORY_DOORS, type HistoryDoorId } from '../../lib/historyDoors';
import { lookMoreTodayHref } from '../../lib/lookCard';
import { noticedCardHref } from '../../lib/lookPatterns';
import { clearSpentTaps } from '../../lib/spentTaps';
import { usePetStore, type Pet } from '../../store/petStore';
import { defaultHistoryScope, useHistoryScopeStore, type HistoryFilter } from '../../store/historyScopeStore';
import type { HistoryWindowKey } from '../../lib/historyWindows';

function makePet(id: string, name: string): Pet {
  return {
    id, name, species: 'dog', breed: null, date_of_birth: null,
    date_of_birth_precision: 'exact', sex: 'unknown', weight_kg: null, photo_path: null,
  };
}
const rex = makePet('p1', 'Rex');
const mochi = makePet('p2', 'Mochi');

const scope = () => useHistoryScopeStore.getState();
const REACH: AskHistoryReach = { trialWindowOffered: true };
const ALL: HistoryFilter = { kind: 'all' };
const ALL_TIME: HistoryWindowKey = { kind: 'all' };
const DAY = '2026-09-16';

interface DoorCase {
  door: HistoryDoorId;
  name: string;
  /** The params the sender pushes. */
  params: Record<string, string>;
  /** The scope the link lands on (null: the link asks for nothing and the scope stays). */
  lands: { filter: HistoryFilter; window: HistoryWindowKey; landedDay: string | null } | null;
  /** The pet on screen after the tap. */
  pet?: string;
}

const paramsOfString = (route: string) => Object.fromEntries(new URLSearchParams(route.slice(route.indexOf('?') + 1)));
const ask = (w: string) => {
  const nav = resolveTapThrough({ kind: 'filter', symptomType: 'vomit', window: w }, REACH);
  if (!nav || nav.pathname !== '/(tabs)/history') throw new Error(`Ask's ${w} does not reach History`);
  return { ...nav.params, ts: '7' } as Record<string, string>;
};
const rundown = (scoped: boolean) => {
  const href = rundownHistoryHref({ scope: 'since-visit' }, scoped, 7);
  return typeof href === 'string' ? {} : href.params;
};

const CASES: DoorCase[] = [
  {
    door: 'widget-day',
    name: 'the widget (frozen): its local day, on its pet',
    params: { date: DAY, ts: '7', pet: 'p2', src: 'widget' },
    lands: { filter: ALL, window: ALL_TIME, landedDay: DAY },
    pet: 'p2',
  },
  {
    door: 'month-day',
    name: 'the month\'s day',
    params: historyDayHref(DAY, 7).params,
    lands: { filter: ALL, window: ALL_TIME, landedDay: DAY },
  },
  {
    door: 'calendar-day',
    name: 'the flag-off calendar\'s UTC day',
    params: { date: DAY, ts: '7' },
    lands: { filter: ALL, window: ALL_TIME, landedDay: DAY },
  },
  {
    door: 'look-more-today',
    name: 'the look card\'s more today',
    params: paramsOfString(lookMoreTodayHref(7)),
    lands: { filter: { kind: 'noticed' }, window: { kind: 'today' }, landedDay: null },
  },
  {
    door: 'noticed-card',
    name: 'Patterns\' What you noticed',
    params: paramsOfString(noticedCardHref(7)),
    lands: { filter: { kind: 'noticed' }, window: ALL_TIME, landedDay: null },
  },
  {
    door: 'ask-provenance',
    name: 'Ask, the last 7 days',
    params: ask('7d'),
    lands: { filter: { kind: 'type', type: 'vomit' }, window: { kind: 'last', days: 7 }, landedDay: null },
  },
  {
    door: 'ask-provenance',
    name: 'Ask, since the trial started (CUL-498)',
    params: ask('since_trial_start'),
    lands: { filter: { kind: 'type', type: 'vomit' }, window: { kind: 'trial' }, landedDay: null },
  },
  {
    door: 'ask-chip',
    name: 'Ask\'s History chip',
    params: { date: 'today', ts: '7' },
    lands: { filter: ALL, window: { kind: 'today' }, landedDay: null },
  },
  {
    door: 'medication-course',
    name: 'a past course\'s doses',
    params: historyHref({ type: 'medication', course: 'reg-1' }, 7).params,
    lands: { filter: { kind: 'course', courseKey: 'reg-1' }, window: ALL_TIME, landedDay: null },
  },
  {
    door: 'rundown',
    name: 'the rundown\'s since-visit tile',
    params: rundown(true),
    lands: { filter: ALL, window: { kind: 'visit' }, landedDay: null },
  },
  {
    door: 'rundown',
    name: 'the rundown about another pet: the bare route, the scope as the owner left it',
    params: rundown(false),
    lands: null,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  clearSpentTaps();
  mockParams = {};
  usePetStore.setState({ pets: [rex, mochi], activePet: rex });
  useHistoryScopeStore.setState({ ...defaultHistoryScope(rex.id), pendingLanding: null });
});

it('every registered door has a case here', () => {
  expect([...new Set(CASES.map((c) => c.door))].sort()).toEqual(HISTORY_DOORS.map((d) => d.id).sort());
});

describe.each(CASES)('$door — $name', (c) => {
  it('lands where the row says', () => {
    mockParams = c.params;
    const view = render(<HistoryTab />);
    expect(view.getByTestId('history-v2-screen')).toBeTruthy();
    expect(usePetStore.getState().activePet?.id).toBe(c.pet ?? rex.id);
    const expected = c.lands ?? { filter: ALL, window: ALL_TIME, landedDay: null };
    expect({ filter: scope().filter, window: scope().window, landedDay: scope().landedDay }).toEqual(expected);
    if (c.lands?.landedDay) {
      // The strip's week holds the landed day, and the scroll request is pending for the list.
      expect(scope().stripWeek).toBe('2026-09-13');
      expect(scope().pendingLanding).toBe(c.lands.landedDay);
    }
  });
});

describe('a remount never re-applies a spent tap (HV-11)', () => {
  it('the widget\'s pet: switched once, and a remount after the owner moved on neither switches back nor lands late', () => {
    mockParams = { date: DAY, ts: '9', pet: 'p2', src: 'widget' };
    const first = render(<HistoryTab />);
    expect(usePetStore.getState().activePet?.id).toBe('p2');
    expect(scope().landedDay).toBe(DAY);
    first.unmount();
    // The owner switches back to Rex; then the tab mounts again over the same link.
    act(() => usePetStore.getState().selectPet(rex.id));
    render(<HistoryTab />);
    expect(usePetStore.getState().activePet?.id).toBe(rex.id);
    expect(scope().landedDay).toBeNull();
    // Nor does it land later on Mochi, when the owner goes back.
    act(() => usePetStore.getState().selectPet(mochi.id));
    expect(scope().landedDay).toBeNull();
  });

  it('a link applied, then the owner\'s own choice, then a remount: the choice is kept', () => {
    mockParams = ask('7d');
    const first = render(<HistoryTab />);
    expect(scope().filter).toEqual({ kind: 'type', type: 'vomit' });
    act(() => {
      scope().setFilter(rex.id, { kind: 'symptoms' });
    });
    first.unmount();
    render(<HistoryTab />);
    expect(scope().filter).toEqual({ kind: 'symptoms' });
  });
});
