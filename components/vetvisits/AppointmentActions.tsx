import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  /**
   * Opens the notes screen. Present from the moment the booking exists (CUL-966) —
   * this door has no window and no phase.
   */
  onAtTheVet?: () => void;
  /**
   * Opens "How did it go?". Optional because the doors are gated SEPARATELY and
   * this is one of the gated ones: see the header note.
   */
  onHowDidItGo?: () => void;
  /**
   * Cancels the appointment (CUL-952). Rendered only where the app is ASKING whether
   * the visit happened — the *Waiting on you* bucket — because "it didn't happen" is
   * an answer to a question, and on a booking still ahead there is no question yet.
   * Moving a future booking is `onChange`'s job; this one is for a day that passed.
   */
  onDidntHappen?: () => void;
  /**
   * Opens the appointment's own edit (CUL-952). Optional only so this component
   * stays usable by a caller that has no route for it; every shipped caller passes
   * it, because a booking with no way to change it is the defect this closes.
   */
  onChange?: () => void;
  /** Named in both labels, so a multi-pet list never leaves "which pet" to position. */
  petName: string;
}

// The two doors under a booked appointment (CUL-902 VV-4; re-gated CUL-966).
//
// THE TWO DOORS ARE GATED SEPARATELY, AND THE ASYMMETRY IS THE POINT. Until CUL-966
// both were withheld together until the appointment's own day, and the reason given
// was a mis-tap on a recheck booked six weeks out. That reason only ever described
// *How did it go?*, which writes a `vet_visits` row, marks the booking attended and
// moves the vet report's window with no way back before VV-6's delete. *Take notes*
// writes a draft on a row that already exists and is harmless at any distance — and
// withholding it was the defect: the PM wanted to start jotting days in advance and
// the app opened the field on the morning of. So notes are ungated and the finish
// door keeps its gate, which is why BOTH props are optional and neither implies the
// other.
//
// A SEPARATE COMPONENT, not props on `AppointmentBlock`, because that block is ONE
// `accessible` node on purpose — it reads "Tuesday · 3:00 pm, Riverside Animal
// Hospital · recheck" as a sentence rather than four fragments — and a touchable
// placed inside an `accessible` container is hidden from assistive tech entirely.
// The block states; this acts.
//
// *Get ready* is VV-5's and is LEFT OUT rather than rendered inert: `disabled` is an
// accessibility claim that a control exists and is unavailable (C-7), which would be
// a lie about one that has not been built. The doors arrive with their destinations —
// the rule `AppointmentBlock` already states, and the rule CUL-952 was: *Change the
// appointment* shipped on Get ready's ⋯ with no destination, so it pushed the visits
// list, where the only control is *Add*.
//
// THE ORDER IS FIXED HERE, not per caller, and it is chosen so one order reads
// correctly in both buckets. Under *Next* the row is `Take notes · Change` (plus the
// finish door on the day); under *Waiting on you* it is
// `Take notes · How did it go? · It didn't happen · Change`. The two ANSWERS land
// adjacent, which is what that section is asking for, and *Change* sits last as the
// least-common action — while the shipped order under *Next* is untouched.
export function AppointmentActions({
  onAtTheVet,
  onHowDidItGo,
  onDidntHappen,
  onChange,
  petName,
}: Props) {
  return (
    <View style={styles.row}>
      {onAtTheVet ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onAtTheVet}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Take notes for ${petName}’s visit`}
        >
          <ThemedText style={styles.actionLabel}>Take notes</ThemedText>
        </TouchableOpacity>
      ) : null}
      {onHowDidItGo ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onHowDidItGo}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Log how ${petName}’s visit went`}
        >
          <ThemedText style={styles.actionLabel}>How did it go?</ThemedText>
        </TouchableOpacity>
      ) : null}
      {onDidntHappen ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onDidntHappen}
          activeOpacity={0.7}
          accessibilityRole="button"
          // The label says whose and what, because the visible text is a bare
          // pronoun — "It didn’t happen" announced alone, out of the block above it,
          // names nothing.
          accessibilityLabel={`${petName}’s visit didn’t happen`}
        >
          {/* Home's own verb, verbatim (`AppointmentStrip`'s *It didn’t*), so one
              write has one name wherever the app offers it. Here it carries NO
              five-day window: past that the strip stops asking and this list is the
              only surface left that can answer. */}
          <ThemedText style={styles.actionLabel}>It didn’t happen</ThemedText>
        </TouchableOpacity>
      ) : null}
      {onChange ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onChange}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Change ${petName}’s appointment`}
        >
          <ThemedText style={styles.actionLabel}>Change</ThemedText>
        </TouchableOpacity>
      ) : null}
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
