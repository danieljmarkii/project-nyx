// The cold start's wait (D2-7 / CUL-1068; GA by CUL-1071): Home's silhouette, never without
// a pet (the overlay can never sit over onboarding, B-054 §6). The silhouette is mocked to
// a marker so what this host hands it is what is asserted.
jest.mock('./surfaces/waits/ColdStartSilhouette', () => {
  const { Text } = require('react-native');
  const React = require('react');
  return {
    ColdStartSilhouette: ({ hydrating, tabBarHeight, rail }: { hydrating: boolean; tabBarHeight: number; rail: { width: number; tabHeight: number } | null }) =>
      React.createElement(Text, { testID: 'cold-start-silhouette', rail }, `${hydrating ? 'hydrating' : 'done'} ${tabBarHeight}`),
  };
});
jest.mock('./nav/NyxTabBar', () => ({ TAB_HEIGHT: 83, RAIL_TAB_HEIGHT: 65 }));
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
import { TAB_RAIL_WIDTH } from '../hooks/useLayoutClass';

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

// CUL-2267 — at regular the bar is the rail, so the host hands the shape the rail.
// jest-expo's default window is 750pt, which is regular width.
describe('ColdStartOverlay at regular width', () => {
  it('hands the silhouette the rail and the rail tab’s height', () => {
    const { getByTestId } = render(<ColdStartOverlay />);
    expect(getByTestId('cold-start-silhouette').props.rail).toEqual(
      expect.objectContaining({ width: TAB_RAIL_WIDTH, tabHeight: 65 }),
    );
  });
});
