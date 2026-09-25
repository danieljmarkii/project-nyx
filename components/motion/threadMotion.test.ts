// The first paint (HV-10 / CUL-1167; spec §4 "First paint" and "Land on a day"). What is
// pinned: WHICH cards draw (the ledger: the cards on the identity's first frame, once each,
// and a landed day once more, never a card the owner scrolled to), the ORDER of the draw
// (the line first, each row as the line reaches it, the last row settled by the draw's
// end), that every beat is the fold's own clock (C-30), that Reduce Motion is the still
// frame from the first render and spends no token, and that a blur finishes at rest.

import { act, renderHook } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { FOLD_MOTION } from './foldMotion';
import { THREAD_DRAW, createPaintLedger, threadDrawTotalMs, threadRowDelayMs, useThreadDraw } from './threadMotion';

const valueOf = (v: Animated.Value) => (v as unknown as { __getValue: () => number }).__getValue();

describe('the paint ledger (which cards draw)', () => {
  it('a new identity grants each day one token until sealed; a claimed day is never granted again', () => {
    const ledger = createPaintLedger();
    expect(ledger.peek('2026-09-20')).toBeNull();
    ledger.open('pet-a|all|all|2026-09-25');
    const t = ledger.peek('2026-09-20');
    expect(t).not.toBeNull();
    // Pure: a render may ask as often as it renders.
    expect(ledger.peek('2026-09-20')).toBe(t);
    expect(ledger.claim(t as string)).toBe(true);
    // A card the virtualized list unmounts and mounts again: nothing to draw.
    expect(ledger.peek('2026-09-20')).toBeNull();
    expect(ledger.claim(t as string)).toBe(false);
  });

  it('the first frame is the commit of the FIRST CLAIM: every card that claims in it draws; one mounted a batch later never does', async () => {
    const ledger = createPaintLedger();
    ledger.open('id-1');
    // A virtualized list that went from empty to full mounts its cells a batch after the
    // render that opened the identity: nothing sealed in between.
    await Promise.resolve();
    const a = ledger.peek('d-a') as string;
    const b = ledger.peek('d-b') as string;
    // One commit: each card's layout effect claims, synchronously, one after another.
    expect(ledger.claim(a)).toBe(true);
    expect(ledger.claim(b)).toBe(true);
    // Once that commit is done, the next batch's card is refused.
    await Promise.resolve();
    expect(ledger.peek('d-c')).toBeNull();
  });

  it('seal: a card that first mounts after the first frame (the owner scrolled to it) never draws', () => {
    const ledger = createPaintLedger();
    ledger.open('id-1');
    const early = ledger.peek('2026-09-24') as string;
    ledger.seal();
    expect(ledger.peek('2026-09-10')).toBeNull();
    // Even a token handed out before the seal cannot be spent after it.
    expect(ledger.claim(early)).toBe(false);
  });

  it('the same identity again (a reload, a sync tick) opens nothing; a new one opens afresh', () => {
    const ledger = createPaintLedger();
    ledger.open('id-1');
    ledger.claim(ledger.peek('d1') as string);
    ledger.seal();
    ledger.open('id-1');
    expect(ledger.peek('d2')).toBeNull();
    ledger.open('id-2');
    expect(ledger.peek('d1')).not.toBeNull();
  });

  it('a landing draws its day once more, whenever its card is next drawn, and only once', () => {
    const ledger = createPaintLedger();
    ledger.open('id-1');
    ledger.seal();
    ledger.land('2026-09-17');
    expect(ledger.peek('2026-09-16')).toBeNull();
    const t = ledger.peek('2026-09-17') as string;
    expect(t).not.toBeNull();
    expect(ledger.claim(t)).toBe(true);
    expect(ledger.peek('2026-09-17')).toBeNull();
    // The owner's own scroll ends a landing that never drew.
    ledger.land('2026-09-12');
    ledger.dropLanding();
    expect(ledger.peek('2026-09-12')).toBeNull();
  });

  it('a second landing replaces the first: the first\'s token is spent on nothing', () => {
    const ledger = createPaintLedger();
    ledger.land('2026-09-17');
    const first = ledger.peek('2026-09-17') as string;
    ledger.land('2026-09-17');
    const second = ledger.peek('2026-09-17') as string;
    expect(second).not.toBe(first);
    expect(ledger.claim(first)).toBe(false);
    expect(ledger.claim(second)).toBe(true);
  });
});

