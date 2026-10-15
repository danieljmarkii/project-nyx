// The gap warning's arrival on the quiet line (CUL-1838; round 7 of the Signal mock, R7 · 01
// "Week 4: the first signal arrives").
//
// The first warning arrives by Principle 9's "arrive" gesture, never as a reward: the quiet
// line's header and subtitle fade over the rail's lead, the box opens a beat behind with one
// settle, and the sentence lands. No wash, no tap, no "first pattern is ready" (CUL-1937):
// those belong to the once-ever arrival of a pattern, and a warning is a concern.
//
// THE FOLD'S PHYSICS, LIFTED, NOT RESTATED (C-30). Every number is `FOLD_MOTION`'s unfold:
// the rail's 160ms lead, the box's 370ms open with one settle (`UNFOLD_LAYOUT`), the
// sentence landing 40ms behind the box over 300ms from 8pt above. The one choice made here
// is when the box starts: round 7 opens it 80ms behind the rail's start — the fold's own
// `railLagMs`, the same beat read from the other side.
//
// TWO ENGINES, ONE JOB EACH (the fold's rule). `LayoutAnimation` moves the box; `Animated`
// moves the words. The rail's ink is the one value that changes on a view the layout pass
// touches, so it runs on the JS driver: a native-driven prop on a layout-animated view is
// re-committed at its start value when the keyframe ends (`foldMotion.ts`'s Fabric note).
//
// APP BLUR FINISHES, NEVER PAUSES, and Reduce Motion crossfades: the words swap by opacity,
// nothing moves, the box does not animate.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutAnimation } from 'react-native';
import { FOLD_MOTION, UNFOLD_LAYOUT } from './foldMotion';

/** When each beat starts, in ms from the warning's arrival. */
export const WARNING_ARRIVAL = {
  /** The quiet line's words fade, and the rail takes the warning's ink, over the lead. */
  railLeadMs: FOLD_MOTION.railLeadMs,
  /** The box opens this long after the lead starts (round 7: "80ms behind"). */
  boxLagMs: FOLD_MOTION.railLagMs,
  openMs: FOLD_MOTION.openMs,
  landDelayMs: FOLD_MOTION.landDelayMs,
  landMs: FOLD_MOTION.landMs,
  driftPt: FOLD_MOTION.driftPt,
  settleSlackMs: FOLD_MOTION.settleSlackMs,
} as const;

/** Total time until the idle tree returns. */
export const WARNING_ARRIVAL_TOTAL_MS =
  WARNING_ARRIVAL.boxLagMs +
  Math.max(WARNING_ARRIVAL.openMs, WARNING_ARRIVAL.landDelayMs + WARNING_ARRIVAL.landMs) +
  WARNING_ARRIVAL.settleSlackMs;

/**
 * `idle` — the shipped tree, no wrappers.
 * `leading` — the quiet words still in the flow, fading; the rail taking its ink.
 * `opening` — the sentence in the flow (the box springs to it), the quiet words fading over it.
 * `crossfade` — Reduce Motion: the words swap by opacity, nothing moves.
 */
export type WarningArrivalPhase = 'idle' | 'leading' | 'opening' | 'crossfade';

export interface WarningArrival {
  phase: WarningArrivalPhase;
  outgoingOpacity: Animated.Value;
  railInk: Animated.Value;
  sentenceOpacity: Animated.Value;
  sentenceShift: Animated.Value;
}

/**
 * Plays once each time `enterKey` changes to a new non-zero value (the zone bumps it on an
 * OBSERVED quiet → warning transition for one pet). A mount, or a key of 0, draws still.
 */
export function useWarningArrival({
  enterKey,
  reducedMotion,
  appActive,
}: {
  enterKey: number;
  reducedMotion: boolean;
  appActive: boolean;
}): WarningArrival {
  const [phase, setPhase] = useState<WarningArrivalPhase>('idle');
  const outgoingOpacity = useRef(new Animated.Value(0)).current;
  const railInk = useRef(new Animated.Value(1)).current;
  const sentenceOpacity = useRef(new Animated.Value(1)).current;
  const sentenceShift = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastKey = useRef(enterKey);

  const finish = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    for (const v of [outgoingOpacity, railInk, sentenceOpacity, sentenceShift]) v.stopAnimation();
    outgoingOpacity.setValue(0);
    railInk.setValue(1);
    sentenceOpacity.setValue(1);
    sentenceShift.setValue(0);
    setPhase('idle');
  }, [outgoingOpacity, railInk, sentenceOpacity, sentenceShift]);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  // A layout effect: the phase lands before the first paint, so the finished sentence is
  // never drawn for a frame before its own arrival.
  useLayoutEffect(() => {
    if (enterKey === lastKey.current) return;
    lastKey.current = enterKey;
    if (enterKey === 0) return;
    finish();
    outgoingOpacity.setValue(1);
    sentenceOpacity.setValue(0);

    if (reducedMotion) {
      setPhase('crossfade');
      Animated.parallel([
        Animated.timing(outgoingOpacity, { toValue: 0, duration: WARNING_ARRIVAL.landMs, useNativeDriver: true }),
        Animated.timing(sentenceOpacity, { toValue: 1, duration: WARNING_ARRIVAL.landMs, useNativeDriver: true }),
      ]).start();
      after(WARNING_ARRIVAL.landMs + WARNING_ARRIVAL.settleSlackMs, finish);
      return;
    }

    railInk.setValue(0);
    sentenceShift.setValue(-WARNING_ARRIVAL.driftPt);
    setPhase('leading');
    Animated.timing(outgoingOpacity, {
      toValue: 0,
      duration: WARNING_ARRIVAL.railLeadMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    Animated.timing(railInk, {
      toValue: 1,
      duration: WARNING_ARRIVAL.railLeadMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
    after(WARNING_ARRIVAL.boxLagMs, () => {
      LayoutAnimation.configureNext(UNFOLD_LAYOUT);
      setPhase('opening');
    });
    after(WARNING_ARRIVAL.boxLagMs + WARNING_ARRIVAL.landDelayMs, () => {
      Animated.parallel([
        Animated.timing(sentenceOpacity, {
          toValue: 1,
          duration: WARNING_ARRIVAL.landMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sentenceShift, {
          toValue: 0,
          duration: WARNING_ARRIVAL.landMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
    after(WARNING_ARRIVAL_TOTAL_MS, finish);
  }, [enterKey, reducedMotion, finish, after, outgoingOpacity, railInk, sentenceOpacity, sentenceShift]);

  // A blur finishes the arrival rather than pausing it.
  useEffect(() => {
    if (!appActive && phase !== 'idle') finish();
  }, [appActive, phase, finish]);

  // Unmount: nothing left to draw, only timers to clear.
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  return { phase, outgoingOpacity, railInk, sentenceOpacity, sentenceShift };
}
