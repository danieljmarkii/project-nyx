import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { theme } from '../../constants/theme';
import { dayMarkA11yLabel, type DayMarkCoverage, type DayMarkPhoto } from '../../lib/chartCopy';
import { isCallDisplay } from '../../lib/incidentTierWords';
import { holdsVomit } from '../../lib/monthModel';
import { ThemedText } from '../ui/ThemedText';

// DayMark — one day of the month, to the §05 standard (CUL-1064; design authority
// `docs/culprit-design-v4-mockups.html` §04, the `dayMark()` drawing).
//
//   a mark per fact ........ a day per square; the date STAYS on it
//   a count on every mark .. the count in the corner, a separate node from the date
//   the denominator ........ the coverage line (logged; BROKEN for a meal left unfinished)
//   the uncounted .......... the grey square: nothing logged; no line, no rose
//   the window named ....... the month around it (the caller's)
//
// ONE FACE, TWO SURFACES (CUL-1165; History v2 spec §3.4, §5.7). `DayMarkFace` is the
// drawing: a box (white, grey, rose, outlined or none) and a line (none, whole, broken).
// The Patterns month draws through `DayMark`, which maps its coverage vocabulary onto a
// face; History's week strip draws the face directly, without counts, from
// `lib/stripMarks.ts`'s states. So the strip and the month cannot draw one day two ways.
//
// MARKS ARE TOLD APART BY SHAPE (WBC-1, AC 26). The logged line is `colorAccentGlyph`,
// 3.27:1 on the white box, where the retired `colorAccentSoft` was 1.64:1; a meal left
// unfinished is the SAME colour, dashed, where it used to be a paler line (1.18:1) that
// only colour could tell apart. On the rose the line draws solid white (3.67:1, where the
// retired 55% white was 2.0:1) and still breaks, so an unfinished meal on a vomit day is
// no longer painted over. `constants/theme.contrast.test.ts` pins both halves; the dash
// is pinned by its own test here.
//
// A LAYER OFF IS NOT "CLEAR". With the symptom layer off the square drops the rose and
// the count and keeps its date and its line: the reader switched a layer, they did not
// learn the day was fine. Coverage is spoken either way.
//
// COVERAGE OUTRANKS THE COUNT, AND THAT IS THE CALLER'S BURDEN TO KEEP TRUE. An
// `unlogged` day speaks "nothing logged" and drops its count (both channels agree, so a
// screen reader and the eye never disagree) — which is only honest because an episode day
// IS a logged day (`CORRELATION_SYMPTOM_TYPES` in `lib/patternsTiming.ts` makes a vomit day
// count). A caller deriving `coverage` from a feeding-only logged-day set would make the
// accusing half disappear behind an absence claim. The month (D2-5) must derive
// `coverage` from the same set that makes an episode a logged day, never from meals alone.
//
// A DAY AHEAD IS NOT A CONTROL, and neither is a day before the record. Either renders as
// a plain View with no press handler and no `disabled` (C-7: `disabled` claims a control
// exists and is unavailable; there is no control on a day that has not happened). The
// split is by host, not by a flag on one Pressable.
//
// COLOUR IS NEVER THE ONLY CARRIER: the count is text, the line pairs with the spoken
// "logged", its break with "a meal left unfinished", and the worth-a-call photo dot's rose
// pairs with "read as worth a call" in the label. No haptic here and none may be added —
// this file paints a `worth_a_call` and is named in `guards/haptics.test.ts`'s
// ALWAYS_SCANNED (C-16).
//
// TEXT CLEARS 4.5:1 ON EVERY BOX (CUL-1224, BRK-32; CUL-1074 brief 3, settled by
// measurement). White on the rose was the design authority's and measured 3.67:1; the date
// and the count on the rose take the primary ink (5.39:1). A grey day's date is the
// secondary ink (7.17:1 on the grey), a day ahead or before the record the tertiary
// (4.74:1 on the card's white), where the idle grey was 1.66:1. A neighbouring month's day
// (`dim`) recedes by a lighter date and no edge, never by opacity: at the 0.45 it shipped
// with, its date fell to 2.14:1. The date and the count are fixed to the box's size
// (`maxFontSizeMultiplier` 1): a 9pt count and a two-digit date overlapped at AX1 in a
// 38.6pt square, and the label speaks both at any size. All pinned in
// `constants/theme.contrast.test.ts`.
//
// THE LAYER MARKS ARE THREE SHAPES (CUL-1224, GAP-5): a dose is a square, a photo a dot,
// a photo read as worth a call a diamond. On the rose each carries a white edge, so it
// separates from the fill by lightness (the dose's blue measured 1.21:1 on the rose, the
// call's ink 2.18:1).

