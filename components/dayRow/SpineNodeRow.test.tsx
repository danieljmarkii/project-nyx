// Home's spine node (D2-4 / CUL-1066) — the renderer's half of the fixtures.
//
// Pinned here: a vomit node states the lane's timing, the photo GLYPH and the verdict in
// the shipped words on its own line; no image node exists in the tree for any verdict
// (the tree assertion the AC names); the read arrives on ONE node — the rail's identity
// is the same React instance before, during and after (the node-identity test); the
// trigger is the model's `pending` fact; reduced motion is a crossfade with the tick
// still; VoiceOver hears one sentence per node, a compact node carries `expanded`, and
// the arrival is announced politely; a compact node opens in place and closes.

const mockUseReducedMotion = jest.fn(() => false);
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));
const mockUseAppActive = jest.fn(() => true);
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => mockUseAppActive() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, LayoutAnimation, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { FOLD_MOTION, UNFOLD_LAYOUT } from '../motion/foldMotion';
import { TICK_BREATH } from '../motion/arrivalMotion';
import type { NodeRead, SpineCompactNode, SpineEventNode } from '../../lib/spineNode';
import {
  PHOTOGRAPHED_LABEL,
  SPINE_READ_PENDING_LABEL,
  SPINE_TICK_HEIGHT,
  SpineCompactRow,
  SpineEventRow,
} from './SpineNodeRow';

const FRAME_MS = 20;

function vomit(read: NodeRead, over: Partial<SpineEventNode> = {}): SpineEventNode {
  return {
    kind: 'event',
    id: 'v2',
    category: 'symptom',
    eventType: 'vomit',
    title: 'Vomit',
    detail: null,
    food: null,
    formatTag: null,
    time: '5:11 PM',
    timeMs: 0,
    photo: true,
    timing: '4 min after eating',
    read,
    ...over,
  };
}

const landed = (
  verdict: 'worth_a_call' | 'monitor' | 'not_enough_to_say',
  readText: string | null = 'Second one today, minutes after eating both times. One photo can raise a flag; it can’t clear one.',
): NodeRead => ({
  state: 'landed',
  verdict,
  label: verdict === 'worth_a_call' ? 'Worth a call' : verdict === 'monitor' ? 'Keep an eye out' : 'Not enough to say yet',
  tone: verdict === 'worth_a_call' ? 'attn' : verdict === 'monitor' ? 'quiet' : 'muted',
  readText,
});

const meal = (id: string, time: string): SpineEventNode => ({
  kind: 'event',
  id,
  category: 'meal',
  eventType: 'meal',
  title: 'Meal',
  detail: 'Royal Canin · Selected Protein PR',
  food: 'Royal Canin · Selected Protein PR',
  formatTag: null,
  time,
  timeMs: 0,
  photo: false,
  timing: null,
  read: { state: 'none' },
});

const compact: SpineCompactNode = {
  kind: 'compact',
  id: 'compact:m3',
  ids: ['m3', 'm4', 'm5'],
  count: 3,
  title: '3 meals',
  detail: 'Royal Canin · Selected Protein PR',
  timeRange: '12:41 – 5:07 PM',
  timeMs: 0,
  rows: [meal('m3', '12:41 PM'), meal('m4', '3:02 PM'), meal('m5', '5:07 PM')],
};

/** Every element type in the rendered tree. */
function typesIn(tree: unknown, out: Set<string> = new Set()): Set<string> {
  if (tree === null || typeof tree !== 'object') return out;
  if (Array.isArray(tree)) {
    for (const t of tree) typesIn(t, out);
    return out;
  }
  const node = tree as { type?: string; children?: unknown };
  if (typeof node.type === 'string') out.add(node.type);
  typesIn(node.children, out);
  return out;
}

let configureNext: jest.SpyInstance;
let announce: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  mockUseReducedMotion.mockReturnValue(false);
  mockUseAppActive.mockReturnValue(true);
  configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => {
  configureNext.mockRestore();
  announce.mockRestore();
  jest.useRealTimers();
});

const layout = (node: ReturnType<typeof render>['root'], height: number) =>
  fireEvent(node, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height } } });

