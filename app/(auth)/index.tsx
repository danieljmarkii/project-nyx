import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { theme } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { CulpritMark } from '../../components/brand/CulpritMark';
import { NightHeroGround } from '../../components/onboarding/NightHeroGround';

// The Culprit Landing hero (B-284 PR N2b, spec §4; hero recomposed 2026-07-26) —
// the unauthenticated entry point. A full-bleed night ground (aurora + whorl
// ground + starfield, NightHeroGround) carries the carved moon at hero scale
// with a STATIC Signal dot, the "Culprit" wordmark, the one-line positioning
// sub, and the unchanged Create-account / Log-in stack.
//
// The ring-train ping is retired from this surface (PM-ratified 2026-07-26,
// Option B of docs/culprit-landing-hero-mockups.html). Two reasons, recorded so
// nobody re-adds it as polish: (1) the pulse contract (spec §3) ties `live` to a
// fresh unseen finding, and a logged-out screen has none — the ping here was
// decoration wearing a semantic costume; (2) the B-322 ring train never played
// clean on device. The hero's richness now comes from the static whorl ground
// (the getculprit.app watermark, NightHeroGround), and the Landing carries zero
// ambient loops.
//
// The value-preview carousel that used to live here now sits one tap behind the
// "See how it works" link, on its own LIGHT screen (app/(auth)/how-it-works.tsx) —
// the register rule §1.2: the hero is the app's brand moment (night); the previews
// are records/education (light). The hero leads; the value education is a door, not
// a wall.
//
// THIS SCREEN IS THE COLD-START INITIAL ROUTE — for everyone, signed in or not.
// Since B-251 PR 5 added this file, `(auth)/index` and `(tabs)/index` both match
// the root URL "/", and expo-router's route sort breaks the tie by group order,
// so `(auth)` wins. app/_layout's cold-start `getSession()` 'proceed' branch only
// writes the store — nothing routed a restored session past this screen, so a
// signed-in owner cold-started onto the login wall every single launch (the
// TestFlight login-every-open bug: Supabase showed each stored session refreshing
// successfully seconds before a fresh password login abandoned it). The guard
// below is the missing route: a live session on a FOCUSED Landing replaces to the
// tabs. Focus matters — signup mints a session while this screen sits unfocused
// beneath it in the stack, and redirecting from under an in-flight signup would
// hijack its own replace to onboarding. The recovery gate blocks the redirect for
// the same reason it exists at all (B-280 Trap 1): a recovery session must land
// on set-password, never Home.
//
// The auth CTAs hold until the cold-start session decision lands (isLoading) so a
// returning owner sees the night ground + moon — a brand beat, not a login wall
// flash — before the redirect fires. A genuinely signed-out cold start decides in
// milliseconds (a keychain read, no network), so the CTAs appear effectively
// immediately for the owner who actually needs them.
//
// The moon renders `ground="night"`, no `live` — CulpritMark owns the carve (the
// mask cutout, so the ground + stars show through the crescent) and renders its
// static frame (crisp resting dot, no ring, no scale) when the pulse is off.
export default function LandingScreen() {
  const { width } = useWindowDimensions();
  // ~44% of screen width (spec §4). The moon is the screen's focal graphic.
  const moonSize = Math.round(width * 0.44);

  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);
  const recoveryInProgress = useAuthStore((s) => s.recoveryInProgress);

  // Focus tracking for the redirect guard. Initial false is safe: the focus
  // effect lands before any async session decision can, so the cold-start
  // redirect never races it.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // The missing cold-start route (see header): a live session on the focused
  // Landing belongs in the app. Covers both the 'proceed' decision (session set
  // right after getSession resolves) and the 'retain' recovery (a transient
  // refresh failure whose retry succeeds while the owner is still sitting here —
  // TOKEN_REFRESHED writes the store and this effect fires). usePet (tabs
  // layout) owns the session-but-not-onboarded bounce, so "/(tabs)" is correct
  // for every live session that isn't mid-recovery.
  useEffect(() => {
    if (focused && session && !recoveryInProgress) {
      router.replace('/(tabs)');
    }
  }, [focused, session, recoveryInProgress]);

  // Hold the CTAs while the cold-start decision is pending (isLoading) and once
  // a session exists (redirect in flight) — the login wall must never flash at
  // an owner who is already signed in.
  const showAuthActions = !isLoading && !session;

  return (
    <View style={styles.root}>
      <NightHeroGround />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.hero}>
          {/* Moon + wordmark are one "Culprit" a11y image so a screen reader hears
              the brand once (the moon stays a silent child via accessible={false},
              exactly as it does inside AuthBrandMark). */}
          <View style={styles.lockup} accessible accessibilityRole="image" accessibilityLabel="Culprit">
            <CulpritMark size={moonSize} ground="night" accessible={false} />
            <Text style={styles.wordmark}>Culprit</Text>
          </View>
          {showAuthActions && (
            <>
              <Text style={styles.sub}>
                Track symptoms, find triggers. Walk into your next vet visit with answers, not guesses.
              </Text>
              {/* Tertiary affordance, deliberately NOT a filled button — keeps "Create
                  account" the single obvious action while the value previews stay one
                  tap away. */}
              <TouchableOpacity
                onPress={() => router.push('/(auth)/how-it-works')}
                style={styles.learnMore}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="See how it works"
                testID="landing-how-it-works"
              >
                <Text style={styles.learnMoreText}>See how it works ›</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Pinned + persistent once the session decision lands (spec §4). */}
        {showAuthActions && (
          <View style={styles.cta}>
            <PrimaryButton
              label="Create account"
              onPress={() => router.push('/(auth)/signup')}
              // Teal acquisition-hero fill (PM-ratified over near-black) — the accent
              // the rest of the hero already speaks (the Signal dot).
              variant="accent"
              testID="landing-create-account"
            />
            <TouchableOpacity
              onPress={() => router.push('/(auth)/login')}
              style={styles.loginButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Log in"
              testID="landing-log-in"
            >
              <Text style={styles.loginText}>Log in</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Night ground base sits behind the SVG + safe areas so the field is full-bleed
  // even before/around the SVG paints (no light flash at the edges).
  root: {
    flex: 1,
    backgroundColor: theme.colorBrandNight,
  },
  safe: {
    flex: 1,
    paddingHorizontal: theme.space3,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space2,
  },
  lockup: {
    alignItems: 'center',
    gap: theme.space1,
  },
  // "Culprit" in the Newsreader display face on the moonlight fill (15.8:1). No
  // fontWeight — only the 400 face is loaded (constants/theme.ts note).
  wordmark: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.text2XL,
    color: theme.colorMoonlight,
    letterSpacing: theme.trackingTight,
  },
  sub: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextOnNightMuted,
    textAlign: 'center',
    paddingHorizontal: theme.space2,
  },
  learnMore: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space1,
  },
  learnMoreText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  cta: {
    gap: theme.space1,
    paddingTop: theme.space1,
    paddingBottom: theme.space2,
  },
  loginButton: {
    minHeight: theme.space5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextOnNight,
  },
});
