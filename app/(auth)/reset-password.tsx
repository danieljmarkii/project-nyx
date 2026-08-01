import { useState, type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { MailOpen, Smartphone, RefreshCw } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { TextField } from '../../components/ui/TextField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { passwordError } from '../../lib/authValidation';
import { authErrorCopy, isOffline } from '../../lib/authErrors';
import { useAuthStore, releaseRecoveryGate } from '../../store/authStore';
import { usePetStore } from '../../store/petStore';
import { parseRecoveryLink } from '../../lib/passwordRecovery';
import { retryRecoveryExchange } from '../../lib/recoveryDeepLink';

// The set-new-password screen and every terminal state the exchange can produce
// (B-280 FR-4/5/8/16/18, spec §5.4/§5.5/§5.5b). It renders PURELY from store state
// the §6.4 handler drives — the exchange, the wipe and the gate all happen in
// `lib/recoveryDeepLink.ts`; this screen only shows the result and owns two exits:
//   • success — `updateUser({ password })` → evict other sessions (FR-18) →
//     release the gate → into the app (never a login form, Jordan's rule).
//   • escape  — abandon the reset (FR-16, §6.6): a recovery session is full-
//     privilege and already hydrated, so leaving must be a designed clean exit, not
//     a trap. Sign out + release the gate + Landing.
//
// Render precedence (all hooks first, then branch): a FAILURE state set by the
// handler wins; then a live recovery session behind the gate is the form; anything
// else (gate armed, exchange in flight) is the calm working state.

export default function ResetPasswordScreen() {
  const recoveryScreen = useAuthStore((s) => s.recoveryScreen);
  const session = useAuthStore((s) => s.session);
  const recoveryInProgress = useAuthStore((s) => s.recoveryInProgress);
  const recoveryEmail = useAuthStore((s) => s.recoveryEmail);
  const pets = usePetStore((s) => s.pets);
  // The launch/warm URL still carries the code, so a `failed` (transport) exchange
  // can retry the SAME code (§5.6) rather than forcing a whole new link.
  const url = Linking.useLinkingURL();

  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const passwordErr = submitted ? passwordError(password) : null;
  // §5.4: name the pet only if the local mirror still has it. After an FR-7 wipe it
  // will not — correctly, since that pet belongs to another account — so the line
  // falls back to "…take you back in." Nothing is fetched to satisfy it.
  const petName = pets[0]?.name;

  async function handleSave() {
    setSubmitted(true);
    if (passwordError(password)) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setSaving(false);
      // Never the raw provider string (nyx-voice Pattern 8). weak_password / offline
      // map cleanly; the rest falls back to an honest, non-specific line.
      if (isOffline(error)) {
        Alert.alert("Couldn't reach Culprit", 'Check your connection and try again.');
      } else {
        const copy = authErrorCopy(error, 'reset');
        Alert.alert(copy.title, copy.message);
      }
      return;
    }
    // FR-18 (§7.2.2): evict other sessions AFTER a successful write, never before —
    // evicting first and then failing the write would sign the household out for
    // nothing, on the path where the owner is already locked out. Best-effort: the
    // password IS changed; a failed eviction degrades to "other devices stay live
    // until their token expires", with the password-changed email as the backstop.
    await supabase.auth.signOut({ scope: 'others' }).catch((e) =>
      console.warn('[recovery] evict-others failed:', e instanceof Error ? e.message : e));
    await releaseRecoveryGate();
    useAuthStore.getState().setRecoveryScreen(null);
    // Straight into the app — the recovery session IS the sign-in (Jordan's rule).
    router.replace('/(tabs)');
  }

  // FR-16 / §6.6: abandon the reset. The signOut fires while the gate is still
  // armed, so app/_layout's SIGNED_OUT handler runs the teardown ONLY (it does not
  // route or release the gate on the recovery path) — then we release the gate and
  // route to the Landing ourselves. Ordered this way so nothing flashes the tabs and
  // no B pet-data survives (§6.6). `scope: 'local'` drops only this device's copy of
  // the recovery session — never B's real sessions elsewhere.
  async function handleEscape() {
    if (busy) return;
    setBusy(true);
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('[recovery] escape sign-out failed:', e instanceof Error ? e.message : e);
    }
    await releaseRecoveryGate();
    useAuthStore.getState().setRecoveryScreen(null);
    router.replace('/(auth)');
  }

  // §5.5 / §5.5b forward action: return to a PRE-FILLED request screen. recoveryEmail
  // was held in memory before the wipe (FR-12); it is null on a wrong-device link
  // (no local request existed), which correctly hands a blank field.
  function sendNewLink() {
    router.replace({
      pathname: '/(auth)/forgot-password',
      params: recoveryEmail ? { email: recoveryEmail } : {},
    });
  }

  function backToLogin() {
    router.replace('/(auth)/login');
  }

  // §5.6 "Try again" for a `failed` exchange: retry the same code if the URL still
  // carries one; otherwise the honest fallback is to send a fresh link.
  async function retryFailed() {
    if (busy) return;
    const link = parseRecoveryLink(url);
    if (link.kind !== 'valid') {
      sendNewLink();
      return;
    }
    setBusy(true);
    await retryRecoveryExchange(link.code);
    setBusy(false);
  }

  // ── §5.5b — wrong device (PKCE verifier absent, or no local request) ───────────
  if (recoveryScreen === 'wrong_device') {
    return (
      <StateScreen
        icon={<Smartphone size={44} color={theme.colorAccent} strokeWidth={1.5} />}
        title="Open this link on the phone you asked from"
        body="For your security, a reset link only works on the device that asked for it. You can send a fresh one from this device instead."
        primaryLabel="Send a link from this device"
        onPrimary={sendNewLink}
        onBack={backToLogin}
        testID="reset-wrong-device"
      />
    );
  }

  // ── §5.5 — link no longer works (expired / used / resend-overwritten) ──────────
  if (recoveryScreen === 'link_unusable') {
    return (
      <StateScreen
        icon={<MailOpen size={44} color={theme.colorAccent} strokeWidth={1.5} />}
        title="That link no longer works"
        body="Reset links only work once, and they don't last long. Send yourself a fresh one."
        primaryLabel="Send a new link"
        onPrimary={sendNewLink}
        onBack={backToLogin}
        testID="reset-link-unusable"
      />
    );
  }

  // ── §5.6 — the exchange failed on transport (the link may still be good) ───────
  if (recoveryScreen === 'failed') {
    return (
      <StateScreen
        icon={<RefreshCw size={44} color={theme.colorAccent} strokeWidth={1.5} />}
        title="Couldn't finish that"
        body="Something interrupted the connection. Your link may still be good — try again in a moment."
        primaryLabel="Try again"
        onPrimary={retryFailed}
        primaryLoading={busy}
        onBack={backToLogin}
        testID="reset-failed"
      />
    );
  }

  // ── §5.4 — set a new password (a live recovery session behind the gate) ────────
  if (session && recoveryInProgress) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.grow} />
            <Text style={styles.title}>Set a new password</Text>
            <Text style={styles.sub}>
              {petName
                ? `Almost there — choose a password and we'll take you back to ${petName}.`
                : "Almost there — choose a password and we'll take you back in."}
            </Text>

            <TextField
              label="New password"
              value={password}
              onChangeText={setPassword}
              error={passwordErr}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleSave}
              containerStyle={styles.field}
              testID="reset-password-input"
            />

            <PrimaryButton
              label="Save and continue"
              onPress={handleSave}
              loading={saving}
              style={styles.submit}
              testID="reset-save"
            />

            {/* FR-16: the designed escape. Not a filled button — leaving is not the
                expected action, but it must exist so an abandoned reset is a clean
                terminal state, not a trap holding a privileged session. */}
            <TouchableOpacity
              onPress={handleEscape}
              disabled={busy}
              style={styles.escapeRow}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Cancel and go back"
              accessibilityState={{ disabled: busy, busy }}
              testID="reset-escape"
            >
              {busy ? (
                <WhorlSpinner size="sm" ground="day" />
              ) : (
                <Text style={styles.escapeText}>Not now</Text>
              )}
            </TouchableOpacity>
            <View style={styles.grow} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Working — the exchange is in flight (gate armed, no session yet) ───────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.stateBody} testID="reset-working">
        <View style={styles.grow} />
        <WhorlSpinner size="md" ground="day" />
        <Text style={styles.workingText}>Checking your link</Text>
        <View style={styles.grow} />
      </View>
    </SafeAreaView>
  );
}

