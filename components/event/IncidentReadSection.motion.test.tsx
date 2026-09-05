// The per-incident read's arrival (CUL-804, `docs/nyx-incident-screen-requirements.md` §7).
//
// What is pinned here is the CONTRACT of the choreography, not its look: the beats fire in
// the fold's order on the fold's constants; the rail leads and the box follows 80ms behind
// it; the sentence lands a beat after the box; the in-flight wrappers are absent from the
// idle tree in BOTH directions (waiting and settled); a read already on screen never
// arrives; a re-analysis over an owner's edit never arrives; a blur FINISHES; reduced
// motion is a crossfade with no `configureNext` and no translate; and a `worth_a_call`
// arrives on exactly the same timeline as a benign read, differing only in the rail's
// colour.
//
// The mocked native driver completes any animation on the next frame, whatever its
// duration, so a "beat completed" step is one frame; the 80ms lag is a real timer.

const mockUseReducedMotion = jest.fn(() => false);
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));
const mockUseAppActive = jest.fn(() => true);
jest.mock('../../hooks/useAppActive', () => ({
  useAppActive: () => mockUseAppActive(),
}));
jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, LayoutAnimation, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { FOLD_MOTION, UNFOLD_LAYOUT } from '../motion/foldMotion';
import { useIncidentArrival } from '../motion/arrivalMotion';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { IncidentReadCard, RAIL_TICK_HEIGHT, type IncidentVerdict } from './IncidentReadCard';
import { IncidentReadSection } from './IncidentReadSection';

const FRAME_MS = 20;
const PENDING_H = 48;
const CARD_H = 160;
const SLOT_Y = 22;
const TICK = RAIL_TICK_HEIGHT;

type Instance = ReturnType<typeof render>['root'];
const valueOf = (v: Animated.Value) => (v as unknown as { __getValue: () => number }).__getValue();
const flat = (node: Instance) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