/** The box a day is drawn in. */
export type DayMarkBox =
  /** A day of the record: white, with a hairline edge. */
  | 'white'
  /** Nothing logged. */
  | 'grey'
  /** A symptom day: the rose fill, the date in the primary ink. */
  | 'rose'
  /** A day ahead: an outline, the date faint. */
  | 'outlined'
  /** Before the record: no box at all, the date faint. */
  | 'none';

/** The line under the date: none, whole, or broken (less than all of it: a meal left
 *  unfinished; on History's medication filters, a dose not given in full). */
export type DayMarkLineKind = 'none' | 'solid' | 'broken';

/** The broken line's rhythm, the round-5 mock's: a 3pt dash, a 3pt gap. */
export const DAY_MARK_DASH: readonly [number, number] = [3, 3];

const LINE_HEIGHT = 2;

/**
 * The line itself, whole or broken: the glyph teal on a white box, white on the rose. The
 * one stroke the grid and its legend both draw, so the key IS the mark. Position it with
 * `style`: the face lays it along the box's foot, the legend inside its swatch.
 */
export function DayMarkLine({
  kind,
  onRose = false,
  style,
  testID,
}: {
  kind: 'solid' | 'broken';
  onRose?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  if (kind === 'solid') {
    return <View style={[styles.line, onRose ? styles.lineOnRose : styles.lineOnWhite, style]} testID={testID} />;
  }
  // A dash is a gap in the STROKE, not a paler colour: the same line, broken. An SVG dash
  // array keeps the rhythm exact at any width (a View border's `dashed` is not honoured on
  // one side on iOS, and its dash length is the platform's).
  return (
    <View style={[styles.line, styles.lineBroken, style]} testID={testID}>
      <Svg width="100%" height={LINE_HEIGHT}>
        <Line
          x1={0}
          y1={LINE_HEIGHT / 2}
          x2="100%"
          y2={LINE_HEIGHT / 2}
          stroke={onRose ? theme.colorTextOnDark : theme.colorAccentGlyph}
          strokeWidth={LINE_HEIGHT}
          strokeDasharray={[...DAY_MARK_DASH]}
          strokeLinecap="butt"
        />
      </Svg>
    </View>
  );
}

export interface DayMarkFaceProps {
  /** The day-of-month to draw. */
  dayOfMonth: number;
  box: DayMarkBox;
  line: DayMarkLineKind;
  /** The count in the corner, drawn on the rose box only (the month's). None on History's
   *  strip, which draws the mark without counts (H-2). */
  count?: number | null;
  medication?: boolean;
  /** A meal was refused on the day: a hollow ring, told apart by SHAPE from the filled
   *  layer dots and never by an alarm colour (CUL-1553; §04's "left some" rule, Sam). The
   *  month's Meals layer only; History's strip never passes it. */
  refused?: boolean;
  photo?: DayMarkPhoto;
  today?: boolean;
  selected?: boolean;
  /** A neighbouring month's day, drawn so the month's own days lead: no edge, a lighter
   *  date, never an opacity (CUL-1224). The month only. */
  dim?: boolean;
  /** The spoken label, whole. The caller writes it: the month through `dayMarkA11yLabel`,
   *  the strip through `stripMarkOf`. */
  label: string;
  accessibilityHint?: string;
  /** Present → the day is a button. Ignored on an outlined or boxless day (C-7). */
  onPress?: () => void;
}

/** The drawing both surfaces share: a box, the date, a line, the month's corner count and
 *  layer dots. Everything it says aloud is the caller's `label`. */
export function DayMarkFace({
  dayOfMonth,
  box,
  line,
  count = null,
  medication = false,
  refused = false,
  photo = 'none',
  today = false,
  selected = false,
  dim = false,
  label,
  accessibilityHint,
  onPress,
}: DayMarkFaceProps) {
  const rose = box === 'rose';
  const inner = (
    <>
      <ThemedText
        style={[
          styles.date,
          rose && styles.dateOnRose,
          box === 'grey' && styles.dateUnlogged,
          (box === 'outlined' || box === 'none' || (dim && box === 'white')) && styles.dateFaint,
        ]}
        maxFontSizeMultiplier={1}
        testID="daymark-date"
      >
        {dayOfMonth}
      </ThemedText>
      {rose && count != null && count > 0 && (
        <ThemedText style={styles.count} maxFontSizeMultiplier={1} testID="daymark-count">
          {count}
        </ThemedText>
      )}
      {line !== 'none' && <DayMarkLine kind={line} onRose={rose} style={styles.linePosition} testID={`daymark-line-${line}`} />}
      {(refused || medication || photo !== 'none') && (
        <View style={styles.layers}>
          {refused && <View style={[styles.refusedRing, rose && styles.refusedRingOnRose]} testID="daymark-layer-refused" />}
          {medication && <View style={[styles.layerSquare, styles.layerMedication, rose && styles.layerOnRose]} testID="daymark-layer-medication" />}
          {photo !== 'none' && (
            <View
              style={
                isCallDisplay(photo)
                  ? [styles.layerDiamond, styles.layerPhotoCall, rose && styles.layerOnRose]
                  : [styles.layerDot, styles.layerPhoto, rose && styles.layerOnRose]
              }
              testID={`daymark-layer-photo-${photo}`}
            />
          )}
        </View>
      )}
    </>
  );

  const boxStyle = [
    styles.box,
    box === 'grey' && styles.boxUnlogged,
    box === 'outlined' && styles.boxAhead,
    box === 'none' && styles.boxNone,
    rose && styles.boxSymptom,
    dim && styles.boxDim,
    today && styles.boxToday,
    selected && styles.boxSelected,
  ];

  if (onPress && box !== 'outlined' && box !== 'none') {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={2}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [boxStyle, pressed && styles.boxPressed]}
        testID="daymark"
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={label} style={boxStyle} testID="daymark">
      {inner}
    </View>
  );
}

