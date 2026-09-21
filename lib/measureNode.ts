// Measure a mounted node's frame in WINDOW coordinates (D2-6 · CUL-1069 — the Signal
// chart's flight measures the card's chart on Home and the hero's slot on the screen,
// and the two rects must share one origin: the window, which both full-screen routes
// fill). The sibling of `lib/a11yFocus.ts`: the platform call behind a thin helper, so a
// suite drives the measurement instead of the test renderer (whose host nodes never call
// a `measureInWindow` callback), and so a node that cannot be measured is a NULL rather
// than a callback that never fires — the caller's next step (the push) must not hang on
// a measurement that the platform declined. A callback the platform does not deliver
// within `graceMs` resolves null the same way, once: whichever answer comes first is the
// answer, and a late frame is dropped.

import type { Component } from 'react';

/** Three frames: a measurement that has not answered by then is not coming. */
export const MEASURE_GRACE_MS = 50;

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Measurable = { measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void };

/** Ask the platform for `node`'s window frame. `null` when there is no node, no API, or
 *  no answer inside `graceMs`. `cb` is called exactly once. */
export function measureNodeInWindow(
  node: Component | null | undefined,
  cb: (rect: WindowRect | null) => void,
  graceMs: number = MEASURE_GRACE_MS,
): void {
  const target = node as unknown as Measurable | null | undefined;
  if (!target || typeof target.measureInWindow !== 'function') {
    cb(null);
    return;
  }
  let answered = false;
  const once = (rect: WindowRect | null) => {
    if (answered) return;
    answered = true;
    clearTimeout(grace);
    cb(rect);
  };
  const grace = setTimeout(() => once(null), graceMs);
  target.measureInWindow((x, y, width, height) => once({ x, y, width, height }));
}
