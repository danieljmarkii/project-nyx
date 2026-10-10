// The completion card's motion: "the check writes itself" (CUL-1691, D3; spec
// `docs/nyx-completion-card-requirements.md` §2, design authority the round 4 mock).
//
// WHAT THE OWNER SEES on the log-screen path: the card fades in and rises 24pt, the
// disc grows from 60%, the check is written left to right, the sentence lands, and on a
// celebrate tone the gold fades in at the disc's edge. At rest by 0.4s (0.3s calm). On
// the + path the food's own disc flies in (`flightMotion.ts`), fills with teal on its
// landing and the fill reveals the check; the card's mark replaces the clone at release.
//
// ENGINES (§2.5). Every beat is Animated on the NATIVE driver: opacity, translate and
// uniform scale on Views. No react-native-svg prop is animated: the check and the halo's
// gradient are drawn once (`components/ui/CompletionMark.tsx`), and what moves is the
// View around them. One LINEAR native clock per surface, each beat a clamped
// interpolation sampled by `easedSegment` — RN 0.86 cannot carry `easing` on a native
// interpolation, and every native `delay` is a JS timer, so a beat that starts at 90ms
// is a segment of the clock, never a delay. Two exceptions, each started by a FACT:
//   - the halo has its own value and clock, so a finish can pin every other beat
//     without advancing the gold (§2.3);
//   - on the + path the vessel's fill runs its own clock from the flight's `landed`.
// The card's rise is its own `SHEET_SPRING`.
//
// THIS FILE HOLDS NO JSX AND IMPORTS NO COMPONENT FILE, so FAB → `FlightVessel` →
// here never loops back to FAB (§3 item 2). It is named in `guards/haptics.test.ts`'s
// ALWAYS_SCANNED: every beat here is silent (§2.3 Haptics), and the card it drives can
// carry a vet-call line, where a "landed" buzz would read as natural and be wrong.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutAnimation, Platform } from 'react-native';
import { theme } from '../../constants/theme';
import { FOLD_LAYOUT, FOLD_MOTION } from './foldMotion';
import { SHEET_MOTION, SHEET_SPRING } from './sheetMotion';
import { LOOK_MOTION } from './lookMotion';
import { DRAW_IN_MOTION } from './drawInMotion';

/** How the check is revealed. `'window'`: a two-view window slides over the static
 *  check (outer clips and moves one way, inner moves the other, so the check never
 *  moves). `'cover'`: a teal cover over the check shrinks toward its right edge. */
export type CheckReveal = 'window' | 'cover';

/** The beats, in ms and pt. Imported, never retyped (C-30). */
export const COMPLETION_MOTION = {
  /** The card's fade in on the log-screen path: the theme's fast duration. */
  groundInMs: theme.durationFast,
  /** The card's fade in place on the + path. It is the fan's close (`FAB.tsx` imports it
   *  back as its `CLOSE_MS`): the card fades in over the frames the fan retracts. */
  inPlaceFadeMs: 180,
  /** The rise. New, tuned between 8 and 24 on device. */
  riseFromPt: 24,
  riseSpring: SHEET_SPRING,
  /** The disc grows from here: the look's ring, the same "a mark arrives" question. */
  discFromScale: LOOK_MOTION.ringFromScale,
  /** The vessel's fill grows from here: the draw-in's bar, nearly nothing but never 0
   *  (a zero scale cannot be divided by, and the check is counter-scaled by it). */
  vesselFromScale: DRAW_IN_MOTION.barFromScale,
  discFillMs: 150,
  /** The disc (0.6 → 1 over `groundInMs`, out cubic) reaches 0.97 at 86.7ms; rounded up
   *  to the next 10ms. Not a frame boundary. `completionMotion.test.ts` asserts the
   *  continuous crossing is at or before this. */
  checkDelayMs: 90,
  /** The pen: the fold's rail lead, the one "a line is drawn" duration in the app. */
  checkWriteMs: FOLD_MOTION.railLeadMs,
  /** The check's box in the mark's 32pt viewBox, derived from `CHECK_PATH_D` padded by
   *  the round cap. The test parses the path and asserts x only increases. */
  checkBox: { x: 8.5, y: 10.5, w: 15.1, h: 11.7 },
  /** iOS: the window. Android: the cover, until §4 D1 and D2 pass on an Android device
   *  (PM 2026-10-09: no Android phone, so Android ships the measured-safe technique). */
  checkReveal: { ios: 'window', android: 'cover' } as const,
  labelBeatMs: 120,
  labelFadeMs: 180,
  haloDelayMs: 250,
  haloFadeMs: 150,
  haloLeaveMs: 150,
  unwriteMs: FOLD_MOTION.leaveMs,
  exitMs: SHEET_MOTION.exitMs,
  exitDriftPt: FOLD_MOTION.driftPt,
  crossfadeMs: SHEET_MOTION.crossfadeMs,
  /** A valve fires this long after the clock it guards should have ended. */
  valveSlackMs: 2 * FOLD_MOTION.settleSlackMs,
  /** STATED budgets (C-34, C-38): never derived from the beats they bound. */
  logPathBudgetMs: 400,
  calmBudgetMs: 300,
  landingTailBudgetMs: 300,
} as const;