export interface DayMarkProps {
  /** The day, as a local day key (`YYYY-MM-DD`). */
  dayKey: string;
  /** The day-of-month to draw. */
  dayOfMonth: number;
  /** Episodes on the day. A zero is a day with none, not a missing number. */
  count: number;
  /** The day a bout began, when this day holds its rows and no bout of its own. The box is
   *  rose (CUL-1530: every day holding a vomit is) and carries no corner count, which stays
   *  on the day the bout began; the label names that day (CUL-1226). */
  continuesFrom?: string | null;
  coverage: DayMarkCoverage;
  /** The day holds a feeding or a symptom entry: only then may a zero be spoken as
   *  "no <noun>" (CUL-1074 brief 2). Required, so no caller claims an absence by default. */
  answers: boolean;
  /** Refused meals and meals left unfinished but not refused, on the Meals layer (0 when
   *  the layer is off). A refused meal draws the ring and is named in the label. */
  refusedMeals?: number;
  leftSomeMeals?: number;
  /** The symptom layer is showing (default on). */
  symptomLayer?: boolean;
  medication?: boolean;
  photo?: DayMarkPhoto;
  today?: boolean;
  selected?: boolean;
  /** A neighbouring month's day (see `DayMarkFace`'s `dim`). */
  dim?: boolean;
  /** What is counted, lower-case ("vomiting") — for the label. */
  noun: string;
  /** Present → the day opens (a button). Absent → a plain, accessible square. */
  onPress?: () => void;
}

