// The chart family's DRAW IN (Design v2 — the whole day, D2-1 · CUL-1064; design
// authority `docs/culprit-design-v4-mockups.html` §03/§04, the `.drawin` / `.drawin-x` /
// `.drawin-dot` transitions, every number below verbatim from that page's CSS).
//
// One of the six gestures the Motion Designer allows the app (`docs/personas.md` §
// Specialist lenses): a chart draws ITSELF in — the marks first, the words a beat later.
// Bars rise from their baseline with a per-bar stagger; the compare's bars extend from
// their left edge; dots pop in a stagger, each growing INTO its own size. The labels land
// after the last mark has settled, never with it, so the eye meets the shape before it
// meets the numbers.
//
// C-30, THE THIRD TIME: a shared choreography lives in `components/motion/`, and this is
// the fold's vocabulary one surface over. The label landing is the fold's own
// `landMs` on the fold's own curve; what this module adds is the per-mark stagger and the
// three from-states, written down once here rather than restated in five charts.
//
// ONE ENGINE, and the split is the reason. Nothing here moves GEOMETRY — a drawing-in bar
// has the same box before and after, only its transform changes — so there is no
// `LayoutAnimation` anywhere in this file, and every value runs on the NATIVE driver.
// That is also why a chart hands the origin of the transform to the STATIC style
// (`DRAW_IN_ORIGIN`) rather than animating a translate to fake it: on Fabric a layout
// keyframe re-commits a view's props when it ends (the fold's header), and a chart that
// sits in a card whose HEIGHT animates (the Signal's screen rising) must not be carrying a
// transform that a layout commit can snap back. A pure transform on a node whose frame
// never changes is safe through any layout commit around it.
//
// THE TRIGGER IS A FACT, NEVER THE PRESENTATION (C-30). `drawIn` means "this chart just
// arrived on screen for this reader" — the caller switches it on for the Signal screen's
// first frame, the month's chart after a page turn, a card's first mount — and it re-arms
// on an `identity` change (a new month, a new finding). A re-render for any other reason
// (a sync tick, a store update, a rotation) does not replay: a chart the owner is reading
// must not redraw itself under their eyes.
//
// REDUCED MOTION is the static frame: every value sits at its end state and nothing is
// started. It is not a shortened animation and not a missing label.
//
// APP BLUR FINISHES, NEVER PAUSES (the fold's rule): a draw cut by a blur is committed at
// its end state, so the owner never returns to a chart half-drawn — and a native-driver
// animation never writes its final value back to JS, so every completion PINS it (the
// fold's `rest()`), or a later re-render would commit the seed.

import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { FOLD_MOTION } from './foldMotion';

/** The beats, in ms and scale — the mock's CSS, verbatim. */
export const DRAW_IN_MOTION = {
  /** A weekly bar rises from its baseline. */
  barMs: 420,
  /** Each bar starts this long after the one to its left. */
  barStaggerMs: 40,
  /** The bar's seed scale — a hairline at the baseline, never a hidden bar. */
  barFromScale: 0.02,
  /** The counts and dates land this long after the first bar starts. */
  barLabelDelayMs: 480,
  /** A compare bar extends from its left edge. */
  compareMs: 420,
  compareStaggerMs: 120,
  compareFromScale: 0.01,
  compareLabelDelayMs: 380,
  /** A dot grows INTO its own size (the pop), while it fades in over a shorter beat. */
  dotMs: 300,
  dotFadeMs: 200,
  dotStaggerMs: 28,
  dotFromScale: 0.1,
  dotLabelDelayMs: 420,
  /** Every label lands over the fold's own `landMs`, on the fold's curve. */
  labelMs: FOLD_MOTION.landMs,
} as const;

/** A mark's kind decides which transform draws it and where its origin is. */
export type DrawInKind = 'bars' | 'compare' | 'dots';

/**
 * The static transform origin a chart puts on each mark's `Animated.View`. It is a STYLE,
 * not a value, and it lives here so the origin and the transform it belongs to are
 * written in one place: a bar scaled about its centre would rise from its middle, which
 * is not a bar rising.
 */
export const DRAW_IN_ORIGIN: Readonly<Record<DrawInKind, 'bottom' | 'left' | 'center'>> = {
  bars: 'bottom',
  compare: 'left',
  dots: 'center',
};

/** The mock's `cubic-bezier(.2,.8,.2,1.02)` — one felt settle past 1, never a bounce. */
const MARK_EASE = Easing.bezier(0.2, 0.8, 0.2, 1.02);
/** The dot pop: `cubic-bezier(.2,.8,.2,1.05)`. */
const DOT_EASE = Easing.bezier(0.2, 0.8, 0.2, 1.05);

export interface MarkStyle {
  opacity: Animated.Value;
  transform: ({ scaleY: Animated.Value } | { scaleX: Animated.Value } | { scale: Animated.Value })[];
}

export interface DrawIn {
  /** The `Animated.View` style for mark `i` (a bar, a compare bar, a dot). Stable across
   *  renders for a given index. */
  markStyle: (i: number) => MarkStyle;
  /** The style for every label on the chart — the counts, the dates, the disclosure. */
  labelStyle: { opacity: Animated.Value };
  /** True while a draw is in flight (a test hook and a caller's "don't measure yet"). */
  inFlight: () => boolean;
}

