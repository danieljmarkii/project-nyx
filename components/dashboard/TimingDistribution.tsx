import { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { theme } from '../../constants/theme';
import type { TimingPanelModel } from '../../lib/patternsTiming';
import { ThemedText } from '../ui/ThemedText';

// TimingDistribution — the shared-band dot lane for the Patterns "Timing" panel
// (Signals v2 / B-755 PR 9, CUL-11; spec §4.5). Every TIMEABLE vomit episode is one
// real dot at its TRUE minutes-since-eating, on the `ate · 30m · 1h · 2h · 4h · 8h+`
// axis. Presentational only — the geometry (positions, axis, band edges) is computed
// in lib/patternsTiming and handed in via `model`; this draws it.
//
// The lane width is measured (onLayout) so dots sit at `pos × width`. The axis words
// are rendered as a space-between row: the doubling-grid tick positions are evenly
// spaced by construction (0, 0.2, …, 1.0 — pinned in patternsTiming.test), so
// space-between lands each label under its tick without per-label pixel math.
//
// Daylight ground (record surfaces stay in daylight): a calm neutral lane, the rapid
// and long bands shaded a subtle grey (region grouping, NOT a verdict colour), the
// episode dots in the app's symptom rose. No red/green, no fill that reads as good/bad.

const DOT_SIZE = 7;
const DOT_R = DOT_SIZE / 2;
const ROW_GAP = 10; // px between jitter rows
const JITTER_CAP = 3; // rows above/below centre before density just stacks (bounded height)
const LANE_HEIGHT = 2 * (JITTER_CAP * ROW_GAP + DOT_R) + 8;

interface Props {
  model: TimingPanelModel;
}

export function TimingDistribution({ model }: Props) {
  const [laneWidth, setLaneWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setLaneWidth(e.nativeEvent.layout.width);
  const centerY = LANE_HEIGHT / 2;

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.lane} onLayout={onLayout}>
        {/* Shaded phenotype regions — the rapid head and the long tail. */}
        {laneWidth > 0 && (
          <>
            <View
              style={[
                styles.band,
                { left: 0, width: model.rapidBandEnd * laneWidth },
              ]}
            />
            <View
              style={[
                styles.band,
                {
                  left: model.longBandStart * laneWidth,
                  width: Math.max(0, (1 - model.longBandStart) * laneWidth),
                },
              ]}
            />
            {/* One dot per timeable episode, at its true position + jitter row. */}
            {model.dots.map((d, i) => {
              const row = Math.max(-JITTER_CAP, Math.min(JITTER_CAP, d.jitterRow));
              return (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      left: Math.min(laneWidth - DOT_SIZE, Math.max(0, d.pos * laneWidth - DOT_R)),
                      top: centerY + row * ROW_GAP - DOT_R,
                    },
                  ]}
                />
              );
            })}
          </>
        )}
      </View>
      <View style={styles.axisRow}>
        {model.axis.map((t) => (
          <ThemedText key={t.label} style={styles.axisLabel}>
            {t.label}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lane: {
    height: LANE_HEIGHT,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorSurfaceSubtle,
    overflow: 'hidden',
    position: 'relative',
  },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    // A subtle grey wash to group the rapid/long regions — region grouping, never a
    // verdict colour (no rose/amber that would read "these episodes are the bad ones").
    backgroundColor: theme.colorBorder,
    opacity: 0.5,
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_R,
    backgroundColor: theme.colorEventSymptom,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.space0_5,
  },
  axisLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
});
