// The flight's root host (D2-6 · CUL-1069): nothing when idle; while a flight is up, the
// card's element at the source's width, hidden from touch and from assistive tech, on
// the three native-driver values.

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));

import { act, render } from '@testing-library/react-native';
import { Animated, StyleSheet, Text } from 'react-native';
import { FlightHost } from './FlightHost';
import { abortFlight, landFlight, setHeroReady, settleOutbound, stageFlight } from './flightMotion';

const SOURCE = { x: 67, y: 300, width: 278, height: 130 };
const TARGET = { x: 16, y: 180, width: 361, height: 168.8 };

beforeEach(() => abortFlight());
afterEach(() => abortFlight());

describe('FlightHost', () => {
  it('idle: renders nothing', () => {
    const view = render(<FlightHost />);
    expect(view.toJSON()).toBeNull();
  });

  it('staged: the layer is absolute, inert to touch, hidden from assistive tech; the clone is the element at the source’s width', () => {
    const view = render(<FlightHost />);
    // geist-ok: a test fixture's marker text, never owner-facing
    act(() => stageFlight({ identity: 'k', title: 't', source: SOURCE, element: <Text testID="clone-payload">chart</Text> }));
    // Hidden from assistive tech, so hidden from RTL's default query too — the query's own
    // behaviour is half the proof (C-30's shape).
    expect(view.queryByTestId('flight-host')).toBeNull();
    const host = view.getByTestId('flight-host', { includeHiddenElements: true });
    expect(host.props.pointerEvents).toBe('none');
    expect(host.props.accessibilityElementsHidden).toBe(true);
    expect(host.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(StyleSheet.flatten(host.props.style)).toMatchObject(StyleSheet.flatten(StyleSheet.absoluteFill));
    const clone = view.getByTestId('flight-clone', { includeHiddenElements: true });
    const style = StyleSheet.flatten(clone.props.style);
    expect(style.width).toBe(SOURCE.width);
    expect(style.position).toBe('absolute');
    expect(style.transformOrigin).toBe('top left');
    const transform = style.transform as Array<Record<string, Animated.Value>>;
    expect(transform.map((t) => Object.keys(t)[0])).toEqual(['translateX', 'translateY', 'scale']);
    expect(view.getByTestId('clone-payload', { includeHiddenElements: true })).toBeTruthy();
  });

  it('the clone leaves with the release and returns nothing', () => {
    const view = render(<FlightHost />);
    act(() => stageFlight({ identity: 'k', title: 't', source: SOURCE, element: <Text>chart</Text> })); // geist-ok: fixture
    act(() => landFlight('k', TARGET));
    act(() => {
      settleOutbound();
      setHeroReady('k', true);
    });
    expect(view.toJSON()).toBeNull();
  });
});
