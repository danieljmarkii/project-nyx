// The tick's contract (D2-7 / CUL-1068; round 4 §07): exists only for a request in
// flight, breathes on one loop, still at full opacity under reduced motion, stops on blur.
import { render } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import { theme } from '../../../constants/theme';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useAppActive } from '../../../hooks/useAppActive';
import { Tick, TICK_MOTION } from './Tick';

jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
const mockedReduced = useReducedMotion as jest.Mock;
const mockedActive = useAppActive as jest.Mock;

afterEach(() => {
  mockedReduced.mockReturnValue(false);
  mockedActive.mockReturnValue(true);
  jest.restoreAllMocks();
});

describe('Tick', () => {
  it('renders nothing while no request is in flight — a still mark is the caller’s own', () => {
    const { toJSON } = render(<Tick working={false} />);
    expect(toJSON()).toBeNull();
  });

  it('is the rail’s tick: 3 × 16, grey, hidden from assistive tech', () => {
    const { getByTestId } = render(<Tick working />);
    const node = getByTestId('design-v2-tick', { includeHiddenElements: true });
    const style = StyleSheet.flatten(node.props.style);
    expect(style.width).toBe(3);
    expect(style.height).toBe(16);
    expect(style.backgroundColor).toBe(theme.colorBorderStrong);
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(TICK_MOTION).toMatchObject({ width: 3, height: 16, breathMs: 1400 });
  });

  it('breathes on ONE loop, and the breath is 1.4s in and out', () => {
    const loop = jest.spyOn(Animated, 'loop');
    const timing = jest.spyOn(Animated, 'timing');
    render(<Tick working />);
    expect(loop).toHaveBeenCalledTimes(1);
    const durations = timing.mock.calls.map((c) => (c[1] as { duration: number }).duration);
    expect(durations).toEqual([TICK_MOTION.breathMs / 2, TICK_MOTION.breathMs / 2]);
    const troughs = timing.mock.calls.map((c) => (c[1] as { toValue: number }).toValue);
    expect(troughs).toEqual([TICK_MOTION.restOpacity, 1]);
  });

  it('reduced motion: still, at FULL opacity — never dimmed, never a shorter breath', () => {
    mockedReduced.mockReturnValue(true);
    const loop = jest.spyOn(Animated, 'loop');
    const { getByTestId } = render(<Tick working />);
    expect(loop).not.toHaveBeenCalled();
    const node = getByTestId('design-v2-tick', { includeHiddenElements: true });
    const style = StyleSheet.flatten(node.props.style);
    // The Animated.Value is pinned at 1; RTL flattens it to its current number.
    expect(Number(JSON.parse(JSON.stringify(style.opacity)))).toBe(1);
  });

  it('pauses on app blur and resumes when the app is active again', () => {
    mockedActive.mockReturnValue(false);
    const loop = jest.spyOn(Animated, 'loop');
    const { rerender } = render(<Tick working />);
    expect(loop).not.toHaveBeenCalled();
    mockedActive.mockReturnValue(true);
    rerender(<Tick working />);
    expect(loop).toHaveBeenCalledTimes(1);
  });

  it('stops the loop when the request lands', () => {
    const stop = jest.fn();
    jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop, reset: jest.fn() } as never);
    const { rerender, toJSON } = render(<Tick working />);
    rerender(<Tick working={false} />);
    expect(stop).toHaveBeenCalled();
    expect(toJSON()).toBeNull();
  });
});
