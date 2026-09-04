// InsightCard — the fold motion (CUL-788, `docs/nyx-signal-fold-requirements.md` §12 v1.2).
//
// What is pinned here is the CONTRACT of the choreography, not its look: the two
// `LayoutAnimation` configs fire from the two press paths only (never on a `cached`
// change, never on the reopened path, never under reduced motion); every `Animated.Value`
// reaches its end state on completion; the host's state change rides the beat it belongs
// to (fold: when the words have left; unfold: 80ms behind the rail); the in-flight
// wrappers are absent from the idle tree; a blur FINISHES a transition; a re-keyed row
// abandons one; and the rail changes only its height — never colour, opacity or width.
//
// The mocked native driver completes any animation on the next frame, whatever its
// duration, so a "beat completed" step is one frame; the 80ms lags are real timers.

const mockUseReducedMotion = jest.fn(() => false);
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));
const mockUseAppActive = jest.fn(() => true);
jest.mock('../../hooks/useAppActive', () => ({
  useAppActive: () => mockUseAppActive(),
}));

import { useState } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, LayoutAnimation, StyleSheet } from 'react-native';
import { InsightCard } from './InsightCard';
import { FOLD_LAYOUT, FOLD_MOTION, UNFOLD_LAYOUT } from './foldMotion';
import { flat } from '../../testUtils/tree';
import { theme } from '../../constants/theme';
import { FOLD_CONTROL_LABEL } from '../../lib/signalCopy';
import type { CachedFinding, PostprandialTimingFinding, ReflectionFinding } from '../../lib/signal';

const postprandial: PostprandialTimingFinding = {
  type: 'postprandial_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  rapidCount: 8,
  eligibleCount: 8,
  totalEpisodes: 14,
  rapidWindowMinutes: 30,
  lastTwoEligibleRapid: true,
  medianMinutesSinceFeeding: 14,
  feedingFormsInEvidence: [],
  windowDays: 60,
};
const reflection: ReflectionFinding = {
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 2,
  priorCount: 4,
  direction: 'improving',
  windowDays: 14,
};
const SENTENCE = 'A sentence about Nyx.';
const benign: CachedFinding = { rank: 1, text: SENTENCE, finding: postprandial };
const other: CachedFinding = { rank: 1, text: 'Another sentence.', finding: reflection };

const FRAME_MS = 20;
const FACE_H = 180;
const STRIP_H = 52;
const TICK = FOLD_MOTION.stripRailPt;

type Instance = ReturnType<typeof render>['root'];
const valueOf = (v: Animated.Value) => (v as unknown as { __getValue: () => number }).__getValue();
const railOf = (row: Instance) => row.children[0] as Instance;
const contentOf = (row: Instance) => row.children[1] as Instance;
const layout = (node: Instance, height: number) =>
  fireEvent(node, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height } } });
/** The style an `Animated.View` was given — the one holding the `Animated.Value`s. The host
 *  View underneath carries resolved numbers, so the live values are read off the composite
 *  parent, whose Values are stable refs for the life of the card. */
const animatedStyle = <T,>(host: Instance): T => {
  const isValue = (x: unknown) => typeof (x as { __getValue?: unknown })?.__getValue === 'function';
  for (let n: Instance | null = host; n; n = n.parent as Instance | null) {
    const style = StyleSheet.flatten(n.props.style as never) as unknown as Record<string, unknown> | undefined;
    if (!style) continue;
    const transform = style.transform as Array<Record<string, unknown>> | undefined;
    if (isValue(style.opacity) || transform?.some((t) => Object.values(t).some(isValue))) return style as unknown as T;
  }
  throw new Error('no Animated style above this node');
};
/** The transform's translateY / scaleY as Animated.Values, off the rendered style. */
const railValues = (rail: Instance) => {
  const style = animatedStyle<{ transform?: Array<Record<string, Animated.Value>> }>(rail);
  const t = style.transform ?? [];
  return {
    shift: t.find((x) => 'translateY' in x)?.translateY as Animated.Value,
    scale: t.find((x) => 'scaleY' in x)?.scaleY as Animated.Value,
  };
};