describe('a vomit node — words, glyph, verdict; never a picture', () => {
  it('states the timing from the lane, the photo glyph, and the verdict on its own line in the shipped words', () => {
    const t = render(<SpineEventRow node={vomit(landed('monitor'))} isFirst isLast onOpen={jest.fn()} />);
    expect(t.getByText('Vomit', { exact: false })).toBeTruthy();
    expect(t.getByText(/4 min after eating/)).toBeTruthy();
    expect(t.getByTestId('spine-photo-v2', { includeHiddenElements: true })).toBeTruthy();
    expect(t.getByTestId('spine-verdict-v2').props.children).toBe('Keep an eye out');
  });

  it.each(['worth_a_call', 'monitor', 'not_enough_to_say'] as const)(
    'no Image node exists in the tree for a %s read (R4-2 option A)',
    (verdict) => {
      const t = render(<SpineEventRow node={vomit(landed(verdict))} isFirst isLast onOpen={jest.fn()} />);
      const types = typesIn(t.toJSON());
      expect(types.has('Image')).toBe(false);
      expect(types.has('RCTImageView')).toBe(false);
      // Non-vacuous: the tree did render something.
      expect(types.size).toBeGreaterThan(2);
    },
  );

  it('a worth-a-call line takes the rose INK, a monitor line the secondary ink (C-1)', () => {
    const attn = render(<SpineEventRow node={vomit(landed('worth_a_call'))} isFirst isLast onOpen={jest.fn()} />);
    const quiet = render(<SpineEventRow node={vomit(landed('monitor'))} isFirst isLast onOpen={jest.fn()} />);
    const colorOf = (t: typeof attn) => {
      return (StyleSheet.flatten(t.getByTestId('spine-verdict-v2').props.style) as { color?: string }).color;
    };
    expect(colorOf(attn)).toBe(theme.colorEventSymptomInk);
    expect(colorOf(quiet)).toBe(theme.colorTextSecondary);
    expect(colorOf(attn)).not.toBe(theme.colorEventSymptom);
  });

  it('a read that was already in the record renders its verdict line and NOT its sentence, and never arrives', () => {
    const t = render(<SpineEventRow node={vomit(landed('monitor'))} isFirst isLast onOpen={jest.fn()} />);
    expect(t.queryByText(/One photo can raise a flag/)).toBeNull();
    expect(configureNext).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it('VoiceOver: the node is ONE sentence — type, timing, photographed, time, verdict', () => {
    const t = render(<SpineEventRow node={vomit(landed('worth_a_call'))} isFirst isLast onOpen={jest.fn()} />);
    expect(t.getByTestId('spine-node-v2').props.accessibilityLabel).toBe(
      `Vomit, 4 min after eating, ${PHOTOGRAPHED_LABEL}, 5:11 PM. Worth a call. Opens details`,
    );
  });

  it('opens the record on press', () => {
    const onOpen = jest.fn();
    const t = render(<SpineEventRow node={vomit({ state: 'none' })} isFirst isLast onOpen={onOpen} />);
    fireEvent.press(t.getByTestId('spine-node-v2'));
    expect(onOpen).toHaveBeenCalledWith('v2');
  });
});

describe('the read arrives on ONE node', () => {
  function arrive(opts: { reduced?: boolean } = {}) {
    mockUseReducedMotion.mockReturnValue(!!opts.reduced);
    const t = render(<SpineEventRow node={vomit({ state: 'pending' })} isFirst isLast onOpen={jest.fn()} />);
    const railBefore = t.getByTestId('spine-read-rail-v2');
    // The waiting line measured (the tick's box), as the real row reports it.
    act(() => layout(t.getByTestId('spine-read-v2').children[1] as never, 20));
    act(() => {
      t.rerender(<SpineEventRow node={vomit(landed('monitor'))} isFirst isLast onOpen={jest.fn()} />);
    });
    const railDuring = t.getByTestId('spine-read-rail-v2');
    // The landed words measured — arms the rail beat.
    act(() => layout(t.getByTestId('spine-read-v2').children[1] as never, 64));
    return { t, railBefore, railDuring };
  }

  it('the tick IS the rail: the same React instance before, during and after (the node-identity test)', () => {
    const { t, railBefore, railDuring } = arrive();
    expect(railDuring).toBe(railBefore);
    // During beat 1 the rail is out of flow with an explicit height and a native transform.
    const during = t.getByTestId('spine-read-rail-v2');
    const styleDuring = StyleSheet.flatten(during.props.style) as Record<string, unknown>;
    expect(styleDuring.position).toBe('absolute');
    expect(styleDuring.height).toBe(64);
    // Let every beat finish: the rail lead, the 80ms lag, the open, the settle slack.
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.railLagMs + FOLD_MOTION.openMs + FOLD_MOTION.settleSlackMs * 3 + FRAME_MS * 4);
    });
    const after = t.getByTestId('spine-read-rail-v2');
    expect(after).toBe(railBefore);
    const styleAfter = StyleSheet.flatten(after.props.style) as Record<string, unknown>;
    expect(styleAfter.position).toBeUndefined();
    expect(styleAfter.alignSelf).toBe('stretch');
  });

  it('the slot opens on the fold’s layout config 80ms behind the rail, and the sentence lands', () => {
    const { t } = arrive();
    expect(configureNext).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.railLagMs + 1);
    });
    expect(configureNext).toHaveBeenCalledWith(UNFOLD_LAYOUT);
    expect(t.getByText(/One photo can raise a flag/)).toBeTruthy();
    expect(t.getByTestId('spine-verdict-v2').props.children).toBe('Keep an eye out');
  });

  it('the arrival is announced politely, once, in the verdict’s words', () => {
    arrive();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Keep an eye out');
  });

  it('the trigger is the FACT: a landed read replacing nothing (no pending) never arrives', () => {
    const t = render(<SpineEventRow node={vomit({ state: 'none' })} isFirst isLast onOpen={jest.fn()} />);
    act(() => {
      t.rerender(<SpineEventRow node={vomit(landed('monitor'))} isFirst isLast onOpen={jest.fn()} />);
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(configureNext).not.toHaveBeenCalled();
    expect(t.queryByText(/One photo can raise a flag/)).toBeNull();
  });

  it('reduced motion: the arrival is instant — no layout keyframe, no translate — and the tick was still', () => {
    const t = render(<SpineEventRow node={vomit({ state: 'pending' })} isFirst isLast onOpen={jest.fn()} />);
    mockUseReducedMotion.mockReturnValue(true);
    act(() => {
      t.rerender(<SpineEventRow node={vomit({ state: 'pending' })} isFirst isLast onOpen={jest.fn()} />);
    });
    // Still: the breath is not bound, so the tick's style carries no Animated opacity.
    const tick = t.getByTestId('spine-read-rail-v2');
    const tickStyle = StyleSheet.flatten(tick.props.style) as Record<string, unknown>;
    expect(tickStyle.opacity).toBeUndefined();
    expect(tickStyle.height).toBe(SPINE_TICK_HEIGHT);
    act(() => {
      t.rerender(<SpineEventRow node={vomit(landed('monitor'))} isFirst isLast onOpen={jest.fn()} />);
    });
    act(() => {
      jest.advanceTimersByTime(theme.durationFast + FOLD_MOTION.settleSlackMs * 3);
    });
    expect(configureNext).not.toHaveBeenCalled();
    expect(t.getByTestId('spine-verdict-v2')).toBeTruthy();
    expect(t.getByText(/One photo can raise a flag/)).toBeTruthy();
  });

  it('while waiting, the tick breathes on the native driver at the carve-out’s cycle', () => {
    const loop = jest.spyOn(Animated, 'loop');
    const timing = jest.spyOn(Animated, 'timing');
    render(<SpineEventRow node={vomit({ state: 'pending' })} isFirst isLast onOpen={jest.fn()} />);
    expect(loop).toHaveBeenCalledTimes(1);
    const breaths = timing.mock.calls.filter((c) => (c[1] as { duration?: number }).duration === TICK_BREATH.cycleMs / 2);
    expect(breaths.length).toBe(2);
    for (const c of breaths) expect((c[1] as { useNativeDriver?: boolean }).useNativeDriver).toBe(true);
    loop.mockRestore();
    timing.mockRestore();
  });

  it('the waiting line says what it is waiting on (Principle 9: name the request)', () => {
    const t = render(<SpineEventRow node={vomit({ state: 'pending' })} isFirst isLast onOpen={jest.fn()} />);
    expect(t.getByText(SPINE_READ_PENDING_LABEL)).toBeTruthy();
  });
});

