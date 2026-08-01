// The Foods-tab trial strip — B-616 PR 3 (FR-1; mock screen A).
//
// Two lines and a chevron under the Foods header, answering "which foods?" one tap
// away. It is NOT `components/home/TrialStrip` and deliberately does not reuse it:
// that one is a day-PROGRESS surface on Home (a progress track, the coverage line)
// and this one is a LIST surface — day counter for context, then the count of foods
// on the list, then the way through to §2.2. Sharing a component would mean one of
// the two carrying a prop it never uses.
//
// ── WHY IT IS TINTED AND NOT A CARD ─────────────────────────────────────────
//
// `colorAccentLight` + `colorAccentInk` is the app's calm tinted-surface pair, and
// the mock uses it here to say "this tab is in a special mode right now" without a
// card's weight — the library below is the content, and the strip is context. The
// accent is not a status colour: nothing on this strip is a verdict, a score or a
// warning (R1/§6.9), and there is no state in which it turns another colour.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import type { FoodsTrialStripModel } from '../../lib/trialLibraryChrome';

interface Props {
  /** Null renders nothing — the FR-4 disappearance and R2's "render nothing"
   *  arrive here as the same branch, which is why the builder returns a union
   *  rather than the screen holding two separate conditions. */
  model: FoodsTrialStripModel | null;
  onPress: () => void;
}

export function FoodsTrialStrip({ model, onPress }: Props) {
  if (!model) return null;

  return (
    <Pressable
      onPress={onPress}
      style={styles.strip}
      accessibilityRole="button"
      // Both lines, then what the tap does. A screen-reader owner gets the same
      // two facts a sighted one does, in the same order.
      accessibilityLabel={`${model.header}. ${model.line}. See the trial list.`}
      testID="foods-trial-strip"
    >
      <View style={styles.dot} />
      <View style={styles.text}>
        <Text style={styles.header} testID="foods-trial-strip-header">
          {model.header}
        </Text>
        <Text style={styles.line} testID="foods-trial-strip-line">
          {model.line}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    backgroundColor: theme.colorAccentLight,
    borderWidth: 1,
    borderColor: theme.colorAccentSoft,
    borderRadius: theme.radiusMedium,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    // The whole strip is the tap target, so it carries the 44pt floor itself
    // rather than leaning on a hitSlop around a smaller child.
    minHeight: 56,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colorAccent,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  header: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  line: {
    fontSize: theme.textXS,
    color: theme.colorAccentInk,
  },
  chevron: {
    fontSize: theme.textLG,
    color: theme.colorAccentInk,
  },
});
