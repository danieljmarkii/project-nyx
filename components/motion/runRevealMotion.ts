// A run that opens out of sight moves the list just far enough to show its first meal
// (CUL-1735, D3 ruled 2026-10-10; design authority `docs/culprit-run-open-mockups.html` §05,
// the right-hand phone, and §07 D3). GAP-8 said "opening never scrolls the list", to keep
// the owner's place; the ruling keeps that protection by a BOUND: the line the owner tapped
// never leaves the screen.
//
// THE RULE:
//   • only on an open (a fresh one: never a close, never a reversal mid-flight, at most once
//     per open), and only when the first meal's resting bottom would sit under the plus or
//     below the list's visible bottom;
//   • the list moves by the SMALLER of two distances: what shows the first meal clear of the
//     plus, and what keeps the run's own line on screen (its top `marginPt` below the list's
//     top). Under `minMovePt` it does not move;
//   • `animated: !reducedMotionNow()` at the moment of the scroll, so under Reduce Motion it
//     is a jump (`guards/programmaticScroll.test.ts`);
//   • VoiceOver focus stays on the run: nothing here moves focus.
//
// WHO OWNS WHAT: the run reports where its first meal will REST (a measure the list calls);
// the list owns the scroll. Both in window coordinates, so neither needs the other's frame.
//
// WHEN: a scroll fired before the content has grown clamps short (a run at the foot of
// Home's list has nothing below it yet). Under the run's layout animation Fabric commits the
// final layout at once and animates the frames, so the scroll content grows on that commit;
// the host fires on the growth (`onContentSizeChange`), a frame later so the meals' own
// layout reports have landed, and a fallback timer covers a growth the host never hears.
//
// NO HAPTIC: this rides the day's list, which paints `worth_a_call`.

import { createContext, useCallback, useEffect, useRef } from 'react';
import { theme } from '../../constants/theme';
import { FAB_BOTTOM, FAB_DISC } from '../../lib/fanBudget';
import { RUN_MOTION } from './runOpenMotion';

export const RUN_REVEAL = {
  /** The run's top never rises above this far below the list's top. */
  marginPt: theme.space3,
  /** The first meal's foot stands this far clear of the plus. */
  plusGapPt: theme.space1,
  /** Below this the list does not move: a nudge of a point or two reads as a twitch. */
  minMovePt: 2,
  /** The latest the host waits for the content to grow: the box's own delay and a frame
   *  past it (the growth lands on the box's commit, never after its keyframe starts). */
  fallbackMs: RUN_MOTION.boxDelayMs + RUN_MOTION.mountFrameMs * 2,
  /** How far the plus's top sits above the screen's foot (`components/log/FAB.tsx`). */
  plusRisePt: FAB_BOTTOM + FAB_DISC,
} as const;

export interface RunRevealGeometry {
  /** The run's header top, window y. */
  runTop: number;
  /** The first meal's bottom at rest, window y. */
  mealBottom: number;
  /** The list's visible window, window y. */
  viewTop: number;
  viewBottom: number;
  /** The plus's top, window y. */
  plusTop: number;
}

/**
 * How far the list moves, in pt, ≥ 0. Zero when the first meal already shows clear of the
 * plus; otherwise the smaller of what shows it and what keeps the run's top `marginPt` under
 * the list's top; zero under `minMovePt`.
 */
export function runRevealDistance(g: RunRevealGeometry): number {
  const visibleBottom = Math.min(
    g.viewBottom,
    g.plusTop - RUN_REVEAL.plusGapPt,
  );
  const toShow = g.mealBottom - visibleBottom;
  if (!(toShow > 0)) return 0;
  // THE BOUND: the run's own line stays on screen.
  const room = g.runTop - (g.viewTop + RUN_REVEAL.marginPt);
  const d = Math.min(toShow, Math.max(0, room));
  return d >= RUN_REVEAL.minMovePt ? d : 0;
}

/** The run's half: measure itself, at rest, in window coordinates. */
export type RunRevealMeasure = (
  done: (run: { runTop: number; mealBottom: number }) => void,
) => void;

/** What the list hands its runs: ask for one reveal; the return cancels it if it has not fired. */
export type RequestRunReveal = (measure: RunRevealMeasure) => () => void;

/** Null outside a host that owns a scroll (the Patterns month, a test): the run asks nobody. */
export const RunRevealContext = createContext<RequestRunReveal | null>(null);

interface HostParams {
  /** The list's visible frame, window y. */
  measureViewport: (done: (top: number, bottom: number) => void) => void;
  /** What covers the list's top edge (History's sticky day header): the run's line must stay
   *  clear of it, not merely inside the scroll view's frame. Zero where nothing is pinned. */
  topInset?: () => number;
  /** Move the list down by `dy` from where it is (the host reads its own offset). */
  scrollBy: (dy: number) => void;
  /** The screen's height, for the plus's top. */
  windowHeight: () => number;
}

/**
 * The list's half. One reveal pending at a time (a newer open replaces it); it fires once,
 * on the content's growth or the fallback, whichever is first.
 */
export function useRunRevealHost({
  measureViewport,
  topInset,
  scrollBy,
  windowHeight,
}: HostParams): {
  request: RequestRunReveal;
  onContentSizeChange: (w: number, h: number) => void;
  /** The owner has taken the list (a drag): a reveal not yet fired never lands. */
  cancel: () => void;
} {
  const params = useRef({ measureViewport, topInset, scrollBy, windowHeight });
  params.current = { measureViewport, topInset, scrollBy, windowHeight };
  const pending = useRef<{
    measure: RunRevealMeasure;
    timer: ReturnType<typeof setTimeout>;
    live: { on: boolean };
  } | null>(null);
  const lastH = useRef<number | null>(null);
  /** The newest request's switch, kept past its firing so a drag stops a measure in flight. */
  const latest = useRef<{ on: boolean } | null>(null);

  const fire = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    clearTimeout(p.timer);
    p.measure((run) => {
      if (!p.live.on) return;
      params.current.measureViewport((viewTop, viewBottom) => {
        if (!p.live.on) return;
        p.live.on = false;
        const d = runRevealDistance({
          ...run,
          viewTop: viewTop + (params.current.topInset?.() ?? 0),
          viewBottom,
          plusTop: params.current.windowHeight() - RUN_REVEAL.plusRisePt,
        });
        if (d > 0) params.current.scrollBy(d);
      });
    });
  }, []);

  const request = useCallback<RequestRunReveal>(
    (measure) => {
      if (pending.current) {
        pending.current.live.on = false;
        clearTimeout(pending.current.timer);
      }
      const live = { on: true };
      if (latest.current) latest.current.on = false;
      latest.current = live;
      pending.current = {
        measure,
        live,
        timer: setTimeout(fire, RUN_REVEAL.fallbackMs),
      };
      return () => {
        live.on = false;
        if (pending.current?.live === live) {
          clearTimeout(pending.current.timer);
          pending.current = null;
        }
      };
    },
    [fire],
  );

  const onContentSizeChange = useCallback(
    (_w: number, h: number) => {
      const grew = lastH.current != null && h > lastH.current;
      lastH.current = h;
      // A frame later, so the meals' layout reports (the first meal's height) have landed.
      if (grew && pending.current) requestAnimationFrame(fire);
    },
    [fire],
  );

  const cancel = useCallback(() => {
    if (latest.current) latest.current.on = false;
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return { request, onContentSizeChange, cancel };
}
