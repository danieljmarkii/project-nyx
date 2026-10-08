// A bottom sheet's rise and its way out (CUL-1642, PM ruling D1 = D; design authority
// `docs/culprit-fab-mockups.html` §03, phone D: "the backdrop stays exactly where it is,
// only the sheet rises").
//
// WHY THIS EXISTS. An RN `<Modal animationType="slide">` slides its WHOLE window, so the
// sheet's veil travels up the screen with it: a hard grey edge sweeping over Home while
// the FAB's own veil faded away underneath. The platform cannot slide the content and
// leave the backdrop, so the Modal now presents with `animationType="none"` and this
// module moves what is inside it: the veil holds or fades, the sheet rises.
//
// C-30. A second sheet that wants this lifts THIS file rather than restating its numbers
// (CUL-1178 lists twenty-two of them still on the platform slide). The log sheet is the
// first caller.
//
// THE PHYSICS IS THE APP'S SETTLE. The rise is `FLIGHT_SPRING`, the fold's damping ratio
// 0.7 with its 2 % settle at the fold's `openMs` (370ms): mirrored by import, never typed
// (C-34). One change, and only one: `overshootClamping`. A bottom-anchored surface that
// overshoots upward bares the strip of screen beneath its own foot for the length of the
// overshoot, so the sheet stops at its first arrival; the curve up to it is the settle's.
// The way out is faster than the way in and eases in (the FAB's close rule: open is a
// moment, close is getting out of the way), over the fold's `leaveMs`.
//
// THE VEIL HAS TWO OWNERS, never two at once. `veil: 'own'` (every door but the fan) fades
// the scrim up with the rise. `veil: 'handed'` (the fan's three doors) means a veil of the
// same colour is ALREADY on screen, the fan's, so the sheet's scrim starts at 0 and takes
// over at full in the same tick as the fan drops its own: `onVeilTaken` is that tick. The
// way the sheet hands its veil to the pet switcher layer, run in the other direction.
//
// WHEN "SHOWN" IS. The Modal reports `onShow` once the platform has presented it, and
// nothing moves before that: a rise started at mount spends its first frames behind a
// window that is not up yet, and a veil taken at mount would drop the fan's before the
// sheet's could be drawn, a frame of undimmed Home. A Modal that never reports (jest; a
// platform that drops the callback) is not allowed to strand the fan's veil or the sheet
// below the screen, so `shownTtlMs` starts it anyway.
//
// REDUCE MOTION is a crossfade (CUL-1178, for this sheet): the sheet's opacity 0 → 1 over
// `durationFast`, nothing moves, and the veil does what it does in motion over the same
// span. Read at the moment each transition starts (C-43), so a setting flipped mid-open is
// right on the next one. APP BLUR FINISHES, NEVER PAUSES (the fold's rule): a sheet the
// owner left mid-rise is up when they return, and one left mid-exit is gone.
//
// THE EXITING PHASE. `animationType="none"` takes the platform's slide-out with it, and a
// Modal whose `visible` goes false simply vanishes. So `modalVisible` outlives `visible`
// by the exit, and `onExited` fires a commit AFTER the Modal's `visible` has gone false:
// the host waits on it before mounting a fresh sheet, so one Modal is dismissed before the
// next is presented and never in the same commit (C-14; the CUL-1472 re-key race).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { theme } from '../../constants/theme';
import { reducedMotionNow } from '../../store/reducedMotionStore';
import { FOLD_MOTION } from './foldMotion';
import { FLIGHT_SPRING } from './flightMotion';

/** The beats, in ms. */
export const SHEET_MOTION = {
  /** The rise's settle, for the owned veil's fade beside it: the fold's open. */
  riseMs: FOLD_MOTION.openMs,
  /** The way out: the fold's leave, faster than the way in. */
  exitMs: FOLD_MOTION.leaveMs,
  /** Reduce Motion's crossfade, both directions. */
  crossfadeMs: theme.durationFast,
  /** A Modal that has not reported `onShow` by now is treated as shown. */
  shownTtlMs: 400,
} as const;

/** The rise: the app's settle (`FLIGHT_SPRING`), clamped at its first arrival. */
export const SHEET_SPRING = { ...FLIGHT_SPRING, overshootClamping: true } as const;

/**
 * `presenting` — the Modal is asked up and has not reported shown; nothing moves yet.
 * `entering` — the sheet is rising (or crossfading in).
 * `open` — at rest.
 * `exiting` — on its way out; the Modal is still presented.
 * `closed` — the Modal is down.
 */
export type SheetPhase = 'presenting' | 'entering' | 'open' | 'exiting' | 'closed';

/** Whose veil is on screen when the sheet opens. */
export type SheetVeil = 'own' | 'handed';

interface Params {
  /** The FACT (C-30): the sheet is asked to be up. */
  visible: boolean;
  veil: SheetVeil;
  /** How far below its resting place the sheet starts: far enough to be off screen. */
  travelPt: number;
  appActive: boolean;
  /** The tick the sheet's veil goes to full under a handed veil (the owner of the other
   *  veil drops it here). Fires once per open, owned veils included, so a caller never
   *  waits on a veil that was never handed. */
  onVeilTaken?: () => void;
  /** A commit after the Modal's `visible` has gone false at the end of an exit. */
  onExited?: () => void;
}

export interface SheetMotion {
  phase: SheetPhase;
  /** The Modal's `visible`: true from the open through the end of the exit. */
  modalVisible: boolean;
  /** Pass to the Modal's `onShow`. */
  onShow: () => void;
  scrimStyle: { opacity: Animated.Value };
  sheetStyle: { opacity: Animated.Value; transform: { translateY: Animated.Value }[] };
}

