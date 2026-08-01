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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Mail, WifiOff } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { theme } from '../../constants/theme';
import { TextField } from '../../components/ui/TextField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { AuthBrandMark } from '../../components/onboarding/AuthBrandMark';
import { emailError } from '../../lib/authValidation';
import { authErrorCopy, isOffline, AuthErrorLike } from '../../lib/authErrors';
import { recoveryRedirectUrl, resendSecondsRemaining, resendLabel, shouldOfferSupport } from '../../lib/passwordRecovery';
import { recordRecoveryRequest } from '../../lib/recoveryMarker';
import { SUPPORT_EMAIL } from '../../constants/links';

// The "Reset your password" request screen (B-280 FR-2/3/10/12, spec §5.2/§5.3/§5.6).
// Three states in one screen, a designed screen for each (Principle 5, FR-9):
//   • request  — the email field + Send (§5.2). Pre-filled from whatever the owner
//                already typed on login (FR-2) or from §5.5's recoveryEmail.
//   • sent     — the NEUTRAL "check your inbox" state, byte-identical for an address
//                that has an account and one that doesn't (D2). Resend cooldown,
//                edit-address, and a support escape (§5.3).
//   • failed   — the request itself failed; split on error shape so an online owner
//                is never told to check a connection that is fine (§5.6, FR-10).
//
// Reached from the login "Forgot password?" link and the §5.1b failure alert.

