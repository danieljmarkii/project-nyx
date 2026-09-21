// Home under `design_v2` — the async half of the flag-off proof, and the FAB's inset
// (D2-4 / CUL-1066; C-41, C-5).
//
// `guards/designV2FlagOff.test.tsx` proves the SYNCHRONOUS half: Home's first frame is
// byte-identical with the namespace stubbed. It cannot see a node whose render waits on
// a read, and Today's spine is exactly that shape — its rows come from the store and its
// reads (the photo set, the analysis rows) land a tick later. So this file renders Home
// over a fixture that WOULD answer — a photographed vomit in today's store, an analysis
// row the server would return — and asserts, flag-off, that no spine row renders and no
// `event_ai_analysis` read is issued; then, flag-on, that both happen. An absence proves
// a gate only when the thing gated was available to leak (C-41).

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useNavigation: () => ({ isFocused: () => true, addListener: () => () => {} }),
}));
// The shipped cards, as markers: this file is about Today's spine and the door, not the
// Signal. (The order file pins where each sits.)
const marker = (name: string) => {
  const { View } = require('react-native');
  const React = require('react');
  return () => React.createElement(View, { testID: `zone-${name}` });
};
jest.mock('../../components/home/HomeHeader', () => ({ HomeHeader: marker('header') }));
jest.mock('../../components/home/PullToRefreshSky', () => ({ PullToRefreshSky: marker('sky') }));
jest.mock('../../components/home/CrossPetSafetyBanner', () => ({ CrossPetSafetyBanner: marker('cross') }));
jest.mock('../../components/home/SignalZone', () => ({ SignalZone: marker('signal') }));
jest.mock('../../components/vetvisits/AppointmentStrip', () => ({ AppointmentStrip: marker('appointment') }));
jest.mock('../../components/home/TrialStrip', () => ({ TrialStrip: marker('trial') }));
jest.mock('../../components/home/MedStrip', () => ({ MedStrip: marker('med') }));
jest.mock('../../components/home/LookCard', () => ({ LookCard: marker('look') }));
jest.mock('../../components/home/LookExits', () => ({ LookExits: marker('look-exits'), exitVisibility: () => ({}) }));
jest.mock('../../components/home/TodayZone', () => ({ TodayZone: marker('today') }));
jest.mock('../../components/home/TrendZone', () => ({ TrendZone: marker('trend') }));
jest.mock('../../components/designV2/home/LookHeader', () => ({ LookHeader: marker('look-header') }));
jest.mock('../../hooks/useDietTrial', () => ({ useDietTrial: () => ({ input: null, inputIsForActivePet: true }) }));
jest.mock('../../hooks/useMedStrips', () => ({ useMedStrips: () => ({ input: null }) }));
jest.mock('../../lib/sync', () => ({ syncNow: jest.fn() }));
jest.mock('../../lib/signal', () => ({ regenerateSignal: jest.fn() }));
jest.mock('../../lib/haptics', () => ({ pullThreshold: jest.fn() }));
let mockDesignV2 = false;
jest.mock('../../hooks/useDesignV2', () => ({ useDesignV2: () => mockDesignV2 }));
jest.mock('../../store/syncStore', () => {
  const state = { hydrationTick: 0, bumpHydrationTick: jest.fn() };
  return {
    useSyncStore: Object.assign((sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state), {
      getState: () => state,
    }),
  };
});
jest.mock('../../store/petStore', () => {
  const pet = { id: 'p1', name: 'Nyx', species: 'cat', sex: 'female' };
  const state = { activePet: pet, pets: [pet] };
  return {
    usePetStore: Object.assign((sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state), {
      getState: () => state,
    }),
  };
});
// The store's rows, through the real event store, so the fixture is the one Home would
// actually read; the loader is a no-op (the fixture is already in the store).
jest.mock('../../hooks/useEvents', () => ({
  useEvents: () => ({
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    todayEvents: require('../../store/eventStore').useEventStore((s: any) => s.todayEvents),
    loadTodayEvents: jest.fn(),
    prependEvent: jest.fn(),
  }),
}));
// The LOCAL reads answer as the record would: the vomit has a photo, no feedings, no
// spans, and a month with one logged day.
const mockDb = {
  getAllAsync: jest.fn(async (sql: string) => {
    if (/FROM event_attachments/.test(sql)) return [{ event_id: 'v1' }];
    if (/FROM events WHERE/.test(sql)) return [{ occurred_at: new Date().toISOString() }];
    return [];
  }),
};
jest.mock('../../lib/db', () => ({ getDb: () => mockDb }));
// The SERVER read — what a leak would reach for. It answers, so an absent read is a gate
// and not an absent fixture.
const mockFrom = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }));
jest.mock('../../lib/analysis', () => ({
  analysisChainOutstanding: () => false,
  awaitAnalysisChain: async () => false,
  watchAnalysisRow: () => () => {},
}));

