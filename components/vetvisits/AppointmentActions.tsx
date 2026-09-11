import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  /** Opens "At the vet" — absent once the appointment's day has passed. */
  onAtTheVet?: () => void;
  onHowDidItGo: () => void;
  /** Named in both labels, so a multi-pet list never leaves "which pet" to position. */
  petName: string;
}

// The two doors under a booked appointment (CUL-902 VV-4).
//
// A SEPARATE COMPONENT, not props on `AppointmentBlock`, because that block is ONE
// `accessible` node on purpose — it reads "Tuesday · 3:00 pm, Riverside Animal
// Hospital · recheck" as a sentence rather than four fragments — and a touchable
// placed inside an `accessible` container is hidden from assistive tech entirely.
// The block states; this acts.
//
// *Get ready* and *Change the appointment* are VV-5's and are LEFT OUT rather than
// rendered inert: `disabled` is an accessibility claim that a control exists and is
// unavailable (C-7), which would be a lie about one that has not been built. The
// doors arrive with their destinations — the rule `AppointmentBlock` already states.
export function AppointmentActions({ onAtTheVet, onHowDidItGo, petName }: Props) {
  return (
    <View style={styles.row}>
      {onAtTheVet ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onAtTheVet}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Take notes at ${petName}’s visit`}
        >
          <ThemedText style={styles.actionLabel}>At the vet</ThemedText>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={styles.action}
        onPress={onHowDidItGo}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Log how ${petName}’s visit went`}
      >
        <ThemedText style={styles.actionLabel}>How did it go?</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // Two touchable siblings: `gap >= facing hitSlop(a) + facing hitSlop(b)` (C-5).
    // Neither carries hitSlop — each is a real box already at the 44pt floor — so
    // the gap only separates two boxes, and it splits into column/row because the
    // row may wrap at a narrow width with a long pet name in both labels.
    flexWrap: 'wrap',
    columnGap: theme.space2,
    rowGap: theme.space1,
    marginTop: theme.space2,
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  actionLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
});
