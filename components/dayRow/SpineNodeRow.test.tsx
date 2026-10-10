// The day's row (History v2, HV-6 / CUL-1163; spec §3.6) — the renderer's half.
//
// Pinned here: rule D (a run carries a chevron, a single row none); the chips in the
// shipped vocabularies and their inks (C-1); the dose row and the meal's "with"; the time
// tag; the read's states as drawn (the rose word in the rose INK, the grey *No read yet*,
// the tick, NOTHING for a calm read); no image node for any state; the read arriving on ONE
// node (the rail's identity before, during and after), the trigger being the model's fact,
// reduced motion, the breath; AC 24's resting half (an arrival ends in exactly the row a
// fresh render of that state draws); VoiceOver hearing the whole row as one sentence in
// reading order (C-8); and open in place, the static half (AC 17: every member of a run of
// 2, 5, 9 and 12 drawn as a full row, nothing capped or clipped) and its motion (CUL-1734,
// `openInPlace`: the run's own open, its Reduce Motion form, and VoiceOver staying on the
// run; the beats themselves are pinned in `components/motion/runOpenMotion.test.ts`).

const mockUseReducedMotion = jest.fn(() => false);
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));
const mockUseAppActive = jest.fn(() => true);
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => mockUseAppActive() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, LayoutAnimation, StyleSheet } from 'react-native';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { FOLD_LAYOUT, FOLD_MOTION, UNFOLD_LAYOUT } from '../motion/foldMotion';
import {
  RUN_CLOSE_BUDGET_MS,
  RUN_CLOSE_LAYOUT,
  RUN_MOTION,
  RUN_OPEN_LAYOUT,
  runLandStarts,
  runOpenBudgetMs,
  runOpenIdleMs,
} from '../motion/runOpenMotion';
import { RunRevealContext, type RunRevealMeasure } from '../motion/runRevealMotion';
import { useState } from 'react';
import { TICK_BREATH } from '../motion/arrivalMotion';
import type { NodeRead, SpineCompactNode, SpineDose, SpineEventNode } from '../../lib/spineNode';
import {
  PHOTOGRAPHED_LABEL,
  SPINE_READ_PENDING_LABEL,
  SPINE_TICK_HEIGHT,
  SpineCompactRow,
  SpineEventRow,
  THREAD_X,
  eventRowLabel,
} from './SpineNodeRow';
import { RAIL_W, SPINE_THREAD, TIME_W } from '../recap/DaySpine';
import { RowSpeechContext, readLandedSpoken, type RowSpeech } from './rowSpeech';

