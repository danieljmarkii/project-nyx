// The Home trial strip (B-417 PR 4, §4.2 — the round-3 addition).
//
// A running trial gets a COMPACT STRIP on Home, not a second full card: day
// count, day-progress bar, one line, tap through to the Pet tab's card.
//
// ── PLACEMENT IS THE DESIGN ──────────────────────────────────────────────────
// It sits BELOW SignalZone and ABOVE TodayZone, deliberately: Principle 3 says
// safety insights always lead, and a trial is CONTEXT, not an insight. And it
// renders ONLY while a trial is active — Home gains nothing when there isn't
// one, which is `resolveTrialStrip` returning null rather than a prop this
// component has to remember to check.
//
// The Pet tab is not a surface the wedge owner visits daily; the trial is the
// thing they live with for eight weeks. That gap is the whole reason this exists.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import type { TrialStripModel } from '../../lib/dietTrialCard';

interface Props {
  model: TrialStripModel | null;
  /** Overridable so the test drives navigation without a router mock. */
  onPress?: () => void;
}

export function TrialStrip({ model, onPress }: Props) {
  if (!model) return null;

  return (
    <Pressable
      onPress={onPress ?? (() => router.push('/(tabs)/profile'))}
      accessibilityRole="button"
      accessibilityLabel={`${model.header}. Open the diet trial.`}
      testID="trial-strip"
    >
      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.header}>{model.header}</Text>
          <Text style={styles.chevron}>›</Text>
        </View>

        <View style={styles.progressTrack} testID="trial-strip-track">
          <View
            testID="trial-strip-fill"
            // R2: day progress, and nothing else. There is no other fraction on
            // `TrialStripModel` for this to accidentally bind to.
            style={[styles.progressFill, { width: `${model.progressFraction * 100}%` }]}
          />
        </View>

        {model.line !== null && <Text style={styles.line}>{model.line}</Text>}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  chevron: {
    fontSize: theme.textLG,
    color: theme.colorTextSecondary,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
    marginTop: theme.space2,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colorAccent,
  },
  line: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
});
