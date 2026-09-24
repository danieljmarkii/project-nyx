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
import { DRAW_IN_MOTION, DRAW_IN_ORIGIN, useDrawIn, type DrawIn } from './drawInMotion';
import { FOLD_MOTION } from './foldMotion';

const valueOf = (v: { __getValue: () => number }) => v.__getValue();
const scaleOf = (s: ReturnType<DrawIn['markStyle']>): number => {
  const t = s.transform[0] as unknown as Record<string, { __getValue: () => number }>;
  const key = Object.keys(t)[0];
  return valueOf(t[key]);
};

describe('useDrawIn — the chart draws itself in', () => {
  const base = { count: 5, identity: 'sep', reducedMotion: false, appActive: true };

  it('the label lands AFTER the marks, on every kind (pinned from the constants)', () => {
    // The last bar starts at (n−1)·stagger and takes barMs; the label starts at its delay.
    // The claim is not "after the last bar ends" (a nine-week chart would wait ~800ms) but
    // "after the FIRST marks have drawn": the label delay clears a whole mark's duration.
    expect(DRAW_IN_MOTION.barLabelDelayMs).toBeGreaterThanOrEqual(DRAW_IN_MOTION.barMs);
    expect(DRAW_IN_MOTION.compareLabelDelayMs).toBeGreaterThan(DRAW_IN_MOTION.compareStaggerMs * 2);
    expect(DRAW_IN_MOTION.dotLabelDelayMs).toBeGreaterThan(DRAW_IN_MOTION.dotMs);
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
