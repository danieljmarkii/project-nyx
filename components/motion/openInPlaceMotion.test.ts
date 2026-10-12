// The day opening in place (CUL-1067) — the fold's physics on a new surface. What is
// pinned: the ORDER (the rail leads, the box follows, the rows land; the reverse on
// close), that every beat is the fold's own constant (C-30 — a restated number would
// pass a screenshot and drift), that reduced motion is a crossfade with no layout
// commit, that a blur finishes at the asked-for state, and that a re-key under an
// open row moves with no motion at all.
//
// CUL-1721 adds the machine's mechanism guards: no geometry change without a layout config
// in the same tick (walked over every path, reversals included), the clip while in flight,
// the close after a FRESH open (the common path, which the mounted-open fixture hid, C-35),
// a second tap reversing from where it is, a host's reset, and the time budget.

import { act, renderHook } from '@testing-library/react-native';
import { Animated, LayoutAnimation } from 'react-native';
import { FOLD_LAYOUT, FOLD_MOTION, UNFOLD_LAYOUT } from './foldMotion';
import { createElement, type ReactNode } from 'react';
import {
  LEAD_LAYOUT,
  OPEN_IN_PLACE_BUDGET_MS,
  OPEN_IN_PLACE_LEAD_PT,
  OpenInPlaceReset,
  TAIL_LAYOUT,
  useOpenInPlace,
  type OpenInPlace,
} from './openInPlaceMotion';

const base = { identity: '2026-09-02', reducedMotion: false, appActive: true };
const valueOf = (v: { __getValue: () => number }) => v.__getValue();

