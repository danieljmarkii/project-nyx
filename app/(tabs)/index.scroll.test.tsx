// Home's scroll offset, and who pays for it (the Noticed grid's pinned exits, T-21).
//
// `LookExits` needs the feed's offset to decide which exit pins, and draws nothing at
// all unless the Noticed grid is open. Held in state and set on every scroll event,
// the offset re-rendered the whole feed about ten times a second for EVERY account,
// look or no look. So: with the grid closed a scroll re-renders nothing; with it open
// the exits follow the scroll exactly as before; and a grid opened after a scroll
// opens at the real offset, never the one state last held.
//
// Every zone is a marker (the `index.order.test.tsx` shape). The look card's marker
// passes its `onLayout` through, so the card can be "measured"; `LookExits` records
// the props Home hands it, computed by the REAL `exitVisibility`.

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true, addListener: () => () => {} }),
}));

const marker = (name: string) => {
  const { View } = require('react-native');
  const React = require('react');
  return () => React.createElement(View, { testID: `zone-${name}` });
};
jest.mock('../../components/home/HomeHeader', () => ({ HomeHeader: marker('header') }));
jest.mock('../../components/home/PullToRefreshSky', () => ({ PullToRefreshSky: marker('sky') }));
jest.mock('../../components/home/CrossPetSafetyBanner', () => ({
  CrossPetSafetyBanner: marker('cross-pet-safety'),
}));
jest.mock('../../components/home/SignalZone', () => ({ SignalZone: marker('signal') }));
jest.mock('../../components/vetvisits/AppointmentStrip', () => ({ AppointmentStrip: marker('appointment') }));
jest.mock('../../components/home/TrialStrip', () => ({ TrialStrip: marker('trial') }));
jest.mock('../../components/home/MedStrip', () => ({ MedStrip: marker('med') }));
jest.mock('../../components/home/TrendZone', () => ({ TrendZone: marker('trend') }));
jest.mock('../../components/home/LookCard', () => {
  const { View } = require('react-native');
  const React = require('react');
  return {
    LookCard: ({ onLayout }: { onLayout?: unknown }) => React.createElement(View, { testID: 'zone-look', onLayout }),
  };
});
// Counts Home's renders: an unmemoized child re-renders every time its parent does.
let mockTodayRenders = 0;
jest.mock('../../components/home/TodayZone', () => {
  const { View } = require('react-native');
  const React = require('react');
  return {
    TodayZone: () => {
      mockTodayRenders += 1;
      return React.createElement(View, { testID: 'zone-today' });
    },
  };
});
// The real `exitVisibility` / `lookRectInPage`: the decision is the thing under test.
const mockExitProps: { backPinned: boolean; donePinned: boolean }[] = [];
jest.mock('../../components/home/LookExits', () => ({
  ...jest.requireActual('../../components/home/LookExits'),
  LookExits: (props: { backPinned: boolean; donePinned: boolean }) => {
    mockExitProps.push(props);
    return null;
  },
}));
jest.mock('../../hooks/useDesignV2', () => ({ useDesignV2: () => false }));
jest.mock('../../components/designV2/home/TodayCard', () => ({ TodayCard: marker('today-v2') }));
jest.mock('../../components/designV2/home/CoverageDoor', () => ({ CoverageDoor: marker('coverage-door') }));
jest.mock('../../hooks/useEvents', () => ({
  useEvents: () => ({ todayEvents: [], loadTodayEvents: mockLoadTodayEvents }),
}));
const mockLoadTodayEvents = jest.fn();
jest.mock('../../hooks/useDietTrial', () => ({
  useDietTrial: () => ({ input: null, inputIsForPet: true }),
}));
jest.mock('../../hooks/useMedStrips', () => ({ useMedStrips: () => ({ input: null }) }));
jest.mock('../../lib/medStrip', () => ({ resolveMedStrips: () => [] }));
jest.mock('../../lib/sync', () => ({ syncNow: jest.fn() }));
jest.mock('../../lib/signal', () => ({ regenerateSignal: jest.fn() }));
jest.mock('../../store/syncStore', () => {
  const state = { hydrationTick: 0, bumpHydrationTick: jest.fn() };
  return {
    useSyncStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});
jest.mock('../../store/petStore', () => {
  const pet = { id: 'p1', name: 'Mochi', species: 'cat' };
  const state = { activePet: pet, pets: [pet] };
  return {
    usePetStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});

import { ScrollView } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import HomeScreen from './index';
import { useUiStore, type CaptureOverlay } from '../../store/uiStore';

const OVERLAY: CaptureOverlay = {
  summary: 'Mochi · off',
  inViewport: true,
  busy: false,
  onBack: () => {},
  onDone: () => {},
  drawsDoneBar: true,
};

// The card sits 300pt down the feed and is 900pt tall once its grid is open; the
// viewport is 700pt. So at offset 0 only the Done bar pins, at 400 both do, and at
// 600 only the way back does — three answers that each need the real offset.
const CARD = { y: 300, height: 900 };
const VIEWPORT = 700;

function renderHome() {
  const view = render(<HomeScreen />);
  // The body's onLayout is the nearest handler above the sky marker.
  fireEvent(view.getByTestId('zone-sky'), 'layout', { nativeEvent: { layout: { height: VIEWPORT } } });
  fireEvent(view.getByTestId('zone-look'), 'layout', { nativeEvent: { layout: CARD } });
  const scroll = (y: number) =>
    fireEvent.scroll(view.UNSAFE_getByType(ScrollView), { nativeEvent: { contentOffset: { y } } });
  return { ...view, scroll };
}

const lastExits = () => mockExitProps[mockExitProps.length - 1];

beforeEach(() => {
  mockTodayRenders = 0;
  mockExitProps.length = 0;
  act(() => useUiStore.setState({ captureOverlay: null }));
});

describe('Home — the scroll offset re-renders only what can draw it', () => {
  it('a scroll with the grid closed re-renders nothing', () => {
    const { scroll } = renderHome();
    const rendersBefore = mockTodayRenders;
    // Non-vacuity: Home did render, and the zones it draws are counted.
    expect(rendersBefore).toBeGreaterThan(0);

    for (const y of [40, 180, 420, 640, 900]) scroll(y);

    expect(mockTodayRenders).toBe(rendersBefore);
  });

  it('with the grid open, the exits follow the scroll as they always did', () => {
    const { scroll } = renderHome();
    act(() => useUiStore.setState({ captureOverlay: OVERLAY }));

    scroll(0);
    expect(lastExits()).toEqual({ backPinned: false, donePinned: true });
    scroll(400);
    expect(lastExits()).toEqual({ backPinned: true, donePinned: true });
    scroll(600);
    expect(lastExits()).toEqual({ backPinned: true, donePinned: false });
  });

  it('a grid opened after a scroll opens at the real offset, not the last one state held', () => {
    const { scroll } = renderHome();
    // Scrolled while closed: nothing re-rendered, so state still holds the first offset.
    scroll(600);
    act(() => useUiStore.setState({ captureOverlay: OVERLAY }));
    expect(lastExits()).toEqual({ backPinned: true, donePinned: false });
  });
});
