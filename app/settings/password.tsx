import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { Header } from '../../components/ui';
import { TextField } from '../../components/ui/TextField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useSnackbarStore } from '../../store/snackbarStore';
import { passwordError } from '../../lib/authValidation';
import { authErrorCopy, isInvalidCredentials } from '../../lib/authErrors';

// Change password (B-280 PR 3, spec §5.7 / D4). Retires the "coming soon" note on
// the You screen (app/settings.tsx) — the third of three half-built signals the
// store-readiness audit flagged.
//
// ── The current-password re-check, and why it is a client-side sign-in ──────────
// Supabase's `updateUser({ password })` has NO current-password parameter and no
// verify-only endpoint. The only way to prove the person holding the phone knows
// the current password is to RE-AUTHENTICATE with it: `signInWithPassword` on the
// account's own email. So the flow is re-check → write → (optional) evict:
//   1. signInWithPassword({ email, currentPassword })  — the re-check (a mismatch
//      is invalid_credentials, surfaced inline on the field, never as "wrong email").
//   2. updateUser({ password: newPassword })           — the write.
//   3. signOut({ scope: 'others' }) IF the box is ticked — strictly AFTER a
//      successful write (FR-18/FR-19 ordering: never evict the household for a
//      change that then fails). `scope: 'others'` keeps THIS device's session, so
//      no local SIGNED_OUT fires and the owner is not bounced to the login wall.
//
// The re-check also composes cleanly with the server control below: it mints a
// brand-new session, which is "recently logged in" (< 24h), so `updateUser`
// proceeds without an email nonce whether or not "Secure password change" is on.
//
// ⚠ SERVER DEPENDENCY — "Secure password change" (require reauthentication).
// The client re-check makes the field real at the APP layer. It does NOT close the
// direct-API bypass: an unlocked, unattended phone hands an attacker the stored
// session token, with which they can call `updateUser({ password })` straight past
// this screen and never supply the current password. The dashboard's "Secure
// password change" setting is the server-side backstop for that path and must be
// ON — otherwise the current-password field is decorative and this becomes a
// Settings-screen account takeover. Flagged to the PM in the PR (a dashboard item,
// not a code detail).
export default function ChangePasswordScreen() {
  const email = useAuthStore((s) => s.user?.email);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  // FR-19 — default OFF. On a change (the owner is authenticated and in control),
  // eviction is an explicit opt-in, not the surprise it is on a reset (§7.2).
  const [signOutOthers, setSignOutOthers] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  // Server-driven "that's not your current password", cleared the moment the owner
  // edits the field so a stale mismatch never lingers under a corrected value.
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);

  // Errors surface only after a submit attempt, then update live as each field is
  // fixed — calm, not a red-alarm on the first keystroke (Principle 4), mirroring
  // login/signup.
  const currentErr = (submitted && !currentPassword ? 'Enter your current password' : null)
    ?? currentPasswordError;
  const newErr = submitted
    ? passwordError(newPassword)
      // A same-value change is a confusing no-op that would still confirm "updated";
      // catch it here rather than after a round-trip. Only meaningful once the new
      // password otherwise passes, so it sits behind passwordError.
      ?? (newPassword && newPassword === currentPassword
        ? 'Choose a new password that’s different from your current one.'
        : null)
    : null;

  function handleBack() {
    // Pushed from the You screen, so back pops to it. Guarded for the deep-link /
    // no-history case so back is never a dead no-op (mirrors settings/notifications).
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }

  async function handleSave() {
    if (loading) return;
    setSubmitted(true);
    setCurrentPasswordError(null);
    // Validate before any network round-trip; the inline errors are already
    // rendering (submitted=true) — just stop.
    if (!currentPassword || passwordError(newPassword) || newPassword === currentPassword) {
      return;
    }
    if (!email) {
      // Defensive: an authenticated session always carries an email, but never
      // attempt a re-check we can't address.
      Alert.alert(
        "Couldn't change your password",
        "We couldn't read your account email. Try again in a moment.",
      );
      return;
    }

    setLoading(true);

    // 1. Re-check the current password by re-authenticating with it.
    let reauthError;
    try {
      ({ error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      }));
    } catch (e) {
      // signInWithPassword can reject (network), not only return { error }.
      console.warn('[ChangePassword] re-auth threw:', e);
      setLoading(false);
      Alert.alert("Couldn't reach Culprit", 'Check your connection and try again.');
      return;
    }
    if (reauthError) {
      setLoading(false);
      if (isInvalidCredentials(reauthError)) {
        // Inline on the field, specific — not a modal, and never "wrong email".
        setCurrentPasswordError('That doesn’t match your current password.');
        return;
      }
      // Offline / rate-limited / unexpected — mapped copy, never a raw provider
      // string (lib/authErrors). 'password' context so an unmapped error's
      // fallback title reads "Couldn't change your password", not a sign-in error.
      const copy = authErrorCopy(reauthError, 'password', email);
      Alert.alert(copy.title, copy.message);
      return;
    }

    // 2. Write the new password on the now-fresh session.
    let updateError;
    try {
      ({ error: updateError } = await supabase.auth.updateUser({ password: newPassword }));
    } catch (e) {
      console.warn('[ChangePassword] update threw:', e);
      setLoading(false);
      Alert.alert("Couldn't reach Culprit", 'Check your connection and try again.');
      return;
    }
    if (updateError) {
      setLoading(false);
      const copy = authErrorCopy(updateError, 'password', email);
      Alert.alert(copy.title, copy.message);
      return;
    }

    // 3. FR-18/FR-19 — evict other sessions ONLY after a successful write, and only
    // if asked. The password is already changed at this point, so an eviction
    // failure never sends the owner back to retry (their "current password" has
    // moved) — it is reported honestly alongside the success instead.
    if (signOutOthers) {
      let evictFailed = false;
      try {
        const { error: evictError } = await supabase.auth.signOut({ scope: 'others' });
        if (evictError) {
          console.warn('[ChangePassword] sign out others failed:', evictError.message);
          evictFailed = true;
        }
      } catch (e) {
        console.warn('[ChangePassword] sign out others threw:', e);
        evictFailed = true;
      }
      if (evictFailed) {
        setLoading(false);
        router.back();
        Alert.alert(
          'Password updated',
          "We couldn’t sign out your other devices just now, but your new password is set.",
        );
        return;
      }
    }

    setLoading(false);
    router.back();
    // Success confirmation as a Snackbar, not an alert (§5.7). Root-mounted, so it
    // survives this screen popping and lands over the You screen underneath; a
    // small delay lets the back transition clear first (the store's own pattern).
    useSnackbarStore.getState().show({ message: 'Password updated.' }, { delayMs: 300 });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Change password" leading="back" onLeadingPress={handleBack} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextField
            label="Current password"
            value={currentPassword}
            onChangeText={(t) => {
              setCurrentPassword(t);
              if (currentPasswordError) setCurrentPasswordError(null);
            }}
            error={currentErr}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="next"
            containerStyle={styles.field}
            testID="change-current-password"
          />

          <TextField
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            error={newErr}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={handleSave}
            containerStyle={styles.field}
            testID="change-new-password"
          />

          {/* FR-19 — "Also sign out other devices", default off. A single checkbox
              row; the whole row is the tap target (≥44pt) with the box as its cue. */}
          <TouchableOpacity
            style={styles.option}
            onPress={() => setSignOutOthers((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: signOutOthers }}
            accessibilityLabel="Also sign out other devices"
            accessibilityHint="Anyone signed in on another phone or tablet will need to sign in again"
            testID="change-signout-others"
          >
            <View style={[styles.checkbox, signOutOthers && styles.checkboxChecked]}>
              {signOutOthers ? (
                <Check size={14} color={theme.colorTextOnDark} strokeWidth={3} />
              ) : null}
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>Also sign out other devices</Text>
              <Text style={styles.optionSub}>
                Anyone signed in on another phone or tablet will need to sign in again.
              </Text>
            </View>
          </TouchableOpacity>

          <PrimaryButton
            label="Save"
            onPress={handleSave}
            loading={loading}
            style={styles.submit}
            testID="change-save"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    padding: theme.space3,
  },
  field: {
    marginBottom: theme.space2,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space2,
    // Explicit ≥44pt floor so the tap target is enforced, not left to incidental
    // content height — a shorter translation or a Dynamic-Type-down setting can't
    // silently drop this row under the minimum.
    minHeight: 44,
    paddingVertical: theme.space1,
    marginBottom: theme.space3,
  },
  // Square (radiusSmall) to read as a checkbox, not the round radio the pet-type
  // tiles use; accent fill on checked, matching that screen's selected state.
  checkbox: {
    width: theme.space3, // 24
    height: theme.space3,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    // Nudge to the first text line's optical centre.
    marginTop: theme.spaceMicro,
  },
  checkboxChecked: {
    backgroundColor: theme.colorAccent,
    borderColor: theme.colorAccent,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  optionSub: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    marginTop: theme.spaceMicro,
  },
  submit: {
    marginTop: theme.space1,
  },
});
