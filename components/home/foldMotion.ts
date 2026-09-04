// The Signal fold's motion (CUL-788, fold spec §12 v1.2 — DF-10, "design delight").
//
// A fold is a collapse in place, never a dismissal, so the motion is subtraction with one
// thing held constant: THE RAIL IS THE SAME NODE before, during and after. Words leave
// first (what is leaving needs no reading); the box closes around the line; the strip's
// clause arrives WITH the box; and the rail shortens last. Unfolding is the reverse with
// the rail leading: the line grows first, the box follows it with one felt settle, and
// the sentence lands a beat after the box. Identical physics on every class — S1's
// plainness lives in what a safety strip SAYS, and identical motion is what keeps a
// safety fold from feeling like either a reward or a punishment.
//
// TWO ENGINES, ONE JOB EACH. `LayoutAnimation` moves GEOMETRY only — the row's height
// and every sibling below it, in one native transaction (the shipped expand idiom, now
// with the §12.4 object configs so fold eases and unfold springs). `Animated` on the
// native driver moves everything else: the face's fade-and-drift, the strip's late
// fade-in, the rail's lead / trail. The split is deliberate and load-bearing on Fabric:
// a layout keyframe re-applies a view's COMMITTED props when it ends, so a view that is
// both layout-animated and carrying an in-flight native-driver transform snaps back to
// the transform it was committed with. So the rail leaves the row's flow (absolute, an
// explicit height) for exactly the commits that animate layout, and no keyframe ever
// touches it; and no `create: { opacity }` config is used — the face and strip fades are
// `Animated` wrappers mounted only while a transition is in flight, which also makes the
// reduced-motion crossfade the same mechanism with the drift and the rail switched off.
//
// WHAT NEVER ENTERS THIS MACHINE (FS-9): an automatic re-open. The `folded` prop changing
// without a press — the record re-opening a card, a release on absence, a stored fold on
// first paint — renders the new state on the next frame with no `configureNext` and no
// wrapper. The two `LayoutAnimation` configs are reachable from `fold()` and `unfold()`
// only, and both are no-ops while a transition is in flight.
//
// APP BLUR FINISHES, NEVER PAUSES (the arrival moment's rule, adapted to a one-shot): a
// transition cut by a blur jumps to its end state and commits it un-animated, so the
// owner never returns to a card mid-collapse — a moment cut short is worse than one
// missed. No haptic anywhere here: `InsightCard` is on the haptics guard's scanned list,
// and the fold on a safety card must be silent.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, type LayoutAnimationConfig } from 'react-native';
import { theme } from '../../constants/theme';

/** The beats, in ms and pt — §12.1 / §12.2 v1.2 (bolder), verbatim. */
export const FOLD_MOTION = {
  /** Fold beat 1: the body's opacity 1 → 0 and 8pt upward drift. */
  leaveMs: 180,
  /** Fold beat 2: the row height eases expanded → strip; the strip fades in with it. */
  closeMs: 300,
  /** The rail starts shortening this long after the box begins to close. */
  railLagMs: 80,
  /** The rail's own shorten, face height → the strip's 16pt tick. */
  railTrailMs: 220,
  /** Unfold beat 1: the rail grows first, tick → the strip row, ahead of the box. */
  railLeadMs: 160,
  /** Unfold beat 2: the row springs (iOS) / eases (Android) strip → face; the face fades in. */
  openMs: 370,
  /** The sentence lands −8 → 0, starting this long after the box opens. */
  landDelayMs: 40,
  landMs: 300,
  /** The body's drift on fold and the face's landing on unfold, in pt (`space1`). */
  driftPt: theme.space1,
  /** The strip's resting rail — a 16pt tick, centred (the mock's `.foldrow .rail`). */
  stripRailPt: 16,
  /** Slack after the last beat before the idle tree returns, so the layout animation's
   *  final frame has landed before the in-flight wrappers unmount. */
  settleSlackMs: 30,
} as const;

