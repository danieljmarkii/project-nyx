import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import type { TrialDoorRowModel } from '../../lib/trialDoorRow';

// The Pet tab's door to the trial's own screen (TS-6 · CUL-1302; spec §5.2, R-3, S8). One
// 44pt row, no buttons: the eyebrow, the title, the day bar, the sub-line, a chevron. It
// draws `lib/trialDoorRow.ts` and decides nothing; the Pet tab holds the gate and the push.
//
// In the namespace so the flag-off guard can stub it: flag-off, the Pet tab's tree must equal
// the tree with this file absent (`guards/trialScreenFlagOff.test.tsx`, C-36).
//
// The whole row is ONE accessible button carrying the model's sentence, so the bar is never
// the only place the day lives and VoiceOver reads the door once, not as five fragments.

export function TrialDoorRow({
  model,
  onPress,
  onLayout,
  style,
}: {
  model: TrialDoorRowModel;
  onPress: () => void;
  /** CUL-170's anchor: a leftover `focus=trial` link still lands on the trial's slot. */
  onLayout?: (e: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityLabel={model.accessibilityLabel}
      testID="trial-door-row"
      style={[styles.row, style]}
    >
      <View style={styles.body}>
        <ThemedText style={styles.eyebrow}>{model.eyebrow}</ThemedText>
        <ThemedText style={styles.title}>{model.title}</ThemedText>
        {model.progressFraction !== null ? (
          <View style={styles.track} testID="trial-door-row-track">
            <View style={[styles.fill, { width: `${model.progressFraction * 100}%` }]} />
          </View>
        ) : null}
        {model.subline !== null ? (
          <ThemedText style={styles.subline} testID="trial-door-row-subline">{model.subline}</ThemedText>
        ) : null}
      </View>
      <View style={styles.chevronWell}>
        <ChevronRight size={18} color={theme.colorTextTertiary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: 44,
    // The card's padding, so the row sits in the card's slot at the card's inset.
    padding: theme.space3,
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    marginTop: theme.space0_5,
  },
  // The card's own bar (`components/profile/DietTrialCard`), so the door reads as the
  // card's summary rather than a new chart.
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
    marginTop: theme.space1,
  },
  fill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colorAccent,
  },
  subline: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  chevronWell: {
    width: theme.space4,
    height: theme.space4,
    borderRadius: theme.radiusFull,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colorNeutralLight,
  },
});
