import { StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { PrimaryButton } from '../ui/PrimaryButton';
import { ThemedText } from '../ui/ThemedText';
import { AppointmentBlock } from './AppointmentBlock';
import { AppointmentActions } from './AppointmentActions';
import type { VetVisitsCardModel } from '../../lib/vetVisits';

interface Props {
  model: VetVisitsCardModel;
  /** The RECORD's pet, resolved by the caller (never `activePet`) — CUL-574. */
  petName: string;
  onOpen: () => void;
  /**
   * Opens the notes for `model.next`. The Pet tab is the ONLY surface that can carry
   * this door at booking distance (CUL-966) — see the header note.
   */
  onTakeNotes: (appointmentId: string) => void;
  /** E2's two doors, rendered here only at zero visits and zero bookings. */
  onBook: () => void;
  onLogPast: () => void;
  style?: ViewStyle;
}

// The Pet tab's home for the companion (mock A1; G2 — the Pet tab is the home,
// Home is the moment).
//
// Sits between the Vet report card and Vet Files, and the order is the argument:
// the vet cluster reads top-down as report → visits → files. Same anatomy as both
// siblings — title, count, blurb, one action — because the shipped profile is a
// stack of full cards and a compact row here would read as a lesser thing than the
// two it sits between.
//
// At zero visits AND zero bookings it renders E2's two doors in place of the
// appointment and the plan line (Principle 5: an empty state is a feature, not a
// gap). A booking with no history is NOT that state — that is the card doing its
// job on day one.
//
// IT ALSO CARRIES THE NOTES DOOR, AND IT IS THE ONLY SURFACE THAT CAN (CUL-966).
// Notes open when the visit is booked, which may be six weeks out; Home's strip
// only reaches five days (`APPOINTMENT_WINDOW_DAYS`) and Get ready is reached
// THROUGH that strip, so at booking distance neither exists. Without this door the
// notes are four taps deep behind *Open visits*, which is the state the PM hit on
// device. `AppointmentActions` is reused rather than a local button so the label,
// the target size and the a11y wording match the list exactly — and it takes only
// `onAtTheVet`, because *How did it go?* is gated and does not belong on a card
// whose job is "what is next".
export function VetVisitsCard({ model, petName, onOpen, onTakeNotes, onBook, onLogPast, style }: Props) {
  if (model.isEmpty) {
    return (
      <Card style={style}>
        <ThemedText style={styles.title}>Vet visits</ThemedText>
        <ThemedText style={styles.blurb}>
          {petName}’s next appointment, what each visit changed, and everything to bring.
        </ThemedText>
        <PrimaryButton label="Add the next visit" onPress={onBook} variant="secondary" style={styles.button} />
        <PrimaryButton
          label="Log a visit that already happened"
          onPress={onLogPast}
          variant="secondary"
          style={styles.buttonStacked}
        />
      </Card>
    );
  }

  return (
    <Card style={style}>
      <View style={styles.head}>
        <ThemedText style={styles.title}>Vet visits</ThemedText>
        {model.countLabel ? <ThemedText style={styles.count}>{model.countLabel}</ThemedText> : null}
      </View>

      {model.next ? (
        <>
          <AppointmentBlock appointment={model.next} variant="inset" style={styles.appointment} />
          {/* Directly under the block it is about, so "this visit" needs no label to
              disambiguate it from the last-visit line below. A touchable cannot live
              INSIDE the block — that is one `accessible` node on purpose, and a
              control inside one is hidden from assistive tech entirely. */}
          <AppointmentActions
            petName={petName}
            onAtTheVet={() => onTakeNotes(model.next!.id)}
          />
        </>
      ) : null}

      {model.lastVisitLine ? (
        <ThemedText style={styles.blurb} numberOfLines={2}>
          {model.lastVisitLine}
        </ThemedText>
      ) : null}

      <PrimaryButton label="Open visits" onPress={onOpen} variant="secondary" style={styles.button} />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space1,
  },
  // Token parity with both siblings (B-553): the Vet report card above and the Vet
  // Files card below use textMD / weightMedium / colorNeutralDark.
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  count: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  blurb: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: 8,
  },
  appointment: {
    marginTop: 10,
  },
  button: {
    marginTop: 11,
  },
  buttonStacked: {
    marginTop: theme.space1,
  },
});
