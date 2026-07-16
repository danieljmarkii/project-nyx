import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../constants/theme';
import { Card, Header } from '../components/ui';
import { OwnerAvatar } from '../components/settings/OwnerAvatar';
import { SettingsRow } from '../components/settings/SettingsRow';
import { ComingSoonLabel } from '../components/settings/ComingSoonLabel';
import { OwnerNameRow } from '../components/profile/OwnerNameRow';
import { DeleteAccountSheet } from '../components/profile/DeleteAccountSheet';
import { supabase } from '../lib/supabase';
import { buildSupportMailto, formatAppVersion } from '../lib/support';
import { APP_VERSION, APP_BUILD, PLATFORM } from '../lib/appInfo';
import {
  SUPPORT_EMAIL,
  PRIVACY_POLICY_URL,
  TERMS_URL,
  DISCLAIMER_URL,
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
// Preferences→Notifications row (PR 3) drops one SettingsRow into its card later —
// kept out here so no row points at a screen that doesn't exist yet (§10 PR plan;
// the "no dead ends" rule). The Share-feedback row (PR 4) is wired below.
//
// APP_VERSION / APP_BUILD / PLATFORM are read once at the UI boundary in
// lib/appInfo and formatted by the pure lib/support helpers — shared with the
// Share-feedback composer (§D8) so the two support-path mailtos read one source
// of truth for what "version" means (§4.5: a missing build degrades to
// "Culprit v1.0.0", never blank).

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
          // signOut can THROW (network reject), not only return { error } — so
          // try/catch, mirroring DeleteAccountSheet, or a rejection inside this
          // async Alert handler is unhandled and the owner gets no feedback.
          // SIGNED_OUT (app/_layout.tsx) runs the FR-9 local wipe + routes away.
          try {
            const { error } = await supabase.auth.signOut();
            if (error) {
              console.warn('[Settings] sign out failed:', error.message);
              Alert.alert("Couldn't sign out", 'Check your connection and try again.');
            }
          } catch (e) {
            console.warn('[Settings] sign out threw:', e);
            Alert.alert("Couldn't sign out", 'Check your connection and try again.');
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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

        {/* ── Preferences ── */}
        <Card noPadding>
          {/* Notifications is MOCKED in v1 (§5): the row pushes the reserved
              screen, and the "Coming soon" marker keeps it honest that nothing
              fires yet — the safety gate lives on the pushed screen (no armed
              med-reminder, D7). Preferences holds only this row in v1; the
              Share-feedback row (PR 4) lands in the Support card below (§4.2). */}
          <SettingsRow
            first
            label="Notifications"
            sublabel="Daily nudge · health insights"
            trailing={<ComingSoonLabel />}
            chevron
            onPress={() => router.push('/settings/notifications')}
            accessibilityLabel="Notifications — coming soon"
            accessibilityHint="Opens notifications, which aren’t turned on yet"
          />
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
          {/* Share feedback (§6/§D8) — product input, not a help ticket, so it
              pushes its own composer rather than opening a mailto straight away. */}
          <SettingsRow
            label="Share feedback"
            sublabel="Tell us what's working, or what could be better"
            onPress={() => router.push('/settings/feedback')}
            chevron
            accessibilityHint="Opens a screen to write feedback and send it from your mail app"
          />
        </Card>

        {/* ── About ── */}
        <Card noPadding>
          <SettingsRow
            first
            label="Privacy policy"
            disabled={!LEGAL_LINKS_ENABLED}
            chevron={LEGAL_LINKS_ENABLED}
            trailing={LEGAL_LINKS_ENABLED ? undefined : <ComingSoonLabel />}
            // Fold the "Coming soon" state into the label for screen readers, so a
            // disabled row announces why it's inert, not just "dimmed".
            accessibilityLabel={LEGAL_LINKS_ENABLED ? undefined : 'Privacy policy — coming soon'}
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
            trailing={LEGAL_LINKS_ENABLED ? undefined : <ComingSoonLabel />}
            accessibilityLabel={LEGAL_LINKS_ENABLED ? undefined : 'Terms of service — coming soon'}
            onPress={
              LEGAL_LINKS_ENABLED ? () => openLegal(TERMS_URL, 'terms of service') : undefined
            }
          />
          {/* The hosted disclaimer document (B-270's Settings/About link — the
              onboarding acknowledgment's Settings counterpart). Same gate as the
              other legal rows so the three flip together. */}
          <SettingsRow
            label="Veterinary disclaimer"
            disabled={!LEGAL_LINKS_ENABLED}
            chevron={LEGAL_LINKS_ENABLED}
            trailing={LEGAL_LINKS_ENABLED ? undefined : <ComingSoonLabel />}
            accessibilityLabel={
              LEGAL_LINKS_ENABLED ? undefined : 'Veterinary disclaimer — coming soon'
            }
            onPress={
              LEGAL_LINKS_ENABLED
                ? () => openLegal(DISCLAIMER_URL, 'veterinary disclaimer')
                : undefined
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

        {/* Long-press opens the temporary auth-diagnostics viewer (not a user
            feature — a hidden entry for the session-persistence investigation). */}
        <Pressable
          onLongPress={() => router.push('/settings/diagnostics')}
          delayLongPress={800}
          hitSlop={12}
          accessibilityRole="text"
        >
          <Text style={styles.version}>Culprit v{formatAppVersion(APP_VERSION, APP_BUILD)}</Text>
        </Pressable>

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
