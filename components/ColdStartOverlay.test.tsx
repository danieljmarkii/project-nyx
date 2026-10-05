// The cold start's wait (D2-7 / CUL-1068; GA by CUL-1071): Home's silhouette, never without
// a pet (the overlay can never sit over onboarding, B-054 §6). The silhouette is mocked to
// a marker so what this host hands it is what is asserted.
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
  petStore.setState({ activePet: { id: 'p1', name: 'Mochi' } });
  useSyncStore.setState({ coldStartHydrating: true });
});

describe('ColdStartOverlay', () => {
  it('Home’s silhouette with the tab bar’s one height, driven by the store', () => {
    const { getByTestId } = render(<ColdStartOverlay />);
    expect(getByTestId('cold-start-silhouette').props.children).toBe('hydrating 83');
  });

  it('nothing without a pet — never over onboarding', () => {
    petStore.setState({ activePet: null });
    expect(render(<ColdStartOverlay />).toJSON()).toBeNull();
  });
});
