import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';

interface Props {
  // 1-based index of the step the owner is on. Segments 1..current read as
  // "reached" (filled); the rest are pending. Clamped to [0, total] so an
  // off-by-one from a caller can never over/under-fill.
  current: number;
  // How many steps the bar spans. The onboarding pet-setup flow is 5 (type,
  // name, breed, gender, age); paywall/done sit outside the bar (spec §3 / S5).
  total: number;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * A calm, segmented step indicator for the onboarding pet-setup flow (B-251 PR 4).
 * Restraint over decoration (Principle 6, the Calm/Linear bar): a thin row of
 * equal segments, filled in the single interactive accent as the owner advances,
 * so "where am I / how much is left" reads at a glance without a number to parse.
 * Each pet-setup screen owns its own step number and renders one of these — the
 * component is presentational and stateless.
 */
export function ProgressBar({ current, total, containerStyle }: Props) {
  // Nothing sensible to draw for a non-positive total — render an empty,
  // still-labelled container rather than crash on a bad caller.
  const steps = Math.max(0, Math.floor(total));
  const reached = Math.min(Math.max(0, current), steps);

  return (
    <View
      style={[styles.row, containerStyle]}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${reached} of ${steps}`}
      accessibilityValue={{ min: 0, max: steps, now: reached }}
    >
      {Array.from({ length: steps }, (_, i) => {
        const filled = i < reached; // 0-based index i => step (i+1) <= reached
        return (
          <View
            key={i}
            testID={`progress-segment-${i}`}
            style={[styles.segment, filled ? styles.segmentFilled : styles.segmentEmpty]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    width: '100%',
  },
  segment: {
    flex: 1,
    // A hairline bar — below the 8pt layout grid on purpose (it's a rule, not
    // layout rhythm, same rationale as spaceMicro). radiusFull rounds the caps.
    height: 4,
    borderRadius: theme.radiusFull,
  },
  segmentFilled: {
    backgroundColor: theme.colorAccent,
  },
  segmentEmpty: {
    backgroundColor: theme.colorBorder,
  },
});
