import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { TimingDistribution } from './TimingDistribution';
import {
  timingBandLabel,
  timingPanelTitle,
  timingPanelLead,
  timingSampleLine,
  timingUntimedLine,
  timingNoneTimeableLine,
  type TimingPanelModel,
} from '../../lib/patternsTiming';

// TimingPanelCard — the Patterns dashboard's "Timing" panel face (Signals v2 / B-755
// PR 9, CUL-11; spec §4.5). The full-record distribution: the dot lane, the three-row
// band counts beneath, the honest "N timed of M" denominator + the untimed count.
// Descriptive, never a verdict — the whole card is a doorway to the metric-detail view.
//
// Dark behind `signals_v2` — the parent (app/insights) only renders it when the flag
// resolves on, so this component makes no flag decision itself (byte-identical off, G10).

interface Props {
  model: TimingPanelModel;
  petName: string;
  onPress: () => void;
}

export function TimingPanelCard({ model, petName, onPress }: Props) {
  const hasTimeable = model.eligibleCount > 0;
  const untimed = timingUntimedLine(model);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${timingPanelTitle()}: ${timingSampleLine(model)}`}
      accessibilityHint="Opens the full timing distribution"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{timingPanelTitle()}</Text>
        <ChevronRight size={18} color={theme.colorTextDisabled} />
      </View>
      <Text style={styles.lead}>{timingPanelLead(petName)}</Text>

      {hasTimeable ? (
        <>
          <TimingDistribution model={model} />
          <View style={styles.bandRows}>
            {model.bandRows.map((row) => (
              <View key={row.band} style={styles.bandRow}>
                <Text style={styles.bandLabel}>{timingBandLabel(row.band, model.config)}</Text>
                <Text style={styles.bandCount}>{row.count}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.sample}>{timingSampleLine(model)}</Text>
          {untimed != null && <Text style={styles.untimed}>{untimed}</Text>}
        </>
      ) : (
        // Episodes exist but none could be timed — an honest state, never an all-clear.
        <Text style={styles.noneTimeable}>{timingNoneTimeableLine(petName, model.totalCount)}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    minHeight: 44,
    gap: theme.space2,
    ...shadows.md,
  },
  pressed: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    flexShrink: 1,
  },
  lead: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  bandRows: {
    gap: theme.space1,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bandLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    flexShrink: 1,
  },
  bandCount: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    fontVariant: ['tabular-nums'],
  },
  sample: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  untimed: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightXS,
  },
  noneTimeable: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
});