import { act, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { FAB_SCROLL_INSET_FLOOR, HOME_V2_SCROLL_INSET } from '../../lib/fabFootprint';
import { useEventStore } from '../../store/eventStore';
import HomeScreen from './index';

const vomitNow = () => ({
  id: 'v1',
  pet_id: 'p1',
  event_type: 'vomit',
  occurred_at: new Date().toISOString(),
  occurred_at_confidence: 'witnessed',
});

beforeEach(() => {
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    const result = Promise.resolve({
      data: [{ event_id: 'v1', status: 'completed', recommendation: 'monitor', read_text: 'x', dismissed_at: null }],
      error: null,
    });
    for (const m of ['select', 'in', 'eq']) chain[m] = jest.fn(() => chain);
    Object.assign(chain, { then: result.then.bind(result), catch: result.catch.bind(result) });
    return chain;
  });
  useEventStore.setState({ todayEvents: [vomitNow() as never], todayRead: { petId: 'p1', state: 'ready' } });
});

describe('flag-off: Home renders no spine row and issues no analysis read (C-41)', () => {
  it('over a fixture that would answer', async () => {
    mockDesignV2 = false;
    const t = render(<HomeScreen />);
    await act(async () => {});
    await act(async () => {});
    expect(t.queryByTestId('home-spine')).toBeNull();
    expect(t.queryByTestId('spine-node-v1')).toBeNull();
    expect(t.queryByTestId('coverage-door')).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
    // The fixture was available to leak: the shipped zones rendered around it.
    expect(t.getByTestId('zone-today')).toBeTruthy();
  });
});

describe('flag-on: the spine draws the row, the read is issued, the door speaks coverage', () => {
  it('and the same fixture now reaches the server read and the node', async () => {
    mockDesignV2 = true;
    const t = render(<HomeScreen />);
    await waitFor(() => expect(t.getByTestId('spine-node-v1')).toBeTruthy());
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('event_ai_analysis'));
    await waitFor(() => expect(t.getByTestId('spine-verdict-v1').props.children).toBe('Keep an eye out'));
    expect(t.getByTestId('coverage-door')).toBeTruthy();
    await waitFor(() => expect(t.getByText(/logged 1 of \d+ day/)).toBeTruthy());
    expect(t.queryByTestId('zone-today')).toBeNull();
    expect(t.queryByTestId('zone-trend')).toBeNull();
    expect(t.queryByTestId('zone-med')).toBeNull();
  });
});

describe('the scroll inset clears the FAB (C-5)', () => {
  const insetOf = (t: ReturnType<typeof render>) => {
    const scroll = t.UNSAFE_getByType(require('react-native').ScrollView);
    return (StyleSheet.flatten(scroll.props.contentContainerStyle) as { paddingBottom?: number }).paddingBottom;
  };
  it('flag-on: the content carries the page’s inset, at or above the floor', async () => {
    mockDesignV2 = true;
    const t = render(<HomeScreen />);
    expect(insetOf(t)).toBe(HOME_V2_SCROLL_INSET);
    expect(HOME_V2_SCROLL_INSET).toBeGreaterThanOrEqual(FAB_SCROLL_INSET_FLOOR);
    await act(async () => {});
  });
  it('flag-off: the shipped inset is unchanged and was already above the floor', async () => {
    mockDesignV2 = false;
    const t = render(<HomeScreen />);
    expect(insetOf(t)).toBe(100);
    expect(100).toBeGreaterThanOrEqual(FAB_SCROLL_INSET_FLOOR);
    await act(async () => {});
  });
});
