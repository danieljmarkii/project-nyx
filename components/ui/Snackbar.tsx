import { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { theme, shadows } from '../../constants/theme';
import { useSnackbarStore } from '../../store/snackbarStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { COMPLETION_MOTION, EASE } from '../motion/completionMotion';

// The bar's real height, imported rather than re-derived: this file used to carry
// its own `Platform.OS === 'ios' ? 80 : 60` sourced by comment from
// app/(tabs)/_layout.tsx, which stopped defining it (CUL-599) — and the bar has
// since grown. The card must clear the bar so it is not occluded when the owner
// lands back on a tabs screen after a log.
import { TAB_HEIGHT } from '../nav/NyxTabBar';
import { ThemedText } from './ThemedText';

// Root-mounted snackbar overlay (B-005 PR 2). Store-driven (snackbarStore) so it
// survives the dismissal of whatever modal armed it — the food-detail "Remove
// from library" archives, dismisses its own modal, and this appears over the
// Foods tab underneath carrying Undo.
//
// Shares the completion cards' daylight ground (colorSurface lifted by shadows.lg, no
// outline, CUL-1691 PR 1), the same above-the-FAB position and the card's entry and
// exit (CUL-1691 PR 4, spec §2.3), so the two transient bottom surfaces read as one
// family. Entry: opacity 0 → 1 over `groundInMs` while it rises `riseFromPt` on the
// card's `riseSpring`. Exit: opacity 1 → 0 and a drift of `exitDriftPt` over `exitMs`,
// silent. Reduce Motion: an opacity crossfade over `crossfadeMs` in, opacity alone out,
// nothing translates. Every number is `COMPLETION_MOTION`'s, imported, never retyped
// (C-30); the card's arrival hook is not reused because the Snackbar has no mark, no
// words beat and no halo, only the ground's two beats.
//
// The ground is OPAQUE on purpose: iOS traces a layer shadow off the composite alpha,
// so a translucent card would grain its own shadow (#1125). The shadow sits on `card`,
// never on the transparent `wrapper` (Snackbar.test.tsx pins both).
export function Snackbar() {
  const { visible, payload, runAction } = useSnackbarStore();
  const reduced = useReducedMotion();

  // The rise and the drift are two values summed, as on the card: an exit that starts
  // mid-rise stops the rise where it stands and drifts from there, never snapping.
  const rise = useRef(new Animated.Value(COMPLETION_MOTION.riseFromPt)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(Animated.add(rise, drift)).current;
  const live = useRef<Animated.CompositeAnimation | null>(null);
  const wasVisible = useRef(false);

  // Edges only: the first render with nothing shown animates nothing, and a second
  // `show()` over a visible Snackbar swaps the words without replaying the entry.
  useEffect(() => {
    if (visible === wasVisible.current) return;
    wasVisible.current = visible;
    live.current?.stop();
    const M = COMPLETION_MOTION;
    let a: Animated.CompositeAnimation;
    if (visible) {
      // An entry over a mid-exit Snackbar starts from its first frame.
      opacity.setValue(0);
      drift.setValue(0);
      if (reduced) {
        rise.setValue(0);
        a = Animated.timing(opacity, { toValue: 1, duration: M.crossfadeMs, useNativeDriver: true });
      } else {
        rise.setValue(M.riseFromPt);
        a = Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1, duration: M.groundInMs, easing: EASE.fade, useNativeDriver: true,
          }),
          Animated.spring(rise, { toValue: 0, useNativeDriver: true, ...M.riseSpring }),
        ]);
      }
    } else {
      const fade = Animated.timing(opacity, {
        toValue: 0, duration: M.exitMs, easing: EASE.exit, useNativeDriver: true,
      });
      a = reduced
        ? fade
        : Animated.parallel([
            fade,
            Animated.timing(drift, {
              toValue: M.exitDriftPt, duration: M.exitMs, easing: EASE.exit, useNativeDriver: true,
            }),
          ]);
    }
    live.current = a;
    a.start();
  }, [visible, reduced, rise, drift, opacity]);

  useEffect(() => () => live.current?.stop(), []);

  // Keep the last payload mounted through the dismiss fade (the store preserves it
  // on hide). Nothing to render before the first show.
  if (!payload) return null;

  const hasAction = !!payload.actionLabel && !!payload.onAction;

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.wrapper, { opacity, transform: [{ translateY }] }]}
    >
      <View style={styles.card}>
        <ThemedText style={styles.message} numberOfLines={2}>
          {payload.message}
        </ThemedText>
        {hasAction && (
          <TouchableOpacity
            onPress={runAction}
            hitSlop={12}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={payload.actionLabel}
          >
            <ThemedText style={styles.action}>{payload.actionLabel}</ThemedText>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Above the FAB (bottom-right), matching the meal card's clearance so the Undo
  // action never sits under the floating button.
  wrapper: {
    position: 'absolute',
    bottom: TAB_HEIGHT + 64,
    left: theme.space2,
    right: theme.space2,
    zIndex: 50,
    elevation: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    // Opaque, under the shadow (see the header).
    backgroundColor: theme.colorSurface,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    borderRadius: theme.radiusLarge,
    ...shadows.lg,
  },
  message: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    fontWeight: theme.weightRegular,
  },
  // 44pt min touch target (the 3am-test floor) — the label alone is ~15pt.
  actionBtn: {
    minHeight: 44,
    justifyContent: 'center',
  },
  action: {
    fontSize: theme.textMD,
    // The ink, on the white ground: 5.17:1 (the bright colorAccent would be 2.26:1).
    color: theme.colorAccentInk,
    fontWeight: theme.weightMedium,
  },
});