let configureNext: jest.SpyInstance;
let timing: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  mockUseReducedMotion.mockReturnValue(false);
  mockUseAppActive.mockReturnValue(true);
  configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
  timing = jest.spyOn(Animated, 'timing');
});
afterEach(() => {
  configureNext.mockRestore();
  timing.mockRestore();
  jest.useRealTimers();
});

/** A host that owns `folded`, the way LiveStack does. */
function Host({ start = false, cached = benign }: { start?: boolean; cached?: CachedFinding }) {
  const [folded, setFolded] = useState(start);
  return (
    <InsightCard
      cached={cached}
      petName="Nyx"
      onFold={() => setFolded(true)}
      folded={folded}
      onUnfold={() => setFolded(false)}
    />
  );
}

describe('the idle tree (§12.4: nothing in flight adds nothing)', () => {
  it('a face row has no stage wrapper, a plain rail, and no layout handler', () => {
    const { queryByTestId, getByTestId } = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} />);
    expect(queryByTestId('insight-face-stage')).toBeNull();
    expect(queryByTestId('insight-strip-stage')).toBeNull();
    expect(queryByTestId('insight-rail')).toBeNull();
    const row = getByTestId('insight-row');
    expect(railOf(row).props.collapsable).toBeUndefined();
    expect(contentOf(row).props.onLayout).toBeUndefined();
    expect(flat(row).overflow).toBeUndefined();
  });

  it('a folded row: the strip carries the compact padding and the 44pt floor; the row carries none; the rail is the 16pt tick', () => {
    const { getByTestId, queryByTestId } = render(<Host start />);
    const row = getByTestId('insight-row');
    expect(flat(row).paddingVertical).toBe(0);
    expect(flat(row).minHeight).toBe(44);
    const strip = getByTestId('insight-folded-strip');
    expect(flat(strip).minHeight).toBe(44);
    expect(flat(strip).paddingVertical).toBe(theme.space1);
    const rail = flat(railOf(row));
    expect(rail.height).toBe(TICK);
    expect(rail.alignSelf).toBe('center');
    expect(rail.opacity).toBe(0.85);
    expect(rail.width).toBe(3);
    expect(queryByTestId('insight-strip-stage')).toBeNull();
    // Folded, the content column listens for its layout (the tick's centre, the next unfold's start).
    expect(contentOf(row).props.onLayout).toBeDefined();
  });
});

