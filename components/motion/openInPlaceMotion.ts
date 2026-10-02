// A day opening IN PLACE under its row (Design v2 — the whole day, D2-5 · CUL-1067;
// design authority `docs/culprit-design-v4-mockups.html` §04: "the day opens in place",
// with the Signal fold's physics — rail leads, box follows, rows land).
//
// C-30, ONE MORE TIME: a shared choreography lives in `components/motion/`, and this is
// the fold's vocabulary on a new surface. Every beat below is `FOLD_MOTION`'s and the two
// layout configs are the fold's own `UNFOLD_LAYOUT` / `FOLD_LAYOUT`, imported and never
// restated — so when the fold's physics change, the day's change with them.
//
// THE ANATOMY. Under the tapped row sits a SLOT — in flow, `overflow: hidden`, a rail at
// its left edge and the day's rows beside it. The slot mounts the moment a day opens and
// unmounts once its rail has trailed away; the rows mount only once the box is opening.
//
//   open   1. the RAIL grows first: scaleY 0 → 1 about its top over `railLeadMs`, while the
//             slot holds its lead height — the line arrives ahead of the box.
//          2. `railLagMs` later the BOX follows: one `LayoutAnimation` commit (`UNFOLD_LAYOUT`,
//             the fold's spring) mounts the rows, so the slot's height and every row of the
//             grid beneath it move in one native transaction.
//          3. the ROWS land: opacity 0 → 1 and −8 → 0 over `landMs`, `landDelayMs` after the
//             box begins — the words arrive a beat after the shape.
//   close  1. the rows LEAVE: opacity 1 → 0 with the 8pt upward drift over `leaveMs`.
//          2. the BOX closes: `FOLD_LAYOUT` unmounts the rows, the slot eases back to its
//             lead height.
//          3. the RAIL trails, `railLagMs` behind the box, scaleY 1 → 0 over `railTrailMs`;
//             then the slot leaves.
//
// TWO ENGINES, ONE JOB EACH (the fold's split, load-bearing on Fabric): `LayoutAnimation`
// moves GEOMETRY — the slot's height and the grid beneath — and never carries a `create`
// fade; `Animated` on the native driver moves everything else. The rail holds an EXPLICIT
// height for every commit that animates layout, so no layout keyframe re-commits a view
// that is carrying an in-flight native-driver transform (the fold's header has the why).
// Idle and open, the rail is a plain absolute-fill View with no transform at all.
//
// WHAT NEVER ENTERS THIS MACHINE: a switch between days. One day is open at a time; when
// the host re-keys the open day under an in-flight or open row, the slot renders the new
// day's state on the next frame with no `configureNext` (the fold's FS-9 rule, applied
// to a re-key). Reduced motion is a crossfade over `durationFast`, nothing moves. A blur
// FINISHES the transition at its end state, never pauses it. No haptic here and none may
// be added — this file drives a surface that lists a day's incidents, and it is named in
// `guards/haptics.test.ts`'s ALWAYS_SCANNED.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutAnimation } from 'react-native';
import { theme } from '../../constants/theme';
import { FOLD_LAYOUT, FOLD_MOTION, UNFOLD_LAYOUT } from './foldMotion';

/** The slot's height while only the rail is there — the line the box grows from. The
 *  44pt floor, so the rail's lead is a visible stroke and never a hairline. */
export const OPEN_IN_PLACE_LEAD_PT = 44;

/**
 * `closed` — nothing rendered.
 * `leading` — the rail is growing; the rows are not mounted yet.
 * `opening` — the box is springing open and the rows are landing.
 * `open` — the shipped tree: a plain rail, the rows, no wrapper.
 * `leaving` — the rows are fading out ahead of the box.
 * `closing` — the box has closed and the rail is trailing away.
 * `crossfade` — reduced motion, either direction: a fade, nothing moves.
 */
export type OpenInPlacePhase = 'closed' | 'leading' | 'opening' | 'open' | 'leaving' | 'closing' | 'crossfade';

export interface OpenInPlaceValues {
  /** The rail's scaleY about its top edge (0 ⇄ 1). */
  railScale: Animated.Value;
  /** The rows' opacity (0 → 1 landing, 1 → 0 leaving). */
  rowsOpacity: Animated.Value;
  /** The rows' translateY (−8 → 0 landing, 0 → −8 leaving; 0 under reduced motion). */
  rowsShift: Animated.Value;
}

export interface OpenInPlace {
  phase: OpenInPlacePhase;
  /** Render the slot (the rail's home) at all. */
  slotMounted: boolean;
  /** Render the rows inside the slot. */
  rowsMounted: boolean;
  /** A transition is in flight: the rail is out of the flow with an explicit height. */
  inFlight: boolean;
  /** The rail's explicit height while in flight; null when it fills the slot. */
  railHeight: number | null;
  /** The slot's minimum height — the lead height while only the rail is there. */
  slotMinHeight: number;
  values: OpenInPlaceValues;
  /** The slot's layout — measures the open box so the trailing rail has a height. */
  onSlotLayout: (height: number) => void;
}

