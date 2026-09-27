// Home hands the Signal zone its trial anchor (CUL-1360). The zone's own suites prove what
// it does with `signalTrial` (`SignalZone.designV2.test.tsx` drops an older trial's falling
// pair; `SignalZone.test.tsx` withholds the arrival over it). This file is the WIRING the
// adversarial pass found unguarded: `signalTrial={null}` here left every Home test green.
// The zone is a prop-capturing stub; the trial facts are the hook's answer, controlled.

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
const mockZoneProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock('../../components/home/SignalZone', () => ({
  SignalZone: (props: Record<string, unknown>) => {
    mockZoneProps.current = props;
    return null;
  },
}));
jest.mock('../../components/home/HomeHeader', () => ({ HomeHeader: marker('header') }));
jest.mock('../../components/home/PullToRefreshSky', () => ({ PullToRefreshSky: marker('sky') }));
jest.mock('../../components/home/CrossPetSafetyBanner', () => ({ CrossPetSafetyBanner: marker('cross') }));
jest.mock('../../components/vetvisits/AppointmentStrip', () => ({ AppointmentStrip: marker('appointment') }));
jest.mock('../../components/home/TrialStrip', () => ({ TrialStrip: marker('trial') }));
jest.mock('../../components/home/MedStrip', () => ({ MedStrip: marker('med') }));
jest.mock('../../components/home/LookCard', () => ({ LookCard: marker('look') }));
jest.mock('../../components/home/LookExits', () => ({ LookExits: marker('look-exits'), exitVisibility: () => ({}) }));
jest.mock('../../components/home/TodayZone', () => ({ TodayZone: marker('today') }));
jest.mock('../../components/home/TrendZone', () => ({ TrendZone: marker('trend') }));
jest.mock('../../hooks/useDesignV2', () => ({ useDesignV2: () => false }));
jest.mock('../../components/designV2/home/TodayCard', () => ({ TodayCard: marker('today-v2') }));
jest.mock('../../components/designV2/home/CoverageDoor', () => ({ CoverageDoor: marker('coverage-door') }));
jest.mock('../../hooks/useEvents', () => ({
  useEvents: () => ({ todayEvents: [], loadTodayEvents: jest.fn() }),
}));
// The trial facts as `useDietTrial` answers them — mutable per case.
const mockDietTrial: { current: { input: unknown; inputIsForPet: boolean; loadedPetId: string | null } } = {
  current: { input: null, inputIsForPet: false, loadedPetId: null },
};
jest.mock('../../hooks/useDietTrial', () => ({ useDietTrial: () => mockDietTrial.current }));
jest.mock('../../hooks/useMedStrips', () => ({ useMedStrips: () => ({ input: {} }) }));
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

import { render } from '@testing-library/react-native';
import HomeScreen from './index';

const NOW = Date.now();
const today = new Date(NOW);
const pad = (n: number) => String(n).padStart(2, '0');
const TRIAL = {
  id: 'trial-chicken',
  status: 'active',
  startedAt: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
  endedAt: null,
  targetDurationDays: 56,
  foodLabel: null,
};
const INPUT = { trial: TRIAL, nowMs: NOW, petName: 'Mochi', species: 'cat' };

beforeEach(() => {
  mockZoneProps.current = null;
});

describe('Home hands the Signal zone the trial anchor (CUL-1360)', () => {
  it('facts confirmed for the active pet: the zone gets that pet’s trial row on the facts’ clock', () => {
    mockDietTrial.current = { input: INPUT, inputIsForPet: true, loadedPetId: 'p1' };
    render(<HomeScreen />);
    expect(mockZoneProps.current).not.toBeNull();
    expect(mockZoneProps.current?.signalTrial).toEqual({ petId: 'p1', trial: TRIAL, nowMs: NOW });
  });

  it('facts not yet confirmed for this pet (a switch, a cold start): no anchor', () => {
    mockDietTrial.current = { input: INPUT, inputIsForPet: false, loadedPetId: 'p0' };
    render(<HomeScreen />);
    expect(mockZoneProps.current).not.toBeNull();
    expect(mockZoneProps.current?.signalTrial).toBeNull();
  });

  it('a pet with no trial: the anchor names the pet and no trial', () => {
    mockDietTrial.current = { input: { ...INPUT, trial: null }, inputIsForPet: true, loadedPetId: 'p1' };
    render(<HomeScreen />);
    expect(mockZoneProps.current?.signalTrial).toEqual({ petId: 'p1', trial: null, nowMs: NOW });
  });
});
