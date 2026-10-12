// The run's own open (CUL-1734, D1). What is pinned: the BEAT ORDER of §02/§03 (the chevron
// and the line on the tap, the box from t=80 on its own ease, each meal as the edge reaches
// it; on close the words, the box from t=40, the line from t=200), the TIME BUDGET at 2, 8
// and 12 meals (rest by ~320ms for two, never past 400ms), the box's own no-overshoot
// config (C-34), the shared machine's mechanism guards on this machine (no geometry change
// without a layout config in the same tick, walked over every reversal point; the clip
// only in flight), a reversal from where the motion is, and the Reduce Motion form.

import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';
import { Animated, LayoutAnimation } from 'react-native';
import { theme } from '../../constants/theme';
import { UNFOLD_LAYOUT } from './foldMotion';
import { OpenInPlaceReset } from './openInPlaceMotion';
import {
  RUN_CLOSE_BUDGET_MS,
  RUN_CLOSE_LAYOUT,
  RUN_MOTION,
  RUN_OPEN_LAYOUT,
  runLandStarts,
  runOpenBudgetMs,
  runOpenIdleMs,
  runReverseLayout,
  useRunOpen,
  type RunOpen,
} from './runOpenMotion';

const base = { identity: 'compact:m0', beadCenterY: 8.5, leadTop: 14, reducedMotion: false, appActive: true };
const valueOf = (v: Animated.Value) => (v as unknown as { __getValue: () => number }).__getValue();

type TimingCall = { value: Animated.Value; toValue: number; duration: number; delay: number; at: number };

/** `Animated.timing` on the fake clock, recording every beat with the time it was started.
 *  jest's native driver ends a beat in the tick it starts, which would collapse the phases
 *  these tests walk; each stand-in ends after its own delay + duration, and a stop ends it. */
function timedAnimations() {
  const calls: TimingCall[] = [];
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const call: TimingCall = {
      value: value as Animated.Value,
      toValue: config.toValue as number,
      duration: config.duration ?? 0,
      delay: config.delay ?? 0,
      at: -1,
    };
    const anim: Animated.CompositeAnimation = {
      start: (cb) => {
        call.at = Date.now();
        calls.push(call);
        timer = setTimeout(() => {
          timer = null;
          (value as Animated.Value).setValue(config.toValue as number);
          cb?.({ finished: true });
        }, call.delay + call.duration);
        anim.stop = () => {
          if (timer == null) return;
          clearTimeout(timer);
          timer = null;
          cb?.({ finished: false });
        };
      },
      stop: () => undefined,
      reset: () => undefined,
    };
    return anim;
  });
  return calls;
}

/** The clock, one millisecond per `act`, so every commit the machine makes is its own render. */
const tick = (ms: number) => {
  for (let i = 0; i < ms; i++) {
    act(() => {
      jest.advanceTimersByTime(1);
    });
  }
};

type Shot = { phase: string; geometry: string; clipped: boolean; calls: number };

/** The flow's geometry: what moves the rows beneath when it changes. A box mounted or
 *  unmounted SHUT (zero high) moves nothing, so only an un-shut box counts. */
const geometryOf = (m: RunOpen) => `${m.slotMounted && m.boxHeight === null}|${m.membersBelow}`;

function filmed(initial: { shown: boolean; held?: boolean }, extra: Partial<{ reducedMotion: boolean; count: number }> = {}) {
  const shots: Shot[] = [];
  const configureNext = LayoutAnimation.configureNext as unknown as jest.Mock;
  const hook = renderHook(
    (p: { shown: boolean; appActive?: boolean; identity?: string; held?: boolean }) => {
      const m = useRunOpen({ ...base, count: 2, ...extra, ...p });
      shots.push({ phase: m.phase, geometry: geometryOf(m), clipped: m.clipped, calls: configureNext.mock.calls.length });
      return m;
    },
    { initialProps: initial },
  );
  return { ...hook, shots };
}