describe('useOpenInPlace', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });


  it('closed at rest renders nothing; open at rest is the shipped tree', () => {
    const closed = renderHook(() => useOpenInPlace({ ...base, shown: false }));
    expect(closed.result.current.phase).toBe('closed');
    expect(closed.result.current.slotMounted).toBe(false);
    expect(closed.result.current.rowsMounted).toBe(false);
    const open = renderHook(() => useOpenInPlace({ ...base, shown: true }));
    expect(open.result.current.phase).toBe('open');
    expect(open.result.current.rowsMounted).toBe(true);
    expect(open.result.current.railHeight).toBeNull();
    expect(open.result.current.slotMinHeight).toBe(OPEN_IN_PLACE_LEAD_PT);
  });

  it('open: the rail leads (no rows yet), the box follows railLagMs later under the fold\'s spring, the rows land', () => {
    const { result, rerender } = renderHook((p: { shown: boolean }) => useOpenInPlace({ ...base, ...p }), {
      initialProps: { shown: false },
    });
    act(() => rerender({ shown: true }));
    // Beat 1: the rail is out of the flow with its lead height, growing; the rows are NOT mounted.
    expect(result.current.phase).toBe('leading');
    expect(result.current.slotMounted).toBe(true);
    expect(result.current.rowsMounted).toBe(false);
    expect(result.current.railHeight).toBe(OPEN_IN_PLACE_LEAD_PT);
    // The slot's mount moves the grid beneath, so it carries the lead's own config (CUL-1721).
    expect(LayoutAnimation.configureNext).toHaveBeenCalledTimes(1);
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(LEAD_LAYOUT);
    // Beat 2: railLagMs later, ONE layout commit (the fold's own unfold config) and the rows mount.
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.railLagMs);
    });
    expect(LayoutAnimation.configureNext).toHaveBeenCalledTimes(2);
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(UNFOLD_LAYOUT);
    expect(['opening', 'open']).toContain(result.current.phase);
    expect(result.current.rowsMounted).toBe(true);
    // Beat 3: the rows land and the tree returns to idle — the rail back in the flow.
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.openMs + FOLD_MOTION.landMs + FOLD_MOTION.settleSlackMs * 2);
    });
    expect(result.current.phase).toBe('open');
    expect(result.current.railHeight).toBeNull();
    expect(valueOf(result.current.values.railScale as never)).toBe(1);
    expect(valueOf(result.current.values.rowsOpacity as never)).toBe(1);
    expect(valueOf(result.current.values.rowsShift as never)).toBe(0);
  });

  it('close: the rows leave first, then the box closes under the fold\'s ease, then the rail trails and the slot leaves', () => {
    const { result, rerender } = renderHook((p: { shown: boolean }) => useOpenInPlace({ ...base, ...p }), {
      initialProps: { shown: true },
    });
    act(() => result.current.onSlotLayout(120));
    act(() => rerender({ shown: false }));
    // Beat 1: the rows are leaving — still mounted, fading; the rail holds the box's height.
    expect(['leaving', 'closing', 'closed']).toContain(result.current.phase);
    if (result.current.phase === 'leaving') {
      expect(result.current.rowsMounted).toBe(true);
      expect(result.current.railHeight).toBe(120);
      expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
    }
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.leaveMs + 1);
    });
    // Beat 2: the box has closed — the fold's own config, the rows gone, the slot still there.
    expect(LayoutAnimation.configureNext).toHaveBeenCalledWith(FOLD_LAYOUT);
    if (result.current.phase === 'closing') {
      expect(result.current.rowsMounted).toBe(false);
      expect(result.current.slotMounted).toBe(true);
    }
    // Beat 3: the rail trails, then the slot leaves.
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.railLagMs + FOLD_MOTION.railTrailMs + FOLD_MOTION.settleSlackMs * 3 + FOLD_MOTION.closeMs);
    });
    expect(result.current.phase).toBe('closed');
    expect(result.current.slotMounted).toBe(false);
  });

  it('the beats are the fold\'s own, imported — and the label lands after the box begins', () => {
    // C-30: nothing here restates a duration. The constants used are the fold's, and the
    // one ordering the gesture exists for (rows after box, rail before box) is pinned.
    expect(FOLD_MOTION.railLagMs).toBeLessThan(FOLD_MOTION.railLeadMs);
    expect(FOLD_MOTION.landDelayMs).toBeGreaterThan(0);
    expect(UNFOLD_LAYOUT.duration).toBe(FOLD_MOTION.openMs);
    expect(FOLD_LAYOUT.duration).toBe(FOLD_MOTION.closeMs);
  });

  it('reduced motion: a crossfade, no layout commit, nothing moves', () => {
    const { result, rerender } = renderHook((p: { shown: boolean }) => useOpenInPlace({ ...base, reducedMotion: true, ...p }), {
      initialProps: { shown: false },
    });
    act(() => rerender({ shown: true }));
    expect(['crossfade', 'open']).toContain(result.current.phase);
    expect(result.current.rowsMounted).toBe(true);
    expect(valueOf(result.current.values.rowsShift as never)).toBe(0);
    expect(valueOf(result.current.values.railScale as never)).toBe(1);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.phase).toBe('open');
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
    act(() => rerender({ shown: false }));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.phase).toBe('closed');
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
  });

  it('a blur FINISHES the transition at the state the host asked for', () => {
    const { result, rerender } = renderHook(
      (p: { shown: boolean; appActive: boolean }) => useOpenInPlace({ ...base, ...p }),
      { initialProps: { shown: false, appActive: true } },
    );
    act(() => rerender({ shown: true, appActive: true }));
    expect(result.current.phase).toBe('leading');
    act(() => rerender({ shown: true, appActive: false }));
    expect(result.current.phase).toBe('open');
    expect(result.current.rowsMounted).toBe(true);
    expect(result.current.railHeight).toBeNull();
    expect(valueOf(result.current.values.rowsOpacity as never)).toBe(1);
  });

  it('a slot whose identity arrives WITH its first open still runs the choreography (an open is not a re-key)', () => {
    const { result, rerender } = renderHook(
      (p: { shown: boolean; identity: string }) => useOpenInPlace({ ...base, ...p }),
      { initialProps: { shown: false, identity: '' } },
    );
    act(() => rerender({ shown: true, identity: '2026-09-02' }));
    expect(result.current.phase).toBe('leading');
    expect(result.current.rowsMounted).toBe(false);
  });

  it('a re-key under an open row renders the new day with no motion and no layout commit', () => {
    const { result, rerender } = renderHook(
      (p: { shown: boolean; identity: string }) => useOpenInPlace({ ...base, ...p }),
      { initialProps: { shown: true, identity: '2026-09-02' } },
    );
    act(() => rerender({ shown: true, identity: '2026-09-11' }));
    expect(result.current.phase).toBe('open');
    expect(result.current.rowsMounted).toBe(true);
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
  });

});

