import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle, View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';

// The Culprit loading mark (B-284 PR N3, spec §5). Four concentric arc RIDGES
// counter-rotating at 9/14/19/25s (alternating direction) around a core dot that
// breathes at 2.6s — the brand's one loading gesture, replacing every bare
// ActivityIndicator. Two grounds (day = teal + indigo-lavender for light content
// surfaces; night = teal + moonlight for night grounds) and two sizes (sm ~24px
// inline, md ~52px in-place); an explicit px `size` drives the night-moment's
// medium-large background whorl.
//
// Motion mechanism: each ridge is a single-arc <Svg> inside an RN Animated.View that
// rotates via a native-driver `rotate` TRANSFORM; the dot scales via a native-driver
// `scale` transform. We rotate the *View*, not react-native-svg's <G>, on purpose —
// react-native-svg's G exposes only `matrix` (not `rotation`/`scale`) as a native
// prop, so animating G's rotation with useNativeDriver never reaches the native thread
// and renders frozen (found in N3 review; B-320 tracks the same fix for CulpritMark).
// View transforms ARE native-driver-eligible, so the whorl actually turns on device.
//
// Motion budget (§1.5): native-driver transforms only, PAUSED on app blur
// (useAppActive), and fully DISABLED under reduced-motion — where it renders a designed
// static frame (arcs at rest at their offsets + a soft glow behind the still dot). Teal
// is the only interactive/live colour on every ground (§1.3); the day lavender ridge
// (colorWhorlRidgeDay) is a world colour, never interactive.

const VIEW_BOX = 100;
const C = 50; // centre

export type WhorlGround = 'day' | 'night';
type WhorlSize = 'sm' | 'md';
const SIZE_PX: Record<WhorlSize, number> = { sm: 24, md: 52 };

// viewBox-100 geometry. `targetPx` is the intended ON-SCREEN stroke width — the
// viewBox strokeWidth is derived from it and the render size, so a ridge reads at a
// consistent ~2px whether the whorl is 24px or 420px (a naive fixed viewBox stroke
// would vanish at sm and bludgeon at the night-moment scale). `offset` is the resting
// stagger (also the reduced-motion static composition); `dir` +1 = CW, -1 = CCW.
const RIDGES = [
  { r: 44, targetPx: 2.6, frac: 0.6, offset: 20, period: 9000, dir: 1 },
  { r: 33, targetPx: 2.3, frac: 0.52, offset: 200, period: 14000, dir: -1 },
  { r: 23, targetPx: 2.3, frac: 0.66, offset: 110, period: 19000, dir: 1 },
  { r: 13, targetPx: 2.0, frac: 0.46, offset: 300, period: 25000, dir: -1 },
] as const;

const BREATHE_MS = 2600;

export interface WhorlSpinnerProps {
  /** 'sm' (~24px, inline) · 'md' (~52px, in-place) · or explicit px (night moment). Default 'sm'. */
  size?: WhorlSize | number;
  /** 'day' (teal + lavender, light surfaces) · 'night' (teal + moonlight). Default 'day'. */
  ground?: WhorlGround;
  /** Ridge stroke opacity — the night moment uses ~0.5 so the whorl reads as a
   *  background texture the copy sits over. The core dot stays full opacity regardless
   *  (the one focal point). Default 1. */
  ridgeOpacity?: number;
  /** A single colour for every ridge + the dot — for a spinner sitting on a COLOURED
   *  ground where neither day nor night reads (a teal / destructive / dark button, where
   *  the shipped ActivityIndicator was `color="#fff"`). Not a "ground"; overrides it.
   *  Off a coloured button this is the button's foreground, so it introduces no second
   *  accent on any neutral surface (§1.3). */
  tint?: string;
  /** When set, the spinner announces itself (e.g. a standalone full-screen wait).
   *  Omit for a decorative inline spinner whose sibling copy already carries the state. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

function ridgeColor(ground: WhorlGround, i: number): string {
  if (ground === 'night') return i % 2 === 0 ? theme.colorAccent : theme.colorMoonlight;
  return i % 2 === 0 ? theme.colorAccent : theme.colorWhorlRidgeDay;
}

export function WhorlSpinner({
  size = 'sm',
  ground = 'day',
  ridgeOpacity = 1,
  tint,
  accessibilityLabel,
  style,
}: WhorlSpinnerProps) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const animate = !reducedMotion && appActive;

  const px = typeof size === 'number' ? size : SIZE_PX[size];

  // One 0→1 driver per ridge (interpolated to a rotate transform) + the dot's breathe.
  const spins = useRef(RIDGES.map(() => new Animated.Value(0))).current;
  const dotScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animate) {
      spins.forEach((v) => v.setValue(0));
      dotScale.setValue(1);
      return;
    }
    const loops = RIDGES.map((rd, i) => {
      spins[i].setValue(0);
      return Animated.loop(
        Animated.timing(spins[i], {
          toValue: 1,
          duration: rd.period,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
    });
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(dotScale, {
          toValue: 1.14,
          duration: BREATHE_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(dotScale, {
          toValue: 1,
          duration: BREATHE_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loops.forEach((l) => l.start());
    breathe.start();
    return () => {
      loops.forEach((l) => l.stop());
      breathe.stop();
    };
  }, [animate, spins, dotScale]);

  // viewBox units: dot grows (relative to the whorl) at small sizes so it never
  // vanishes; glow sits just behind it for the reduced-motion static frame.
  const dotR = Math.max(5.4, 350 / px);
  const glowR = dotR + 2.4;
  const dotColor = tint ?? theme.colorAccent;

  // One arc ridge as a single Circle in a full-size Svg (so the wrapping Animated.View
  // rotates it around the whorl's centre). `spin` null → the static reduced-motion frame.
  const arc = (rd: (typeof RIDGES)[number], i: number) => {
    const circ = 2 * Math.PI * rd.r;
    const on = circ * rd.frac;
    const dash = `${on.toFixed(3)} ${(circ - on).toFixed(3)}`;
    const sw = (rd.targetPx * VIEW_BOX) / px;
    return (
      <Circle
        key={i}
        cx={C}
        cy={C}
        r={rd.r}
        fill="none"
        stroke={tint ?? ridgeColor(ground, i)}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={dash}
        transform={`rotate(${rd.offset} ${C} ${C})`}
        opacity={ridgeOpacity}
      />
    );
  };

  return (
    <View
      style={[styles.container, { width: px, height: px }, style]}
      accessible={accessibilityLabel != null}
      accessibilityRole={accessibilityLabel != null ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {animate ? (
        <>
          {RIDGES.map((rd, i) => {
            const rotate = spins[i].interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', `${360 * rd.dir}deg`],
            });
            return (
              <Animated.View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
                <Svg width={px} height={px} viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}>
                  {arc(rd, i)}
                </Svg>
              </Animated.View>
            );
          })}
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: dotScale }] }]}>
            <Svg width={px} height={px} viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}>
              <Circle cx={C} cy={C} r={dotR} fill={dotColor} />
            </Svg>
          </Animated.View>
        </>
      ) : (
        // Reduced-motion / paused static frame: arcs at rest at their offsets + a soft
        // glow behind the still dot (no ring, no scale) — CulpritMark's static gesture (§1.5).
        <Svg width={px} height={px} viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}>
          {RIDGES.map((rd, i) => arc(rd, i))}
          <Circle cx={C} cy={C} r={glowR} fill={dotColor} opacity={0.22} />
          <Circle cx={C} cy={C} r={dotR} fill={dotColor} />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
