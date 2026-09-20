import { useState } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { theme } from '../../constants/theme';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { lanesUntimedLine, type LaneAxis, type LaneModel } from '../../lib/chartModels';
import { LANE_GEOMETRY, LANE_HEIGHT_PT } from '../../lib/patternsTiming';
import { lanesBucketCaption, timingLanesA11yLabel } from '../../lib/chartCopy';
import { ThemedText } from '../ui/ThemedText';
import { useDrawIn } from '../motion/drawInMotion';

// TimingLanes — the shipped "timed from meals" lane as small multiples on one axis
// (CUL-1064; design authority `docs/culprit-design-v4-mockups.html` §03, the `lane()`
// drawing). Before the trial and in it, each lane with its own dots, its three bucket
// counts and its "N timed of M"; one axis under the last lane; and ONE untimed line for
// the chart, rendered here from the counts. It is the §05 bar itself, drawn twice:
//
//   a mark per fact ........ a dot per timed episode, at its TRUE minutes
//   a count on every mark .. the three bucket counts under each lane
//   the denominator ........ "13 timed of 19", at the right of each lane
//   the uncounted .......... "6 + 14 episodes couldn't be timed — they aren't on the lanes"
//   the window named ....... each lane's label
//
// THE UNTIMED LINE CANNOT BE OMITTED. There is no prop for it: the component derives it
// from each lane's `total − timed` and renders it every time, at zero included. Dr. Chen's
// falsification for this chart — seven of seven in-trial episodes under 30 minutes with
// fourteen untimed — reads "all rapid on rabbit" the moment that line is optional, so it
// is not a prop a caller can forget. The type test pins the prop's absence.
//
// GEOMETRY IS THE SHIPPED PANEL'S, NEVER RE-DERIVED: the dot's `pos` is `patternsTimingPos`
// and its `jitterRow` is `assignJitterRows`, both computed in `lib/chartModels.ts`
// (`laneDots`); the axis words and the band edges are `timingLanesAxis`. The dot size,
// row gap and jitter cap are `TimingDistribution`'s numbers, so a dot on the Signal's
// screen sits where the same episode sits on Patterns.
//
// Daylight ground (the shipped lane's rule): a calm neutral lane, the rapid head and the
// long tail shaded a subtle grey — region grouping, NOT a verdict colour — and the dots in
// the symptom rose as a glyph tint (C-1). No red/green anywhere.

interface Props {
  lanes: readonly LaneModel[];
  axis: LaneAxis;
  drawIn?: boolean;
  identity?: string;
}

// The shipped lane's pixels, read from the one place both drawings share
// (`LANE_GEOMETRY` in `lib/patternsTiming.ts`) — never restated here.
const DOT_SIZE = LANE_GEOMETRY.dotSize;
const DOT_R = DOT_SIZE / 2;
const ROW_GAP = LANE_GEOMETRY.rowGap;
const JITTER_CAP = LANE_GEOMETRY.jitterCap;
const LANE_HEIGHT = LANE_HEIGHT_PT;

