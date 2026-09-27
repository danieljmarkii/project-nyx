// A cut draw on the rendered rows (CUL-1375). `threadMotion.test.ts` pins the hook; this
// pins what the owner sees: a row whose draw was cut, and whose native stop then answered
// with the value it had reached, is still drawn at full opacity. Before the fix the reply
// re-rendered the row at opacity 0 and it stayed a blank, row-sized gap on Home's day and
// History's day cards.

import { act, render } from '@testing-library/react-native';
import { Animated, StyleSheet, Text } from 'react-native';
import { useAppActive } from '../../hooks/useAppActive';
import { ThreadDraw } from './ThreadDraw';
import { THREAD_DRAW } from './threadMotion';

jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

const appActive = useAppActive as jest.Mock;

const THREAD = { x: 8, dotCenterY: 10, lineW: 1, color: '#000' };
const rows = ['a', 'b', 'c'].map((key) => ({ key, node: <Text>{key}</Text> }));

/** The native side's answer to a stop (`Animation.__startAnimationIfNative`): the value it
 *  had reached, written into the JS node, and every bound view asked to re-render. */
function nativeReply(v: Animated.Value, value: number) {
  const node = v as unknown as {
    __onAnimatedValueUpdateReceived: (n: number) => void;
    __getChildren: () => { update?: () => void; __getChildren?: () => unknown[] }[];
  };
  node.__onAnimatedValueUpdateReceived(value);
  const visit = (n: { update?: () => void; __getChildren?: () => unknown[] }) => {
    n.update?.();
    for (const c of (n.__getChildren?.() ?? []) as (typeof n)[]) visit(c);
  };
  for (const c of node.__getChildren()) visit(c);
}

const opacityOf = (el: { props: { style: unknown } }) =>
  (StyleSheet.flatten(el.props.style as never) as { opacity?: number }).opacity;

describe('ThreadDraw: a cut draw', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    appActive.mockReturnValue(true);
  });
  afterEach(() => jest.useRealTimers());

  it('a blur that cuts the draw, then the stop\'s late reply: the first row is still drawn, never a blank', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const props = { rows, token: 'paint:x:d', claim: () => true, thread: THREAD, testID: 'td' };
    const { getByTestId, queryByTestId, rerender } = render(<ThreadDraw {...props} />);
    // Armed: the rows start clear.
    expect(opacityOf(getByTestId('td-row-a'))).toBe(0);
    // The first row's opacity: the one that starts at once, so the one with a native side.
    const rowA = timing.mock.calls.find(([, c]) => c.toValue === 1 && (c.delay ?? 0) === 0 && c.duration === THREAD_DRAW.rowMs)?.[0];
    expect(rowA).toBeDefined();
    timing.mockRestore();

    appActive.mockReturnValue(false);
    rerender(<ThreadDraw {...props} token={null} />);
    act(() => nativeReply(rowA as Animated.Value, 0));

    expect(opacityOf(getByTestId('td-row-a'))).toBe(1);
    expect(opacityOf(getByTestId('td-row-b'))).toBe(1);
    expect(queryByTestId('td-line')).toBeNull();
  });

  it('a card that mounts while the app is not active draws nothing and paints its rows at once', () => {
    appActive.mockReturnValue(false);
    const claim = jest.fn(() => true);
    const { getByTestId, queryByTestId } = render(
      <ThreadDraw rows={rows} token="paint:x:d" claim={claim} thread={THREAD} testID="td" />,
    );
    expect(claim).not.toHaveBeenCalled();
    expect(queryByTestId('td-line')).toBeNull();
    for (const k of ['a', 'b', 'c']) expect(opacityOf(getByTestId(`td-row-${k}`))).toBe(1);
  });
});