/** The style an `Animated.View` was given — the one still holding `Animated.Value`s. The
 *  host View underneath carries resolved numbers, so the live values are read off the
 *  composite parent (the fold's motion-test idiom, verbatim). */
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
const transformValues = (node: Instance) => {
  const style = animatedStyle<{ transform?: Array<Record<string, Animated.Value>>; opacity?: Animated.Value }>(node);
  const t = style.transform ?? [];
  return {
    opacity: style.opacity,
    shift: t.find((x) => 'translateY' in x)?.translateY,
    scale: t.find((x) => 'scaleY' in x)?.scaleY,
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

/** The shape both analysis sections render: the stage owns the frame, the card takes the
 *  rail's beat, and `pending` is the union of the two waiting branches. */
function Host({
  pending,
  suppressed = false,
  verdict = 'monitor',
}: {
  /** Stands for both of the section's states: the pending box is the slot, and a read is
   *  being produced. The two come apart in the section (see `awaitingRead` there); here
   *  they are the same, because this host has no fetch of its own. */
  pending: boolean;
  suppressed?: boolean;
  verdict?: IncidentVerdict;
}) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const arrival = useIncidentArrival({
    awaitingRead: pending,
    suppressed,
    reducedMotion,
    appActive,
    identity: 'e1',
    tickHeight: RAIL_TICK_HEIGHT,
  });
  return (
    <IncidentReadSection arrival={arrival} pending={pending}>
      {pending ? null : (
        <IncidentReadCard
          verdict={verdict}
          label={verdict === 'worth_a_call' ? 'Worth a call' : 'Keep an eye out'}
          readText="Yellow, foamy, mostly bile."
          onHide={jest.fn()}
          arrival={arrival.rail}
        />
      )}
    </IncidentReadSection>
  );
}

const layout = (node: Instance, height: number, y = 0) =>
  fireEvent(node, 'layout', { nativeEvent: { layout: { x: 0, y, width: 320, height } } });

/** Mount waiting, measure the pending box, then land the read and measure the card —
 *  i.e. the real sequence, up to but not including beat 2's timer. */
function arrive(opts: { verdict?: IncidentVerdict; measurePending?: boolean; measureCard?: boolean } = {}) {
  const { verdict = 'monitor', measurePending = true, measureCard = true } = opts;
  const view = render(<Host pending verdict={verdict} />);
  if (measurePending) layout(view.getByTestId('incident-read-section').children[1] as Instance, PENDING_H, SLOT_Y);
  act(() => {
    view.rerender(<Host pending={false} verdict={verdict} />);
  });
  if (measureCard) act(() => layout(view.getByTestId('incident-read-land'), CARD_H));
  return view;
}

describe('the idle tree — §7: the arrival adds no node when nothing is in flight', () => {
  it('waiting: the pending box, a layout handler, and nothing else', () => {
    const { getByTestId, queryByTestId } = render(<Host pending />);
    const section = getByTestId('incident-read-section');
    expect(queryByTestId('incident-read-ghost')).toBeNull();
    expect(queryByTestId('incident-read-clip')).toBeNull();
    expect(queryByTestId('incident-read-land')).toBeNull();
    // The label, then the pending box. No wrapper between them.
    expect(section.children).toHaveLength(2);
    expect((section.children[1] as Instance).props.onLayout).toBeDefined();
  });

  it('a read already on screen: no wrappers, a plain rail, and not one `configureNext`', () => {
    const { getByTestId, queryByTestId } = render(<Host pending={false} />);
    act(() => jest.advanceTimersByTime(1000));
    expect(queryByTestId('incident-read-ghost')).toBeNull();
    expect(queryByTestId('incident-read-clip')).toBeNull();
    expect(queryByTestId('incident-read-land')).toBeNull();
    expect(configureNext).not.toHaveBeenCalled();
    // The rail is back in the card's flow: no explicit height, no absolute position.
    const rail = flat(getByTestId('incident-read-rail'));
    expect(rail.height).toBeUndefined();
    expect(rail.position).toBeUndefined();
    expect(rail.width).toBe(3);
  });

  it('the settled tree after an arrival is the same tree it would have painted cold', () => {
    const view = arrive();
    // Past every beat AND past the safety valve, so "settled" means settled by any route.
    act(() => jest.advanceTimersByTime(FOLD_MOTION.railLagMs));
    act(() =>
      jest.advanceTimersByTime(
        FOLD_MOTION.openMs + FOLD_MOTION.landDelayMs + FOLD_MOTION.landMs + FOLD_MOTION.settleSlackMs * 3,
      ),
    );

    expect(view.queryByTestId('incident-read-ghost')).toBeNull();
    expect(view.queryByTestId('incident-read-clip')).toBeNull();
    expect(view.queryByTestId('incident-read-land')).toBeNull();
    const rail = flat(view.getByTestId('incident-read-rail'));
    expect(rail.height).toBeUndefined();
    expect(rail.position).toBeUndefined();
  });
});

describe('the beats — §7, on the fold\'s constants', () => {
  it('beat 1: the rail leaves the flow, seeds at the tick, and grows over railLeadMs — before the box moves', () => {
    const view = arrive();

    // The box has NOT been told to open yet: beat 2 is 80ms out.
    expect(configureNext).not.toHaveBeenCalled();
    // The slot is holding the pending box's height, and clipping.
    const clip = flat(view.getByTestId('incident-read-clip'));
    expect(clip.height).toBe(PENDING_H);
    expect(clip.overflow).toBe('hidden');

    const rail = view.getByTestId('incident-read-rail');
    expect(flat(rail).position).toBe('absolute');
    expect(flat(rail).height).toBe(CARD_H);
    const { scale, shift } = transformValues(rail);
    // A `tick`-tall segment, centred where the pending tick was: the rail scales about its
    // own centre (CARD_H/2), the tick sat at the pending box's centre (PENDING_H/2).
    expect(valueOf(scale!)).toBeCloseTo(TICK / CARD_H, 5);
    expect(valueOf(shift!)).toBeCloseTo(PENDING_H / 2 - CARD_H / 2, 5);

    const railRuns = timing.mock.calls.filter(
      ([v]) => v === scale || v === shift,
    );
    expect(railRuns).toHaveLength(2);
    for (const [, cfg] of railRuns) expect(cfg.duration).toBe(FOLD_MOTION.railLeadMs);
  });

  it('beat 1: the pending box leaves in the rail\'s own window, out of the flow, at the slot\'s offset', () => {
    const view = arrive();
    // RTL hides it from the default query because it is hidden from assistive tech — which
    // is exactly the property the next two assertions pin, so ask for it by name.
    const ghost = view.getByTestId('incident-read-ghost', { includeHiddenElements: true });
    const style = flat(ghost);
    expect(style.position).toBe('absolute');
    expect(style.top).toBe(SLOT_Y);
    // A ghost of what just left must never be read out over the read that landed.
    expect(ghost.props.accessibilityElementsHidden).toBe(true);
    expect(ghost.props.importantForAccessibility).toBe('no-hide-descendants');

    const { opacity } = transformValues(ghost);
    expect(valueOf(opacity!)).toBe(1);
    const fade = timing.mock.calls.find(([v]) => v === opacity);
    expect(fade![1].toValue).toBe(0);
    expect(fade![1].duration).toBe(FOLD_MOTION.railLeadMs);
  });

  it('beat 2: 80ms behind the rail the box opens on UNFOLD_LAYOUT and the held height is released', () => {
    const view = arrive();
    expect(configureNext).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(FOLD_MOTION.railLagMs));

    expect(configureNext).toHaveBeenCalledTimes(1);
    expect(configureNext).toHaveBeenCalledWith(UNFOLD_LAYOUT);
    // Released — but still clipping, so the box opens AROUND the content rather than
    // revealing all of it the instant the height goes.
    const clip = flat(view.getByTestId('incident-read-clip'));
    expect(clip.height).toBeUndefined();
    expect(clip.overflow).toBe('hidden');
  });

  it('beat 3: the sentence lands as one block, a beat after the box, over landMs from −space1', () => {
    const view = arrive();
    const land = view.getByTestId('incident-read-land');
    const { opacity, shift } = transformValues(land);
    expect(valueOf(opacity!)).toBe(0);
    expect(valueOf(shift!)).toBe(-FOLD_MOTION.driftPt);
    expect(FOLD_MOTION.driftPt).toBe(theme.space1);

    act(() => jest.advanceTimersByTime(FOLD_MOTION.railLagMs));

    const fade = timing.mock.calls.find(([v, c]) => v === opacity && c.toValue === 1);
    expect(fade![1].duration).toBe(FOLD_MOTION.openMs);
    const drift = timing.mock.calls.find(([v, c]) => v === shift && c.toValue === 0);
    expect(drift![1].duration).toBe(FOLD_MOTION.landMs);
    expect(drift![1].delay).toBe(FOLD_MOTION.landDelayMs);
  });

  it('every beat runs on the native driver — geometry is LayoutAnimation\'s job, and only its', () => {
    arrive();
    act(() => jest.advanceTimersByTime(FOLD_MOTION.railLagMs));
    expect(timing.mock.calls.length).toBeGreaterThan(0);
    for (const [, cfg] of timing.mock.calls) expect(cfg.useNativeDriver).toBe(true);
  });
});

