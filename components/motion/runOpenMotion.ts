// A run of meals opening in place, on its OWN motion (CUL-1734, D1 ruled 2026-10-10;
// design authority `docs/culprit-run-open-mockups.html` §02 and §03, whose numbers these
// are). The line leads out of the bead the owner tapped, the box opens from nothing on an
// ease with no bounce, and each meal lands as the box's edge reaches it. The close is
// faster than the open, and a second tap turns either one round from where it is.
//
// C-30: a sibling hook, never a mode flag on `useOpenInPlace`. The Patterns month keeps the
// shared machine and its one motion for every verdict; nothing in this file reaches it.
// What the two share is the host's reset (`OpenInPlaceReset`) and the two-engine split.
//
// THE ANATOMY (all of it in `components/dayRow/SpineNodeRow.tsx`):
//   • the LEAD — a 4pt line from the run's bead down the header's thread segment. Absolute,
//     with an explicit top and height, so no layout commit ever touches its frame: its
//     scaleY is a native-driver transform and nothing else.
//   • the BOX — the slot under the header, clipped while in flight. Its height is the only
//     geometry this machine moves, and every change to it rides a layout config.
//   • the RAIL — a plain line inside the box, anchored top and bottom, with no transform.
//     The box's own keyframe carries it, so it rides the edge.
//   • the MEALS — each in its own animated wrapper (opacity and a 4pt drift), mounted once
//     with the box and never remounted until the box unmounts (CUL-1721).
//
//   open   t=0    the box mounts SHUT (an explicit zero height, the meals laid out inside
//                 it, nothing in the flow moves), and the slot's frame lands.
//          t≈16   ONE configured commit: the box's height is let go, on `RUN_OPEN_LAYOUT`,
//                 whose `delay` holds it until the line has led. In the same tick the
//                 chevron starts its 180° turn (200ms, ease out), the line grows linearly
//                 (80ms), and each meal is scheduled to land as the edge reaches it.
//          t=80   the box opens from 0 over 240ms, ease out.
//          rest   about 320ms for two meals, never past 400ms at any size.
//   close  t=0    ONE configured commit takes the box to zero (`RUN_CLOSE_LAYOUT`, from
//                 t=40 over 200ms) and yields the header's bottom edge; the words leave over
//                 100ms; the chevron turns back; the line slides into the bead from t=200
//                 over 80ms.
//          t=280  the box, zero high, unmounts. Nothing is left to snap.
//
// THE ONE RULE (CUL-1721, inherited): no commit this machine makes changes the flow's
// geometry (the box's height, the header yielding its edge) without a layout config in
// the same tick. The box mounts and unmounts at zero height, which moves nothing. The
// exemptions are the ones where nothing may move: Reduce Motion, a blur, a re-key, and a
// host's reset.
//
// A SECOND TAP REVERSES FROM WHERE IT IS. Fabric starts a configured commit from the frame
// on screen, so the box needs only a fresh config; every native value turns round from
// its current value over the time it took to get there (the elapsed time, floored at
// `reverseFloorMs` so a reversal is never a flick), never a settle and a fresh start.
//
// REDUCE MOTION: the box at once, the line and the meals crossfade over `durationFast`, the
// chevron swaps (its value jumps). No layout config.
//
// NO HAPTIC, and none may be added: this file drives the day's list, which paints
// `worth_a_call` beside the runs it opens. Named in `guards/haptics.test.ts` ALWAYS_SCANNED
// (a `.ts` hook is invisible to that guard's walk).

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutAnimation, type LayoutAnimationConfig } from 'react-native';
import { theme } from '../../constants/theme';
import { OpenInPlaceReset } from './openInPlaceMotion';

