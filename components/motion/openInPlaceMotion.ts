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
//             slot holds its lead height — the line arrives ahead of the box. The slot's
//             mount moves the grid beneath it, so that commit carries `LEAD_LAYOUT`, timed
//             to land as the box begins (CUL-1721: it used to mount bare, a 44pt jump).
//          2. `railLagMs` later the BOX follows: one `LayoutAnimation` commit (`UNFOLD_LAYOUT`,
//             the fold's spring) mounts the rows, so the slot's height and every row of the
//             grid beneath it move in one native transaction.
//          3. the ROWS land: opacity 0 → 1 and −8 → 0 over `landMs`, `landDelayMs` after the
//             box begins — the words arrive a beat after the shape.
//   close  1. the rows LEAVE: opacity 1 → 0 with the 8pt upward drift over `leaveMs`.
//          2. the BOX closes: `FOLD_LAYOUT` unmounts the rows and the slot eases all the way
//             to zero in that one commit — the lead band is never left behind (CUL-1721:
//             it was, and its bare removal at ~510ms was the close's slam).
//          3. the RAIL trails, `railLagMs` behind the box, scaleY 1 → 0 over `railTrailMs`
//             (lag + trail = the box's own duration, so both land together); then the slot,
//             already zero high, leaves on `TAIL_LAYOUT` (the month's slot keeps a margin).
//
// THE ONE RULE (CUL-1721, guarded by `openInPlaceMotion.test.ts`): no commit this machine
// makes changes the flow's geometry (the slot mounted, the rows mounted, its minimum
// height, the row above yielding its bottom edge) without a layout config in the same
// tick. A bare geometry commit is a jump, and on Fabric it also finishes any layout
// animation in flight at once. The four exemptions are the ones where nothing may move:
// Reduce Motion, a blur, a re-key, and a host's reset (`OpenInPlaceReset`).
//
// THE SLOT CLIPS while a transition is in flight (`clipped`), so a rail holding the open
// box's height never spills past a closing box onto the next row's bead.
//
// A SECOND TAP REVERSES FROM WHERE IT IS. Fabric starts a configured commit from the frame
// in flight (`LayoutAnimationKeyFrameManager.cpp`, "start the animation from this point"),
// so a reversal is a configured commit plus `Animated` beats from the values' current
// positions — never a settle to the end and a fresh start.
//
// TWO ENGINES, ONE JOB EACH (the fold's split, load-bearing on Fabric): `LayoutAnimation`
// moves GEOMETRY — the slot's height and the grid beneath — and never carries a `create`
// fade; `Animated` on the native driver moves everything else. The rail holds an EXPLICIT
// height for every commit that animates layout, so no layout keyframe re-commits a view
// that is carrying an in-flight native-driver transform (the fold's header has the why).
// Idle and open, the rail is a plain absolute-fill View with no transform at all.
//
// THE RAIL'S HEIGHT changes only on a commit where nothing is layout-animating (the
// slot's own mount, and the leave from an idle open), never on a configured one: a layout
// keyframe on a view with an in-flight native transform snaps back when it ends.
//
// WHAT NEVER ENTERS THIS MACHINE: a switch between days. One day is open at a time; when
// the host re-keys the open day under an in-flight or open row, the slot renders the new
// day's state on the next frame with no `configureNext` (the fold's FS-9 rule, applied
// to a re-key). Reduced motion is a crossfade over `durationFast`, nothing moves. A blur
// FINISHES the transition at its end state, never pauses it. No haptic here and none may
// be added — this file drives a surface that lists a day's incidents, and it is named in
// `guards/haptics.test.ts`'s ALWAYS_SCANNED.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutAnimation, type LayoutAnimationConfig } from 'react-native';
import { theme } from '../../constants/theme';
import { FOLD_LAYOUT, FOLD_MOTION, UNFOLD_LAYOUT } from './foldMotion';

/** The slot's height while only the rail is there — the line the box grows from. The
 *  44pt floor, so the rail's lead is a visible stroke and never a hairline. */
export const OPEN_IN_PLACE_LEAD_PT = 44;

/** The slot's mount: the grid beneath moves down the lead height while the rail grows,
 *  landing as the box begins (`railLagMs`), so the box's spring takes over from rest. */
export const LEAD_LAYOUT: LayoutAnimationConfig = {
  duration: FOLD_MOTION.railLagMs,
  update: { type: LayoutAnimation.Types.easeOut },
};

/** The slot's unmount after a close. The slot is already zero high; what is left is a
 *  host's margin around it (the month's grid gap), which eases out rather than snaps. */