/** Every render whose geometry differs from the one before must follow a fresh `configureNext`. */
function bareGeometryCommits(shots: Shot[]) {
  const bare: string[] = [];
  for (let i = 1; i < shots.length; i++) {
    const [a, b] = [shots[i - 1], shots[i]];
    if (a.geometry !== b.geometry && b.calls === a.calls) bare.push(`${a.phase} → ${b.phase} (${a.geometry} → ${b.geometry})`);
  }
  return bare;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useRunOpen — the beats (§02, §03)', () => {
  it('the box\'s config is its own: an ease out with no overshoot, its delay riding the config, never the fold\'s spring', () => {
    expect(RUN_OPEN_LAYOUT).not.toBe(UNFOLD_LAYOUT);
    expect(RUN_OPEN_LAYOUT.update).toEqual({ type: LayoutAnimation.Types.easeOut, delay: 80, duration: 240 });
    expect(RUN_CLOSE_LAYOUT.update).toEqual({ type: LayoutAnimation.Types.easeInEaseOut, delay: 40, duration: 200 });
    for (const c of [RUN_OPEN_LAYOUT, RUN_CLOSE_LAYOUT, runReverseLayout(150)]) {
      expect(c.update?.type).not.toBe(LayoutAnimation.Types.spring);
      expect(c.update?.springDamping).toBeUndefined();
    }
  });

  it.each([2, 8, 12])('open, %d meals: the box mounts shut; then one configured commit; the chevron and the line on it, the box at 80, each meal in order as the edge reaches it', (n) => {
    const calls = timedAnimations();
    const t = filmed({ shown: false }, { count: n });
    act(() => t.rerender({ shown: true }));
    // t=0: the box is mounted SHUT, nothing in the flow moves, nothing configured.
    expect(t.result.current.phase).toBe('primed');
    expect(t.result.current.slotMounted).toBe(true);
    expect(t.result.current.boxHeight).toBe(0);
    expect(t.result.current.membersBelow).toBe(false);
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
    tick(RUN_MOTION.mountFrameMs);
    // ONE configured commit lets the box go and yields the header's edge.
    expect(LayoutAnimation.configureNext).toHaveBeenCalledTimes(1);
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(RUN_OPEN_LAYOUT);
    expect(t.result.current.phase).toBe('opening');
    expect(t.result.current.boxHeight).toBeNull();
    expect(t.result.current.membersBelow).toBe(true);
    const v = t.result.current.values;
    const chevron = calls.find((c) => c.value === v.chevron)!;
    const lead = calls.find((c) => c.value === v.lead)!;
    expect(chevron).toMatchObject({ toValue: 1, duration: 200, delay: 0 });
    expect(lead).toMatchObject({ toValue: 1, duration: 80, delay: 0 });
    // Each meal: opacity and a 4pt drift over 150ms, in order, from the box's start, never after 250.
    const landings = v.members.slice(0, n).map((m) => calls.find((c) => c.value === m.opacity)!);
    const drifts = v.members.slice(0, n).map((m) => calls.find((c) => c.value === m.shift)!);
    expect(landings).toHaveLength(n);
    expect(landings[0].delay).toBe(RUN_MOTION.boxDelayMs);
    for (let i = 0; i < n; i++) {
      expect(landings[i]).toMatchObject({ toValue: 1, duration: 150 });
      expect(drifts[i]).toMatchObject({ toValue: 0, duration: 150, delay: landings[i].delay });
      expect(landings[i].delay).toBeLessThanOrEqual(RUN_MOTION.landCapMs);
      if (i > 0) expect(landings[i].delay).toBeGreaterThan(landings[i - 1].delay);
    }
    // The meals started 4pt up and clear.
    expect(lead.delay).toBeLessThan(RUN_OPEN_LAYOUT.update!.delay!);
  });

  it.each([
    [2, 320],
    [8, 385],
    [12, 400],
  ])('the budget at %d meals: at rest by %dms after the box\'s commit, never past 400', (n, expected) => {
    timedAnimations();
    expect(Math.round(runOpenBudgetMs(runLandStarts(n)))).toBe(expected);
    expect(runOpenBudgetMs(runLandStarts(n))).toBeLessThanOrEqual(400);
    // The idle commit waits one frame past the box's keyframe (Fabric starts it on the next
    // commit), never past the last meal's landing: the clip never comes off a moving box.
    const budget = runOpenIdleMs(runLandStarts(n));
    expect(budget).toBe(Math.max(runOpenBudgetMs(runLandStarts(n)), 80 + 240 + RUN_MOTION.mountFrameMs));
    const t = filmed({ shown: false }, { count: n });
    act(() => t.rerender({ shown: true }));
    tick(RUN_MOTION.mountFrameMs + Math.ceil(budget) - 2);
    expect(t.result.current.phase).toBe('opening');
    tick(2);
    expect(t.result.current.phase).toBe('open');
    expect(t.result.current.clipped).toBe(false);
    for (const m of t.result.current.values.members.slice(0, n)) expect(valueOf(m.opacity)).toBe(1);
  });

  it('a meal lands where the measured edge reaches it, and the cap holds a tall run to 250', () => {
    // Three meals, 60pt each in a 180pt box: the edge reaches 8pt into each.
    const starts = runLandStarts(3, [0, 60, 120], 180);
    const edge = (top: number) => 80 + 240 * (1 - Math.sqrt(1 - (top + 8) / 180));
    expect(starts).toEqual([edge(0), edge(60), edge(120)]);
    expect(runLandStarts(3, [0, 60, 175], 180)[2]).toBe(250);
  });

  it('close: one configured commit takes the box to zero; the words leave over 100; the line from t=200 over 80; the box unmounts at 280', () => {
    const calls = timedAnimations();
    const t = filmed({ shown: true });
    const v = t.result.current.values;
    act(() => t.rerender({ shown: false }));
    expect(LayoutAnimation.configureNext).toHaveBeenCalledTimes(1);
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(RUN_CLOSE_LAYOUT);
    expect(t.result.current.phase).toBe('closing');
    expect(t.result.current.boxHeight).toBe(0);
    expect(t.result.current.membersBelow).toBe(false);
    expect(calls.find((c) => c.value === v.chevron)).toMatchObject({ toValue: 0, duration: 200, delay: 0 });
    expect(calls.find((c) => c.value === v.lead)).toMatchObject({ toValue: 0, duration: 80, delay: 200 });
    for (const m of v.members.slice(0, 2)) {
      expect(calls.find((c) => c.value === m.opacity)).toMatchObject({ toValue: 0, duration: 100, delay: 0 });
      expect(calls.find((c) => c.value === m.shift)).toMatchObject({ toValue: -4, duration: 100 });
    }
    expect(RUN_CLOSE_BUDGET_MS).toBe(280);
    tick(RUN_CLOSE_BUDGET_MS - 1);
    expect(t.result.current.slotMounted).toBe(true);
    tick(1);
    expect(t.result.current.phase).toBe('closed');
    expect(t.result.current.slotMounted).toBe(false);
  });

  it('a close after a FRESH open is the same close (the common path, C-35)', () => {
    timedAnimations();
    const t = filmed({ shown: false });
    act(() => t.rerender({ shown: true }));
    tick(RUN_MOTION.mountFrameMs + 400);
    expect(t.result.current.phase).toBe('open');
    act(() => t.rerender({ shown: false }));
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(RUN_CLOSE_LAYOUT);
    tick(RUN_CLOSE_BUDGET_MS);
    expect(t.result.current.phase).toBe('closed');
    expect(bareGeometryCommits(t.shots)).toEqual([]);
  });
});

