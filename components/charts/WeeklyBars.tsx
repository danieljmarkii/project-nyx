import { useState } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { theme } from '../../constants/theme';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { daysSoFarLabel, type WeeklyBucketsModel } from '../../lib/chartModels';
import { dateWord, markWord, weeklyBarsA11yLabel, weeklyOutsideLine } from '../../lib/chartCopy';
import { ThemedText } from '../ui/ThemedText';
import { DRAW_IN_ORIGIN, useDrawIn } from '../motion/drawInMotion';
import { CoverageTick } from './CoverageTick';

// WeeklyBars — a bar per week, unsmoothed, to the §05 standard (CUL-1064; design authority
// `docs/culprit-design-v4-mockups.html` §03 / §04, the `bars()` drawing).
//
//   a mark per fact ........ a bar per week, its height the week's count
//   a count on every mark .. the number above every bar, a zero included
//   the denominator ........ seven coverage ticks under each week (filled / hollow)
//   the uncounted .......... no tick on a day ahead or before the record; "N days so far"
//                            on the week holding today; episodes outside the weeks in words
//   the window named ....... the first and last week dated; the mark with its date, and
//                            "before these weeks" when it fell off the chart
//
// Everything counted is counted in `lib/chartModels.ts` (`weeklyBuckets`); this file only
// draws. Daylight ground: the bars take the symptom rose as a GLYPH tint (C-1 — a fill,
// never text), the partial week the paler rose (it is not a verdict, it is "not over yet"),
// and every number is text in the ink.
//
// The draw in (`useDrawIn`, kind `bars`): each bar rises about its baseline —
// `transformOrigin: 'bottom'` is the static style, the scale is the animated value — and
// the numbers land a beat later. `drawIn` is the caller's FACT (C-30).

interface Props {
  model: WeeklyBucketsModel;
  /** What is counted, lower-case ("vomiting") — for the label a screen reader hears. */
  noun: string;
  /** This chart just arrived for this reader (C-30). Default false: the static frame. */
  drawIn?: boolean;
  /** What is drawn; a change re-arms the draw while `drawIn` holds. */
  identity?: string;
  /** The tallest bar's height in pt. */
  plotHeight?: number;
}

const DEFAULT_PLOT_HEIGHT = 64;
/** A non-zero bar is never shorter than this, so a 1 beside a 20 is still a bar. */
const MIN_BAR_HEIGHT = 4;
/** A zero draws a stub at the baseline — a mark that says "counted, and none". */
const ZERO_STUB_HEIGHT = 2;
const MAX_BAR_WIDTH = 26;

