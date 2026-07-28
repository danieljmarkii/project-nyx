import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { MailCheck, MailOpen } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { updateOwnerName } from '../../lib/profile';
import { coldStartDecision } from '../../lib/authRouting';
import {
  ConfirmState,
  decideConfirm,
  ownerNameFromMetadata,
  resolveConfirmLink,
  stateAfterFailedExchange,
} from '../../lib/emailConfirm';

// Where the emailed "Confirm email" link lands (B-432 / B-483).
//
// Before this screen existed, `signUp` sent no `emailRedirectTo`, so Supabase fell
// back to the project Site URL and the owner was dropped on a web page — a
// localhost one in build 35 — at the single highest-stakes moment in the funnel.
// This is the app-side half: the link now points at `nyx:///confirm`, expo-router
// routes it here, and the screen turns the code into a live session.
//
// EVERY PATH OUT OF HERE IS A DESIGNED STATE WITH ONE FORWARD ACTION. That matters
// more than usual because the owner arrives from their mail app with no context and
// no way back — and because the underlying account is fine in three of the four
// cases (GoTrue verifies the token server-side BEFORE redirecting, so a link that
// comes back carrying a code has already confirmed the address). The copy says so
// rather than implying something broke. The decision logic itself is pure and lives
// in `lib/emailConfirm.ts`.

