import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { CulpritMark } from '../../components/brand/CulpritMark';
import { NightHeroGround } from '../../components/onboarding/NightHeroGround';

// The Culprit Landing hero (B-284 PR N2b, spec §4) — the unauthenticated entry
// point. A full-bleed night ground (aurora + starfield, NightHeroGround) carries
// the carved moon at hero scale with its Signal-dot ping, the "Culprit" wordmark,
// the one-line positioning sub, and the unchanged Create-account / Log-in stack.
//
// The value-preview carousel that used to live here now sits one tap behind the
// "See how it works" link, on its own LIGHT screen (app/(auth)/how-it-works.tsx) —
// the register rule §1.2: the hero is the app's brand moment (night); the previews
// are records/education (light). The hero leads; the value education is a door, not
// a wall. Users with a live session + completed onboarding are routed straight to
// the tabs by app/_layout, so they never see this.
//
// The moon renders `ground="night"` + `live` — CulpritMark owns the carve (the
// mask cutout, so the ground + stars show through the crescent) and the reduced-
// motion fallback (static glow, no ring), so this screen inherits both for free.
export default function LandingScreen() {
  const { width } = useWindowDimensions();
  // ~44% of screen width (spec §4). The moon is the screen's focal graphic.
  const moonSize = Math.round(width * 0.44);

  return (
    <View style={styles.root}>
      <NightHeroGround />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.hero}>
          {/* Moon + wordmark are one "Culprit" a11y image so a screen reader hears
              the brand once (the moon stays a silent child via accessible={false},
              exactly as it does inside AuthBrandMark). */}
          <View style={styles.lockup} accessible accessibilityRole="image" accessibilityLabel="Culprit">
            <CulpritMark size={moonSize} ground="night" live accessible={false} />
            <Text style={styles.wordmark}>Culprit</Text>
          </View>
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
        </View>

        {/* Pinned + persistent (spec §4: unchanged). */}
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