export function useSheetMotion({
  visible, veil, travelPt, appActive, onVeilTaken, onExited,
}: Params): SheetMotion {
  const scrim = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(reducedMotionNow() ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(reducedMotionNow() ? 0 : travelPt)).current;
  const [phase, setPhase] = useState<SheetPhase>(visible ? 'presenting' : 'closed');
  const phaseRef = useRef(phase);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const ttl = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitedPending = useRef(false);

  // The callbacks are read through refs so a caller's fresh closure never re-arms a
  // transition, and a transition never calls a stale one.
  const veilTakenRef = useRef(onVeilTaken);
  veilTakenRef.current = onVeilTaken;
  const exitedRef = useRef(onExited);
  exitedRef.current = onExited;
  const veilRef = useRef(veil);
  veilRef.current = veil;
  const travelRef = useRef(travelPt);
  travelRef.current = travelPt;

  const go = useCallback((next: SheetPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTtl = () => {
    if (ttl.current) clearTimeout(ttl.current);
    ttl.current = null;
  };

  const settleOpen = useCallback(() => {
    running.current?.stop();
    running.current = null;
    scrim.setValue(1);
    opacity.setValue(1);
    translateY.setValue(0);
    go('open');
  }, [scrim, opacity, translateY, go]);

  const settleClosed = useCallback(() => {
    running.current?.stop();
    running.current = null;
    scrim.setValue(0);
    if (reducedMotionNow()) opacity.setValue(0);
    else translateY.setValue(travelRef.current);
    exitedPending.current = true;
    go('closed');
  }, [scrim, opacity, translateY, go]);

  // ── IN ────────────────────────────────────────────────────────────────────
  const begin = useCallback(() => {
    if (phaseRef.current !== 'presenting') return;
    clearTtl();
    go('entering');
    const still = reducedMotionNow();
    // The veil first, in the same tick as the caller's hand-off.
    if (veilRef.current === 'handed') scrim.setValue(1);
    veilTakenRef.current?.();
    const veilIn =
      veilRef.current === 'handed'
        ? null
        : Animated.timing(scrim, {
          toValue: 1,
          duration: still ? SHEET_MOTION.crossfadeMs : SHEET_MOTION.riseMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        });
    let sheetIn: Animated.CompositeAnimation;
    if (still) {
      translateY.setValue(0);
      opacity.setValue(0);
      sheetIn = Animated.timing(opacity, {
        toValue: 1, duration: SHEET_MOTION.crossfadeMs, useNativeDriver: true,
      });
    } else {
      opacity.setValue(1);
      translateY.setValue(travelRef.current);
      sheetIn = Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...SHEET_SPRING });
    }
    const anim = veilIn ? Animated.parallel([veilIn, sheetIn]) : sheetIn;
    running.current = anim;
    anim.start(({ finished }) => {
      if (running.current === anim) running.current = null;
      // The end state is written, not trusted to the driver's last frame: a value the
      // native driver moved is not read back into JS.
      if (finished && phaseRef.current === 'entering') settleOpen();
    });
  }, [scrim, opacity, translateY, go, settleOpen]);

  const onShow = useCallback(() => { begin(); }, [begin]);

  // ── OUT ───────────────────────────────────────────────────────────────────
  const exit = useCallback(() => {
    clearTtl();
    running.current?.stop();
    go('exiting');
    const still = reducedMotionNow();
    const duration = still ? SHEET_MOTION.crossfadeMs : SHEET_MOTION.exitMs;
    const easing = Easing.in(Easing.cubic);
    const out = Animated.parallel([
      Animated.timing(scrim, { toValue: 0, duration, easing, useNativeDriver: true }),
      still
        ? Animated.timing(opacity, { toValue: 0, duration, easing, useNativeDriver: true })
        : Animated.timing(translateY, { toValue: travelRef.current, duration, easing, useNativeDriver: true }),
    ]);
    running.current = out;
    out.start(({ finished }) => {
      if (running.current === out) running.current = null;
      if (finished && phaseRef.current === 'exiting') settleClosed();
    });
  }, [scrim, opacity, translateY, go, settleClosed]);

  // The fact drives the machine: asked up → present (and wait for the platform), asked
  // down → exit. A re-ask while still presented (a standalone caller toggling `visible`
  // inside an exit) rises from where it is; the host never does this, it mounts fresh.
  useEffect(() => {
    const now = phaseRef.current;
    if (visible) {
      if (now === 'closed') {
        go('presenting');
      } else if (now === 'exiting') {
        running.current?.stop();
        phaseRef.current = 'presenting';
        begin();
      }
      if (phaseRef.current === 'presenting' && !ttl.current) {
        ttl.current = setTimeout(() => { ttl.current = null; begin(); }, SHEET_MOTION.shownTtlMs);
      }
    } else if (now === 'presenting' || now === 'entering' || now === 'open') {
      exit();
    }
  }, [visible, go, begin, exit]);

  // A blur finishes the transition in flight at its end state.
  useEffect(() => {
    if (appActive) return;
    if (phaseRef.current === 'entering') settleOpen();
    else if (phaseRef.current === 'exiting') settleClosed();
  }, [appActive, phase, settleOpen, settleClosed]);

  // `onExited` waits for the commit that took the Modal down.
  useEffect(() => {
    if (phase !== 'closed' || !exitedPending.current) return;
    exitedPending.current = false;
    exitedRef.current?.();
  }, [phase]);

  useEffect(() => () => {
    clearTtl();
    running.current?.stop();
  }, []);

  return {
    phase,
    modalVisible: phase !== 'closed',
    onShow,
    scrimStyle: { opacity: scrim },
    sheetStyle: { opacity, transform: [{ translateY }] },
  };
}
