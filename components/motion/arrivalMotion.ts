// The per-incident read's ARRIVAL (CUL-804 · incident spec §7; design authority
// `docs/culprit-incident-screen-mockups.html` round 2 §4).
//
// The design principles allow one considered animation: the transition to a real insight
// should feel like something ARRIVED. This is that moment, one incident down — so it
// borrows the Signal fold's rule rather than inventing a second vocabulary: THE RAIL IS
// THE CONTINUOUS THREAD. The pending line is a 16pt tick; when the read lands the rail
// grows first, the box opens around it with one felt settle, and the sentence lands a
// beat after the box. Every constant here is `FOLD_MOTION`'s, verbatim — this module owns
// the SEQUENCE, never the numbers.
//
// A one-shot, not a toggle. `useFoldMotion` is a two-directional machine whose host defers
// its own state change until the choreography commits it; a read cannot be deferred that
// way (the row resolves when the server says so, not when the animation is ready), so what
// this defers is VISIBILITY: the resolved content is mounted at t0, clipped to the pending
// box's height and held at opacity 0, and the beats reveal it. That is why this is a
// sibling of the fold rather than a call into it.
//
// TWO ENGINES, ONE JOB EACH — the fold's split, and load-bearing for the same reason.
// `LayoutAnimation` moves GEOMETRY only (beat 2: the row height and every sibling below it
// in one native transaction). `Animated` on the native driver moves everything else (the
// rail's lead, the pending fade, the sentence's late fade-and-drift). A layout keyframe
// re-applies a view's COMMITTED props when it ends, so a view that is both layout-animated
// and carrying an in-flight native-driver transform snaps back on Fabric — which is why
// the rail leaves the card's flow (absolute, an explicit height) for exactly the commit
// that animates layout, and why no `create` config is used anywhere.
//
// SAME PHYSICS ON EVERY VERDICT (G4). A `worth_a_call` arrives on a rose rail and not one
// millisecond harder — no glyph, no colour flash, and NO HAPTIC: silence on safety is
// structural, and nothing in this module or its call sites imports `lib/haptics`.
//
// WHAT NEVER ARRIVES (§7): a read that already exists on open — the first render is
// already resolved, so the edge below never fires and the tree paints on the first frame;
// and a re-analysis after an owner edit, which is suppressed by `suppressed` because a
// read the owner has corrected did not arrive, it was answered. The states that DO arrive
// include `failed` / `capped` / `not_enough_to_say`: they take the same choreography on
// their own card, never a special error motion.
//
// TWO CONDITIONS, NOT ONE, and each excludes a case the other cannot see. `awaitingRead`
// is the section's fact — a read is being produced — and it alone excludes the FETCH
// frame, where the same pending box paints while a local row is read. The STAGE's own
// transition (it was showing the pending box, it is now showing content) is what excludes
// everything the fact cannot: a landing whose branch renders NOTHING (`read_disabled`, a
// photoless event with no recommendation), and a photo removed mid-wait, which changes
// which branch is on screen without any read having arrived. An earlier revision gated on
// the fact alone and called the empty-tree case harmless — it is not: `configureNext` is
// a GLOBAL next-commit config, so a beat fired over an unrendered section lands its 370ms
// spring on whatever else happens to lay out in that commit.
//
// APP BLUR FINISHES, NEVER PAUSES (the arrival moment's rule): a transition cut by a blur
// jumps to its end state and commits it un-animated, so the owner never returns to a card
// half-arrived.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutAnimation } from 'react-native';
import { theme } from '../../constants/theme';
import { FOLD_MOTION, UNFOLD_LAYOUT } from './foldMotion';

/**
 * `idle` — the shipped tree, no wrapper, the card's rail a plain View.
 * `arriving` — the three beats (the rail leads, the box opens, the sentence lands).
 * `crossfade` — reduced motion: the content fades in over `durationFast`, nothing moves.
 */
export type ArrivalPhase = 'idle' | 'arriving' | 'crossfade';

export interface ArrivalValues {
  /** The pending box's opacity as it leaves (1 → 0, in beat 1's own window). */
  pendingOpacity: Animated.Value;
  /** The landed content's opacity (0 → 1 with the box, or over `durationFast`). */
  bodyOpacity: Animated.Value;
  /** The landed content's translateY (−`driftPt` → 0; 0 under reduced motion). */
  bodyShift: Animated.Value;
  /** The rail's scaleY about its own centre (tick/height → 1). */
  railScale: Animated.Value;
  /** The rail's translateY, so the seeded tick sits where the pending tick was. */
  railShift: Animated.Value;
}