describe('fold — §12.1: the words leave, the box closes around the line, the rail shortens last', () => {
  it('runs the beats in order and every value reaches its end state', () => {
    const view = render(<Host />);
    const row = view.getByTestId('insight-row');

    // Press: beat 1 starts. The face is staged (opacity 1, drift 0 → going to 0 / −8);
    // the host has NOT been told yet; no layout config yet; the rail is the same node,
    // still in the row's flow.
    fireEvent.press(view.getByText(FOLD_CONTROL_LABEL));
    const stage = view.getByTestId('insight-face-stage');
    const stageStyle = animatedStyle<{ opacity: Animated.Value; transform: Array<{ translateY: Animated.Value }> }>(stage);
    expect(valueOf(stageStyle.opacity)).toBe(1);
    expect(valueOf(stageStyle.transform[0].translateY)).toBe(0);
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    expect(configureNext).not.toHaveBeenCalled();
    expect(view.getByTestId('insight-rail')).toBeTruthy();
    expect(flat(view.getByTestId('insight-rail')).position).toBeUndefined();
    expect(flat(row).overflow).toBe('hidden');
    // The face's height lands (the rail's fold height).
    layout(contentOf(row), FACE_H);

    // Beat 1 completes: the fold's layout config fires, the host folds, the strip mounts
    // staged at 0 → 1, the rail steps out of the flow at the face's height.
    act(() => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(valueOf(stageStyle.opacity)).toBe(0);
    expect(valueOf(stageStyle.transform[0].translateY)).toBe(-FOLD_MOTION.driftPt);
    expect(configureNext).toHaveBeenCalledTimes(1);
    expect(configureNext).toHaveBeenCalledWith(FOLD_LAYOUT);
    expect(view.getByTestId('insight-folded-strip')).toBeTruthy();
    expect(view.queryByTestId('insight-face-stage')).toBeNull();
    const stripStage = animatedStyle<{ opacity: Animated.Value }>(view.getByTestId('insight-strip-stage'));
    expect(valueOf(stripStage.opacity)).toBe(0);
    const rail = view.getByTestId('insight-rail');
    expect(flat(rail).position).toBe('absolute');
    expect(flat(rail).height).toBe(FACE_H);
    expect(flat(rail).top).toBe(theme.space2);
    expect(flat(rail).opacity).toBe(0.85);
    expect(flat(rail).width).toBe(3);
    // The content column stands in for the rail's width + the gap, so nothing moves sideways.
    expect(flat(contentOf(row)).marginLeft).toBe(3 + theme.space2);
    // The strip's height lands (where the tick must end).
    layout(contentOf(row), STRIP_H);

    // The rail has not moved yet — it trails the box by 80ms.
    const { scale, shift } = railValues(rail);
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.railLagMs - 1);
    });
    expect(valueOf(scale)).toBe(1);
    expect(valueOf(shift)).toBe(0);
    // Then it shortens to the tick, centred on the strip.
    act(() => {
      jest.advanceTimersByTime(1 + FRAME_MS);
    });
    expect(valueOf(stripStage.opacity)).toBe(1);
    expect(valueOf(scale)).toBeCloseTo(TICK / FACE_H);
    expect(valueOf(shift)).toBe((STRIP_H - TICK) / 2 - theme.space2);

    // The slack passes: idle. No stage, no Animated rail, the row no longer clips, the
    // rail is the resting tick at the same place the transform left it.
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.settleSlackMs + 1);
    });
    expect(view.queryByTestId('insight-strip-stage')).toBeNull();
    expect(view.queryByTestId('insight-rail')).toBeNull();
    expect(flat(row).overflow).toBeUndefined();
    expect(flat(railOf(row)).height).toBe(TICK);
    expect(flat(railOf(row)).alignSelf).toBe('center');
    expect(flat(contentOf(row)).marginLeft).toBeUndefined();
    expect(configureNext).toHaveBeenCalledTimes(1);
  });

  it('with no face measurement the rail rides the box (§12.3 degrade) and the row still returns to idle', () => {
    const view = render(<Host />);
    fireEvent.press(view.getByText(FOLD_CONTROL_LABEL));
    act(() => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    // Folded, but the rail stayed in flow — no explicit height to hold.
    expect(view.getByTestId('insight-folded-strip')).toBeTruthy();
    expect(flat(view.getByTestId('insight-rail')).position).toBeUndefined();
    expect(flat(contentOf(view.getByTestId('insight-row'))).marginLeft).toBeUndefined();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(view.queryByTestId('insight-rail')).toBeNull();
    expect(view.queryByTestId('insight-strip-stage')).toBeNull();
  });

  it('the evidence closes with the fold, so the re-open lands on the face (§3.2)', () => {
    const view = render(<Host />);
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.getByText('Hide details')).toBeTruthy();
    fireEvent.press(view.getByText(FOLD_CONTROL_LABEL));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    fireEvent.press(view.getByTestId('insight-folded-strip'));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(view.getByText(SENTENCE)).toBeTruthy();
    expect(view.queryByText('Hide details')).toBeNull();
  });
});