// Shared layout for the three terminal states (§5.5 / §5.5b / §5.6): icon, title,
// body, one forward action, and a "Back to log in" — every state has an exit (FR-9).
function StateScreen({
  icon,
  title,
  body,
  primaryLabel,
  onPrimary,
  primaryLoading,
  onBack,
  testID,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryLoading?: boolean;
  onBack: () => void;
  testID: string;
}) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.stateBody} testID={testID}>
        <View style={styles.grow} />
        <View style={styles.icon}>{icon}</View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subCentered}>{body}</Text>
        <View style={styles.grow} />
        <View style={styles.cta}>
          <PrimaryButton
            label={primaryLabel}
            onPress={onPrimary}
            loading={primaryLoading}
            testID={`${testID}-primary`}
          />
          <TouchableOpacity
            onPress={onBack}
            style={styles.escapeRow}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Back to log in"
            testID={`${testID}-back`}
          >
            <Text style={styles.escapeText}>Back to log in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
    paddingHorizontal: theme.space3,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: theme.space4,
  },
  stateBody: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: theme.space2,
  },
  grow: {
    flexGrow: 1,
  },
  icon: {
    width: theme.space6,
    height: theme.space6,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space3,
  },
  title: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    marginBottom: theme.space1,
    letterSpacing: theme.trackingTight,
    textAlign: 'center',
  },
  sub: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space4,
  },
  subCentered: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    textAlign: 'center',
    marginTop: theme.space1,
  },
  field: {
    marginBottom: theme.space2,
  },
  submit: {
    marginTop: theme.space2,
  },
  cta: {
    width: '100%',
    gap: theme.space2,
  },
  escapeRow: {
    minHeight: theme.space5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space1,
  },
  escapeText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  workingText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    marginTop: theme.space3,
  },
});
