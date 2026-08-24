import { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { fontFamilyForWeight } from '../ui/ThemedText';
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
// CUL-614 — 1400ms was sized for the single word "Logged"; the beat now speaks the
// record's own sentence ("Vomit · found by 5:33 PM"), which is a clause to read rather
// than a glyph to register. 1800ms reads it at a calm pace and still sits under the 2s
// earned-moment cap that governs a surface holding the owner's screen — which this one
// does, unlike the named card (that card leaves Home live underneath and is sized by
// what there is to DO, per momentStore's NAMED_DURATION_MS note).
const BEAT_MS = 1800;

interface Props {
  tone: MomentTone;
  /**
   * The sentence this beat speaks — REQUIRED, and deliberately so (CUL-614 · §5's
   * sentence rule). It previously defaulted to 'Logged', which meant the R2 register
   * confirmed a "Found it" vomit with a word that named neither the event nor the
   * window the app had just written. Removing the default is the enforcement: a caller
   * has to compose the sentence through `lib/completionCard`, the same path History and
   * the vet report use, so this beat cannot claim more than the row holds — and cannot
   * quietly fall back to saying nothing.
   */
  title: string;
  /**
   * The pet whose record this landed on — rendered as R1's exact subline, "Saved to
   * {pet}'s record" (CUL-614's copy pass, nyx-voice Pattern 1).
   *
   * WHY THE BEAT HAS TO SAY IT. This beat REPLACES the confirm stage inside the sheet,
   * and the confirm's header ("Vomit — Nyx") is the only thing that named the pet. So
   * at the one moment the owner is told the write happened, the screen had stopped
   * saying whose record it happened to — on a surface whose pet was fixed several taps
   * earlier at grid→confirm and cannot be seen behind the sheet. In Sam's multi-pet
   * household that is the wrong-pet class, confirmed rather than caught.
   *
   * It is the same string the named card renders, deliberately: R1 and R2 are one
   * register in two shapes, so they should not describe the same act differently.
   */
  petName: string;
  onDone: () => void;
}

export function SheetLogBeat({ tone, title, petName, onDone }: Props) {
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

  // One announcement for a screen reader, not two: the label carries the sentence and
  // the pet together, in the order they are read on screen.
  const a11yLabel = `${title}. Saved to ${petName}’s record`;

  return (
    <Animated.View style={[styles.wrap, { opacity: surfaceOpacity }]} accessibilityLiveRegion="polite" accessibilityLabel={a11yLabel}>
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
      {/* A sentence, not a word: it wraps to two lines and centres, rather than
          overflowing the sheet's width. No numberOfLines cap — truncating would put
          the beat back in the business of saying less than the record holds. */}
      <Animated.Text style={styles.title}>{title}</Animated.Text>
      <Animated.Text style={styles.subLabel}>{`Saved to ${petName}’s record`}</Animated.Text>
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
  // ThemedText wraps RN's `Text` and has no Animated variant (§7 scoped that out of
  // PR 1), so the two beats below can't inherit the sweep — a bare `fontWeight` here
  // would silently keep rendering the system face while everything around it moved to
  // Geist. Calling the primitive's own mapper keeps ONE fact (the weight token) and one
  // resolution path; the weight is dropped because the family now expresses it.
  title: {
    fontSize: theme.textXL,
    fontFamily: fontFamilyForWeight(theme.weightMedium),
    color: theme.colorNeutralDark,
    textAlign: 'center',
    // The sentence can reach two lines on a narrow device ("Loose stool · between
    // 2:00 PM and 5:33 PM"); keep it off the sheet's edges when it does.
    paddingHorizontal: theme.space3,
  },
  // Visually subordinate to the sentence, exactly as on the named card: the record is
  // the headline, where it landed is the reassurance underneath it.
  subLabel: {
    fontSize: theme.textSM,
    fontFamily: fontFamilyForWeight(theme.weightRegular),
    color: theme.colorTextSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.space3,
    // The wrap's `gap` is sized for the ring-to-title step; pull the subline back up
    // against its own title so the two read as one block.
    marginTop: -theme.space1,
  },
});
