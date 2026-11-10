// The cold start's wait (D2-7 / CUL-1068; GA by CUL-1071): Home's silhouette, never without
// a pet (the overlay can never sit over onboarding, B-054 §6). The silhouette is mocked to
// a marker so what this host hands it is what is asserted.
jest.mock('./surfaces/waits/ColdStartSilhouette', () => {
  const { Text } = require('react-native');
  const React = require('react');
  return {
    ColdStartSilhouette: ({ hydrating, tabBarHeight, rail, sceneGutters }: { hydrating: boolean; tabBarHeight: number; rail: unknown; sceneGutters: unknown }) =>
      React.createElement(Text, { testID: 'cold-start-silhouette', rail, sceneGutters }, `${hydrating ? 'hydrating' : 'done'} ${tabBarHeight}`),
  };
});
jest.mock('./nav/NyxTabBar', () => ({ TAB_HEIGHT: 83, RAIL_TAB_HEIGHT: 65, railFootFor: (safeBottom: number) => safeBottom + 96 }));
// The edge iOS reports for its vertical bar: null wherever its bars lie flat.
const mockBarEdge = jest.fn<'leading' | 'trailing' | null, []>(() => null);
jest.mock('expo-status-bar', () => ({ useVerticalBarEdgeIOS: () => mockBarEdge() }));
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
import { railFootFor } from './nav/NyxTabBar';
import { theme } from '../constants/theme';

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
// CUL-2703: the shape follows the bar. Where iOS stands its bars in a strip the host
// hands the silhouette that rail, on that edge, with the room for the + at its foot;
// where its bars lie flat (jest-expo's 750pt window included) there is no rail.
describe('ColdStartOverlay and the bar’s side', () => {
  afterEach(() => mockBarEdge.mockReturnValue(null));

  it('hands the silhouette no rail under a bottom bar, and the scene’s gutters', () => {
    const { getByTestId } = render(<ColdStartOverlay />);
    const silhouette = getByTestId('cold-start-silhouette');
    expect(silhouette.props.rail).toBeNull();
    expect(silhouette.props.sceneGutters.left).toBe(silhouette.props.sceneGutters.right);
    expect(silhouette.props.sceneGutters.left).toBeGreaterThan(0);
  });

  it('hands the silhouette the rail in the system strip, on its edge', () => {
    mockBarEdge.mockReturnValue('trailing');
    const { getByTestId } = render(<ColdStartOverlay />);
    expect(getByTestId('cold-start-silhouette').props.rail).toEqual({
      width: theme.layoutSystemBarMinWidth,
      edge: 'right',
      tabHeight: 65,
      foot: railFootFor(0),
    });
  });
});
