// The breathing tick — the app's ONE looping motion behind `design_v2` (Design v2 — the
// whole day, D2-7 / CUL-1068; design authority `docs/culprit-design-v4-mockups.html` §07,
// the Principle 9 carve-out; drawn in the round-2 archive §06).
//
// "Chrome never moves on its own — except the one tick, while the app is working on the
// pet's behalf." That is the whole contract, and each clause is a line below:
//
//   • WHILE THE APP IS WORKING: `working` is the only prop that decides whether the tick
//     exists, and it is a REQUEST's fact — the analysis section's `working`, the report
//     screen's `regenerating` — never a boolean a caller invents to "show a spinner". The
//     round-4 test: if the loop is on screen, name the request it is waiting on. With
//     `working` false the tick renders NOTHING; a still mark that is not waiting on
//     anything is the caller's own View (the incident card's pending tick), not this.
//   • THE ONE LOOP: `guards/designV2OneLoop.test.ts` walks the namespace and its import
//     closure for `Animated.loop` and expects to find exactly this file.
//   • ITS SHAPE: 3pt wide, 16pt tall — the rail's own tick (`RAIL_WIDTH` /
//     `RAIL_TICK_HEIGHT` in `components/event/IncidentReadCard.tsx`), because the tick is
//     the mark an arrival grows into: where a read lands, this becomes the rail of the
//     thing it was waiting for. Grey (`colorBorderStrong`, the mock's #D4D4D4) — one
//     tone. The round-2 demo drew a teal "routine work" variant; it is not built:
//     bundle A measured `colorAccent` at 2.17:1 / 2.26:1 on Home's two grounds, under
//     the 3:1 glyph floor.
//   • THE BREATH: opacity 1 → 0.35 → 1 over 1400ms on an ease-in-out, native driver.
//   • REDUCED MOTION: still, at FULL opacity — a dimmed still tick would read as
//     disabled (C-7's "dimmed" is a claim).
//   • APP BLUR: the loop stops and the value is pinned at 1, so a native-driver loop
//     never ticks on the UI thread while backgrounded (B-284 §1.5) and the owner never
//     returns to a half-faded mark.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../../../constants/theme';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useAppActive } from '../../../hooks/useAppActive';
import { TICK_BREATH } from '../../motion/arrivalMotion';

/**
 * The tick, written down (the Motion Designer's durations). The breath's two numbers
 * are the arrival's `TICK_BREATH` — D2-4's node breathes its tick through the arrival's
 * own value (so it can become the rail), and the same question has one answer (C-34):
 * a second constant here would be the mirrored-constant trap the moment either moved.
 */
export const TICK_MOTION = {
  /** The rail's width — the tick IS a length of rail. */
  width: 3,
  /** The rail's pending tick height (`RAIL_TICK_HEIGHT`). */
  height: 16,
  radius: 2,
  /** One full breath, in and out. */
  breathMs: TICK_BREATH.cycleMs,
  /** The trough of the breath; the crest is full opacity. */
  restOpacity: TICK_BREATH.lowOpacity,
} as const;

export interface TickProps {
  /** A request is in flight. THE request's own flag — never a boolean the caller invents. */
  working: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Tick({ working, style, testID = 'design-v2-tick' }: TickProps) {
  const reduced = useReducedMotion();
  const active = useAppActive();
  const breathe = working && !reduced && active;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!breathe) {
      opacity.setValue(1);
      return;
    }
    const half = TICK_MOTION.breathMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: TICK_MOTION.restOpacity,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      // A native-driver animation never writes back to JS (the fold's `rest()` rule), so
      // the value is pinned by hand or a later commit would seed mid-breath.
      opacity.setValue(1);
    };
  }, [breathe, opacity]);

  if (!working) return null;

  return (
    <Animated.View
      testID={testID}
      style={[styles.tick, { opacity }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  tick: {
    width: TICK_MOTION.width,
    height: TICK_MOTION.height,
    borderRadius: TICK_MOTION.radius,
    backgroundColor: theme.colorBorderStrong,
    flexShrink: 0,
  },
});