interface Params {
  kind: DrawInKind;
  /** How many marks the chart draws. The hook keeps a value per mark. */
  count: number;
  /** The FACT: this chart just arrived for this reader. */
  drawIn: boolean;
  /** What the chart is drawing — a change re-arms the draw while `drawIn` holds. */
  identity: string;
  reducedMotion: boolean;
  appActive: boolean;
}

/** Per-kind seed and beats, so the effect below is one loop rather than three. */
function beatsFor(kind: DrawInKind): { fromScale: number; ms: number; stagger: number; labelDelay: number } {
  switch (kind) {
    case 'bars':
      return {
        fromScale: DRAW_IN_MOTION.barFromScale,
        ms: DRAW_IN_MOTION.barMs,
        stagger: DRAW_IN_MOTION.barStaggerMs,
        labelDelay: DRAW_IN_MOTION.barLabelDelayMs,
      };
    case 'compare':
      return {
        fromScale: DRAW_IN_MOTION.compareFromScale,
        ms: DRAW_IN_MOTION.compareMs,
        stagger: DRAW_IN_MOTION.compareStaggerMs,
        labelDelay: DRAW_IN_MOTION.compareLabelDelayMs,
      };
    case 'dots':
      return {
        fromScale: DRAW_IN_MOTION.dotFromScale,
        ms: DRAW_IN_MOTION.dotMs,
        stagger: DRAW_IN_MOTION.dotStaggerMs,
        labelDelay: DRAW_IN_MOTION.dotLabelDelayMs,
      };
  }
}

export function useDrawIn({ kind, count, drawIn, identity, reducedMotion, appActive }: Params): DrawIn {
  // One (scale, opacity) pair per mark, grown on demand and never shrunk: a mark that
  // leaves the chart just stops being read. Kept in a ref so a mark's style object is
  // the same object across renders (a new `Animated.Value` per render would detach the
  // native node from the value mid-draw).
  const scales = useRef<Animated.Value[]>([]);
  const opacities = useRef<Animated.Value[]>([]);
  const labelOpacity = useRef(new Animated.Value(1)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const flying = useRef(false);
  const drawn = useRef<string | null>(null);
  const reduced = useRef(reducedMotion);
  reduced.current = reducedMotion;

  const ensure = useCallback((n: number) => {
    while (scales.current.length < n) {
      scales.current.push(new Animated.Value(1));
      opacities.current.push(new Animated.Value(1));
    }
  }, []);
  ensure(count);

  /** Every value at its end state, un-animated, and nothing in flight. */
  const settle = useCallback(() => {
    running.current?.stop();
    running.current = null;
    flying.current = false;
    for (const v of scales.current) v.setValue(1);
    for (const v of opacities.current) v.setValue(1);
    labelOpacity.setValue(1);
  }, [labelOpacity]);

  useEffect(() => {
    if (!drawIn) return;
    // The FACT plus the identity: the same chart re-rendering is not a second arrival.
    if (drawn.current === identity) return;
    drawn.current = identity;
    if (reduced.current) {
      settle();
      return;
    }
    running.current?.stop();
    const { fromScale, ms, stagger, labelDelay } = beatsFor(kind);
    const n = Math.min(count, scales.current.length);
    const marks: Animated.CompositeAnimation[] = [];
    for (let i = 0; i < n; i++) {
      scales.current[i].setValue(fromScale);
      const beats: Animated.CompositeAnimation[] = [
        Animated.timing(scales.current[i], {
          toValue: 1,
          duration: ms,
          delay: i * stagger,
          easing: kind === 'dots' ? DOT_EASE : MARK_EASE,
          useNativeDriver: true,
        }),
      ];
      if (kind === 'dots') {
        // A dot fades in over a shorter beat than its pop, so it is visible before it
        // has finished growing — the mock's `opacity 200ms ease-out`.
        opacities.current[i].setValue(0);
        beats.push(
          Animated.timing(opacities.current[i], {
            toValue: 1,
            duration: DRAW_IN_MOTION.dotFadeMs,
            delay: i * stagger,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        );
      }
      marks.push(Animated.parallel(beats));
    }
    labelOpacity.setValue(0);
    const anim = Animated.parallel([
      ...marks,
      Animated.timing(labelOpacity, {
        toValue: 1,
        duration: DRAW_IN_MOTION.labelMs,
        delay: labelDelay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    running.current = anim;
    flying.current = true;
    anim.start(({ finished }) => {
      // `finished: false` is a stop (blur, re-arm, unmount) — whoever stopped it owns the
      // end state. A finished draw pins every value (the native driver never writes back).
      if (finished) settle();
    });
    return () => {
      running.current?.stop();
      running.current = null;
      flying.current = false;
    };
  }, [drawIn, identity, kind, count, labelOpacity, settle]);

  // Blur FINISHES: the chart is where it was going, committed un-animated.
  useEffect(() => {
    if (!appActive) settle();
  }, [appActive, settle]);

  // Reduced motion switched on mid-draw: the static frame, now.
  useEffect(() => {
    if (reducedMotion) settle();
  }, [reducedMotion, settle]);

  const markStyle = useCallback(
    (i: number): MarkStyle => {
      ensure(i + 1);
      const scale = scales.current[i];
      const transform: MarkStyle['transform'] =
        kind === 'bars' ? [{ scaleY: scale }] : kind === 'compare' ? [{ scaleX: scale }] : [{ scale }];
      return { opacity: opacities.current[i], transform };
    },
    [kind, ensure],
  );

  return {
    markStyle,
    labelStyle: { opacity: labelOpacity },
    inFlight: () => flying.current,
  };
}
