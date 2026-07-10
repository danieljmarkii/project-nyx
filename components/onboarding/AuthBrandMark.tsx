import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { CulpritMark } from '../brand/CulpritMark';

// The Culprit brand mark (CulpritMark glyph + Newsreader wordmark) — the single
// source of truth for the COMPACT INLINE lockup on the login + signup forms, so
// the whole auth flow reads as ONE branded experience rather than dropping to an
// unbranded utility screen the moment an owner taps "Log in" (TestFlight feedback,
// 2026-07-09 — login felt off-par with onboarding), and the forms' lockup never
// drifts between hand-maintained copies.
//
// This is the HORIZONTAL row lockup (glyph beside wordmark). The Landing HERO
// (B-284 PR N2b) is a DIFFERENT, vertical composition — a ~44%-of-screen carved
// moon with the wordmark stacked below and the Signal-dot pulse live — so it
// consumes CulpritMark directly in app/(auth)/index.tsx rather than this
// component; don't fold the two together (different axis, and this one carries no
// `live` passthrough by design — auth surfaces never pulse).
//
// B-284 PR N2: the lucide `Moon` glyph is replaced by the real CulpritMark (the
// carved-crescent + Signal-dot brand mark) — a GLYPH SWAP ONLY (spec §3
// "Placements" — no pulse on auth: `live` is left at its default false). The
// wordmark stays this component's own Text. 'compact' (default) anchors the forms
// at a 20px glyph / textXL wordmark, one step below the screen's own text2XL
// title; 'hero' (24px / text2XL) is retained for a larger inline placement.
export function AuthBrandMark({
  size = 'compact',
  ground = 'light',
  style,
}: {
  size?: 'compact' | 'hero';
  /** Retained for a future night-ground inline lockup; the forms render light.
   * (The Landing hero uses CulpritMark directly, not this component.) */
  ground?: 'light' | 'night';
  style?: StyleProp<ViewStyle>;
}) {
  const hero = size === 'hero';
  return (
    <View style={[styles.mark, style]} accessible accessibilityRole="image" accessibilityLabel="Culprit">
      <CulpritMark size={hero ? 24 : 20} ground={ground} />
      <Text style={[styles.wordmark, hero && styles.wordmarkHero, ground === 'night' && styles.wordmarkOnNight]}>
        Culprit
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
  },
  // "Culprit" in the Newsreader display face (the brand face) — no fontWeight set,
  // as only the 400 face is loaded (constants/theme.ts note).
  wordmark: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textXL,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  wordmarkHero: {
    fontSize: theme.text2XL,
  },
  wordmarkOnNight: {
    color: theme.colorMoonlight,
  },
});
