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
import { ChevronLeft } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ValuePreview, ValuePreviewVariant } from '../../components/onboarding/ValuePreview';

// "How it works" — the value-preview carousel, reached from the Landing hero's
// "See how it works" link (B-284 PR N2b). This is the SAME swipeable stack that
// used to live on the Landing itself (moved verbatim); the brand hero now leads,
// and the value education lives one tap behind it on its shipped LIGHT ground (the
// register rule §1.2 — previews are records/education, not the app "working"). The
// pager behaviour is unchanged: lead with the Signal (the differentiator), then
// the effortless log, then the free vet report. The same Create-account / Log-in
// stack is repeated here so a browsing owner can convert without going back.

// Order matters — the Signal opens (the "is she getting better?" answer only Culprit
// gives), then the effortless log, then the free vet report closes the story.
const PREVIEWS: { variant: ValuePreviewVariant; label: string }[] = [
  { variant: 'signal', label: "Patterns you can't see" },
  { variant: 'log', label: 'A couple of taps today' },
  { variant: 'report', label: 'Ready for the vet' },
];

export default function HowItWorksScreen() {
  // Page size measured from the swipe stage (not the raw screen) so paging snaps
  // cleanly and each page can vertically centre its preview.
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

  // Accessible alternative to the swipe gesture: tapping a dot jumps to its preview.
  function goTo(i: number) {
    setIndex(i);
    scrollRef.current?.scrollTo({ x: i * stage.width, animated: true });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          // Pushed from the Landing, so back is the norm; the replace fallback
          // covers a cold deep-link straight to this route (canGoBack === false).
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)'))}
          style={styles.back}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="how-it-works-back"
        >
          <ChevronLeft size={24} color={theme.colorTextPrimary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

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
              <View key={p.variant} style={{ width: stage.width, height: stage.height }}>
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
            // ≥44pt padding box (not hitSlop) around the 8pt dot — grows the target
            // without overlapping neighbours (B-146 / code-review pattern).
            style={styles.dotHit}
            accessibilityRole="button"
            accessibilityState={{ selected: i === index }}
            accessibilityLabel={`Show preview ${i + 1} of ${PREVIEWS.length}: ${p.label}`}
          >
            <View style={[styles.dot, i === index && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.cta}>
        <PrimaryButton
          label="Create account"
          onPress={() => router.push('/(auth)/signup')}
          variant="accent"
          testID="how-it-works-create-account"
        />
        <TouchableOpacity
          onPress={() => router.push('/(auth)/login')}
          style={styles.loginButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Log in"
          testID="how-it-works-log-in"
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.space1,
  },
  // ≥44pt back target, aligned to the container's left edge.
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -theme.space1,
  },
  stage: {
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
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
