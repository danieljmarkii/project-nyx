import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colorRoles, theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import type { VetReminderStatus } from '../../hooks/useVetReminders';

// Remind me, on the booking sheet (CUL-2728; spec §5, mock round 2 §4). The owner
// intent that may spend the primer and the one OS prompt, so it is a choice the booking
// CARRIES: a tap marks it, and the screen applies it after Save has closed the sheet
// (T3, C-14). It never blocks or delays the booking.
//
// Four faces, one per state of the account's switch on THIS phone:
//   • off (or still loading) → a checkbox. Picked, its sub line names the reminders this
//     booking will actually get (D2), from the planner's own instants and R2 rule.
//   • on → no control: one line naming the times (D2), or that this visit is too soon
//     for one when none is left to fire (CUL-2729 D3).
//   • denied → inert, with the one door out. The inert half is a plain view, never a
//     control marked disabled (C-7); Open Settings is the only button.

export const REMIND_ME_LABEL = 'Remind me';
export const REMIND_ME_SUB = 'Three days before at 6pm, and the morning of';
export const REMIND_ME_DENIED = 'Notifications are off for Culprit in Settings.';

interface Props {
  status: VetReminderStatus;
  picked: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  /** The reminders this booking would still get, described ('Friday at 6:00 pm'), in
   *  fire order. Empty when none is left (booked after the day's last one). */
  times: readonly string[];
  /** The account holds one pet, so the picked line never says "every pet" (CUL-2729). */
  onePet?: boolean;
}

function capitalise(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** What a booking too close for any reminder says (CUL-2729 D3, PM 2026-11-14). Without
 *  it the row's check read as "this visit is covered" on a visit nothing will fire for. */
export const REMIND_ME_TOO_SOON_PICKED = 'Too soon for this visit. Turns on reminders for later ones.';
export const REMIND_ME_TOO_SOON_ON = 'Reminders are on. This visit is too soon for one.';

/** 'Friday at 6:00 pm and Monday at 8:00 am, for every pet’s visits' (the picked line).
 *  The switch is account-wide, so the tail says what else it covers; a one-pet account
 *  has no "every pet". */
export function pickedLine(times: readonly string[], onePet = false): string {
  if (times.length === 0) return REMIND_ME_TOO_SOON_PICKED;
  return `${capitalise(times.join(' and '))}, ${onePet ? 'for every visit you book' : 'for every pet’s visits'}`;
}

/** The on line (D2): the times this booking gets, or that it is too soon for any. */
export function onLine(times: readonly string[]): string {
  if (times.length === 0) return REMIND_ME_TOO_SOON_ON;
  return `You’ll get ${times.length === 1 ? 'a reminder' : 'reminders'} ${times.join(' and ')}.`;
}

export function RemindMeRow({ status, picked, onToggle, onOpenSettings, times, onePet = false }: Props) {
  if (status === 'on') {
    const line = onLine(times);
    return (
      <View style={[styles.box, styles.onBox]} accessible accessibilityLabel={line}>
        <Check size={theme.space2} color={colorRoles.positive.textOnLight} strokeWidth={2} />
        <ThemedText style={styles.onText}>{line}</ThemedText>
      </View>
    );
  }

  if (status === 'denied') {
    return (
      <View style={styles.box}>
        <View style={styles.main} accessible accessibilityLabel={`${REMIND_ME_LABEL}. ${REMIND_ME_DENIED}`}>
          <ThemedText style={[styles.label, styles.labelInert]}>{REMIND_ME_LABEL}</ThemedText>
          <ThemedText style={styles.sub}>{REMIND_ME_DENIED}</ThemedText>
        </View>
        <TouchableOpacity
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
          style={styles.settings}
        >
          <ThemedText style={styles.settingsText}>Open Settings</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  const sub = picked ? pickedLine(times, onePet) : REMIND_ME_SUB;
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked }}
      // The sub line is content (the times this booking gets), so it is read with the
      // label, never as a hint a reader may have switched off.
      accessibilityLabel={`${REMIND_ME_LABEL}. ${sub}`}
      style={[styles.box, picked && styles.pickedBox]}
    >
      <View style={[styles.check, picked && styles.checkOn]}>
        {picked ? <Check size={theme.space2} color={colorRoles.action.labelOnFill} strokeWidth={2.5} /> : null}
      </View>
      <View style={styles.main}>
        <ThemedText style={[styles.label, picked && styles.labelPicked]}>{REMIND_ME_LABEL}</ThemedText>
        <ThemedText style={styles.sub}>{sub}</ThemedText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: theme.space2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    padding: theme.space1,
    paddingHorizontal: theme.space2,
    minHeight: theme.hitTarget,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  // Choosing is acting, so a picked row is the selected role's indigo (R2); the on
  // line is a fact, so it takes the positive wash.
  pickedBox: {
    backgroundColor: colorRoles.selected.ground,
    borderColor: colorRoles.selected.edge,
  },
  onBox: {
    backgroundColor: colorRoles.positive.wash,
    borderColor: colorRoles.positive.wash,
  },
  check: {
    width: theme.space3,
    height: theme.space3,
    borderRadius: theme.radiusXS,
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: colorRoles.action.fill,
    borderColor: colorRoles.action.fill,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: colorRoles.action.onLight,
  },
  labelPicked: {
    color: colorRoles.selected.ink,
  },
  labelInert: {
    color: theme.colorTextDisabled,
  },
  sub: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  onText: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightMedium,
    color: colorRoles.positive.textOnLight,
  },
  settings: {
    minHeight: theme.hitTarget,
    justifyContent: 'center',
  },
  settingsText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: colorRoles.action.onLight,
  },
});
