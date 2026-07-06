import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useAuthStore } from '../../store/authStore';
import { usePetStore } from '../../store/petStore';
import { markOnboardingComplete } from '../../lib/profile';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../../components/ui/PrimaryButton';

// "All set" — the warm completion that closes onboarding (B-251 PR 10, spec §3.8,
// mockup 12). Two jobs: (1) write the durable onboarding_completed_at flag (§6 /
// D12) so a returning owner skips the flow; (2) hand the owner to Home's designed
// empty state (Principle 5) — no forced first log (the payoff is the pet being
// ready, not a chore).
//
// The flag is written ON REACHING this screen (a mount effect), not on the button
// tap — so an owner who quits here is still recorded complete. The write is
// non-fatal if it fails: the §6 legacy rule (has a pet + null completion) already
// treats this account as complete, so a failed write never re-onboards them; the
// helper logs the miss (no silent failure).
//
// This is the flow's true terminus: it draws no back affordance and locks the
// swipe-back gesture (Stack.Screen below), so the owner can't slip back into the
// paywall from "all set". "Go to home" REPLACES the route, so Home has no
// onboarding screen behind it either.
export default function DoneScreen() {
  const { user } = useAuthStore();
  const { activePet } = usePetStore();
  const wroteRef = useRef(false);
  // Latches once the escape hatch fires, so the completion write can never run in a
  // render where we've decided to bounce back to pet setup. Today activePet only
  // ever goes null→populated on this stack (usePet refetches only in the tabs
  // layout), so this is belt-and-suspenders — but it future-proofs the write if a
  // refetch-on-focus is ever added to an onboarding screen (code-review).
  const escapedRef = useRef(false);

  // Escape hatch: reaching "all set" without a pet is a stray deep link — restart
  // pet setup rather than record a completion for an account with no pet.
  useEffect(() => {
    if (!activePet) {
      escapedRef.current = true;
      router.replace('/onboarding/pet-type');
    }
  }, [activePet]);

  // Write the durable completion flag exactly once, as soon as we have both the
  // authenticated user and the created pet. Fire-and-forget: the flag is for the
  // NEXT cold start's gate, so it never blocks the owner from tapping through to
  // Home. The ref guards against a dev double-invoke (and any re-render) firing a
  // second, redundant write.
  useEffect(() => {
    const userId = user?.id;
    if (!userId || !activePet || wroteRef.current || escapedRef.current) return;
    wroteRef.current = true;
    markOnboardingComplete(userId).catch((e) => {
      // A throw (not a resolved error result) — the helper handles resolved errors
      // and logs them; this catches a network-layer rejection. Non-fatal: the §6
      // legacy rule is the fallback. Never rethrow — nothing should block the finish.
      console.warn('[done] completion write threw:', e);
    });
  }, [user, activePet]);

  if (!activePet) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Lock the terminus: no swipe-back into the paywall from "all set". */}
      <Stack.Screen options={{ gestureEnabled: false }} />

      <View style={styles.body}>
        <View style={styles.grow} />

        <View style={styles.orb}>
          <Check size={48} color={theme.colorAccent} strokeWidth={2} />
        </View>

        <Text style={styles.title}>You&apos;re all set.</Text>
        <Text style={styles.subtitle}>
          {`Say hi to ${activePet.name} — their home is ready.`}
        </Text>

        <View style={styles.grow} />

        <PrimaryButton
          label={`Go to ${activePet.name}'s home`}
          onPress={() => router.replace('/(tabs)')}
          testID="done-go-home"
        />
        <Text style={styles.closing}>
          Got more than one pet? You can add them anytime from your profile.
        </Text>
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
  body: {
    flex: 1,
    alignItems: 'center',
  },
  // Accent-tinted circle behind the check — the calm "done" mark (mockup orb).
  orb: {
    width: theme.space6,
    height: theme.space6,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space3,
  },
  // Newsreader display face — the brand's warm-moment voice (only the 400 face is
  // loaded, so no fontWeight; matches the Landing wordmark + AI Signal headline).
  title: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.text2XL,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
    textAlign: 'center',
    marginBottom: theme.space1,
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    textAlign: 'center',
  },
  grow: {
    flex: 1,
    minHeight: theme.space4,
  },
  closing: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
    textAlign: 'center',
    marginTop: theme.space2,
  },
});