describe('useRunOpen — a second tap reverses from where it is', () => {
  it('mid-open: the box turns round from its frame on a fresh config, every value from where it is, over the elapsed time', () => {
    const calls = timedAnimations();
    const t = filmed({ shown: false }, { count: 12 });
    act(() => t.rerender({ shown: true }));
    tick(RUN_MOTION.mountFrameMs + 200);
    const v = t.result.current.values;
    const before = calls.length;
    // The last of twelve meals has not landed yet (it starts at 250): it is still clear.
    const lastBefore = valueOf(v.members[11].opacity);
    expect(lastBefore).toBe(0);
    act(() => t.rerender({ shown: false }));
    // Nothing jumps to an end first: the meal turns round from where it is.
    expect(valueOf(v.members[11].opacity)).toBe(lastBefore);
    // 200ms into the box's opening: a reverse over 200ms, no delay, from the frame on screen.
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(runReverseLayout(200));
    expect(t.result.current.phase).toBe('closing');
    const turned = calls.slice(before);
    // Every value turns round from where it is: a timing, never a setValue to an end first.
    expect(turned.find((c) => c.value === v.chevron)).toMatchObject({ toValue: 0, duration: 200, delay: 0 });
    expect(turned.find((c) => c.value === v.lead)).toMatchObject({ toValue: 0, duration: 200 });
    expect(turned.filter((c) => c.value === v.members[11].opacity)).toHaveLength(1);
    tick(199 + RUN_MOTION.mountFrameMs);
    expect(t.result.current.slotMounted).toBe(true);
    tick(1);
    expect(t.result.current.phase).toBe('closed');
  });

  it('a reversal never takes less than 120ms', () => {
    timedAnimations();
    const t = filmed({ shown: false });
    act(() => t.rerender({ shown: true }));
    tick(RUN_MOTION.mountFrameMs + 30);
    act(() => t.rerender({ shown: false }));
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(runReverseLayout(RUN_MOTION.reverseFloorMs));
  });

  it('mid-close: the box re-opens from its frame; the members never unmount; at rest open', () => {
    timedAnimations();
    const t = filmed({ shown: true });
    act(() => t.rerender({ shown: false }));
    tick(150);
    act(() => t.rerender({ shown: true }));
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(runReverseLayout(150));
    expect(t.result.current.phase).toBe('opening');
    expect(t.shots.every((s) => s.phase !== 'closed' && s.phase !== 'primed')).toBe(true);
    tick(150 + RUN_MOTION.mountFrameMs);
    expect(t.result.current.phase).toBe('open');
  });

  it('a second tap on the shut box (before it has moved) leaves with nothing to undo', () => {
    timedAnimations();
    const t = filmed({ shown: false });
    act(() => t.rerender({ shown: true }));
    act(() => t.rerender({ shown: false }));
    expect(t.result.current.phase).toBe('closed');
    tick(1000);
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
  });
});

