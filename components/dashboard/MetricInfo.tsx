import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Info } from 'lucide-react-native';
import { theme } from '../../constants/theme';

// MetricInfo — the unobtrusive "what does this metric mean?" affordance for the
// Patterns dashboard cards (B-100). On-device QA caught the gap: Jordan tapped a
// computed metric ("Meals finished") expecting "what counts as finished?" and got
// nothing. This gives every computed-metric card a small (i) in its header that toggles
// a one-line nyx-voice definition in its footer — load-bearing for trust and for the
// §11 #1 intake-is-not-preference semantics (the definitions live in lib/dashboardCards).
//
// Two presentational pieces, not one self-contained widget, because the BUTTON belongs
// in a card's header row and the DEFINITION belongs in its footer — different parts of
// the card tree. Splitting them keeps the look + a11y in ONE place (no drift across
// MetricCard / RankingCard / CompositionCard / FrequencyCalendarCard) while each card
// owns the open/closed state (a trivial useState) and places each piece itself.

/**
 * The info button — a small, muted (i) beside a card's label/title, with its own tap
 * target (hitSlop, so it doesn't grow the header row). It is its own Pressable so that
 * when the card later becomes a tappable "doorway" → detail (B-093), a tap on the (i)
 * reveals the definition instead of navigating: a nested Pressable claims the touch
 * responder for a press within its frame. NOTE for B-093: the inner hitSlop extends past
 * the glyph; a press in that slop-but-outside-frame band, once the outer card has an
 * onPress, is RN-responder-ambiguous — re-check the gesture split when the doorway is
 * wired. Moot today (no card onPress yet).
 */
export function MetricInfoButton({
  open,
  onToggle,
  metricLabel,
}: {
  open: boolean;
  onToggle: () => void;
  metricLabel: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      // 16px glyph + 14 logical points each side ≈ a 44pt touch target, header unchanged.
      hitSlop={14}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`What "${metricLabel}" means`}
      testID="metric-info-button"
      style={styles.button}
    >
      <Info size={16} color={open ? theme.colorTextSecondary : theme.colorTextDisabled} />
    </Pressable>
  );
}

/**
 * The revealed definition — a calm, neutral callout beneath the card body. The card
 * gates rendering on its open state; this piece just presents the one-line text.
 */
export function MetricDefinition({ text }: { text: string }) {
  return (
    <View style={styles.callout} testID="metric-definition">
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    // The glyph sits flush-right in the header's actions group; no box/background so it
    // stays unobtrusive — the muted colour is the whole affordance until tapped.
    alignItems: 'center',
    justifyContent: 'center',
  },
  callout: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusSmall,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
  },
  text: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 20, // raw lineHeight — folds into the B-101 lineHeightBody token sweep
  },
});