describe('the beats are the fold\'s clock (C-30), the mock\'s step', () => {
  it('the line is the fold\'s opening, a row the fold\'s landing, the drift the mock\'s 4pt', () => {
    expect(THREAD_DRAW.lineMs).toBe(FOLD_MOTION.openMs);
    expect(THREAD_DRAW.rowMs).toBe(FOLD_MOTION.landMs);
    expect(THREAD_DRAW.rowDriftPt).toBe(4);
  });

  it('row i starts as the line reaches it: i × round(line / rows)', () => {
    expect(threadRowDelayMs(0, 4)).toBe(0);
    expect(threadRowDelayMs(3, 4)).toBe(3 * Math.round(FOLD_MOTION.openMs / 4));
    // One row lands with the line.
    expect(threadDrawTotalMs(1)).toBe(Math.max(FOLD_MOTION.openMs, FOLD_MOTION.landMs));
    // The last row settles one landing after the line reaches it: never before the line ends.
    expect(threadDrawTotalMs(8)).toBe(threadRowDelayMs(7, 8) + FOLD_MOTION.landMs);
  });
});

describe('useThreadDraw', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const base = { rows: 3, reducedMotion: false, appActive: true };

  it('armed on the first render: the line at nothing and every row clear BEFORE anything paints', () => {
    const claim = jest.fn(() => true);
    const { result } = renderHook(() => useThreadDraw({ ...base, token: 'paint:x:d', claim }));
    expect(result.current.drawing).toBe(true);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(valueOf(result.current.lineScale)).toBe(0);
    for (let i = 0; i < 3; i++) {
      expect(valueOf(result.current.rowStyle(i).opacity)).toBe(0);
      expect(valueOf(result.current.rowStyle(i).transform[0].translateY)).toBe(-THREAD_DRAW.rowDriftPt);
    }
  });

  it('the line leads and the rows land in order; at the end everything is at rest and the line is gone', () => {
    // The mocked native driver moves no value mid-flight, so the ORDER is read from what the
    // hook asked for: the line from the start over the fold's opening, row i as the line
    // reaches it, over the fold's landing.
    const timing = jest.spyOn(Animated, 'timing');
    const { result } = renderHook(() => useThreadDraw({ ...base, token: 'paint:x:d', claim: () => true }));
    const configs = timing.mock.calls.map(([value, config]) => ({ value, config }));
    const line = configs.find((c) => c.value === result.current.lineScale);
    expect(line?.config).toMatchObject({ toValue: 1, duration: THREAD_DRAW.lineMs, useNativeDriver: true });
    expect(line?.config.delay ?? 0).toBe(0);
    for (let i = 0; i < 3; i++) {
      const row = configs.find((c) => c.value === result.current.rowStyle(i).opacity);
      expect(row?.config).toMatchObject({ toValue: 1, duration: THREAD_DRAW.rowMs, delay: threadRowDelayMs(i, 3), useNativeDriver: true });
      const shift = configs.find((c) => c.value === result.current.rowStyle(i).transform[0].translateY);
      expect(shift?.config).toMatchObject({ toValue: 0, delay: threadRowDelayMs(i, 3) });
    }
    // Strictly in order down the thread: never a row before the one above it.
    expect(threadRowDelayMs(1, 3)).toBeGreaterThan(threadRowDelayMs(0, 3));
    expect(threadRowDelayMs(2, 3)).toBeGreaterThan(threadRowDelayMs(1, 3));
    timing.mockRestore();
    act(() => {
      jest.advanceTimersByTime(threadDrawTotalMs(3) + 50);
    });
    expect(result.current.drawing).toBe(false);
    expect(valueOf(result.current.lineScale)).toBe(1);
    for (let i = 0; i < 3; i++) {
      expect(valueOf(result.current.rowStyle(i).opacity)).toBe(1);
      expect(valueOf(result.current.rowStyle(i).transform[0].translateY)).toBe(0);
    }
  });

  it('the token going back to null (the ledger stops granting a claimed token) does not stop the draw', () => {
    const { result, rerender } = renderHook((p: { token: string | null }) => useThreadDraw({ ...base, ...p, claim: () => true }), {
      initialProps: { token: 'paint:x:d' as string | null },
    });
    rerender({ token: null });
    // Still drawing: the line out, the rows still at their from-state.
    expect(result.current.drawing).toBe(true);
    expect(valueOf(result.current.rowStyle(0).opacity)).toBe(0);
    act(() => {
      jest.advanceTimersByTime(threadDrawTotalMs(3) + 50);
    });
    expect(result.current.drawing).toBe(false);
    expect(valueOf(result.current.rowStyle(0).opacity)).toBe(1);
  });

  it('a re-render with the same token (a sync tick, a new row) never draws again', () => {
    const claim = jest.fn(() => true);
    const { result, rerender } = renderHook((p: { rows: number }) => useThreadDraw({ ...base, ...p, token: 't', claim }), {
      initialProps: { rows: 3 },
    });
    act(() => {
      jest.advanceTimersByTime(threadDrawTotalMs(3) + 50);
    });
    rerender({ rows: 4 });
    expect(claim).toHaveBeenCalledTimes(1);
    expect(result.current.drawing).toBe(false);
    // The row that arrived after the draw is simply there.
    expect(valueOf(result.current.rowStyle(3).opacity)).toBe(1);
  });

  it('a token the ledger refuses (another mount spent it): the still frame, the line not drawn', () => {
    const { result } = renderHook(() => useThreadDraw({ ...base, token: 'spent', claim: () => false }));
    expect(result.current.drawing).toBe(false);
    expect(valueOf(result.current.lineScale)).toBe(1);
    expect(valueOf(result.current.rowStyle(0).opacity)).toBe(1);
  });

  it('Reduce Motion from the first render: the still frame, nothing seeded, and the token NOT spent', () => {
    const claim = jest.fn(() => true);
    const { result } = renderHook(() => useThreadDraw({ ...base, reducedMotion: true, token: 'paint:x:d', claim }));
    expect(result.current.drawing).toBe(false);
    expect(claim).not.toHaveBeenCalled();
    expect(valueOf(result.current.lineScale)).toBe(1);
    expect(valueOf(result.current.rowStyle(1).opacity)).toBe(1);
  });

  it('a blur mid-draw FINISHES it: at rest, never paused half drawn', () => {
    const { result, rerender } = renderHook((p: { appActive: boolean }) => useThreadDraw({ ...base, ...p, token: 't', claim: () => true }), {
      initialProps: { appActive: true },
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    rerender({ appActive: false });
    expect(result.current.drawing).toBe(false);
    expect(valueOf(result.current.lineScale)).toBe(1);
    expect(valueOf(result.current.rowStyle(2).opacity)).toBe(1);
  });

  it('Reduce Motion switched on mid-draw: the still frame, now', () => {
    const { result, rerender } = renderHook((p: { reducedMotion: boolean }) => useThreadDraw({ ...base, ...p, token: 't', claim: () => true }), {
      initialProps: { reducedMotion: false },
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    rerender({ reducedMotion: true });
    expect(result.current.drawing).toBe(false);
    expect(valueOf(result.current.rowStyle(0).opacity)).toBe(1);
  });

  it('a new token (a landing on a drawn day) draws again from the from-state', () => {
    const claim = jest.fn(() => true);
    const { result, rerender } = renderHook((p: { token: string | null }) => useThreadDraw({ ...base, ...p, claim }), {
      initialProps: { token: 'paint:x:d' as string | null },
    });
    act(() => {
      jest.advanceTimersByTime(threadDrawTotalMs(3) + 50);
    });
    rerender({ token: 'land:1:d' });
    expect(claim).toHaveBeenLastCalledWith('land:1:d');
    expect(result.current.drawing).toBe(true);
    expect(valueOf(result.current.lineScale)).toBe(0);
    expect(valueOf(result.current.rowStyle(0).opacity)).toBe(0);
    act(() => {
      jest.advanceTimersByTime(threadDrawTotalMs(3) + 50);
    });
    expect(result.current.drawing).toBe(false);
  });

  it('the end never rides on the frame clock alone: a draw whose completion never comes ends at its own length', () => {
    // A frame clock that stalls (the Motion Designer's "a flip that rides on animation
    // frames alone"): the animation is started and never calls back.
    const parallel = jest.spyOn(Animated, 'parallel').mockImplementation(
      () => ({ start: () => {}, stop: () => {}, reset: () => {} }) as unknown as Animated.CompositeAnimation,
    );
    const { result } = renderHook(() => useThreadDraw({ ...base, token: 't', claim: () => true }));
    expect(result.current.drawing).toBe(true);
    act(() => {
      jest.advanceTimersByTime(threadDrawTotalMs(3) + FOLD_MOTION.settleSlackMs * 2);
    });
    expect(result.current.drawing).toBe(false);
    expect(valueOf(result.current.lineScale)).toBe(1);
    expect(valueOf(result.current.rowStyle(0).opacity)).toBe(1);
    parallel.mockRestore();
  });

  it('unmounted mid-draw: nothing left running (a later test never inherits its beats)', () => {
    const { unmount } = renderHook(() => useThreadDraw({ ...base, token: 't', claim: () => true }));
    unmount();
    expect(() =>
      act(() => {
        jest.advanceTimersByTime(threadDrawTotalMs(3) + 50);
      }),
    ).not.toThrow();
  });
});
