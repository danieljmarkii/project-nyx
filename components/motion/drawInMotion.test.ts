// The draw in (CUL-1064). Three rules asserted, none of them visible in a screenshot:
//
//   • REDUCED MOTION is the static frame — every mark and every label at its end state,
//     nothing started.
//   • APP BLUR FINISHES, NEVER PAUSES — the fold's rule, one surface over.
//   • THE LABEL LANDS AFTER THE MARKS — the numbers arrive once the shape has, which is
//     the one ordering the whole gesture exists to keep, so it is pinned from the
//     constants rather than from a frame count.
//
// The fold's own durations are imported, never restated (C-30).

import { act, renderHook } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { DRAW_IN_MOTION, DRAW_IN_ORIGIN, drawInPlan, useDrawIn, type DrawIn, type DrawInKind } from './drawInMotion';
import { FOLD_MOTION } from './foldMotion';

const valueOf = (v: { __getValue: () => number }) => v.__getValue();
const scaleOf = (s: ReturnType<DrawIn['markStyle']>): number => {
  const t = s.transform[0] as unknown as Record<string, { __getValue: () => number }>;
  const key = Object.keys(t)[0];
  return valueOf(t[key]);
};

describe('useDrawIn — the chart draws itself in', () => {
  const base = { count: 5, identity: 'sep', reducedMotion: false, appActive: true };

  it('the label lands AFTER the marks have begun, on every kind (pinned from the constants)', () => {
    // The claim is not "after the last mark ends" (a nine-week chart would wait ~700ms) but
    // "after each mark is visibly up": `drawInPlan` holds every mark's start at least the
    // kind's lead before the label (the property test below drives that over every count).
    expect(DRAW_IN_MOTION.barLabelDelayMs).toBeGreaterThanOrEqual(DRAW_IN_MOTION.barLeadMs);
    expect(DRAW_IN_MOTION.compareLabelDelayMs).toBeGreaterThan(DRAW_IN_MOTION.compareStaggerMs * 2);
    // A dot's lead is its whole fade: it is fully visible before its count lands.
    expect(DRAW_IN_MOTION.dotLeadMs).toBe(DRAW_IN_MOTION.dotFadeMs);
    // And the label's own beat is the fold's, not a number of this module's.
    expect(DRAW_IN_MOTION.labelMs).toBe(FOLD_MOTION.landMs);
  });

  it('every beat is inside the Motion Designer\'s window (150–500ms) or has its reason written down', () => {
    // Staggers and the dot fade are sub-beats, not gestures; the gestures are the marks and the label.
    for (const ms of [DRAW_IN_MOTION.barMs, DRAW_IN_MOTION.compareMs, DRAW_IN_MOTION.dotMs, DRAW_IN_MOTION.labelMs]) {
      expect(ms).toBeGreaterThanOrEqual(150);
      expect(ms).toBeLessThanOrEqual(500);
    }
  });

  it('the origin is a static style per kind, so a bar rises from its baseline', () => {
    expect(DRAW_IN_ORIGIN.bars).toBe('bottom');
    expect(DRAW_IN_ORIGIN.compare).toBe('left');
    expect(DRAW_IN_ORIGIN.dots).toBe('center');
  });

  it('seeds every mark and the label when the FACT is true', () => {
    const { result } = renderHook(() => useDrawIn({ kind: 'bars', drawIn: true, ...base }));
    // A mocked native driver may complete synchronously; what must hold is that the
    // draw was ARMED (in flight or already pinned at 1), never left at a seed.
    for (let i = 0; i < 5; i++) {
      const s = scaleOf(result.current.markStyle(i));
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
    }
    expect(valueOf(result.current.labelStyle.opacity as never)).toBeLessThanOrEqual(1);
  });

  it('does NOT draw when the fact is false — the static frame (C-30)', () => {
    const start = jest.spyOn(Animated, 'parallel');
    const { result } = renderHook(() => useDrawIn({ kind: 'bars', drawIn: false, ...base }));
    for (let i = 0; i < 5; i++) expect(scaleOf(result.current.markStyle(i))).toBe(1);
    expect(valueOf(result.current.labelStyle.opacity as never)).toBe(1);
    expect(start).not.toHaveBeenCalled();
    start.mockRestore();
  });

  it('REDUCED MOTION is the static frame: nothing started, everything at its end state', () => {
    const start = jest.spyOn(Animated, 'parallel');
    const { result } = renderHook(() => useDrawIn({ kind: 'dots', drawIn: true, ...base, reducedMotion: true }));
    for (let i = 0; i < 5; i++) {
      expect(scaleOf(result.current.markStyle(i))).toBe(1);
      expect(valueOf(result.current.markStyle(i).opacity as never)).toBe(1);
    }
    expect(valueOf(result.current.labelStyle.opacity as never)).toBe(1);
    expect(start).not.toHaveBeenCalled();
    start.mockRestore();
  });

  it('a BLUR finishes the draw — never a half-drawn chart on return', () => {
    const { result, rerender } = renderHook<DrawIn, { appActive: boolean }>(
      ({ appActive }) => useDrawIn({ kind: 'compare', drawIn: true, ...base, appActive }),
      { initialProps: { appActive: true } },
    );
    act(() => rerender({ appActive: false }));
    for (let i = 0; i < 5; i++) expect(scaleOf(result.current.markStyle(i))).toBe(1);
    expect(valueOf(result.current.labelStyle.opacity as never)).toBe(1);
    expect(result.current.inFlight()).toBe(false);
  });

  it('draws ONCE per identity — a re-render is not a second arrival, a new identity is', () => {
    const start = jest.spyOn(Animated, 'parallel');
    const { rerender } = renderHook<DrawIn, { identity: string }>(
      ({ identity }) => useDrawIn({ kind: 'bars', drawIn: true, ...base, identity }),
      { initialProps: { identity: 'sep' } },
    );
    const after = start.mock.calls.length;
    expect(after).toBeGreaterThan(0);
    rerender({ identity: 'sep' });
    expect(start.mock.calls.length).toBe(after);
    rerender({ identity: 'aug' });
    expect(start.mock.calls.length).toBeGreaterThan(after);
    start.mockRestore();
  });

  it('a mark index past the count still returns a stable style rather than throwing', () => {
    const { result } = renderHook(() => useDrawIn({ kind: 'dots', drawIn: false, ...base, count: 1 }));
    const a = result.current.markStyle(7);
    const b = result.current.markStyle(7);
    expect(a.opacity).toBe(b.opacity);
    expect(scaleOf(a)).toBe(1);
  });

  it('every animation runs on the native driver (no JS-thread frames)', () => {
    const timing = jest.spyOn(Animated, 'timing');
    renderHook(() => useDrawIn({ kind: 'dots', drawIn: true, ...base }));
    expect(timing).toHaveBeenCalled();
    for (const call of timing.mock.calls) {
      expect((call[1] as { useNativeDriver?: boolean }).useNativeDriver).toBe(true);
    }
    timing.mockRestore();
  });
});

