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
import { emailError } from '../../lib/authValidation';

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
  useEffect(() => {
    if (justDeletedAccount) setJustDeletedAccount(false);
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

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      // Server errors (wrong credentials, unconfirmed email) surface in an alert —
      // the same shape signup uses for its server-side failures. Copy stays calm.
      Alert.alert("Couldn't sign you in", error.message);
    } else {
      router.replace('/(tabs)');
    }
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

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Log in to pick up where you left off.</Text>

          {showDeletedConfirmation && (
            <View style={styles.deletedBanner}>
              <Text style={styles.deletedBannerText}>{ACCOUNT_DELETED_MSG}</Text>
            </View>
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
            <Text style={styles.signupText}>Don't have an account? Sign up</Text>
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
  field: {
    marginBottom: theme.space2,
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
});
