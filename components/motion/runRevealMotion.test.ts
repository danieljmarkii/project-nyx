// The reveal (CUL-1735, D3). What is pinned: the DISTANCE's three properties over thousands
// of seeded geometries (zero when the first meal shows clear of the plus; the run's top
// never above the margin; never negative), and that it is the SMALLER of what shows the
// meal and what keeps the run on screen; the run's machine reports a FRESH open once and
// never a close, a reversal or a re-key; and the host fires once, on the content's growth
// or the fallback, never after a cancel, never for a zero distance.
//
// Mutation, run by hand before this shipped: replacing `Math.min(toShow, Math.max(0, room))`
// with `toShow` (dropping the bound) reds "never moves the run's top above its margin".

import { act, renderHook } from '@testing-library/react-native';
import { LayoutAnimation } from 'react-native';
import { RUN_MOTION, useRunOpen } from './runOpenMotion';
import { RUN_REVEAL, runRevealDistance, useRunRevealHost, type RunRevealGeometry } from './runRevealMotion';

/** A small seeded PRNG (mulberry32), so a failure reproduces. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A geometry: a list from ~100 down 150 to 850pt (a short one is a phone in landscape, or
 *  the largest Dynamic Type), the plus over its foot, a run anywhere in (or just past) it,
 *  its first meal's foot 88 to 500pt under the header's top (a two-line header and a
 *  two-line meal at large type). Wide on purpose: the bound only bites where the run is near
 *  the top and its meal is far below, and a narrow generator never draws that case. */
function geometries(n: number, seed = 1735): RunRevealGeometry[] {
  const r = prng(seed);
  const out: RunRevealGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const viewTop = 60 + r() * 80;
    const viewBottom = viewTop + 150 + r() * 700;
    const plusTop = viewBottom - 20 + r() * 80;
    const runTop = viewTop - 60 + r() * (viewBottom - viewTop + 120);
    const mealBottom = runTop + 88 + r() * 412;
    out.push({ runTop, mealBottom, viewTop, viewBottom, plusTop });
  }
  return out;
}

const visibleBottom = (g: RunRevealGeometry) => Math.min(g.viewBottom, g.plusTop - RUN_REVEAL.plusGapPt);

describe('runRevealDistance — the properties', () => {
  const all = geometries(5000);

  it('is never negative', () => {
    for (const g of all) expect(runRevealDistance(g)).toBeGreaterThanOrEqual(0);
  });

  it('is zero when the first meal already shows clear of the plus', () => {
    let seen = 0;
    for (const g of all) {
      if (g.mealBottom <= visibleBottom(g)) {
        seen++;
        expect(runRevealDistance(g)).toBe(0);
      }
    }
    expect(seen).toBeGreaterThan(100);
  });

  it("never moves the run's top above its margin (the bound: the tapped line stays on screen)", () => {
    let moved = 0;
    for (const g of all) {
      const d = runRevealDistance(g);
      if (d === 0) continue;
      moved++;
      expect(g.runTop - d).toBeGreaterThanOrEqual(g.viewTop + RUN_REVEAL.marginPt - 1e-9);
    }
    expect(moved).toBeGreaterThan(100);
  });

  it('never moves further than the first meal needs', () => {
    for (const g of all) {
      const d = runRevealDistance(g);
      if (d > 0) expect(g.mealBottom - d).toBeGreaterThanOrEqual(visibleBottom(g) - 1e-9);
    }
  });

  it('a nudge under the floor does not move', () => {
    const g = { runTop: 400, viewTop: 100, viewBottom: 760, plusTop: 900, mealBottom: 761 };
    expect(runRevealDistance(g)).toBe(0);
    expect(runRevealDistance({ ...g, mealBottom: 760 + RUN_REVEAL.minMovePt })).toBe(RUN_REVEAL.minMovePt);
  });
});

describe('runRevealDistance — the examples (§05, the right-hand phone)', () => {
  const phone = { viewTop: 100, viewBottom: 764, plusTop: 716 };

  it('a run low on the list: the first meal comes clear of the plus, the list moves no further', () => {
    const g = { ...phone, runTop: 640, mealBottom: 640 + 44 + 52 };
    expect(runRevealDistance(g)).toBe(640 + 96 - (716 - RUN_REVEAL.plusGapPt));
  });

  it('a run already near the top cannot move far: the bound wins, and the run stays a margin down', () => {
    const g = { ...phone, runTop: 140, mealBottom: 800 };
    expect(runRevealDistance(g)).toBe(140 - (100 + RUN_REVEAL.marginPt));
  });

  it('a run above the margin (half scrolled off): no move at all', () => {
    expect(runRevealDistance({ ...phone, runTop: 90, mealBottom: 900 })).toBe(0);
  });
});

