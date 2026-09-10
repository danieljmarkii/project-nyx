// The Noticed card's two motions (CUL-871 / N-4a; docs/nyx-daily-look-requirements.md
// §3.1a — the unfold, the way back, and the arrival).
//
// C-30, applied in the direction the rule was written for: this is the SECOND surface
// that needs the fold's choreography, so it LIFTS `foldMotion.ts` rather than restating
// its constants. Every duration below that also governs the Signal fold is imported —
// `UNFOLD_LAYOUT`, `FOLD_LAYOUT`, `landDelayMs`, `landMs`, `leaveMs`, `driftPt` — so a
// tuning pass on the fold moves this card too, which is the point: an owner should not
// be able to feel that two cards on the same screen were built in different months.
//
// TWO HOOKS, NOT ONE HOOK WITH A MODE (C-30's "prefer a sibling hook to a mode flag").
// They defer different things: the grid's disclosure is GEOMETRY (a box growing around
// content, `LayoutAnimation`, one native transaction with every sibling below it), and
// the arrival is a MARK BEING DRAWN (native-driver `Animated` on a node that owns its
// own frame). The two-engine split is `foldMotion.ts`'s and is load-bearing for the
// same reason it is there: a layout keyframe re-commits a view's props when it ends,
// so a node that is both layout-animated and mid-transform snaps back.
//
// APP BLUR FINISHES, NEVER PAUSES (the fold's rule). A transition cut by a blur is
// committed at its end state, so the owner never returns to a half-drawn ring.
//
// REDUCED MOTION is the same end state with nothing moving: the box changes size with
// no `configureNext`, the families are simply there, the ring is drawn rather than
// animated. It is the `crossfade` phase's rule, one surface over.

import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, LayoutAnimation } from 'react-native';
import { FOLD_MOTION, FOLD_LAYOUT, UNFOLD_LAYOUT } from './foldMotion';

/** The beats this card adds to the fold's vocabulary. Everything else is imported. */
export const LOOK_MOTION = {
  /** The hollow ring drawing itself as the look arrives (§3.1a, R14). A stroke in the
   *  mock; here it is the mark's own scale-and-fade over the same 320 ms, because the
   *  ring is an 11 pt bordered node (`nodeDotColors`) shared with the day lane and the
   *  spine — turning it into an SVG path for one surface would fork the one thing
   *  those three drawings share. The beat is what the owner reads; the geometry stays
   *  the lane's. */
  ringDrawMs: 320,
  /** The ring's starting scale — a mark that grows INTO its own size, never past it
   *  (no overshoot: this is a record landing, not a reward). */
  ringFromScale: 0.6,
} as const;

export interface GridDisclosure {
  /** Wrap the grid body in an `Animated.View` carrying this, so the families land a
   *  beat after the box (`landDelayMs` / `landMs`) rather than appearing with it. */
  landStyle: { opacity: Animated.Value; transform: { translateY: Animated.Value }[] };
  /**
   * Call with the state you are about to commit, then commit it in the same tick.
   *
   * The order matters and is the shipped fold's: `configureNext` arms the NEXT commit,
   * so the setState that follows carries the box, its padding and every sibling below
   * it in one native transaction.
   */
  beforeCommit: (next: boolean) => void;
}

/**
 * The grid growing in place and closing again — never a sheet, never a navigation.
 *
 * `open` is the card's own state, read here only to run the landing when it becomes
 * true. This hook never owns the state: a disclosure the owner controls must not be
 * recoverable only through a motion hook's internals.
 */
