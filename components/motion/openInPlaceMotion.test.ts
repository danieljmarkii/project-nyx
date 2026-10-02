// The day opening in place (CUL-1067) — the fold's physics on a new surface. What is
// pinned: the ORDER (the rail leads, the box follows, the rows land; the reverse on
// close), that every beat is the fold's own constant (C-30 — a restated number would
// pass a screenshot and drift), that reduced motion is a crossfade with no layout
// commit, that a blur finishes at the asked-for state, and that a re-key under an
// open row moves with no motion at all.

import { act, renderHook } from '@testing-library/react-native';
import { LayoutAnimation } from 'react-native';
import { FOLD_LAYOUT, FOLD_MOTION, UNFOLD_LAYOUT } from './foldMotion';
import { OPEN_IN_PLACE_LEAD_PT, useOpenInPlace } from './openInPlaceMotion';

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

  const base = { identity: '2026-09-02', reducedMotion: false, appActive: true };

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
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
    // Beat 2: railLagMs later, ONE layout commit (the fold's own unfold config) and the rows mount.
    act(() => {
      jest.advanceTimersByTime(FOLD_MOTION.railLagMs);
    });
    expect(LayoutAnimation.configureNext).toHaveBeenCalledTimes(1);
    expect(LayoutAnimation.configureNext).toHaveBeenCalledWith(UNFOLD_LAYOUT);
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

  it('a flip under a transition finishes it first, then runs the other way', () => {
    const { result, rerender } = renderHook((p: { shown: boolean }) => useOpenInPlace({ ...base, ...p }), {
      initialProps: { shown: false },
    });
    act(() => rerender({ shown: true }));
    expect(result.current.phase).toBe('leading');
    act(() => rerender({ shown: false }));
    // Never a second choreography over a half-drawn one: the open was settled and the
    // close began (or, with a synchronous driver, already finished).
    expect(['leaving', 'closing', 'closed']).toContain(result.current.phase);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.phase).toBe('closed');
  });
});
