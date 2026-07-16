import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle, DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, shadows } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';

// Tier-1 loading (B-284 §5): content-shaped shimmer placeholders for waits under
// ~1s (the local-SQLite reads behind Patterns, History, detail screens). The shape
// of what's coming reads faster than a spinner, so NO Whorl at this duration.
//
// The shimmer is an opaque [base → sheen → base] gradient band the width of the
// block, translated left→right on a native-driver loop — no rgba, tokens only. The
// block's own base fill matches the gradient's edges, so the sweep is seamless.
// Motion budget (§1.5): native-driver transform, paused on blur, and under
// reduced-motion the block renders as a plain static placeholder (no sweep).

const SWEEP_MS = 1300;

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 12, radius = theme.radiusXS, style }: SkeletonProps) {
  const reduced = useReducedMotion();
  const active = useAppActive();
  const animate = !reduced && active;
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate || w === 0) {
      x.setValue(0);
      return;
    }
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: SWEEP_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, w, x]);

  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-w, w] });

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[styles.base, { width, height, borderRadius: radius }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {animate && w > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={[theme.colorChartEmpty, theme.colorSurface, theme.colorChartEmpty]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

// A card-shaped placeholder for a dashboard/list surface (Patterns, detail): the
// elevated surface + a label line, a big-number block, and a wide trend line —
// the MetricCard silhouette, so the swap-in doesn't shift layout.
export function SkeletonCard({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, style]}>
      <Skeleton width="38%" height={11} />
      <Skeleton width="30%" height={22} style={{ marginTop: theme.space2 }} />
      <Skeleton width="100%" height={11} style={{ marginTop: theme.space3 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    ...shadows.md,
  },
});
