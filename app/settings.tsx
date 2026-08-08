import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { Card, Header } from '../components/ui';
import { OwnerAvatar } from '../components/settings/OwnerAvatar';
import { SettingsRow } from '../components/settings/SettingsRow';
import { ComingSoonLabel } from '../components/settings/ComingSoonLabel';
import { OwnerNameRow } from '../components/profile/OwnerNameRow';
import { DeleteAccountSheet } from '../components/profile/DeleteAccountSheet';
import { supabase } from '../lib/supabase';
import { buildSupportMailto, formatAppVersion } from '../lib/support';
import { showNoMailFallback } from '../lib/supportFallback';
import { APP_VERSION, APP_BUILD, PLATFORM } from '../lib/appInfo';
import {
  SUPPORT_EMAIL,
  PRIVACY_POLICY_URL,
  TERMS_URL,
  DISCLAIMER_URL,
  LEGAL_LINKS_ENABLED,
} from '../constants/links';
import { flushForSignOut, unsentSignOutWarning } from '../lib/session';
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
  // B-430 — the pre-sign-out flush is a network round trip; disable the row while
  // it runs so a second tap can't start a parallel drain.
  const [signingOut, setSigningOut] = useState(false);

  function handleBack() {
    // Pushed from the Home tab, so back pops to it. Guarded for the deep-link /
    // no-history case (mirrors the auth screens) so back is never a dead no-op.
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
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
        showNoMailFallback(SUPPORT_EMAIL);
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      console.warn('[Settings] open support mailto failed:', e);
      showNoMailFallback(SUPPORT_EMAIL);
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

  // signOut can THROW (network reject), not only return { error } — so try/catch,
  // mirroring DeleteAccountSheet, or a rejection inside an async Alert handler is
  // unhandled and the owner gets no feedback. SIGNED_OUT (app/_layout.tsx) runs the
  // FR-9 local wipe + routes away.
  async function doSignOut() {
    try {
      // B-280 FR-20 (§7.2.4): mark this as a DELIBERATE sign-out so the SIGNED_OUT
      // handler routes it to the Landing WITHOUT the "you were signed out" banner —
      // that banner is for an INVOLUNTARY eviction on another device. Cleared again
      // if the sign-out never happens, so a stale marker can't suppress a later
      // genuine eviction banner.
      useAuthStore.getState().setDeliberateSignOut(true);
      const { error } = await supabase.auth.signOut();
      if (error) {
        useAuthStore.getState().setDeliberateSignOut(false);
        console.warn('[Settings] sign out failed:', error.message);
        Alert.alert("Couldn't sign out", 'Check your connection and try again.');
      }
    } catch (e) {
      useAuthStore.getState().setDeliberateSignOut(false);
      console.warn('[Settings] sign out threw:', e);
      Alert.alert("Couldn't sign out", 'Check your connection and try again.');
    }
  }

  // B-430 — sign-out is the one routine action that can destroy data. The wipe that
  // follows SIGNED_OUT clears local SQLite including rows still at synced = 0, so
  // anything captured offline and not yet pushed is gone. Two steps close that:
  // FLUSH first (send what can be sent — the owner is usually online and this
  // resolves silently), then, only if something is genuinely still unsent, SAY SO
  // and let them decide. The confirm names the count; it never resolves this
  // silently in either direction.
  function handleSignOut() {
    Alert.alert('Sign out', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          let warning: ReturnType<typeof unsentSignOutWarning> = null;
          try {
            warning = unsentSignOutWarning(await flushForSignOut());
          } catch (e) {
            // flushForSignOut is best-effort by construction, but a throw here must
            // never trap the owner in the app — fall through and sign out.
            console.warn('[Settings] pre-sign-out drain failed:', e);
          } finally {
            setSigningOut(false);
          }
          if (!warning) {
            await doSignOut();
            return;
          }
          Alert.alert(warning.title, warning.message, [
            { text: 'Stay signed in', style: 'cancel' },
            { text: 'Sign out anyway', style: 'destructive', onPress: doSignOut },
          ]);
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
          <View style={styles.accountDivider} />
          {/* B-280 PR 3 (§5.7, D4) — retires the "coming soon" note. An inline nav
              row (not a SettingsRow) so it aligns with this card's padded inline
              rows (identity / name) rather than sitting at a SettingsRow's deeper
              inset. */}
          <TouchableOpacity
            style={styles.changePasswordRow}
            onPress={() => router.push('/settings/password')}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Change password"
            accessibilityHint="Opens a screen to change your account password"
          >
            <Text style={styles.changePasswordLabel}>Change password</Text>
            <ChevronRight size={18} color={theme.colorTextTertiary} strokeWidth={2} />
          </TouchableOpacity>
          {/* The email note gets its OWN divider-bounded cell. Without the
              divider it hugs the Change-password row and — because the Your-name
              row just above establishes the label + grey-caption shape — the note
              reads as THAT row's caption, i.e. "Change password → contact support"
              (the reported misread; PM screenshot 2026-08-08, on a build that
              already has the working in-app screen). Detached, it reads as what it
              is: a standalone note about the account email. Email change stays a
              support path in v1 (nyx-voice Pattern 3 bars "coming soon"; in-app
              email change is deferred → B-427); the general Contact support row
              below is the same destination, and this is the honest answer for an
              owner who has lost their signup mailbox (spec §5.7 / §11). */}
          <View style={styles.accountDivider} />
          <Text style={styles.accountNote}>
            To change your account email, contact support.
          </Text>
        </Card>

        {/* ── Preferences ── */}
        <Card noPadding>
          {/* Notifications is LIVE as of B-661 PR 3: the pushed screen carries a
              real Daily-summary toggle, so this doorway is a plain nav row — no
              "Coming soon" marker (that would now be false, and beside a working
              toggle it is the nyx-voice Pattern 3 placeholder). The safety gate
              still lives on the pushed screen (no armed med-reminder, D7).
              Preferences holds only this row in v1; the Share-feedback row (PR 4)
              lands in the Support card below (§4.2). */}
          <SettingsRow
            first
            label="Notifications"
            sublabel="A summary of the day, every evening"
            chevron
            onPress={() => router.push('/settings/notifications')}
            accessibilityHint="Opens your notification settings"
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
          <SettingsRow
            first
            label={signingOut ? 'Saving your latest entries…' : 'Sign out'}
            onPress={signingOut ? undefined : handleSignOut}
            disabled={signingOut}
          />
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
  changePasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  changePasswordLabel: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
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