describe('G4 — same physics on every verdict', () => {
  const timeline = (verdict: IncidentVerdict) => {
    arrive({ verdict });
    act(() => jest.advanceTimersByTime(FOLD_MOTION.railLagMs));
    return timing.mock.calls.map(([, cfg]) => `${cfg.toValue}/${cfg.duration}/${cfg.delay ?? 0}`).sort();
  };

  it('a worth_a_call arrives on the same timeline as a benign read', () => {
    const calm = timeline('monitor');
    timing.mockClear();
    configureNext.mockClear();
    const attn = timeline('worth_a_call');
    expect(attn).toEqual(calm);
  });

  it('the rose rail is the whole difference, and it is a colour, not a beat', () => {
    const benign = arrive({ verdict: 'monitor' });
    const calmRail = flat(benign.getByTestId('incident-read-rail'));
    benign.unmount();
    const escalating = arrive({ verdict: 'worth_a_call' });
    const attnRail = flat(escalating.getByTestId('incident-read-rail'));

    expect(attnRail.backgroundColor).toBe(theme.colorEventSymptom);
    expect(calmRail.backgroundColor).toBe(theme.colorBorderStrong);
    expect(attnRail.height).toBe(calmRail.height);
    expect(attnRail.width).toBe(calmRail.width);
    expect(attnRail.position).toBe(calmRail.position);
  });
});

