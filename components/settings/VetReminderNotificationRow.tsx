import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colorRoles, theme } from '../../constants/theme';
import { Card } from '../ui';
import { ThemedText } from '../ui/ThemedText';
import { SettingsRow } from './SettingsRow';
import { NotificationPrimer } from '../notifications/NotificationPrimer';
import { ensurePermission, type NotificationPermission } from '../../lib/notifications';
import { VET_VISIT_PRIMER, vetRemindersOn } from '../../lib/vetReminderNotifications';
import {
  setVetReminders,
  VET_REMINDERS_FAILED_MESSAGE,
  VET_REMINDERS_ON_MESSAGE,
} from '../../hooks/useVetReminders';
import { useSnackbarStore } from '../../store/snackbarStore';

// The vet visit reminders' switch (CUL-2728; docs/nyx-vet-reminder-requirements.md §5,
// mock round 2 §3). Off by default (G6, R3), account-wide (the `vet_visit` row of
// `notification_preferences`, every pet), with the screen's three honest states:
//
//   • allowed → a tap writes straight through and re-plans the schedule.
//   • never asked → a tap opens the primer; only its Turn on spends the one OS prompt,
//     and only a grant turns the switch on (no on-while-denied lie).
//   • denied → inert under the screen's banner, which explains it.
//
// A fourth state, as the daily summary's: on for the account (another phone) while THIS
// phone has never been asked. The switch reads off, because nothing fires here, and a
// hint says why. A tap walks the primer rather than turning the account off.

export const VET_REMINDER_ROW_LABEL = 'Vet visit reminders';
export const VET_REMINDER_ROW_SUBLABEL = 'Three days before at 6pm, and the morning of';

interface Props {
  /** The screen's permission read; null while it is in flight (the row renders nothing). */
  permission: NotificationPermission | null;
  /** The primer's prompt answered: the screen re-renders its banner from this. */
  onPermissionChange: (p: NotificationPermission) => void;
  /** The single pet's name for the primer's lead; null on a multi-pet account. */
  petName: string | null;
}

export function VetReminderNotificationRow({ permission, onPermissionChange, petName }: Props) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [primerVisible, setPrimerVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void vetRemindersOn().then((v) => {
        if (!cancelled) setOn(v);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (permission === null) return null;
  const denied = permission === 'denied';
  const switchOn = primerVisible || (permission === 'granted' && on);
  const onElsewhere = permission === 'undetermined' && on && !primerVisible;

  const write = async (next: boolean) => {
    const before = on;
    setOn(next); // optimistic
    setBusy(true);
    try {
      await setVetReminders(next);
      if (next) useSnackbarStore.getState().show({ message: VET_REMINDERS_ON_MESSAGE });
    } catch (e) {
      console.warn('[vet reminders] toggle failed:', e);
      setOn(before);
      Alert.alert('Couldn’t update', 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (next: boolean) => {
    if (busy) return;
    if (!next || permission === 'granted') {
      void write(next);
      return;
    }
    setPrimerVisible(true);
  };

  // The primer closes BEFORE anything is said, and what is said is a snackbar with the
  // store's delay: an Alert raised over a visible or dismissing Modal is often swallowed
  // on iOS (code-reviewer). A refused prompt says nothing; the banner explains it.
  const confirm = async () => {
    setRequesting(true);
    let message: string | null = null;
    try {
      const result = await ensurePermission(true);
      onPermissionChange(result);
      if (result === 'granted') {
        try {
          await setVetReminders(true);
          setOn(true);
          message = VET_REMINDERS_ON_MESSAGE;
        } catch (e) {
          // Allowed, but the switch did not save: say that, not that notifications failed.
          console.warn('[vet reminders] turning on after the prompt failed:', e);
          message = VET_REMINDERS_FAILED_MESSAGE;
        }
      }
    } catch (e) {
      console.warn('[vet reminders] permission request failed:', e);
      message = VET_REMINDERS_FAILED_MESSAGE;
    } finally {
      setRequesting(false);
      setPrimerVisible(false);
    }
    if (message) useSnackbarStore.getState().show({ message }, { delayMs: 300 });
  };

  const dismiss = () => {
    if (requesting) return;
    setPrimerVisible(false);
  };

  return (
    <>
      <Card noPadding>
        <SettingsRow
          first
          label={VET_REMINDER_ROW_LABEL}
          sublabel={VET_REMINDER_ROW_SUBLABEL}
          trailing={
            <Switch
              value={switchOn && !denied}
              onValueChange={toggle}
              disabled={denied || busy}
              trackColor={{ true: colorRoles.action.onLight, false: theme.colorBorderStrong }}
              ios_backgroundColor={theme.colorBorderStrong}
              // `disabled` is a claim (C-7): when denied, the label says why.
              accessibilityLabel={
                denied ? `${VET_REMINDER_ROW_LABEL}, off. Notifications are off for Culprit in Settings.` : VET_REMINDER_ROW_LABEL
              }
            />
          }
        />
        {onElsewhere ? (
          <ThemedText style={styles.hint}>
            On for your account — switch it on here to allow it on this phone too.
          </ThemedText>
        ) : null}
      </Card>
      <NotificationPrimer
        visible={primerVisible}
        descriptor={VET_VISIT_PRIMER}
        petName={petName}
        onConfirm={() => void confirm()}
        onDismiss={dismiss}
        requesting={requesting}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    // The daily summary's `elsewhereHint` padding, so the line sits under its label.
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space1,
  },
});
