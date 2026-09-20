import { useState } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { theme } from '../../constants/theme';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { WeightBandModel } from '../../lib/chartModels';
import { weightDotsA11yLabel, weightWord } from '../../lib/chartCopy';
import { ThemedText } from '../ui/ThemedText';
import { useDrawIn } from '../motion/drawInMotion';

// WeightDots — readings as dots by DATE on a fixed ±10 % band, to the §05 standard
// (CUL-1064; design authority `docs/culprit-design-v4-mockups.html` §04 option A, ruled:
// "dots by date on a fixed ±10% band with no fill and the delta spoken").
//
//   a mark per fact ........ a dot per reading, where its date is — not evenly spaced
//   a count on every mark .. the first and last values printed; the delta is the CALLER's line
//   the denominator ........ the band, its edges labelled +10 % / −10 % of the first reading
//   the uncounted .......... a reading past the band is drawn at the edge and SAID (the label)
//   the window named ....... the first and last dates under their dots
//
// NO FILL. A fill says "quantity from zero" and this axis does not start at zero; there
// is no area view in this tree and the test pins its absence. The band never moves: with
// two readings a clipped range would make any change fill the plot, and the fixed band
// makes a 2 % change look like 2 % at two readings and at six.
//
// HONEST AT LOW COUNTS. One reading is a number and its date, not a line (n = 1 says
// nothing about movement); two readings are the pair on the band; the empty state is
// the caller's (Principle 5 — the card owns the invitation to weigh).
//
// DOT COLOUR — a persona conflict, surfaced on CUL-1064 and not resolved here. The design
// authority draws the dots teal; the shipped `WeightCard` guardrail (B-186, Dr. Chen) says a
// weight trend NEVER reassures, so the line is neutral grey and never the accent that reads
// "good". The safer side of a safety rule is the build default: the dots are the sparkline's
// neutral grey until the PM rules. The hue is one token.
//
// The draw in (`useDrawIn`, kind `dots`): the dots pop in a stagger, the values land after.

interface Props {
  model: WeightBandModel;
  /** The unit the values are in, as the caller displays it ("lbs", "kg"). */
  unit: string;
  /** Formats a reading's instant as the date under its dot ("Jul 3"). The caller's, so
   *  the chart names dates the way the rest of its screen does. */
  formatDate: (iso: string) => string;
  drawIn?: boolean;
  identity?: string;
  plotHeight?: number;
}

const DEFAULT_PLOT_HEIGHT = 56;
const DOT_SIZE = 6;
const LAST_DOT_SIZE = 8;
/** Room at the right for the band-edge labels. */
const EDGE_LABEL_WIDTH = 40;

export function WeightDots({ model, unit, formatDate, drawIn = false, identity = 'weight', plotHeight = DEFAULT_PLOT_HEIGHT }: Props) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const { markStyle, labelStyle } = useDrawIn({
    kind: 'dots',
    count: model.points.length,
    drawIn,
    identity,
    reducedMotion,
    appActive,
  });
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const a11y = weightDotsA11yLabel(model, unit, formatDate);

  if (model.state === 'empty' || !model.first || !model.last) return null;

  if (model.state === 'number') {
    // One reading is a number, not a line. The second one draws the band.
    return (
      <View accessible accessibilityLabel={a11y} testID="weight-number">
        <Animated.View style={[styles.numberRow, labelStyle]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <ThemedText style={styles.bigNumber} testID="weight-number-value">
            {weightWord(model.first.value, unit)}
          </ThemedText>
          <ThemedText style={styles.bigNumberDate} testID="weight-number-date">
            {formatDate(model.first.occurredAt)}
          </ThemedText>
        </Animated.View>
      </View>
    );
  }

  const plotW = Math.max(0, width - EDGE_LABEL_WIDTH);
  const px = (x: number) => x * plotW;
  const py = (y: number) => (1 - y) * plotHeight;
  const n = model.points.length;

  return (
    <View accessible accessibilityLabel={a11y} testID="weight-dots">
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[styles.plot, { height: plotHeight }]} onLayout={onLayout} testID="weight-plot">
          {width > 0 && (
            <>
              {/* The band: dashed edges, the first reading's own line solid between them. */}
              <View style={[styles.edge, styles.edgeDashed, { top: py(1), width: plotW }]} />
              <View style={[styles.edge, { top: py(0.5), width: plotW }]} />
              <View style={[styles.edge, styles.edgeDashed, { top: py(0), width: plotW }]} />
              <ThemedText style={[styles.edgeLabel, { top: py(1) - 6, left: plotW + 4 }]} testID="weight-edge-hi">
                +10%
              </ThemedText>
              <ThemedText style={[styles.edgeLabel, { top: py(0) - 6, left: plotW + 4 }]} testID="weight-edge-lo">
                −10%
              </ThemedText>
              {model.points.map((p, i) => {
                const last = i === n - 1;
                const size = last ? LAST_DOT_SIZE : DOT_SIZE;
                return (
                  <Animated.View
                    key={`${p.ms}-${i}`}
                    testID={`weight-dot-${i}`}
                    style={[
                      styles.dot,
                      last && styles.dotLast,
                      { left: px(p.x) - size / 2, top: py(p.y) - size / 2, width: size, height: size, borderRadius: size / 2 },
                      markStyle(i),
                    ]}
                  />
                );
              })}
              {/* The first value, small, above its dot; the last value with its unit beside its dot. */}
              <Animated.View style={[styles.firstValue, { left: px(model.first.x) + 5, top: py(model.first.y) - 16 }, labelStyle]}>
                <ThemedText style={styles.smallValue} testID="weight-first-value">
                  {model.first.value.toFixed(1)}
                </ThemedText>
              </Animated.View>
              <Animated.View
                style={[styles.lastValue, { left: Math.min(px(model.last.x) + 7, plotW - 4), top: py(model.last.y) - 8 }, labelStyle]}
              >
                <ThemedText style={styles.lastValueText} testID="weight-last-value">
                  {weightWord(model.last.value, unit)}
                </ThemedText>
              </Animated.View>
            </>
          )}
        </View>
        <Animated.View style={[styles.dates, labelStyle]}>
          <ThemedText style={styles.date} testID="weight-first-date">
            {formatDate(model.first.occurredAt)}
          </ThemedText>
          <ThemedText style={styles.date} testID="weight-last-date">
            {formatDate(model.last.occurredAt)}
          </ThemedText>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  numberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.space1,
  },
  bigNumber: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    fontVariant: ['tabular-nums'],
  },
  bigNumberDate: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  plot: {
    position: 'relative',
    overflow: 'visible',
  },
  edge: {
    position: 'absolute',
    left: 0,
    height: 0,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colorBorder,
  },
  edgeDashed: {
    borderStyle: 'dashed',
  },
  edgeLabel: {
    position: 'absolute',
    fontSize: theme.textXS,
    lineHeight: 12,
    color: theme.colorTextTertiary,
    fontVariant: ['tabular-nums'],
  },
  // Neutral grey, never the accent (see the header): a weight mark never reassures.
  dot: {
    position: 'absolute',
    backgroundColor: theme.colorTextTertiary,
    borderWidth: 1.5,
    borderColor: theme.colorSurface,
  },
  dotLast: {
    backgroundColor: theme.colorTextSecondary,
  },
  firstValue: {
    position: 'absolute',
  },
  smallValue: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    fontVariant: ['tabular-nums'],
  },
  lastValue: {
    position: 'absolute',
  },
  lastValueText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    fontVariant: ['tabular-nums'],
  },
  dates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.space0_5,
    paddingRight: EDGE_LABEL_WIDTH,
  },
  date: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
});
