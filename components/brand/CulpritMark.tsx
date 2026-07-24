import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, StyleProp, TextStyle, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';

// The Culprit brand mark — a moonlight crescent (always a true mask cutout, never
// a filled circle laid over the ground — the carve rule, spec §1.1) with a single
// teal Signal dot as the tittle. One component, both grounds: geometry per
// culprit-in-app-brand-requirements.md §3.
//
// viewBox is a fixed 100x100 design space; `size` scales it, so the geometry
// below (cx/cy/r) is the spec's literal numbers, not a derived ratio.
//
// Motion mechanism (B-322): the live-pulse drives native-driver transforms on RN
// `Animated.View`s, NOT react-native-svg's `<G>`. react-native-svg's Group exposes
// only `matrix` as a native-animated prop — `scale`/`originX/Y` are converted to a
// matrix in G's JS render, which `useNativeDriver:true` bypasses, so an animated
// `<G scale>` never reaches the native thread and renders FROZEN at its static frame
// on a real (Fabric) build. View transforms ARE native-driver-eligible, so we scale
// a plain `Animated.View` instead (the same fix N3 shipped for WhorlSpinner). Each
// pulsing layer sits in an absolutely-positioned box CENTRED on the dot, so scaling
// the View around its own centre pivots the pulse from the dot's cx/cy — not the
// canvas corner — reproducing what the old `<G originX/originY>` intended.
const VIEW_BOX = 100;
const MOON_CX = 45;
const MOON_CY = 50;
const MOON_R = 33;
const CARVE_CX = 61;
const CARVE_CY = 43;
const CARVE_R = 29;
const DOT_CX = 66;
const DOT_CY = 53;
const DOT_R = 9;
// The icon kit's small-size rule (§3): the dot reads too faint below ~24px
// unless it nudges up.
const DOT_R_SMALL = 10.5;
const SMALL_SIZE_THRESHOLD = 24;
const RING_STROKE = 1.5;
// The ring/dot are drawn at REST size inside this box, then the whole Animated.View
// (box + its <Svg> contents) scales as one transform — so an affine scale preserves
// "fits inside," and the only real constraint is that the resting ring fits the box:
// boxCentre (0.25·size) must exceed dotR + stroke/2 (≤ ~0.115·size). 0.5·size clears
// that at every size with margin; the ripple's 1.6× growth then rides the View transform.
const PULSE_BOX_FACTOR = 0.5;

// The pulse choreography (login-hero softening, 2026-07-24): ONE shared rhythm —
// the dot breathes to its crest, and AT the crest releases a single soft ripple
// that dissipates before the next breath. The old 2.6s choreography had two
// competing envelopes (a sine breathe + a ring that SNAPPED on at 0.9 opacity and
// blasted linearly to 2.1×) — at the Landing's hero scale it read as sonar, and
// the snap-attack/slow-decay sawtooth is why it felt arrhythmic. Every value here
// exists to keep the live cue *detectable, not prominent*: no snap (the ripple
// fades IN), low peak opacity, short decelerating travel, and genuine rest.
const PULSE_PERIOD_MS = 4400;
// The breath crests at 40% of the cycle — the ripple is emitted there, so the two
// layers read as cause (swell) and effect (release), not two overlapping loops.
const RING_EMIT_MS = PULSE_PERIOD_MS * 0.4; // 1760
const RING_TRAVEL_MS = PULSE_PERIOD_MS - RING_EMIT_MS; // 2640
const RING_FADE_IN_MS = 440;
const RING_PEAK_OPACITY = 0.3;
const RING_MAX_SCALE = 1.6;
const DOT_CREST_SCALE = 1.05;