/** Handed to `IncidentReadCard` while the rail beat is live; null the rest of the time,
 *  and null whenever the beat cannot run — then the rail rides the box (§12.3's degrade). */
export interface ArrivalRail {
  /** The rail's explicit height while it is out of the card's flow. */
  height: number;
  scale: Animated.Value;
  shift: Animated.Value;
}

/** What the stage is showing: the pending box, the landed content, or nothing at all
 *  (the branches that render no read section). */
export type StageKind = 'pending' | 'content' | null;

export interface IncidentArrival {
  phase: ArrivalPhase;
  /** A beat is in flight — the content slot clips and holds a height, the overlay paints. */
  inFlight: boolean;
  /** The pending box's height, held on the content slot through beat 1; null once the box
   *  has been released (beat 2) and whenever the pending box was never measured. */
  heldHeight: number | null;
  /** The pending box's offset inside the section — the fading overlay's absolute `top`. */
  slotTop: number | null;
  values: ArrivalValues;
  rail: ArrivalRail | null;
  /** The pending box's own layout, read while it is the one thing on screen. */
  onPendingLayout: (height: number, y: number) => void;
  /** The READ CARD's own height — never the section block's. The rail is painted inside
   *  the card and clipped by it, so a height taken from the block would seed the rail's
   *  scale against geometry it cannot reach; and block height is verdict-correlated (an
   *  escalation's facts never fold, §5.3a), which would make the rail's apparent growth
   *  rate differ by verdict. G4 says it must not. */
  onContentLayout: (height: number) => void;
  /** The stage reports what it is showing, every commit, from a layout effect — so the
   *  parent's edge effect below sees the CURRENT pair. */
  noteStage: (kind: StageKind) => void;
}

interface Params {
  /**
   * A read is being PRODUCED — not merely "the pending box is on screen". The two come
   * apart on the path that matters: a section mounting over an incident read weeks ago
   * paints the same pending box while it reads the local row, and that is a FETCH, not a
   * wait. Counting it would replay the flourish every time an owner opened an old record
   * from History, which is the case §7 excludes by name. The section's own `working` flag
   * is the discriminator: it is set only when the server has been asked for a read.
   */
  awaitingRead: boolean;
  /** The landed row carries an owner edit — §7's "a re-analysis after an owner edit swaps
   *  un-animated". Read at the instant the edge fires, never closed over per render. */
  suppressed: boolean;
  reducedMotion: boolean;
  appActive: boolean;
  /** The incident's identity — a change mid-flight abandons the choreography. */
  identity: string;
  /** The pending tick's height, from the card that draws it. Passed rather than imported
   *  so `components/motion` never depends on `components/event`. */
  tickHeight: number;
}