describe('a compact node opens in place', () => {
  function Host({ expanded, onToggle }: { expanded: boolean; onToggle: (id: string) => void }) {
    return (
      <SpineCompactRow node={compact} isFirst isLast expanded={expanded} onToggle={onToggle} onOpen={jest.fn()} />
    );
  }

  it('closed: one line — the count, the food, the range — and `expanded: false`', () => {
    const t = render(<Host expanded={false} onToggle={jest.fn()} />);
    expect(t.getByText('3 meals', { exact: false })).toBeTruthy();
    // The range as DRAWN, compared raw — the default normalizer folds a no-break space
    // into a space and would pass the unshaped string too. It breaks only after its
    // dash (History v2 AC 19; the frame's `timeColumnText`), and the spoken label keeps
    // the plain string.
    expect(t.getByText('12:41\u00A0– 5:07\u00A0PM', { normalizer: (s: string) => s })).toBeTruthy();
    expect(t.getByTestId('spine-node-compact:m3').props.accessibilityLabel).toContain('12:41 – 5:07 PM');
    expect(t.getByTestId('spine-node-compact:m3').props.accessibilityState).toEqual({ expanded: false });
    expect(t.queryByTestId('spine-members-compact:m3')).toBeNull();
  });

  it('a tap asks the host to open it on the fold’s layout config; open, its rows are each a door', () => {
    const onToggle = jest.fn();
    const t = render(<Host expanded={false} onToggle={onToggle} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m3'));
    expect(onToggle).toHaveBeenCalledWith('compact:m3');
    expect(configureNext).toHaveBeenCalledWith(UNFOLD_LAYOUT);
    t.rerender(<Host expanded onToggle={onToggle} />);
    expect(t.getByTestId('spine-node-compact:m3').props.accessibilityState).toEqual({ expanded: true });
    expect(t.getByTestId('spine-members-compact:m3')).toBeTruthy();
    expect(t.getByTestId('spine-node-m4').props.accessibilityLabel).toBe(
      'Meal, Royal Canin · Selected Protein PR, 3:02 PM. Opens details',
    );
  });

  it('reduced motion: opening configures no layout keyframe', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const t = render(<Host expanded={false} onToggle={jest.fn()} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m3'));
    expect(configureNext).not.toHaveBeenCalled();
  });
});