/** The beats, in ms and pt: §03 of the mock, verbatim ("the convening's seats"). */
export const RUN_MOTION = {
  /** Open and close: the chevron's 180° turn, ease out. */
  chevronMs: 200,
  /** Open: the line grows out of the bead, LINEARLY, so its tip never stalls ahead of the box. */
  leadMs: 80,
  /** Open: the box waits for the line (the layout config's own `delay`, never a JS timer)... */
  boxDelayMs: 80,
  /** ...then opens from 0 on an ease out. */
  boxMs: 240,
  /** Each meal's landing: opacity 0 → 1 and a 4pt drift. */
  landMs: 150,
  landDriftPt: 4,
  /** A meal lands as the edge reaches this far into it, so its words are never clipped mid-fade. */
  landAheadPt: 8,
  /** No meal starts landing later than this: twelve meals finish inside the same 400ms as two. */
  landCapMs: 250,
  /** Close: the words leave (opacity and the same 4pt drift). */
  leaveMs: 100,
  /** Close: the box closes from t=40 over 200ms. */
  closeDelayMs: 40,
  closeMs: 200,
  /** Close: the line slides back into the bead from t=200 over 80ms. */
  retractDelayMs: 200,
  retractMs: 80,
  /** A reversal never takes less than this. */
  reverseFloorMs: 120,
  /** Reduce Motion: what enters or leaves crossfades. */
  crossfadeMs: theme.durationFast,
  /** One frame: the shut box's mount lands before the commit that lets it open. */
  mountFrameMs: 16,
} as const;

/**
 * The box opening. Its OWN constants, not the fold's `UNFOLD_LAYOUT` (C-34: a value copied
 * from another module inherits that module's question). The fold's spring asks "settle
 * with one felt overshoot", which on this box measured 11.6% past full height, about 85pt
 * on twelve meals (§08, Motion & IA): two physics on one phone. The run's question is
 * "arrive where the edge is", so it eases out and never overshoots. `UNFOLD_LAYOUT` is left
 * as it is: the daily look and a read's arrival still ride it.
 */
export const RUN_OPEN_LAYOUT: LayoutAnimationConfig = {
  duration: RUN_MOTION.boxDelayMs + RUN_MOTION.boxMs,
  update: { type: LayoutAnimation.Types.easeOut, delay: RUN_MOTION.boxDelayMs, duration: RUN_MOTION.boxMs },
};

/** The box closing: faster than it opened, from t=40, no overshoot. */
export const RUN_CLOSE_LAYOUT: LayoutAnimationConfig = {
  duration: RUN_MOTION.closeDelayMs + RUN_MOTION.closeMs,
  update: { type: LayoutAnimation.Types.easeInEaseOut, delay: RUN_MOTION.closeDelayMs, duration: RUN_MOTION.closeMs },
};

/** A reversal: no delay (the motion is already under way), over `ms`, from the frame on screen. */
export function runReverseLayout(ms: number): LayoutAnimationConfig {
  return { duration: ms, update: { type: LayoutAnimation.Types.easeOut, duration: ms } };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * When each meal starts landing, in ms after the box's commit: the moment the box's edge
 * (an ease out, 1 − (1 − x)²) reaches `landAheadPt` into it, capped at `landCapMs`. Measured
 * tops when the layout has reported them; otherwise even spacing, which is what a run of
 * same-height meals measures to.
 */
export function runLandStarts(n: number, tops?: readonly (number | undefined)[] | null, full?: number | null): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const top = tops?.[i];
    const p = full && full > 0 && top != null ? clamp01((top + RUN_MOTION.landAheadPt) / full) : i / n;
    out.push(Math.min(RUN_MOTION.boxDelayMs + RUN_MOTION.boxMs * (1 - Math.sqrt(1 - p)), RUN_MOTION.landCapMs));
  }
  return out;
}

/** From the box's commit to rest: the last of the chevron, the box and the last landing. */
export function runOpenBudgetMs(starts: readonly number[]): number {
  const lastLand = starts.length ? Math.max(...starts) + RUN_MOTION.landMs : 0;
  return Math.max(RUN_MOTION.chevronMs, RUN_MOTION.boxDelayMs + RUN_MOTION.boxMs, lastLand);
}

