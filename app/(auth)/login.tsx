import { useEffect, useState } from 'react';
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
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { theme } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';
import { TextField } from '../../components/ui/TextField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { AuthBrandMark } from '../../components/onboarding/AuthBrandMark';
import { emailError } from '../../lib/authValidation';
import { authErrorCopy, isEmailNotConfirmed, isInvalidCredentials } from '../../lib/authErrors';
import { confirmRedirectUrl } from '../../lib/emailConfirm';
import { PASSWORD_RECOVERY_ENABLED } from '../../constants/flags';

// Returning-owner sign-in (B-251). Rebuilt on the same design system as the
// Landing (index) and account (signup) screens so the unauthenticated entry reads
// as one flow, not two — the shared SafeAreaView canvas, a bare back chevron, a
// display-scale title, the TextField primitive, and PrimaryButton. Reached from
// the Landing's "Log in" (a push), and from signup / the post-deletion sign-out
// (a replace) — hence the canGoBack-guarded back below.

const ACCOUNT_DELETED_MSG = 'Your account and everything in it has been deleted.';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Errors surface only after a submit attempt, then update live as the user fixes
  // each field — calm, not a red-alarm on the first keystroke (Principle 4). Mirrors
  // signup's submitted-gated inline errors.
  const [submitted, setSubmitted] = useState(false);

  // Post-deletion confirmation (B-039 FR-12). Capture the one-shot flag at first
  // mount — login mounts fresh after the SIGNED_OUT route replace — then clear it
  // from the store so a later remount (e.g. a normal sign-out) won't resurface it.
  const justDeletedAccount = useAuthStore((s) => s.justDeletedAccount);
  const setJustDeletedAccount = useAuthStore((s) => s.setJustDeletedAccount);
  const [showDeletedConfirmation] = useState(justDeletedAccount);
  // FR-20 §5.6b: an involuntary sign-out (the FR-18 eviction on another device) lands
  // here with this one-shot armed. Same capture-then-clear lifecycle as the deletion
  // banner — the two share the banner slot and never both show (a deletion is not an
  // eviction). Deletion wins if somehow both are set.
  const signedOutInvoluntarily = useAuthStore((s) => s.signedOutInvoluntarily);
  const setSignedOutInvoluntarily = useAuthStore((s) => s.setSignedOutInvoluntarily);
  const [showEvictedBanner] = useState(signedOutInvoluntarily && !justDeletedAccount);
  useEffect(() => {
    if (justDeletedAccount) setJustDeletedAccount(false);
    if (signedOutInvoluntarily) setSignedOutInvoluntarily(false);
    // Run once on mount: capture-then-clear. Re-running on flag change would clear
    // it before the first paint shows the banner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On login we only check the email is well-formed and a password was entered —
  // never the signup password RULES (an existing password predates any rule change;
  // the server is the sole authority on whether it's correct). "Enter your password"
  // rather than signup's "Choose a password": you already have one.
  const emailErr = submitted ? emailError(email) : null;
  const passwordErr = submitted && !password ? 'Enter your password' : null;

  function goBack() {
    // Login is push-entered from the Landing (back → Landing) but replace-entered
    // from signup's already-registered redirect and the post-deletion sign-out
    // (no back entry). Fall back to the Landing so back is never a dead no-op.
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)');
  }

  async function handleLogin() {
    setSubmitted(true);
    // Validate before the network round-trip. If anything's off, the inline errors
    // are already rendering (submitted=true) — just stop.
    if (emailError(email) || !password) return;

    const cleanEmail = email.trim();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    setLoading(false);
    if (!error) {
      router.replace('/(tabs)');
      return;
    }

    // Server errors surface in an alert — the same shape signup uses. The copy is
    // always mapped (lib/authErrors), never Supabase's raw string.
    const copy = authErrorCopy(error, 'login', cleanEmail);

    // The unconfirmed-email case is the one failure where the owner is stuck
    // through no fault of their own — the account is fine, the email just never
    // arrived (spam, a typo, a slow relay). An OK-only alert would send them back
    // to signup to get a new link, which re-treads account creation for what is
    // really a one-tap need. So the remedy rides on the alert itself (B-152).
    if (isEmailNotConfirmed(error)) {
      Alert.alert(copy.title, copy.message, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Resend link', onPress: () => resendConfirmation(cleanEmail) },
      ]);
      return;
    }

    // §5.1b / FR-13: a credential mismatch is the moment an owner discovers they need
    // recovery, so the affordance rides INSIDE the alert announcing the failure —
    // otherwise the modal sits on top of the FR-1 link and hides it. Gated on the
    // recovery flag, so until enablement this is exactly today's plain alert below.
    if (PASSWORD_RECOVERY_ENABLED && isInvalidCredentials(error)) {
      Alert.alert(
        "Couldn't sign you in",
        "We couldn't sign you in with that email and password.",
        [
          { text: 'Reset password', onPress: () => goToRecovery(cleanEmail) },
          { text: 'Try again', style: 'cancel' },
        ],
      );
      return;
    }

    Alert.alert(copy.title, copy.message);
  }

  // FR-1 / §5.1b: into the request screen, carrying whatever the owner already typed
  // (FR-2 pre-fill). `push`, not `replace`, so a mistaken tap can back out to login.
  function goToRecovery(prefillEmail: string) {
    router.push({
      pathname: '/(auth)/forgot-password',
      params: prefillEmail ? { email: prefillEmail } : {},
    });
  }

  async function resendConfirmation(target: string) {
    // Carries the same deep link as signup's own send (B-432). This is the resend
    // an owner reaches when they've already been bounced once, so it is the last
    // place that should hand back a link that dead-ends on a web page.
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: target,
      options: { emailRedirectTo: confirmRedirectUrl() },
    });
    if (error) {
      // Most likely the per-user send interval if they've just tried from the
      // signup screen — mapped to a wait, not a security lecture.
      const copy = authErrorCopy(error, 'resend', target);
      Alert.alert(copy.title, copy.message);
      return;
    }
    Alert.alert('Link sent', `We sent another link to ${target}.`);
  }

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
          {/* Top bar: back chevron pinned left, the Culprit brand mark centred — so
              the login form reads as part of the branded Landing flow, not a plain
              utility screen dropped in after it (TestFlight feedback 2026-07-09). */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={goBack}
              style={styles.back}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="login-back"
            >
              <ChevronLeft size={24} color={theme.colorTextPrimary} strokeWidth={2} />
            </TouchableOpacity>
            <AuthBrandMark />
          </View>

          <Text style={styles.title}>Welcome back</Text>
          {showDeletedConfirmation ? (
            // Post-deletion the banner IS the context line — it stands in for the
            // "pick up where you left off" subtitle, which would contradict having
            // just wiped the account (B-039 banner + the login-rebuild PM review).
            <View style={styles.deletedBanner}>
              <Text style={styles.deletedBannerText}>{ACCOUNT_DELETED_MSG}</Text>
            </View>
          ) : showEvictedBanner ? (
            // FR-20 §5.6b: the evicted co-resident's landing. "Usually" is load-
            // bearing — a revoked refresh token is indistinguishable from any other
            // non-retryable failure, so the device CANNOT know the cause and must not
            // claim one (§7.2.3). The authoritative "why" arrives by email.
            <View style={styles.deletedBanner} testID="login-evicted-banner">
              <Text style={styles.evictedTitle}>You were signed out</Text>
              <Text style={styles.deletedBannerText}>
                This usually happens when the account password is changed on another device.
                Sign in again to pick up where you left off.
              </Text>
            </View>
          ) : (
            <Text style={styles.subtitle}>Pick up right where you left off.</Text>
          )}

          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={emailErr}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            containerStyle={styles.field}
            testID="login-email"
          />

          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={passwordErr}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            containerStyle={styles.field}
            testID="login-password"
          />

          {/* FR-1: the recovery entry point, under the password field and reachable
              before any submit. Hidden entirely while PASSWORD_RECOVERY_ENABLED is
              off (clean store build, spec §8) — not shown-disabled. */}
          {PASSWORD_RECOVERY_ENABLED ? (
            <TouchableOpacity
              onPress={() => goToRecovery(email.trim())}
              style={styles.forgotLink}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Forgot password?"
              testID="login-forgot"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          ) : null}

          <PrimaryButton
            label="Log in"
            onPress={handleLogin}
            loading={loading}
            style={styles.submit}
            testID="login-submit"
          />

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/signup')}
            style={styles.signupLink}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Create a new account"
            testID="login-to-signup"
          >
            <Text style={styles.signupText}>
              Don't have an account?{' '}
              <Text style={styles.signupTextAccent}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  // Standard top-bar height so the centred brand mark and the absolutely-pinned
  // back chevron share one clean row (the chevron overlays the row's left edge
  // without shoving the mark off-centre).
  header: {
    height: theme.space5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.space1,
    marginBottom: theme.space4,
  },
  back: {
    position: 'absolute',
    left: -theme.space1,
    top: 0,
    bottom: 0,
    width: theme.space5,
    justifyContent: 'center',
    // Left-align the glyph within the tap box.
    alignItems: 'flex-start',
    zIndex: 1,
  },
  title: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    marginTop: theme.space1,
    marginBottom: theme.space1,
    letterSpacing: theme.trackingTight,
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space4,
  },
  deletedBanner: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusSmall,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    marginBottom: theme.space3,
  },
  deletedBannerText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    textAlign: 'center',
  },
  evictedTitle: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    textAlign: 'center',
    marginBottom: 2,
  },
  field: {
    marginBottom: theme.space2,
  },
  // FR-1 link — right-aligned under the password field, ≥44pt tap target, teal in
  // the shipped auth-link language.
  forgotLink: {
    minHeight: 44,
    alignSelf: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: theme.space1,
  },
  forgotText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  submit: {
    marginTop: theme.space2,
  },
  signupLink: {
    minHeight: theme.space5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space2,
  },
  signupText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  // The tappable half of the prompt carries the teal accent so it reads as the
  // link it is (the whole row was flat grey before) — matching signup's accented
  // Terms/Privacy treatment and the Landing's accent language.
  signupTextAccent: {
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
});