describe('useRunOpen — no geometry change without a layout config in the same tick; the clip only in flight', () => {
  const OPEN_POINTS = Array.from({ length: 42 }, (_, i) => i * 10);
  const CLOSE_POINTS = Array.from({ length: 29 }, (_, i) => i * 10);

  it.each(OPEN_POINTS)('a second tap %dms into an open (12 meals) reverses with no bare geometry commit', (at) => {
    timedAnimations();
    const t = filmed({ shown: false }, { count: 12 });
    act(() => t.rerender({ shown: true }));
    tick(at);
    act(() => t.rerender({ shown: false }));
    tick(500);
    expect(t.result.current.phase).toBe('closed');
    expect(bareGeometryCommits(t.shots)).toEqual([]);
    for (const s of t.shots) expect(s.clipped).toBe(s.phase !== 'open' && s.phase !== 'closed');
  });

  it.each(CLOSE_POINTS)('a second tap %dms into a close reverses with no bare geometry commit', (at) => {
    timedAnimations();
    const t = filmed({ shown: true }, { count: 12 });
    act(() => t.rerender({ shown: false }));
    tick(at);
    act(() => t.rerender({ shown: true }));
    tick(500);
    expect(t.result.current.phase).toBe('open');
    expect(bareGeometryCommits(t.shots)).toEqual([]);
    for (const s of t.shots) expect(s.clipped).toBe(s.phase !== 'open' && s.phase !== 'closed');
  });
});

describe('useRunOpen — a layout report never becomes a commit mid-flight (the lead\'s frame)', () => {
  it('the header growing as it yields its edge changes the lead\'s height only on the machine\'s next commit, never under its scale', () => {
    timedAnimations();
    const t = filmed({ shown: false });
    act(() => t.result.current.onHeaderLayout(50));
    act(() => t.rerender({ shown: true }));
    expect(t.result.current.leadHeight).toBe(50 - base.leadTop);
    tick(RUN_MOTION.mountFrameMs + 10);
    expect(t.result.current.phase).toBe('opening');
    // The header grows by the gap it now carries: the report lands while the lead scales.
    const renders = t.shots.length;
    act(() => t.result.current.onHeaderLayout(64));
    expect(t.shots.length).toBe(renders);
    expect(t.result.current.leadHeight).toBe(50 - base.leadTop);
    tick(500);
    expect(t.result.current.phase).toBe('open');
    expect(t.result.current.leadHeight).toBe(64 - base.leadTop);
  });
});

