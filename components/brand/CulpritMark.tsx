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
// The ring/dot are drawn at REST size inside this box, then the whole Animated.View
// (box + its <Svg> contents) scales as one transform — so an affine scale preserves
// "fits inside," and the only real constraint is that the resting ring fits the box:
// boxCentre (0.25·size) must exceed dotR + stroke/2 (≤ ~0.115·size). 0.5·size clears
// that at every size with margin; the ping's 2.1× growth then rides the View transform.
const PULSE_BOX_FACTOR = 0.5;

// The pulse choreography (PM-ratified round 2, 2026-07-24): the ORIGINAL radar
// format — throbbing dot + bright expanding ping — multiplied into a THREE-RING
// train. Each ring lives one full period at the original values; a new ring is
// emitted every third of a period, so 2–3 concentric ripples radiate at any
// moment. Round 1 mis-diagnosed the format as the problem: a compositor-driven
// mock of these SAME values reads clean, and the on-device roughness is
// Animated.loop's per-cycle JS-thread restart stalling under load (worst in dev
// mode). The structural fix is in the effect below — an independent loop per
// ring — not in the values, which are deliberately unchanged from the original.
const PULSE_PERIOD_MS = 2600;
const RING_COUNT = 3;
const RING_STAGGER_MS = PULSE_PERIOD_MS / RING_COUNT;
// Born at 0.66× the ring sits INSIDE the dot's own radius (and under it in paint
// order), so the full-opacity start is never a visible snap — the ring slides
// out from behind the dot already lit.
const RING_START_SCALE = 0.66;
const RING_MAX_SCALE = 2.1;
const RING_PEAK_OPACITY = 0.9;
const DOT_CREST_SCALE = 1.12;

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
  // One scale/opacity pair per ring in the train (a stable ref — RING_COUNT is a
  // module constant, so the array never changes length across renders).
  const ringAnims = useRef(
    Array.from({ length: RING_COUNT }, () => ({
      scale: new Animated.Value(RING_START_SCALE),
      opacity: new Animated.Value(0),
    })),
  ).current;

  // Pause on app blur (§1.5 motion budget), matching WhorlSpinner — a native-driver
  // loop would otherwise keep ticking on the UI thread while backgrounded.
  const animate = live && !reducedMotion && appActive;

  useEffect(() => {
    if (!animate) {
      scale.setValue(1);
      ringAnims.forEach((r) => {
        r.scale.setValue(RING_START_SCALE);
        r.opacity.setValue(0);
      });
      return;
    }
    // The dot's breathe and each ring's ping run as INDEPENDENT loops rather than
    // one shared parallel mega-cycle. Animated.loop re-arms every iteration from
    // the JS thread, so under load the restart stalls by a variable amount — with
    // one shared cycle that stall froze/desynced everything at once (the choppy,
    // arrhythmic playback the PM flagged on device). Per-ring loops place each
    // ring's restart at the moment it is fully faded out, so a stalled restart
    // just extends an invisible rest instead of hitching a visible ring; the
    // dot's own boundary lands at its rest scale, the least noticeable moment.
    const dotLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: DOT_CREST_SCALE,
          duration: PULSE_PERIOD_MS / 2,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: PULSE_PERIOD_MS / 2,
          useNativeDriver: true,
        }),
      ]),
    );
    const ringLoops = ringAnims.map((r, i) =>
      Animated.sequence([
        // Stagger the train: ring i joins one third of a period after ring i−1,
        // so emissions interleave into evenly spaced concentric ripples.
        Animated.delay(i * RING_STAGGER_MS),
        Animated.loop(
          Animated.sequence([
            Animated.timing(r.opacity, {
              toValue: RING_PEAK_OPACITY,
              duration: 1,
              useNativeDriver: true,
            }),
            Animated.parallel([
              Animated.timing(r.scale, {
                toValue: RING_MAX_SCALE,
                duration: PULSE_PERIOD_MS,
                useNativeDriver: true,
              }),
              Animated.timing(r.opacity, {
                toValue: 0,
                duration: PULSE_PERIOD_MS,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ),
      ]),
    );
    const pulse = Animated.parallel([dotLoop, ...ringLoops]);
    pulse.start();
    return () => {
      pulse.stop();
    };
  }, [animate, scale, ringAnims]);

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

        {/* Live pulse — native-driver View transforms (B-322). The ring train
            expands + fades under the dot (paint order: rings first, dot last, so
            each ring is born hidden behind the dot); the dot breathes on top.
            All layers pivot around the dot via the centred box. */}
        {animate && (
          <>
            {ringAnims.map((r, i) => (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={[pulseBoxStyle, { opacity: r.opacity, transform: [{ scale: r.scale }] }]}
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
            ))}
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