export const TAIL_LAYOUT: LayoutAnimationConfig = {
  duration: FOLD_MOTION.railLagMs,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
};

/** How long each direction takes from the tap to the idle tree — the same for two rows
 *  and twelve, since every beat is a duration and none is a speed. */
export const OPEN_IN_PLACE_BUDGET_MS = {
  open:
    FOLD_MOTION.railLagMs +
    FOLD_MOTION.landDelayMs +
    FOLD_MOTION.landMs +
    Math.max(0, FOLD_MOTION.openMs - FOLD_MOTION.landDelayMs - FOLD_MOTION.landMs) +
    FOLD_MOTION.settleSlackMs,
  close: FOLD_MOTION.leaveMs + FOLD_MOTION.railLagMs + FOLD_MOTION.railTrailMs + FOLD_MOTION.settleSlackMs,
} as const;

/**
 * A host's RESET: bump the number and every slot under it lands at the state its host now
 * asks for in the same commit, with no choreography and no `configureNext` — for a host
 * that replaces its whole list (History's new scope, §4: "resets the list without
 * animating"), where a close's layout commit would land on the reload.
 */
export const OpenInPlaceReset = createContext(0);

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
  /** The slot's minimum height — the lead height while only the rail is there; zero once
   *  the box is closing, so the close takes the slot all the way down in one commit. */
  slotMinHeight: number;
  /** The slot clips its rail and rows: true for every phase in flight. */
  clipped: boolean;
  /** Something sits under the row: the row above yields its bottom edge to the slot. False
   *  from the closing commit on, so that edge changes inside a configured commit. */
  membersBelow: boolean;
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

  /** The close's last commit: the slot, already zero high, leaves on `TAIL_LAYOUT`. */
  const finishClose = useCallback(() => {
    if (phaseRef.current !== 'closing') return;
    LayoutAnimation.configureNext(TAIL_LAYOUT);
    settle(false);
  }, [settle]);

  /** The rows land from wherever they are (−8 and clear on a fresh open), then the tree
   *  goes idle once the box's spring has landed too, on a frame where nothing moves. */
  const land = useCallback(
    (delay: number) => {
      run(
        Animated.parallel([
          timing(values.rowsOpacity, 1, FOLD_MOTION.landMs, Easing.out(Easing.quad), delay),
          timing(values.rowsShift, 0, FOLD_MOTION.landMs, Easing.out(Easing.cubic), delay),
        ]),
        () => {
          values.rowsOpacity.setValue(1);
          values.rowsShift.setValue(0);
          later(Math.max(0, FOLD_MOTION.openMs - FOLD_MOTION.landDelayMs - FOLD_MOTION.landMs) + FOLD_MOTION.settleSlackMs, () => {
            if (phaseRef.current !== 'opening') return;
            setRailHeight(null);
            go('open');
          });
        },
      );
    },
    [values, run, timing, later, go],
  );

  /** The box closes (one `FOLD_LAYOUT` commit takes the slot to zero) and the rail trails
   *  `railLagMs` behind it, from wherever its scale is. */
  const closeBox = useCallback(
    (railLag: number) => {
      LayoutAnimation.configureNext(FOLD_LAYOUT);
      go('closing');
      later(railLag, () => {
        if (phaseRef.current !== 'closing') return;
        run(timing(values.railScale, 0, FOLD_MOTION.railTrailMs, Easing.inOut(Easing.quad)), () => {
          values.railScale.setValue(0);
          later(FOLD_MOTION.settleSlackMs, finishClose);
        });
      });
      // Whatever happens to the rail beat, the transition ends.
      later(FOLD_MOTION.closeMs + railLag + FOLD_MOTION.railTrailMs + FOLD_MOTION.settleSlackMs * 2, finishClose);
    },
    [values, go, run, timing, later, finishClose],
  );

  // ── Open: rail leads, box follows, rows land ──────────────────────────────────
  const open = useCallback(() => {
    const from = phaseRef.current;
    if (reduced.current) {
      // Instant geometry; the rows crossfade in. No configureNext, no translate.
      stopAll();
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
    stopAll();
    if (from === 'leaving') {
      // The box never closed: the rows turn round where they are. Nothing in the flow
      // changes, so this commit carries no geometry and needs no config.
      go('opening');
      land(0);
      return;
    }
    if (from === 'closing') {
      // The box is closing: one configured commit re-mounts the rows and opens it from the
      // frame it is on; the rail turns round from its current scale.
      LayoutAnimation.configureNext(UNFOLD_LAYOUT);
      go('opening');
      run(timing(values.railScale, 1, FOLD_MOTION.railLeadMs, Easing.out(Easing.cubic)), () => {
        values.railScale.setValue(1);
      });
      land(FOLD_MOTION.landDelayMs);
      return;
    }
    values.railScale.setValue(0);
    values.rowsOpacity.setValue(0);
    values.rowsShift.setValue(-FOLD_MOTION.driftPt);
    setRailHeight(OPEN_IN_PLACE_LEAD_PT);
    // The slot's mount moves the grid beneath: that commit carries its own config.
    LayoutAnimation.configureNext(LEAD_LAYOUT);
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
      land(FOLD_MOTION.landDelayMs);
    });
  }, [values, go, run, timing, later, stopAll, land]);

  // ── Close: rows leave, box closes, rail trails ────────────────────────────────
  const close = useCallback(() => {
    const from = phaseRef.current;
    if (reduced.current) {
      stopAll();
      go('crossfade');
      run(timing(values.rowsOpacity, 0, theme.durationFast, Easing.out(Easing.quad)), () => {
        settle(false);
      });
      return;
    }
    stopAll();
    if (from === 'leading') {
      // No rows yet: the box closes from the lead band at once, the rail turning round.
      closeBox(0);
      return;
    }
    if (from === 'open') {
      values.rowsOpacity.setValue(1);
      values.rowsShift.setValue(0);
      values.railScale.setValue(1);
      // The rail takes the open box's measured height on this commit — nothing is
      // layout-animating, and the slot clips it from here on.
      setRailHeight(slotH.current ?? OPEN_IN_PLACE_LEAD_PT);
    }
    // From `opening` the rail keeps the height it has: the box's spring is in flight, and
    // this commit must carry no geometry.
    go('leaving');
    // Beat 1: the words leave, from wherever they are.
    run(
      Animated.parallel([
        timing(values.rowsOpacity, 0, FOLD_MOTION.leaveMs, Easing.out(Easing.quad)),
        timing(values.rowsShift, -FOLD_MOTION.driftPt, FOLD_MOTION.leaveMs, Easing.out(Easing.quad)),
      ]),
      () => {
        values.rowsOpacity.setValue(0);
        values.rowsShift.setValue(-FOLD_MOTION.driftPt);
        if (phaseRef.current !== 'leaving') return;
        // Beat 2: the box closes; beat 3: the rail trails.
        closeBox(FOLD_MOTION.railLagMs);
      },
    );
  }, [values, go, run, timing, stopAll, settle, closeBox]);

  // The host's state drives the machine. A flip under a transition REVERSES it from where
  // it is (CUL-1721; it used to finish the first one, a snap); a re-key under an open row
  // renders the new day with no motion; a host's reset lands every slot with no motion.
  const resetGen = useContext(OpenInPlaceReset);
  const lastReset = useRef(resetGen);
  const lastIdentity = useRef(identity);
  const lastShown = useRef(shown);
  useEffect(() => {
    if (lastReset.current !== resetGen) {
      lastReset.current = resetGen;
      lastIdentity.current = identity;
      lastShown.current = shown;
      const p = phaseRef.current;
      if (p !== (shown ? 'open' : 'closed')) {
        slotH.current = null;
        settle(shown);
      }
      return;
    }
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
    if (shown) open();
    else close();
  }, [shown, identity, resetGen, open, close, settle]);

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
    // Fabric reports the COMMITTED layout, never a frame of the spring, so the box's height
    // arrives with the commit that mounts the rows (`opening`) — and the opening → open
    // commit changes no size, so no second event comes (CUL-1721: recording only in
    // `open` left a fresh open's close on the 44pt fallback). Any phase with the rows
    // mounted is the box's height; the lead band and a closing box are not.
    const p = phaseRef.current;
    if (p === 'opening' || p === 'open' || p === 'leaving' || p === 'crossfade') slotH.current = height;
  }, []);

  const inFlight = phase === 'leading' || phase === 'opening' || phase === 'leaving' || phase === 'closing';
  return {
    phase,
    slotMounted: phase !== 'closed',
    rowsMounted: phase === 'opening' || phase === 'open' || phase === 'leaving' || phase === 'crossfade',
    inFlight,
    railHeight: inFlight ? railHeight : null,
    slotMinHeight: phase === 'closing' ? 0 : OPEN_IN_PLACE_LEAD_PT,
    clipped: inFlight,
    membersBelow: phase !== 'closed' && phase !== 'closing',
    values,
    onSlotLayout,
  };
}
