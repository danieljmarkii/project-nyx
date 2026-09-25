// The day's row (History v2, HV-6 / CUL-1163; spec §3.6) — the renderer's half.
//
// Pinned here: rule D (a run carries a chevron, a single row none); the chips in the
// shipped vocabularies and their inks (C-1); the dose row and the meal's "with"; the time
// tag; the read's states as drawn (the rose word in the rose INK, the grey *Photo not read*,
// the tick, NOTHING for a calm read); no image node for any state; the read arriving on ONE
// node (the rail's identity before, during and after), the trigger being the model's fact,
// reduced motion, the breath; AC 24's resting half (an arrival ends in exactly the row a
// fresh render of that state draws); VoiceOver hearing the whole row as one sentence in
// reading order (C-8); and open in place, the static half (AC 17: every member of a run of
// 2, 5, 9 and 12 drawn as a full row, nothing capped or clipped).

const mockUseReducedMotion = jest.fn(() => false);
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));
const mockUseAppActive = jest.fn(() => true);
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => mockUseAppActive() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, LayoutAnimation, StyleSheet } from 'react-native';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { FOLD_MOTION, UNFOLD_LAYOUT } from '../motion/foldMotion';
import { TICK_BREATH } from '../motion/arrivalMotion';
import type { NodeRead, SpineCompactNode, SpineDose, SpineEventNode } from '../../lib/spineNode';
import {
  PHOTOGRAPHED_LABEL,
  PHOTO_NOT_READ_LABEL,
  SPINE_READ_PENDING_LABEL,
  SPINE_TICK_HEIGHT,
  SpineCompactRow,
  SpineEventRow,
  THREAD_X,
  eventRowLabel,
} from './SpineNodeRow';
import { RAIL_W, TIME_W } from '../recap/DaySpine';

const FRAME_MS = 20;
const ROSE: NodeRead = { state: 'worth_a_call', label: 'Worth a call' };

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
    intake: null,
    dose: null,
    carries: null,
    time: '5:11 PM',
    timeTag: null,
    timeMs: 0,
    photo: true,
    timing: '4 min after eating',
    read,
    ...over,
  };
}

const meal = (id: string, time: string, over: Partial<SpineEventNode> = {}): SpineEventNode => ({
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
  ...over,
});

const dose = (d: Partial<SpineDose>, over: Partial<SpineEventNode> = {}): SpineEventNode => ({
  kind: 'event',
  id: 'd1',
  category: 'medication',
  eventType: 'medication',
  title: 'Prednisone',
  detail: d.vehicle ?? null,
  food: null,
  formatTag: null,
  intake: null,
  dose: { adherence: null, inDoubt: false, vehicle: null, vehicleIntake: null, ...d },
  carries: null,
  time: '1:00 PM',
  timeTag: null,
  timeMs: 0,
  photo: false,
  timing: null,
  read: { state: 'none' },
  ...over,
});

const TIMES = ['6:02 AM', '7:15 AM', '8:40 AM', '9:05 AM', '10:30 AM', '11:12 AM', '12:41 PM', '1:30 PM', '3:02 PM', '4:20 PM', '5:07 PM', '6:45 PM'];

function run(n: number): SpineCompactNode {
  const rows = TIMES.slice(0, n).map((t, i) => meal(`m${i}`, t, { intake: i % 2 === 0 ? 'all' : null }));
  return {
    kind: 'compact',
    id: `compact:${rows[0].id}`,
    ids: rows.map((r) => r.id),
    count: n,
    title: `${n} meals`,
    detail: 'Royal Canin · Selected Protein PR',
    formats: 'all dry',
    timeRange: `${TIMES[0]} – ${TIMES[n - 1]}`,
    timeMs: 0,
    rows,
  };
}

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

const styleOf = (el: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(el.props.style as never) ?? {}) as Record<string, unknown>;

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

// ── Rule D and the doors ──────────────────────────────────────────────────────