/** From the box's commit to the idle commit: the budget, but never before the box's own
 *  keyframe has had a frame to land (Fabric starts it on the commit after the timer is
 *  armed), so the clip never comes off a box still moving. */
export function runOpenIdleMs(starts: readonly number[]): number {
  return Math.max(runOpenBudgetMs(starts), RUN_MOTION.boxDelayMs + RUN_MOTION.boxMs + RUN_MOTION.mountFrameMs);
}

/** From the tap to the box's unmount. */
export const RUN_CLOSE_BUDGET_MS = Math.max(
  RUN_MOTION.chevronMs,
  RUN_MOTION.leaveMs,
  RUN_MOTION.closeDelayMs + RUN_MOTION.closeMs,
  RUN_MOTION.retractDelayMs + RUN_MOTION.retractMs,
);

/**
 * `closed` — nothing rendered under the header.
 * `primed` — the box is mounted SHUT, the meals inside it at zero opacity; one frame.
 * `opening` — the box is opening (or turning round to open), the meals landing.
 * `open` — at rest: no clip, nothing in flight.
 * `closing` — the box is closing (or turning round to close), the words leaving.
 * `crossfade` — Reduce Motion, either direction: a fade, nothing moves.
 */
export type RunOpenPhase = 'closed' | 'primed' | 'opening' | 'open' | 'closing' | 'crossfade';

export interface RunMemberValues {
  opacity: Animated.Value;
  shift: Animated.Value;
}

export interface RunOpenValues {
  /** The chevron's turn, 0 (down) ⇄ 1 (turned 180°, up). */
  chevron: Animated.Value;
  /** The lead's scaleY about its top, 0 (in the bead) ⇄ 1. */
  lead: Animated.Value;
  /** The lead's and the rail's opacity: moves only under Reduce Motion. */
  line: Animated.Value;
  /** One pair per meal, in the run's order. */
  members: RunMemberValues[];
}

export interface RunOpen {
  phase: RunOpenPhase;
  /** Render the box (and the lead) at all. */
  slotMounted: boolean;
  /** The box's explicit height: 0 while shut or closing, null when it takes its meals' height. */
  boxHeight: 0 | null;
  /** The box clips: every phase in flight, never at rest. */
  clipped: boolean;
  inFlight: boolean;
  /** Something sits under the header: the header yields its bottom edge. Changes only on a
   *  configured commit (or under the exemptions). */
  membersBelow: boolean;
  /** The lead's explicit height: the bead's foot to the header's foot. */
  leadHeight: number;
  /** How far above the box's foot the rail stops: at the last meal's bead. Null until the
   *  meals have reported their layout (the host's fallback then). Read only on commits
   *  this machine makes, so a layout report never becomes a bare commit mid-flight. */
  railBottom: number | null;
  values: RunOpenValues;
  /** The header's layout, for the lead's height. */
  onHeaderLayout: (height: number) => void;
  /** The meals' stage's layout: the open box's full height. */
  onStageLayout: (height: number) => void;
  /** A meal's top inside the stage: where the edge reaches it. */
  onMemberLayout: (index: number, y: number) => void;
}

interface Params {
  /** The host's state: this run is the open one. */
  shown: boolean;
  /** The run's id — a change under an open run re-keys without motion. */
  identity: string;
  /** How many meals the run holds. */
  count: number;
  /** Where a bead's centre sits in its row (`SPINE_THREAD.dotCenterY`): the rail ends at
   *  the last meal's. */
  beadCenterY: number;
  /** Where the lead starts in the header: the foot of the run's bead. */
  leadTop: number;
  reducedMotion: boolean;
  appActive: boolean;
}

/** The header's floor before it has reported a layout (the 44pt row). */
const HEADER_FLOOR_PT = 44;