/** Fold: the row height eases closed. Geometry only — no `create` fade (see the header). */
export const FOLD_LAYOUT: LayoutAnimationConfig = {
  duration: FOLD_MOTION.closeMs,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
};

/** Unfold: one felt settle on iOS (~4pt overshoot at damping 0.7, never a second bounce);
 *  Android's `LayoutAnimation` spring is coarse, and a stutter is worse than no spring. */
export const UNFOLD_LAYOUT: LayoutAnimationConfig = {
  duration: FOLD_MOTION.openMs,
  update:
    Platform.OS === 'ios'
      ? { type: LayoutAnimation.Types.spring, springDamping: 0.7 }
      : { type: LayoutAnimation.Types.easeInEaseOut },
};

/**
 * `idle` — the shipped tree, no wrapper, the rail a plain View.
 * `leaving` — fold beat 1 (the face fades and drifts; the rail still in flow).
 * `closing` — fold beat 2 (the box eases shut, the strip fades in, the rail trails).
 * `opening` — the unfold (the rail leads, then the box springs and the face lands).
 * `crossfade` — reduced motion, either direction: the incoming content fades in, nothing moves.
 */
export type FoldPhase = 'idle' | 'leaving' | 'closing' | 'opening' | 'crossfade';

export interface FoldMotionValues {
  /** The face wrapper's opacity (1 → 0 on fold, 0 → 1 on unfold / crossfade-in). */
  faceOpacity: Animated.Value;
  /** The face wrapper's translateY (0 → −8 on fold, −8 → 0 on unfold; 0 under reduced motion). */
  faceShift: Animated.Value;
  /** The strip wrapper's opacity (0 → 1 as the box closes / crossfade-in). */
  stripOpacity: Animated.Value;
  /** The rail's scaleY about its top edge (1 ⇄ 16 / its explicit height). */
  railScale: Animated.Value;
  /** The rail's translateY, so the 16pt tick ends centred on the strip. */
  railShift: Animated.Value;
}

export interface FoldMotion {
  phase: FoldPhase;
  /** A motion transition is in flight — the row clips, the rail is absolute, presses are no-ops. */
  inFlight: boolean;
  /** The rail's explicit height while it is out of the row's flow; null when in flow. */
  railHeight: number | null;
  values: FoldMotionValues;
  /** The content column's layout — attached while folded or transitioning; measures the
   *  face (for the rail's fold height) and the strip (for the tick's centre). */
  onContentLayout: (height: number) => void;
  /** The owner tapped `Keep it compact`. */
  fold: () => void;
  /** The owner tapped the strip. */
  unfold: () => void;
}

interface Params {
  /** The host's fold state for this finding. */
  folded: boolean;
  reducedMotion: boolean;
  appActive: boolean;
  /** The finding's identity — a change mid-transition aborts it (the row was re-keyed). */
  identity: string;
  /** The row's top padding in the face state (the rail's absolute `top`). */
  facePaddingTop: number;
  onFold: () => void;
  onUnfold: () => void;
}

type Pending = null | 'fold' | 'unfold';