interface Params {
  /** The host's state: this row's day is the open one. */
  shown: boolean;
  /** Which day is shown — a change under an open row re-keys without motion. */
  identity: string;
  reducedMotion: boolean;
  appActive: boolean;
}

export function useOpenInPlace({ shown, identity, reducedMotion, appActive }: Params): OpenInPlace {
  const [phase, setPhase] = useState<OpenInPlacePhase>(shown ? 'open' : 'closed');
  const [railHeight, setRailHeight] = useState<number | null>(null);

  const values = useRef<OpenInPlaceValues>({
    railScale: new Animated.Value(1),
    rowsOpacity: new Animated.Value(1),
    rowsShift: new Animated.Value(0),
  }).current;

  // Written EAGERLY by `go`, never from the render: a beat's callback can fire in the same
  // tick as the change that started it (a mocked native driver completes synchronously).
  const phaseRef = useRef<OpenInPlacePhase>(phase);
  const slotH = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const running = useRef<Animated.CompositeAnimation[]>([]);
  const mounted = useRef(true);
  const reduced = useRef(reducedMotion);
  reduced.current = reducedMotion;

  const go = useCallback((p: OpenInPlacePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.current = timers.current.filter((x) => x !== t);
      if (mounted.current) fn();
    }, ms);
    timers.current.push(t);
  }, []);

  const stopAll = useCallback(() => {
    for (const a of running.current) a.stop();
    running.current = [];
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const run = useCallback((anim: Animated.CompositeAnimation, onDone: () => void) => {
    running.current.push(anim);
    anim.start(({ finished }) => {
      running.current = running.current.filter((a) => a !== anim);
      // `finished: false` is a stop — whoever stopped it owns the end state.
      if (!finished || !mounted.current) return;
      onDone();
    });
  }, []);

  const timing = useCallback(
    (value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number, delay = 0) =>
      Animated.timing(value, { toValue, duration, delay, easing, useNativeDriver: true }),
    [],
  );

  /** Every value at its OPEN end state. A native-driver animation never writes its final
   *  value back, so every completion pins it (the fold's `rest()`). */
  const restOpen = useCallback(() => {
    values.railScale.setValue(1);
    values.rowsOpacity.setValue(1);
    values.rowsShift.setValue(0);
  }, [values]);

  /** The transition ends NOW at the end state the host asked for. Blur, a re-key under a
   *  transition, and the safety valve for a beat that never finished. */
  const settle = useCallback(
    (toShown: boolean) => {
      stopAll();
      restOpen();
      setRailHeight(null);
      go(toShown ? 'open' : 'closed');
    },
    [stopAll, restOpen, go],
  );

  // ── Open: rail leads, box follows, rows land ──────────────────────────────────
  const open = useCallback(() => {
    if (reduced.current) {
      // Instant geometry; the rows crossfade in. No configureNext, no translate.
      values.railScale.setValue(1);
      values.rowsShift.setValue(0);
      values.rowsOpacity.setValue(0);
      go('crossfade');
      run(timing(values.rowsOpacity, 1, theme.durationFast, Easing.out(Easing.quad)), () => {
        values.rowsOpacity.setValue(1);
        setRailHeight(null);
        go('open');
      });
      return;
    }
    values.railScale.setValue(0);
    values.rowsOpacity.setValue(0);
    values.rowsShift.setValue(-FOLD_MOTION.driftPt);
    setRailHeight(OPEN_IN_PLACE_LEAD_PT);
    go('leading');
    // Beat 1: the rail grows first, ahead of the box.
    run(timing(values.railScale, 1, FOLD_MOTION.railLeadMs, Easing.out(Easing.cubic)), () => {
      values.railScale.setValue(1);
    });
    // Beat 2, railLagMs behind the rail: the box follows. One commit carries the layout
    // config and the rows' mount, so the slot's height and the grid beneath move together.
    later(FOLD_MOTION.railLagMs, () => {
      if (phaseRef.current !== 'leading') return;
      LayoutAnimation.configureNext(UNFOLD_LAYOUT);
      go('opening');
      // Beat 3: the rows land a beat after the box begins.
      run(
        Animated.parallel([
          timing(values.rowsOpacity, 1, FOLD_MOTION.landMs, Easing.out(Easing.quad), FOLD_MOTION.landDelayMs),
          timing(values.rowsShift, 0, FOLD_MOTION.landMs, Easing.out(Easing.cubic), FOLD_MOTION.landDelayMs),
        ]),
        () => {
          values.rowsOpacity.setValue(1);
          values.rowsShift.setValue(0);
          // Idle once the layout spring has landed too, so the rail returns to the flow
          // (absolute fill, no transform) on a frame where nothing is moving.
          later(Math.max(0, FOLD_MOTION.openMs - FOLD_MOTION.landDelayMs - FOLD_MOTION.landMs) + FOLD_MOTION.settleSlackMs, () => {
            if (phaseRef.current !== 'opening') return;
            setRailHeight(null);
            go('open');
          });
        },
      );
    });
  }, [values, go, run, timing, later]);

  // ── Close: rows leave, box closes, rail trails ────────────────────────────────
  const close = useCallback(() => {
    if (reduced.current) {
      go('crossfade');
      run(timing(values.rowsOpacity, 0, theme.durationFast, Easing.out(Easing.quad)), () => {
        settle(false);
      });
      return;
    }
    values.rowsOpacity.setValue(1);
    values.rowsShift.setValue(0);
    values.railScale.setValue(1);
    // The rail holds the open box's measured height through the close, so the layout
    // commit that shrinks the slot never touches a transforming node; the slot clips it.
    setRailHeight(slotH.current ?? OPEN_IN_PLACE_LEAD_PT);
    go('leaving');
    // Beat 1: the words leave.
    run(
      Animated.parallel([
        timing(values.rowsOpacity, 0, FOLD_MOTION.leaveMs, Easing.out(Easing.quad)),
        timing(values.rowsShift, -FOLD_MOTION.driftPt, FOLD_MOTION.leaveMs, Easing.out(Easing.quad)),
      ]),
      () => {
        values.rowsOpacity.setValue(0);
        values.rowsShift.setValue(-FOLD_MOTION.driftPt);
        if (phaseRef.current !== 'leaving') return;
        // Beat 2: the box closes — one commit unmounts the rows under the fold's ease.
        LayoutAnimation.configureNext(FOLD_LAYOUT);
        go('closing');
        // Beat 3: the rail trails, railLagMs behind the box.
        later(FOLD_MOTION.railLagMs, () => {
          if (phaseRef.current !== 'closing') return;
          run(timing(values.railScale, 0, FOLD_MOTION.railTrailMs, Easing.inOut(Easing.quad)), () => {
            values.railScale.setValue(0);
            later(FOLD_MOTION.settleSlackMs, () => {
              if (phaseRef.current === 'closing') settle(false);
            });
          });
        });
        // Whatever happens to the rail beat, the transition ends.
        later(FOLD_MOTION.closeMs + FOLD_MOTION.railLagMs + FOLD_MOTION.railTrailMs + FOLD_MOTION.settleSlackMs * 2, () => {
          if (phaseRef.current === 'closing') settle(false);
        });
      },
    );
  }, [values, go, run, timing, later, settle]);

  // The host's state drives the machine. A flip under a transition finishes that
  // transition first (never a second choreography over a half-drawn one), then runs the
  // new direction; a re-key under an open row renders the new day with no motion.
  const lastIdentity = useRef(identity);
  const lastShown = useRef(shown);
  useEffect(() => {
    const p = phaseRef.current;
    const flying = p !== 'open' && p !== 'closed';
    // A RE-KEY is a different day under a row that was showing one and still is — the
    // no-motion switch. A slot that was closed (its identity the host's "nothing") and
    // now shows a day is an OPEN, with the choreography; a closing slot keeps the day
    // it is closing over.
    const reKeyed = lastIdentity.current !== identity && lastShown.current && shown;
    lastIdentity.current = identity;
    if (reKeyed) {
      slotH.current = null;
      settle(true);
      return;
    }
    // Same state as last asked, in flight or not: nothing to do (a transition already
    // heading there is left to finish).
    if (shown === lastShown.current) return;
    lastShown.current = shown;
    if (flying) settle(!shown);
    if (shown) open();
    else close();
  }, [shown, identity, open, close, settle]);

  // Blur FINISHES the transition at the state the host asked for.
  useEffect(() => {
    if (appActive) return;
    const p = phaseRef.current;
    if (p === 'open' || p === 'closed') return;
    settle(lastShown.current);
  }, [appActive, settle]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopAll();
    };
  }, [stopAll]);

  const onSlotLayout = useCallback((height: number) => {
    // Only an OPEN, idle slot is the box's true height; mid-flight frames are the spring.
    if (phaseRef.current === 'open') slotH.current = height;
  }, []);

  const inFlight = phase === 'leading' || phase === 'opening' || phase === 'leaving' || phase === 'closing';
  return {
    phase,
    slotMounted: phase !== 'closed',
    rowsMounted: phase === 'opening' || phase === 'open' || phase === 'leaving' || phase === 'crossfade',
    inFlight,
    railHeight: inFlight ? railHeight : null,
    slotMinHeight: OPEN_IN_PLACE_LEAD_PT,
    values,
    onSlotLayout,
  };
}
