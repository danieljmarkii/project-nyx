// The cold start's gate (D2-7 / CUL-1068): flag-off the night moment exactly as shipped,
// flag-on Home's silhouette; neither without a pet (the overlay can never sit over
// onboarding, B-054 §6). The gate is a FACT this suite sets; the two waits are mocked to
// markers so the swap — and only the swap — is what is asserted.
const mockUseDesignV2 = jest.fn(() => false);
jest.mock('../hooks/useDesignV2', () => ({ useDesignV2: () => mockUseDesignV2() }));
jest.mock('./brand/NightMoment', () => {
  const { Text } = require('react-native');
  const React = require('react');
  return {
    NightMoment: ({ visible, title }: { visible: boolean; title: string }) =>
      React.createElement(Text, { testID: 'night-moment' }, `${visible ? 'visible' : 'hidden'}: ${title}`),
  };
});
jest.mock('./designV2/waits/ColdStartSilhouette', () => {
  const { Text } = require('react-native');
  const React = require('react');
  return {
    ColdStartSilhouette: ({ hydrating, tabBarHeight }: { hydrating: boolean; tabBarHeight: number }) =>
      React.createElement(Text, { testID: 'cold-start-silhouette' }, `${hydrating ? 'hydrating' : 'done'} ${tabBarHeight}`),
  };
});
jest.mock('./nav/NyxTabBar', () => ({ TAB_HEIGHT: 83 }));
jest.mock('../store/petStore', () => {
  const state: { activePet: { id: string; name: string } | null; pets: unknown[] } = {
    activePet: { id: 'p1', name: 'Mochi' },
    pets: [],
  };
  return {
    usePetStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state, setState: (next: Partial<typeof state>) => Object.assign(state, next) },
    ),
  };
});

import { render } from '@testing-library/react-native';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';
import { ColdStartOverlay } from './ColdStartOverlay';

const petStore = usePetStore as unknown as { setState: (s: { activePet: unknown }) => void };

beforeEach(() => {
  mockUseDesignV2.mockReturnValue(false);
  petStore.setState({ activePet: { id: 'p1', name: 'Mochi' } });
  useSyncStore.setState({ coldStartHydrating: true });
});

describe('ColdStartOverlay', () => {
  it('flag-off: the night moment, named for the pet, driven by the store', () => {
    const { getByTestId, queryByTestId } = render(<ColdStartOverlay />);
    expect(getByTestId('night-moment').props.children).toBe("visible: Catching up on Mochi's history…");
    expect(queryByTestId('cold-start-silhouette')).toBeNull();
  });

  it('flag-on: Home’s silhouette with the tab bar’s one height, and no night moment', () => {
    mockUseDesignV2.mockReturnValue(true);
    const { getByTestId, queryByTestId } = render(<ColdStartOverlay />);
    expect(getByTestId('cold-start-silhouette').props.children).toBe('hydrating 83');
    expect(queryByTestId('night-moment')).toBeNull();
  });

  it.each([false, true])('flag=%s: nothing without a pet — never over onboarding', (flag) => {
    mockUseDesignV2.mockReturnValue(flag);
    petStore.setState({ activePet: null });
    expect(render(<ColdStartOverlay />).toJSON()).toBeNull();
  });
});
