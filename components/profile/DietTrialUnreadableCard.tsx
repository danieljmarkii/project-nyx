// The Pet tab's trial slot when the trial read failed (CUL-1458). Presentation only;
// the line comes from `lib/dietTrialCard`.
//
// It sits in the same slot, under the same kicker, as `DietTrialCard`, so the section
// the owner expects is still there. It carries no Start: whether a trial is running is
// exactly what the read could not say, and the start form over a running trial is the
// end-the-current-one flow (one active trial per pet is a DB constraint).
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { trialCardUnreadableLine } from '../../lib/dietTrialCard';
import { TRY_AGAIN } from '../../lib/trialScreenModel';
import { Card } from '../ui/Card';
import { PrimaryButton } from '../ui/PrimaryButton';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  petName: string;
  onRetry: () => void;
  /** The retry is in flight. The card stays up meanwhile (the status stays
   *  `unreadable` until a read answers), so the button says it is working. */
  retrying: boolean;
  style?: ViewStyle;
  onLayout?: (e: LayoutChangeEvent) => void;
}

export function DietTrialUnreadableCard({ petName, onRetry, retrying, style, onLayout }: Props) {
  return (
    <Card style={style} onLayout={onLayout}>
      <View testID="trial-card-unreadable" style={styles.body}>
        <ThemedText style={styles.kicker}>Diet trial</ThemedText>
        <ThemedText style={styles.line}>{trialCardUnreadableLine(petName)}</ThemedText>
        <PrimaryButton
          label={TRY_AGAIN}
          variant="secondary"
          onPress={onRetry}
          loading={retrying}
          testID="trial-card-unreadable-action"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: theme.space2,
  },
  // Mirrors `DietTrialCard`'s kicker, so the slot reads as the same section.
  kicker: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
  },
  line: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextPrimary,
  },
});