describe('unfold — §12.2: the rail grows first, the box follows with one settle, the sentence lands', () => {
  it('runs the beats in order and every value reaches its end state', () => {
    const view = render(<Host start />);
    const row = view.getByTestId('insight-row');
    layout(contentOf(row), STRIP_H);

    // Press: the rail steps out of the flow at the strip's height, seeded EXACTLY as the
    // tick it replaces (scale 16/H, shifted to the strip's centre) — this commit changes
    // nothing the eye can see — and starts growing. The strip is still up, un-staged; the
    // host has not been told; no layout config.
    fireEvent.press(view.getByTestId('insight-folded-strip'));
    const rail = view.getByTestId('insight-rail');
    expect(flat(rail).position).toBe('absolute');
    expect(flat(rail).height).toBe(STRIP_H);
    const { scale, shift } = railValues(rail);
    expect(valueOf(scale)).toBeCloseTo(TICK / STRIP_H);
    expect(valueOf(shift)).toBe((STRIP_H - TICK) / 2 - theme.space2);
    expect(view.getByTestId('insight-folded-strip')).toBeTruthy();
    expect(view.queryByTestId('insight-strip-stage')).toBeNull();
    expect(configureNext).not.toHaveBeenCalled();
    expect(flat(row).overflow).toBe('hidden');

    // One frame: the rail's grow completes (mocked) — full height, no shift.
    act(() => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(valueOf(scale)).toBe(1);
    expect(valueOf(shift)).toBe(0);
    expect(configureNext).not.toHaveBeenCalled();

    // 80ms behind the rail: the unfold's layout config fires, the host opens, the face
    // mounts staged at 0 / −8.
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.railLagMs);
    });
    expect(configureNext).toHaveBeenCalledTimes(1);
    expect(configureNext).toHaveBeenCalledWith(UNFOLD_LAYOUT);
    expect(view.getByText(SENTENCE)).toBeTruthy();
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    const stage = animatedStyle<{ opacity: Animated.Value; transform: Array<{ translateY: Animated.Value }> }>(view.getByTestId('insight-face-stage'));
    expect(valueOf(stage.opacity)).toBe(0);
    expect(valueOf(stage.transform[0].translateY)).toBe(-FOLD_MOTION.driftPt);
    // The face's height lands: the rail's explicit height becomes the face's, so the line
    // fills the opening box.
    layout(contentOf(row), FACE_H);
    expect(flat(view.getByTestId('insight-rail')).height).toBe(FACE_H);

    // The face's fade and the sentence's landing complete (the landing after its delay).
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.landDelayMs + FRAME_MS);
    });
    expect(valueOf(stage.opacity)).toBe(1);
    expect(valueOf(stage.transform[0].translateY)).toBe(0);

    // The slack passes: idle, the shipped face tree.
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.settleSlackMs + 1);
    });
    expect(view.queryByTestId('insight-face-stage')).toBeNull();
    expect(view.queryByTestId('insight-rail')).toBeNull();
    expect(flat(row).overflow).toBeUndefined();
    expect(flat(railOf(row)).height).toBeUndefined();
    expect(flat(contentOf(row)).marginLeft).toBeUndefined();
    expect(contentOf(row).props.onLayout).toBeUndefined();
    expect(configureNext).toHaveBeenCalledTimes(1);
  });

  it('the unfold’s layout config is a spring on iOS at damping 0.7 — the fold’s is an ease, and neither carries a create fade', () => {
    expect(UNFOLD_LAYOUT.update).toEqual({ type: 'spring', springDamping: 0.7 });
    expect(UNFOLD_LAYOUT.duration).toBe(FOLD_MOTION.openMs);
    expect(FOLD_LAYOUT.update).toEqual({ type: 'easeInEaseOut' });
    expect(FOLD_LAYOUT.duration).toBe(FOLD_MOTION.closeMs);
    expect(FOLD_LAYOUT.create).toBeUndefined();
    expect(UNFOLD_LAYOUT.create).toBeUndefined();
    expect(FOLD_LAYOUT.delete).toBeUndefined();
    expect(UNFOLD_LAYOUT.delete).toBeUndefined();
  });

  it('a stored fold whose strip never reported its layout still opens — box and face, the rail riding the box', () => {
    const view = render(<Host start />);
    fireEvent.press(view.getByTestId('insight-folded-strip'));
    // No 80ms lead without a measurement: the box opens now.
    expect(configureNext).toHaveBeenCalledWith(UNFOLD_LAYOUT);
    expect(view.getByText(SENTENCE)).toBeTruthy();
    expect(flat(view.getByTestId('insight-rail')).position).toBeUndefined();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(view.queryByTestId('insight-face-stage')).toBeNull();
    expect(view.queryByTestId('insight-rail')).toBeNull();
  });
});

