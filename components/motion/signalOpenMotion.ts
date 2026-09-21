// The Signal screen's opening (Design v2 — the whole day, D2-3 · CUL-1065; design
// authority `docs/culprit-design-v4-mockups.html` §03, the Motion Designer's read: "three
// beats: the screen rises (370ms), the chart draws in with it, the sentence and the
// receipt land together at 200ms; the lanes' dots pop in a stagger behind the compare.
// Under 700ms end to end, and the reverse is the same curve backwards").
//
// NO NEW ENGINE (C-30). The three beats are the app's existing ones, composed:
//   1. THE RISE is the route's own transition — `app/signal/[id].tsx` sets the native
//      stack's `slide_from_bottom` at the fold's `openMs`, so the platform draws the
//      screen rising with the fold's physics and Back is the same curve reversed, for
//      free. Nothing here moves the screen; a JS-side rise on top of a native push
//      would be two motions for one gesture.
//   2. THE DRAW IN is `useDrawIn` (D2-1), armed by the screen on the model's arrival:
//      the bars rise with the screen, the compare's bars extend, the dots pop behind on
//      the chart family's own stagger.
//   3. THE LANDING is this file: one native-driver value that carries the sentence and
//      the compare's block together — opacity 0 → 1 and the fold's 8pt drift, over the
//      fold's own `landMs`, starting at 200ms so it lands as the rise settles.
//
// Reduced motion: the route's transition is `none`, the charts are their static frames,
// and the landing value sits at its end state — the screen is simply there. App blur
// finishes (the fold's rule): a screen the owner left mid-open is whole when they return.

import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { FOLD_MOTION } from './foldMotion';

/** The beats, in ms and pt. */
export const SIGNAL_OPEN_MOTION = {
  /** Beat 1: the route's rise — the fold's open, so opening a Signal and re-opening a
   *  folded card are one physics. */
  riseMs: FOLD_MOTION.openMs,
  /** Beat 3 starts here: the sentence and the receipt land together. */
  landDelayMs: 200,
  /** …over the fold's own landing. */
  landMs: FOLD_MOTION.landMs,
  /** The landing's drift, the fold's 8pt. */
  driftPt: FOLD_MOTION.driftPt,
  /** The whole opening, end to end. `signalOpenMotion.test.ts` pins every beat inside it. */
  budgetMs: 700,
} as const;

export interface SignalOpenStyle {
  opacity: Animated.Value;
  transform: { translateY: Animated.Value }[];
}

interface Params {
  /** The FACT: the model just arrived for this reader (C-30). */
  arrived: boolean;
  /** What arrived — a new finding re-arms the landing. */
  identity: string;
  reducedMotion: boolean;
  appActive: boolean;
}

/** The landing style for the sentence + receipt block. */
export function useSignalOpen({ arrived, identity, reducedMotion, appActive }: Params): SignalOpenStyle {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const landed = useRef<string | null>(null);

  const settle = useCallback(() => {
    running.current?.stop();
    running.current = null;
    opacity.setValue(1);
    translateY.setValue(0);
  }, [opacity, translateY]);

  useEffect(() => {
    if (!arrived) return;
    if (landed.current === identity) return;
    landed.current = identity;
    if (reducedMotion) {
      settle();
      return;
    }
    running.current?.stop();
    opacity.setValue(0);
    translateY.setValue(SIGNAL_OPEN_MOTION.driftPt);
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: SIGNAL_OPEN_MOTION.landMs,
        delay: SIGNAL_OPEN_MOTION.landDelayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: SIGNAL_OPEN_MOTION.landMs,
        delay: SIGNAL_OPEN_MOTION.landDelayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    running.current = anim;
    anim.start(({ finished }) => {
      // A native-driver animation never writes its end value back; a finished landing pins it.
      if (finished) settle();
    });
    return () => {
      running.current?.stop();
      running.current = null;
    };
  }, [arrived, identity, reducedMotion, opacity, translateY, settle]);

  useEffect(() => {
    if (!appActive) settle();
  }, [appActive, settle]);

  useEffect(() => {
    if (reducedMotion) settle();
  }, [reducedMotion, settle]);

  return { opacity, transform: [{ translateY }] };
}
