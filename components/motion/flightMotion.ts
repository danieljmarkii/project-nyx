// The Signal chart's FLIGHT — the card's chart lifts off Home and lands as the top of the
// Signal's screen (Design v2 — the whole day, D2-6 · CUL-1069; design authority
// `docs/culprit-design-v4-mockups.html` §03 / §06, R4-3: "the flight is the destination",
// the Motion Designer's condition — "make it uniform (one aspect for both charts) and
// reversible, and it is the best moment in the app").
//
// A HAND-ROLLED FLIP OVER A NATIVE PUSH (the Dir. of Engineering's read, §06: Reanimated
// ships no shared-element transition on the new architecture and RN 0.86 is Fabric-only).
//
//   First    the card measures its chart in WINDOW coordinates and STAGES the flight here:
//            the rect, the chart's element (a `WeeklyBars` over the card's model, built with
//            `drawIn` off — the host mounts a FRESH instance of it, sharing no state with the
//            card's own, and it draws no draw-in because the element says so) and the title.
//            Then it pushes the route.
//   Last     the screen measures where its chart will sit and LANDS the flight: the target.
//   Invert   the clone is laid out at the SOURCE's size and starts at the source's place.
//   Play     three values on the native driver — translateX, translateY and ONE scale —
//            spring to the target. The scale is `target.width / source.width`, so the clone
//            is scaled uniformly and translated, and nothing can stretch: there is no
//            `scaleX` and no `scaleY` in this module, and `flightMotion.test.ts` scans for
//            them. Both charts share one aspect because they are ONE LAYOUT (the screen's
//            hero is the card's chart layout, scaled) — fixed-size type cannot be laid out
//            "similar" at two widths, so equality is the only construction with no snap at
//            either end.
//   Settle   ONCE, the fold's spring: damping ratio 0.7 (the fold's `springDamping` — the
//            same question, ~4 % overshoot and never a second bounce, so it is mirrored and
//            named, C-34), with the 2 % settle at the fold's `openMs`. `FLIGHT_SPRING` is
//            derived from those two numbers, never typed.
//   Release  the clone leaves and the screen's hero shows in ONE store update — one commit —
//            once the flight has settled AND the hero exists (the screen's read may land
//            before or after the spring does; the clone waits for whichever is later).
//   Reverse  Back plays the same spring toward the source, the card re-measures on return
//            (a re-ranked Home is landed on where it is now), the pop fades underneath.
//
// THE PUSH'S SLIDE IS SUPPRESSED. With a flight staged, the route's own transition is a
// `fade` at `groundMs` (the fold's `closeMs`) instead of the rise: Home crossfades into the
// screen UNDER the flying chart, and Back is the same fade reversed. So the clone lives at
// the ROOT — `FlightHost`, mounted once in `app/_layout.tsx` above the whole stack — where
// a push cannot unmount it. A deep link stages nothing and gets D2-3's rise, untouched.
//
// ONE ENGINE. The clone's FRAME never changes — only its transform — and no
// `LayoutAnimation` runs anywhere near it, so there is no layout commit that could
// re-apply a committed transform under an in-flight native-driver value (the fold's
// header: the two-engine split, honoured here by needing only one of them). Nothing in
// this module moves geometry.
//
// WHAT THE FLIGHT DOES NOT GET, stated: the back GESTURE (the edge swipe / full-screen
// swipe) is the platform's own interactive pop and cannot drive a JS spring — it pops
// with the fade and no reverse flight; the card's chart is simply there on Home. The
// Back button and the header's ‹ reverse. The fold control's back is the plain pop, too:
// the card is a strip on return, and there is nothing to land on.
//
// REDUCED MOTION stages nothing (the card checks before measuring) — the route's transition
// is `none`, as D2-3 shipped. A flight cut by a blur or by the setting flipping mid-way
// JUMPS to its end state and releases (the fold's rule: finish, never pause). A flight that
// never receives a target (the push did not mount the screen) aborts after `handoffTtlMs`,
// so the card's chart is never left hidden.
//
// NO HAPTIC HERE AND NONE MAY BE ADDED. The landing is exactly where a "landed" buzz
// would read as natural, on a chart whose screen paints `worth_a_call` (the gallery); the
// safety lead flies nothing (S1: it has no chart), and the benign one lands in silence.
// This file and `FlightHost.tsx` are named in `guards/haptics.test.ts`'s ALWAYS_SCANNED.

