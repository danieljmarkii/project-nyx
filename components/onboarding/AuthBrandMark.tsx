import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Moon } from 'lucide-react-native';
import { theme } from '../../constants/theme';

// The Culprit brand mark (teal Moon glyph + Newsreader wordmark) — the single
// source of truth for the brand lockup across every unauthenticated surface: the
// Signal-led Landing (hero scale) and the login + signup forms (compact anchor).
// Extracting it keeps the whole auth flow reading as ONE branded experience rather
// than dropping to an unbranded utility screen the moment an owner taps "Log in"
// (TestFlight feedback, 2026-07-09 — login felt off-par with onboarding), and stops
// the lockup from drifting between hand-maintained copies.
//
// The Moon rides colorAccent — teal is the single interactive/brand accent (theme.ts).
// 'hero' matches the Landing's original scale (24px glyph / text2XL wordmark); the
// default 'compact' anchors the forms one step down (20px / textXL) so the mark
// never competes with the screen's own text2XL title below it.
export function AuthBrandMark({
  size = 'compact',
  style,
}: {
  size?: 'compact' | 'hero';
  style?: StyleProp<ViewStyle>;
}) {
  const hero = size === 'hero';
  return (
    <View
      style={[styles.mark, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Culprit"
    >
      <Moon size={hero ? 24 : 20} color={theme.colorAccent} strokeWidth={1.75} />
      <Text style={[styles.wordmark, hero && styles.wordmarkHero]}>Culprit</Text>
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
});
