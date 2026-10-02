import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { theme } from '../../constants/theme';

// MaskHatch — the grey hatched box that marks a masking span on a chart (Engines v3, CUL-1440;
// design authority `docs/culprit-engines-v3-mockups.html` round 5, §00a / §00b / §00e).
//
// A drug that can hide the sign was on board here, or a visit was recent: the window is drawn,
// its marks are kept, and the box says "read these with the drug in view". It is a region, not
// a verdict colour, so it is the chart's neutral ground in stripes, never the symptom rose.
// Decorative: the chart's spoken label carries the span in words, so this is hidden from
// assistive tech, and it never takes a touch.

/** The stripe's period in pt — a fixed pattern size, so the hatch reads the same at any width. */
const STRIPE_PERIOD = 6;
const STRIPE_WIDTH = 2;

export function MaskHatch({ testID }: { testID?: string }) {
  const id = `mask-hatch-${useId().replace(/:/g, '')}`;
  return (
    <View
      pointerEvents="none"
      style={styles.fill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={STRIPE_PERIOD} height={STRIPE_PERIOD} patternTransform="rotate(45)">
            <Rect x={0} y={0} width={STRIPE_PERIOD} height={STRIPE_PERIOD} fill={theme.colorSurfaceSubtle} />
            <Line x1={0} y1={0} x2={0} y2={STRIPE_PERIOD} stroke={theme.colorBorder} strokeWidth={STRIPE_WIDTH} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.radiusXS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colorBorder,
    overflow: 'hidden',
  },
});