import type { ReactElement } from 'react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Animated } from 'react-native';
import type { WindowRect } from '../../lib/measureNode';
import { FOLD_MOTION } from './foldMotion';

/**
 * The kill switch the PM's ruling on the recording flips (CUL-1069's last AC: the flight
 * ships as the opening, or the rise stays). Off: the card stages nothing, the route rises,
 * and the screen's chart is D2-3's native full-width layout.
 */
export const FLIGHT_ENABLED = true;

/** The beats, in ms and pt. */
export const FLIGHT_MOTION = {
  /** The clone's 2 % settle — the fold's open, so the hero settles the way a fold re-opens. */
  settleMs: FOLD_MOTION.openMs,
  /** The spring's damping ratio: the fold's iOS `springDamping` (one felt settle, ~4 %
   *  overshoot, never a second bounce). Same question, same number — mirrored, and the
   *  source is named (C-34). `flightMotion.test.ts` pins it to the fold's config. */
  dampingRatio: 0.7,
  /** The native crossfade under the flight (the push's transition with the slide
   *  suppressed): the fold's `closeMs` — Home's box closing into the screen. */
  groundMs: FOLD_MOTION.closeMs,
  /** A staged flight that no screen lands within this long is abandoned: the push did
   *  not mount, and the card's chart must not stay hidden. */
  handoffTtlMs: 1000,
  /** The whole opening, end to end — the screen's own budget (`SIGNAL_OPEN_MOTION`). */
  budgetMs: 700,
  /** The longest flight the budget is pinned over: from the bottom of a phone's Home to
   *  the top of the screen. A longer one settles visibly at `settleMs` all the same; only
   *  its sub-pixel rest (the release) trails past 700. */
  maxFlightPt: 400,
  /** The spring's rest thresholds — where "arrived" is declared. Sub-pixel on a point
   *  value; a proportion on the scale. */
  restPt: 0.3,
  restPtPerS: 2,
  restScale: 0.002,
  restScalePerS: 0.02,
} as const;

/**
 * The spring, derived: for a damping ratio ζ and a 2 % settle time T, ωn = 4 / (ζ·T),
 * stiffness = ωn², damping = 2·ζ·ωn, mass 1. Written as a derivation so the physics is
 * the fold's two numbers and nothing else.
 */
const OMEGA_N = 4 / (FLIGHT_MOTION.dampingRatio * (FLIGHT_MOTION.settleMs / 1000));
export const FLIGHT_SPRING = {
  stiffness: OMEGA_N * OMEGA_N,
  damping: 2 * FLIGHT_MOTION.dampingRatio * OMEGA_N,
  mass: 1,
} as const;

/** How long the envelope of a `distance`-pt flight takes to fall inside `rest` — the
 *  moment the spring declares itself arrived. Exposed for the budget test. */
export function flightRestMs(distance: number, rest: number = FLIGHT_MOTION.restPt): number {
  if (distance <= rest) return 0;
  return (Math.log(distance / rest) / (FLIGHT_MOTION.dampingRatio * OMEGA_N)) * 1000;
}

/** The ONE scale of a flight: uniform, by width. */
export function flightScale(source: WindowRect, target: WindowRect): number {
  return source.width > 0 ? target.width / source.width : 1;
}

// ── The handoff store ──────────────────────────────────────────────────────────────

export interface FlightPayload {
  /** The finding's identity (`foldIdentity`) — the route's `id`. */
  identity: string;
  /** The card's title, so the screen can draw it before its own read answers. */
  title: string;
  /** The card's chart, in window coordinates. */
  source: WindowRect;
  /** The chart itself — the card's `WeeklyBars`, already drawn. */
  element: ReactElement;
}

/**
 * `idle` — no clone. A flight record may linger (see `FlightState.flight`): the last
 *          flown-in screen keeps its source so Back can reverse; cleared on reverse
 *          settle, on abort, and by the next stage.
 * `staged` — the card measured and pushed; the clone sits at the source, waiting for a target.
 * `outbound` — the target is known; the spring is playing toward it.
 * `landed` — the spring rested; the clone waits for the screen's hero to exist.
 * `inbound` — Back: the spring is playing toward the source.
 */