// CUL-1223 (WBC-4) — THE CEILING. Driven through the shipped `drawInPlan`, never a
// re-derivation of it (C-34): every kind, every count a real chart can hand over (a
// nine-week chart to a ~170-dot record split across two lanes), with and without the
// Signal screen's 200ms landing delay.
describe('drawInPlan — every draw ends inside the budget, whatever the mark count', () => {
  const kinds: DrawInKind[] = ['bars', 'compare', 'dots'];
  const leadOf: Record<DrawInKind, number> = {
    bars: DRAW_IN_MOTION.barLeadMs,
    compare: DRAW_IN_MOTION.compareLeadMs,
    dots: DRAW_IN_MOTION.dotLeadMs,
  };
  const shapes: number[][] = [];
  for (let n = 1; n <= 200; n++) shapes.push([n]);
  shapes.push([90, 80], [0, 170], [170, 0], [3, 140], [1, 1]);

  for (const kind of kinds) {
    for (const delay of [0, 200]) {
      it(`${kind}, delay ${delay}: the last mark and the labels end by ${DRAW_IN_MOTION.budgetMs}ms, each mark up before its label`, () => {
        for (const groups of shapes) {
          const total = groups.reduce((a, n) => a + n, 0);
          const plan = drawInPlan(kind, groups, delay);
          let lastEnd = 0;
          for (let i = 0; i < total; i++) {
            const start = plan.markDelay(i);
            expect(start).toBeGreaterThanOrEqual(delay);
            lastEnd = Math.max(lastEnd, start + plan.markMs);
            // Every mark has had its lead before the counts land.
            expect(plan.labelDelay - start).toBeGreaterThanOrEqual(leadOf[kind] - 1e-9);
          }
          expect(lastEnd).toBeLessThanOrEqual(DRAW_IN_MOTION.budgetMs + 1e-9);
          expect(plan.labelDelay + plan.labelMs).toBeLessThanOrEqual(DRAW_IN_MOTION.budgetMs);
        }
      });
    }
  }

  it('a short chart keeps the mock’s stagger — only a long one compresses', () => {
    expect(drawInPlan('bars', [5]).stagger).toBe(DRAW_IN_MOTION.barStaggerMs);
    expect(drawInPlan('compare', [2]).stagger).toBe(DRAW_IN_MOTION.compareStaggerMs);
    expect(drawInPlan('dots', [8]).stagger).toBe(DRAW_IN_MOTION.dotStaggerMs);
    // The nine-week chart that ended at 740ms: 35ms a bar, ending at 700.
    expect(drawInPlan('bars', [9]).stagger).toBe(35);
    expect(drawInPlan('bars', [9]).markDelay(8) + DRAW_IN_MOTION.barMs).toBe(700);
  });

  it('lanes stagger per run: the second lane starts at the same moment as the first', () => {
    const plan = drawInPlan('dots', [90, 80]);
    expect(plan.markDelay(0)).toBe(0);
    expect(plan.markDelay(90)).toBe(0);
    for (let k = 0; k < 80; k++) expect(plan.markDelay(90 + k)).toBe(plan.markDelay(k));
  });

  it('the delay holds the marks AND the labels (the compare lands at 200ms)', () => {
    const plan = drawInPlan('compare', [2], 200);
    expect(plan.markDelay(0)).toBe(200);
    expect(plan.labelDelay).toBeGreaterThanOrEqual(200);
  });
});

