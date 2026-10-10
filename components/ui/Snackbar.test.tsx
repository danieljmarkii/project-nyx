// CUL-1691 PR 1 — the Snackbar on its daylight ground (docs/nyx-completion-card-requirements.md §1).
//
// What only a rendered Snackbar can answer: the shadow sits on an OPAQUE ground (the
// #1125 grain, keyed on shadowColor because the wrapper carries elevation and no
// ground), and the message and the action read in the light-ground inks, so moving the
// ground to white did not leave either one white on white.

// The bar's height is all the Snackbar reads from the tab bar; the bar itself pulls in
// the pet store and storage, which this suite has no use for.
jest.mock('../nav/NyxTabBar', () => ({ TAB_HEIGHT: 80 }));

import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import { Snackbar } from './Snackbar';
import { useSnackbarStore } from '../../store/snackbarStore';
import { theme } from '../../constants/theme';
import { COMPLETION_MOTION, EASE } from '../motion/completionMotion';
import { useReducedMotionStore } from '../../store/reducedMotionStore';
import { OPAQUE_HEX, shadowedGrounds } from '../../testUtils/tree';

const color = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) as { color?: string }).color;

function seed(onAction?: () => void) {
  act(() => {
    useSnackbarStore.getState().show(
      onAction
        ? { message: 'Removed from your library', actionLabel: 'Undo', onAction }
        : { message: 'Copied support@getculprit.app' },
    );
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  act(() => useSnackbarStore.getState().hide());
  useSnackbarStore.setState({ payload: null, visible: false });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Snackbar — the daylight ground (CUL-1691)', () => {
  it('renders nothing before the first show', () => {
    const view = render(<Snackbar />);
    expect(view.toJSON()).toBeNull();
  });

  it('puts its shadow on an opaque ground', () => {
    const view = render(<Snackbar />);
    seed(jest.fn());
    const grounds = shadowedGrounds(view.UNSAFE_root);
    expect(grounds.length).toBeGreaterThan(0);
    for (const g of grounds) expect(g).toMatch(OPAQUE_HEX);
    expect(grounds).toContain(theme.colorSurface);
  });

  it('reads the message and the action in the light-ground inks', () => {
    const view = render(<Snackbar />);
    seed(jest.fn());
    expect(color(view.getByText('Removed from your library') as never)).toBe(theme.colorTextPrimary);
    expect(color(view.getByText('Undo') as never)).toBe(theme.colorAccentInk);
  });

  it('shows a message with no action as a message alone', () => {
    const view = render(<Snackbar />);
    seed();
    expect(color(view.getByText('Copied support@getculprit.app') as never)).toBe(theme.colorTextPrimary);
    expect(view.queryByRole('button')).toBeNull();
  });

  it('runs the action from its button', () => {
    const onAction = jest.fn();
    const view = render(<Snackbar />);
    seed(onAction);
    fireEvent.press(view.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

// CUL-1691 PR 4 — the card's entry and exit (spec §2.3). Every expectation reads its
// number from COMPLETION_MOTION, never a literal, so a retuned constant moves both.
describe('Snackbar — the card\'s entry and exit (CUL-1691 PR 4)', () => {
  const M = COMPLETION_MOTION;
  let timing: jest.SpyInstance;
  let spring: jest.SpyInstance;

  function setReduced(reduceMotion: boolean) {
    act(() => useReducedMotionStore.setState({ reduceMotion }));
  }
  function translateYOf(view: ReturnType<typeof render>): number {
    const wrapper = view.UNSAFE_root.findAll(
      (n: { type: unknown; props: { style?: unknown } }) => typeof n.type !== 'string' && Array.isArray((StyleSheet.flatten(n.props.style as never) as { transform?: unknown })?.transform),
    )[0];
    const t = (StyleSheet.flatten(wrapper.props.style) as { transform: { translateY: unknown }[] }).transform;
    const v = t[0].translateY as { __getValue?: () => number } | number;
    return typeof v === 'number' ? v : v.__getValue!();
  }
  const configs = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => c[1] as Record<string, unknown>);

  beforeEach(() => {
    timing = jest.spyOn(Animated, 'timing');
    spring = jest.spyOn(Animated, 'spring');
  });
  afterEach(() => {
    timing.mockRestore();
    spring.mockRestore();
    act(() => useReducedMotionStore.setState({ reduceMotion: null }));
  });

  it('animates nothing on mount with nothing shown', () => {
    setReduced(false);
    render(<Snackbar />);
    expect(timing).not.toHaveBeenCalled();
    expect(spring).not.toHaveBeenCalled();
  });

  it('enters as the card does: fades in over groundInMs and rises riseFromPt on the card spring', () => {
    setReduced(false);
    const view = render(<Snackbar />);
    seed(jest.fn());
    expect(configs(timing)).toEqual([
      expect.objectContaining({ toValue: 1, duration: M.groundInMs, easing: EASE.fade, useNativeDriver: true }),
    ]);
    expect(configs(spring)).toEqual([
      expect.objectContaining({ toValue: 0, useNativeDriver: true, ...M.riseSpring }),
    ]);
    // The rise starts riseFromPt below rest.
    expect(translateYOf(view)).toBe(M.riseFromPt);
  });

  it('leaves as the card does: fades out and drifts exitDriftPt over exitMs, in cubic', () => {
    setReduced(false);
    render(<Snackbar />);
    seed(jest.fn());
    timing.mockClear();
    spring.mockClear();
    act(() => useSnackbarStore.getState().hide());
    expect(configs(timing)).toEqual([
      expect.objectContaining({ toValue: 0, duration: M.exitMs, easing: EASE.exit, useNativeDriver: true }),
      expect.objectContaining({ toValue: M.exitDriftPt, duration: M.exitMs, easing: EASE.exit, useNativeDriver: true }),
    ]);
    expect(spring).not.toHaveBeenCalled();
  });

  it('does not replay the entry when a second show lands over a visible Snackbar', () => {
    setReduced(false);
    const view = render(<Snackbar />);
    seed(jest.fn());
    timing.mockClear();
    spring.mockClear();
    act(() => useSnackbarStore.getState().show({ message: 'Copied support@getculprit.app' }));
    expect(view.getByText('Copied support@getculprit.app')).toBeTruthy();
    expect(timing).not.toHaveBeenCalled();
    expect(spring).not.toHaveBeenCalled();
  });

  it('re-enters from its first frame when shown again after an exit', () => {
    setReduced(false);
    const view = render(<Snackbar />);
    seed(jest.fn());
    // A native-driver value never moves under jest, so the exit's two timings jump to
    // their end frame: the drift is left at exitDriftPt, as a finished exit leaves it.
    const jump = (value: Animated.Value, cfg: { toValue: number }) =>
      ({ start: (cb?: Animated.EndCallback) => { value.setValue(cfg.toValue); cb?.({ finished: true }); }, stop() {}, reset() {} }) as never;
    timing.mockImplementationOnce(jump).mockImplementationOnce(jump);
    act(() => useSnackbarStore.getState().hide());
    expect(translateYOf(view)).toBe(M.riseFromPt + M.exitDriftPt);
    spring.mockClear();
    seed(jest.fn());
    expect(spring).toHaveBeenCalledTimes(1);
    expect(translateYOf(view)).toBe(M.riseFromPt);
  });

  describe('Reduce Motion', () => {
    it('crossfades in over crossfadeMs and never translates', () => {
      setReduced(true);
      const view = render(<Snackbar />);
      seed(jest.fn());
      expect(configs(timing)).toEqual([
        expect.objectContaining({ toValue: 1, duration: M.crossfadeMs, useNativeDriver: true }),
      ]);
      expect(spring).not.toHaveBeenCalled();
      expect(translateYOf(view)).toBe(0);
    });

    it('leaves on opacity alone', () => {
      setReduced(true);
      const view = render(<Snackbar />);
      seed(jest.fn());
      timing.mockClear();
      act(() => useSnackbarStore.getState().hide());
      expect(configs(timing)).toEqual([
        expect.objectContaining({ toValue: 0, duration: M.exitMs, easing: EASE.exit, useNativeDriver: true }),
      ]);
      expect(translateYOf(view)).toBe(0);
    });
  });
});