describe('what never animates (FS-9 / §12.3)', () => {
  it('an automatic re-open — `folded` flipping without a press — mounts the face on first paint with no config and no stage', () => {
    const view = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} folded onUnfold={jest.fn()} />);
    view.rerender(
      <InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} onUnfold={jest.fn()} backBecause="new_episode" />,
    );
    expect(view.getByText(SENTENCE)).toBeTruthy();
    expect(configureNext).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
    expect(view.queryByTestId('insight-face-stage')).toBeNull();
    expect(view.queryByTestId('insight-rail')).toBeNull();
  });

  it('a strip’s count changing (a window aging) is a plain re-render', () => {
    const view = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} folded onUnfold={jest.fn()} />);
    const aged: CachedFinding = { ...benign, finding: { ...postprandial, rapidCount: 6, eligibleCount: 6 } };
    view.rerender(<InsightCard cached={aged} petName="Nyx" onFold={jest.fn()} folded onUnfold={jest.fn()} />);
    expect(view.getByText('6 of 6 timed within 30 min of eating')).toBeTruthy();
    expect(configureNext).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
  });

  it('a fold that is stored on first paint renders the strip with nothing in flight', () => {
    const view = render(<Host start />);
    expect(view.getByTestId('insight-folded-strip')).toBeTruthy();
    expect(configureNext).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
  });
});

describe('reduced motion (§12.3: the crossfade is not motion)', () => {
  beforeEach(() => mockUseReducedMotion.mockReturnValue(true));

  it('fold: instant geometry, the host folds at the press, the strip crossfades over durationFast, no config, no translate, no rail choreography', () => {
    const view = render(<Host />);
    fireEvent.press(view.getByText(FOLD_CONTROL_LABEL));
    expect(view.getByTestId('insight-folded-strip')).toBeTruthy();
    expect(configureNext).not.toHaveBeenCalled();
    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls[0][1]).toMatchObject({ toValue: 1, duration: theme.durationFast, useNativeDriver: true });
    const stage = animatedStyle<{ opacity: Animated.Value; transform?: unknown }>(view.getByTestId('insight-strip-stage'));
    expect(valueOf(stage.opacity)).toBe(0);
    expect(stage.transform).toBeUndefined();
    expect(view.queryByTestId('insight-rail')).toBeNull();
    expect(flat(view.getByTestId('insight-row')).overflow).toBeUndefined();
    act(() => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(valueOf(stage.opacity)).toBe(1);
    expect(view.queryByTestId('insight-strip-stage')).toBeNull();
  });

  it('unfold: the host opens at the press, the face crossfades, no config, no translate', () => {
    const view = render(<Host start />);
    fireEvent.press(view.getByTestId('insight-folded-strip'));
    expect(view.getByText(SENTENCE)).toBeTruthy();
    expect(configureNext).not.toHaveBeenCalled();
    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls[0][1]).toMatchObject({ toValue: 1, duration: theme.durationFast });
    const stage = animatedStyle<{ opacity: Animated.Value; transform?: unknown }>(view.getByTestId('insight-face-stage'));
    expect(valueOf(stage.opacity)).toBe(0);
    expect(stage.transform).toBeUndefined();
    act(() => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(valueOf(stage.opacity)).toBe(1);
    expect(view.queryByTestId('insight-face-stage')).toBeNull();
  });
});