// ── CUL-1721: the mechanism guards ──────────────────────────────────────────────────

type Shot = { phase: string; geometry: string; railHeight: number | null; clipped: boolean; calls: number };

/** The flow's geometry as one string: what moves the rows beneath when it changes. The
 *  rail is absolute, so its height is not in it (its own rule is checked separately). */
const geometryOf = (m: OpenInPlace) =>
  `${m.slotMounted}|${m.rowsMounted}|${m.slotMounted ? m.slotMinHeight : '-'}|${m.membersBelow}`;

/** Renders the hook and records every render with the `configureNext` count at that moment. */
function filmed(initial: { shown: boolean }, extra: Partial<{ reducedMotion: boolean }> = {}) {
  const shots: Shot[] = [];
  const configureNext = LayoutAnimation.configureNext as unknown as jest.Mock;
  const hook = renderHook(
    (p: { shown: boolean }) => {
      const m = useOpenInPlace({ ...base, ...extra, ...p });
      shots.push({ phase: m.phase, geometry: geometryOf(m), railHeight: m.railHeight, clipped: m.clipped, calls: configureNext.mock.calls.length });
      return m;
    },
    { initialProps: initial },
  );
  return { ...hook, shots };
}

/** Every render whose geometry differs from the one before must follow a fresh
 *  `configureNext` — the same tick, since the call and the state change are synchronous. */
function bareGeometryCommits(shots: Shot[]) {
  const bare: string[] = [];
  for (let i = 1; i < shots.length; i++) {
    const [a, b] = [shots[i - 1], shots[i]];
    if (a.geometry !== b.geometry && b.calls === a.calls) bare.push(`${a.phase} → ${b.phase} (${a.geometry} → ${b.geometry})`);
  }
  return bare;
}

/** The rail's height may change only on a commit with no layout config, or with the slot's
 *  own mount (a created view is never layout-animated): never under a layout keyframe. */
function railHeightUnderConfig(shots: Shot[]) {
  const bad: string[] = [];
  for (let i = 1; i < shots.length; i++) {
    const [a, b] = [shots[i - 1], shots[i]];
    const mounting = a.phase === 'closed';
    if (a.railHeight !== b.railHeight && b.calls !== a.calls && !mounting && b.railHeight != null) bad.push(`${a.phase} → ${b.phase}`);
  }
  return bad;
}

/** The clock, one millisecond per `act`: inside one `act` React batches every state
 *  update into one render, which would hide the very commits these guards inspect. */
const tick = (ms: number) => {
  for (let i = 0; i < ms; i++) {
    act(() => {
      jest.advanceTimersByTime(1);
    });
  }
};

/** `Animated.timing` on the clock: jest's native driver completes a beat in the tick it
 *  starts, which collapses the phases this file's guards walk. Each stand-in ends after its
 *  own delay + duration on the fake timers, and a stop ends it unfinished. */
