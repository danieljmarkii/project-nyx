import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { theme, shadows } from '../../constants/theme';
import { useSnackbarStore } from '../../store/snackbarStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// Tab bar height from app/(tabs)/_layout.tsx — same reference the meal card uses.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 60;

// Root-mounted snackbar overlay (B-005 PR 2). Store-driven (snackbarStore) so it
// survives the dismissal of whatever modal armed it — the food-detail "Remove
// from library" archives, dismisses its own modal, and this appears over the
// Foods tab underneath carrying Undo.
//
// Shares the meal card's dark-card idiom (colorNeutralDark, the same above-the-FAB
// position, the same slide-up spring), so the two transient bottom surfaces read
// as one family. Respects reduced motion with a static frame (no slide), per the
// B-284 motion budget.
export function Snackbar() {
  const { visible, payload, runAction } = useSnackbarStore();
  const reduced = useReducedMotion();

  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      // Static frame: presence toggles opacity only, no motion.
      translateY.setValue(0);
      opacity.setValue(visible ? 1 : 0);
      return;
    }
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: visible ? 0 : 80,
        useNativeDriver: true,
        tension: 80,
        friction: 11,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 180 : 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, reduced, translateY, opacity]);

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
        <Text style={styles.message} numberOfLines={2}>
          {payload.message}
        </Text>
        {hasAction && (
          <TouchableOpacity
            onPress={runAction}
            hitSlop={12}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={payload.actionLabel}
          >
            <Text style={styles.action}>{payload.actionLabel}</Text>
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
    bottom: TAB_BAR_HEIGHT + 64,
    left: theme.space2,
    right: theme.space2,
    zIndex: 50,
    elevation: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    backgroundColor: theme.colorNeutralDark,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    borderRadius: theme.radiusLarge,
    ...shadows.md,
  },
  message: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: theme.textMD,
    color: theme.colorTextOnDark,
    fontWeight: theme.weightRegular,
  },
  // 44pt min touch target (the 3am-test floor) — the label alone is ~15pt.
  actionBtn: {
    minHeight: 44,
    justifyContent: 'center',
  },
  action: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
});
