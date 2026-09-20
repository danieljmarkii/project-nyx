import { Animated, StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { CompareWindowsModel } from '../../lib/chartModels';
import { compareBarsA11yLabel } from '../../lib/chartCopy';
import { ThemedText } from '../ui/ThemedText';
import { DRAW_IN_ORIGIN, useDrawIn } from '../motion/drawInMotion';
import { CoverageTick } from './CoverageTick';

// CompareBars — two windows as two bars, to the §05 standard (CUL-1064; design authority
// `docs/culprit-design-v4-mockups.html` §03, the `compare()` drawing).
//
//   a mark per fact ........ one bar per window
//   a count on every mark .. the number beside each bar
//   the denominator ........ the window's days as a strip under its bar
//   the uncounted .......... the hollow days on the strip; "logged N of M days" in words
//   the window named ....... each bar's label is its window's name
//
// THIS COMPONENT CARRIES NO ADJUDICATING WORD. Round 3 wrote "fairly" beside the compare
// and the data read caught it: whether two windows are comparable is the reader's call
// from the two strips, and a word that makes it for them is a verdict on a descriptive
// surface. The test greps this file's strings for the class. The model is likewise mute.
//
// Daylight ground: the earlier window's bar is the paler rose (it is the "before", not a
// smaller concern) and the later window's the rose; both are fills, never text (C-1). The
// numbers are ink.
//
// The draw in (`useDrawIn`, kind `compare`): each bar extends from its LEFT edge
// (`transformOrigin: 'left'`), the second a beat after the first; the counts land after.

interface Props {
  model: CompareWindowsModel;
  /** What is counted, singular ("episode") — for the label a screen reader hears. */
  noun: string;
  drawIn?: boolean;
  identity?: string;
}

const TRACK_HEIGHT = 11;
/** A non-zero count is never drawn shorter than this; a zero is drawn as no fill at all,
 *  with its "0" beside the empty track. */
const MIN_FILL_FRAC = 0.02;

export function CompareBars({ model, noun, drawIn = false, identity = 'compare' }: Props) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const { markStyle, labelStyle } = useDrawIn({
    kind: 'compare',
    count: 2,
    drawIn,
    identity,
    reducedMotion,
    appActive,
  });

  return (
    <View accessible accessibilityLabel={compareBarsA11yLabel(model, noun)} testID="compare-bars">
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.rows}>
        {model.windows.map((w, i) => {
          const frac = w.count === 0 ? 0 : Math.max(MIN_FILL_FRAC, w.count / model.max);
          return (
            <View key={i} style={styles.row} testID={`compare-window-${i}`}>
              <View style={styles.labels}>
                <ThemedText style={styles.windowLabel} numberOfLines={2}>
                  {w.label}
                </ThemedText>
                <ThemedText style={styles.coverage} testID={`compare-coverage-${i}`}>
                  {w.coverageLine}
                </ThemedText>
              </View>
              <View style={styles.trackColumn}>
                <View style={styles.trackRow}>
                  <View style={styles.track}>
                    {frac > 0 && (
                      <Animated.View
                        testID={`compare-bar-${i}`}
                        style={[styles.fill, { width: `${frac * 100}%` }, i === 0 ? styles.fillBefore : styles.fillDuring, markStyle(i)]}
                      />
                    )}
                  </View>
                  <Animated.View style={labelStyle}>
                    <ThemedText style={styles.count} testID={`compare-count-${i}`}>
                      {w.count}
                    </ThemedText>
                  </Animated.View>
                </View>
                <View style={styles.strip} testID={`compare-strip-${i}`}>
                  {w.strip.map((d, k) => (
                    <CoverageTick key={k} state={d} testID={`compare-tick-${i}-${k}-${d}`} />
                  ))}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: theme.space1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space1,
  },
  labels: {
    width: '36%',
    minWidth: 96,
  },
  windowLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightXS,
  },
  coverage: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightXS,
  },
  trackColumn: {
    flex: 1,
    minWidth: 0,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space0_5,
  },
  track: {
    flex: 1,
    height: TRACK_HEIGHT,
    borderRadius: 3,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
  },
  fill: {
    height: TRACK_HEIGHT,
    borderRadius: 3,
    transformOrigin: DRAW_IN_ORIGIN.compare,
  },
  // Fills, never text (C-1): the earlier window paler, the later one the rose.
  fillBefore: {
    backgroundColor: theme.colorEventSymptomBorder,
  },
  fillDuring: {
    backgroundColor: theme.colorEventSymptom,
  },
  count: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    fontVariant: ['tabular-nums'],
    minWidth: 20,
  },
  strip: {
    flexDirection: 'row',
    gap: StyleSheet.hairlineWidth,
    marginTop: 3,
    marginRight: 24,
  },
});
