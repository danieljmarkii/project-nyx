import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, Mail } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { updateOwnerName } from '../../lib/profile';
import { theme } from '../../constants/theme';
import { SOCIAL_AUTH_ENABLED } from '../../constants/flags';
import { TextField } from '../../components/ui/TextField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { AuthBrandMark } from '../../components/onboarding/AuthBrandMark';
import { Divider } from '../../components/ui/Divider';
import { emailError, passwordError, requiredNameError } from '../../lib/authValidation';

// Account creation — the first screen that captures OWNER identity (B-251 PR 6,
// spec §3.1 / §1a, mockup 04–05). Reached from the Landing's "Create account".
// Two states in one screen:
//   • the form (first / last / email / password + mocked social + TOS line), and
//   • the soft "check your inbox" verify state, shown only when Supabase email
//     confirmation is on (signUp returns no session). Enforcement is deferred to
//     the store-readiness hardening pass (S3) — v1 nudges, never blocks.
//
// Why owner name lands here: until 2026-07-03 nothing wrote user_profiles names,
// so the vet report printed "Owner: not recorded". updateOwnerName persists
// first/last + a derived display_name = "First Last" so generate-report's existing
// display_name read keeps working with no report-side change.

export default function SignupScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Errors surface only after a submit attempt, then update live as the user fixes
  // each field — calm, not a red-alarm on the first keystroke (Principle 4).
  const [submitted, setSubmitted] = useState(false);

  // When set (to the trimmed email), the screen swaps to the soft verify state.
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  // Computed live once submitted; before the first submit they're all null.
  const firstErr = submitted ? requiredNameError(firstName, 'first name') : null;
  const lastErr = submitted ? requiredNameError(lastName, 'last name') : null;
  const emailErr = submitted ? emailError(email) : null;
  const passwordErr = submitted ? passwordError(password) : null;

  async function handleSignup() {
    setSubmitted(true);
    // Validate everything before a network round-trip. If anything's off, the
    // inline errors are already rendering (submitted=true) — just stop.
    if (
      requiredNameError(firstName, 'first name') ||
      requiredNameError(lastName, 'last name') ||
      emailError(email) ||
      passwordError(password)
    ) {
      return;
    }

    const cleanEmail = email.trim();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
    setLoading(false);

    if (error) {
      Alert.alert("Couldn't create your account", error.message);
      return;
    }

    // When email confirmation is on, signUp succeeds with NO session until the user
    // taps the emailed link. Routing into onboarding here would bounce straight back
    // to the Landing (the root layout gates every screen on a live session), which
    // reads as "sign-up did nothing". Handle the no-session case explicitly.
    if (!data.session) {
      // Supabase returns a user with an empty identities array when the email is
      // already registered (hidden while confirmation is on, so it can't be used to
      // probe which emails have accounts).
      const alreadyRegistered = !!data.user && (data.user.identities?.length ?? 0) === 0;
      if (alreadyRegistered) {
        Alert.alert(
          'You already have an account',
          'That email is already set up. Try logging in instead.',
        );
        router.replace('/(auth)/login');
        return;
      }
      // A genuine new account awaiting confirmation → the soft verify state.
      // We cannot write the owner name here: there is no authenticated session, so
      // the RLS-scoped user_profiles write (auth.uid() = id) would be rejected. In
      // v1's realistic config (email confirmation OFF) we never reach this branch —
      // the session-present path below writes the name. Deferring the confirmation-on
      // name write to the post-verify session is an S3 hardening concern.
      setVerifyEmail(cleanEmail);
      return;
    }

    // Session present (email confirmation disabled — v1's config): we're
    // authenticated, so write the owner name, then into onboarding. The write is
    // best-effort — a network hiccup on it must not trap the user on this screen;
    // the name is re-enterable in Profile, and updateOwnerName logs its own failure
    // (no silent failure). display_name is derived inside the helper.
    if (data.user) {
      await updateOwnerName(data.user.id, firstName, lastName);
    }
    // The user_profiles row itself is created by the Supabase trigger on the
    // auth.users insert; the upsert in updateOwnerName also creates it if absent.
    router.replace('/onboarding/pet-type');
  }

  async function handleResend() {
    if (!verifyEmail || resending) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: verifyEmail });
    setResending(false);
    if (error) {
      Alert.alert("Couldn't resend", error.message);
      return;
    }
    Alert.alert('Link sent', `We sent another link to ${verifyEmail}.`);
  }

  async function handleOpenEmail() {
    // Best-effort: iOS-first, so open the Mail app inbox. If nothing handles the
    // scheme (simulator, an unusual device), fall back to a calm pointer rather
    // than a raw rejection.
    try {
      await Linking.openURL('message://');
    } catch {
      Alert.alert('Open your mail app', 'Check your inbox for the link from Culprit.');
    }
  }

  function openTerms() {
    // Mocked acceptance point (B-230). The real document is built separately.
    Alert.alert('Terms of Service', 'The full document is on its way.');
  }

  function openPrivacy() {
    // Mocked acceptance point (B-229). The real document is built separately.
    Alert.alert('Privacy Policy', 'The full document is on its way.');
  }

  // ── Soft verify state ────────────────────────────────────────────────────────
  if (verifyEmail) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.verifyBody}>
          {/* Escape hatch back to the form (§10 "no dead ends"): a mistyped email
              would otherwise strand the owner here. Returning drops verifyEmail,
              re-rendering the form with every entered value intact (they're still
              in state), so they can correct the address and resubmit. */}
          <View style={styles.verifyHeaderRow}>
            <TouchableOpacity
              onPress={() => setVerifyEmail(null)}
              style={styles.back}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Go back and edit your details"
              testID="verify-back"
            >
              <ChevronLeft size={24} color={theme.colorTextPrimary} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <View style={styles.grow} />
          <View style={styles.verifyIcon}>
            <Mail size={44} color={theme.colorAccent} strokeWidth={1.5} />
          </View>
          <Text style={styles.title}>Check your inbox</Text>
          <Text style={styles.verifySub}>
            We sent a link to {verifyEmail}. Tap it to verify — you can do this anytime.
          </Text>
          <View style={styles.grow} />

          <View style={styles.verifyCta}>
            <PrimaryButton
              label="Open email app"
              onPress={handleOpenEmail}
              testID="verify-open-email"
            />
            <TouchableOpacity
              onPress={handleResend}
              disabled={resending}
              style={styles.resend}
              accessibilityRole="button"
              accessibilityLabel="Resend verification link"
              accessibilityState={{ disabled: resending, busy: resending }}
              testID="verify-resend"
            >
              {resending ? (
                <ActivityIndicator color={theme.colorTextSecondary} />
              ) : (
                <Text style={styles.resendText}>Resend link</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            style={styles.continueLater}
            accessibilityRole="button"
            accessibilityLabel="Verify later and continue"
            testID="verify-continue"
          >
            <Text style={styles.continueLaterText}>Verify later · continue for now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Account form ─────────────────────────────────────────────────────────────
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
              the account form shares the Landing's brand presence (TestFlight
              feedback 2026-07-09; the auth forms read as one branded flow). */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="signup-back"
            >
              <ChevronLeft size={24} color={theme.colorTextPrimary} strokeWidth={2} />
            </TouchableOpacity>
            <AuthBrandMark />
          </View>

          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>This is you — we'll set up your pet next.</Text>

          <View style={styles.nameRow}>
            <TextField
              label="First name"
              value={firstName}
              onChangeText={setFirstName}
              error={firstErr}
              autoCapitalize="words"
              autoComplete="name-given"
              textContentType="givenName"
              returnKeyType="next"
              containerStyle={styles.nameField}
              testID="signup-first-name"
            />
            <TextField
              label="Last name"
              value={lastName}
              onChangeText={setLastName}
              error={lastErr}
              autoCapitalize="words"
              autoComplete="name-family"
              textContentType="familyName"
              returnKeyType="next"
              containerStyle={styles.nameField}
              testID="signup-last-name"
            />
          </View>

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
            testID="signup-email"
          />

          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={passwordErr}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={handleSignup}
            containerStyle={styles.field}
            testID="signup-password"
          />

          {/* Apple + Google — designed here so PR 11 is a flag flip, not a re-layout.
              Hidden entirely while SOCIAL_AUTH_ENABLED is off (clean store build, S7). */}
          {SOCIAL_AUTH_ENABLED ? (
            <View testID="signup-social">
              <View style={styles.orRow}>
                <Divider style={styles.orLine} />
                <Text style={styles.orText}>or</Text>
                <Divider style={styles.orLine} />
              </View>
              <PrimaryButton
                label="Continue with Apple"
                onPress={() =>
                  Alert.alert('Sign in with Apple', 'This is on the way — use your email for now.')
                }
                style={styles.socialBtn}
              />
              <PrimaryButton
                label="Continue with Google"
                variant="secondary"
                onPress={() =>
                  Alert.alert('Sign in with Google', 'This is on the way — use your email for now.')
                }
                style={styles.socialBtn}
              />
            </View>
          ) : null}

          <PrimaryButton
            label="Create account"
            onPress={handleSignup}
            loading={loading}
            style={styles.submit}
            testID="signup-submit"
          />

          <Text style={styles.tos}>
            By continuing you agree to Culprit's{' '}
            <Text style={styles.tosLink} onPress={openTerms} accessibilityRole="link">
              Terms
            </Text>{' '}
            and{' '}
            <Text style={styles.tosLink} onPress={openPrivacy} accessibilityRole="link">
              Privacy Policy
            </Text>
            .
          </Text>

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            style={styles.loginLink}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Log in to an existing account"
          >
            <Text style={styles.loginText}>
              Already have an account?{' '}
              <Text style={styles.loginTextAccent}>Log in</Text>
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
  back: {
    width: theme.space5,
    height: theme.space5,
    marginLeft: -theme.space1,
    justifyContent: 'center',
    // Left-align the glyph within the tap box.
    alignItems: 'flex-start',
  },
  // Form top bar: centred brand mark with the back chevron pinned to the left edge.
  // A dedicated style (not the shared `back` above, which the verify sub-screen
  // still uses in normal flow) so absolute positioning can't leak into that screen.
  header: {
    height: theme.space5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.space1,
    marginBottom: theme.space4,
  },
  headerBack: {
    position: 'absolute',
    left: -theme.space1,
    top: 0,
    bottom: 0,
    width: theme.space5,
    justifyContent: 'center',
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
  nameRow: {
    flexDirection: 'row',
    gap: theme.space2,
    marginBottom: theme.space2,
  },
  nameField: {
    flex: 1,
  },
  field: {
    marginBottom: theme.space2,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    marginVertical: theme.space2,
  },
  // Divider owns the hairline (height + colour); the row just stretches it.
  orLine: {
    flex: 1,
  },
  orText: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  socialBtn: {
    marginBottom: theme.space2,
  },
  submit: {
    marginTop: theme.space2,
  },
  tos: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    textAlign: 'center',
    marginTop: theme.space2,
  },
  tosLink: {
    color: theme.colorAccent,
    textDecorationLine: 'underline',
  },
  loginLink: {
    minHeight: theme.space5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space2,
  },
  loginText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  // The tappable half of the prompt carries the teal accent so it reads as a link
  // (matching the accented Terms/Privacy line above and login's Sign-up prompt).
  loginTextAccent: {
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
  // ── Verify state ──
  verifyBody: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: theme.space2,
  },
  // Full-width so the back chevron sits top-left despite the body centring its
  // column.
  verifyHeaderRow: {
    width: '100%',
    alignItems: 'flex-start',
  },
  grow: {
    flexGrow: 1,
  },
  verifyIcon: {
    width: theme.space6,
    height: theme.space6,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space3,
  },
  verifySub: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    textAlign: 'center',
    marginTop: theme.space1,
  },
  verifyCta: {
    width: '100%',
    gap: theme.space2,
  },
  resend: {
    minHeight: theme.space5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textDecorationLine: 'underline',
  },
  continueLater: {
    minHeight: theme.space5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space1,
  },
  continueLaterText: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
});