function timedAnimations() {
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const anim: Animated.CompositeAnimation = {
      start: (cb) => {
        timer = setTimeout(() => {
          timer = null;
          (value as Animated.Value).setValue(config.toValue as number);
          cb?.({ finished: true });
        }, (config.delay ?? 0) + (config.duration ?? 0));
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
}

describe('useOpenInPlace — no geometry change without a layout config in the same tick (CUL-1721)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
    timedAnimations();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('a fresh open, then its close: every geometry commit is configured, the slot\'s mount and its removal included', () => {
    const t = filmed({ shown: false });
    act(() => t.rerender({ shown: true }));
    tick(OPEN_IN_PLACE_BUDGET_MS.open + 100);
    expect(t.result.current.phase).toBe('open');
    act(() => t.rerender({ shown: false }));
    tick(OPEN_IN_PLACE_BUDGET_MS.close + 100);
    expect(t.result.current.phase).toBe('closed');
    expect(bareGeometryCommits(t.shots)).toEqual([]);
    expect(railHeightUnderConfig(t.shots)).toEqual([]);
    // The slot leaves on the tail's own config, the box having closed to zero on the fold's.
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(TAIL_LAYOUT);
    expect(t.shots.filter((s) => s.phase === 'closing').map((s) => s.geometry)).toContain('true|false|0|false');
  });

  // A second tap at every 10ms of each direction: the reversal is configured, every time.
  const OPEN_POINTS = Array.from({ length: Math.ceil(OPEN_IN_PLACE_BUDGET_MS.open / 10) }, (_, i) => i * 10);
  const CLOSE_POINTS = Array.from({ length: Math.ceil(OPEN_IN_PLACE_BUDGET_MS.close / 10) }, (_, i) => i * 10);

  it.each(OPEN_POINTS)('a second tap %dms into an open reverses with no bare geometry commit', (at) => {
    const t = filmed({ shown: false });
    act(() => t.rerender({ shown: true }));
    tick(at);
    act(() => t.rerender({ shown: false }));
    tick(OPEN_IN_PLACE_BUDGET_MS.close + FOLD_MOTION.openMs + 200);
    expect(t.result.current.phase).toBe('closed');
    expect(bareGeometryCommits(t.shots)).toEqual([]);
    expect(railHeightUnderConfig(t.shots)).toEqual([]);
  });

  it.each(CLOSE_POINTS)('a second tap %dms into a close reverses with no bare geometry commit', (at) => {
    const t = filmed({ shown: false });
    act(() => t.rerender({ shown: true }));
    tick(OPEN_IN_PLACE_BUDGET_MS.open + 100);
    act(() => t.rerender({ shown: false }));
    tick(at);
    act(() => t.rerender({ shown: true }));
    tick(OPEN_IN_PLACE_BUDGET_MS.open + 200);
    expect(t.result.current.phase).toBe('open');
    expect(bareGeometryCommits(t.shots)).toEqual([]);
    expect(railHeightUnderConfig(t.shots)).toEqual([]);
  });

  it('Reduce Motion is the exemption: geometry at once, never a config (nothing may move)', () => {
    const t = filmed({ shown: false }, { reducedMotion: true });
    act(() => t.rerender({ shown: true }));
    tick(1000);
    act(() => t.rerender({ shown: false }));
    tick(1000);
    expect(t.result.current.phase).toBe('closed');
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
  });
});

describe('useOpenInPlace — the mechanism (CUL-1721)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
    timedAnimations();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('the slot clips for every phase in flight, and never at rest', () => {
    const t = filmed({ shown: false });
    act(() => t.rerender({ shown: true }));
    tick(OPEN_IN_PLACE_BUDGET_MS.open + 100);
    act(() => t.rerender({ shown: false }));
    tick(OPEN_IN_PLACE_BUDGET_MS.close + 100);
    const inFlight = ['leading', 'opening', 'leaving', 'closing'];
    const seen = new Set(t.shots.map((s) => s.phase));
    expect([...seen]).toEqual(expect.arrayContaining(inFlight));
    for (const s of t.shots) expect([s.phase, s.clipped]).toEqual([s.phase, inFlight.includes(s.phase)]);
  });

  it('a close after a FRESH open holds the box\'s height, which arrived with the commit that mounted the rows', () => {
    // Fabric reports the committed layout: 44 on the lead, the box on `opening`, and nothing
    // on opening → open (no size changes). The fixture sends exactly that, and no more.
    const { result, rerender } = renderHook((p: { shown: boolean }) => useOpenInPlace({ ...base, ...p }), {
      initialProps: { shown: false },
    });
    act(() => rerender({ shown: true }));
    act(() => result.current.onSlotLayout(OPEN_IN_PLACE_LEAD_PT));
    tick(FOLD_MOTION.railLagMs);
    expect(result.current.phase).toBe('opening');
    act(() => result.current.onSlotLayout(212));
    tick(OPEN_IN_PLACE_BUDGET_MS.open);
    expect(result.current.phase).toBe('open');
    act(() => rerender({ shown: false }));
    expect(result.current.phase).toBe('leaving');
    expect(result.current.railHeight).toBe(212);
  });

  it('a second tap mid-close turns round from where it is: the rows never unmount and the box never settles first', () => {
    const t = filmed({ shown: true });
    act(() => t.rerender({ shown: false }));
    tick(FOLD_MOTION.leaveMs / 2);
    expect(t.result.current.phase).toBe('leaving');
    const from = t.shots.length;
    act(() => t.rerender({ shown: true }));
    // No settle to `closed` or `open` between the taps: the next state is the open heading back.
    const after = t.shots.slice(from).map((s) => s.phase);
    expect(after).toContain('opening');
    expect(after).not.toContain('closing');
    expect(after).not.toContain('closed');
    expect(t.shots.slice(from).every((s) => s.geometry.startsWith('true|true'))).toBe(true);
    tick(OPEN_IN_PLACE_BUDGET_MS.open);
    expect(t.result.current.phase).toBe('open');
  });

  it('a second tap mid-open turns round from the lead: the box closes from the band on the fold\'s ease', () => {
    const t = filmed({ shown: false });
    act(() => t.rerender({ shown: true }));
    tick(FOLD_MOTION.railLagMs / 2);
    expect(t.result.current.phase).toBe('leading');
    act(() => t.rerender({ shown: false }));
    expect(t.result.current.phase).toBe('closing');
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith(FOLD_LAYOUT);
    expect(t.shots.some((s) => s.phase === 'open')).toBe(false);
  });

  it('a host\'s reset lands every slot at once, with no choreography and no config', () => {
    const shots: string[] = [];
    let gen = 0;
    const wrapper = ({ children }: { children: ReactNode }) => createElement(OpenInPlaceReset.Provider, { value: gen }, children);
    const { result, rerender } = renderHook(
      (p: { shown: boolean }) => {
        const m = useOpenInPlace({ ...base, ...p });
        shots.push(m.phase);
        return m;
      },
      { initialProps: { shown: true }, wrapper },
    );
    gen = 1;
    act(() => rerender({ shown: false }));
    expect(result.current.phase).toBe('closed');
    expect(shots).not.toContain('leaving');
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
  });

  it('the time budget is a sum of the fold\'s durations, so it is the same for two rows and twelve', () => {
    // The hook knows nothing of the rows: every beat is a duration, none a speed. The budget
    // is what the twelve-row run is held to in SpineNodeRow.test.tsx.
    const t = filmed({ shown: false });
    act(() => t.rerender({ shown: true }));
    tick(OPEN_IN_PLACE_BUDGET_MS.open - 1);
    expect(t.result.current.phase).toBe('opening');
    tick(1);
    expect(t.result.current.phase).toBe('open');
    act(() => t.rerender({ shown: false }));
    tick(OPEN_IN_PLACE_BUDGET_MS.close - 1);
    expect(t.result.current.phase).toBe('closing');
    tick(1);
    expect(t.result.current.phase).toBe('closed');
  });
});
