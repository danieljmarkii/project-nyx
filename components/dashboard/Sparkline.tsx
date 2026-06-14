import { View, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { theme } from '../../constants/theme';
import { deltaToneColor } from './cardTokens';
import type { DeltaTone } from '../../lib/dashboardCards';

// Sparkline — a react-native-gifted-charts LineChart wrapper (B-023 PR 2).
//
// Its ONLY job is the SHAPE of the trend (rising / falling / flat) — no axes, no
// gridlines, no labels, no dots, no legend (§4.1 / §4.2 "the background doesn't
// compete"). It pairs with a card's big number; it is never a standalone chart.
//
// Engine note (Expo-Go safety, §13 #5): gifted-charts' LineChart renders purely via
// react-native-svg (already a dependency). The native react-native-linear-gradient
// peer is only require()'d — try/catch-guarded — by a background-gradient wrapper this
// solid-colour line path never imports. So this is Expo-Go / managed-workflow safe.

interface Props {
  /** The series. A sparkline needs ≥2 points to be a line; fewer renders nothing (the
   *  card owns the calibration/empty state — never a fabricated flat line, §10). */
  data: number[];
  /** Line colour follows the verdict tone (§13 #6). Omitted → a muted neutral line. */
  tone?: DeltaTone;
  /** Explicit colour override (e.g. the accent trend line on a detail screen). */
  color?: string;
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 88;
const DEFAULT_HEIGHT = 32;

export function Sparkline({ data, tone, color, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT }: Props) {
  if (data.length < 2) return null;

  const lineColor = color ?? (tone ? deltaToneColor(tone) : theme.colorTextTertiary);
  const points = data.map((value) => ({ value }));

  return (
    <View style={[styles.wrap, { width, height }]} testID="sparkline" pointerEvents="none">
      <LineChart
        data={points}
        width={width}
        height={height}
        thickness={2}
        color={lineColor}
        // Strip every chrome element — shape only.
        hideAxesAndRules
        hideYAxisText
        hideDataPoints
        hideRules
        xAxisThickness={0}
        yAxisThickness={0}
        yAxisLabelWidth={0}
        disableScroll
        adjustToWidth
        initialSpacing={2}
        endSpacing={2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
});