describe('useRunOpen — Reduce Motion, blur, re-key, reset', () => {
  it('Reduce Motion: the box at once, the line and the meals crossfade over 150ms, the chevron swaps, no config', () => {
    const calls = timedAnimations();
    const t = filmed({ shown: false }, { reducedMotion: true });
    act(() => t.rerender({ shown: true }));
    const v = t.result.current.values;
    expect(t.result.current.slotMounted).toBe(true);
    expect(t.result.current.boxHeight).toBeNull();
    expect(valueOf(v.chevron)).toBe(1);
    expect(valueOf(v.lead)).toBe(1);
    const fades = calls.filter((c) => c.duration === theme.durationFast && c.toValue === 1);
    expect(fades.map((c) => c.value)).toEqual(expect.arrayContaining([v.line, v.members[0].opacity, v.members[1].opacity]));
    expect(calls.some((c) => c.value === v.chevron || c.value === v.lead || c.value === v.members[0].shift)).toBe(false);
    tick(theme.durationFast);
    expect(t.result.current.phase).toBe('open');
    act(() => t.rerender({ shown: false }));
    expect(valueOf(v.chevron)).toBe(0);
    tick(theme.durationFast);
    expect(t.result.current.phase).toBe('closed');
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
  });

  it('a blur finishes the transition at the state the host asked for', () => {
    timedAnimations();
    const t = filmed({ shown: false });
    act(() => t.rerender({ shown: true }));
    tick(RUN_MOTION.mountFrameMs + 50);
    act(() => t.rerender({ shown: true, appActive: false }));
    expect(t.result.current.phase).toBe('open');
    expect(valueOf(t.result.current.values.members[1].opacity)).toBe(1);
  });

  it('a re-key under an open run lands with no motion and no config', () => {
    timedAnimations();
    const t = filmed({ shown: true });
    act(() => t.rerender({ shown: true, identity: 'compact:m9' }));
    expect(t.result.current.phase).toBe('open');
    tick(500);
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
  });

  it('held by a drawing thread (CUL-1757): an open and a close wait, configure nothing, then run as asked once it settles', () => {
    timedAnimations();
    const t = filmed({ shown: false, held: true });
    act(() => t.rerender({ shown: true, held: true }));
    tick(100);
    expect(t.result.current.phase).toBe('closed');
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
    act(() => t.rerender({ shown: true, held: false }));
    tick(RUN_MOTION.mountFrameMs);
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(RUN_OPEN_LAYOUT);
    tick(500);
    expect(t.result.current.phase).toBe('open');
    (LayoutAnimation.configureNext as unknown as jest.Mock).mockClear();
    act(() => t.rerender({ shown: false, held: true }));
    tick(100);
    expect(t.result.current.phase).toBe('open');
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
    act(() => t.rerender({ shown: false, held: false }));
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(RUN_CLOSE_LAYOUT);
    tick(RUN_CLOSE_BUDGET_MS);
    expect(t.result.current.phase).toBe('closed');
    expect(bareGeometryCommits(t.shots)).toEqual([]);
  });

  it('a host\'s reset lands the run at once, with no choreography and no config', () => {
    timedAnimations();
    let gen = 0;
    const wrapper = ({ children }: { children: ReactNode }) => createElement(OpenInPlaceReset.Provider, { value: gen }, children);
    const hook = renderHook((p: { shown: boolean }) => useRunOpen({ ...base, count: 2, ...p }), {
      initialProps: { shown: true },
      wrapper,
    });
    gen = 1;
    act(() => hook.rerender({ shown: false }));
    expect(hook.result.current.phase).toBe('closed');
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
  });
});
