// The cold start's exit and its handoff (D2-7 / CUL-1068).
import { act, render } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useSyncStore } from '../../../store/syncStore';
import { COLD_START_CROSSFADE_MS, COLD_START_SILHOUETTE_TEST_ID, ColdStartSilhouette } from './ColdStartSilhouette';
import { HOME_SILHOUETTE_TEST_ID } from './HomeSilhouette';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
const mockedReduced = useReducedMotion as jest.Mock;

const hidden = { includeHiddenElements: true };

beforeEach(() => {
  useSyncStore.setState({ coldStartHandoff: 0 });
  mockedReduced.mockReturnValue(false);
  jest.restoreAllMocks();
});

describe('ColdStartSilhouette', () => {
  it('while hydrating: Home’s silhouette, full-screen, blocking taps, at the safe-area top', () => {
    const { getByTestId } = render(<ColdStartSilhouette hydrating tabBarHeight={83} />);
    const overlay = getByTestId(COLD_START_SILHOUETTE_TEST_ID, hidden);
    expect(overlay.props.pointerEvents).toBe('auto');
    expect(getByTestId(HOME_SILHOUETTE_TEST_ID, hidden)).toBeTruthy();
  });

  it('never shown: renders nothing and hands nothing off', () => {
    const { toJSON, rerender } = render(<ColdStartSilhouette hydrating={false} tabBarHeight={83} />);
    expect(toJSON()).toBeNull();
    rerender(<ColdStartSilhouette hydrating={false} tabBarHeight={83} />);
    expect(useSyncStore.getState().coldStartHandoff).toBe(0);
  });

  it('hydrate → a 320ms crossfade, taps released, the handoff fired EXACTLY once', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const { rerender, getByTestId } = render(<ColdStartSilhouette hydrating tabBarHeight={83} />);
    expect(useSyncStore.getState().coldStartHandoff).toBe(0);

    rerender(<ColdStartSilhouette hydrating={false} tabBarHeight={83} />);
    expect(useSyncStore.getState().coldStartHandoff).toBe(1);
    const fade = timing.mock.calls.find((c) => (c[1] as { toValue: number }).toValue === 0);
    expect(fade).toBeTruthy();
    expect((fade![1] as { duration: number }).duration).toBe(COLD_START_CROSSFADE_MS);
    expect(COLD_START_CROSSFADE_MS).toBeLessThanOrEqual(900);
    // Still mounted for the fade, but no longer the wait.
    expect(getByTestId(COLD_START_SILHOUETTE_TEST_ID, hidden).props.pointerEvents).toBe('none');

    // A second render with the same fact is not a second handoff (C-30: re-arms on the
    // edge, never on a re-render).
    rerender(<ColdStartSilhouette hydrating={false} tabBarHeight={83} />);
    expect(useSyncStore.getState().coldStartHandoff).toBe(1);
  });

  it('reduced motion: a cut, and the handoff still fires', () => {
    mockedReduced.mockReturnValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    const { rerender, toJSON } = render(<ColdStartSilhouette hydrating tabBarHeight={83} />);
    act(() => {
      rerender(<ColdStartSilhouette hydrating={false} tabBarHeight={83} />);
    });
    expect(toJSON()).toBeNull();
    expect(timing).not.toHaveBeenCalled();
    expect(useSyncStore.getState().coldStartHandoff).toBe(1);
  });
});
