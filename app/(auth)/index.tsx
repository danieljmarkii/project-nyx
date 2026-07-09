import { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { AuthBrandMark } from '../../components/onboarding/AuthBrandMark';
import { ValuePreview, ValuePreviewVariant } from '../../components/onboarding/ValuePreview';

// The Signal-led Landing (B-251 PR 5, spec §3.0, mockup 01–03) — the new
// unauthenticated entry point that replaces the bare login-first screen. Three
// pieces: a logo that anchors "which app is this?", a swipeable stack of data-rich
// value previews that LEAD WITH THE SIGNAL (the differentiator, spec §3.0/v3), and
// a persistent auth footer pinned across every swipe position so a new owner can
// browse the value or sign up immediately, and a returning owner can just log in.
// Users with a live session + completed onboarding are routed straight to the
// tabs by app/_layout, so they never see this.

// Order matters — the Signal opens (the "is she getting better?" answer only Culprit
// gives), then the effortless log, then the free vet report closes the story.
const PREVIEWS: { variant: ValuePreviewVariant; label: string }[] = [
  { variant: 'signal', label: "Patterns you can't see" },
  { variant: 'log', label: 'A couple of taps today' },
  { variant: 'report', label: 'Ready for the vet' },
];

export default function LandingScreen() {
  // The page size is measured from the swipe stage (not the raw screen): the width
  // accounts for the screen's horizontal padding so paging snaps cleanly, and the
  // height is applied to each page so ValuePreview's flex:1 can vertically centre
  // the preview instead of collapsing (a horizontal ScrollView gives children no
  // intrinsic height).
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function onStageLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setStage({ width, height });
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (stage.width <= 0) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / stage.width);
    setIndex(Math.min(Math.max(next, 0), PREVIEWS.length - 1));
  }

  // The accessible alternative to the swipe gesture: tapping a dot jumps to its
  // preview (AC — a swipe alternative for a11y). The whole stack is also mounted,
  // so a screen reader can read every preview regardless of scroll position.
  function goTo(i: number) {
    setIndex(i);
    scrollRef.current?.scrollTo({ x: i * stage.width, animated: true });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Hero-scale brand lockup — the same AuthBrandMark the login/signup forms
          anchor with, so the whole unauthenticated flow shares one lockup. */}
      <AuthBrandMark size="hero" style={styles.logo} />

      <View style={styles.stage} onLayout={onStageLayout}>
        {stage.width > 0 ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            scrollEventThrottle={16}
          >
            {PREVIEWS.map((p) => (
              <View
                key={p.variant}
                // Runtime page size from the measured stage — each page fills the
                // swipe area exactly, so paging snaps and the preview can centre.
                style={{ width: stage.width, height: stage.height }}
              >
                <ValuePreview variant={p.variant} />
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <View style={styles.dots}>
        {PREVIEWS.map((p, i) => (
          <TouchableOpacity
            key={p.variant}
            onPress={() => goTo(i)}
            // The dots are the a11y swipe-alternative, so each must be a real ≥44pt
            // target. A padding box (not hitSlop) grows the 8pt dot to the floor
            // without letting neighbouring tap zones overlap the way extended
            // hitSlop would (code-review).
            style={styles.dotHit}
            accessibilityRole="button"
            accessibilityState={{ selected: i === index }}
            accessibilityLabel={`Show preview ${i + 1} of ${PREVIEWS.length}: ${p.label}`}
          >
            <View style={[styles.dot, i === index && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Pinned + persistent across every swipe position (spec §3.0 / AC). */}
      <View style={styles.cta}>
        <PrimaryButton
          label="Create account"
          onPress={() => router.push('/(auth)/signup')}
          // Teal acquisition-hero fill (PM-ratified over near-black) — the accent
          // the rest of the Landing already speaks (logo, active dot, sparkline).
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
    paddingHorizontal: theme.space3,
  },
  // AuthBrandMark owns the row layout; the Landing only adds its vertical rhythm.
  logo: {
    paddingVertical: theme.space2,
  },
  stage: {
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ≥44pt touch box around each dot (the dot is the visual; this is the tap zone).
  // 44 is the documented touch-target floor used verbatim elsewhere (InsightCard).
  dotHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: theme.space1,
    height: theme.space1,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
  },
  // The active dot elongates into a pill in the accent — the "you are here" cue.
  dotActive: {
    width: theme.space3,
    backgroundColor: theme.colorAccent,
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
    color: theme.colorTextPrimary,
  },
});