export function WeeklyBars({ model, noun, drawIn = false, identity = 'weekly', plotHeight = DEFAULT_PLOT_HEIGHT }: Props) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const { markStyle, labelStyle } = useDrawIn({
    kind: 'bars',
    count: model.weeks.length,
    drawIn,
    identity,
    reducedMotion,
    appActive,
  });
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const n = model.weeks.length;
  const slot = n > 0 ? width / n : 0;
  const partial = model.weeks.find((w) => w.partial) ?? null;
  const partialLabel = partial ? daysSoFarLabel(partial) : null;
  const markX = model.mark && model.mark.slot != null && width > 0 ? model.mark.slot * slot : null;
  const outside = weeklyOutsideLine(model);
  const middle = n >= 5 && n % 2 === 1 ? Math.floor(n / 2) : -1;

  return (
    <View accessible accessibilityLabel={weeklyBarsA11yLabel(model, noun)} testID="weekly-bars">
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {/* The header line: the mark's words at the left, the partial week's at the right. */}
        <Animated.View style={[styles.headerRow, labelStyle]}>
          <ThemedText style={styles.headerText} numberOfLines={1} testID="weekly-mark-label">
            {model.mark ? markWord(model.mark) : ''}
          </ThemedText>
          {partialLabel != null && (
            <ThemedText style={styles.headerText} testID="weekly-partial-label">
              {partialLabel}
            </ThemedText>
          )}
        </Animated.View>

        <View style={styles.plotRow} onLayout={onLayout} testID="weekly-plot">
          {/* The mark: a dashed hairline at its day's fractional slot, behind the bars. */}
          {markX != null && (
            <View pointerEvents="none" style={[styles.markLine, { left: markX, height: plotHeight + theme.space2 }]} testID="weekly-mark-line" />
          )}
          {model.weeks.map((week, i) => {
            const isZero = week.count === 0;
            const h = isZero ? ZERO_STUB_HEIGHT : Math.max(MIN_BAR_HEIGHT, (week.count / model.max) * plotHeight);
            return (
              <View key={week.startKey} style={styles.column} testID={`weekly-week-${i}`}>
                <Animated.View style={labelStyle}>
                  <ThemedText
                    style={[styles.count, i === n - 1 && styles.countLast]}
                    testID={`weekly-count-${i}`}
                  >
                    {week.count}
                  </ThemedText>
                </Animated.View>
                <View style={[styles.barWell, { height: plotHeight }]}>
                  <Animated.View
                    testID={`weekly-bar-${i}`}
                    style={[
                      styles.bar,
                      { height: h },
                      isZero ? styles.barZero : week.partial ? styles.barPartial : styles.barFull,
                      markStyle(i),
                    ]}
                  />
                </View>
                <View style={styles.ticks}>
                  {week.days.map((state, d) => (
                    <CoverageTick key={d} state={state} testID={`weekly-tick-${i}-${d}-${state}`} />
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        {/* What the window left out, for sighted readers too — the spoken label says the same. */}
        {outside != null && (
          <Animated.View style={labelStyle}>
            <ThemedText style={styles.outside} testID="weekly-outside-line">
              {outside}
            </ThemedText>
          </Animated.View>
        )}

        {/* The window, named: the first and last week dated (and the middle one on a long run). */}
        <Animated.View style={[styles.datesRow, labelStyle]}>
          {model.weeks.map((week, i) => {
            const dated = i === 0 || i === n - 1 || i === middle;
            return (
              <View key={week.startKey} style={[styles.column, i === 0 && styles.dateFirst, i === n - 1 && styles.dateLast]}>
                {dated && (
                  <ThemedText style={styles.date} numberOfLines={1} testID={`weekly-date-${i}`}>
                    {dateWord(week.startKey)}
                  </ThemedText>
                )}
              </View>
            );
          })}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: theme.lineHeightXS,
    marginBottom: theme.space0_5,
  },
  headerText: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    flexShrink: 1,
  },
  plotRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    position: 'relative',
  },
  markLine: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    borderLeftWidth: 1,
    borderColor: theme.colorTextTertiary,
    borderStyle: 'dashed',
  },
  column: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  count: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
  },
  countLast: {
    color: theme.colorTextPrimary,
    fontWeight: theme.weightSemibold,
  },
  barWell: {
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colorBorder,
  },
  bar: {
    width: '75%',
    maxWidth: MAX_BAR_WIDTH,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    transformOrigin: DRAW_IN_ORIGIN.bars,
  },
  // The symptom rose as a fill — a glyph tint at the 3:1 target (C-1), never text.
  barFull: {
    backgroundColor: theme.colorEventSymptom,
  },
  // The week that is not over: the paler rose says "so far", not "less".
  barPartial: {
    backgroundColor: theme.colorEventSymptomBorder,
  },
  barZero: {
    backgroundColor: theme.colorChartEmpty,
    borderRadius: 1,
  },
  ticks: {
    flexDirection: 'row',
    gap: 1,
    width: '75%',
    maxWidth: MAX_BAR_WIDTH,
    marginTop: 3,
  },
  outside: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space0_5,
  },
  datesRow: {
    flexDirection: 'row',
    marginTop: theme.space0_5,
  },
  dateFirst: {
    alignItems: 'flex-start',
  },
  dateLast: {
    alignItems: 'flex-end',
  },
  date: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
});