export const EASED_SEGMENT_KNOTS = 16;

/** The reveal technique for this platform. */
export function checkRevealFor(os: string = Platform.OS): CheckReveal {
  return os === 'ios' ? COMPLETION_MOTION.checkReveal.ios : COMPLETION_MOTION.checkReveal.android;
}

// ── easedSegment ──────────────────────────────────────────────────────────────────

export type EasingFn = (t: number) => number;

/** The knots of one eased beat over a linear clock: `from` before `start`, `to` after
 *  `start + dur`, the easing sampled at `knots` + 1 points between. Pure, for tests. */
export function easedSegmentRanges(
  start: number,
  dur: number,
  from: number,
  to: number,
  easing: EasingFn,
  knots: number = EASED_SEGMENT_KNOTS,
): { inputRange: number[]; outputRange: number[] } {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= knots; i += 1) {
    const t = i / knots;
    inputRange.push(start + dur * t);
    // The endpoints are exact, whatever the easing returns at 0 and 1.
    const e = i === 0 ? 0 : i === knots ? 1 : easing(t);
    outputRange.push(from + (to - from) * e);
  }
  return { inputRange, outputRange };
}

/** One beat, sampled off a linear clock (ms) and clamped at both ends. */
export function easedSegment(
  clock: Animated.Value | Animated.AnimatedInterpolation<number>,
  start: number,
  dur: number,
  from: number,
  to: number,
  easing: EasingFn,
): Animated.AnimatedInterpolation<number> {
  const { inputRange, outputRange } = easedSegmentRanges(start, dur, from, to, easing);
  return clock.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
}

/** The exact (unsampled) value of a beat at `ms`: what a stopped clock pins to. */
export function easedAt(ms: number, start: number, dur: number, from: number, to: number, easing: EasingFn): number {
  const t = dur <= 0 ? 1 : Math.min(1, Math.max(0, (ms - start) / dur));
  return from + (to - from) * easing(t);
}

// The curves, named once.
export const EASE = {
  fade: Easing.out(Easing.quad),
  disc: Easing.out(Easing.cubic),
  pen: Easing.inOut(Easing.quad),
  words: Easing.out(Easing.quad),
  haloIn: Easing.out(Easing.quad),
  haloOut: Easing.in(Easing.cubic),
  unwrite: Easing.out(Easing.quad),
  exit: Easing.in(Easing.cubic),
  fill: Easing.out(Easing.cubic),
  linear: Easing.linear,
} as const;

// ── The plans (pure, for the budget tests) ─────────────────────────────────────────

/** When the clamped rise first reaches its rest. `SHEET_SPRING` clamps overshoot, so the
 *  spring stops at its FIRST crossing of the target: for x(t) = e^(−ζωt)(cos ωd·t +
 *  ζ/√(1−ζ²)·sin ωd·t), that is ωd·t = π − atan(√(1−ζ²)/ζ). Derived from the spring's
 *  own stiffness, damping and mass, so a retuned spring moves this number. */
export function riseArrivalMs(spring: { stiffness: number; damping: number; mass: number } = SHEET_SPRING): number {
  const omega = Math.sqrt(spring.stiffness / spring.mass);
  const zeta = spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
  if (zeta >= 1) return Infinity;
  const root = Math.sqrt(1 - zeta * zeta);
  const omegaD = omega * root;
  return ((Math.PI - Math.atan(root / zeta)) / omegaD) * 1000;
}