type Stage = 'request' | 'sent' | 'failed';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  // FR-2: carry forward the address the owner already typed. Asking for it again is
  // a decision at the moment of need. `??` not `||` so an empty string param is fine.
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [stage, setStage] = useState<Stage>('request');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // D7 cooldown bookkeeping. `lastSentAtMs` is set at the INITIAL send, so the Sent
  // state renders "Resend in 60s" from first paint — the impatient t≈5s tap, the one
  // that hits the server rate limit, is the tap this cooldown exists to explain.
  const [lastSentAtMs, setLastSentAtMs] = useState<number | null>(null);
  const [resendCount, setResendCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // The error that put us on the failed state, kept so §5.6 can split its copy.
  const [failureError, setFailureError] = useState<AuthErrorLike>(null);

  const emailErr = submitted ? emailError(email) : null;

  // Tick the countdown only while the Sent state is up. A plain timer, not an
  // animated loader — no reduced-motion frame needed.
  useEffect(() => {
    if (stage !== 'sent') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stage]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
  }

  // The one network call. Records the local marker FIRST (FR-12/FR-14 — the request
  // must be vouched-for the moment the email is on its way), then sends. Both the
  // initial send and the resend route through here.
  async function sendLink(isResend: boolean) {
    const cleanEmail = email.trim();
    setLoading(true);
    // Best-effort marker (recordRecoveryRequest never throws): a missing marker only
    // costs FR-14 refusing the link into §5.5b later, never a failed send.
    await recordRecoveryRequest(cleanEmail, Date.now());
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: recoveryRedirectUrl(),
    });
    setLoading(false);

    if (error) {
      if (isResend) {
        // A resend failure stays on the Sent state — the first email may well be on
        // its way. Surface the reason calmly (a rate limit reads as "give it a
        // moment", never a security lecture). Mapped copy, never the raw string.
        const copy = authErrorCopy(error, 'resend', cleanEmail);
        Alert.alert(copy.title, copy.message);
        return;
      }
      // The initial send failed → the designed failed state, never a false Sent (FR-10).
      setFailureError(error);
      setStage('failed');
      return;
    }

    // D2: the Sent state is shown for EVERY well-formed address, and its copy never
    // asserts an account exists. The cooldown clock starts here on the initial send.
    setLastSentAtMs(Date.now());
    setNow(Date.now());
    if (isResend) setResendCount((c) => c + 1);
    setStage('sent');
  }

  function handleSend() {
    setSubmitted(true);
    if (emailError(email)) return;
    void sendLink(false);
  }

  function handleResend() {
    if (loading) return;
    if (resendSecondsRemaining(lastSentAtMs, Date.now()) > 0) return;
    void sendLink(true);
  }

  async function handleOpenEmail() {
    // Reuses signup's approach: open the Mail inbox, calm pointer on failure.
    try {
      await Linking.openURL('message://');
    } catch {
      Alert.alert('Open your mail app', 'Check your inbox for the link from Culprit.');
    }
  }

  function handleContactSupport() {
    const url = `mailto:${SUPPORT_EMAIL}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Contact support', `Email us at ${SUPPORT_EMAIL} and we'll help you get back in.`);
    });
  }

  // ── Sent state (§5.3) ──────────────────────────────────────────────────────────
  if (stage === 'sent') {
    const cleanEmail = email.trim();
    const secondsRemaining = resendSecondsRemaining(lastSentAtMs, now);
    const canTapResend = secondsRemaining === 0 && !loading;
    const offerSupport = shouldOfferSupport(resendCount, lastSentAtMs, now);
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.stateBody}>
          <View style={styles.grow} />
          <View style={styles.icon}>
            <Mail size={44} color={theme.colorAccent} strokeWidth={1.5} />
          </View>
          <Text style={styles.title}>Check your inbox</Text>
          <Text style={styles.sub}>
            If {cleanEmail} has an account, we've sent a link to set a new password. Open it on
            this phone. It should arrive in a minute or two — check your spam folder if it doesn't.
          </Text>
          <View style={styles.grow} />

          <View style={styles.cta}>
            <PrimaryButton
              label="Open email app"
              onPress={handleOpenEmail}
              testID="forgot-open-email"
            />
            {/* The single affordance that rescues a typo — teal, in the auth-link
                language, promoted above the resend (a caption here makes D2's
                neutrality unaffordable). */}
            <TouchableOpacity
              onPress={() => setStage('request')}
              style={styles.linkRow}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Use a different email address"
              testID="forgot-edit-email"
            >
              <Text style={styles.linkAccent}>Use a different email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleResend}
              disabled={!canTapResend}
              style={styles.linkRow}
              accessibilityRole="button"
              accessibilityLabel={resendLabel(secondsRemaining)}
              accessibilityState={{ disabled: !canTapResend }}
              testID="forgot-resend"
            >
              <Text style={[styles.linkMuted, !canTapResend && styles.linkDisabled]}>
                {resendLabel(secondsRemaining)}
              </Text>
            </TouchableOpacity>
            {offerSupport ? (
              <TouchableOpacity
                onPress={handleContactSupport}
                style={styles.supportRow}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Still nothing? Contact support"
                testID="forgot-support"
              >
                <Text style={styles.supportText}>
                  Still nothing? <Text style={styles.linkAccent}>Contact support</Text>
                </Text>
                <Text style={styles.supportSub}>We usually reply within a day.</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Request failed (§5.6) ────────────────────────────────────────────────────
  if (stage === 'failed') {
    const offline = isOffline(failureError);
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.stateBody}>
          <View style={styles.grow} />
          <View style={styles.icon}>
            <WifiOff size={44} color={theme.colorAccent} strokeWidth={1.5} />
          </View>
          <Text style={styles.title}>Couldn't send that link</Text>
          <Text style={styles.sub}>
            {offline
              ? "You're offline. We'll need a connection to send that link."
              : 'Something went wrong on our end. Try again in a moment.'}
          </Text>
          <View style={styles.grow} />
          <View style={styles.cta}>
            <PrimaryButton
              label="Try again"
              onPress={() => void sendLink(false)}
              loading={loading}
              testID="forgot-retry"
            />
            <TouchableOpacity
              onPress={() => router.replace('/(auth)/login')}
              style={styles.linkRow}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Back to log in"
              testID="forgot-failed-back"
            >
              <Text style={styles.linkMuted}>Back to log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Request state (§5.2) ─────────────────────────────────────────────────────
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
          <View style={styles.header}>
            <TouchableOpacity
              onPress={goBack}
              style={styles.back}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="forgot-back"
            >
              <ChevronLeft size={24} color={theme.colorTextPrimary} strokeWidth={2} />
            </TouchableOpacity>
            <AuthBrandMark />
          </View>

          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>
            Check your email address is right and we'll send you a link to set a new one.
          </Text>

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
            returnKeyType="send"
            onSubmitEditing={handleSend}
            containerStyle={styles.field}
            testID="forgot-email"
          />

          <PrimaryButton
            label="Send reset link"
            onPress={handleSend}
            loading={loading}
            style={styles.submit}
            testID="forgot-submit"
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
    paddingHorizontal: theme.space3,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: theme.space4,
  },
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
    alignItems: 'flex-start',
    zIndex: 1,
  },
  // Centred-column states (sent / failed) mirror signup's verify layout.
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
    marginTop: theme.space1,
    marginBottom: theme.space1,
    letterSpacing: theme.trackingTight,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space4,
  },
  sub: {
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
    alignItems: 'center',
  },
  linkRow: {
    minHeight: theme.space5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkAccent: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  linkMuted: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  linkDisabled: {
    color: theme.colorTextTertiary,
  },
  supportRow: {
    minHeight: theme.space5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space1,
  },
  supportText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  supportSub: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
});
