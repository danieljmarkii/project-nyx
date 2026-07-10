import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { CulpritMark } from '../brand/CulpritMark';

// The Culprit brand mark (CulpritMark glyph + Newsreader wordmark) — the single
// source of truth for the brand lockup across every unauthenticated surface: the
// Signal-led Landing (hero scale) and the login + signup forms (compact anchor).
// Extracting it keeps the whole auth flow reading as ONE branded experience rather
// than dropping to an unbranded utility screen the moment an owner taps "Log in"
// (TestFlight feedback, 2026-07-09 — login felt off-par with onboarding), and stops
// the lockup from drifting between hand-maintained copies.
//
// B-284 PR N2: the lucide `Moon` glyph is replaced by the real CulpritMark (the
// carved-crescent + Signal-dot brand mark) — a GLYPH SWAP ONLY (spec §3
// "Placements" — no pulse on auth: `live` is left at its default false). The
// wordmark stays this component's own Text, unchanged, so the existing
// compact/hero sizing this file already owned isn't re-derived inside the mark.
// 'hero' matches the Landing's original scale (24px glyph / text2XL wordmark); the
// default 'compact' anchors the forms one step down (20px / textXL) so the mark
// never competes with the screen's own text2XL title below it.
export function AuthBrandMark({
  size = 'compact',
  ground = 'light',
  style,
}: {
  size?: 'compact' | 'hero';
  /** The Landing hero (N2b) renders this on the night ground; forms stay light. */
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