const FRAME_MS = 20;
const ROSE: NodeRead = { state: 'worth_a_call', label: 'Worth a call', spoken: 'Worth a call' };
/** The two words the grey mark carries (CUL-1234 (a)). */
const NOT_READ: NodeRead = { state: 'unread', label: 'No read yet' };
const UNCLEAR: NodeRead = { state: 'unread', label: 'Not enough to say yet' };

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

  it.each([NOT_READ.label, UNCLEAR.label])('unread: a grey mark and "%s", never rose, and no rail', (label) => {
    const t = render(<SpineEventRow node={vomit({ state: 'unread', label })} isFirst isLast onOpen={jest.fn()} />);
    const text = t.getByText(label);
    expect(styleOf(text).color).toBe(theme.colorTextSecondary);
    expect(t.getByTestId('spine-unread-mark-v2')).toBeTruthy();
    expect(t.queryByTestId('spine-verdict-v2')).toBeNull();
    expect(t.queryByTestId('spine-read-rail-v2')).toBeNull();
  });

  it('calm: NOTHING — no word, no slot, no mark (a calm read is never a word on a list)', () => {
    const t = render(<SpineEventRow node={vomit({ state: 'calm' })} isFirst isLast onOpen={jest.fn()} />);
    for (const id of ['spine-read-v2', 'spine-verdict-v2', 'spine-unread-v2']) expect(t.queryByTestId(id)).toBeNull();
    expect(t.queryByText(/keep an eye out|not enough to say|looks fine/i)).toBeNull();
  });

  it.each([ROSE, { state: 'calm' as const }, NOT_READ, { state: 'pending' as const }])(
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

  it('EN-3: a new-rule call shows the short chip and says the full phrase (spec §2 rule 5)', () => {
    const now: NodeRead = { state: 'worth_a_call', label: 'Call now', spoken: 'Call your vet now' };
    const t = render(<SpineEventRow node={vomit(now)} isFirst isLast onOpen={jest.fn()} />);
    expect(t.getByTestId('spine-verdict-v2').props.children).toBe('Call now');
    expect(t.getByTestId('spine-node-v2').props.accessibilityLabel).toBe(
      `Vomit, 4 min after eating, ${PHOTOGRAPHED_LABEL}, 5:11 PM. Call your vet now. Opens details`,
    );
  });

  it('an unread one says so in its own words; a calm one says nothing about its read', () => {
    expect(eventRowLabel(vomit(NOT_READ))).toBe(`Vomit, 4 min after eating, ${PHOTOGRAPHED_LABEL}, 5:11 PM. No read yet. Opens details`);
    expect(eventRowLabel(vomit(UNCLEAR))).toBe(
      `Vomit, 4 min after eating, ${PHOTOGRAPHED_LABEL}, 5:11 PM. Not enough to say yet. Opens details`,
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
  function arrive(opts: { reduced?: boolean; speech?: RowSpeech } = {}) {
    mockUseReducedMotion.mockReturnValue(!!opts.reduced);
    const speech = opts.speech;
    const wrapper = speech
      ? ({ children }: { children: React.ReactNode }) => <RowSpeechContext.Provider value={speech}>{children}</RowSpeechContext.Provider>
      : undefined;
    const t = render(<SpineEventRow node={vomit({ state: 'pending' })} isFirst isLast onOpen={jest.fn()} />, { wrapper });
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

  it('CUL-1224 (BRK-28): the rose’s arrival is said once, queued, with its pet, its row and its words', () => {
    const queued = jest.fn();
    const withOptions = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(queued as never);
    try {
      const t = arrive({ speech: { petName: 'Nyx', mayAnnounce: () => true } }).t;
      expect(queued).toHaveBeenCalledTimes(1);
      expect(queued).toHaveBeenCalledWith('Nyx’s vomit at 5:11 PM, photo read: Worth a call.', { queue: true });
      // No second voice: nothing interrupts, and the slot carries no live region (Android
      // spoke it twice: the region and the announcement).
      expect(announce).not.toHaveBeenCalled();
      expect(t.getByTestId('spine-read-v2').props.accessibilityLiveRegion).toBeUndefined();
    } finally {
      withOptions.mockRestore();
    }
  });

  it('CUL-1224 (BRK-28): no screen asking (no provider), or a screen out of focus, says nothing', () => {
    const queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {});
    try {
      arrive();
      arrive({ speech: { petName: 'Nyx', mayAnnounce: () => false } });
      expect(queued).not.toHaveBeenCalled();
      expect(announce).not.toHaveBeenCalled();
    } finally {
      queued.mockRestore();
    }
  });

  it('CUL-1224: the spoken read names its subject, and falls back to the row without a name', () => {
    expect(readLandedSpoken({ petName: 'Nyx', title: 'Vomit', time: '5:11 PM', verdict: 'Call your vet now' })).toBe(
      'Nyx’s vomit at 5:11 PM, photo read: Call your vet now.',
    );
    expect(readLandedSpoken({ petName: '  ', title: 'Stool', time: '7:02 AM', verdict: 'Call today' })).toBe(
      'Stool at 7:02 AM, photo read: Call today.',
    );
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
    [NOT_READ, 'spine-unread-v2'],
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

// ── The member form (CUL-1733; spec §3.6, D2 ruled on CUL-1715) ────────────────────────

describe('an opened run\'s member: the difference first, the brand and product on line 2', () => {
  const PRODUCT = 'Royal Canin · Selected Protein PR';
  /** A run of `intakes.length` meals, one rating each (null for unrated), alternating format. */
  function ratedRun(intakes: (string | null)[]): SpineCompactNode {
    const rows = intakes.map((intake, i) =>
      meal(`m${i}`, TIMES[i], { intake, formatTag: i % 2 === 0 ? 'WET' : 'DRY' }),
    );
    return { ...run(intakes.length), rows };
  }
  const open = (node: SpineCompactNode) =>
    render(<SpineCompactRow node={node} isFirst isLast expanded onToggle={jest.fn()} onOpen={jest.fn()} />);

  it.each([
    ['two meals', ['all', 'most']],
    ['four meals, two rated', ['all', null, 'most', null]],
  ] as const)('%s: line 1 carries the meal word, the format and the chip; line 2 the product', (_name, intakes) => {
    const node = ratedRun([...intakes]);
    const t = open(node);
    node.rows.forEach((row, i) => {
      const line1 = within(t.getByTestId(`spine-member-line1-${row.id}`));
      expect(line1.getByText('Meal')).toBeTruthy();
      expect(line1.getByText(row.formatTag as string)).toBeTruthy();
      // Nothing of the product rides line 1.
      expect(line1.queryByText(/Royal Canin/)).toBeNull();
      expect(line1.queryByText(/Selected Protein/)).toBeNull();
      // The chip is a line-1 sibling when the meal is rated, and absent when it is not.
      const want = intakes[i] === 'all' ? 'All' : intakes[i] === 'most' ? 'Most' : null;
      if (want) expect(within(line1.getByTestId(`spine-chip-${row.id}`)).getByText(want)).toBeTruthy();
      else expect(line1.queryByTestId(`spine-chip-${row.id}`)).toBeNull();
      // Line 2: the brand and product, in the run's own second-line register.
      const food = t.getByTestId(`spine-member-food-${row.id}`);
      expect(food.props.children).toBe(PRODUCT);
      expect(styleOf(food)).toMatchObject({ fontSize: theme.textXS, color: theme.colorTextSecondary });
      expect(styleOf(food)).toEqual(styleOf(t.getByTestId(`spine-formats-${node.id}`)));
    });
  });

  it('VoiceOver still hears the whole row, the product included, in its reading order', () => {
    const node = ratedRun(['all', 'most']);
    const t = open(node);
    for (const row of node.rows) {
      const label = t.getByTestId(`spine-node-${row.id}`).props.accessibilityLabel as string;
      expect(label).toBe(eventRowLabel(row));
      expect(label).toMatch(/^Meal, Royal Canin, Selected Protein PR, (wet|dry), (all|most) eaten, /);
    }
  });

  it('the member bead is 9pt, centred where the 11pt bead centres; the time takes the secondary ink', () => {
    const node = ratedRun(['all', 'most']);
    const t = open(node);
    const dots = t.getAllByTestId('spine-dot-member');
    expect(dots).toHaveLength(2);
    // The run's own bead, the single-row geometry, is the rail's last child.
    const runRail = t.getAllByTestId('spine-rail')[0];
    const runDot = styleOf(runRail.children[runRail.children.length - 1] as never);
    const d = styleOf(dots[0]);
    expect(d.width).toBe(9);
    expect(d.height).toBe(9);
    expect(d.borderWidth).toBe(runDot.borderWidth);
    expect((d.marginTop as number) + (d.width as number) / 2).toBe(
      (runDot.marginTop as number) + (runDot.width as number) / 2,
    );
    expect(d.backgroundColor).toBe(runDot.backgroundColor);
    expect(styleOf(t.getByText('6:02\u00a0AM')).color).toBe(theme.colorTextSecondary);
    // The run's range keeps the tertiary time.
    expect(styleOf(t.getByText(/^6:02\sAM\s– /)).color).toBe(theme.colorTextTertiary);
  });

  it('a single row is untouched: the product on line 1, the 11pt bead, the tertiary time, no member form', () => {
    const row = meal('s1', '9:15 AM', { intake: 'most' });
    const t = render(<SpineEventRow node={row} isFirst isLast onOpen={jest.fn()} />);
    expect(t.queryByTestId('spine-member-line1-s1')).toBeNull();
    expect(t.queryByTestId('spine-member-food-s1')).toBeNull();
    expect(t.queryByTestId('spine-dot-member')).toBeNull();
    expect(t.getByText(` · ${PRODUCT}`)).toBeTruthy();
    const rail = t.getByTestId('spine-rail');
    const dot = styleOf(rail.children[rail.children.length - 1] as never);
    expect(dot.width).toBe(11);
    expect(styleOf(t.getByText('9:15\u00a0AM')).color).toBe(theme.colorTextTertiary);
    expect(t.getByTestId('spine-node-s1').props.accessibilityLabel).toBe(eventRowLabel(row));
  });
});

// ── Open in place, the motion (HV-10 / CUL-1167; spec §4 "Open a run", AC 32) ─────────

describe('open in place: the run\'s own motion (CUL-1734, D1)', () => {
  /** A host that owns the open state, as a day card and Home's spine do. */
  function InPlace({ node, initial = false }: { node: SpineCompactNode; initial?: boolean }) {
    const [expanded, setExpanded] = useState(initial);
    return (
      <SpineCompactRow
        node={node}
        isFirst
        isLast
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        onOpen={jest.fn()}
        openInPlace
      />
    );
  }
  const advance = (ms: number) =>
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  const openBudget = (n: number) => RUN_MOTION.mountFrameMs + Math.ceil(runOpenIdleMs(runLandStarts(n)));
  /** The chevron's drawn turn (the host's resolved style, or the interpolation behind it). */
  const rotationOf = (el: { props: { style?: unknown } }) => {
    const r = (styleOf(el).transform as { rotate: unknown }[])[0].rotate;
    return typeof r === 'string' ? r : (r as { __getValue: () => string }).__getValue();
  };

  it('a tap: the box mounts shut with every meal inside it, the line at the bead; one frame later ONE configured commit lets it go; at rest, nothing clipped', () => {
    const node = run(3);
    const t = render(<InPlace node={node} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    // t=0: the box is there, SHUT and clipped, every meal already mounted inside it (so none
    // remounts later); nothing in the flow has moved, so nothing is configured.
    const shut = styleOf(t.getByTestId('spine-members-compact:m0'));
    expect(shut.height).toBe(0);
    expect(shut.overflow).toBe('hidden');
    for (const m of node.rows) expect(t.getByTestId(`spine-node-${m.id}`)).toBeTruthy();
    expect(configureNext).not.toHaveBeenCalled();
    // The lead: out of the run's own bead, its own frame (explicit top and height), the glyph tint.
    const lead = styleOf(t.getByTestId('spine-run-lead-compact:m0'));
    // From the bead's foot (its centre plus half the 11pt bead), over the header's grey thread.
    expect(lead.top).toBe(SPINE_THREAD.dotCenterY + 11 / 2);
    expect(typeof lead.height).toBe('number');
    expect(lead.bottom).toBeUndefined();
    expect(lead.transformOrigin).toBe('top');
    expect(lead.backgroundColor).toBe(theme.colorAccentGlyph);
    expect((lead.left as number) + (lead.width as number) / 2).toBe(THREAD_X);
    // One frame later: ONE layout commit on the run's own ease, the box's height let go.
    advance(RUN_MOTION.mountFrameMs);
    expect(configureNext).toHaveBeenCalledTimes(1);
    expect(configureNext).toHaveBeenLastCalledWith(RUN_OPEN_LAYOUT);
    expect(styleOf(t.getByTestId('spine-members-compact:m0')).height).toBeUndefined();
    // At rest: no clip, the line on the thread in the glyph tint, no transform on it.
    advance(openBudget(3));
    const box = styleOf(t.getByTestId('spine-members-compact:m0'));
    expect(box.overflow).not.toBe('hidden');
    expect(box.height).toBeUndefined();
    const rail = styleOf(t.getByTestId('spine-run-rail-compact:m0'));
    expect(rail.backgroundColor).toBe(theme.colorAccentGlyph);
    expect(rail.transform).toBeUndefined();
    expect(rail.top).toBe(0);
    expect((rail.left as number) + (rail.width as number) / 2).toBe(THREAD_X);
    expect(rotationOf(t.getByTestId('spine-run-chevron-compact:m0'))).toBe('180deg');
    for (const m of node.rows) expect(t.getByTestId(`spine-node-${m.id}`)).toBeTruthy();
  });

  it('the chevron turns: one glyph, rotated, never swapped (so a turn reverses from where it is)', () => {
    const t = render(<InPlace node={run(2)} />);
    const chev = t.getByTestId('spine-run-chevron-compact:m0');
    expect(rotationOf(chev)).toBe('0deg');
    expect(within(chev).UNSAFE_queryByType(ChevronUp)).toBeNull();
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    advance(openBudget(2));
    expect(t.getByTestId('spine-run-chevron-compact:m0')).toBe(chev);
    expect(within(chev).UNSAFE_queryByType(ChevronUp)).toBeNull();
    expect(within(chev).UNSAFE_getByType(ChevronDown)).toBeTruthy();
  });

  it('the line reaches the last meal\'s bead once the meals have measured', () => {
    const node = run(3);
    const t = render(<InPlace node={node} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    layout(t.getByTestId('spine-members-stage-compact:m0') as never, 180);
    fireEvent(t.getByTestId('spine-member-wrap-m2'), 'layout', { nativeEvent: { layout: { x: 0, y: 120, width: 300, height: 60 } } });
    advance(RUN_MOTION.mountFrameMs);
    expect(styleOf(t.getByTestId('spine-run-rail-compact:m0')).bottom).toBe(180 - (120 + SPINE_THREAD.dotCenterY));
  });

  it('VoiceOver stays on the run: the same element before and after, now saying it hides them', () => {
    const t = render(<InPlace node={run(3)} />);
    const before = t.getByTestId('spine-node-compact:m0');
    fireEvent.press(before);
    advance(openBudget(3));
    const after = t.getByTestId('spine-node-compact:m0');
    expect(after).toBe(before);
    expect(after.props.accessibilityState).toEqual({ expanded: true });
    expect(after.props.accessibilityLabel).toMatch(/Hides each one$/);
  });

  it('closing: ONE configured commit takes the box to zero on the tap, clipped, the meals still mounted; the box unmounts at 280', () => {
    const t = render(<InPlace node={run(3)} initial />);
    expect(t.getByTestId('spine-node-m0')).toBeTruthy();
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    expect(configureNext).toHaveBeenCalledTimes(1);
    expect(configureNext).toHaveBeenLastCalledWith(RUN_CLOSE_LAYOUT);
    const closing = styleOf(t.getByTestId('spine-members-compact:m0'));
    expect(closing.height).toBe(0);
    expect(closing.overflow).toBe('hidden');
    expect(t.getByTestId('spine-node-m0')).toBeTruthy();
    advance(RUN_CLOSE_BUDGET_MS - 1);
    expect(t.getByTestId('spine-members-compact:m0')).toBeTruthy();
    advance(1);
    expect(t.queryByTestId('spine-members-compact:m0')).toBeNull();
    expect(t.queryByTestId('spine-run-lead-compact:m0')).toBeNull();
  });

  it('Reduce Motion (known on the first render): the box at once, the line and the meals fade in over 150ms, no layout keyframe', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const node = run(3);
    const t = render(<InPlace node={node} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    for (const m of node.rows) expect(t.getByTestId(`spine-node-${m.id}`)).toBeTruthy();
    expect(styleOf(t.getByTestId('spine-members-compact:m0')).height).toBeUndefined();
    expect(configureNext).not.toHaveBeenCalled();
    const member = t.getByTestId(`spine-node-${node.rows[0].id}`);
    advance(theme.durationFast);
    expect(theme.durationFast).toBe(150);
    expect(t.getByTestId(`spine-node-${node.rows[0].id}`)).toBe(member);
    expect(rotationOf(t.getByTestId('spine-run-chevron-compact:m0'))).toBe('180deg');
    expect(configureNext).not.toHaveBeenCalled();
  });

  it('CUL-1721: a meal, its wrapper, the line and the lead are the SAME elements from the box\'s mount to its unmount', () => {
    const node = run(3);
    const t = render(<InPlace node={node} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    const ids = ['spine-node-m1', 'spine-member-wrap-m1', 'spine-run-rail-compact:m0', 'spine-run-lead-compact:m0', 'spine-members-stage-compact:m0'];
    const first = ids.map((id) => t.getByTestId(id));
    advance(RUN_MOTION.mountFrameMs);
    expect(ids.map((id) => t.getByTestId(id))).toEqual(first);
    advance(openBudget(3));
    expect(ids.map((id) => t.getByTestId(id))).toEqual(first);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    advance(RUN_CLOSE_BUDGET_MS - 1);
    ids.forEach((id, i) => expect(t.getByTestId(id)).toBe(first[i]));
  });

  it.each([2, 8, 12])('a %d-meal run is at rest inside its budget (never past 400ms), and closes inside 280', (n) => {
    const node = run(n);
    const t = render(<InPlace node={node} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    advance(openBudget(n));
    expect(runOpenBudgetMs(runLandStarts(n))).toBeLessThanOrEqual(400);
    expect(styleOf(t.getByTestId('spine-members-compact:m0')).overflow).not.toBe('hidden');
    for (const m of node.rows) expect(t.getByTestId(`spine-node-${m.id}`)).toBeTruthy();
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    advance(RUN_CLOSE_BUDGET_MS);
    expect(t.queryByTestId('spine-members-compact:m0')).toBeNull();
  });

  it('no haptic: the row\'s open imports nothing from lib/haptics (C-16)', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../motion/runOpenMotion.ts'), 'utf8') as string;
    expect(src).not.toMatch(/lib\/haptics|expo-haptics/);
  });

  it('without `openInPlace` the shipped open is untouched: no stage, no lead, the fold\'s config on the tap', () => {
    function Shipped() {
      const [expanded, setExpanded] = useState(false);
      return <SpineCompactRow node={run(3)} isFirst isLast expanded={expanded} onToggle={() => setExpanded((e) => !e)} onOpen={jest.fn()} />;
    }
    const t = render(<Shipped />);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    expect(configureNext).toHaveBeenCalledWith(UNFOLD_LAYOUT);
    expect(t.getByTestId('spine-node-m0')).toBeTruthy();
    expect(t.queryByTestId('spine-members-stage-compact:m0')).toBeNull();
    expect(t.queryByTestId('spine-run-lead-compact:m0')).toBeNull();
    expect(t.queryByTestId('spine-run-chevron-compact:m0')).toBeNull();
    expect(styleOf(t.getByTestId('spine-run-rail-compact:m0')).backgroundColor).toBe(theme.colorEventMeal);
    advance(1_000);
    expect(configureNext).toHaveBeenCalledTimes(1);
  });
});

// ── The reveal (CUL-1735, D3): the run asks its list once per open, never on a close ──────

describe('the reveal: the run asks its list to show its first meal, once per open', () => {
  function Hosted({ node, request }: { node: SpineCompactNode; request: jest.Mock }) {
    const [expanded, setExpanded] = useState(false);
    return (
      <RunRevealContext.Provider value={request}>
        <SpineCompactRow
          node={node}
          isFirst
          isLast
          expanded={expanded}
          onToggle={() => setExpanded((e) => !e)}
          onOpen={jest.fn()}
          openInPlace
        />
      </RunRevealContext.Provider>
    );
  }
  const advance = (ms: number) =>
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  const host = () => {
    const cancel = jest.fn();
    const request = jest.fn((_m: RunRevealMeasure) => cancel);
    return { request, cancel };
  };

  it('an open asks once, on the box\'s commit; the close asks nothing and drops what is pending', () => {
    const { request, cancel } = host();
    const t = render(<Hosted node={run(3)} request={request} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    expect(request).not.toHaveBeenCalled();
    advance(RUN_MOTION.mountFrameMs);
    expect(request).toHaveBeenCalledTimes(1);
    advance(1_000);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    advance(1_000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('a reversal mid-open (a second tap) cancels the reveal, and the turn back never asks again', () => {
    const { request, cancel } = host();
    const t = render(<Hosted node={run(3)} request={request} />);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    advance(RUN_MOTION.mountFrameMs + 40);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    expect(cancel).toHaveBeenCalledTimes(1);
    advance(60);
    fireEvent.press(t.getByTestId('spine-node-compact:m0'));
    advance(1_000);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

