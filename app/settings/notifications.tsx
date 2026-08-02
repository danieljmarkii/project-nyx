import { useCallback, useState } from 'react';
import {
  Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
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

  // The switch is ON only when THIS device can actually deliver — permission
  // granted AND the pref enabled — plus the optimistic window while the primer is
  // open. This is the 4th state the three named states didn't cover: a pref synced
  // enabled=true from ANOTHER device whose OS permission is still undetermined HERE
  // must NOT render a live ON switch, or a tap would fire the disable branch and
  // turn the summary off account-wide (LWW) for the device that actually granted it
  // (AC 8). Off-and-interactive here is both honest (nothing fires on this device
  // until it grants) and safe (a tap walks the primer → grant, never a silent
  // account-wide off).
  const switchOn = primerVisible || (permission === 'granted' && enabled);

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
          if (!cancelled) {
            // Fail to the interactive state — and reset enabled too, so a transient
            // read failure can't leave a stale enabled=true from a prior session
            // (code-reviewer: the catch reset permission but not enabled).
            setPermission('undetermined');
            setEnabled(false);
          }
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
        {/* State (c): OS-denied — the prominent "danger" treatment (PM, 2026-08-02:
            the quiet fill was too subtle to notice). A red-tinted fill + hairline +
            warning glyph makes the inert state unmissable. This is a FUNCTIONAL
            system-state, not a health flag, so the nyx-voice "no alarm" rule (which
            governs health concerns) does not apply — surfacing it loudly is honest
            states (Principle 5) done right (§2, AC 6). */}
        {denied && (
          <View style={styles.deniedBanner}>
            <View style={styles.deniedHead}>
              <AlertTriangle size={20} color={theme.colorDestructive} strokeWidth={2} />
              <Text style={styles.deniedTitle}>Notifications are off for Culprit</Text>
            </View>
            <Text style={styles.deniedBody}>
              Turn them back on in {settingsAppName} and this switch comes back to life.
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
          </View>
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
                  value={switchOn}
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

  // ── OS-denied danger banner ──
  // Red-tinted fill + hairline + warning glyph (PM: the quiet fill was too subtle).
  // Matched in intensity to the colorEventSymptom safety banner, so it is prominent
  // without a solid-red alarm. The red action carries the fix.
  deniedBanner: {
    backgroundColor: theme.colorDestructiveLight,
    borderWidth: 1,
    borderColor: theme.colorDestructiveBorder,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    gap: 6,
  },
  deniedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  deniedTitle: {
    flex: 1,
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  deniedBody: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  deniedAction: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorDestructive,
    marginTop: 2,
  },
  deniedActionText: {
    fontFamily: theme.fontBodyMedium,
    fontSize: theme.textSM,
    color: theme.colorDestructive,
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
