import { StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui/PrimaryButton';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  /** The RECORD's pet, resolved by the caller (never `activePet`) — CUL-574. */
  petName: string;
  onBook: () => void;
  onLogPast: () => void;
}

// Mock E2 — and the spec is explicit that this is "the primary screen for most
// owners most of the time", not a gap to fill (Principle 5).
//
// Two doors rather than one, because they are two different jobs and neither is a
// lesser version of the other: an owner with an appointment on the calendar is
// booking; an owner who just got home from the clinic is recording. Making one of
// them a mode of the other would put a decision between the owner and the thing
// they came to do.
//
// The closing line is the honest reason to bother, and it is TRUE today rather
// than a promise about this feature: the vet report's window already starts at the
// most recent visit on file (the report's scope cascade, rung 1). It is stated in
// the present tense because that is the tense it is true in.
export function VetVisitsEmptyState({ petName, onBook, onLogPast }: Props) {
  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.title}>{petName}’s visits, in one place</ThemedText>
      <ThemedText style={styles.body}>
        The next appointment, what each visit changed, and everything to bring — so the 15
        minutes in the room count.
      </ThemedText>

      <View style={styles.actions}>
        <PrimaryButton label="Add the next visit" onPress={onBook} variant="accent" />
        <PrimaryButton
          label="Log a visit that already happened"
          onPress={onLogPast}
          variant="secondary"
          style={styles.secondAction}
        />
      </View>

      <ThemedText style={styles.footnote}>
        Your vet report already starts from the last visit you log.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space3,
    paddingBottom: theme.space4,
  },
  title: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
    textAlign: 'center',
  },
  body: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    marginTop: theme.space1,
    maxWidth: 300,
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: theme.space3,
  },
  secondAction: {
    marginTop: theme.space1,
  },
  footnote: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextTertiary,
    textAlign: 'center',
    marginTop: theme.space2,
    maxWidth: 280,
  },
});
