import { Pressable, View, StyleSheet } from 'react-native';
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
import { ThemedText } from '../ui/ThemedText';

// TimingPanelCard — the Patterns dashboard's "Timing" panel face (Signals v2 / B-755
// PR 9, CUL-11; spec §4.5). The full-record distribution: the dot lane, the three-row
// band counts beneath, the honest "N timed of M" denominator + the untimed count.
// Descriptive, never a verdict — the whole card is a doorway to the metric-detail view.
//
// GA'd (CUL-548) — the parent (app/insights) renders it whenever the timing model has
// data, so this component makes no flag decision itself.

interface Props {
  model: TimingPanelModel;
  petName: string;
  onPress: () => void;
}

export function TimingPanelCard({ model, petName, onPress }: Props) {
  const hasTimeable = model.eligibleCount > 0;
  const untimed = timingUntimedLine(model);

  // Fold the counts + the untimed disclosure into the card's single VoiceOver label —
  // a screen-reader user must still hear the safety-relevant "N couldn't be timed", not
  // just the title + denominator.
  const a11yLabel = hasTimeable
    ? `${timingPanelTitle()}: ${timingSampleLine(model)}. ${model.bandRows
        .map((r) => `${timingBandLabel(r.band, model.config)}, ${r.count}`)
        .join('; ')}${untimed ? `. ${untimed}` : ''}`
    : `${timingPanelTitle()}: ${timingNoneTimeableLine(petName, model.totalCount)}`;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens the full timing distribution"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <ThemedText style={styles.title}>{timingPanelTitle()}</ThemedText>
        <ChevronRight size={18} color={theme.colorTextDisabled} />
      </View>

      {hasTimeable ? (
        <>
          {/* The lead explains the dots, so it only shows when there are dots. */}
          <ThemedText style={styles.lead}>{timingPanelLead(petName)}</ThemedText>
          <TimingDistribution model={model} />
          <View style={styles.bandRows}>
            {model.bandRows.map((row) => (
              <View key={row.band} style={styles.bandRow}>
                <ThemedText style={styles.bandLabel}>{timingBandLabel(row.band, model.config)}</ThemedText>
                <ThemedText style={styles.bandCount}>{row.count}</ThemedText>
              </View>
            ))}
          </View>
          {/* The denominator + untimed disclosure are the safety lines (they are why the
              dots can't be over-read), so they are legible body text — not fine-print.
              This is what keeps a mostly-untimed record (a grazing cat's "2 timed of 40")
              from being under-read at a glance. */}
          <ThemedText style={styles.sample}>{timingSampleLine(model)}</ThemedText>
          {untimed != null && <ThemedText style={styles.untimed}>{untimed}</ThemedText>}
        </>
      ) : (
        // Episodes exist but none could be timed — an honest state, never an all-clear.
        <ThemedText style={styles.noneTimeable}>{timingNoneTimeableLine(petName, model.totalCount)}</ThemedText>
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
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  untimed: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  noneTimeable: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
});
