import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { theme } from '../../constants/theme';
import { Sparkline } from './Sparkline';
import { deltaToneColor } from './cardTokens';
import {
  resolveDeltaTone,
  deltaDirection,
  calibrationLine,
  type Polarity,
  type CardDisplayState,
} from '../../lib/dashboardCards';
import type { AnalyticsWindow } from '../../lib/analytics';
import { ArrowUp, ArrowDown } from 'lucide-react-native';

// MetricDetailScreen — a card's "doorway" destination (§4.2 / §8). One metric across a
// Week / Month / 3-Month segmented control (the time range lives HERE, never on the
// dashboard glance surface — §8). Per the §7 summary-led refinement, the "vs your
// baseline" read LEADS — the highest-leverage pattern for non-technical owners (§4.2)
// — with the big number, a no-axes line, and the delta supporting it.
//
// Presentational by design: the caller (PR 3) computes each window's data from the
// analytics layer and passes it in; this component only renders + owns the segmented
// control's local selection. Below the sample floor a window shows the calibration
// state (§10), never a fabricated line.

const WINDOW_ORDER: AnalyticsWindow[] = ['week', 'month', '3month'];
const WINDOW_UI_LABEL: Record<AnalyticsWindow, string> = {
  week: 'Week',
  month: 'Month',
  '3month': '3 Months',
};

// A sparkline-style band sized for glance legibility, deliberately off the 8pt grid;
// width is derived per-render from the live window (useWindowDimensions) so it survives
// rotation rather than being frozen at module load.
const CHART_HEIGHT = 120;

export interface MetricDetailWindowData {
  /** Pre-formatted big number for this window. */
  value: string;
  /** The chart series. */
  series: number[];
  /** Multi-sample & at/above floor? Gates the verdict colour (§13 #6). */
  established: boolean;
  /** current − prior, for the delta tone + arrow. */
  delta?: number;
  /** Warm delta phrase ("2 fewer than last month"). */
  deltaLabel?: string;
  /** The prominent, warm "vs your baseline" sentence (nyx-voice; caller-computed). */
  baselineRead: string;
  /** Warm copy for the empty state (zero events this window). Used when `state` is
   *  `{ kind: 'empty' }`; a calm default applies if omitted. */
  emptyMessage?: string;
  /** calibrating / empty / populated (§10). Default populated. */
  state?: CardDisplayState;
}

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
  const { width } = useWindowDimensions();
  const chartWidth = width - theme.space3 * 4;
  const data = windows[active];
  const state = data.state ?? { kind: 'populated' };

  const tone = resolveDeltaTone({ polarity, delta: data.delta ?? 0, established: data.established });
  const toneColor = deltaToneColor(tone);
  const dir = deltaDirection(data.delta ?? 0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.segmentedControl} accessibilityRole="tablist">
        {WINDOW_ORDER.map((w) => {
          const isActive = w === active;
          return (
            <Pressable
              key={w}
              onPress={() => setActive(w)}
              hitSlop={6}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={WINDOW_UI_LABEL[w]}
              style={[styles.segment, isActive && styles.segmentActive]}
            >
              <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                {WINDOW_UI_LABEL[w]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {state.kind === 'calibrating' ? (
        <Text style={styles.calibration}>
          {calibrationLine(state.remaining, calibrationUnit, petName)}
        </Text>
      ) : state.kind === 'empty' ? (
        // Zero events this window — a warm "none logged", never styled as an all-clear.
        <Text style={styles.calibration}>{data.emptyMessage ?? 'Nothing logged for this range yet.'}</Text>
      ) : (
        <>
          {/* The "vs your baseline" read leads — the editorial centerpiece (§7). */}
          <Text style={styles.baselineRead}>{data.baselineRead}</Text>

          <View style={styles.numberRow}>
            <Text style={styles.value}>{data.value}</Text>
            {data.delta !== undefined && data.deltaLabel != null && (
              <View style={styles.deltaRow}>
                {dir === 'up' && <ArrowUp size={16} color={toneColor} />}
                {dir === 'down' && <ArrowDown size={16} color={toneColor} />}
                <Text style={[styles.deltaText, { color: toneColor }]}>{data.deltaLabel}</Text>
              </View>
            )}
          </View>

          {data.series.length >= 2 ? (
            <View style={styles.chart}>
              <Sparkline data={data.series} tone={tone} width={chartWidth} height={CHART_HEIGHT} />
            </View>
          ) : (
            <Text style={styles.thinData}>Not enough points yet to draw the shape.</Text>
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
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusSmall,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radiusSmall - 2,
  },
  segmentActive: {
    backgroundColor: theme.colorSurface,
  },
  segmentLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  segmentLabelActive: {
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
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deltaText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
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
    lineHeight: 22,
    marginTop: theme.space1,
  },
});
