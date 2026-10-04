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
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../../constants/theme';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useSyncStore } from '../../../store/syncStore';
import { HomeSilhouette } from './HomeSilhouette';

/** The silhouette gives way to Home over this long (the mock's `.wait` transition). */
export const COLD_START_CROSSFADE_MS = 320;

export const COLD_START_SILHOUETTE_TEST_ID = 'design-v2-cold-start';

/**
 * The wait's one spoken line (CUL-1224, BRK-30). The silhouette is a shape, so a screen
 * reader met nothing at all, and the empty Home behind it was reachable ("Nothing logged
 * yet today…", the data-loss read B-054 exists to prevent). The night moment's words, the
 * flag-off wait's, without its ellipsis.
 */
export function coldStartSpokenLine(petName: string): string {
  return `Catching up on ${petName}’s history.`;
}

export interface ColdStartSilhouetteProps {
  hydrating: boolean;
  /** The tab bar's height (`TAB_HEIGHT`), from the host — see `HomeSilhouette`. */
  tabBarHeight: number;
  /** Whose record is arriving: the host's active pet (the only pet a cold start reads). */
  petName: string;
}

export function ColdStartSilhouette({ hydrating, tabBarHeight, petName }: ColdStartSilhouetteProps) {
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

  // Said once as the wait opens, on both platforms (there is no live region to pair with:
  // the node is new, and VoiceOver does not read a view it was not moved to).
  // Once per wait: a ref, so an effect that runs again (a re-render with a new name, a
  // development double-invoke) never says it twice.
  const spoken = coldStartSpokenLine(petName);
  const said = useRef(false);
  useEffect(() => {
    if (!hydrating) {
      said.current = false;
      return;
    }
    if (said.current) return;
    said.current = true;
    AccessibilityInfo.announceForAccessibility(spoken);
  }, [hydrating, spoken]);

  if (!mounted) return null;

  return (
    <Animated.View
      testID={COLD_START_SILHOUETTE_TEST_ID}
      style={[styles.fill, { opacity }]}
      pointerEvents={hydrating ? 'auto' : 'none'}
      // While it is the wait, the wait is the screen: one element, one line, and VoiceOver
      // cannot reach the empty Home behind it. On the way out it lets go of both, so the
      // crossfade never traps focus over the Home it is revealing.
      accessible={hydrating}
      accessibilityLabel={hydrating ? spoken : undefined}
      accessibilityViewIsModal={hydrating}
      importantForAccessibility={hydrating ? 'yes' : 'no-hide-descendants'}
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