describe('a transition is one-shot: blur finishes it, a re-keyed row abandons it, presses mid-way are no-ops', () => {
  it('blur during the leave beat: the host folds at once, un-animated, and the tree is idle', () => {
    const onFold = jest.fn();
    const view = render(<InsightCard cached={benign} petName="Nyx" onFold={onFold} onUnfold={jest.fn()} />);
    fireEvent.press(view.getByText(FOLD_CONTROL_LABEL));
    expect(view.getByTestId('insight-face-stage')).toBeTruthy();
    expect(onFold).not.toHaveBeenCalled();
    mockUseAppActive.mockReturnValue(false);
    view.rerender(<InsightCard cached={benign} petName="Nyx" onFold={onFold} onUnfold={jest.fn()} />);
    expect(onFold).toHaveBeenCalledTimes(1);
    expect(configureNext).not.toHaveBeenCalled();
    expect(view.queryByTestId('insight-face-stage')).toBeNull();
    expect(view.queryByTestId('insight-rail')).toBeNull();
    // Nothing fires late once the app is back.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onFold).toHaveBeenCalledTimes(1);
    expect(configureNext).not.toHaveBeenCalled();
  });

  it('blur during the rail’s lead: the host opens at once, un-animated', () => {
    const onUnfold = jest.fn();
    const view = render(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} folded onUnfold={onUnfold} />);
    layout(contentOf(view.getByTestId('insight-row')), STRIP_H);
    fireEvent.press(view.getByTestId('insight-folded-strip'));
    expect(onUnfold).not.toHaveBeenCalled();
    mockUseAppActive.mockReturnValue(false);
    view.rerender(<InsightCard cached={benign} petName="Nyx" onFold={jest.fn()} folded onUnfold={onUnfold} />);
    expect(onUnfold).toHaveBeenCalledTimes(1);
    expect(configureNext).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onUnfold).toHaveBeenCalledTimes(1);
    expect(configureNext).not.toHaveBeenCalled();
  });

  it('the finding under the row changing mid-transition abandons it: nothing is committed for a finding that is gone', () => {
    const onFold = jest.fn();
    const view = render(<InsightCard cached={benign} petName="Nyx" onFold={onFold} onUnfold={jest.fn()} />);
    fireEvent.press(view.getByText(FOLD_CONTROL_LABEL));
    view.rerender(<InsightCard cached={other} petName="Nyx" onFold={onFold} onUnfold={jest.fn()} />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onFold).not.toHaveBeenCalled();
    expect(configureNext).not.toHaveBeenCalled();
    expect(view.queryByTestId('insight-face-stage')).toBeNull();
    expect(view.getByText('Another sentence.')).toBeTruthy();
  });

  it('a second `Keep it compact` and a face tap during the leave beat do nothing', () => {
    const onFold = jest.fn();
    const onTouch = jest.fn();
    const view = render(<InsightCard cached={benign} petName="Nyx" onFold={onFold} onTouch={onTouch} onUnfold={jest.fn()} />);
    fireEvent.press(view.getByText(FOLD_CONTROL_LABEL));
    fireEvent.press(view.getByText(FOLD_CONTROL_LABEL));
    fireEvent.press(view.getByTestId('insight-face'));
    expect(view.queryByText('Hide details')).toBeNull();
    expect(onTouch).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(onFold).toHaveBeenCalledTimes(1);
    expect(configureNext).toHaveBeenCalledTimes(1);
  });

  it('unmounting mid-transition leaves no timer to fire', () => {
    const onFold = jest.fn();
    const view = render(<InsightCard cached={benign} petName="Nyx" onFold={onFold} onUnfold={jest.fn()} />);
    fireEvent.press(view.getByText(FOLD_CONTROL_LABEL));
    act(() => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(onFold).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(() =>
      act(() => {
        jest.advanceTimersByTime(1000);
      }),
    ).not.toThrow();
  });
});

describe('the rail’s contract (§12.3): height only — never colour, opacity or width; identical on every class', () => {
  it('through a fold the rail keeps its colour, 0.85 opacity and 3pt width at every phase', () => {
    const view = render(<Host />);
    const row = view.getByTestId('insight-row');
    const before = flat(railOf(row));
    fireEvent.press(view.getByText(FOLD_CONTROL_LABEL));
    layout(contentOf(row), FACE_H);
    const leaving = flat(view.getByTestId('insight-rail'));
    act(() => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    layout(contentOf(row), STRIP_H);
    const closing = flat(view.getByTestId('insight-rail'));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    const after = flat(railOf(row));
    for (const s of [before, leaving, closing, after]) {
      expect(s.backgroundColor).toBe(theme.colorAccent);
      expect(s.opacity).toBe(0.85);
      expect(s.width).toBe(3);
    }
  });
});
