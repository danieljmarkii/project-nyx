import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { theme } from '../../constants/theme';

// The Landing hero's night ground (B-284 PR N2b, spec §4): the colorBrandNight
// field, the two aurora radials (violet upper / indigo lower), the whorl ground,
// and a full-bleed starfield of 12 dots.
//
// The whorl ground (PM-ratified 2026-07-26 — Option B of
// docs/culprit-landing-hero-mockups.html): the getculprit.app watermark brought
// home — the Whorl motif's four concentric crescent ridges at hero scale, drawn
// in colorBrandNightElevated at watermark opacity. It replaces the Signal-dot
// ping as the hero's richness; the ridges are indigo, NEVER teal — teal stays
// the mark's dot alone (§1.3; the same rule that removed the teal radial after
// on-device QA 2026-07-12, when it read as an off-brand glow blob).
//
// Static by intent — and now fully: the ring-train ping is retired from this
// surface (the pulse contract ties `live` to a fresh unseen finding, and a
// logged-out screen has none), so the Landing carries ZERO ambient loops, well
// under the §1.5 budget. Nothing here animates (no twinkle, no drift). Rendered
// as a single full-screen SVG so the aurora gradients, whorl, and stars share
// one paint pass and sit behind the moon, a separate CulpritMark layer on top.
//
// Non-interactive: pointerEvents="none" so the hero's CTAs beneath stay tappable.

// Full-bleed field of 12 stars (spec §4: 10–14; PM locked 12). Positions are
// fractions of the ground (x,y in 0–1) so the field scales with any screen size;
// r is px (the 1–1.6px dot band → r 0.5–0.85). The first two are the brighter
// "anchor" stars, placed in the upper third. Per-dot opacity modulates the
// colorStar token (base white @0.45) across the §4 0.28–0.55 visible band, so the
// field reads with depth rather than a flat grid.
const STARS: { x: number; y: number; r: number; o: number }[] = [
  { x: 0.22, y: 0.15, r: 0.85, o: 1 }, // anchor (upper third)
  { x: 0.75, y: 0.21, r: 0.8, o: 0.95 }, // anchor (upper third)
  { x: 0.12, y: 0.3, r: 0.6, o: 0.7 },
  { x: 0.45, y: 0.11, r: 0.55, o: 0.62 },
  { x: 0.86, y: 0.37, r: 0.7, o: 0.82 },
  { x: 0.6, y: 0.52, r: 0.5, o: 0.6 },
  { x: 0.31, y: 0.6, r: 0.6, o: 0.74 },
  { x: 0.83, y: 0.66, r: 0.5, o: 0.63 },
  { x: 0.16, y: 0.74, r: 0.7, o: 0.86 },
  { x: 0.53, y: 0.83, r: 0.5, o: 0.62 },
  { x: 0.7, y: 0.88, r: 0.6, o: 0.68 },
  { x: 0.38, y: 0.44, r: 0.5, o: 0.6 },
];

// The Whorl motif geometry, verbatim from the brand system (docs/brand/
// culprit-direction.html — a 200×200 design space, arcs centred on 100,100 and
// open to the right, the Signal-dot opening). `w`/`o` are the motif-space stroke
// width and opacity locked in the Option-B mock; the whole group scales with the
// screen, so the ridges keep the mock's proportions at any device width.
const WHORL_ARCS = [
  { d: 'M138 44 A70 70 0 1 0 138 156', w: 2.6, o: 0.75 },
  { d: 'M132 60 A54 54 0 1 0 132 140', w: 2.2, o: 0.6 },
  { d: 'M126 76 A38 38 0 1 0 126 124', w: 2.0, o: 0.48 },
  { d: 'M120 92 A22 22 0 1 0 120 108', w: 1.8, o: 0.38 },
];
// Placement fractions + scale from the ratified mock (centre at 0.65w / 0.51h;
// scale 2.6 on a 300px-wide frame → outer ridge ≈ 0.61 × screen width). The
// exact opacity/scale is an on-device tuning AC, same as the night moment's —
// these are the mock's starting values, to be locked at the QA pass.
const WHORL_CX_FRAC = 0.65;
const WHORL_CY_FRAC = 0.51;
const WHORL_SCALE_PER_WIDTH = 2.6 / 300;
const WHORL_MOTIF_CENTRE = 100;

const VIOLET_ID = 'landingAuroraViolet';
const INDIGO_ID = 'landingAuroraIndigo';

export function NightHeroGround() {
  const { width, height } = useWindowDimensions();
  // Whorl group transform: motif units → px, centred on the placement fractions.
  const whorlScale = width * WHORL_SCALE_PER_WIDTH;
  const whorlTx = width * WHORL_CX_FRAC - WHORL_MOTIF_CENTRE * whorlScale;
  const whorlTy = height * WHORL_CY_FRAC - WHORL_MOTIF_CENTRE * whorlScale;
  return (
    // Decorative only — non-interactive (CTAs beneath stay tappable) and hidden
    // from screen readers (the hero's "Culprit" group carries the meaning), per
    // the OnboardingHeader precedent for full-bleed decorative art.
    <View
      style={styles.fill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* objectBoundingBox → each radial fills its host ellipse's bounding
              box, so a circular gradient stretches into the soft elliptical glow
              the direction calls for. Fades to zero before the ellipse edge, so
              the shape's own boundary never shows as a hard line. iOS/Core
              Graphics renders the non-uniform stretch natively (our only shipping
              runtime); if Android becomes a target, verify the elliptical falloff
              there — some react-native-svg builds fall back to a circular glow. */}
          <RadialGradient id={VIOLET_ID} cx={0.5} cy={0.5} r={0.5} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={theme.colorAuroraViolet} stopOpacity={1} />
            <Stop offset="0.62" stopColor={theme.colorAuroraViolet} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={INDIGO_ID} cx={0.5} cy={0.5} r={0.5} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={theme.colorAuroraIndigo} stopOpacity={1} />
            <Stop offset="0.66" stopColor={theme.colorAuroraIndigo} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Base night field. */}
        <Rect x={0} y={0} width={width} height={height} fill={theme.colorBrandNight} />

        {/* Two aurora radials — violet upper, indigo lower. No teal glow behind the
            moon (removed after on-device QA — see the header note). */}
        <Ellipse cx={width * 0.5} cy={height * 0.24} rx={width * 0.72} ry={height * 0.4} fill={`url(#${VIOLET_ID})`} />
        <Ellipse cx={width * 0.5} cy={height * 0.99} rx={width * 0.78} ry={height * 0.48} fill={`url(#${INDIGO_ID})`} />

        {/* The whorl ground — behind the stars so the field reads as depth over
            the texture, and behind the moon (a separate layer above this SVG).
            Indigo only; the ridges never speak teal (§1.3). */}
        <G transform={`translate(${whorlTx} ${whorlTy}) scale(${whorlScale})`}>
          {WHORL_ARCS.map((a, i) => (
            <Path
              key={i}
              d={a.d}
              fill="none"
              stroke={theme.colorBrandNightElevated}
              strokeWidth={a.w}
              strokeOpacity={a.o}
              strokeLinecap="round"
            />
          ))}
        </G>

        {/* Full-bleed starfield (static — the Landing carries no ambient loop). */}
        {STARS.map((s, i) => (
          <Circle key={i} cx={s.x * width} cy={s.y * height} r={s.r} fill={theme.colorStar} opacity={s.o} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
});
