import { useEffect, useId, useRef } from 'react';
import { Animated, StyleSheet, Text, View, StyleProp, TextStyle, ViewStyle } from 'react-native';
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
const RING_STROKE = 2;
// The ping ring expands to 2.1× the dot radius; the pulse box must be large enough
// to hold that at full scale without the inner <Svg> clipping it. Half the box
// (the pivot-to-edge distance) must exceed dotR·2.1 + stroke — 0.5·size gives a
// generous margin at every size (dotR ≤ ~0.105·size ⇒ max ring reach ~0.23·size).
const PULSE_BOX_FACTOR = 0.5;

const PULSE_PERIOD_MS = 2600;

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
  const ringScale = useRef(new Animated.Value(0.66)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  // Pause on app blur (§1.5 motion budget), matching WhorlSpinner — a native-driver
  // loop would otherwise keep ticking on the UI thread while backgrounded.
  const animate = live && !reducedMotion && appActive;

  useEffect(() => {
    if (!animate) {
      scale.setValue(1);
      ringScale.setValue(0.66);
      ringOpacity.setValue(0);
      return;
    }
    const cycle = Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.12,
          duration: PULSE_PERIOD_MS / 2,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: PULSE_PERIOD_MS / 2,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(ringOpacity, { toValue: 0.9, duration: 1, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 2.1,
            duration: PULSE_PERIOD_MS,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: PULSE_PERIOD_MS,
            useNativeDriver: true,
          }),
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
          {/* Reduced-motion / paused static frame: a soft glow behind the resting
              dot, no ring, no scale (§1.5), plus the resting dot itself. Drawn in
              the base SVG (not an Animated.View) because nothing moves. */}
          {!animate && (
            <>
              {live && (
                <Circle cx={DOT_CX} cy={DOT_CY} r={dotR + 1.5} fill={theme.colorAccent} opacity={0.3} />
              )}
              <Circle cx={DOT_CX} cy={DOT_CY} r={dotR} fill={theme.colorAccent} />
            </>
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