export function TimingLanes({ lanes, axis, drawIn = false, identity = 'lanes' }: Props) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const dotCount = lanes.reduce((a, l) => a + l.dots.length, 0);
  const { markStyle, labelStyle } = useDrawIn({
    kind: 'dots',
    count: dotCount,
    drawIn,
    identity,
    reducedMotion,
    appActive,
  });
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const centerY = LANE_HEIGHT / 2;
  const { rapidWindowMinutes, longGapHours } = axis.config;
  const untimed = lanesUntimedLine(lanes);

  let dotIndex = 0;
  return (
    <View accessible accessibilityLabel={timingLanesA11yLabel(lanes, rapidWindowMinutes, longGapHours)} testID="timing-lanes">
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {lanes.map((lane, l) => (
          <View key={lane.label} style={styles.laneBlock} testID={`timing-lane-${l}`}>
            <View style={styles.laneHeader}>
              <ThemedText style={styles.laneLabel} numberOfLines={1}>
                {lane.label}
              </ThemedText>
              <ThemedText style={styles.timedLine} testID={`timing-timed-${l}`}>
                {lane.timedLine}
              </ThemedText>
            </View>
            {/* ONE measurement, off the first lane: the lanes are stacked full-width in one
                column, so every lane is the first lane's width. A caller laying lanes side
                by side would break that and needs a per-lane measure — it is an assumption
                of this layout, stated here rather than left to be discovered. */}
            <View style={styles.lane} onLayout={l === 0 ? onLayout : undefined} testID={`timing-lane-track-${l}`}>
              {width > 0 && (
                <>
                  <View style={[styles.band, { left: 0, width: axis.rapidBandEnd * width }]} />
                  <View
                    style={[styles.band, { left: axis.longBandStart * width, width: Math.max(0, (1 - axis.longBandStart) * width) }]}
                  />
                  <View style={styles.midline} />
                  {lane.dots.map((d, i) => {
                    const row = Math.max(-JITTER_CAP, Math.min(JITTER_CAP, d.jitterRow));
                    const style = markStyle(dotIndex);
                    dotIndex += 1;
                    return (
                      <Animated.View
                        key={i}
                        testID={`timing-dot-${l}-${i}`}
                        style={[
                          styles.dot,
                          {
                            left: Math.min(width - DOT_SIZE, Math.max(0, d.pos * width - DOT_R)),
                            top: centerY + row * ROW_GAP - DOT_R,
                          },
                          style,
                        ]}
                      />
                    );
                  })}
                </>
              )}
            </View>
            {/* The three counts, one under each region. Always text; a zero is a zero. */}
            <Animated.View style={[styles.bucketRow, labelStyle]}>
              <ThemedText style={[styles.bucket, { left: 2 }]} testID={`timing-bucket-${l}-0`}>
                {lane.bucketCounts[0]}
              </ThemedText>
              <ThemedText style={[styles.bucket, { left: width > 0 ? axis.rapidBandEnd * width + 3 : '22%' }]} testID={`timing-bucket-${l}-1`}>
                {lane.bucketCounts[1]}
              </ThemedText>
              <ThemedText style={[styles.bucket, { left: width > 0 ? axis.longBandStart * width + 3 : '86%' }]} testID={`timing-bucket-${l}-2`}>
                {lane.bucketCounts[2]}
              </ThemedText>
            </Animated.View>
          </View>
        ))}
        {/* One axis under the last lane — the shipped words, space-between (the
            doubling grid is evenly spaced by construction; see TimingDistribution). */}
        <View style={styles.axisRow}>
          {axis.axis.map((t) => (
            <ThemedText key={t.label} style={styles.axisLabel}>
              {t.label}
            </ThemedText>
          ))}
        </View>
        <Animated.View style={labelStyle}>
          <ThemedText style={styles.caption}>{lanesBucketCaption(rapidWindowMinutes, longGapHours)}</ThemedText>
          {/* NOT optional — see the header. */}
          <ThemedText style={styles.untimed} testID="timing-untimed-line">
            {untimed}
          </ThemedText>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  laneBlock: {
    marginBottom: theme.space1,
  },
  laneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: theme.space0_5,
    gap: theme.space1,
  },
  laneLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    flexShrink: 1,
  },
  timedLine: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    fontVariant: ['tabular-nums'],
  },
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
    // Region grouping, never a verdict colour (the shipped lane's rule).
    backgroundColor: theme.colorBorder,
    opacity: 0.5,
  },
  midline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: LANE_HEIGHT / 2,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colorBorder,
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_R,
    backgroundColor: theme.colorEventSymptom,
  },
  bucketRow: {
    height: theme.lineHeightXS,
    position: 'relative',
  },
  bucket: {
    position: 'absolute',
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    fontVariant: ['tabular-nums'],
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorder,
    paddingTop: theme.space0_5,
  },
  axisLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  caption: {
    marginTop: theme.space1,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightXS,
  },
  // The safety line is body-legible, never fine print (TimingPanelCard's rule).
  untimed: {
    marginTop: theme.space0_5,
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightSM,
  },
});
