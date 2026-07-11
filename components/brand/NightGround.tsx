import { useId } from 'react';
import { StyleSheet, StyleProp, ViewStyle, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';
import { theme } from '../../constants/theme';

// The reusable Culprit night ground (B-284 §1.2 / §4 recipe): the colorBrandNight
// field + two aurora radials (violet upper / indigo lower) + the restrained teal
// radial, and a static starfield. Sized to an explicit box (width×height) so the
// SAME primitive paints the pull-to-refresh band (N3, short + wide) and the
// full-screen night moment (N3, tall). Static by intent — the WhorlSpinner layered
// on top is the one ambient loop (rule §1.5), so nothing here twinkles.
//
// (The Landing hero's NightHeroGround predates this and stays as-is — its
// anchor-star semantics are hero-specific; folding it onto this primitive is a
// deferred cleanup, backlog B-318. New night surfaces use THIS one.)
//
// Non-interactive + a11y-hidden: a decorative backdrop; the content on top carries
// all meaning and touch targets.

// Star field as fractions of the box (x,y in 0–1 so it scales to any size); r in px,
// opacity across the §4 0.28–0.55 visible band. Deterministic (no random) so tests +
// snapshots are stable. Callers cap with `maxStars` — a short band wants fewer than a
// full screen. Ordered brightest-first so a low cap keeps the anchor stars.
const STARS: { x: number; y: number; r: number; o: number }[] = [
  { x: 0.22, y: 0.28, r: 0.85, o: 0.55 },
  { x: 0.78, y: 0.2, r: 0.8, o: 0.52 },
  { x: 0.62, y: 0.55, r: 0.7, o: 0.5 },
  { x: 0.14, y: 0.6, r: 0.7, o: 0.48 },
  { x: 0.86, y: 0.68, r: 0.6, o: 0.44 },
  { x: 0.4, y: 0.16, r: 0.6, o: 0.42 },
  { x: 0.5, y: 0.8, r: 0.6, o: 0.4 },
  { x: 0.3, y: 0.44, r: 0.5, o: 0.36 },
  { x: 0.7, y: 0.86, r: 0.5, o: 0.34 },
  { x: 0.16, y: 0.82, r: 0.5, o: 0.32 },
  { x: 0.9, y: 0.4, r: 0.5, o: 0.3 },
  { x: 0.46, y: 0.66, r: 0.5, o: 0.3 },
];

export interface NightGroundProps {
  width: number;
  height: number;
  /** Cap the starfield — a short PTR band wants ~6, a full screen all 12. Default all. */
  maxStars?: number;
  style?: StyleProp<ViewStyle>;
}

export function NightGround({ width, height, maxStars, style }: NightGroundProps) {
  // Unique gradient ids per instance — react-native-web renders to real DOM <svg>
  // where two NightGrounds sharing a def id would let one override the other.
  const id = useId();
  const violet = `ng-violet-${id}`;
  const indigo = `ng-indigo-${id}`;
  const teal = `ng-teal-${id}`;
  const stars = maxStars != null ? STARS.slice(0, maxStars) : STARS;

  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* objectBoundingBox → each radial fills its host ellipse, so a circular
              gradient stretches into the soft elliptical glow and fades to zero
              before the edge (no hard boundary line). */}
          <RadialGradient id={violet} cx={0.5} cy={0.5} r={0.5} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={theme.colorAuroraViolet} stopOpacity={1} />
            <Stop offset="0.62" stopColor={theme.colorAuroraViolet} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={indigo} cx={0.5} cy={0.5} r={0.5} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={theme.colorAuroraIndigo} stopOpacity={1} />
            <Stop offset="0.66" stopColor={theme.colorAuroraIndigo} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={teal} cx={0.5} cy={0.5} r={0.5} gradientUnits="objectBoundingBox">
            {/* colorAuroraTeal carries its own low 0.10 alpha — restrained, never a second accent. */}
            <Stop offset="0" stopColor={theme.colorAuroraTeal} stopOpacity={1} />
            <Stop offset="0.7" stopColor={theme.colorAuroraTeal} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect x={0} y={0} width={width} height={height} fill={theme.colorBrandNight} />
        <Ellipse cx={width * 0.5} cy={height * 0.22} rx={width * 0.72} ry={height * 0.5} fill={`url(#${violet})`} />
        <Ellipse cx={width * 0.5} cy={height * 1.0} rx={width * 0.8} ry={height * 0.55} fill={`url(#${indigo})`} />
        <Ellipse cx={width * 0.56} cy={height * 0.4} rx={width * 0.34} ry={height * 0.3} fill={`url(#${teal})`} />

        {stars.map((s, i) => (
          <Circle key={i} cx={s.x * width} cy={s.y * height} r={s.r} fill={theme.colorStar} opacity={s.o} />
        ))}
      </Svg>
    </View>
  );
}