describe('rule D — every row is a door, and only a run carries a chevron', () => {
  it('a single row draws no chevron of any direction, and opens its record', () => {
    const onOpen = jest.fn();
    const t = render(<SpineEventRow node={meal('m1', '8:00 AM')} isFirst isLast onOpen={onOpen} />);
    for (const icon of [ChevronRight, ChevronDown, ChevronUp]) expect(t.UNSAFE_queryAllByType(icon)).toHaveLength(0);
    fireEvent.press(t.getByTestId('spine-node-m1'));
    expect(onOpen).toHaveBeenCalledWith('m1');
  });

  it('a run draws one chevron that points the way it opens: down closed, up open', () => {
    const closed = render(<SpineCompactRow node={run(3)} isFirst isLast expanded={false} onToggle={jest.fn()} onOpen={jest.fn()} />);
    expect(closed.UNSAFE_queryAllByType(ChevronDown)).toHaveLength(1);
    expect(closed.UNSAFE_queryAllByType(ChevronRight)).toHaveLength(0);
    const open = render(<SpineCompactRow node={run(3)} isFirst isLast expanded onToggle={jest.fn()} onOpen={jest.fn()} />);
    expect(open.UNSAFE_queryAllByType(ChevronUp)).toHaveLength(1);
    // The opened members are single rows: they carry none.
    expect(open.UNSAFE_queryAllByType(ChevronDown)).toHaveLength(0);
    expect(open.UNSAFE_queryAllByType(ChevronRight)).toHaveLength(0);
  });
});

// ── The chips ─────────────────────────────────────────────────────────────────

describe('the chips — the shipped words, three inks, text in the INK (C-1)', () => {
  const inkOf = (t: ReturnType<typeof render>, id: string) => {
    const chip = t.getByTestId(`spine-chip-${id}`);
    const text = chip.children[0] as never as { props: { style?: unknown; children?: unknown } };
    return { color: styleOf(text).color, ground: styleOf(chip).backgroundColor, label: text.props.children };
  };

  it.each([
    ['all', 'All', theme.colorAccentInk, theme.colorAccentLight],
    ['most', 'Most', theme.colorAccentInk, theme.colorAccentLight],
    ['some', 'Some', theme.colorTextSecondary, theme.colorSurfaceSubtle],
    // *Picked at* on the row (spec §3.6), where the log sheet's chip says *Picked*.
    ['picked', 'Picked at', theme.colorEventSymptomInk, theme.colorEventSymptomLight],
    ['refused', 'Refused', theme.colorEventSymptomInk, theme.colorEventSymptomLight],
  ])('a meal rated %s draws "%s": All and Most teal, Some grey, Picked at and Refused rose', (intake, label, ink, ground) => {
    const t = render(<SpineEventRow node={meal('m1', '8:00 AM', { intake })} isFirst isLast onOpen={jest.fn()} />);
    expect(inkOf(t, 'm1')).toEqual({ color: ink, ground, label });
  });

  it('the format tag is a step lighter than the grey chip beside it, so "DRY SOME" is two facts', () => {
    // The HV-6 PM pass: one ink for the food's fact and the owner's rating read as one phrase.
    const t = render(<SpineEventRow node={meal('m1', '8:00 AM', { intake: 'some', formatTag: 'DRY' })} isFirst isLast onOpen={jest.fn()} />);
    const tag = styleOf(t.getByText('DRY')).color;
    expect(tag).toBe(theme.colorTextTertiary);
    expect(tag).not.toBe(inkOf(t, 'm1').color);
  });

  it('an unrated meal draws no chip, and no rating is ever inferred', () => {
    const t = render(<SpineEventRow node={meal('m1', '8:00 AM')} isFirst isLast onOpen={jest.fn()} />);
    expect(t.queryByTestId('spine-chip-m1')).toBeNull();
  });

  it.each([
    ['given', 'Given', theme.colorAccentInk],
    ['partial', 'Partial', theme.colorEventSymptomInk],
    ['missed', 'Missed', theme.colorEventSymptomInk],
    ['refused', 'Refused', theme.colorEventSymptomInk],
  ] as const)('a dose %s draws the shipped "%s" chip, named or not (GAP-2)', (adherence, label, ink) => {
    for (const title of ['Prednisone', 'Medication']) {
      const t = render(<SpineEventRow node={dose({ adherence }, { title })} isFirst isLast onOpen={jest.fn()} />);
      expect(inkOf(t, 'd1')).toMatchObject({ color: ink, label });
    }
  });

  it('a dose in doubt draws "Unconfirmed" in the rose; any other unrated dose draws nothing', () => {
    const doubt = render(<SpineEventRow node={dose({ inDoubt: true })} isFirst isLast onOpen={jest.fn()} />);
    expect(inkOf(doubt, 'd1')).toMatchObject({ color: theme.colorEventSymptomInk, label: 'Unconfirmed' });
    const plain = render(<SpineEventRow node={dose({})} isFirst isLast onOpen={jest.fn()} />);
    expect(plain.queryByTestId('spine-chip-d1')).toBeNull();
  });

  it('no chip is a control: the row is the one door (no touchable inside it but the row)', () => {
    const t = render(<SpineEventRow node={dose({ adherence: 'refused' })} isFirst isLast onOpen={jest.fn()} />);
    const chip = t.getByTestId('spine-chip-d1');
    expect(chip.props.onPress).toBeUndefined();
    expect(chip.props.accessibilityRole).toBeUndefined();
  });
});

