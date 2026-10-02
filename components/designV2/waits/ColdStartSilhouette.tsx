// The cold start behind `design_v2` (D2-7 / CUL-1068): Home's silhouette, then Home.
//
// Shown by `ColdStartOverlay` under the same trigger discipline as the night moment it
// replaces flag-on (B-054 §6: only the first hydration of an EMPTY local store, only
// once a pet exists so it can never sit over onboarding). What differs is the exit:
// no minimum hold and no dissolve to black — the silhouette IS the screen's shape, so
// it crossfades into the real Home over `COLD_START_CROSSFADE_MS` (the round-2 archive's
// `.wait` transition, 320ms ease-out) and the record fills the shape. Reduced motion is
// a cut. It fills its parent (the app root), above the Stack and the toast layers, and
// blocks taps while it is the wait.
//
// THE HANDOFF (the issue's "no double play"). Home mounts BEHIND this overlay, so a chart
// that armed its draw-in on its own first render would play it unseen, and the hydration
// tick that follows would re-arm it — two plays, the second under the owner's eyes. So
// the instant the crossfade begins, this component bumps `syncStore.coldStartHandoff`,
// ONCE per cold start; that tick is the FACT D2-4's Home arms its draw-in on (C-30), and
// its change is what makes the chart draw as the shape gives way — one play, ≤ the
// crossfade after the store hydrates. Pinned in ColdStartSilhouette.test.tsx: exactly
// one bump per true → false edge, none when the silhouette never showed.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../../constants/theme';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useSyncStore } from '../../../store/syncStore';
import { HomeSilhouette } from './HomeSilhouette';

/** The silhouette gives way to Home over this long (the mock's `.wait` transition). */
export const COLD_START_CROSSFADE_MS = 320;

export const COLD_START_SILHOUETTE_TEST_ID = 'design-v2-cold-start';

export interface ColdStartSilhouetteProps {
  hydrating: boolean;
  /** The tab bar's height (`TAB_HEIGHT`), from the host — see `HomeSilhouette`. */
  tabBarHeight: number;
}

export function ColdStartSilhouette({ hydrating, tabBarHeight }: ColdStartSilhouetteProps) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const bumpColdStartHandoff = useSyncStore((s) => s.bumpColdStartHandoff);
  const [mounted, setMounted] = useState(hydrating);
  const opacity = useRef(new Animated.Value(hydrating ? 1 : 0)).current;
  // Whether the silhouette is currently up — the handoff fires only on the way OUT of a
  // wait that was actually shown, never on a `false` the overlay mounted with.
  const shown = useRef(hydrating);

  useEffect(() => {
    if (hydrating) {
      shown.current = true;
      setMounted(true);
      opacity.setValue(1);
      return;
    }
    if (!shown.current) return;
    shown.current = false;
    bumpColdStartHandoff();
    if (reduced) {
      opacity.setValue(0);
      setMounted(false);
      return;
    }
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: COLD_START_CROSSFADE_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => fade.stop();
  }, [hydrating, reduced, opacity, bumpColdStartHandoff]);

  if (!mounted) return null;

  return (
    <Animated.View
      testID={COLD_START_SILHOUETTE_TEST_ID}
      style={[styles.fill, { opacity }]}
      pointerEvents={hydrating ? 'auto' : 'none'}
    >
      <HomeSilhouette topInset={insets.top} tabBarHeight={tabBarHeight} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorNeutralLight,
    // Above the Stack / Toast layers — the night moment's takeover z, kept.
    zIndex: 100,
  },
});
