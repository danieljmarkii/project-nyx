// A Pet tab list whose read failed (CUL-2174). C-12: a read that has not answered is
// never an empty record, so the card says the read failed and offers the retry instead
// of its designed empty state. The line is the shipped vet visits register
// ("Mochi's visits could not be read just now."). It sits in the quiet band (CUL-1911,
// the profile round's failed read frames): a note about the screen's own state, not the pet.
import { StyleSheet, TouchableOpacity } from 'react-native';
import { colorRoles, theme } from '../../constants/theme';
import { QuietBand } from '../ui/QuietBand';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  /** The line, already naming the pet and the list. */
  line: string;
  onRetry: () => void;
  testID?: string;
}

export function listReadFailedLine(petName: string, what: string): string {
  return `${petName}’s ${what} could not be read just now.`;
}

export function ListReadFailed({ line, onRetry, testID }: Props) {
  return (
    <QuietBand testID={testID} style={styles.body} grouped={false}>
      <ThemedText style={styles.line}>{line}</ThemedText>
      <TouchableOpacity
        onPress={onRetry}
        style={styles.retry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        testID={testID ? `${testID}-retry` : undefined}
      >
        <ThemedText style={styles.retryText}>Try again</ThemedText>
      </TouchableOpacity>
    </QuietBand>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 0,
  },
  line: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextPrimary,
  },
  // The 44pt floor on the control itself, so it needs no slop beside its neighbours.
  retry: {
    minHeight: theme.hitTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  retryText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: colorRoles.action.onLight,
  },
});
