import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Moon } from 'lucide-react-native';
import { theme } from '../../constants/theme';

// The Culprit brand mark (teal Moon glyph + Newsreader wordmark) shown at the top
// of the unauthenticated form surfaces — login and signup. The Signal-led Landing
// carries the same mark (its own hero-scale copy); extracting a compact anchor for
// the forms keeps the whole auth flow reading as ONE branded experience instead of
// dropping to an unbranded utility screen the moment an owner taps "Log in"
// (TestFlight feedback, 2026-07-09 — the login screen felt off-par with onboarding).
//
// Compact scale on purpose: the wordmark sits at textXL (22) so it anchors the
// brand without competing with the screen's text2XL (28) title below it. The Moon
// rides colorAccent — teal is the single interactive/brand accent (theme.ts).
export function AuthBrandMark({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[styles.mark, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Culprit"
    >
      <Moon size={20} color={theme.colorAccent} strokeWidth={1.75} />
      <Text style={styles.wordmark}>Culprit</Text>
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
  // as only the 400 face is loaded (constants/theme.ts note), matching the Landing.
  wordmark: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textXL,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
});
