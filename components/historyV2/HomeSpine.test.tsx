// CUL-1757, on a real host: Home's spine holds the open state by node id and draws its rows
// through `ThreadDraw`, so both halves are pinned where they happen. (1) A run re-keyed under
// the owner (an earlier meal logged into it, its first meal deleted) stays open, at rest,
// with no commit at all; before the fix its row mounted under the new key closed. (2) A tap
// while the day's thread is drawing waits for the draw to settle, and only then makes the
// run's configured commit; before the fix that commit landed on the draw's in-flight rows.

const mockUseReducedMotion = jest.fn(() => false);
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => mockUseReducedMotion() }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { act, fireEvent, render } from '@testing-library/react-native';
import { LayoutAnimation, StyleSheet } from 'react-native';
import type { SpineCompactNode, SpineEventNode } from '../../lib/spineNode';
import { RUN_MOTION, RUN_OPEN_LAYOUT, runLandStarts, runOpenIdleMs } from '../motion/runOpenMotion';
import { FOLD_MOTION } from '../motion/foldMotion';
import { threadDrawTotalMs } from '../motion/threadMotion';
import { HomeSpine } from './HomeSpine';

const meal = (id: string, time: string): SpineEventNode => ({
  kind: 'event',
  id,
  category: 'meal',
  eventType: 'meal',
  title: 'Meal',
  detail: 'Royal Canin · Selected Protein PR',
  food: 'Royal Canin · Selected Protein PR',
  formatTag: 'DRY',
  intake: null,
  dose: null,
  carries: null,
  time,
  timeTag: null,
  timeMs: 0,
  photo: false,
  timing: null,
  read: { state: 'none' },
});

/** A run as `lib/spineNode.ts` keys it: by its first member. */
function run(rows: SpineEventNode[]): SpineCompactNode {
  return {
    kind: 'compact',
    id: `compact:${rows[0].id}`,
    ids: rows.map((r) => r.id),
    count: rows.length,
    title: `${rows.length} meals`,
    detail: 'Royal Canin · Selected Protein PR',
    formats: 'all dry',
    timeRange: `${rows[0].time} – ${rows[rows.length - 1].time}`,
    timeMs: 0,
    rows,
  };
}

const M0 = meal('m0', '7:15 AM');
const M1 = meal('m1', '8:40 AM');
const M2 = meal('m2', '9:05 AM');
const EARLIER = meal('m-early', '6:02 AM');
const NO_DRAW = { drawToken: null, claimDraw: () => true };

let configureNext: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  mockUseReducedMotion.mockReturnValue(false);
  configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
});
afterEach(() => {
  configureNext.mockRestore();
  jest.useRealTimers();
});

const advance = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });
const heightOf = (el: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(el.props.style as never) as { height?: number }).height;

/** Opens the run by its header and lets the open reach rest. */
function openToRest(t: ReturnType<typeof render>, id: string, n: number) {
  fireEvent.press(t.getByTestId(`spine-node-${id}`));
  advance(RUN_MOTION.mountFrameMs + Math.ceil(runOpenIdleMs(runLandStarts(n))) + 1);
  expect(t.getByTestId(`spine-members-${id}`)).toBeTruthy();
  configureNext.mockClear();
}

describe('a re-keyed run stays open (CUL-1757)', () => {
  it.each([
    ['an earlier meal is logged into it', [EARLIER, M0, M1, M2], 'compact:m-early'],
    ['its first meal is deleted', [M1, M2], 'compact:m1'],
  ])('%s: the run under its new id is open at rest, with no commit and no motion', (_case, after, nextId) => {
    const t = render(<HomeSpine nodes={[run([M0, M1, M2])]} {...NO_DRAW} />);
    openToRest(t, 'compact:m0', 3);

    t.rerender(<HomeSpine nodes={[run(after)]} {...NO_DRAW} />);
    const header = t.getByTestId(`spine-node-${nextId}`);
    expect(header.props.accessibilityState).toEqual({ expanded: true });
    // Open at rest on the very first frame: not a shut box about to open again.
    const box = t.getByTestId(`spine-members-${nextId}`);
    expect(heightOf(box)).toBeUndefined();
    for (const m of after) expect(t.getByTestId(`spine-node-${m.id}`)).toBeTruthy();
    advance(1000);
    expect(t.getByTestId(`spine-members-${nextId}`)).toBeTruthy();
    expect(configureNext).not.toHaveBeenCalled();
  });

  it('a run that dissolves leaves nothing open, and a later run under the old id is not opened by it', () => {
    const t = render(<HomeSpine nodes={[run([M0, M1])]} {...NO_DRAW} />);
    openToRest(t, 'compact:m0', 2);
    // Its second meal deleted: m0 stands alone, no run.
    t.rerender(<HomeSpine nodes={[M0]} {...NO_DRAW} />);
    expect(t.queryByTestId('spine-members-compact:m0')).toBeNull();
  });
});

describe('a tap during the first paint waits for the thread (CUL-1757)', () => {
  it('the run\'s configured commit lands only once the draw has settled; nothing moves the flow before it', () => {
    const nodes = [run([M0, M1]), M2];
    const t = render(<HomeSpine nodes={nodes} drawToken="paint:pet:today" claimDraw={() => true} />);
    // The thread is drawing. The owner taps the run.
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    advance(RUN_MOTION.mountFrameMs * 3);
    expect(configureNext).not.toHaveBeenCalled();
    expect(t.queryByTestId('spine-members-compact:m0')).toBeNull();
    // The draw ends at its own length (the valve bounds it); then the open runs as asked.
    advance(threadDrawTotalMs(nodes.length) + FOLD_MOTION.settleSlackMs * 2);
    advance(RUN_MOTION.mountFrameMs);
    expect(configureNext).toHaveBeenCalledTimes(1);
    expect(configureNext).toHaveBeenLastCalledWith(RUN_OPEN_LAYOUT);
    expect(t.getByTestId('spine-members-compact:m0')).toBeTruthy();
  });

  it('with no draw, the tap opens at once (the hold never delays an ordinary open)', () => {
    const t = render(<HomeSpine nodes={[run([M0, M1])]} {...NO_DRAW} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    expect(t.getByTestId('spine-members-compact:m0')).toBeTruthy();
    advance(RUN_MOTION.mountFrameMs);
    expect(configureNext).toHaveBeenCalledTimes(1);
  });
});