describe('useDrawIn — the ceiling reaches the animations it starts', () => {
  const base = { identity: 'sep', reducedMotion: false, appActive: true, drawIn: true };

  it('a two-lane chart hands each lane’s first dot a zero delay, and nothing past the budget', () => {
    const timing = jest.spyOn(Animated, 'timing');
    renderHook(() => useDrawIn({ kind: 'dots', count: 170, groups: [90, 80], ...base }));
    const configs = timing.mock.calls.map((c) => c[1] as { delay?: number; duration?: number });
    expect(configs.length).toBeGreaterThan(0);
    for (const c of configs) expect((c.delay ?? 0) + (c.duration ?? 0)).toBeLessThanOrEqual(DRAW_IN_MOTION.budgetMs + 1e-9);
    // The ninety-first dot (lane two's first) starts at 0, as lane one's does.
    const scaleCalls = configs.filter((_, k) => k % 2 === 0); // scale, then fade, per dot
    expect(scaleCalls[0].delay).toBe(0);
    expect(scaleCalls[90].delay).toBe(0);
    timing.mockRestore();
  });

  it('delayMs holds every beat', () => {
    const timing = jest.spyOn(Animated, 'timing');
    renderHook(() => useDrawIn({ kind: 'compare', count: 2, delayMs: 200, ...base }));
    for (const c of timing.mock.calls) expect((c[1] as { delay?: number }).delay ?? 0).toBeGreaterThanOrEqual(200);
    timing.mockRestore();
  });

  it('an effect re-run that does not re-arm pins the end state, never a frozen half-draw', () => {
    const { result, rerender } = renderHook<DrawIn, { count: number }>(
      ({ count }) => useDrawIn({ kind: 'bars', count, ...base }),
      { initialProps: { count: 5 } },
    );
    act(() => rerender({ count: 6 }));
    for (let i = 0; i < 5; i++) expect(scaleOf(result.current.markStyle(i))).toBe(1);
    expect(valueOf(result.current.labelStyle.opacity as never)).toBe(1);
  });
});