// ── The dose row and the meal's "with" ─────────────────────────────────────────

describe('both halves inline (rule E): the dose names its meal, the meal names its dose', () => {
  const inTheMeal = dose({
    adherence: 'partial',
    vehicle: 'in the 1:00 PM meal',
    vehicleIntake: { phrase: 'picked at', tone: 'attn' },
  });

  it('"Prednisone · in the 1:00 PM meal · picked at", the intake in the meal chip’s rose ink, then the Partial chip', () => {
    const t = render(<SpineEventRow node={inTheMeal} isFirst isLast onOpen={jest.fn()} />);
    expect(t.getByText(/in the 1:00 PM meal/)).toBeTruthy();
    const phrase = t.getByText(/· picked at/);
    expect(styleOf(phrase).color).toBe(theme.colorEventSymptomInk);
    expect(t.getByTestId('spine-chip-d1')).toBeTruthy();
  });

  it('the meal says "with Prednisone" on its second line', () => {
    const t = render(<SpineEventRow node={meal('lunch', '1:00 PM', { carries: 'with Prednisone', intake: 'picked' })} isFirst isLast onOpen={jest.fn()} />);
    expect(t.getByTestId('spine-carries-lunch').props.children).toBe('with Prednisone');
  });
});

// ── The read, as drawn ────────────────────────────────────────────────────────

describe('the read on a row: the rose, the grey mark, the tick, nothing for calm', () => {
  it('the rose: "Worth a call" in the rose INK, never the bright rose (C-1)', () => {
    const t = render(<SpineEventRow node={vomit(ROSE)} isFirst isLast onOpen={jest.fn()} />);
    const word = t.getByTestId('spine-verdict-v2');
    expect(word.props.children).toBe('Worth a call');
    expect(styleOf(word).color).toBe(theme.colorEventSymptomInk);
    expect(styleOf(word).color).not.toBe(theme.colorEventSymptom);
  });

  it('unread: a grey "Photo not read", never rose, and no rail', () => {
    const t = render(<SpineEventRow node={vomit({ state: 'unread' })} isFirst isLast onOpen={jest.fn()} />);
    const text = t.getByText(PHOTO_NOT_READ_LABEL);
    expect(styleOf(text).color).toBe(theme.colorTextSecondary);
    expect(t.queryByTestId('spine-verdict-v2')).toBeNull();
    expect(t.queryByTestId('spine-read-rail-v2')).toBeNull();
  });

  it('calm: NOTHING — no word, no slot, no mark (a calm read is never a word on a list)', () => {
    const t = render(<SpineEventRow node={vomit({ state: 'calm' })} isFirst isLast onOpen={jest.fn()} />);
    for (const id of ['spine-read-v2', 'spine-verdict-v2', 'spine-unread-v2']) expect(t.queryByTestId(id)).toBeNull();
    expect(t.queryByText(/keep an eye out|not enough to say|looks fine/i)).toBeNull();
  });

  it.each([ROSE, { state: 'calm' as const }, { state: 'unread' as const }, { state: 'pending' as const }])(
    'no Image node exists in the tree for a %p read (R4-2 option A)',
    (read) => {
      const types = typesIn(render(<SpineEventRow node={vomit(read)} isFirst isLast onOpen={jest.fn()} />).toJSON());
      expect(types.has('Image')).toBe(false);
      expect(types.has('RCTImageView')).toBe(false);
      expect(types.size).toBeGreaterThan(2);
    },
  );

  it('states the timing from the lane and the photo glyph', () => {
    const t = render(<SpineEventRow node={vomit(ROSE)} isFirst isLast onOpen={jest.fn()} />);
    expect(t.getByText(/4 min after eating/)).toBeTruthy();
    expect(t.getByTestId('spine-photo-v2', { includeHiddenElements: true })).toBeTruthy();
  });
});