export function useFoldMotion({
  folded,
  reducedMotion,
  appActive,
  identity,
  facePaddingTop,
  onFold,
  onUnfold,
}: Params): FoldMotion {
  const [phase, setPhase] = useState<FoldPhase>('idle');
  const [railHeight, setRailHeight] = useState<number | null>(null);

  const values = useRef<FoldMotionValues>({
    faceOpacity: new Animated.Value(1),
    faceShift: new Animated.Value(0),
    stripOpacity: new Animated.Value(1),
    railScale: new Animated.Value(1),
    railShift: new Animated.Value(0),
  }).current;

  // Read at the instant a beat fires, never closed over per render. Written ONLY by `go`
  // (eagerly), never from the render — so it is always the latest phase requested.
  const phaseRef = useRef<FoldPhase>('idle');
  const foldedRef = useRef(folded);
  foldedRef.current = folded;
  const callbacks = useRef({ onFold, onUnfold });
  callbacks.current = { onFold, onUnfold };
  const padTop = useRef(facePaddingTop);
  padTop.current = facePaddingTop;

  // The last measured heights of the two contents. The face's is what the rail holds
  // while the box closes around it; the strip's is where the tick must end up (its
  // centre), and where the rail starts from on an unfold.
  const faceH = useRef<number | null>(null);
  const stripH = useRef<number | null>(null);
  // The state change this transition owes the host, until it is issued.
  const pending = useRef<Pending>(null);
  // A fold's rail beat waits for both its lag timer AND the strip's measurement.
  const railBeatArmed = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const running = useRef<Animated.CompositeAnimation[]>([]);
  const mounted = useRef(true);

  const later = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.current = timers.current.filter((x) => x !== t);
      if (mounted.current) fn();
    }, ms);
    timers.current.push(t);
  }, []);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const run = useCallback((anim: Animated.CompositeAnimation, onDone: () => void) => {
    running.current.push(anim);
    anim.start(({ finished }) => {
      running.current = running.current.filter((a) => a !== anim);
      // `finished: false` is a stop (blur, abort, unmount) — whoever stopped it owns the
      // end state; never continue the choreography from here.
      if (!finished || !mounted.current) return;
      onDone();
    });
  }, []);

  const stopAll = useCallback(() => {
    for (const a of running.current) a.stop();
    running.current = [];
    clearTimers();
  }, [clearTimers]);

  const timing = useCallback(
    (
      value: Animated.Value,
      toValue: number,
      duration: number,
      easing: (t: number) => number,
      delay = 0,
    ): Animated.CompositeAnimation =>
      Animated.timing(value, { toValue, duration, delay, easing, useNativeDriver: true }),
    [],
  );

  // A native-driver animation does not write its final value back to the JS side, so
  // every completion pins it — a later re-render then commits the end state, never the
  // seed the animation started from.
  const rest = useCallback(() => {
    values.faceOpacity.setValue(1);
    values.faceShift.setValue(0);
    values.stripOpacity.setValue(1);
    values.railScale.setValue(1);
    values.railShift.setValue(0);
  }, [values]);

  // Every phase change writes the ref EAGERLY, before React re-renders: a beat's callback
  // can fire in the same tick as the change that started it (a mocked native driver
  // completes synchronously), and a stale ref would drop the choreography on the floor.
  const go = useCallback((p: FoldPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const goIdle = useCallback(() => {
    rest();
    clearTimers();
    railBeatArmed.current = false;
    pending.current = null;
    setRailHeight(null);
    go('idle');
  }, [rest, clearTimers, go]);

  /** The transition ends NOW: values at their end state, the owed commit issued
   *  un-animated. Blur, and the safety valve for a beat that never finished. */
  const settle = useCallback(() => {
    if (phaseRef.current === 'idle') return;
    stopAll();
    const owed = pending.current;
    pending.current = null;
    goIdle();
    if (owed === 'fold') callbacks.current.onFold();
    if (owed === 'unfold') callbacks.current.onUnfold();
  }, [stopAll, goIdle]);

  /** The transition is abandoned: the finding under it changed. Nothing is committed —
   *  the host already holds the new finding's own state. */
  const abort = useCallback(() => {
    if (phaseRef.current === 'idle') return;
    stopAll();
    goIdle();
  }, [stopAll, goIdle]);

  // ── The rail's trailing beat on fold (§12.1, 260 → 480) ──────────────────────
  const railTrail = useCallback(() => {
    if (phaseRef.current !== 'closing') return;
    const from = faceH.current;
    const to = stripH.current;
    if (from == null || to == null) return; // no measurement: the rail rides the box (§12.3's degrade)
    const tick = FOLD_MOTION.stripRailPt;
    run(
      Animated.parallel([
        timing(values.railScale, tick / from, FOLD_MOTION.railTrailMs, Easing.inOut(Easing.quad)),
        // The tick ends centred on the strip: the strip row has no vertical padding, the
        // rail's absolute top is the FACE row's padding, so the shift is the difference.
        timing(values.railShift, (to - tick) / 2 - padTop.current, FOLD_MOTION.railTrailMs, Easing.inOut(Easing.quad)),
      ]),
      () => {
        values.railScale.setValue(tick / from);
        values.railShift.setValue((to - tick) / 2 - padTop.current);
        later(FOLD_MOTION.settleSlackMs, goIdle);
      },
    );
  }, [run, timing, values, later, goIdle]);

  // ── Fold ─────────────────────────────────────────────────────────────────────
  const fold = useCallback(() => {
    if (phaseRef.current !== 'idle' || foldedRef.current) return;
    if (reducedMotion) {
      // Instant geometry; the incoming strip crossfades over durationFast. No
      // configureNext, no translate — a crossfade is not motion (§12.3).
      values.stripOpacity.setValue(0);
      pending.current = null;
      go('crossfade');
      callbacks.current.onFold();
      run(timing(values.stripOpacity, 1, theme.durationFast, Easing.out(Easing.quad)), () => {
        values.stripOpacity.setValue(1);
        goIdle();
      });
      return;
    }
    values.faceOpacity.setValue(1);
    values.faceShift.setValue(0);
    values.stripOpacity.setValue(0);
    values.railScale.setValue(1);
    values.railShift.setValue(0);
    pending.current = 'fold';
    railBeatArmed.current = false;
    go('leaving');
    // Beat 1: the words leave — opacity 1 → 0, 8pt upward drift, ease-out.
    run(
      Animated.parallel([
        timing(values.faceOpacity, 0, FOLD_MOTION.leaveMs, Easing.out(Easing.quad)),
        timing(values.faceShift, -FOLD_MOTION.driftPt, FOLD_MOTION.leaveMs, Easing.out(Easing.quad)),
      ]),
      () => {
        values.faceOpacity.setValue(0);
        values.faceShift.setValue(-FOLD_MOTION.driftPt);
        if (phaseRef.current !== 'leaving') return;
        // Beat 2: the box closes around the line. One commit carries the layout config,
        // the phase, the rail's explicit height and the host's state change, so the row
        // height, the padding and every sibling below move in the same native transaction.
        LayoutAnimation.configureNext(FOLD_LAYOUT);
        pending.current = null;
        setRailHeight(faceH.current);
        go('closing');
        callbacks.current.onFold();
        run(timing(values.stripOpacity, 1, FOLD_MOTION.closeMs, Easing.inOut(Easing.quad)), () => {
          values.stripOpacity.setValue(1);
        });
        // The rail shortens LAST — 80ms behind the box, and only once the strip has been
        // measured (its layout lands a frame after this commit; the lag covers it).
        later(FOLD_MOTION.railLagMs, () => {
          if (stripH.current != null) railTrail();
          else railBeatArmed.current = true;
        });
        // Whatever happens to the rail beat, the transition ends: a face height that was
        // never measured degrades to the rail riding the box (§12.3) and the tree returns
        // to idle when the box has landed.
        later(FOLD_MOTION.closeMs + FOLD_MOTION.railLagMs + FOLD_MOTION.railTrailMs + FOLD_MOTION.settleSlackMs * 2, () => {
          if (phaseRef.current === 'closing') goIdle();
        });
      },
    );
  }, [reducedMotion, values, run, timing, later, goIdle, railTrail, go]);

  // ── Unfold ───────────────────────────────────────────────────────────────────
  const unfold = useCallback(() => {
    if (phaseRef.current !== 'idle' || !foldedRef.current) return;
    if (reducedMotion) {
      values.faceOpacity.setValue(0);
      values.faceShift.setValue(0);
      pending.current = null;
      go('crossfade');
      callbacks.current.onUnfold();
      run(timing(values.faceOpacity, 1, theme.durationFast, Easing.out(Easing.quad)), () => {
        values.faceOpacity.setValue(1);
        goIdle();
      });
      return;
    }
    const from = stripH.current;
    const tick = FOLD_MOTION.stripRailPt;
    values.faceOpacity.setValue(0);
    values.faceShift.setValue(-FOLD_MOTION.driftPt);
    pending.current = 'unfold';

    const openBox = () => {
      if (phaseRef.current !== 'opening') return;
      LayoutAnimation.configureNext(UNFOLD_LAYOUT);
      pending.current = null;
      callbacks.current.onUnfold();
      run(
        Animated.parallel([
          timing(values.faceOpacity, 1, FOLD_MOTION.openMs, Easing.inOut(Easing.quad)),
          timing(values.faceShift, 0, FOLD_MOTION.landMs, Easing.out(Easing.cubic), FOLD_MOTION.landDelayMs),
        ]),
        () => {
          values.faceOpacity.setValue(1);
          values.faceShift.setValue(0);
          later(FOLD_MOTION.settleSlackMs, goIdle);
        },
      );
    };

    if (from == null) {
      // No strip measurement (a stored fold whose layout never reported): the rail rides
      // the box, in flow, and the face still lands — §12.3's degrade, never a snap.
      go('opening');
      openBox();
      return;
    }
    // Beat 1: the rail grows FIRST — from the tick to the strip row, 160ms ease-out —
    // ahead of the box. It leaves the flow at its exact current frame (the tick), so
    // this commit changes nothing the eye can see.
    values.railScale.setValue(tick / from);
    values.railShift.setValue((from - tick) / 2 - padTop.current);
    setRailHeight(from);
    go('opening');
    run(
      Animated.parallel([
        timing(values.railScale, 1, FOLD_MOTION.railLeadMs, Easing.out(Easing.cubic)),
        timing(values.railShift, 0, FOLD_MOTION.railLeadMs, Easing.out(Easing.cubic)),
      ]),
      () => {
        values.railScale.setValue(1);
        values.railShift.setValue(0);
      },
    );
    // Beat 2, 80ms behind the rail: the box follows the line.
    later(FOLD_MOTION.railLagMs, openBox);
  }, [reducedMotion, values, run, timing, later, goIdle, go]);

  const onContentLayout = useCallback(
    (height: number) => {
      const p = phaseRef.current;
      if (p === 'leaving') {
        faceH.current = height;
      } else if (p === 'closing') {
        stripH.current = height;
        if (railBeatArmed.current) {
          railBeatArmed.current = false;
          railTrail();
        }
      } else if (p === 'opening') {
        if (foldedRef.current) {
          stripH.current = height;
        } else {
          // The face has landed: the rail's explicit height becomes the face's, so the
          // line fills the opening box (clipped by it until the box catches up).
          faceH.current = height;
          setRailHeight((h) => (h == null || height > h ? height : h));
        }
      } else if (foldedRef.current) {
        // Folded and idle: the strip's height, where the next unfold starts from.
        stripH.current = height;
      }
    },
    [railTrail],
  );

  // Blur FINISHES the transition (never pauses it — see the header).
  useEffect(() => {
    if (!appActive) settle();
  }, [appActive, settle]);

  // The row was re-keyed under a transition (a pet switch, a re-ranked payload): the
  // choreography belonged to a finding that is gone.
  const lastIdentity = useRef(identity);
  useEffect(() => {
    if (lastIdentity.current === identity) return;
    lastIdentity.current = identity;
    faceH.current = null;
    stripH.current = null;
    abort();
  }, [identity, abort]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopAll();
    };
  }, [stopAll]);

  return {
    phase,
    inFlight: phase === 'leaving' || phase === 'closing' || phase === 'opening',
    railHeight,
    values,
    onContentLayout,
    fold,
    unfold,
  };
}