describe('what never arrives (§7)', () => {
  it('a re-analysis over an owner\'s edit swaps un-animated', () => {
    const view = render(<Host pending suppressed />);
    layout(view.getByTestId('incident-read-section').children[1] as Instance, PENDING_H, SLOT_Y);
    act(() => {
      view.rerender(<Host pending={false} suppressed />);
    });
    act(() => jest.advanceTimersByTime(1000));

    expect(configureNext).not.toHaveBeenCalled();
    expect(view.queryByTestId('incident-read-ghost')).toBeNull();
    expect(view.queryByTestId('incident-read-clip')).toBeNull();
    expect(flat(view.getByTestId('incident-read-rail')).position).toBeUndefined();
  });

  it('reduced motion is a crossfade: no configureNext, no translate, no ghost', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const view = render(<Host pending />);
    act(() => {
      view.rerender(<Host pending={false} />);
    });

    expect(configureNext).not.toHaveBeenCalled();
    expect(view.queryByTestId('incident-read-ghost')).toBeNull();
    expect(view.queryByTestId('incident-read-clip')).toBeNull();
    const land = view.getByTestId('incident-read-land');
    const { opacity, shift } = transformValues(land);
    expect(shift).toBeUndefined();
    const fade = timing.mock.calls.find(([v]) => v === opacity);
    expect(fade![1].toValue).toBe(1);
    expect(fade![1].duration).toBe(theme.durationFast);
    // The rail never leaves the card's flow under reduced motion.
    expect(flat(view.getByTestId('incident-read-rail')).position).toBeUndefined();
  });
});

describe('the degrades', () => {
  it('an unmeasured pending box: the rail rides the box, and the other two beats still run', () => {
    const view = arrive({ measurePending: false });

    // No seed to grow from, so the rail stays in the card's flow (§12.3's degrade).
    expect(flat(view.getByTestId('incident-read-rail')).position).toBeUndefined();
    // …and no height is held, so the box has nothing to open from.
    expect(flat(view.getByTestId('incident-read-clip')).height).toBeUndefined();

    act(() => jest.advanceTimersByTime(FOLD_MOTION.railLagMs));
    expect(configureNext).toHaveBeenCalledTimes(1);
    const { opacity } = transformValues(view.getByTestId('incident-read-land'));
    expect(timing.mock.calls.some(([v, c]) => v === opacity && c.toValue === 1)).toBe(true);
  });

  it('a content height that never reports: the arrival still ends, at its end state', () => {
    const view = arrive({ measureCard: false });
    expect(flat(view.getByTestId('incident-read-rail')).position).toBeUndefined();

    act(() => jest.advanceTimersByTime(FOLD_MOTION.railLagMs + FOLD_MOTION.openMs + FOLD_MOTION.settleSlackMs * 2 + FRAME_MS));
    expect(view.queryByTestId('incident-read-clip')).toBeNull();
    expect(view.queryByTestId('incident-read-ghost')).toBeNull();
  });
});

describe('app blur finishes the arrival, never pauses it', () => {
  it('a blur mid-flight commits the end state un-animated', () => {
    const view = arrive();
    const land = view.getByTestId('incident-read-land');
    const { opacity, shift } = transformValues(land);
    expect(valueOf(opacity!)).toBe(0);

    mockUseAppActive.mockReturnValue(false);
    act(() => {
      view.rerender(<Host pending={false} />);
    });

    // Landed, not half-arrived: the wrappers are gone and every value is at rest.
    expect(view.queryByTestId('incident-read-ghost')).toBeNull();
    expect(view.queryByTestId('incident-read-clip')).toBeNull();
    expect(valueOf(opacity!)).toBe(1);
    expect(valueOf(shift!)).toBe(0);
    expect(flat(view.getByTestId('incident-read-rail')).position).toBeUndefined();

    // And the beat it never reached does not fire late.
    const before = configureNext.mock.calls.length;
    act(() => jest.advanceTimersByTime(1000));
    expect(configureNext).toHaveBeenCalledTimes(before);
  });
});