export function useIncidentArrival({
  awaitingRead,
  suppressed,
  reducedMotion,
  appActive,
  identity,
  tickHeight,
}: Params): IncidentArrival {
  const [phase, setPhase] = useState<ArrivalPhase>('idle');
  const [heldHeight, setHeldHeight] = useState<number | null>(null);
  const [railHeight, setRailHeight] = useState<number | null>(null);

  const values = useRef<ArrivalValues>({
    pendingOpacity: new Animated.Value(1),
    bodyOpacity: new Animated.Value(1),
    bodyShift: new Animated.Value(0),
    railScale: new Animated.Value(1),
    railShift: new Animated.Value(0),
  }).current;

  // Read at the instant a beat fires, never closed over per render (the fold's rule: a
  // mocked native driver completes synchronously, so a beat's callback can run in the tick
  // that started it and a stale ref drops the choreography on the floor).
  const phaseRef = useRef<ArrivalPhase>('idle');
  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;
  const tickRef = useRef(tickHeight);
  tickRef.current = tickHeight;

  // The pending box's geometry, and the landed content's height. `pendingH` is what the
  // slot holds through beat 1; `contentH` is the rail's explicit height.
  const pendingH = useRef<number | null>(null);
  const slotY = useRef<number | null>(null);
  const [slotTop, setSlotTop] = useState<number | null>(null);
  // The rail beat waits for the card's first layout, which lands a frame after the commit
  // that mounts it — well inside beat 2's 80ms lag.
  const railBeatArmed = useRef(false);
  // What the stage is showing, and what it was showing before that. Written from the
  // stage's own layout effect, which React runs BEFORE this hook's (a child's layout
  // effects run before its parent's), so the edge below always reads the current pair.
  const stageNow = useRef<StageKind>(null);
  const stageWas = useRef<StageKind>(null);

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
  // every return to idle pins the end state — a later re-render then commits what the
  // owner is looking at, never the seed the animation started from.
  const rest = useCallback(() => {
    values.pendingOpacity.setValue(1);
    values.bodyOpacity.setValue(1);
    values.bodyShift.setValue(0);
    values.railScale.setValue(1);
    values.railShift.setValue(0);
  }, [values]);

  const go = useCallback((p: ArrivalPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const goIdle = useCallback(() => {
    rest();
    clearTimers();
    railBeatArmed.current = false;
    setHeldHeight(null);
    setRailHeight(null);
    go('idle');
  }, [rest, clearTimers, go]);

  /** The arrival ends NOW, at its end state, un-animated. Blur, and the safety valve for
   *  a beat that never finished. */
  const settle = useCallback(() => {
    if (phaseRef.current === 'idle') return;
    stopAll();
    goIdle();
  }, [stopAll, goIdle]);

  // ── Beat 1's rail, once the landed content has reported its height ────────────
  const railLead = useCallback(
    (height: number) => {
      if (phaseRef.current !== 'arriving') return;
      const from = pendingH.current;
      const tick = tickRef.current;
      // No pending measurement, or a degenerate height: the rail rides the box, in flow,
      // and the other two beats still run (§12.3's degrade, never a snap).
      if (from == null || !(height > 0)) return;
      // The rail is full-bleed (top 0) and scales about its own centre, so a scale of
      // tick/height leaves a `tick`-tall segment centred at height/2. The pending tick sat
      // at the pending box's centre, and the box and the card share a top edge — so the
      // seed shift is the difference between those two centres, and the end state (scale 1,
      // shift 0) is the rail filling the card.
      values.railScale.setValue(tick / height);
      values.railShift.setValue(from / 2 - height / 2);
      setRailHeight(height);
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
    },
    [run, timing, values],
  );

  // ── Beats 2 and 3: the box opens, the sentence lands ─────────────────────────
  const openBox = useCallback(() => {
    if (phaseRef.current !== 'arriving') return;
    // One commit carries the layout config and the release of the held height, so the row,
    // the section and every sibling below move in the same native transaction.
    LayoutAnimation.configureNext(UNFOLD_LAYOUT);
    setHeldHeight(null);
    run(
      Animated.parallel([
        timing(values.bodyOpacity, 1, FOLD_MOTION.openMs, Easing.inOut(Easing.quad)),
        timing(values.bodyShift, 0, FOLD_MOTION.landMs, Easing.out(Easing.cubic), FOLD_MOTION.landDelayMs),
      ]),
      () => {
        values.bodyOpacity.setValue(1);
        values.bodyShift.setValue(0);
        later(FOLD_MOTION.settleSlackMs, goIdle);
      },
    );
  }, [run, timing, values, later, goIdle]);

  const begin = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    if (reducedMotion) {
      // A crossfade is not motion: no `configureNext`, no translate, no rail beat, and the
      // pending box leaves at once rather than fading over the content it is replacing.
      values.bodyOpacity.setValue(0);
      values.bodyShift.setValue(0);
      go('crossfade');
      run(timing(values.bodyOpacity, 1, theme.durationFast, Easing.out(Easing.quad)), () => {
        values.bodyOpacity.setValue(1);
        goIdle();
      });
      // The same safety valve the animated path has. A crossfade that loses its callback
      // would otherwise leave the content mounted at opacity 0 with nothing to end it —
      // and this is the ACCESSIBILITY path, where an invisible read is least acceptable.
      later(theme.durationFast + FOLD_MOTION.settleSlackMs * 2, settle);
      return;
    }
    values.pendingOpacity.setValue(1);
    values.bodyOpacity.setValue(0);
    values.bodyShift.setValue(-FOLD_MOTION.driftPt);
    values.railScale.setValue(1);
    values.railShift.setValue(0);
    railBeatArmed.current = true;
    setHeldHeight(pendingH.current);
    setSlotTop(slotY.current);
    go('arriving');
    // Beat 1: the words leave in the rail's own window — "in the same beat", §7's table.
    // The tick fades WITH its box; the card's rail grows in its place, and the crossfade
    // is what covers the 16pt the two lines sit apart (the mock's `.pendingband` /
    // `.readcard .rail` pair, verbatim).
    run(timing(values.pendingOpacity, 0, FOLD_MOTION.railLeadMs, Easing.out(Easing.quad)), () => {
      values.pendingOpacity.setValue(0);
    });
    // Beat 2, 80ms behind the rail: the box follows the line.
    later(FOLD_MOTION.railLagMs, openBox);
    // Whatever happens to the beats, the arrival ends: a content height that was never
    // reported degrades to the rail riding the box, and the tree returns to idle once the
    // box has landed.
    later(
      FOLD_MOTION.railLagMs + FOLD_MOTION.openMs + FOLD_MOTION.settleSlackMs * 2,
      () => {
        // `settle`, not `goIdle`: a beat still running when the valve trips must be
        // STOPPED, or it keeps driving values `rest()` has just pinned. Defence in depth,
        // not a tested behaviour — the idle tree binds none of those values, so no test
        // through the public surface can tell the two apart. Kept because the next state
        // added to the idle tree could bind one.
        if (phaseRef.current === 'arriving') settle();
      },
    );
  }, [reducedMotion, values, run, timing, later, openBox, goIdle, settle, go]);

  const noteStage = useCallback((kind: StageKind) => {
    if (stageNow.current === kind) return;
    stageWas.current = stageNow.current;
    stageNow.current = kind;
  }, []);

  // ── The edge: awaiting → landed, observed on THIS mount ──────────────────────
  // Seeded from the first render's own value, so a read that was already in the record when
  // the screen opened is never an arrival — `wasAwaiting` starts false and this effect's
  // guard never opens.
  //
  // Declared BEFORE the identity effect, which matters only for a host that re-keys this
  // hook IN PLACE. Both of today's call sites pass `identity: eventId` on a screen that
  // `router.push`es a fresh instance per id, so the two never change in one commit. If a
  // future host does re-key in place — an incident pager, say — this effect would run first
  // and could open on the OLD `wasAwaiting` against the new incident's value; the identity
  // effect below then stops and resets it in the same batch, before any native frame, so it
  // self-heals rather than misfiring visibly. Reorder the two if that stops being true.
  const wasAwaiting = useRef(awaitingRead);
  // A LAYOUT effect, not a passive one. `begin()` is what mounts the clip and seeds the
  // content at opacity 0, and a passive effect is not guaranteed to flush before the host
  // paints — so the landed card could be committed unwrapped, unclipped and fully opaque
  // for one frame, then collapse into a 48pt spinner box and re-arrive. On an escalation
  // that is the worst frame this surface could show. A layout effect's own state update
  // is flushed before paint, so the owner only ever sees the seeded tree.
  useLayoutEffect(() => {
    const was = wasAwaiting.current;
    wasAwaiting.current = awaitingRead;
    if (!was || awaitingRead) return;
    if (suppressedRef.current) return;
    // The stage's half: it must have been showing the pending box and be showing content
    // now. Without this, a landing whose branch renders nothing still fires beat 2's
    // `configureNext` — which is global, and lands its spring on an unrelated commit.
    if (stageWas.current !== 'pending' || stageNow.current !== 'content') return;
    begin();
  }, [awaitingRead, begin]);

  const onPendingLayout = useCallback((height: number, y: number) => {
    // Only while the pending box is the thing on screen — during the arrival it is an
    // overlay, out of the flow, and its `y` would report against a different parent.
    if (phaseRef.current !== 'idle') return;
    pendingH.current = height;
    slotY.current = y;
  }, []);

  const onContentLayout = useCallback(
    (height: number) => {
      if (phaseRef.current !== 'arriving' || !railBeatArmed.current) return;
      railBeatArmed.current = false;
      railLead(height);
    },
    [railLead],
  );

  // Blur FINISHES the arrival (never pauses it — see the header).
  //
  // An EDGE, never a gate, and that is not a shortcut. `useAppActive()` seeds itself from
  // `AppState.currentState`, which is `undefined` under jest and can be `'unknown'` at iOS
  // cold start — so a false reading is available exactly when an owner logs a vomit on a
  // freshly launched app, which is the arrival that matters most. Gating `begin()` on it
  // would trade a bounded, invisible residual (an arrival that starts while backgrounded
  // runs its beats unseen and is closed by the valve within ~510ms) for a silent loss of
  // the moment itself. The transition is trustworthy; the initial value is not.
  useEffect(() => {
    if (!appActive) settle();
  }, [appActive, settle]);

  // The incident under the choreography changed: the beats belonged to a read that is gone.
  const lastIdentity = useRef(identity);
  useEffect(() => {
    if (lastIdentity.current === identity) return;
    lastIdentity.current = identity;
    pendingH.current = null;
    slotY.current = null;
    wasAwaiting.current = awaitingRead;
    if (phaseRef.current !== 'idle') {
      stopAll();
      goIdle();
    }
  }, [identity, awaitingRead, stopAll, goIdle]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopAll();
    };
  }, [stopAll]);

  return {
    phase,
    inFlight: phase === 'arriving',
    heldHeight,
    slotTop,
    values,
    rail:
      phase === 'arriving' && railHeight != null
        ? { height: railHeight, scale: values.railScale, shift: values.railShift }
        : null,
    onPendingLayout,
    onContentLayout,
    noteStage,
  };
}