describe('useRunOpen — the reveal is asked for once per FRESH open', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  const base = { identity: 'compact:m0', count: 2, beadCenterY: 8.5, leadTop: 14, appActive: true };
  const advance = (ms: number) =>
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  function hook(reducedMotion = false) {
    const onFreshOpen = jest.fn();
    const h = renderHook((p: { shown: boolean; identity?: string }) => useRunOpen({ ...base, reducedMotion, onFreshOpen, ...p }), {
      initialProps: { shown: false },
    });
    return { ...h, onFreshOpen };
  }

  it('the open asks once, on the box\'s commit; the close never asks', () => {
    const t = hook();
    act(() => t.rerender({ shown: true }));
    expect(t.onFreshOpen).not.toHaveBeenCalled();
    advance(RUN_MOTION.mountFrameMs);
    expect(t.onFreshOpen).toHaveBeenCalledTimes(1);
    advance(1_000);
    act(() => t.rerender({ shown: false }));
    advance(1_000);
    expect(t.onFreshOpen).toHaveBeenCalledTimes(1);
  });

  it('a reversal mid-close turns the box round and does not ask again', () => {
    const t = hook();
    act(() => t.rerender({ shown: true }));
    advance(1_000);
    act(() => t.rerender({ shown: false }));
    advance(60);
    act(() => t.rerender({ shown: true }));
    advance(1_000);
    expect(t.result.current.phase).toBe('open');
    expect(t.onFreshOpen).toHaveBeenCalledTimes(1);
  });

  it('a tap and a second tap inside the shut frame: no ask at all', () => {
    const t = hook();
    act(() => t.rerender({ shown: true }));
    act(() => t.rerender({ shown: false }));
    advance(1_000);
    expect(t.onFreshOpen).not.toHaveBeenCalled();
  });

  it('a re-key under an open run lands without motion and without an ask', () => {
    const t = hook();
    act(() => t.rerender({ shown: true }));
    advance(1_000);
    act(() => t.rerender({ shown: true, identity: 'compact:m9' }));
    advance(1_000);
    expect(t.onFreshOpen).toHaveBeenCalledTimes(1);
  });

  it('Reduce Motion: the at-once box asks once (the host jumps)', () => {
    const t = hook(true);
    act(() => t.rerender({ shown: true }));
    expect(t.onFreshOpen).toHaveBeenCalledTimes(1);
    advance(1_000);
    act(() => t.rerender({ shown: false }));
    advance(1_000);
    expect(t.onFreshOpen).toHaveBeenCalledTimes(1);
  });
});

describe('useRunRevealHost — the list scrolls once, after the content grows', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const VIEW = { top: 100, bottom: 764 };
  function host(windowHeight = 764 + 80) {
    const scrollBy = jest.fn();
    const h = renderHook(() =>
      useRunRevealHost({
        measureViewport: (done) => done(VIEW.top, VIEW.bottom),
        scrollBy,
        windowHeight: () => windowHeight,
      }),
    );
    return { ...h, scrollBy };
  }
  const low = { runTop: 640, mealBottom: 740 };
  const plusTop = 764 + 80 - RUN_REVEAL.plusRisePt;
  const expected = runRevealDistance({ ...low, viewTop: VIEW.top, viewBottom: VIEW.bottom, plusTop });

  it('fires on the growth, a frame later, by the distance; a second growth does not fire again', () => {
    const t = host();
    t.result.current.onContentSizeChange(390, 1200);
    t.result.current.request((done) => done(low));
    expect(t.scrollBy).not.toHaveBeenCalled();
    t.result.current.onContentSizeChange(390, 1296);
    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(expected).toBeGreaterThan(0);
    expect(t.scrollBy).toHaveBeenCalledTimes(1);
    expect(t.scrollBy).toHaveBeenCalledWith(expected);
    t.result.current.onContentSizeChange(390, 1400);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(t.scrollBy).toHaveBeenCalledTimes(1);
  });

  it('falls back to its timer when no growth is heard', () => {
    const t = host();
    t.result.current.request((done) => done(low));
    act(() => {
      jest.advanceTimersByTime(RUN_REVEAL.fallbackMs);
    });
    expect(t.scrollBy).toHaveBeenCalledTimes(1);
  });

  it('a cancel before it fires (a close, a reversal) never scrolls', () => {
    const t = host();
    t.result.current.onContentSizeChange(390, 1200);
    const cancel = t.result.current.request((done) => done(low));
    cancel();
    t.result.current.onContentSizeChange(390, 1296);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(t.scrollBy).not.toHaveBeenCalled();
  });

  it('a cancel that lands while the measure is in flight never scrolls', () => {
    const t = host();
    let finish: (() => void) | null = null;
    const cancel = t.result.current.request((done) => {
      finish = () => done(low);
    });
    act(() => {
      jest.advanceTimersByTime(RUN_REVEAL.fallbackMs);
    });
    cancel();
    finish!();
    expect(t.scrollBy).not.toHaveBeenCalled();
  });

  it('a run whose first meal already shows: no scroll', () => {
    const t = host();
    t.result.current.request((done) => done({ runTop: 300, mealBottom: 400 }));
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(t.scrollBy).not.toHaveBeenCalled();
  });

  it('a newer open replaces a pending one: one scroll, for the newer run', () => {
    const t = host();
    t.result.current.request((done) => done({ runTop: 300, mealBottom: 400 }));
    t.result.current.request((done) => done(low));
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(t.scrollBy).toHaveBeenCalledTimes(1);
    expect(t.scrollBy).toHaveBeenCalledWith(expected);
  });
  it("History's sticky day header: the run's line rests clear of it, not merely inside the list", () => {
    const scrollBy = jest.fn();
    const sticky = 40;
    const h = renderHook(() =>
      useRunRevealHost({
        measureViewport: (done) => done(VIEW.top, VIEW.bottom),
        topInset: () => sticky,
        scrollBy,
        windowHeight: () => 764 + 80,
      }),
    );
    const near = { runTop: 200, mealBottom: 900 };
    h.result.current.request((done) => done(near));
    act(() => {
      jest.advanceTimersByTime(RUN_REVEAL.fallbackMs);
    });
    expect(scrollBy).toHaveBeenCalledWith(near.runTop - (VIEW.top + sticky + RUN_REVEAL.marginPt));
  });

  it('a drag (the owner takes the list) stops a reveal, even one whose measure is in flight', () => {
    const t = host();
    let finish: (() => void) | null = null;
    t.result.current.request((done) => {
      finish = () => done(low);
    });
    act(() => {
      jest.advanceTimersByTime(RUN_REVEAL.fallbackMs);
    });
    t.result.current.cancel();
    finish!();
    expect(t.scrollBy).not.toHaveBeenCalled();
  });
});
