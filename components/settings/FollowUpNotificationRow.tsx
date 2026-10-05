import { useCallback, useState } from 'react';
import { Alert, Switch } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui';
import { SettingsRow } from './SettingsRow';
import { ensurePermission } from '../../lib/notifications';
import { followUpNotificationsOn, setFollowUpNotificationsOn } from '../../lib/followUpNotifications';
import { refreshFollowUpNotifications, useEn14 } from '../../hooks/useFollowUps';

// The follow-up's switch (Engines v3 PR-36, CUL-1419; care-state spec §6.3, foundation G6).
// Off by default, on this phone only (the D4 departure, lib/followUpNotifications.ts). Dark
// behind engines_v3_en14: flag-off this renders nothing and reads nothing.
//
// Turning it on is the owner's explicit act, so it may spend the one system prompt
// (`ensurePermission(true)`); a refused prompt leaves the switch off rather than claiming an
// on the phone will not honour. With the OS permission denied, the screen's own banner says
// so and this switch is inert.

export const FOLLOW_UP_ROW_LABEL = 'Questions after a call';
export const FOLLOW_UP_ROW_SUBLABEL =
  'If you tell us you called your vet, one question a couple of days later about what they said.';

export function FollowUpNotificationRow({ denied }: { denied: boolean }) {
  const flagOn = useEn14();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!flagOn) return;
      let cancelled = false;
      void followUpNotificationsOn().then((v) => {
        if (!cancelled) setOn(v);
      });
      return () => {
        cancelled = true;
      };
    }, [flagOn]),
  );

  if (!flagOn) return null;

  const toggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        const permission = await ensurePermission(true);
        if (permission !== 'granted') {
          setOn(false);
          return;
        }
      }
      await setFollowUpNotificationsOn(next);
      setOn(next);
      await refreshFollowUpNotifications(true);
    } catch (e) {
      console.warn('[follow-ups] toggle failed:', e);
      Alert.alert('Couldn’t update', 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card noPadding>
      <SettingsRow
        first
        label={FOLLOW_UP_ROW_LABEL}
        sublabel={FOLLOW_UP_ROW_SUBLABEL}
        trailing={
          <Switch
            value={on && !denied}
            onValueChange={(v) => void toggle(v)}
            disabled={denied || busy}
            trackColor={{ true: theme.colorAccent, false: theme.colorBorderStrong }}
            ios_backgroundColor={theme.colorBorderStrong}
            accessibilityLabel={FOLLOW_UP_ROW_LABEL}
          />
        }
      />
    </Card>
  );
}