export default function ConfirmScreen() {
  // The raw launch URL — the only source that can see a `#error=…` FRAGMENT, which
  // expo-router's params never carry. Returns the launch URL synchronously on the
  // first render and updates if a second link arrives while the app is warm.
  const url = Linking.useLinkingURL();
  const params = useLocalSearchParams();

  const [state, setState] = useState<ConfirmState>('working');
  const [signingOut, setSigningOut] = useState(false);
  // One link, handled once. Without this the effect would re-fire on every param
  // identity change and could exchange a single-use code twice — the second attempt
  // failing, and overwriting a success state with a failure one.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const link = resolveConfirmLink(url, params);

    if (link.kind === 'unrelated') {
      // Neither source carried anything about a confirmation. If there was no
      // launch URL at all, nothing later will change that — render the designed
      // dead-link state rather than spinning forever. If a URL *was* present but
      // belonged to something else (a widget deep link the app started from), keep
      // listening: the confirmation link may still be on its way in warm.
      if (!url) {
        handled.current = true;
        setState('link_dead');
      }
      return;
    }

    handled.current = true;
    void handleLink();

    async function handleLink() {
      // Read the session BEFORE deciding anything. `coldStartDecision` is the
      // shipped reading of getSession's (session, error) pair: null-WITH-error
      // means a stored session failed a transient refresh, which is emphatically
      // not "signed out" — treating it as such here would let a confirmation swap
      // the session on a device whose local SQLite still holds the other account's
      // pet record.
      const { data, error } = await supabase.auth.getSession();
      const sessionState =
        coldStartDecision(data.session, error) === 'to-auth' ? 'absent' : 'present';

      const decision = decideConfirm(link, sessionState);
      if (decision.kind === 'ignore') return;
      if (decision.kind === 'state') {
        setState(decision.state);
        return;
      }

      const { data: exchanged, error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(decision.code);

      if (exchangeError || !exchanged?.session) {
        // Never silent — but never alarming either: the address is confirmed, so
        // only the automatic sign-in was lost (see stateAfterFailedExchange).
        console.warn('[confirm] code exchange failed:', exchangeError?.message ?? 'no session');
        setState(stateAfterFailedExchange());
        return;
      }

      // Signed in. Now write the owner name that signup parked in user metadata,
      // because this is the first moment a session exists to write it with — with
      // confirmation ON, signup's own write never runs (no session ⇒ RLS rejects
      // it), and skipping it here would put "Owner: not recorded" back on every vet
      // report. Best-effort: a failed write must not strand the owner on this
      // screen, the name is re-enterable in Profile, and updateOwnerName logs its
      // own failure.
      const name = ownerNameFromMetadata(exchanged.user?.user_metadata);
      if (name && exchanged.user) {
        await updateOwnerName(exchanged.user.id, name.firstName, name.lastName);
      }

      // Into the app rather than straight to onboarding: usePet (in the tabs
      // layout) reads the durable onboarding gate and sends a new, petless account
      // to the veterinary disclaimer itself. Routing to /onboarding/disclaimer from
      // here would re-onboard an owner who confirmed a second time.
      router.replace('/(tabs)');
    }
    // Params are re-created every render, so depend on the values, not the object.
  }, [url, params.code, params.error, params.error_code, params.error_description]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    // The root layout's SIGNED_OUT handler owns the teardown and the routing — one
    // source of truth for the wipe (lib/session.ts). We deliberately don't route
    // here, and we don't clear the button's working state on success: the screen is
    // about to be replaced.
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('[confirm] sign-out failed:', error.message);
      setSigningOut(false);
    }
  }

  if (state === 'working') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.body} testID="confirm-working">
          <View style={styles.grow} />
          <WhorlSpinner size="md" ground="day" />
          <Text style={styles.workingText}>Confirming your email</Text>
          <View style={styles.grow} />
        </View>
      </SafeAreaView>
    );
  }

  const content = COPY[state];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.body} testID={`confirm-${state}`}>
        <View style={styles.grow} />
        <View style={styles.icon}>
          {state === 'link_dead' ? (
            <MailOpen size={44} color={theme.colorAccent} strokeWidth={1.5} />
          ) : (
            <MailCheck size={44} color={theme.colorAccent} strokeWidth={1.5} />
          )}
        </View>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.sub}>{content.body}</Text>
        <View style={styles.grow} />

        <View style={styles.cta}>
          <PrimaryButton
            label={content.action}
            onPress={
              state === 'already_signed_in'
                ? () => router.replace('/(tabs)')
                : () => router.replace('/(auth)/login')
            }
            testID="confirm-action"
          />
          {/* The different-account case needs a way through, not just an
              explanation: an owner confirming a second account on a shared phone
              would otherwise have to go hunting through Settings. */}
          {state === 'already_signed_in' ? (
            <TouchableOpacity
              onPress={handleSignOut}
              disabled={signingOut}
              style={styles.tertiary}
              accessibilityRole="button"
              accessibilityLabel="Sign out to use a different account"
              accessibilityState={{ disabled: signingOut, busy: signingOut }}
              testID="confirm-sign-out"
            >
              {signingOut ? (
                <WhorlSpinner size="sm" ground="day" />
              ) : (
                <Text style={styles.tertiaryText}>Sign out to use another account</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

// The copy pack, kept as data so every state is visible side by side — which is how
// you notice that three of them must NOT say "something went wrong".
interface ConfirmCopy {
  title: string;
  body: string;
  action: string;
}

const COPY: Record<Exclude<ConfirmState, 'working'>, ConfirmCopy> = {
  already_signed_in: {
    title: "You're already signed in",
    // Every clause is true regardless of which account the link was for, which is
    // the point: the code is opaque, so the app genuinely cannot tell.
    body:
      "Your email is confirmed. You're signed in on this device already, so there's " +
      'nothing else to do. If the link was for a different account, sign out first, ' +
      'then sign in with that email.',
    action: 'Continue',
  },
  confirmed_needs_signin: {
    title: 'Your email is confirmed',
    // Names what actually happened without guessing why. The cause — the link was
    // opened on a different phone, or already used — changes nothing the owner does
    // next, so the copy stays on the part that does.
    body:
      "We couldn't finish signing you in on this device. Sign in with your email and " +
      'password and everything will be waiting.',
    action: 'Go to sign in',
  },
  link_dead: {
    title: 'That link no longer works',
    // Deliberately does not assert WHICH cause: Supabase returns one
    // indistinguishable shape for expired, already-used, and consumed-by-a-mail-
    // scanner. Stating a general property of the links is honest; naming a cause we
    // can't observe is not.
    body:
      "Confirmation links are single-use and they don't last long. Sign in with your " +
      "email and we'll send you a fresh one.",
    action: 'Go to sign in',
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
    paddingHorizontal: theme.space3,
  },
  body: {
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
    textAlign: 'center',
    marginTop: theme.space1,
  },
  workingText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    marginTop: theme.space3,
  },
  cta: {
    width: '100%',
    gap: theme.space2,
  },
  tertiary: {
    minHeight: theme.space5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tertiaryText: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
});