export function useRunOpen({ shown, identity, count, beadCenterY, leadTop, reducedMotion, appActive }: Params): RunOpen {
  const [phase, setPhase] = useState<RunOpenPhase>(shown ? 'open' : 'closed');

  const values = useRef<RunOpenValues>({
    chevron: new Animated.Value(shown ? 1 : 0),
    lead: new Animated.Value(shown ? 1 : 0),
    line: new Animated.Value(1),
    members: [],
  }).current;
  // One pair per meal, grown as a run grows (a meal logged into an open run).
  while (values.members.length < count) {
    values.members.push({ opacity: new Animated.Value(shown ? 1 : 0), shift: new Animated.Value(0) });
  }

  // Written EAGERLY by `go`, never from the render (the shared machine's reason).
  const phaseRef = useRef<RunOpenPhase>(phase);
  const startedAt = useRef(0);
  const countRef = useRef(count);
  countRef.current = count;
  const stageH = useRef<number | null>(null);
  const tops = useRef<(number | undefined)[]>([]);
  const headerH = useRef(HEADER_FLOOR_PT);
  const railBottom = useRef<number | null>(null);
  const leadHeight = useRef(Math.max(0, HEADER_FLOOR_PT - leadTop));
  /** The measured frames (the rail's foot, the lead's height), frozen onto refs only ahead
   *  of a commit this machine makes (configured, or idle). A layout report never renders on
   *  its own: the header grows when it yields its edge to the box, and a bare commit then
   *  would change the lead's frame under its in-flight native scale (Fabric snaps it back). */
  const fixMeasures = useCallback(() => {
    const last = tops.current[countRef.current - 1];
    railBottom.current =
      stageH.current != null && last != null ? Math.max(0, stageH.current - (last + beadCenterY)) : null;
    leadHeight.current = Math.max(0, headerH.current - leadTop);
  }, [beadCenterY, leadTop]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const running = useRef<Animated.CompositeAnimation[]>([]);
  const mounted = useRef(true);
  const reduced = useRef(reducedMotion);
  reduced.current = reducedMotion;

  const go = useCallback((p: RunOpenPhase) => {
    phaseRef.current = p;
    startedAt.current = Date.now();
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

  const start = useCallback((anim: Animated.CompositeAnimation) => {
    running.current.push(anim);
    anim.start(() => {
      running.current = running.current.filter((a) => a !== anim);
    });
  }, []);

  const timing = useCallback(
    (value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number, delay = 0) =>
      Animated.timing(value, { toValue, duration, delay, easing, useNativeDriver: true }),
    [],
  );

  const members = useCallback(() => values.members.slice(0, countRef.current), [values]);

  /** Every value at its end state. A native-driver animation never writes its final value
   *  back, so each settle pins them. */
  const rest = useCallback(
    (open: boolean) => {
      values.chevron.setValue(open ? 1 : 0);
      values.lead.setValue(open ? 1 : 0);
      values.line.setValue(1);
      for (const m of values.members) {
        m.opacity.setValue(open ? 1 : 0);
        m.shift.setValue(0);
      }
    },
    [values],
  );

  /** The transition ends NOW at the state the host asked for: a blur, a re-key, a reset. */
  const settle = useCallback(
    (toShown: boolean) => {
      stopAll();
      fixMeasures();
      rest(toShown);
      go(toShown ? 'open' : 'closed');
    },
    [stopAll, rest, go, fixMeasures],
  );

  /** The idle commit: the clip comes off (open), or the zero-high box unmounts (closed). */
  const finish = useCallback(
    (toShown: boolean, from: RunOpenPhase) => {
      if (phaseRef.current !== from) return;
      fixMeasures();
      rest(toShown);
      go(toShown ? 'open' : 'closed');
    },
    [rest, go, fixMeasures],
  );

  /** How long a turn-round takes: the time spent getting here, floored. */
  const reverseMs = useCallback(
    (budget: number) => Math.max(RUN_MOTION.reverseFloorMs, Math.min(Date.now() - startedAt.current, budget)),
    [],
  );

  // ── Open ──────────────────────────────────────────────────────────────────────
  const beginOpen = useCallback(() => {
    if (phaseRef.current !== 'primed') return;
    const starts = runLandStarts(countRef.current, tops.current, stageH.current);
    fixMeasures();
    // ONE configured commit: the box's height is let go, and the header yields its edge.
    LayoutAnimation.configureNext(RUN_OPEN_LAYOUT);
    go('opening');
    start(timing(values.chevron, 1, RUN_MOTION.chevronMs, Easing.out(Easing.cubic)));
    start(timing(values.lead, 1, RUN_MOTION.leadMs, Easing.linear));
    members().forEach((m, i) => {
      start(timing(m.opacity, 1, RUN_MOTION.landMs, Easing.out(Easing.quad), starts[i]));
      start(timing(m.shift, 0, RUN_MOTION.landMs, Easing.out(Easing.cubic), starts[i]));
    });
    later(runOpenIdleMs(starts), () => finish(true, 'opening'));
  }, [values, go, start, timing, members, later, finish, fixMeasures]);

  const open = useCallback(() => {
    const from = phaseRef.current;
    stopAll();
    if (reduced.current) {
      // The box at once; the line and the meals fade in; the chevron swaps.
      values.chevron.setValue(1);
      values.lead.setValue(1);
      if (from === 'closed') values.line.setValue(0);
      for (const m of members()) m.shift.setValue(0);
      go('crossfade');
      start(timing(values.line, 1, RUN_MOTION.crossfadeMs, Easing.out(Easing.quad)));
      for (const m of members()) start(timing(m.opacity, 1, RUN_MOTION.crossfadeMs, Easing.out(Easing.quad)));
      later(RUN_MOTION.crossfadeMs, () => finish(true, 'crossfade'));
      return;
    }
    if (from === 'crossfade') {
      // Reduce Motion went off mid-fade: land where the host asked, with no motion.
      settle(true);
      return;
    }
    if (from === 'closing') {
      // Turn round: the box opens from the frame it is on; every value from where it is.
      const ms = reverseMs(RUN_CLOSE_BUDGET_MS);
      LayoutAnimation.configureNext(runReverseLayout(ms));
      go('opening');
      start(timing(values.chevron, 1, ms, Easing.out(Easing.cubic)));
      start(timing(values.lead, 1, ms, Easing.linear));
      for (const m of members()) {
        start(timing(m.opacity, 1, ms, Easing.out(Easing.quad)));
        start(timing(m.shift, 0, ms, Easing.out(Easing.cubic)));
      }
      later(ms + RUN_MOTION.mountFrameMs, () => finish(true, 'opening'));
      return;
    }
    // A fresh open: the box mounts SHUT, its meals clear and lifted, the line in the bead.
    fixMeasures();
    rest(false);
    for (const m of members()) m.shift.setValue(-RUN_MOTION.landDriftPt);
    go('primed');
    later(RUN_MOTION.mountFrameMs, beginOpen);
  }, [values, stopAll, members, go, start, timing, later, finish, reverseMs, rest, beginOpen, settle, fixMeasures]);

  // ── Close ─────────────────────────────────────────────────────────────────────
  const close = useCallback(() => {
    const from = phaseRef.current;
    stopAll();
    if (from === 'primed') {
      // Nothing has moved yet: the shut box leaves (zero high, nothing in the flow moves).
      settle(false);
      return;
    }
    if (reduced.current) {
      values.chevron.setValue(0);
      go('crossfade');
      start(timing(values.line, 0, RUN_MOTION.crossfadeMs, Easing.out(Easing.quad)));
      for (const m of members()) start(timing(m.opacity, 0, RUN_MOTION.crossfadeMs, Easing.out(Easing.quad)));
      later(RUN_MOTION.crossfadeMs, () => finish(false, 'crossfade'));
      return;
    }
    if (from === 'crossfade') {
      settle(false);
      return;
    }
    if (from === 'opening') {
      const ms = reverseMs(runOpenBudgetMs(runLandStarts(countRef.current, tops.current, stageH.current)));
      LayoutAnimation.configureNext(runReverseLayout(ms));
      go('closing');
      start(timing(values.chevron, 0, ms, Easing.out(Easing.cubic)));
      start(timing(values.lead, 0, ms, Easing.linear));
      for (const m of members()) {
        start(timing(m.opacity, 0, ms, Easing.out(Easing.quad)));
        start(timing(m.shift, -RUN_MOTION.landDriftPt, ms, Easing.out(Easing.quad)));
      }
      later(ms + RUN_MOTION.mountFrameMs, () => finish(false, 'closing'));
      return;
    }
    // From rest: ONE configured commit takes the box to zero and yields the header's edge.
    rest(true);
    LayoutAnimation.configureNext(RUN_CLOSE_LAYOUT);
    go('closing');
    start(timing(values.chevron, 0, RUN_MOTION.chevronMs, Easing.out(Easing.cubic)));
    for (const m of members()) {
      start(timing(m.opacity, 0, RUN_MOTION.leaveMs, Easing.out(Easing.quad)));
      start(timing(m.shift, -RUN_MOTION.landDriftPt, RUN_MOTION.leaveMs, Easing.out(Easing.quad)));
    }
    start(timing(values.lead, 0, RUN_MOTION.retractMs, Easing.linear, RUN_MOTION.retractDelayMs));
    later(RUN_CLOSE_BUDGET_MS, () => finish(false, 'closing'));
  }, [values, stopAll, settle, go, start, timing, members, later, finish, reverseMs, rest]);

  // The host's state drives the machine (the shared machine's rules: a flip reverses, a
  // re-key under an open run lands with no motion, a host's reset lands every run at once).
  const resetGen = useContext(OpenInPlaceReset);
  const lastReset = useRef(resetGen);
  const lastIdentity = useRef(identity);
  const lastShown = useRef(shown);
  useEffect(() => {
    if (lastReset.current !== resetGen) {
      lastReset.current = resetGen;
      lastIdentity.current = identity;
      lastShown.current = shown;
      if (phaseRef.current !== (shown ? 'open' : 'closed')) settle(shown);
      return;
    }
    const reKeyed = lastIdentity.current !== identity && lastShown.current && shown;
    lastIdentity.current = identity;
    if (reKeyed) {
      // The measures are left alone: the new run's layout reports overwrite them, and the
      // next commit this machine makes freezes them.
      settle(true);
      return;
    }
    if (shown === lastShown.current) return;
    lastShown.current = shown;
    if (shown) open();
    else close();
  }, [shown, identity, resetGen, open, close, settle]);

  // A blur FINISHES the transition at the state the host asked for.
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

  const onHeaderLayout = useCallback((height: number) => {
    headerH.current = height;
  }, []);
  const onStageLayout = useCallback((height: number) => {
    stageH.current = height;
  }, []);
  const onMemberLayout = useCallback((index: number, y: number) => {
    tops.current[index] = y;
  }, []);

  const inFlight = phase === 'primed' || phase === 'opening' || phase === 'closing' || phase === 'crossfade';
  return {
    phase,
    slotMounted: phase !== 'closed',
    boxHeight: phase === 'primed' || phase === 'closing' ? 0 : null,
    clipped: inFlight,
    inFlight,
    membersBelow: phase === 'opening' || phase === 'open' || phase === 'crossfade',
    leadHeight: leadHeight.current,
    railBottom: railBottom.current,
    values,
    onHeaderLayout,
    onStageLayout,
    onMemberLayout,
  };
}
