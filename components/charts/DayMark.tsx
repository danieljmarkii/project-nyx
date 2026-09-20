import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { dayMarkA11yLabel, type DayMarkCoverage, type DayMarkPhoto } from '../../lib/chartCopy';
import { ThemedText } from '../ui/ThemedText';

// DayMark — one day of the month, to the §05 standard (CUL-1064; design authority
// `docs/culprit-design-v4-mockups.html` §04, the `dayMark()` drawing).
//
//   a mark per fact ........ a day per square; the date STAYS on it
//   a count on every mark .. the count in the corner, a separate node from the date
//   the denominator ........ the coverage hairline (logged; paler for a meal left unfinished)
//   the uncounted .......... the grey square: nothing logged; no hairline, no rose
//   the window named ....... the month around it (the caller's)
//
// A LAYER OFF IS NOT "CLEAR". With the symptom layer off the square drops the rose and
// the count and keeps its date and its hairline: the reader switched a layer, they did
// not learn the day was fine. Coverage is spoken either way.
//
// COVERAGE OUTRANKS THE COUNT, AND THAT IS THE CALLER'S BURDEN TO KEEP TRUE. An
// `unlogged` day speaks "nothing logged" and drops its count (both channels agree, so a
// screen reader and the eye never disagree) — which is only honest because an episode day
// IS a logged day (`CORRELATION_SYMPTOM_TYPES` in `lib/patternsTiming.ts` makes a vomit day
// count). A caller deriving `coverage` from a feeding-only logged-day set would make the
// accusing half disappear behind an absence claim. The month (D2-5) must derive
// `coverage` from the same set that makes an episode a logged day, never from meals alone.
//
// A DAY AHEAD IS NOT A CONTROL. It renders as a plain View with no press handler and no
// `disabled` (C-7: `disabled` claims a control exists and is unavailable; there is no
// control on a day that has not happened). The split is by host, not by a flag on one
// Pressable.
//
// COLOUR IS NEVER THE ONLY CARRIER: the count is text, the hairline pairs with the
// spoken "logged", and the worth-a-call photo dot's rose pairs with "read as worth a
// call" in the label. No haptic here and none may be added — this file paints a
// `worth_a_call` and is named in `guards/haptics.test.ts`'s ALWAYS_SCANNED (C-16).
//
// White text on the symptom rose: the design authority's choice for a symptom day, and
// it measures 3.7:1, under the 4.5:1 text floor. Raised as a Designer flag on CUL-1064
// for the month's build (D2-5), not resolved here by drifting from the ruled frame.

export interface DayMarkProps {
  /** The day, as a local day key (`YYYY-MM-DD`). */
  dayKey: string;
  /** The day-of-month to draw. */
  dayOfMonth: number;
  /** Episodes on the day. A zero is a day with none, not a missing number. */
  count: number;
  coverage: DayMarkCoverage;
  /** The symptom layer is showing (default on). */
  symptomLayer?: boolean;
  medication?: boolean;
  photo?: DayMarkPhoto;
  today?: boolean;
  selected?: boolean;
  /** What is counted, lower-case ("vomiting") — for the label. */
  noun: string;
  /** Present → the day opens (a button). Absent → a plain, accessible square. */
  onPress?: () => void;
}

export function DayMark({
  dayKey,
  dayOfMonth,
  count,
  coverage,
  symptomLayer = true,
  medication = false,
  photo = 'none',
  today = false,
  selected = false,
  noun,
  onPress,
}: DayMarkProps) {
  const ahead = coverage === 'ahead';
  const unlogged = coverage === 'unlogged';
  const symptomDay = symptomLayer && count > 0 && !ahead && !unlogged;
  const label = dayMarkA11yLabel({ dayKey, count, coverage, medication, photo, symptomLayer, today, selected }, noun);

  const inner = (
    <>
      <ThemedText
        style={[styles.date, symptomDay && styles.dateOnRose, unlogged && styles.dateUnlogged, ahead && styles.dateAhead]}
        testID="daymark-date"
      >
        {dayOfMonth}
      </ThemedText>
      {symptomDay && (
        <ThemedText style={styles.count} testID="daymark-count">
          {count}
        </ThemedText>
      )}
      {(coverage === 'logged' || coverage === 'left_some') && (
        <View
          style={[styles.hairline, coverage === 'left_some' ? styles.hairlineLeftSome : styles.hairlineLogged, symptomDay && styles.hairlineOnRose]}
          testID={`daymark-hairline-${coverage}`}
        />
      )}
      {(medication || photo !== 'none') && (
        <View style={styles.layers}>
          {medication && <View style={[styles.layerDot, styles.layerMedication]} testID="daymark-layer-medication" />}
          {photo !== 'none' && (
            <View
              style={[styles.layerDot, photo === 'worth_a_call' ? styles.layerPhotoCall : styles.layerPhoto]}
              testID={`daymark-layer-photo-${photo}`}
            />
          )}
        </View>
      )}
    </>
  );

  const box = [
    styles.box,
    unlogged && styles.boxUnlogged,
    ahead && styles.boxAhead,
    symptomDay && styles.boxSymptom,
    today && styles.boxToday,
    selected && styles.boxSelected,
  ];

  if (onPress && !ahead) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={2}
        accessibilityRole="button"
        accessibilityLabel={`${label}, opens the day`}
        style={({ pressed }) => [box, pressed && styles.boxPressed]}
        testID="daymark"
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={label} style={box} testID="daymark">
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colorBorder,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  boxUnlogged: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderColor: 'transparent',
  },
  boxAhead: {
    backgroundColor: 'transparent',
    borderColor: theme.colorBorder,
  },
  // The rose as a fill — a glyph tint (C-1). The count and the date on it are the
  // design authority's white (see the header).
  boxSymptom: {
    backgroundColor: theme.colorEventSymptom,
    borderColor: 'transparent',
  },
  boxToday: {
    borderWidth: 1.5,
    borderColor: theme.colorTextPrimary,
  },
  boxSelected: {
    borderWidth: 2,
    borderColor: theme.colorAccentInk,
  },
  boxPressed: {
    opacity: 0.8,
  },
  date: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    fontVariant: ['tabular-nums'],
  },
  dateOnRose: {
    color: theme.colorTextOnDark,
    fontWeight: theme.weightSemibold,
  },
  dateUnlogged: {
    color: theme.colorTextTertiary,
  },
  dateAhead: {
    color: theme.colorTickIdle,
  },
  count: {
    position: 'absolute',
    top: 2,
    right: 4,
    fontSize: 9,
    lineHeight: 10,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextOnDark,
    fontVariant: ['tabular-nums'],
  },
  hairline: {
    position: 'absolute',
    left: '22%',
    right: '22%',
    bottom: 4,
    height: 2,
    borderRadius: 1,
  },
  hairlineLogged: {
    backgroundColor: theme.colorAccentSoft,
  },
  // A meal left unfinished: the paler hairline (§04's legend), still a logged day.
  hairlineLeftSome: {
    backgroundColor: theme.colorAccentWashDeep,
  },
  hairlineOnRose: {
    backgroundColor: theme.colorTextOnDarkFaint,
  },
  layers: {
    position: 'absolute',
    top: 3,
    left: 3,
    flexDirection: 'row',
    gap: 2,
  },
  layerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  layerMedication: {
    backgroundColor: theme.colorEventMedication,
  },
  layerPhoto: {
    backgroundColor: theme.colorTextTertiary,
  },
  // A photo the read called worth a call: the rose, paired with the spoken words.
  layerPhotoCall: {
    backgroundColor: theme.colorEventSymptomInk,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colorSurface,
  },
});
