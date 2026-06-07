import { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { useMomentStore, MomentTone } from '../../store/momentStore';

// Diameter of the warm-gold glow. Large enough to bloom past the check ring
// and read as a radial halo, not a disc.
const GLOW_SIZE = 360;
// Mint check-ring diameter (design-system PR 4 "moment" spec).
const CHECK_RING_SIZE = 88;
// Namespaced so the radial-gradient def can't be hijacked by another SVG that
// defines a generically-named gradient elsewhere in the tree.
const GLOW_GRADIENT_ID = 'nyx-completion-glow';

// Root-mounted completion "moment" — the earned beat after a real log (B-063).
// Store-driven so every log path (the /log forms, the FAB quick actions) can
// fire the same surface. Always mounted; renders nothing until first shown.
//
// Two tones share one component: 'celebrate' adds the warm-gold radial glow +
// gold halo behind the mint check; 'calm' omits the gold entirely (symptom
// logs get a quiet, non-festive confirm). The spring check + 'Logged' line are
// common to both.
//
// This overlay renders the full-screen terminal BEAT only. The meal
// presentation (payload.kind === 'meal') is a non-blocking warmed card carrying
// intake + "Change time", rendered by <MealCompletionCard/>, so we bail out for
// it here (B-064).
export function CompletionMoment() {
  const { visible, payload } = useMomentStore();

  const checkScale = useRef(new Animated.Value(0.6)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.4)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  // Backdrop fade — also drives the exit so the surface doesn't snap away.
  const surfaceOpacity = useRef(new Animated.Value(0)).current;
  // The single in-flight animation (entrance or exit). Stopped before each new
  // run so a rapid re-log can't tick two composites against the same values.
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // Only the beat presentation lives here; treat any non-beat payload as "not
  // shown" so the meal card can take over without this overlay animating values
  // nobody renders.
  const isBeat = payload?.kind === 'beat';
  const tone: MomentTone = isBeat ? payload.tone : 'calm';
  const shown = visible && isBeat;

  useEffect(() => {
    animRef.current?.stop();
    if (shown) {
      // Reset every value (surfaceOpacity included) so a repeat log re-plays
      // the entrance from zero even if the exit fade was still mid-flight.
      surfaceOpacity.setValue(0);
      checkScale.setValue(0.6);
      checkOpacity.setValue(0);
      glowScale.setValue(0.4);
      glowOpacity.setValue(0);
      const celebrate = tone === 'celebrate';
      animRef.current = Animated.parallel([
        Animated.timing(surfaceOpacity, { toValue: 1, duration: theme.durationFast, useNativeDriver: true }),
        // Mint check ring springs in with a slight overshoot.
        Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
        Animated.timing(checkOpacity, { toValue: 1, duration: theme.durationFast, useNativeDriver: true }),
        // Warm-gold halo blooms only for the celebrate tone (ease-out, no overshoot).
        ...(celebrate
          ? [
              Animated.timing(glowOpacity, { toValue: 1, duration: theme.durationFast, useNativeDriver: true }),
              Animated.timing(glowScale, {
                toValue: 1, duration: theme.durationSlow, easing: Easing.out(Easing.cubic), useNativeDriver: true,
              }),
            ]
          : []),
      ]);
    } else {
      animRef.current = Animated.timing(surfaceOpacity, {
        toValue: 0, duration: theme.durationFast, useNativeDriver: true,
      });
    }
    animRef.current.start();
    return () => animRef.current?.stop();
  }, [shown, tone, checkScale, checkOpacity, glowScale, glowOpacity, surfaceOpacity]);

  // Narrow to BeatPayload for the render (also bails for the meal card).
  if (!payload || payload.kind !== 'beat') return null;
  const celebrate = tone === 'celebrate';

  return (
    <Animated.View
      // Block stray taps on the screen beneath only while the moment is up;
      // released the instant it dismisses so it can never trap the UI.
      pointerEvents={shown ? 'auto' : 'none'}
      style={[styles.container, { opacity: surfaceOpacity }]}
    >
      {celebrate && (
        <Animated.View
          style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
          pointerEvents="none"
        >
          <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
            <Defs>
              <RadialGradient id={GLOW_GRADIENT_ID} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={theme.colorMomentGlow} stopOpacity={0.22} />
                <Stop offset="40%" stopColor={theme.colorMomentGlow} stopOpacity={0.06} />
                <Stop offset="70%" stopColor={theme.colorMomentGlow} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill={`url(#${GLOW_GRADIENT_ID})`} />
          </Svg>
        </Animated.View>
      )}
      <Animated.View
        style={[
          styles.checkCircle,
          celebrate && styles.checkCircleCelebrate,
          { transform: [{ scale: checkScale }], opacity: checkOpacity },
        ]}
      >
        <Check size={40} color={theme.colorMomentConfirm} strokeWidth={3} />
      </Animated.View>
      <Animated.Text style={[styles.loggedText, { opacity: checkOpacity }]}>{payload.title}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colorSurface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space2,
    overflow: 'hidden', // clip the 360px glow on screens narrower than GLOW_SIZE
    // Above the tab + meal-card layer (deliberate full takeover). Equal to
    // ColdStartOverlay's z; that one is mounted after us in _layout, so it
    // intentionally wins during hydration — when no log can be in flight anyway.
    zIndex: 100,
  },
  // Warm-gold radial halo, centered behind the ring. Absolute so it blooms
  // without displacing the centered ring + label.
  glow: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Mint ring on white — the confirm color, shared by both tones.
  checkCircle: {
    width: CHECK_RING_SIZE,
    height: CHECK_RING_SIZE,
    borderRadius: CHECK_RING_SIZE / 2,
    backgroundColor: theme.colorSurface,
    borderWidth: 2,
    borderColor: theme.colorMomentConfirm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Celebrate-only: soft gold-tinted halo so the warmth reads even where the
  // radial gradient flattens.
  checkCircleCelebrate: {
    shadowColor: theme.colorMomentGlow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 22,
    elevation: 6,
  },
  loggedText: {
    fontSize: theme.textXL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
});