export type FlightPhase = 'idle' | 'staged' | 'outbound' | 'landed' | 'inbound';

export interface FlightRecord extends FlightPayload {
  target: WindowRect | null;
  heroReady: boolean;
  stagedAt: number;
}

export interface FlightState {
  phase: FlightPhase;
  flight: FlightRecord | null;
}

const IDLE: FlightState = { phase: 'idle', flight: null };
let state: FlightState = IDLE;
const listeners = new Set<() => void>();
let ttl: ReturnType<typeof setTimeout> | null = null;

function set(next: FlightState) {
  state = next;
  for (const l of Array.from(listeners)) l();
}

function clearTtl() {
  if (ttl) clearTimeout(ttl);
  ttl = null;
}

function sameRect(a: WindowRect | null, b: WindowRect): boolean {
  return a != null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function getFlightState(): FlightState {
  return state;
}

export function subscribeFlight(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The store, for a component. */
export function useFlightState(): FlightState {
  return useSyncExternalStore(subscribeFlight, getFlightState, getFlightState);
}

/** Is a clone up for this identity right now? (The card hides its chart; the screen its hero.) */
export function flightActiveFor(s: FlightState, identity: string): boolean {
  return s.phase !== 'idle' && s.flight?.identity === identity;
}

/** The route asks this before its first render: a flight staged for its identity means
 *  the push's slide is suppressed. */
export function peekFlight(identity: string): boolean {
  return state.phase === 'staged' && state.flight?.identity === identity;
}

/** The card: measured, about to push. Replaces whatever was there. */
export function stageFlight(payload: FlightPayload, nowMs: number = Date.now()): void {
  clearTtl();
  const stagedAt = nowMs;
  set({ phase: 'staged', flight: { ...payload, target: null, heroReady: false, stagedAt } });
  ttl = setTimeout(() => {
    ttl = null;
    if (state.phase === 'staged' && state.flight?.stagedAt === stagedAt) abortFlight();
  }, FLIGHT_MOTION.handoffTtlMs);
}

/** The screen: its hero (or the slot standing in for it) has laid out at `target`. A
 *  changed target mid-flight retargets the spring; an equal one is ignored. */
export function landFlight(identity: string, target: WindowRect): void {
  const f = state.flight;
  if (!f || f.identity !== identity) return;
  if (state.phase !== 'staged' && state.phase !== 'outbound' && state.phase !== 'landed') return;
  if (sameRect(f.target, target)) return;
  clearTtl();
  set({ phase: state.phase === 'staged' ? 'outbound' : state.phase, flight: { ...f, target } });
}

/** The screen: the real chart exists under the clone (or has gone). Releases the clone
 *  when the flight has already landed; otherwise the landing releases it. */
export function setHeroReady(identity: string, ready: boolean): void {
  const f = state.flight;
  if (!f || f.identity !== identity || f.heroReady === ready) return;
  if (state.phase === 'landed' && ready) {
    set({ phase: 'idle', flight: { ...f, heroReady: true } });
    return;
  }
  set({ phase: state.phase, flight: { ...f, heroReady: ready } });
}

/** The host: the outbound spring rested. */
export function settleOutbound(): void {
  const f = state.flight;
  if (state.phase !== 'outbound' || !f) return;
  set({ phase: f.heroReady ? 'idle' : 'landed', flight: f });
}

/** The screen's Back: fly home. False when there is nothing to reverse (the caller pops plainly). */
export function reverseFlight(identity: string): boolean {
  const f = state.flight;
  if (!f || f.identity !== identity || !f.target) return false;
  if (state.phase === 'inbound') return true;
  clearTtl();
  set({ phase: 'inbound', flight: f });
  return true;
}

/** The card, on return: its chart is HERE now. Retargets the inbound spring. */
export function retargetSource(identity: string, source: WindowRect): void {
  const f = state.flight;
  if (state.phase !== 'inbound' || !f || f.identity !== identity) return;
  if (sameRect(f.source, source)) return;
  set({ phase: 'inbound', flight: { ...f, source } });
}

/** The host: the inbound spring rested. The record is spent. */
export function settleInbound(): void {
  if (state.phase !== 'inbound') return;
  clearTtl();
  set(IDLE);
}

/** Anything cut short: the screen unmounting mid-flight, the TTL, a flight with no target. */
export function abortFlight(): void {
  clearTtl();
  if (state === IDLE) return;
  set(IDLE);
}

// ── The clone's values (the host's hook) ───────────────────────────────────────────

export interface FlightCloneValues {
  translateX: Animated.Value;
  translateY: Animated.Value;
  scale: Animated.Value;
}

interface CloneParams {
  reducedMotion: boolean;
  appActive: boolean;
}

interface Pose {
  x: number;
  y: number;
  scale: number;
}

function poseAt(rect: WindowRect, scale: number): Pose {
  return { x: rect.x, y: rect.y, scale };
}

/**
 * Drives the clone: at the source while staged; springs to the target when it lands;
 * springs home when reversed; jumps to the end on blur / reduced motion. Every value is on
 * the native driver, and a native-driver animation never writes its end value back — so
 * every rest PINS the pose (the fold's `rest()`).
 */
export function useFlightClone({ reducedMotion, appActive }: CloneParams): { state: FlightState; values: FlightCloneValues } {
  const flightState = useFlightState();
  const values = useRef<FlightCloneValues>({
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    scale: new Animated.Value(1),
  }).current;
  const running = useRef<Animated.CompositeAnimation[]>([]);

  const { phase, flight } = flightState;
  const source = flight?.source ?? null;
  const target = flight?.target ?? null;

  useEffect(() => {
    const stopAll = () => {
      for (const a of running.current) a.stop();
      running.current = [];
    };
    const pin = (p: Pose) => {
      values.translateX.setValue(p.x);
      values.translateY.setValue(p.y);
      values.scale.setValue(p.scale);
    };
    const springTo = (p: Pose, onRest: () => void) => {
      stopAll();
      let rested = 0;
      const done = ({ finished }: { finished: boolean }) => {
        // `finished: false` is a stop (retarget, blur, abort, unmount) — whoever stopped
        // it owns the end state; never settle the choreography from here.
        if (!finished) return;
        rested += 1;
        if (rested === 3) {
          running.current = [];
          onRest();
        }
      };
      const common = { useNativeDriver: true, ...FLIGHT_SPRING } as const;
      const anims = [
        Animated.spring(values.translateX, {
          ...common,
          toValue: p.x,
          restDisplacementThreshold: FLIGHT_MOTION.restPt,
          restSpeedThreshold: FLIGHT_MOTION.restPtPerS,
        }),
        Animated.spring(values.translateY, {
          ...common,
          toValue: p.y,
          restDisplacementThreshold: FLIGHT_MOTION.restPt,
          restSpeedThreshold: FLIGHT_MOTION.restPtPerS,
        }),
        Animated.spring(values.scale, {
          ...common,
          toValue: p.scale,
          restDisplacementThreshold: FLIGHT_MOTION.restScale,
          restSpeedThreshold: FLIGHT_MOTION.restScalePerS,
        }),
      ];
      running.current = anims;
      for (const a of anims) a.start(done);
    };

    if (!source) {
      stopAll();
      return;
    }
    const home = poseAt(source, 1);
    if (phase === 'staged') {
      stopAll();
      pin(home);
      return;
    }
    if (phase === 'outbound' && target) {
      const there = poseAt(target, flightScale(source, target));
      // Finishing without motion: the same end state, committed at once.
      const finish = () => {
        stopAll();
        pin(there);
        settleOutbound();
      };
      if (reducedMotion || !appActive) {
        finish();
        return;
      }
      springTo(there, () => {
        pin(there);
        settleOutbound();
      });
      return;
    }
    if (phase === 'landed' && target) {
      stopAll();
      pin(poseAt(target, flightScale(source, target)));
      return;
    }
    if (phase === 'inbound') {
      const finish = () => {
        stopAll();
        pin(home);
        settleInbound();
      };
      if (reducedMotion || !appActive) {
        finish();
        return;
      }
      springTo(home, () => {
        pin(home);
        settleInbound();
      });
      return;
    }
    stopAll();
    // The effect re-runs on the POSE inputs only — a `heroReady` flip must not restart a
    // spring in flight, and the store keeps rect references stable when nothing moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, source, target, reducedMotion, appActive]);

  useEffect(
    () => () => {
      for (const a of running.current) a.stop();
      running.current = [];
    },
    [],
  );

  return { state: flightState, values };
}