export interface CulpritMarkProps {
  /** Rendered size in px (square). */
  size: number;
  ground: 'light' | 'night';
  /** The pulse — true while a fresh, unseen finding exists in the signal cache. */
  live?: boolean;
  /** Adds "Culprit" in the display face beside the glyph. */
  withWordmark?: boolean;
  /** Overrides the wordmark's size/weight — every placement wants a different
   * scale relative to the glyph (HomeHeader's is quiet and smaller than the
   * glyph; the auth/Landing lockups run larger), so this stays a caller choice
   * rather than a ratio baked into the component. */
  wordmarkStyle?: StyleProp<TextStyle>;
  /** Whether this instance should carry its own accessibility node/label.
   * Defaults to `withWordmark` (a standalone full lockup self-labels "Culprit").
   * Pass `false` when a parent element is ALREADY an accessible, labelled
   * control wrapping this mark (e.g. a Pressable that sets its own
   * accessibilityLabel) — otherwise a screen reader hits two "Culprit" nodes
   * for one control. */
  accessible?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function CulpritMark({
  size,
  ground,
  live = false,
  withWordmark = false,
  wordmarkStyle,
  accessible,
  style,
}: CulpritMarkProps) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const scale = useRef(new Animated.Value(1)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  // Pause on app blur (§1.5 motion budget), matching WhorlSpinner — a native-driver
  // loop would otherwise keep ticking on the UI thread while backgrounded.
  const animate = live && !reducedMotion && appActive;

  useEffect(() => {
    if (!animate) {
      scale.setValue(1);
      ringScale.setValue(1);
      ringOpacity.setValue(0);
      return;
    }
    const cycle = Animated.parallel([
      // The breath: a slow sine swell that crests exactly when the ripple is
      // emitted (asymmetric on purpose — quicker inhale, longer exhale), so the
      // whole mark moves to one beat instead of two out-of-phase envelopes.
      Animated.sequence([
        Animated.timing(scale, {
          toValue: DOT_CREST_SCALE,
          duration: RING_EMIT_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: RING_TRAVEL_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
      // The ripple: born at the dot's edge at the breath's crest, faded IN over
      // ~440ms (never snapped on — the old 1ms 0.9-opacity attack was the strobe),
      // travelling a short decelerating 1 → 1.6× like a ripple losing energy,
      // gone before the cycle ends so each pulse is followed by real rest.
      Animated.sequence([
        Animated.delay(RING_EMIT_MS),
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: RING_MAX_SCALE,
            duration: RING_TRAVEL_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(ringOpacity, {
              toValue: RING_PEAK_OPACITY,
              duration: RING_FADE_IN_MS,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(ringOpacity, {
              toValue: 0,
              duration: RING_TRAVEL_MS - RING_FADE_IN_MS,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
    ]);
    const loop = Animated.loop(cycle);
    loop.start();
    return () => {
      loop.stop();
    };
  }, [animate, scale, ringScale, ringOpacity]);

  const dotR = size <= SMALL_SIZE_THRESHOLD ? DOT_R_SMALL : DOT_R;
  const crescentFill = ground === 'night' ? theme.colorMoonlight : theme.colorCulpritCrescentOnLight;
  // Unique per instance — two marks on screen at once (e.g. a future paired
  // placement) must not share one <Mask> id, which SVG requires unique per
  // document (react-native-web renders to real DOM <svg> where a collision
  // would let one instance's mask silently override the other's).
  const instanceId = useId();
  const maskId = `culpritMarkCarve-${instanceId}`;

  // Self-label only when this IS the whole lockup (glyph + wordmark, e.g.
  // HomeHeader). A bare-glyph placement (AuthBrandMark, which renders its own
  // wordmark + accessible group around both) must stay a silent child — two
  // "Culprit"-labelled nodes on screen breaks getByLabelText for the parent.
  const selfLabel = accessible ?? withWordmark;

  // The pulse box: an absolutely-positioned square centred on the dot's on-screen
  // position, so scaling the wrapping View around its own centre pivots from the
  // dot (px units — the SVG viewBox geometry converted to the rendered size).
  const scaleFactor = size / VIEW_BOX;
  const dotRadiusPx = dotR * scaleFactor;
  const ringStrokePx = RING_STROKE * scaleFactor;
  const boxPx = size * PULSE_BOX_FACTOR;
  const boxCentre = boxPx / 2;
  const pulseBoxStyle = {
    position: 'absolute' as const,
    width: boxPx,
    height: boxPx,
    left: DOT_CX * scaleFactor - boxCentre,
    top: DOT_CY * scaleFactor - boxCentre,
  };

  return (
    <View
      style={[styles.container, style]}
      accessible={selfLabel}
      accessibilityRole={selfLabel ? 'image' : undefined}
      accessibilityLabel={selfLabel ? 'Culprit' : undefined}
    >
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}>
          <Defs>
            {/* The carve rule (§1.1): the crescent is a mask/cutout — the carve
                circle punches a hole in the moon disc so whatever ground sits
                behind the mark shows through, rather than painting a second
                filled circle in a colour that only matches ONE ground. */}
            <Mask id={maskId}>
              <Rect x={0} y={0} width={VIEW_BOX} height={VIEW_BOX} fill="#fff" />
              <Circle cx={CARVE_CX} cy={CARVE_CY} r={CARVE_R} fill="#000" />
            </Mask>
          </Defs>
          <Circle
            cx={MOON_CX}
            cy={MOON_CY}
            r={MOON_R}
            fill={crescentFill}
            mask={`url(#${maskId})`}
          />
          {/* Reduced-motion / paused / non-animating static frame: just the resting dot
              — a crisp teal tittle, NO soft glow halo behind it. The halo (a low-opacity
              accent circle) was removed after on-device QA (2026-07-12): at the header's
              16px it read as a "weird glow behind the logo," off-brand — teal is the
              interactive accent, not a decorative haze (§1.3). The live cue is the dynamic
              pulse (below) where it animates; the static frame stays a clean dot. */}
          {!animate && (
            <Circle cx={DOT_CX} cy={DOT_CY} r={dotR} fill={theme.colorAccent} />
          )}
        </Svg>

        {/* Live pulse — native-driver View transforms (B-322). The ring expands +
            fades; the dot breathes. Both pivot around the dot via the centred box. */}
        {animate && (
          <>
            <Animated.View
              pointerEvents="none"
              style={[pulseBoxStyle, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
            >
              <Svg width={boxPx} height={boxPx}>
                <Circle
                  cx={boxCentre}
                  cy={boxCentre}
                  r={dotRadiusPx}
                  fill="none"
                  stroke={theme.colorAccent}
                  strokeWidth={ringStrokePx}
                />
              </Svg>
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[pulseBoxStyle, { transform: [{ scale }] }]}
            >
              <Svg width={boxPx} height={boxPx}>
                <Circle cx={boxCentre} cy={boxCentre} r={dotRadiusPx} fill={theme.colorAccent} />
              </Svg>
            </Animated.View>
          </>
        )}
      </View>
      {withWordmark && (
        <Text
          style={[
            styles.wordmark,
            {
              fontSize: theme.textXL,
              color: ground === 'night' ? theme.colorMoonlight : theme.colorTextPrimary,
            },
            wordmarkStyle,
          ]}
        >
          Culprit
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  wordmark: {
    fontFamily: theme.fontDisplay,
    letterSpacing: theme.trackingTight,
  },
});
