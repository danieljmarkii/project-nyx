import { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { commitRoutine, commitSymptom } from '../../lib/haptics';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { MomentTone } from '../../store/momentStore';

// The completion beat that lands IN the sheet (B-745 PR 3). The root <CompletionMoment/>
// can't be reused here: it's absoluteFill at the app root, so it renders UNDER the
// sheet's Modal (which is why the full-screen /log flow dismisses first, then plays it).
// The one-surface confirm keeps Home in place, so the beat has to render inside the
// sheet — this is the compact, self-contained sibling, deliberately NOT a refactor of
// the shipped root component so the flag-off path is untouched.
//
// Same visual language as CompletionMoment: a mint check ring, a warm-gold glow only
// on the 'celebrate' tone (routine/Other logs), and a plain check for 'calm' (symptom
// logs — we never celebrate a worrying event; Principle 4 / clinical-guardrails). It
// defines a reduced-motion static frame (no spring, no bloom) and calls onDone after a
// brief dwell so the host can close the sheet.

const GLOW_SIZE = 220;
const CHECK_RING_SIZE = 84;
// SVG gradient def id — internal, namespaced so it can't be hijacked by another
// SVG's gradient. Deliberately NOT `nyx-…`-prefixed: that prefix is reserved for
// Storage bucket names (storagePolicies.test scans for it), and this is neither.
const GLOW_GRADIENT_ID = 'culprit-sheet-beat-glow';
// Well under the 2s earned-moment cap (matches the root beat's dwell).
const BEAT_MS = 1400;

interface Props {
  tone: MomentTone;
  title?: string;
  onDone: () => void;
}

export function SheetLogBeat({ tone, title = 'Logged', onDone }: Props) {
  const reduced = useReducedMotion();
  const celebrate = tone === 'celebrate';

  const checkScale = useRef(new Animated.Value(reduced ? 1 : 0.6)).current;
  const surfaceOpacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const glowOpacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const glowScale = useRef(new Animated.Value(reduced ? 1 : 0.5)).current;

  // Fire onDone once, after the dwell — a ref so a re-render can't schedule two.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    // CUL-604 §5.6 — this beat is the R2 register and does NOT go through momentStore,
    // so it plays its own commit haptic, on the same tone split: 'calm' (symptom) takes
    // the single soft tap, never the success double. Deliberately OUTSIDE the `reduced`
    // branch — touch is not motion, so the haptic still fires under Reduce Motion (the
    // §1 rule, applied here too).
    if (celebrate) commitRoutine();
    else commitSymptom();
    let anim: Animated.CompositeAnimation | null = null;
    if (!reduced) {
      anim = Animated.parallel([
        Animated.timing(surfaceOpacity, { toValue: 1, duration: theme.durationFast, useNativeDriver: true }),
        Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
        ...(celebrate
          ? [
              Animated.timing(glowOpacity, { toValue: 1, duration: theme.durationFast, useNativeDriver: true }),
              Animated.timing(glowScale, { toValue: 1, duration: theme.durationSlow, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]
          : []),
      ]);
      anim.start();
    }
    const timer = setTimeout(() => doneRef.current(), BEAT_MS);
    return () => { anim?.stop(); clearTimeout(timer); };
  }, [reduced, celebrate, surfaceOpacity, checkScale, glowOpacity, glowScale]);

  return (
    <Animated.View style={[styles.wrap, { opacity: surfaceOpacity }]} accessibilityLiveRegion="polite" accessibilityLabel={title}>
      {celebrate && (
        <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} pointerEvents="none">
          <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
            <Defs>
              <RadialGradient id={GLOW_GRADIENT_ID} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={theme.colorMomentGlow} stopOpacity={0.22} />
                <Stop offset="45%" stopColor={theme.colorMomentGlow} stopOpacity={0.06} />
                <Stop offset="70%" stopColor={theme.colorMomentGlow} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill={`url(#${GLOW_GRADIENT_ID})`} />
          </Svg>
        </Animated.View>
      )}
      <Animated.View style={[styles.ring, celebrate && styles.ringCelebrate, { transform: [{ scale: checkScale }] }]}>
        <Check size={38} color={theme.colorMomentConfirm} strokeWidth={3} />
      </Animated.View>
      <Animated.Text style={styles.title}>{title}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space2,
    // A generous dwell area so the beat reads as a moment, not a toast; the sheet
    // caps its own height so this never over-grows.
    paddingVertical: theme.space5,
    overflow: 'hidden',
  },
  glow: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: CHECK_RING_SIZE,
    height: CHECK_RING_SIZE,
    borderRadius: CHECK_RING_SIZE / 2,
    backgroundColor: theme.colorSurface,
    borderWidth: 2,
    borderColor: theme.colorMomentConfirm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCelebrate: {
    shadowColor: theme.colorMomentGlow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 22,
    elevation: 6,
  },
  title: {
    fontSize: theme.textXL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
});
