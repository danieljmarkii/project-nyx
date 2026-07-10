import { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { theme } from '../constants/theme';
import { Card, Header } from '../components/ui';
import { OwnerAvatar } from '../components/settings/OwnerAvatar';
import { SettingsRow } from '../components/settings/SettingsRow';
import { OwnerNameRow } from '../components/profile/OwnerNameRow';
import { DeleteAccountSheet } from '../components/profile/DeleteAccountSheet';
import { supabase } from '../lib/supabase';
import { buildSupportMailto, formatAppVersion } from '../lib/support';
import {
  SUPPORT_EMAIL,
  PRIVACY_POLICY_URL,
  TERMS_URL,
  LEGAL_LINKS_ENABLED,
} from '../constants/links';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';

// "You" — the owner's account & settings home (B-283, spec §4). A doorway from
// the Home-header avatar (§4.1), NOT a fifth tab: the user actions that used to
// be wedged into the pet-scoped Pet tab (owner name / Sign out / Delete account)
// live here now, alongside support, legal, the medical disclaimer, and the app
// version — the four App-Store items (B-229/230/231/270) + the support email
// (B-273) that were waiting on a screen that didn't exist.
//
// PR 2 builds Account / Support / About / account-actions / version. The
// Preferences→Notifications row (PR 3) and the Share-feedback row (PR 4) each drop
// one SettingsRow into their card later — kept out here so no row points at a
// screen that doesn't exist yet (§10 PR plan; the "no dead ends" rule).

// The live app version + native build, read at the UI boundary (expo-constants,
// B-231) and formatted by the pure PR-1 helper. Module-scope: the manifest is
// immutable for the app's lifetime, so there's no reason to re-read per render.
const APP_VERSION = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null;
const APP_BUILD =
  Constants.expoConfig?.ios?.buildNumber ??
  Constants.expoConfig?.android?.versionCode ??
  Constants.nativeBuildVersion ??
  null;
// Diagnostic platform string for the support mailto (§D6) so triage never starts
// with "what device / OS?". e.g. "ios 17.2" / "android 34".
const PLATFORM = `${Platform.OS} ${Platform.Version}`;

export default function SettingsScreen() {
  const email = useAuthStore((s) => s.user?.email);
  const pets = usePetStore((s) => s.pets);
  const [deleteVisible, setDeleteVisible] = useState(false);

  function handleBack() {
    // Pushed from the Home tab, so back pops to it. Guarded for the deep-link /
    // no-history case (mirrors the auth screens) so back is never a dead no-op.
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  function noMailFallback() {
    // §4.5 — never fail silently: show the address so the owner can still reach us.
    Alert.alert('No mail app found', `You can reach us at ${SUPPORT_EMAIL}.`, [{ text: 'OK' }]);
  }

  async function handleContactSupport() {
    const url = buildSupportMailto(SUPPORT_EMAIL, {
      version: APP_VERSION,
      build: APP_BUILD,
      platform: PLATFORM,
    });
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        noMailFallback();
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      console.warn('[Settings] open support mailto failed:', e);
      noMailFallback();
    }
  }

  async function openLegal(url: string, title: string) {
    // Only reachable once LEGAL_LINKS_ENABLED flips on (PR 5); wired now so the
    // flag-flip is the only change. A failed open is honest, never silent.
    try {
      await Linking.openURL(url);
    } catch (e) {
      console.warn('[Settings] open legal link failed:', e);
      Alert.alert("Couldn't open link", `You can find our ${title} at ${url}.`);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          // SIGNED_OUT (app/_layout.tsx) runs the FR-9 local wipe + routes away;
          // surface a failure honestly rather than leaving the owner stuck.
          if (error) {
            console.warn('[Settings] sign out failed:', error.message);
            Alert.alert("Couldn't sign out", 'Check your connection and try again.');
          }
        },
      },
    ]);
  }

  const comingSoon = <Text style={styles.comingSoon}>Coming soon</Text>;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Header title="You" leading="back" onLeadingPress={handleBack} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Account ── */}
        <Card style={styles.accountCard}>
          <View style={styles.identity}>
            <OwnerAvatar email={email} size={44} />
            <Text style={styles.identityEmail} numberOfLines={1}>
              {email ?? 'Signed in'}
            </Text>
          </View>
          <View style={styles.accountDivider} />
          {/* §7.1 — the vet report's "Owner:" line reads this name (relocated from
              the Pet tab, §4.3). */}
          <OwnerNameRow />
          <Text style={styles.accountNote}>
            Changing your email or password is coming soon.
          </Text>
        </Card>

        {/* ── Support ── */}
        <Card noPadding>
          <SettingsRow
            first
            label="Contact support"
            sublabel="We usually reply within a day"
            onPress={handleContactSupport}
            chevron
            accessibilityHint="Opens an email to our support team, prefilled with your app version"
          />
          {/* Share feedback row → PR 4 */}
        </Card>

        {/* ── About ── */}
        <Card noPadding>
          <SettingsRow
            first
            label="Privacy policy"
            disabled={!LEGAL_LINKS_ENABLED}
            chevron={LEGAL_LINKS_ENABLED}
            trailing={LEGAL_LINKS_ENABLED ? undefined : comingSoon}
            onPress={
              LEGAL_LINKS_ENABLED
                ? () => openLegal(PRIVACY_POLICY_URL, 'privacy policy')
                : undefined
            }
          />
          <SettingsRow
            label="Terms of service"
            disabled={!LEGAL_LINKS_ENABLED}
            chevron={LEGAL_LINKS_ENABLED}
            trailing={LEGAL_LINKS_ENABLED ? undefined : comingSoon}
            onPress={
              LEGAL_LINKS_ENABLED ? () => openLegal(TERMS_URL, 'terms of service') : undefined
            }
          />
          {/* Always-visible medical disclaimer (B-270). Neutral, never reassuring
              — clinical-guardrails: a "not a substitute for veterinary care" line. */}
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              Culprit helps you track and share your pet’s health. It doesn’t diagnose, and
              it isn’t a substitute for professional veterinary care.
            </Text>
          </View>
        </Card>

        {/* ── Account actions (moved off the Pet tab, §4.3) ── */}
        <Card noPadding>
          <SettingsRow first label="Sign out" onPress={handleSignOut} />
          {/* Delete account (B-039): destructive, routed to the type-to-confirm
              sheet — never demoted to Sign out's light alert. */}
          <SettingsRow
            label="Delete account"
            sublabel="Permanently deletes your account and all pet data"
            destructive
            onPress={() => setDeleteVisible(true)}
            accessibilityHint="Opens a confirmation where you type to confirm"
          />
        </Card>

        <Text style={styles.version}>Culprit v{formatAppVersion(APP_VERSION, APP_BUILD)}</Text>

        <View style={styles.bottomPad} />
      </ScrollView>

      <DeleteAccountSheet
        visible={deleteVisible}
        petNames={pets.map((p) => p.name)}
        onClose={() => setDeleteVisible(false)}
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

  // ── Account ──
  accountCard: {
    padding: theme.space2,
    gap: theme.space1,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: 44,
  },
  identityEmail: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  accountDivider: {
    height: 1,
    backgroundColor: theme.colorBorder,
    marginVertical: theme.space1,
  },
  accountNote: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
  },

  // ── Trailing "Coming soon" ──
  comingSoon: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextDisabled,
  },

  // ── Medical disclaimer ──
  disclaimer: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    backgroundColor: theme.colorSurfaceSubtle,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
  },
  disclaimerText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },

  // ── Version foot ──
  version: {
    textAlign: 'center',
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: theme.space1,
  },
  bottomPad: {
    height: theme.space4,
  },
});