const M = COMPLETION_MOTION;

/** The beats of the log-screen arrival, each as [start, end] ms after the reveal. */
export function logPathBeats(): Record<'rise' | 'fade' | 'disc' | 'check' | 'words' | 'halo', [number, number]> {
  return {
    rise: [0, riseArrivalMs(M.riseSpring)],
    fade: [0, M.groundInMs],
    disc: [0, M.groundInMs],
    check: [M.checkDelayMs, M.checkDelayMs + M.checkWriteMs],
    words: [M.labelBeatMs, M.labelBeatMs + M.labelFadeMs],
    halo: [M.haloDelayMs, M.haloDelayMs + M.haloFadeMs],
  };
}

/** When the log-screen arrival is at rest: celebrate includes the gold, calm never mounts it. */
export function logPathRestMs(tone: 'celebrate' | 'calm'): number {
  const b = logPathBeats();
  const ends = [b.rise[1], b.fade[1], b.disc[1], b.check[1], b.words[1]];
  if (tone === 'celebrate') ends.push(b.halo[1]);
  return Math.max(...ends);
}

/** The + path after `landed`: the fill, then (celebrate) the gold from release. */
export function landingTailRestMs(tone: 'celebrate' | 'calm'): number {
  return M.discFillMs + (tone === 'celebrate' ? M.haloFadeMs : 0);
}

/** Where the card's own clock ends: the latest beat it samples (the rise is a spring). */
export const CARD_CLOCK_END_MS = Math.max(
  M.groundInMs,
  M.inPlaceFadeMs,
  M.groundInMs, // the disc
  M.checkDelayMs + M.checkWriteMs,
  M.labelBeatMs + M.labelFadeMs,
);

/** The halo's opacity at `ms` on its own clock, for a halo that starts at `delayMs`. */
export function haloOpacityAt(ms: number, delayMs: number): number {
  return easedAt(ms, delayMs, M.haloFadeMs, 0, 1, EASE.haloIn);
}

// ── The arrival hook ───────────────────────────────────────────────────────────────

/** Which arrival the card is drawing. `full`: §2.1 (rise, disc, pen, words). `inPlace`:
 *  §2.2 (a crossfade in place; the mark comes from the flight). `rewrite`: a second log
 *  of the same kind over a card that is up (the disc stays, the pen and words replay).
 *  `still`: Reduce Motion (a crossfade, the mark at rest). */
export type ArrivalVariant = 'full' | 'inPlace' | 'rewrite' | 'still';

/** Where the Undo collapse is: none; the body leaving (the pen un-writes, the rest
 *  fades); the "Removed" line landed. */
export type CollapseState = 'none' | 'leaving' | 'landed';

export type HaloMode = 'off' | 'arrival' | 'held';

export interface CompletionArrivalParams {
  /** The record this card is about, or null when the payload is not this card's kind. */
  identity: string | null;
  /** The card's kind is visible. */
  shown: boolean;
  removed: boolean;
  /** A flight is up for `identity` (the + path). The card's own mark is hidden while true. */
  flying: boolean;
  reducedMotion: boolean;
  appActive: boolean;
  /** The tone as the store holds it NOW: read with `getState()`, never a closure (§2.1). */
  celebrateNow: () => boolean;
  /** A read the gold must wait on (the dose's double-dose check, §2.3): while true the
   *  halo holds at 0, and if it is still true when the gold is due, the gold stays absent
   *  on this arrival. Fails toward calm. Absent: nothing to wait on. */
  haloPending?: () => boolean;
  /** The tone of this render, so a correction after the arrival crossfades the halo. */
  celebrate: boolean;
  /** The store's identity right now, so a stale valve never acts on a newer card. */
  currentIdentity: () => string | null | undefined;
  /** "Removed" has landed: re-arm its dwell from this frame (§2.5). */
  onRemovedLanded: (identity: string) => void;
  /** The card's touch-finish on the + path: end this card's flight. */
  endFlight: (identity: string) => void;
}

