// The quiet band a log picker shows when its library read throws (CUL-2168; the log
// form design pass §05). Before this, both pickers kept their initial empty arrays and
// said "No foods yet" / "No medications yet" to an owner with a full library, and one
// who believed it could capture the bottle again: a second medication row, whose doses
// then sit outside the running course. So a failed read says so, and offers the way back.
// Shared by FoodPicker and MedicationPicker so the two read as one family, on the kit's
// QuietBand (CUL-2189) like the Pet tab's failed reads.
import { Pressable, StyleSheet } from 'react-native';
import { colorRoles, theme } from '../../constants/theme';
import { QuietBand } from '../ui/QuietBand';
import { ThemedText } from '../ui/ThemedText';

export const PICKER_READ_FAILED_TEST_ID = 'picker-read-failed';
export const PICKER_TRY_AGAIN = 'Try again';

export function PickerReadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <QuietBand style={styles.band} testID={PICKER_READ_FAILED_TEST_ID} grouped={false}>
      <ThemedText style={styles.message}>{message}</ThemedText>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={PICKER_TRY_AGAIN}
        style={styles.action}
      >
        <ThemedText style={styles.actionText}>{PICKER_TRY_AGAIN}</ThemedText>
      </Pressable>
    </QuietBand>
  );
}

const styles = StyleSheet.create({
  // The link owns the band's bottom edge (below), so the band drops its bottom padding.
  band: {
    paddingBottom: 0,
  },
  message: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextPrimary,
  },
  // The link owns the band's bottom edge at the touch floor, so the target is the
  // full 44pt without a hitSlop reaching outside the band.
  action: {
    alignSelf: 'flex-start',
    minHeight: theme.hitTarget,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: colorRoles.action.onLight,
  },
});
