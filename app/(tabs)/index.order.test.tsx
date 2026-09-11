// Home's render order (CUL-903 VV-5; vet-visits spec §4.1 A2, §7 AC 3).
//
// AC 3 says the appointment strip sits "under the Signal and any safety or intake
// card", and that is a SAFETY rule rather than a layout preference: Principle 3 gives
// safety and concern insights the lead, and an appointment is context — a visit three
// days out must never sit above a card saying the cat has finished 2 of 8 meals.
//
// Nothing checked it. The strip's own suite can only prove what the strip draws, and
// the flag-off guard compares two renders of the SAME tree, so it moves with a
// reordering rather than catching one. This file is the missing half: every zone is
// replaced by a marker and the ORDER of the markers is asserted.
//
// It deliberately pins the whole sequence and not just the strip's neighbours. A
// reorder that moved the strip above the Signal would almost certainly arrive as a
// reorder of several rows at once, and a two-element assertion would report the wrong
// one as the offender.

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true, addListener: () => () => {} }),
}));

// Each zone becomes a marker carrying its own name. `testID` rather than text so the
// assertion reads the STRUCTURE and cannot be satisfied by a string that happens to
// appear somewhere else in the tree.
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
jest.mock('../../components/vetvisits/AppointmentStrip', () => ({
  AppointmentStrip: marker('appointment'),
}));
jest.mock('../../components/home/TrialStrip', () => ({ TrialStrip: marker('trial') }));
jest.mock('../../components/home/MedStrip', () => ({ MedStrip: marker('med') }));
jest.mock('../../components/home/LookCard', () => ({ LookCard: marker('look') }));
jest.mock('../../components/home/LookExits', () => ({
  LookExits: marker('look-exits'),
  exitVisibility: () => ({}),
}));
jest.mock('../../components/home/TodayZone', () => ({ TodayZone: marker('today') }));
jest.mock('../../components/home/TrendZone', () => ({ TrendZone: marker('trend') }));

jest.mock('../../hooks/useEvents', () => ({
  useEvents: () => ({ todayEvents: [], loadTodayEvents: jest.fn() }),
}));
jest.mock('../../hooks/useDietTrial', () => ({
  useDietTrial: () => ({ input: null, inputIsForActivePet: true }),
}));
// One med strip, so the order below exercises the real sequence rather than a Home
// with a hole in it: `resolveMedStrips` returns an empty array for a pet with no
// courses, and an absent row proves nothing about where it would have gone.
jest.mock('../../hooks/useMedStrips', () => ({ useMedStrips: () => ({ input: {} }) }));
jest.mock('../../lib/medStrip', () => ({ resolveMedStrips: () => [{ key: 'm1' }] }));
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

import { render } from '@testing-library/react-native';
import HomeScreen from './index';

/** Every `zone-*` marker in the rendered tree, in render order. */
function zoneOrder(tree: unknown, out: string[] = []): string[] {
  if (tree === null || typeof tree !== 'object') return out;
  if (Array.isArray(tree)) {
    for (const child of tree) zoneOrder(child, out);
    return out;
  }
  const node = tree as { props?: Record<string, unknown>; children?: unknown };
  const id = node.props?.testID;
  if (typeof id === 'string' && id.startsWith('zone-')) out.push(id.slice(5));
  zoneOrder(node.children, out);
  return out;
}

describe('AC 3 — the appointment strip sits under the Signal, in the context register', () => {
  it('renders the zones in the ruled order', () => {
    const order = zoneOrder(render(<HomeScreen />).toJSON());

    // The non-vacuity floor: a marker set that resolved to nothing would make every
    // ordering assertion below true of an empty list.
    expect(order.length).toBeGreaterThan(6);

    expect(order).toEqual([
      'header',
      'sky',
      // A DIFFERENT pet's safety finding — above everything, because it belongs to an
      // animal this screen is not about (multi-pet §4).
      'cross-pet-safety',
      // This pet's Signal: every safety and intake card lives in here.
      'signal',
      // CUL-903 — context, never an insight.
      'appointment',
      'trial',
      'med',
      'look',
      'today',
      'trend',
      'look-exits',
    ]);
  });

  it('puts the strip BELOW the Signal and ABOVE the trial strip specifically', () => {
    // Stated twice on purpose. The equality above is the pin; this is the sentence
    // AC 3 actually makes, so a future reorder reads its failure as the rule it broke
    // rather than as a list that no longer matches.
    const order = zoneOrder(render(<HomeScreen />).toJSON());
    expect(order.indexOf('appointment')).toBeGreaterThan(order.indexOf('signal'));
    expect(order.indexOf('appointment')).toBeLessThan(order.indexOf('trial'));
    expect(order.indexOf('appointment')).toBeGreaterThan(order.indexOf('cross-pet-safety'));
  });
});