// ── VoiceOver: the whole row, in reading order (C-8) ─────────────────────────

describe('VoiceOver hears each row as one sentence, in reading order', () => {
  it('a vomit: type, timing, photographed, time, then the rose', () => {
    const t = render(<SpineEventRow node={vomit(ROSE)} isFirst isLast onOpen={jest.fn()} />);
    expect(t.getByTestId('spine-node-v2').props.accessibilityLabel).toBe(
      `Vomit, 4 min after eating, ${PHOTOGRAPHED_LABEL}, 5:11 PM. Worth a call. Opens details`,
    );
  });

  it('an unread one says so; a calm one says nothing about its read', () => {
    expect(eventRowLabel(vomit({ state: 'unread' }))).toBe(
      `Vomit, 4 min after eating, ${PHOTOGRAPHED_LABEL}, 5:11 PM. ${PHOTO_NOT_READ_LABEL}. Opens details`,
    );
    expect(eventRowLabel(vomit({ state: 'calm' }))).toBe(`Vomit, 4 min after eating, ${PHOTOGRAPHED_LABEL}, 5:11 PM. Opens details`);
  });

  it('a meal: its food, its format, its intake, what it carried, its time and its tag', () => {
    expect(
      eventRowLabel(meal('m1', '7:02 AM', { intake: 'refused', carries: 'with Prednisone', timeTag: 'estimated' })),
    ).toBe('Meal, Royal Canin, Selected Protein PR, dry, refused, with Prednisone, 7:02 AM, estimated. Opens details');
  });

  it('a dose: its vehicle and the vehicle’s intake, then its adherence', () => {
    expect(
      eventRowLabel(dose({ adherence: 'partial', vehicle: 'in the 1:00 PM meal', vehicleIntake: { phrase: 'picked at', tone: 'attn' } })),
    ).toBe('Prednisone, in the 1:00 PM meal, picked at, partial dose, 1:00 PM. Opens details');
  });

  it('the drawn name may cut at two lines; the spoken one never does', () => {
    const long = meal('m1', '8:00 AM', {
      detail: 'Instinct · Limited Ingredient Diet Real Rabbit Recipe in Savory Gravy',
      formatTag: 'WET',
    });
    const t = render(<SpineEventRow node={long} isFirst isLast onOpen={jest.fn()} />);
    expect(t.getByTestId('spine-node-m1').props.accessibilityLabel).toContain('Real Rabbit Recipe in Savory Gravy, wet');
  });
});

// ── The time tag ──────────────────────────────────────────────────────────────

describe('a found or estimated time carries its tag under the time, uncut', () => {
  it.each([
    ['found', 'found'],
    ['estimated', 'estimated'],
  ] as const)('%s', (timeTag, word) => {
    const t = render(<SpineEventRow node={vomit(ROSE, { timeTag, time: 'by 07:02 AM' })} isFirst isLast onOpen={jest.fn()} />);
    const tag = t.getByText(word);
    expect(tag.props.numberOfLines).toBeUndefined();
    expect(styleOf(tag).textTransform).toBe('uppercase');
  });
});

// ── The read arrives on ONE node ──────────────────────────────────────────────