/** The month's day: its coverage vocabulary mapped onto the shared face. */
export function DayMark({
  dayKey,
  dayOfMonth,
  count,
  continuesFrom = null,
  coverage,
  answers,
  refusedMeals = 0,
  leftSomeMeals = 0,
  symptomLayer = true,
  medication = false,
  photo = 'none',
  today = false,
  selected = false,
  dim = false,
  noun,
  onPress,
}: DayMarkProps) {
  const ahead = coverage === 'ahead';
  const unlogged = coverage === 'unlogged';
  const symptomDay = symptomLayer && holdsVomit({ count, continuesFrom }) && !ahead && !unlogged;
  const label = dayMarkA11yLabel(
    { dayKey, count, continuesFrom, coverage, answers, refusedMeals, leftSomeMeals, medication, photo, symptomLayer, today, selected },
    noun,
  );
  const box: DayMarkBox = ahead ? 'outlined' : unlogged ? 'grey' : symptomDay ? 'rose' : 'white';
  const line: DayMarkLineKind = coverage === 'logged' ? 'solid' : coverage === 'left_some' ? 'broken' : 'none';
  const opens = onPress !== undefined && !ahead;
  return (
    <DayMarkFace
      dayOfMonth={dayOfMonth}
      box={box}
      line={line}
      count={symptomDay ? count : null}
      medication={medication}
      refused={!ahead && !unlogged && refusedMeals > 0}
      photo={photo}
      today={today}
      selected={selected}
      dim={dim}
      label={opens ? `${label}, opens the day` : label}
      onPress={opens ? onPress : undefined}
    />
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
  // Before the record: no box at all (History spec §3.4), only the faint date.
  boxNone: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  // The rose as a fill — a glyph tint (C-1). The count and the date on it take the
  // primary ink (see the header).
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
  // A neighbouring month's day: no edge, so the month's own squares carry the grid.
  boxDim: {
    borderColor: 'transparent',
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
    color: theme.colorTextPrimary,
    fontWeight: theme.weightSemibold,
  },
  dateUnlogged: {
    color: theme.colorTextSecondary,
  },
  dateFaint: {
    color: theme.colorTextTertiary,
  },
  count: {
    position: 'absolute',
    top: 2,
    right: 4,
    fontSize: 9,
    lineHeight: 10,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    fontVariant: ['tabular-nums'],
  },
  line: {
    height: LINE_HEIGHT,
    borderRadius: 1,
  },
  lineOnWhite: {
    backgroundColor: theme.colorAccentGlyph,
  },
  // On the rose: solid white, 3.67:1 (the retired 55% white was 2.0:1).
  lineOnRose: {
    backgroundColor: theme.colorTextOnDark,
  },
  lineBroken: {
    overflow: 'hidden',
  },
  linePosition: {
    position: 'absolute',
    left: '22%',
    right: '22%',
    bottom: 4,
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
  // A dose: a square, the one mark with corners.
  layerSquare: {
    width: 4,
    height: 4,
    borderRadius: 0.5,
  },
  // A photo read as worth a call: a diamond, a square on its point, a little larger so the
  // point reads.
  layerDiamond: {
    width: 4.5,
    height: 4.5,
    borderRadius: 0.5,
    transform: [{ rotate: '45deg' }],
  },
  layerMedication: {
    backgroundColor: theme.colorEventMedication,
  },
  // On the rose every filled mark takes a white edge, so lightness, not hue, separates it
  // from the fill (GAP-5).
  layerOnRose: {
    borderWidth: 1,
    borderColor: theme.colorTextOnDark,
  },
  // A refused meal: a hollow ring, the one OPEN layer mark, so shape tells it from the
  // filled dots; neutral ink, never an alarm colour (§04, Sam). White on the rose.
  refusedRing: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    borderWidth: 1.25,
    borderColor: theme.colorTextSecondary,
    backgroundColor: 'transparent',
  },
  refusedRingOnRose: {
    borderColor: theme.colorTextOnDark,
  },
  layerPhoto: {
    backgroundColor: theme.colorTextTertiary,
  },
  // A photo the read called worth a call: the symptom ink, paired with the spoken words.
  layerPhotoCall: {
    backgroundColor: theme.colorEventSymptomInk,
  },
});
