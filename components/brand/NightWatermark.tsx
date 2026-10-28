import { useId } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Mask, Rect, Stop } from 'react-native-svg';
import { theme } from '../../constants/theme';
import { MARK_GEOMETRY } from './CulpritMark';

// The night watermark (CUL-2224; ruled in docs/culprit-moon-watermark-mockups.html,
// round 4): the Culprit mark drawn as one hairline in the empty space of a night screen,
// the way Linear shows its logo on an empty chat. It belongs to the Daily Recap's
// zero-log state ONLY. A day with content carries none: on a symptom day the top of the
// recap is a safety surface, and decoration never sits under safety content (brand spec
// §7.5).
//
// Three outlines from CulpritMark's own geometry: the moon's arc outside the carve, the
// carve's arc inside the moon, and a ring where the Signal dot sits. Drawing outlines
// keeps the carve rule (§1.1): the ground passes through the crescent. The dot is a
// ring, never teal; teal stays the mark's own dot.
//
// STILL (Principle 9). No loop, no entrance, nothing for Reduce Motion to switch off.
// Decorative: no touch, hidden from assistive tech, so the copy above it carries the
// screen.

const { viewBox: VIEW_BOX, moon: MOON, carve: CARVE, dot: DOT } = MARK_GEOMETRY;

// The fade, in the mark's 100-unit design space (userSpaceOnUse, so it reads off the
// mark, not each circle's own box): full at the crescent's top, gone three quarters down.
const FADE_FROM_Y = 16;
const STROKE_FADE_TO_Y = 78;
const FILL_FADE_TO_Y = 70;
// The mock's values; how faint it reads is an on-device check (CUL-2224 acceptance).
const STROKE_PEAK_OPACITY = 0.24;
const FILL_PEAK_OPACITY = 0.55;
// One point on screen at any size: the viewBox scales, so the stroke is given in design
// units that land on 1pt.
const STROKE_PT = 1;

export interface NightWatermarkProps {
  /** Rendered size in pt (square). */
  size: number;
  style?: StyleProp<ViewStyle>;
}

export function NightWatermark({ size, style }: NightWatermarkProps) {
  // Unique ids per instance: react-native-web renders real DOM <svg>, where two
  // instances sharing a def id would let one override the other.
  const id = useId();
  const strokeId = `nwStroke-${id}`;
  const fillId = `nwFill-${id}`;
  const outsideCarveId = `nwOutsideCarve-${id}`;
  const insideMoonId = `nwInsideMoon-${id}`;
  const strokeWidth = (STROKE_PT * VIEW_BOX) / size;
  const line = { fill: 'none', stroke: `url(#${strokeId})`, strokeWidth } as const;

  return (
    <View
      style={[{ width: size, height: size }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="night-watermark"
    >
      <Svg width={size} height={size} viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}>
        <Defs>
          <LinearGradient id={strokeId} gradientUnits="userSpaceOnUse" x1={0} y1={FADE_FROM_Y} x2={0} y2={STROKE_FADE_TO_Y}>
            <Stop offset="0" stopColor={theme.colorWatermarkOnNight} stopOpacity={STROKE_PEAK_OPACITY} />
            <Stop offset="1" stopColor={theme.colorWatermarkOnNight} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={fillId} gradientUnits="userSpaceOnUse" x1={0} y1={FADE_FROM_Y} x2={0} y2={FILL_FADE_TO_Y}>
            <Stop offset="0" stopColor={theme.colorBrandNightElevated} stopOpacity={FILL_PEAK_OPACITY} />
            <Stop offset="1" stopColor={theme.colorBrandNightElevated} stopOpacity={0} />
          </LinearGradient>
          {/* The crescent is the moon minus the carve: its outer arc is the moon's circle
              kept outside the carve, its inner arc the carve's circle kept inside the moon. */}
          <Mask id={outsideCarveId} maskUnits="userSpaceOnUse" x={0} y={0} width={VIEW_BOX} height={VIEW_BOX}>
            <Rect x={0} y={0} width={VIEW_BOX} height={VIEW_BOX} fill={theme.colorMaskKeep} />
            <Circle cx={CARVE.cx} cy={CARVE.cy} r={CARVE.r} fill={theme.colorMaskCut} />
          </Mask>
          <Mask id={insideMoonId} maskUnits="userSpaceOnUse" x={0} y={0} width={VIEW_BOX} height={VIEW_BOX}>
            <Circle cx={MOON.cx} cy={MOON.cy} r={MOON.r} fill={theme.colorMaskKeep} />
          </Mask>
        </Defs>
        <Circle cx={MOON.cx} cy={MOON.cy} r={MOON.r} fill={`url(#${fillId})`} mask={`url(#${outsideCarveId})`} />
        <Circle cx={MOON.cx} cy={MOON.cy} r={MOON.r} mask={`url(#${outsideCarveId})`} {...line} />
        <Circle cx={CARVE.cx} cy={CARVE.cy} r={CARVE.r} mask={`url(#${insideMoonId})`} {...line} />
        <Circle cx={DOT.cx} cy={DOT.cy} r={DOT.r} {...line} />
      </Svg>
    </View>
  );
}
