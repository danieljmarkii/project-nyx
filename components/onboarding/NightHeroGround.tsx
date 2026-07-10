import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';
import { theme } from '../../constants/theme';

// The Landing hero's night ground (B-284 PR N2b, spec §4): the colorBrandNight
// field, the two aurora radials (violet upper / indigo lower) plus the restrained
// teal radial near the Signal dot, and a full-bleed starfield of 12 dots.
//
// Static by intent — the carved moon's Signal-dot ping is this screen's ONE
// ambient loop (rule §1.5), so nothing here animates (no twinkle). Rendered as a
// single full-screen SVG so the aurora gradients and stars share one paint pass
// and sit behind the moon, which is a separate CulpritMark layer on top.
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

const VIOLET_ID = 'landingAuroraViolet';
const INDIGO_ID = 'landingAuroraIndigo';
const TEAL_ID = 'landingAuroraTeal';

export function NightHeroGround() {
  const { width, height } = useWindowDimensions();
  return (
    <View style={styles.fill} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* objectBoundingBox → each radial fills its host ellipse's bounding
              box, so a circular gradient stretches into the soft elliptical glow
              the direction calls for. Fades to zero before the ellipse edge, so
              the shape's own boundary never shows as a hard line. */}
          <RadialGradient id={VIOLET_ID} cx={0.5} cy={0.5} r={0.5} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={theme.colorAuroraViolet} stopOpacity={1} />
            <Stop offset="0.62" stopColor={theme.colorAuroraViolet} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={INDIGO_ID} cx={0.5} cy={0.5} r={0.5} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={theme.colorAuroraIndigo} stopOpacity={1} />
            <Stop offset="0.66" stopColor={theme.colorAuroraIndigo} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={TEAL_ID} cx={0.5} cy={0.5} r={0.5} gradientUnits="objectBoundingBox">
            {/* colorAuroraTeal already carries its own low 0.10 alpha — the
                "restrained" teal near the dot, never a second accent. */}
            <Stop offset="0" stopColor={theme.colorAuroraTeal} stopOpacity={1} />
            <Stop offset="0.7" stopColor={theme.colorAuroraTeal} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Base night field. */}
        <Rect x={0} y={0} width={width} height={height} fill={theme.colorBrandNight} />

        {/* Two aurora radials + the restrained teal near the moon's Signal dot. */}
        <Ellipse cx={width * 0.5} cy={height * 0.24} rx={width * 0.72} ry={height * 0.4} fill={`url(#${VIOLET_ID})`} />
        <Ellipse cx={width * 0.5} cy={height * 0.99} rx={width * 0.78} ry={height * 0.48} fill={`url(#${INDIGO_ID})`} />
        <Ellipse cx={width * 0.56} cy={height * 0.42} rx={width * 0.3} ry={height * 0.17} fill={`url(#${TEAL_ID})`} />

        {/* Full-bleed starfield (static — the ping is the screen's one loop). */}
        {STARS.map((s, i) => (
          <Circle key={i} cx={s.x * width} cy={s.y * height} r={s.r} fill={theme.colorStar} opacity={s.o} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});