export function useGridDisclosure(params: {
  open: boolean;
  reducedMotion: boolean;
  appActive: boolean;
}): GridDisclosure {
  const { open, reducedMotion, appActive } = params;
  const opacity = useRef(new Animated.Value(open ? 1 : 0)).current;
  const shift = useRef(new Animated.Value(0)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const reduced = useRef(reducedMotion);
  reduced.current = reducedMotion;

  const settle = useCallback(() => {
    running.current?.stop();
    running.current = null;
    opacity.setValue(1);
    shift.setValue(0);
  }, [opacity, shift]);

  // The families land −8 → 0 a beat after the box (`landDelayMs` 40, `landMs` 300),
  // on the fold's own curve. Under reduced motion they are simply there.
  useEffect(() => {
    if (!open) {
      settle();
      return;
    }
    if (reduced.current) {
      opacity.setValue(1);
      shift.setValue(0);
      return;
    }
    opacity.setValue(0);
    shift.setValue(-FOLD_MOTION.driftPt);
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: FOLD_MOTION.landMs,
        delay: FOLD_MOTION.landDelayMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(shift, {
        toValue: 0,
        duration: FOLD_MOTION.landMs,
        delay: FOLD_MOTION.landDelayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    running.current = anim;
    // A native-driver animation never writes its final value back to JS, so the
    // completion pins it: a later re-render then commits the end state rather than the
    // seed (`foldMotion`'s `rest()`, same reason).
    anim.start(({ finished }) => {
      if (finished) settle();
    });
    return () => {
      running.current?.stop();
      running.current = null;
    };
  }, [open, opacity, shift, settle]);

  // Blur FINISHES: the families are where they were going, committed un-animated.
  useEffect(() => {
    if (!appActive) settle();
  }, [appActive, settle]);

  const beforeCommit = useCallback(
    (next: boolean) => {
      if (reduced.current) return; // instant geometry; nothing moves (§3.1a)
      LayoutAnimation.configureNext(next ? UNFOLD_LAYOUT : FOLD_LAYOUT);
    },
    [],
  );

  return {
    landStyle: { opacity, transform: [{ translateY: shift }] },
    beforeCommit,
  };
}

export interface LookArrival {
  /** The hollow ring drawing itself. */
  ringStyle: { opacity: Animated.Value; transform: { scale: Animated.Value }[] };
  /** The words and the hour landing with it — the same fade, no drift: the thing the
   *  owner made is what arrives, and it arrives whole. */
  wordsStyle: { opacity: Animated.Value };
}

/**
 * One look arriving as the day's newest entry (§3.1a, R14).
 *
 * `entryKey` is the look's own event id. A NEW look re-runs the draw; a re-render for
 * any other reason does not — which is what keeps a second look's arrival from
 * re-drawing the first one's ring beneath it.
 *
 * `animate` is the FACT the trigger switches on (C-30), and the fact is "this entry
 * was just written by this card", never "an entry is on screen": the same row renders
 * identically when Home reloads it from the record a minute later, and re-drawing it
 * then would announce a record the owner did not just make.
 */
export function useLookArrival(params: {
  entryKey: string | null;
  animate: boolean;
  reducedMotion: boolean;
  appActive: boolean;
}): LookArrival {
  const { entryKey, animate, reducedMotion, appActive } = params;
  const ringOpacity = useRef(new Animated.Value(1)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const wordsOpacity = useRef(new Animated.Value(1)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const drawn = useRef<string | null>(null);

  const settle = useCallback(() => {
    running.current?.stop();
    running.current = null;
    ringOpacity.setValue(1);
    ringScale.setValue(1);
    wordsOpacity.setValue(1);
  }, [ringOpacity, ringScale, wordsOpacity]);

  useEffect(() => {
    if (!entryKey || !animate || drawn.current === entryKey) return;
    drawn.current = entryKey;
    if (reducedMotion) {
      // Drawn, not animated — the end state, immediately (§3.1a's reduced-motion rule).
      settle();
      return;
    }
    ringOpacity.setValue(0);
    ringScale.setValue(LOOK_MOTION.ringFromScale);
    wordsOpacity.setValue(0);
    const anim = Animated.parallel([
      Animated.timing(ringOpacity, {
        toValue: 1,
        duration: LOOK_MOTION.ringDrawMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(ringScale, {
        toValue: 1,
        duration: LOOK_MOTION.ringDrawMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // The words follow the fold's own leave/land pace rather than a number of this
      // card's own.
      Animated.timing(wordsOpacity, {
        toValue: 1,
        duration: FOLD_MOTION.landMs,
        delay: FOLD_MOTION.landDelayMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    running.current = anim;
    anim.start(({ finished }) => {
      if (finished) settle();
    });
    return () => {
      running.current?.stop();
      running.current = null;
    };
  }, [entryKey, animate, reducedMotion, ringOpacity, ringScale, wordsOpacity, settle]);

  useEffect(() => {
    if (!appActive) settle();
  }, [appActive, settle]);

  return {
    ringStyle: { opacity: ringOpacity, transform: [{ scale: ringScale }] },
    wordsStyle: { opacity: wordsOpacity },
  };
}
