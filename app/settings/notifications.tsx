import { useCallback, useState } from 'react';
import {
  Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card, Header } from '../../components/ui';
import { SettingsRow } from '../../components/settings/SettingsRow';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { NotificationPrimerSheet } from '../../components/notifications/NotificationPrimerSheet';
import { ensurePermission, type NotificationPermission } from '../../lib/notifications';
import {
  readCategoryEnabled,
  applyCategoryPreference,
  reconcileFromPreferences,
} from '../../lib/notificationSettings';
import { usePetStore } from '../../store/petStore';

// Notifications — UN-MOCKED (B-661 PR 3, §2). Replaces the reserved "coming soon"
// mock with a real, consent-honest surface for the one v1 category, Daily summary.
//
// TWO GATES, NEVER CONFLATED (§2):
//   • OS permission — one system prompt per install, fired ONLY from an explicit
//     toggle-on, and only AFTER the primer (never at launch/onboarding). Declining
//     the primer spends nothing.
//   • Product opt-in — the per-category toggle backed by notification_preferences
//     (defaults off, G6).
//
// THREE HONEST STATES (Principle 5 — a toggle that is on while the OS has denied
// permission is a lie with a safety cost):
//   (a) permission undetermined (never asked) → toggle interactive; first enable
//       walks the primer → the one system prompt.
//   (b) permission granted → toggle live; enabling schedules, disabling cancels.
//   (c) permission denied at the OS level → the category is visibly inert with one
//       honest line and a deep link to iOS Settings; reconcile cancels any orphan.
//
// SAFETY GATE (D7 / clinical-guardrails G4 / Trust & Safety) SURVIVES THE UN-MOCK:
// NO medication reminder appears here, armed or otherwise. Owner-configured med /
// care reminders (B-227) are a separate, later build with their own safety
// framing. Do NOT add a medication-reminder row to this screen.
export default function NotificationsScreen() {
  // The single pet's name warms the primer copy; a multi-pet (or nameless) account
  // stays neutral — one notification covers all pets (D3).
  const pets = usePetStore((s) => s.pets);
  const primerPetName = pets.length === 1 ? pets[0].name : null;

  // null = the (brief) permission/pref read is still in flight.
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false); // a direct toggle write in flight
  const [primerVisible, setPrimerVisible] = useState(false);
  const [requesting, setRequesting] = useState(false); // the OS prompt in flight

  const denied = permission === 'denied';
  const settingsAppName = Platform.OS === 'ios' ? 'iOS Settings' : 'Settings';

  // On focus (not just mount): the owner may leave to iOS Settings and return, so
  // permission is re-read every time the screen surfaces. reconcile repairs drift
  // in the safe direction — AC 6: a permission revoked at the OS level has its now-
  // orphaned schedule cancelled here, ahead of PR 4's app-foreground reconcile.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [perm, on] = await Promise.all([
            ensurePermission(false), // status read only — NEVER fires the prompt
            readCategoryEnabled('daily_summary'),
          ]);
          if (cancelled) return;
          setPermission(perm);
          setEnabled(on);
          reconcileFromPreferences().catch((e) =>
            console.warn('[notifications] focus reconcile failed:', e),
          );
        } catch (e) {
          console.warn('[notifications] permission/pref read failed:', e);
          if (!cancelled) setPermission('undetermined'); // fail to the interactive state
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }

  // The Daily summary toggle. OFF and an already-granted ON write straight through;
  // an ON from the undetermined state opens the primer first (which owns the one
  // system prompt). The denied state disables the switch, so ON is unreachable there.
  async function handleToggleDailySummary(next: boolean) {
    if (!next) {
      setEnabled(false); // optimistic
      setBusy(true);
      try {
        await applyCategoryPreference('daily_summary', false);
      } catch (e) {
        console.error('[notifications] disable failed:', e);
        setEnabled(true); // revert — the write didn't land
        Alert.alert("Couldn't update", 'Try again in a moment.');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (permission === 'granted') {
      setEnabled(true); // optimistic
      setBusy(true);
      try {
        await applyCategoryPreference('daily_summary', true);
      } catch (e) {
        console.error('[notifications] enable failed:', e);
        setEnabled(false); // revert
        Alert.alert("Couldn't update", 'Try again in a moment.');
      } finally {
        setBusy(false);
      }
      return;
    }

    // Undetermined — never asked. Show the primer; the system prompt is spent only
    // if the owner confirms it (handlePrimerConfirm). Optimistically show the
    // switch on so the sheet doesn't rise over a switch that snapped back to off.
    setEnabled(true);
    setPrimerVisible(true);
  }

  // "Turn on" in the primer → the ONE system prompt. Only a granted result persists
  // the opt-in and schedules; anything else reverts the optimistic switch and never
  // records a toggle-on the OS won't honor (§2 — no on-while-denied lie).
  async function handlePrimerConfirm() {
    setRequesting(true);
    try {
      const result = await ensurePermission(true);
      if (result === 'granted') {
        await applyCategoryPreference('daily_summary', true);
        setEnabled(true);
        setPermission('granted');
      } else {
        setEnabled(false);
        setPermission(result); // 'denied' → inert state; 'undetermined' → stays interactive
      }
    } catch (e) {
      console.error('[notifications] permission request failed:', e);
      setEnabled(false);
      Alert.alert("Couldn't turn on notifications", 'Try again in a moment.');
    } finally {
      setRequesting(false);
      setPrimerVisible(false);
    }
  }

  // "Not now" / scrim — declining spends nothing (the prompt is never reached).
  function handlePrimerDismiss() {
    if (requesting) return; // don't dismiss mid-request
    setPrimerVisible(false);
    setEnabled(false); // revert the optimistic on
  }

  async function openOsSettings() {
    try {
      await Linking.openSettings();
    } catch (e) {
      console.warn('[notifications] open settings failed:', e);
      Alert.alert(
        "Couldn't open Settings",
        `Open Settings and find Culprit under Notifications to turn them back on.`,
      );
    }
  }

  const loading = permission === null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Notifications" leading="back" onLeadingPress={handleBack} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* State (c): OS-denied — one honest line + the door back (§2, AC 6). Calm,
            never alarm (nyx-voice Pattern 8): a quiet subtle fill, not a red error. */}
        {denied && (
          <Card style={styles.deniedNote}>
            <Text style={styles.deniedText}>
              Notifications are off for Culprit in {settingsAppName} — turn them on
              there and this switch comes back to life.
            </Text>
            <TouchableOpacity
              onPress={openOsSettings}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Open ${settingsAppName}`}
              style={styles.deniedAction}
            >
              <Text style={styles.deniedActionText}>Open Settings</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* States (a)/(b): the G6 framing — everything is opt-in and reversible.
            Deliberately STATE-INDEPENDENT: a present-tense "nothing's on" would
            read false the moment Daily summary is enabled, so this frames the
            choice, not the current count (pm-feature-review). */}
        {!loading && !denied && (
          <Text style={styles.intro}>
            You choose what Culprit lets you know about — and you can change your mind any time.
          </Text>
        )}

        {/* The one live category. */}
        <Card noPadding>
          <SettingsRow
            first
            label="Daily summary"
            sublabel="A calm look back at the day’s record, around 9:00 each night"
            trailing={
              loading ? (
                <WhorlSpinner size="sm" ground="day" />
              ) : (
                <Switch
                  value={denied ? false : enabled}
                  onValueChange={handleToggleDailySummary}
                  disabled={denied || busy}
                  trackColor={{ true: theme.colorAccent, false: theme.colorBorderStrong }}
                  ios_backgroundColor={theme.colorBorderStrong}
                  accessibilityLabel="Daily summary"
                />
              )
            }
          />
        </Card>

        {/* No reserved "Coming soon" rows: on a now-live surface those are the
            un-designed placeholder nyx-voice Pattern 3 + Principle 5 forbid, and
            two dead toggles beside a working one. Future categories (B-288's
            check-in nudge, B-227's health insights) add their own live rows when
            they ship — a real launch each, not a dead slot held open now. */}

        <View style={styles.bottomPad} />
      </ScrollView>

      <NotificationPrimerSheet
        visible={primerVisible}
        petName={primerPetName}
        onConfirm={handlePrimerConfirm}
        onDismiss={handlePrimerDismiss}
        requesting={requesting}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    padding: theme.space3,
    gap: theme.space2,
  },

  // ── OS-denied note ──
  // Quiet neutral fill (the sibling You-screen disclaimer treatment) — no accent
  // tint on the body, so the "one accent, never decorative" rule holds; the accent
  // is spent only on the actionable "Open Settings" affordance.
  deniedNote: {
    backgroundColor: theme.colorSurfaceSubtle,
    gap: theme.space1,
  },
  deniedText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  deniedAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  deniedActionText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },

  // ── Intro framing (states a/b) ──
  intro: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
    paddingHorizontal: theme.space1,
  },

  bottomPad: {
    height: theme.space4,
  },
});