export interface CompletionArrival {
  variant: ArrivalVariant;
  collapse: CollapseState;
  haloMode: HaloMode;
  /** The card wrapper. */
  cardOpacity: Animated.AnimatedNode;
  cardTranslateY: Animated.AnimatedNode;
  /** The words node. */
  wordsOpacity: Animated.AnimatedNode;
  /** The controls and follow-ups: fade with the body on the Undo collapse. */
  bodyOpacity: Animated.AnimatedNode;
  /** The "Removed" line. */
  noticeOpacity: Animated.AnimatedNode;
  /** What `CompletionMark` takes as its clock. */
  mark: CompletionMarkMotion;
  /** Wiring for the card's root: a touch finishes the motion; lifting it settles the halo. */
  finishForTouch: () => void;
  settleForTouch: () => void;
  /** A note patched in after the reveal (§2.3): finish, then the caller lays it out. */
  finishForPatch: () => boolean;
  /** Settle the halo to the store's tone from wherever it stands. */
  settleHalo: () => void;
}

/** The mark's layers, each a native node; absent means "at rest". */
export interface CompletionMarkMotion {
  disc: Animated.AnimatedNode;
  /** 0 → 1: how much of the check is written. */
  write: Animated.AnimatedNode;
  /** Already multiplied by the body's fade. */
  halo: Animated.AnimatedNode;
  /** The disc and the halo fade with the body on the Undo collapse. */
  layers: Animated.AnimatedNode;
}

interface Nodes {
  clock: Animated.Value;
  rise: Animated.Value;
  exit: Animated.Value;
  unwrite: Animated.Value;
  haloClock: Animated.Value;
  haloHeld: Animated.Value;
  still: Animated.Value;
  notice: Animated.Value;
  one: Animated.Value;
  zero: Animated.Value;
  fadeLog: Animated.AnimatedInterpolation<number>;
  fadeInPlace: Animated.AnimatedInterpolation<number>;
  disc: Animated.AnimatedInterpolation<number>;
  pen: Animated.AnimatedInterpolation<number>;
  words: Animated.AnimatedInterpolation<number>;
  haloLog: Animated.AnimatedInterpolation<number>;
  haloRelease: Animated.AnimatedInterpolation<number>;
  kept: Animated.AnimatedNode;
}

function buildNodes(reducedAtStart: boolean): Nodes {
  const clock = new Animated.Value(reducedAtStart ? CARD_CLOCK_END_MS : 0);
  const haloClock = new Animated.Value(0);
  const unwrite = new Animated.Value(0);
  return {
    clock,
    rise: new Animated.Value(0),
    exit: new Animated.Value(0),
    unwrite,
    haloClock,
    haloHeld: new Animated.Value(0),
    still: new Animated.Value(0),
    notice: new Animated.Value(0),
    one: new Animated.Value(1),
    zero: new Animated.Value(0),
    fadeLog: easedSegment(clock, 0, M.groundInMs, 0, 1, EASE.fade),
    fadeInPlace: easedSegment(clock, 0, M.inPlaceFadeMs, 0, 1, EASE.fade),
    disc: easedSegment(clock, 0, M.groundInMs, M.discFromScale, 1, EASE.disc),
    pen: easedSegment(clock, M.checkDelayMs, M.checkWriteMs, 0, 1, EASE.pen),
    words: easedSegment(clock, M.labelBeatMs, M.labelFadeMs, 0, 1, EASE.words),
    haloLog: easedSegment(haloClock, M.haloDelayMs, M.haloFadeMs, 0, 1, EASE.haloIn),
    haloRelease: easedSegment(haloClock, 0, M.haloFadeMs, 0, 1, EASE.haloIn),
    kept: Animated.subtract(1, unwrite),
  };
}

/**
 * The card's arrival, its halo, its Undo collapse and its exit (§2.1 to §2.3). The card
 * renders off what this returns; it computes no beat of its own.
 */
