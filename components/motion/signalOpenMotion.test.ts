// The Signal screen's opening, pinned (D2-3 · CUL-1065; the Motion Designer's read on
// round 3: three beats, under 700ms end to end, reversible, instant under reduced motion).

import { Animated } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { DRAW_IN_MOTION } from './drawInMotion';
import { FOLD_MOTION } from './foldMotion';
import { SIGNAL_OPEN_MOTION, useSignalOpen } from './signalOpenMotion';

describe('the three beats fit the budget, and are the fold’s own physics', () => {
  it('beat 1, the rise, IS the fold’s open — one physics for opening a Signal and re-opening a fold', () => {
    expect(SIGNAL_OPEN_MOTION.riseMs).toBe(FOLD_MOTION.openMs);
    expect(SIGNAL_OPEN_MOTION.riseMs).toBe(370);
  });

  it('beat 3, the landing, starts at 200ms on the fold’s own landing and drift', () => {
    expect(SIGNAL_OPEN_MOTION.landDelayMs).toBe(200);
    expect(SIGNAL_OPEN_MOTION.landMs).toBe(FOLD_MOTION.landMs);
    expect(SIGNAL_OPEN_MOTION.driftPt).toBe(FOLD_MOTION.driftPt);
  });

  it('the three beats end inside 700ms: the rise, the marks drawing in, the landing', () => {
    const budget = SIGNAL_OPEN_MOTION.budgetMs;
    expect(budget).toBe(700);
    expect(SIGNAL_OPEN_MOTION.riseMs).toBeLessThanOrEqual(budget);
    expect(SIGNAL_OPEN_MOTION.landDelayMs + SIGNAL_OPEN_MOTION.landMs).toBeLessThanOrEqual(budget);
    // Beat 2, the draw in, is D2-1's: the MARKS — a bar rising, a compare bar extending (the
    // second a beat behind), a dot popping — all settle inside the budget.
    expect(DRAW_IN_MOTION.barMs).toBeLessThanOrEqual(budget);
    expect(DRAW_IN_MOTION.compareStaggerMs + DRAW_IN_MOTION.compareMs).toBeLessThanOrEqual(budget);
    expect(DRAW_IN_MOTION.dotStaggerMs + DRAW_IN_MOTION.dotMs).toBeLessThanOrEqual(budget);
  });

  it('what trails the budget, measured and stated: a chart’s own label tail (D2-1’s numbers, the mock’s CSS)', () => {
    // The counts and dates on the weekly bars land 480ms after the first bar starts and take
    // the fold's 300ms — 780ms, eighty past the screen's budget. That tail is the chart
    // family's vocabulary (`docs/culprit-design-v4-mockups.html` §03, `.drawin` verbatim),
    // owned by D2-1 and drawn identically wherever the chart is; the screen's three beats
    // are inside 700. Pinned here so a change to either number is a decision, not a drift.
    expect(DRAW_IN_MOTION.barLabelDelayMs + DRAW_IN_MOTION.labelMs).toBe(780);
    expect(DRAW_IN_MOTION.compareLabelDelayMs + DRAW_IN_MOTION.labelMs).toBeLessThanOrEqual(SIGNAL_OPEN_MOTION.budgetMs);
    // A lane of n dots staggers 28ms a dot: fourteen dots after the first can still pop
    // fully inside the budget; a longer lane's tail is the lane's, as on Patterns.
    expect(Math.floor((SIGNAL_OPEN_MOTION.budgetMs - DRAW_IN_MOTION.dotMs) / DRAW_IN_MOTION.dotStaggerMs)).toBe(14);
  });

  it('no beat is under 150ms or over 500ms without a reason written down (the Motion Designer’s floor)', () => {
    for (const ms of [SIGNAL_OPEN_MOTION.riseMs, SIGNAL_OPEN_MOTION.landMs]) {
      expect(ms).toBeGreaterThanOrEqual(150);
      expect(ms).toBeLessThanOrEqual(500);
    }
  });
});

describe('useSignalOpen — the landing value', () => {
  const timingSpy = jest.spyOn(Animated, 'timing');
  beforeEach(() => timingSpy.mockClear());

  it('arms the landing once on arrival, with the delay and the drift, and not again on a re-render', () => {
    const { result, rerender } = renderHook(
      (p: { arrived: boolean; identity: string; reducedMotion: boolean; appActive: boolean }) => useSignalOpen(p),
      { initialProps: { arrived: false, identity: 'k', reducedMotion: false, appActive: true } },
    );
    expect(timingSpy).not.toHaveBeenCalled();
    rerender({ arrived: true, identity: 'k', reducedMotion: false, appActive: true });
    expect(timingSpy).toHaveBeenCalledTimes(2);
    for (const call of timingSpy.mock.calls) {
      expect(call[1]).toMatchObject({ delay: SIGNAL_OPEN_MOTION.landDelayMs, duration: SIGNAL_OPEN_MOTION.landMs, useNativeDriver: true });
    }
    rerender({ arrived: true, identity: 'k', reducedMotion: false, appActive: true });
    expect(timingSpy).toHaveBeenCalledTimes(2);
    // A new finding re-arms.
    rerender({ arrived: true, identity: 'k2', reducedMotion: false, appActive: true });
    expect(timingSpy).toHaveBeenCalledTimes(4);
    expect(result.current.transform).toHaveLength(1);
  });

  it('reduced motion: instant — nothing is started, the value sits at its end state', () => {
    const { result } = renderHook(() => useSignalOpen({ arrived: true, identity: 'k', reducedMotion: true, appActive: true }));
    expect(timingSpy).not.toHaveBeenCalled();
    expect((result.current.opacity as unknown as { __getValue: () => number }).__getValue()).toBe(1);
    expect((result.current.transform[0].translateY as unknown as { __getValue: () => number }).__getValue()).toBe(0);
  });
});
