import { useState } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { theme } from '../../constants/theme';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { WEIGHT_BAND_FRAC, type WeightBandModel, type WeightPoint } from '../../lib/chartModels';
import { weightDotsA11yLabel, weightWord } from '../../lib/chartCopy';
import { ThemedText } from '../ui/ThemedText';
import { useDrawIn } from '../motion/drawInMotion';

// WeightDots — readings as dots by DATE on a stepped band, to the §05 standard (CUL-1064;
// design authority `docs/culprit-design-v4-mockups.html` §04 option A, ruled: "dots by
// date on a fixed ±10% band with no fill and the delta spoken"; the band's width amended by
// CUL-1716, `docs/culprit-weight-card-mockups.html`).
//
//   a mark per fact ........ a dot per reading, where its date is — not evenly spaced
//   a count on every mark .. the first and last values printed; the delta is the CALLER's line
//   the denominator ........ the band, its edges labelled with its width (±10, 20 or 30 % of the
//                            first reading); when it has widened, the ±10 % lines stay,
//                            labelled, so the scale a reader learned is still drawn
//   the uncounted .......... a reading past ±30 % is drawn at the edge as a HOLLOW dot with
//                            its value printed beside it, and said in the label — so a 45 %
//                            loss never draws like a 30 % one to a sighted reader either
//   the window named ....... the first and last dates under their dots
//
// NO FILL. A fill says "quantity from zero" and this axis does not start at zero; there
// is no area view in this tree and the test pins its absence. The band never NARROWS below
// ±10 %: with two readings a range fitted to the data would make any change fill the plot,
// and the floor makes a 2 % change look like 2 % at two readings and at six. It only widens,
// in fixed steps (`weightBand`), so a 15 % loss draws as 15 % instead of a dot pinned to
// the ±10 % edge (the PM's device read, CUL-1716).
//
// THE REFERENCE LINE IS NOT THE WEIGHT. The first reading's level is drawn dotted and faint,
// never solid: a solid line across the plot read as the weight itself, so two readings 15 %
// apart looked flat (CUL-1716). Its dot carries its value.
//
// THE LAST VALUE NEVER LEAVES THE PLOT. It is right-aligned to its dot and sits above it
// (below it in the band's upper half, or when the neighbouring dot is in the way); clamped
// beside its dot it ran into the gutter's band label on every change near the edge.
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

const DEFAULT_PLOT_HEIGHT = 96;
const DOT_SIZE = 6;
const LAST_DOT_SIZE = 8;
/** Room at the right for the band-edge labels. */
export const EDGE_LABEL_WIDTH = 40;
/** Where the band labels start, right of the plot. */
const EDGE_LABEL_GAP = 6;
/** Room above and below the band for a value label on an edge dot. */
export const LABEL_ROOM = 22;
/** The first dot is inset by its own radius so it is never half off the card. */
const X_INSET = LAST_DOT_SIZE / 2;
const LAST_LABEL_HEIGHT = 18;
/** An estimate of one character of the last value's label (textSM, semibold, tabular),
 *  used only to tell whether the neighbouring dot sits under the label. */
const LAST_LABEL_CHAR_W = 7.5;

/** Whether the last value goes ABOVE its dot: above in the band's lower half, below in its
 *  upper half, and the other side when the neighbouring dot would sit under the label. */
