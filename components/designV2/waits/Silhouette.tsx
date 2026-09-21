// The silhouette primitive (D2-7 / CUL-1068): a STATIC placeholder block, the round-2
// archive's `.skel .k` — a flat fill, radius, no sweep. Every Design v2 wait is the shape
// of the screen that is coming, built from these; nothing here animates, because the
// tick is the app's one loop (`Tick.tsx`) and a shimmer would be a second. That is why
// this is not `components/ui/Skeleton` (whose sweep is an `Animated.loop`): the one-loop
// guard walks the namespace's import closure and would red on it.
//
// A silhouette is decoration for the eye only. Each frame hides itself from assistive
// tech as one unit, so a screen reader meets the real screen when it lands and never a
// run of nameless blocks (the Skeleton precedent, CUL-575).
import { ReactNode } from 'react';
import { DimensionValue, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '../../../constants/theme';

export interface BlockProps {
  width?: DimensionValue;
  height: number;
  /** Omit for the block radius; a text line passes `LINE_RADIUS`. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** The mock's line radius (`.k.line`), smaller than a block's so a line reads as text. */
export const LINE_RADIUS = 6;

/** One flat placeholder block. */
export function Block({ width = '100%', height, radius = theme.radiusSmall, style }: BlockProps) {
  return <View style={[styles.block, { width, height, borderRadius: radius }, style]} />;
}

/** A text-shaped line. */
export function Line({ width, height = 10, style }: { width: DimensionValue; height?: number; style?: StyleProp<ViewStyle> }) {
  return <Block width={width} height={height} radius={LINE_RADIUS} style={style} />;
}

/** A card-shaped surface the blocks sit in — the real card's fill, border and radius. */
export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

/**
 * The frame every silhouette renders inside: one accessibility unit, hidden. `testID`
 * is how a screen's suite finds the silhouette, since a hidden frame is invisible to
 * the default queries — which is the point.
 */
export function SilhouetteFrame({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID: string;
}) {
  return (
    <View
      testID={testID}
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: theme.colorChartEmpty,
  },
  surface: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    padding: theme.space2,
    gap: theme.space1,
  },
});