describe('the read arrives on ONE node', () => {
  function arrive(opts: { reduced?: boolean } = {}) {
    mockUseReducedMotion.mockReturnValue(!!opts.reduced);
    const t = render(<SpineEventRow node={vomit({ state: 'pending' })} isFirst isLast onOpen={jest.fn()} />);
    const railBefore = t.getByTestId('spine-read-rail-v2');
    // The waiting line measured (the tick's box), as the real row reports it.
    act(() => layout(t.getByTestId('spine-read-v2').children[1] as never, 20));
    act(() => {
      t.rerender(<SpineEventRow node={vomit(ROSE)} isFirst isLast onOpen={jest.fn()} />);
    });
    const railDuring = t.getByTestId('spine-read-rail-v2');
    // The landed word measured — arms the rail beat.
    act(() => layout(t.getByTestId('spine-read-v2').children[1] as never, 24));
    return { t, railBefore, railDuring };
  }

  const settle = () =>
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.railLagMs + FOLD_MOTION.openMs + FOLD_MOTION.settleSlackMs * 3 + FRAME_MS * 4);
    });

  it('the tick IS the rail: the same React instance before, during and after (the node-identity test)', () => {
    const { t, railBefore, railDuring } = arrive();
    expect(railDuring).toBe(railBefore);
    const during = styleOf(t.getByTestId('spine-read-rail-v2'));
    expect(during.position).toBe('absolute');
    expect(during.height).toBe(24);
    settle();
    const after = t.getByTestId('spine-read-rail-v2');
    expect(after).toBe(railBefore);
    expect(styleOf(after).position).toBeUndefined();
    expect(styleOf(after).alignSelf).toBe('stretch');
    expect(styleOf(after).backgroundColor).toBe(theme.colorEventSymptom);
  });

  it('the slot opens on the fold’s layout config 80ms behind the rail, and the rose word lands', () => {
    const { t } = arrive();
    expect(configureNext).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.railLagMs + 1);
    });
    expect(configureNext).toHaveBeenCalledWith(UNFOLD_LAYOUT);
    expect(t.getByTestId('spine-verdict-v2').props.children).toBe('Worth a call');
  });

  it('the rose’s arrival is announced politely, once, in its words', () => {
    arrive();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Worth a call');
  });

  it('the trigger is the FACT: a rose replacing nothing (no pending) never arrives, and is not announced', () => {
    const t = render(<SpineEventRow node={vomit({ state: 'none' })} isFirst isLast onOpen={jest.fn()} />);
    act(() => {
      t.rerender(<SpineEventRow node={vomit(ROSE)} isFirst isLast onOpen={jest.fn()} />);
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(configureNext).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it('reduced motion: the arrival is instant — no layout keyframe — and the tick was still', () => {
    const t = render(<SpineEventRow node={vomit({ state: 'pending' })} isFirst isLast onOpen={jest.fn()} />);
    mockUseReducedMotion.mockReturnValue(true);
    act(() => {
      t.rerender(<SpineEventRow node={vomit({ state: 'pending' })} isFirst isLast onOpen={jest.fn()} />);
    });
    const tick = styleOf(t.getByTestId('spine-read-rail-v2'));
    expect(tick.opacity).toBeUndefined();
    expect(tick.height).toBe(SPINE_TICK_HEIGHT);
    act(() => {
      t.rerender(<SpineEventRow node={vomit(ROSE)} isFirst isLast onOpen={jest.fn()} />);
    });
    act(() => {
      jest.advanceTimersByTime(theme.durationFast + FOLD_MOTION.settleSlackMs * 3);
    });
    expect(configureNext).not.toHaveBeenCalled();
    expect(t.getByTestId('spine-verdict-v2')).toBeTruthy();
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

  // ── AC 24, the resting half: a watched arrival ends in exactly the resting row ──
  // The trees are compared as serialized, handlers folded to one token (a fresh render's
  // handlers are new functions, so a raw `toEqual` compares identities, not rows). The
  // floor under the comparison (C-36): the pending row differs from every resting row, so
  // an equality here is a statement the comparison could have refused.
  const serialized = (t: ReturnType<typeof render>) =>
    JSON.stringify(t.toJSON(), (_k, v) => (typeof v === 'function' ? '[handler]' : v));
  const ENDS: [NodeRead, string | null][] = [
    [ROSE, 'spine-verdict-v2'],
    [{ state: 'calm' }, null],
    [{ state: 'unread' }, 'spine-unread-v2'],
  ];

  it('the floor: a waiting row is not any resting row', () => {
    const waiting = serialized(render(<SpineEventRow node={vomit({ state: 'pending' })} isFirst isLast onOpen={jest.fn()} />));
    for (const [end] of ENDS) {
      expect(serialized(render(<SpineEventRow node={vomit(end)} isFirst isLast onOpen={jest.fn()} />))).not.toBe(waiting);
    }
  });

  describe.each([false, true])('AC 24 (reduced motion %s): the arrival ends in the resting row of its state', (reduced) => {
    it.each(ENDS)('pending → %p', (end, mark) => {
      mockUseReducedMotion.mockReturnValue(reduced);
      const watched = render(<SpineEventRow node={vomit({ state: 'pending' })} isFirst isLast onOpen={jest.fn()} />);
      act(() => layout(watched.getByTestId('spine-read-v2').children[1] as never, 20));
      act(() => {
        watched.rerender(<SpineEventRow node={vomit(end)} isFirst isLast onOpen={jest.fn()} />);
      });
      const body = watched.queryByTestId('spine-read-v2');
      if (body) act(() => layout(body.children[1] as never, 24));
      settle();
      const resting = render(<SpineEventRow node={vomit(end)} isFirst isLast onOpen={jest.fn()} />);
      // What each end state shows, on both trees (never an empty equality).
      if (mark) {
        expect(watched.getByTestId(mark)).toBeTruthy();
        expect(resting.getByTestId(mark)).toBeTruthy();
      } else {
        expect(watched.queryByTestId('spine-read-v2')).toBeNull();
        expect(watched.queryByTestId('spine-unread-v2')).toBeNull();
      }
      expect(serialized(watched)).toBe(serialized(resting));
    });
  });
});

// ── Open in place, the static half (AC 17) ────────────────────────────────────

describe('a run opens in place: every member, a full row, nothing capped (AC 17, GAP-8)', () => {
  function Host({ node, expanded, onToggle }: { node: SpineCompactNode; expanded: boolean; onToggle: (id: string) => void }) {
    return <SpineCompactRow node={node} isFirst isLast expanded={expanded} onToggle={onToggle} onOpen={jest.fn()} />;
  }

  it('closed: the count and the product, the formats on the second line, the range, and `expanded: false`', () => {
    const t = render(<Host node={run(3)} expanded={false} onToggle={jest.fn()} />);
    expect(t.getByText('3 meals', { exact: false })).toBeTruthy();
    expect(t.getByTestId('spine-formats-compact:m0').props.children).toBe('all dry');
    const row = t.getByTestId('spine-node-compact:m0');
    expect(row.props.accessibilityLabel).toBe(
      '3 meals, Royal Canin, Selected Protein PR, all dry, 6:02 AM – 8:40 AM. Shows each one',
    );
    expect(row.props.accessibilityState).toEqual({ expanded: false });
    expect(t.queryByTestId('spine-members-compact:m0')).toBeNull();
  });

  it('a tap asks the host to open it on the fold’s layout config; open, it says it hides them', () => {
    const onToggle = jest.fn();
    const t = render(<Host node={run(3)} expanded={false} onToggle={onToggle} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    expect(onToggle).toHaveBeenCalledWith('compact:m0');
    expect(configureNext).toHaveBeenCalledWith(UNFOLD_LAYOUT);
    t.rerender(<Host node={run(3)} expanded onToggle={onToggle} />);
    const row = t.getByTestId('spine-node-compact:m0');
    expect(row.props.accessibilityState).toEqual({ expanded: true });
    expect(row.props.accessibilityLabel).toMatch(/Hides each one$/);
  });

  it.each([2, 5, 9, 12])('a run of %i opens to every member, each the full row with every fact', (n) => {
    const node = run(n);
    const t = render(<Host node={node} expanded onToggle={jest.fn()} />);
    const box = t.getByTestId(`spine-members-${node.id}`);
    // Every member drawn, each a door with the whole row's sentence.
    for (const member of node.rows) {
      expect(t.getByTestId(`spine-node-${member.id}`).props.accessibilityLabel).toBe(eventRowLabel(member));
    }
    // Every fact a single row carries, the rating chip included (All draws a chip, unrated none).
    expect(t.getAllByTestId(/^spine-chip-m\d+$/)).toHaveLength(Math.ceil(n / 2));
    // Nothing caps or clips the box, or anything between it and the run.
    type Host = { props: { style?: unknown }; parent: Host | null };
    for (let el: Host | null = box as unknown as Host; el; el = el.parent) {
      const s = styleOf(el);
      expect(s.maxHeight).toBeUndefined();
      expect(s.height).toBeUndefined();
      expect(s.overflow).not.toBe('hidden');
    }
  });

  it('the run’s rail lies on the thread the frame draws (derived from the exported widths)', () => {
    const t = render(<Host node={run(2)} expanded onToggle={jest.fn()} />);
    const rail = styleOf(t.getByTestId('spine-run-rail-compact:m0'));
    expect(THREAD_X).toBe(TIME_W + theme.space1 + RAIL_W / 2);
    expect((rail.left as number) + (rail.width as number) / 2).toBe(THREAD_X);
  });

  it('reduced motion: opening configures no layout keyframe', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const t = render(<Host node={run(3)} expanded={false} onToggle={jest.fn()} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    expect(configureNext).not.toHaveBeenCalled();
  });
});
