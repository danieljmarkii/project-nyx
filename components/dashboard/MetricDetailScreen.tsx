import { useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useColumnWidth } from '../../hooks/useLayoutClass';
import { theme } from '../../constants/theme';
import { Sparkline } from './Sparkline';
import { deltaToneColor } from './cardTokens';
import {
  resolveDeltaTone,
  deltaDirection,
  calibrationLine,
  type Polarity,
} from '../../lib/dashboardCards';
import type { AnalyticsWindow } from '../../lib/analytics';
import { ArrowUp, ArrowDown } from 'lucide-react-native';
// The per-window data contract lives in the pure lib layer (lib → component); re-exported
// here so existing importers (this component's test, the detail route) keep their import.
import type { MetricDetailWindowData } from '../../lib/metricDetail';
import { ThemedText } from '../ui/ThemedText';
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl';
import { STACK_FONT_SCALE } from '../ui/IdentityRow';
export type { MetricDetailWindowData } from '../../lib/metricDetail';

// MetricDetailScreen — a card's "doorway" destination (§4.2 / §8). One metric across a
// Week / Month / 3-Month segmented control (the time range lives HERE, never on the
// dashboard glance surface — §8). Per the §7 summary-led refinement, the "vs your
// baseline" read LEADS — the highest-leverage pattern for non-technical owners (§4.2)
// — with the big number, a no-axes line, and the delta supporting it.
//
// Presentational by design: the caller (the /insights/[metric] route, via the pure
// lib/metricDetail assembler — B-093) computes each window's data from the analytics
// layer and passes it in; this component only renders + owns the segmented control's
// local selection. Below the sample floor a window shows the calibration state (§10),
// never a fabricated line.

// The ranges in their order, on the shared control (CUL-2278).
const WINDOW_OPTIONS: ReadonlyArray<SegmentOption<AnalyticsWindow>> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: '3month', label: '3 Months' },
];

// A sparkline-style band sized for glance legibility, deliberately off the 8pt grid;
// width is derived per-render from the live column (useColumnWidth) so it survives
// rotation rather than being frozen at module load.
const CHART_HEIGHT = 120;

interface Props {
  title: string;
  polarity?: Polarity;
  windows: Record<AnalyticsWindow, MetricDetailWindowData>;
  initialWindow?: AnalyticsWindow;
  petName?: string;
  calibrationUnit?: string;
}

export function MetricDetailScreen({
  title,
  polarity = 'neutral',
  windows,
  initialWindow = 'month',
  petName,
  calibrationUnit = 'sample',
}: Props) {
  const [active, setActive] = useState<AnalyticsWindow>(initialWindow);
  // At the accessibility sizes three ranges cannot share one row (at 320, Week, Month and
  // 3 Months drew over each other), so the shared control stacks them.
  const stacked = useWindowDimensions().fontScale >= STACK_FONT_SCALE;
  const width = useColumnWidth();
  const chartWidth = width - theme.space3 * 4;
  const data = windows[active];
  const state = data.state ?? { kind: 'populated' };

  const tone = resolveDeltaTone({ polarity, delta: data.delta ?? 0, established: data.established });
  const toneColor = deltaToneColor(tone);
  const dir = deltaDirection(data.delta ?? 0);

  return (
    <View style={styles.container}>
      <ThemedText style={styles.title}>{title}</ThemedText>

      <SegmentedControl
        options={WINDOW_OPTIONS}
        value={active}
        onChange={setActive}
        stacked={stacked}
        testID="metric-window"
      />

      {state.kind === 'calibrating' ? (
        <ThemedText style={styles.calibration}>
          {calibrationLine(state.remaining, calibrationUnit, petName)}
        </ThemedText>
      ) : state.kind === 'empty' ? (
        // Zero events this window — a warm "none logged", never styled as an all-clear.
        <ThemedText style={styles.calibration}>{data.emptyMessage ?? 'Nothing logged for this range yet.'}</ThemedText>
      ) : (
        <>
          {/* The "vs your baseline" read leads — the editorial centerpiece (§7). */}
          <ThemedText style={styles.baselineRead}>{data.baselineRead}</ThemedText>

          <View style={styles.numberRow}>
            <ThemedText style={styles.value}>{data.value}</ThemedText>
            {data.delta !== undefined && data.deltaLabel != null && (
              <View style={styles.deltaRow}>
                {dir === 'up' && <ArrowUp size={16} color={toneColor} />}
                {dir === 'down' && <ArrowDown size={16} color={toneColor} />}
                <ThemedText style={[styles.deltaText, { color: toneColor }]}>{data.deltaLabel}</ThemedText>
              </View>
            )}
          </View>

          {data.series.length >= 2 ? (
            <View style={styles.chart}>
              <Sparkline data={data.series} tone={tone} width={chartWidth} height={CHART_HEIGHT} />
            </View>
          ) : (
            <ThemedText style={styles.thinData}>Not enough points yet to draw the shape.</ThemedText>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.space2,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  baselineRead: {
    fontSize: theme.textLG,
    color: theme.colorTextPrimary,
    lineHeight: 24,
    marginTop: theme.space1,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.space2,
  },
  value: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  // The delta yields beside the number, so a long label wraps at 320 rather than running
  // past the screen's edge (CUL-2244).
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  deltaText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    flexShrink: 1,
  },
  chart: {
    marginTop: theme.space1,
  },
  thinData: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  calibration: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginTop: theme.space1,
  },
});
