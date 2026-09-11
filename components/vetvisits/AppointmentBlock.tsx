import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
  style?: StyleProp<ViewStyle>;
}

// The booked visit, drawn (mock A1 / E1 "Next").
//
// Information, not an action: the two doors the mock puts here — Get ready and
// Change — belong to VV-5 and VV-4, and neither exists yet. They are LEFT OUT
// rather than rendered inert, because `disabled` is an accessibility CLAIM that a
// control exists and is unavailable (C-7), which would be a lie about a control
// that has not been built. The doors arrive with their destinations.
//
// No urgency styling, ever (§4.1 A2): an appointment is context. The register here
// is the trial strip's, not the Signal's — a safety card must always outrank it,
// which on the Pet tab it does by not competing.
export function AppointmentBlock({ appointment, variant = 'plain', style }: Props) {
  const { stamp } = appointment;
  return (
    // One accessible node: a screen reader reads "Tuesday · 3:00 pm, Riverside
    // Animal Hospital · recheck" as one sentence rather than four fragments, and
    // the date block's two numerals stop being their own stop.
    <View
      style={[styles.row, variant === 'inset' && styles.inset, style]}
      accessible
      accessibilityLabel={[appointment.when, appointment.where].filter(Boolean).join(', ')}
    >
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
