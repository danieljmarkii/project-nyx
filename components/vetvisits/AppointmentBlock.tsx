import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import type { AppointmentView } from '../../lib/vetVisits';

interface Props {
  appointment: AppointmentView;
  /**
   * `inset` is the tinted block inside the Pet-tab card (mock A1); `plain` is the
   * standalone row at the top of the list (mock E1). Same anatomy, two grounds.
   */
  variant?: 'plain' | 'inset';
  /**
   * Opens Get ready for this appointment (CUL-987 D1). Every shipped caller passes
   * it; optional so the block still draws where no destination exists.
   */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

// The booked visit, drawn (mock A1 / E1 "Next").
//
// THE BLOCK ITSELF IS THE DOOR TO GET READY (CUL-987 D1, PM ruling 2026-09-22 — on
// every face, wherever it renders). Home is where an owner finds out the date is
// wrong, and until this Home was the one screen with no way to act on it: the block
// was inert everywhere, so rescheduling started with an unlabeled ⋯ four taps away.
// Ruled (a) over a third *Change* door because it adds no label to a strip the
// Designer's condition says must stay quiet — and because a navigation is not a
// write, `guards/homeWrites.test.ts` is untouched by it. The passed-day faces carry
// it too (the strip's ask, *Waiting on you*): a visit that MOVED is found exactly
// there, and Get ready's ⋯ holds *Change the appointment*.
//
// SPLIT BY HOST (C-7). With `onPress` it is a touchable; without one it is the
// plain `accessible` View it always was. Never a `disabled` touchable — that claims a
// control exists and is unavailable.
//
// No urgency styling, ever (§4.1 A2): an appointment is context. The register here
// is the trial strip's, not the Signal's — a safety card must always outrank it,
// which on the Pet tab it does by not competing. No chevron and no label either: the
// press state is the whole affordance, which is the cost of D1 (a) the ruling took.
export function AppointmentBlock({ appointment, variant = 'plain', onPress, style }: Props) {
  const { stamp } = appointment;
  // One accessible node: a screen reader reads "Tuesday · 3:00 pm, Riverside Animal
  // Hospital · recheck" as one sentence rather than four fragments, and the date
  // block's two numerals stop being their own stop. The label is the VISIBLE text on
  // both hosts (C-7: never invent a label that differs from it); where it opens is the
  // hint's job.
  const label = [appointment.when, appointment.where].filter(Boolean).join(', ');
  const body = (
    <>
      {stamp ? (
        <View style={styles.stamp} importantForAccessibility="no-hide-descendants">
          <ThemedText style={styles.stampDay}>{stamp.day}</ThemedText>
          <ThemedText style={styles.stampMonth}>{stamp.month}</ThemedText>
        </View>
      ) : null}
      <View style={styles.main}>
        <ThemedText style={styles.when}>{appointment.when}</ThemedText>
        {appointment.where ? (
          <ThemedText style={styles.where} numberOfLines={2}>
            {appointment.where}
          </ThemedText>
        ) : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        // No hitSlop: the block is already far larger than the 44pt floor, and slop
        // would reach toward the doors beneath it (C-5).
        style={[styles.row, variant === 'inset' && styles.inset, style]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens Get ready for this visit"
      >
        {body}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[styles.row, variant === 'inset' && styles.inset, style]}
      accessible
      accessibilityLabel={label}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  inset: {
    padding: 10,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorAccentLight,
  },
  stamp: {
    width: 38,
    alignItems: 'center',
  },
  stampDay: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  stampMonth: {
    fontSize: theme.textMicro,
    fontWeight: theme.weightSemibold,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorTextTertiary,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  when: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  where: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
});