export function useCompletionArrival(p: CompletionArrivalParams): CompletionArrival {
  const n = useRef<Nodes | null>(null);
  if (n.current === null) n.current = buildNodes(p.reducedMotion);
  const v = n.current;

  const [variant, setVariant] = useState<ArrivalVariant>(p.reducedMotion ? 'still' : 'full');
  const [collapse, setCollapse] = useState<CollapseState>('none');
  const [haloMode, setHaloModeState] = useState<HaloMode>('off');
  const haloModeRef = useRef<HaloMode>('off');
  const setHaloMode = useCallback((m: HaloMode) => {
    haloModeRef.current = m;
    setHaloModeState(m);
  }, []);

  // Latest params, read inside timers and callbacks.
  const params = useRef(p);
  params.current = p;
  /** Gold may show now: the tone celebrates AND nothing it waits on is pending. Every
   *  read but the arrival's first uses this; the first only starts the clock, whose gold
   *  is not due until `haloDelayMs`. */
  const celebrateReady = useCallback(
    () => params.current.celebrateNow() && !(params.current.haloPending?.() ?? false),
    [],
  );

  const arrivalId = useRef<string | null>(null);
  const variantRef = useRef<ArrivalVariant>(variant);
  const clockLive = useRef<Animated.CompositeAnimation | null>(null);
  const riseLive = useRef<Animated.CompositeAnimation | null>(null);
  const haloLive = useRef<Animated.CompositeAnimation | null>(null);
  const haloDelay = useRef<number>(M.haloDelayMs);
  const haloArrivalRunning = useRef(false);
  const touching = useRef(false);
  const leaving = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prevUp = useRef(false);
  const prevShown = useRef(false);
  const released = useRef(false);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  /** A valve, keyed to the record: it does nothing once a newer card has taken over. */
  const later = useCallback((ms: number, fn: () => void) => {
    const armedFor = arrivalId.current;
    const t = setTimeout(() => {
      timers.current = timers.current.filter((x) => x !== t);
      if (armedFor === null || params.current.currentIdentity() !== armedFor) return;
      if (arrivalId.current !== armedFor) return;
      fn();
    }, ms);
    timers.current.push(t);
  }, []);

  const pinCard = useCallback(() => {
    clockLive.current?.stop();
    riseLive.current?.stop();
    clockLive.current = null;
    riseLive.current = null;
    v.clock.setValue(CARD_CLOCK_END_MS);
    v.rise.setValue(0);
    v.still.setValue(1);
  }, [v]);

  // Where the gold stands NOW, worked out in JS. A native value's `stopAnimation`
  // callback is asynchronous (it asks the UI thread), so the finish cannot wait on it:
  // the halo's position is derived from when its current beat started instead.
  const haloStartedAt = useRef(0);
  const heldTrack = useRef<{ from: number; to: number; start: number; dur: number; easing: EasingFn } | null>(null);
  const heldStatic = useRef(0);
  const haloNow = useCallback((): number => {
    const now = Date.now();
    if (haloModeRef.current === 'arrival') return haloOpacityAt(now - haloStartedAt.current, haloDelay.current);
    if (haloModeRef.current === 'held') {
      const t = heldTrack.current;
      return t ? easedAt(now - t.start, 0, t.dur, t.from, t.to, t.easing) : heldStatic.current;
    }
    return 0;
  }, []);
  const pinHeld = useCallback((h: number) => {
    heldTrack.current = null;
    heldStatic.current = h;
    v.haloHeld.setValue(h);
  }, [v]);
  const animateHeld = useCallback((to: number, dur: number, easing: EasingFn, onDone: () => void) => {
    const from = heldStatic.current;
    heldTrack.current = { from, to, start: Date.now(), dur, easing };
    const a = Animated.timing(v.haloHeld, { toValue: to, duration: dur, easing, useNativeDriver: true });
    haloLive.current = a;
    a.start(() => {
      if (haloLive.current !== a) return;
      haloLive.current = null;
      heldTrack.current = null;
      heldStatic.current = to;
      onDone();
    });
  }, [v]);

  /** Stop the halo where it stands and hold it there (0 if not started). */
  const holdHalo = useCallback((onHeld: (h: number) => void) => {
    const h = haloNow();
    haloLive.current?.stop();
    haloLive.current = null;
    haloArrivalRunning.current = false;
    v.haloClock.stopAnimation();
    v.haloHeld.stopAnimation();
    if (haloModeRef.current === 'off') {
      pinHeld(0);
      onHeld(0);
      return;
    }
    pinHeld(h);
    setHaloMode('held');
    onHeld(h);
  }, [v, haloNow, pinHeld, setHaloMode]);

  /** Settle the gold to the tone the store holds now: in over `haloFadeMs`, out over
   *  `haloLeaveMs`, from wherever it stands. Opacity only, at scale 1. */
  const settleHalo = useCallback(() => {
    if (leaving.current) return;
    const celebrate = celebrateReady();
    holdHalo((h) => {
      if (celebrate) {
        setHaloMode('held');
        if (h >= 1 || params.current.reducedMotion) { pinHeld(1); return; }
        animateHeld(1, M.haloFadeMs, EASE.haloIn, () => {});
        return;
      }
      if (h <= 0 || params.current.reducedMotion) { pinHeld(0); setHaloMode('off'); return; }
      animateHeld(0, M.haloLeaveMs, EASE.haloOut, () => setHaloMode('off'));
    });
  }, [holdHalo, pinHeld, animateHeld, setHaloMode, celebrateReady]);

  /** Start the halo's own clock: the gold fades in at `delayMs` on it. Mounted only on a
   *  celebrate tone; re-read when the beat is due (§2.1). */
  const startHalo = useCallback((delayMs: number) => {
    if (!params.current.celebrateNow()) { setHaloMode('off'); return; }
    haloLive.current?.stop();
    haloDelay.current = delayMs;
    haloStartedAt.current = Date.now();
    v.haloClock.setValue(0);
    setHaloMode('arrival');
    haloArrivalRunning.current = true;
    const end = delayMs + M.haloFadeMs;
    const a = Animated.timing(v.haloClock, { toValue: end, duration: end, easing: EASE.linear, useNativeDriver: true });
    haloLive.current = a;
    a.start(() => { if (haloLive.current === a) { haloLive.current = null; haloArrivalRunning.current = false; } });
    // Due: the tone is read when the gold would start, never at the arrival's start.
    if (delayMs > 0) {
      later(delayMs, () => {
        if (haloModeRef.current !== 'arrival') return;
        if (!celebrateReady()) {
          haloLive.current?.stop();
          haloLive.current = null;
          haloArrivalRunning.current = false;
          v.haloClock.setValue(0);
          setHaloMode('off');
        }
      });
    }
    // The halo's valve: pins the tone's value. Never past its own end + slack.
    later(end + M.valveSlackMs, () => {
      if (haloModeRef.current !== 'arrival') return;
      haloLive.current?.stop();
      haloLive.current = null;
      haloArrivalRunning.current = false;
      const celebrate = celebrateReady();
      pinHeld(celebrate ? 1 : 0);
      setHaloMode(celebrate ? 'held' : 'off');
    });
  }, [v, later, pinHeld, setHaloMode, celebrateReady]);

  /** The arrival, from its first frame. */
  const startArrival = useCallback((id: string, next: ArrivalVariant) => {
    clearTimers();
    clockLive.current?.stop();
    riseLive.current?.stop();
    haloLive.current?.stop();
    haloLive.current = null;
    leaving.current = false;
    released.current = false;
    arrivalId.current = id;
    variantRef.current = next;
    setVariant(next);
    setCollapse('none');
    v.exit.setValue(0);
    v.unwrite.setValue(0);
    v.notice.setValue(0);

    if (next === 'still') {
      // Reduce Motion: one crossfade, the mark at rest, the halo at rest or absent.
      v.clock.setValue(CARD_CLOCK_END_MS);
      v.rise.setValue(0);
      v.still.setValue(0);
      const a = Animated.timing(v.still, { toValue: 1, duration: M.crossfadeMs, useNativeDriver: true });
      clockLive.current = a;
      a.start();
      const celebrate = celebrateReady();
      pinHeld(celebrate ? 1 : 0);
      setHaloMode(celebrate ? 'held' : 'off');
      return;
    }

    v.clock.setValue(0);
    const clock = Animated.timing(v.clock, {
      toValue: CARD_CLOCK_END_MS, duration: CARD_CLOCK_END_MS, easing: EASE.linear, useNativeDriver: true,
    });
    clockLive.current = clock;
    clock.start(() => { if (clockLive.current === clock) clockLive.current = null; });
    // The card's clock valve: its end plus slack.
    later(CARD_CLOCK_END_MS + M.valveSlackMs, () => {
      if (clockLive.current === null && riseLive.current === null) return;
      pinCard();
    });

    if (next === 'full') {
      v.rise.setValue(M.riseFromPt);
      const rise = Animated.spring(v.rise, { toValue: 0, useNativeDriver: true, ...M.riseSpring });
      riseLive.current = rise;
      rise.start(() => { if (riseLive.current === rise) riseLive.current = null; });
    } else {
      v.rise.setValue(0);
    }

    if (next === 'full') {
      startHalo(M.haloDelayMs);
    } else if (next === 'rewrite') {
      // A second log over a card that is up: the halo goes to the new record's tone by
      // the chip-tap rule, never a second bloom.
      settleHalo();
    } else {
      // The + path: no gold until the clone is released.
      pinHeld(0);
      setHaloMode('off');
    }
  }, [v, clearTimers, later, pinCard, startHalo, settleHalo, pinHeld, setHaloMode, celebrateReady]);

  /** Finish everything but the halo, which is held where it stands. */
  const finishMotion = useCallback(() => {
    pinCard();
    if (haloModeRef.current === 'arrival') holdHalo(() => undefined);
    const id = arrivalId.current;
    if (id !== null && params.current.flying) params.current.endFlight(id);
  }, [pinCard, holdHalo]);

  // ── The record changing: a reveal, a second log, a hide ─────────────────────────
  const { identity, shown, removed, reducedMotion, flying } = p;
  const up = shown && !removed;
  useEffect(() => {
    const wasUp = prevUp.current;
    const wasShown = prevShown.current;
    prevUp.current = up;
    prevShown.current = shown;
    if (!shown || identity === null) {
      if (wasShown && !leaving.current) {
        // The exit: opacity 1 → 0 and a drift of 8pt, silent. The check stays whole.
        leaving.current = true;
        clearTimers();
        haloLive.current?.stop();
        clockLive.current?.stop();
        riseLive.current?.stop();
        const a = Animated.timing(v.exit, {
          toValue: 1, duration: M.exitMs, easing: EASE.exit, useNativeDriver: true,
        });
        a.start();
      }
      return;
    }
    if (arrivalId.current === identity && wasShown) return;
    let next: ArrivalVariant;
    if (reducedMotion) next = 'still';
    else if (flying) next = 'inPlace';
    else if (wasUp && arrivalId.current !== null && arrivalId.current !== identity) next = 'rewrite';
    else next = 'full';
    startArrival(identity, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, shown, up]);

  // ── The + path's release: the clone has gone; the card's mark is the record now ──
  useEffect(() => {
    if (variantRef.current !== 'inPlace' || !shown || removed || leaving.current) return;
    if (flying || released.current) return;
    released.current = true;
    if (haloModeRef.current === 'off') startHalo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flying, shown, removed]);

  // ── A correction after the arrival: the halo goes to the new tone, nothing replays ─
  const celebrate = p.celebrate;
  useEffect(() => {
    if (!shown || removed || touching.current || leaving.current) return;
    if (haloArrivalRunning.current) return;
    if (variantRef.current === 'inPlace' && !released.current) return;
    settleHalo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate]);

  // ── App blur: finish everything, then settle ─────────────────────────────────────
  useEffect(() => {
    if (p.appActive || !shown || removed) return;
    finishMotion();
    settleHalo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.appActive]);

  // ── Undo: the pen un-writes while the rest fades, then "Removed" lands ───────────
  useEffect(() => {
    if (!removed || !shown || identity === null || arrivalId.current !== identity) return;
    if (collapse !== 'none') return;
    clearTimers();
    pinCard();
    haloLive.current?.stop();
    haloLive.current = null;
    haloArrivalRunning.current = false;
    v.haloClock.stopAnimation();
    v.haloHeld.stopAnimation();
    setCollapse('leaving');
    const id = identity;
    const land = () => {
      // A card that hid mid-collapse has nothing to land (and `configureNext` is app-global).
      if (leaving.current) return;
      if (arrivalId.current !== id || params.current.currentIdentity() !== id) return;
      setCollapse('landed');
      if (params.current.reducedMotion) {
        v.notice.setValue(1);
        params.current.onRemovedLanded(id);
        return;
      }
      // `configureNext` is app-global: the next commit anywhere animates its layout.
      // Fired after every transform here is pinned, never over an arrival (§2.5).
      LayoutAnimation.configureNext(FOLD_LAYOUT);
      v.notice.setValue(0);
      Animated.timing(v.notice, {
        toValue: 1, duration: FOLD_MOTION.landMs, delay: FOLD_MOTION.landDelayMs,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start(() => params.current.onRemovedLanded(id));
    };
    if (p.reducedMotion) {
      // A true crossfade: both nodes mounted, the body out and "Removed" in; the height
      // snaps when the body leaves.
      v.unwrite.setValue(0);
      v.notice.setValue(0);
      Animated.parallel([
        Animated.timing(v.unwrite, { toValue: 1, duration: M.crossfadeMs, useNativeDriver: true }),
        Animated.timing(v.notice, { toValue: 1, duration: M.crossfadeMs, useNativeDriver: true }),
      ]).start(() => land());
      return;
    }
    Animated.timing(v.unwrite, {
      toValue: 1, duration: M.unwriteMs, easing: EASE.unwrite, useNativeDriver: true,
    }).start(() => land());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removed, shown, identity]);

  useEffect(() => () => {
    clearTimers();
    clockLive.current?.stop();
    riseLive.current?.stop();
    haloLive.current?.stop();
  }, [clearTimers]);

  const finishForTouch = useCallback(() => {
    if (leaving.current || params.current.removed) return;
    touching.current = true;
    finishMotion();
  }, [finishMotion]);

  const settleForTouch = useCallback(() => {
    touching.current = false;
    if (leaving.current || params.current.removed) return;
    if (variantRef.current === 'inPlace' && !released.current && params.current.flying) return;
    settleHalo();
  }, [settleHalo]);

  /** A note patched in after the reveal finishes the arrival the way a touch does.
   *  Returns whether the arrival was still running (the caller fires FOLD_LAYOUT either
   *  way, after this has pinned every transform). */
  const finishForPatch = useCallback(() => {
    const wasLive = clockLive.current !== null || riseLive.current !== null || haloArrivalRunning.current;
    finishMotion();
    return wasLive;
  }, [finishMotion]);

  // ── The nodes for this render (stable per variant, so nothing re-attaches) ───────
  // Read from a ref in render: safe because `startHalo` sets the delay BEFORE the
  // `setHaloMode` that causes this render. Keep that order.
  const haloFromRelease = haloDelay.current === 0;
  const nodes = useMemo(() => {
    const fade =
      variant === 'full' ? v.fadeLog
        : variant === 'inPlace' ? v.fadeInPlace
          : variant === 'still' ? v.still
            : v.one;
    const drift = Animated.multiply(v.exit, M.exitDriftPt);
    return {
      cardOpacity: Animated.multiply(fade, Animated.subtract(1, v.exit)),
      // Reduce Motion: the exit is opacity only, so nothing translates.
      cardTranslateY: variant === 'still' ? v.zero : variant === 'full' ? Animated.add(v.rise, drift) : drift,
      wordsOpacity: Animated.multiply(variant === 'still' ? v.one : v.words, v.kept),
      disc: variant === 'full' ? v.disc : v.one,
      // Reduce Motion: the check fades with the body; it never un-writes.
      write: variant === 'still' ? v.one
        : Animated.subtract(variant === 'full' || variant === 'rewrite' ? v.pen : v.one, v.unwrite),
    };
  }, [v, variant]);
  const halo = useMemo(() => {
    const base = haloMode === 'arrival' ? (haloFromRelease ? v.haloRelease : v.haloLog) : v.haloHeld;
    return Animated.multiply(base, v.kept);
  }, [v, haloMode, haloFromRelease]);

  return {
    variant,
    collapse,
    haloMode,
    cardOpacity: nodes.cardOpacity,
    cardTranslateY: nodes.cardTranslateY,
    wordsOpacity: nodes.wordsOpacity,
    bodyOpacity: v.kept,
    noticeOpacity: v.notice,
    mark: { disc: nodes.disc, write: nodes.write, halo, layers: v.kept },
    finishForTouch,
    settleForTouch,
    finishForPatch,
    settleHalo,
  };
}