export function lastValueAbove(
  points: readonly WeightPoint[],
  label: string,
  px: (x: number) => number,
  py: (y: number) => number,
  /** The plot area's full height, label room included. */
  plotBottom: number,
): boolean {
  const n = points.length;
  const last = points[n - 1];
  const prefer = last.y <= 0.5;
  const prev = n > 1 ? points[n - 2] : null;
  if (!prev) return prefer;
  const right = px(last.x) + 2;
  const left = right - label.length * LAST_LABEL_CHAR_W;
  const r = DOT_SIZE / 2;
  const covers = (above: boolean) => {
    const top = above ? py(last.y) - LAST_DOT_SIZE / 2 - 2 - LAST_LABEL_HEIGHT : py(last.y) + LAST_DOT_SIZE / 2 + 2;
    const x = px(prev.x);
    const y = py(prev.y);
    return x + r >= left && x - r <= right && y + r >= top && y - r <= top + LAST_LABEL_HEIGHT;
  };
  // Flipped only into room the plot has: a label below a bottom-edge dot would sit on the dates.
  const fits = (above: boolean) => {
    const top = above ? py(last.y) - LAST_DOT_SIZE / 2 - 2 - LAST_LABEL_HEIGHT : py(last.y) + LAST_DOT_SIZE / 2 + 2;
    return top >= 0 && top + LAST_LABEL_HEIGHT <= plotBottom;
  };
  return covers(prefer) && !covers(!prefer) && fits(!prefer) ? !prefer : prefer;
}

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
  const px = (x: number) => X_INSET + x * Math.max(0, plotW - X_INSET);
  const py = (y: number) => LABEL_ROOM + (1 - y) * plotHeight;
  const n = model.points.length;
  const frac = model.band?.frac ?? WEIGHT_BAND_FRAC;
  const pct = Math.round(frac * 100);
  // The ±10 % lines, kept when the band has widened past them (their place in the band).
  const guide = frac > WEIGHT_BAND_FRAC ? WEIGHT_BAND_FRAC / frac / 2 : null;
  const lastWord = weightWord(model.last.value, unit);
  const lastAbove = lastValueAbove(model.points, lastWord, px, py, plotHeight + LABEL_ROOM * 2);

  return (
    <View accessible accessibilityLabel={a11y} testID="weight-dots">
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[styles.plot, { height: plotHeight + LABEL_ROOM * 2 }]} onLayout={onLayout} testID="weight-plot">
          {width > 0 && (
            <>
              {/* The band: dashed, labelled edges; the first reading's level dotted and faint. */}
              <View style={[styles.edge, styles.edgeDashed, { top: py(1), width: plotW }]} />
              <View style={[styles.edge, styles.edgeFaint, { top: py(0.5), width: plotW }]} testID="weight-ref-line" />
              <View style={[styles.edge, styles.edgeDashed, { top: py(0), width: plotW }]} />
              <ThemedText style={[styles.edgeLabel, { top: py(1) - 6, left: plotW + EDGE_LABEL_GAP }]} testID="weight-edge-hi">
                {`+${pct}%`}
              </ThemedText>
              <ThemedText style={[styles.edgeLabel, { top: py(0) - 6, left: plotW + EDGE_LABEL_GAP }]} testID="weight-edge-lo">
                {`−${pct}%`}
              </ThemedText>
              {guide != null && (
                <>
                  <View style={[styles.edge, styles.edgeFaint, { top: py(0.5 + guide), width: plotW }]} testID="weight-guide-hi" />
                  <View style={[styles.edge, styles.edgeFaint, { top: py(0.5 - guide), width: plotW }]} testID="weight-guide-lo" />
                  <ThemedText style={[styles.edgeLabel, { top: py(0.5 + guide) - 6, left: plotW + EDGE_LABEL_GAP }]} testID="weight-guide-hi-label">
                    +10%
                  </ThemedText>
                  <ThemedText style={[styles.edgeLabel, { top: py(0.5 - guide) - 6, left: plotW + EDGE_LABEL_GAP }]} testID="weight-guide-lo-label">
                    −10%
                  </ThemedText>
                </>
              )}
              {model.points.map((p, i) => {
                const last = i === n - 1;
                const size = last ? LAST_DOT_SIZE : DOT_SIZE;
                return (
                  <Animated.View
                    key={`${p.ms}-${i}`}
                    testID={`weight-dot-${i}${p.clipped ? '-clipped' : ''}`}
                    style={[
                      styles.dot,
                      last && styles.dotLast,
                      p.clipped && styles.dotClipped,
                      { left: px(p.x) - size / 2, top: py(p.y) - size / 2, width: size, height: size, borderRadius: size / 2 },
                      markStyle(i),
                    ]}
                  />
                );
              })}
              {/* A clipped reading that is not the last prints its own value: the dot sits on
                  the band's edge, so the number is the only thing that says how far past it. */}
              {model.points.map((p, i) =>
                p.clipped && i !== n - 1 ? (
                  <Animated.View
                    key={`clip-${p.ms}-${i}`}
                    style={[styles.firstValue, { left: px(p.x) + 5, top: p.y <= 0 ? py(p.y) - 16 : py(p.y) + 4 }, labelStyle]}
                  >
                    <ThemedText style={styles.smallValue} testID={`weight-clipped-value-${i}`}>
                      {p.value.toFixed(1)}
                    </ThemedText>
                  </Animated.View>
                ) : null,
              )}
              {/* The first value, small, above its dot; the last value with its unit, right-aligned
                  to its dot and above or below it, never in the gutter. */}
              <Animated.View style={[styles.firstValue, { left: px(model.first.x) + 5, top: py(model.first.y) - 16 }, labelStyle]}>
                <ThemedText style={styles.smallValue} testID="weight-first-value">
                  {model.first.value.toFixed(1)}
                </ThemedText>
              </Animated.View>
              <Animated.View
                style={[
                  styles.lastValue,
                  {
                    right: width - (px(model.last.x) + 2),
                    top: lastAbove
                      ? py(model.last.y) - LAST_DOT_SIZE / 2 - 2 - LAST_LABEL_HEIGHT
                      : py(model.last.y) + LAST_DOT_SIZE / 2 + 2,
                  },
                  labelStyle,
                ]}
                testID="weight-last-value-box"
              >
                <ThemedText style={styles.lastValueText} testID="weight-last-value">
                  {lastWord}
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
  // The reference level and the ±10 % guides: dotted and hairline, never a line that
  // could pass for the weight.
  edgeFaint: {
    borderStyle: 'dotted',
    borderTopWidth: StyleSheet.hairlineWidth,
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
  // Past the band: hollow, so it cannot pass for a reading AT the band's edge.
  dotClipped: {
    backgroundColor: theme.colorSurface,
    borderColor: theme.colorTextSecondary,
    borderWidth: 1.5,
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
    lineHeight: LAST_LABEL_HEIGHT,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    fontVariant: ['tabular-nums'],
  },
  dates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingRight: EDGE_LABEL_WIDTH,
  },
  date: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
});
