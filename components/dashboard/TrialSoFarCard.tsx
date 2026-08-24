import { Pressable, View, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import {
  trialPanelTitle,
  trialContextLine,
  trialPhenotypeState,
  trialPhenotypeSampleLine,
  trialPhenotypeUntimedLine,
  trialNoneTimeableLine,
  trialTreatShareValue,
  trialMealsPerDayValue,
  trialHonestyLine,
  timingBandLabel,
  type TrialSoFarModel,
} from '../../lib/patternsTrial';
import { ThemedText } from '../ui/ThemedText';

// TrialSoFarCard — the Patterns dashboard's "The trial so far" panel face (Signals v2 /
// B-755 PR 9, CUL-11; spec §4.5): the per-phenotype vomit-timing rows + the
// diet-structure rows (treat share, meals/day) + the "shows what, not why" line. All
// counts through lib/mealTiming (G9), windowed to the trial's evidence bound. Count-
// anchored, never verdicted — a doorway to the metric-detail view.
//
// GA'd (CUL-548) — the parent renders it whenever the trial model has data.

interface Props {
  model: TrialSoFarModel;
  onPress: () => void;
}

export function TrialSoFarCard({ model, onPress }: Props) {
  const phenotypeState = trialPhenotypeState(model.phenotype);
  const untimed = trialPhenotypeUntimedLine(model.phenotype);

  // VoiceOver hears the whole card as one label, so fold the phenotype counts / disclosure
  // + the diet-structure into it — otherwise a screen-reader user never hears the
  // safety-relevant "none could be timed" or the per-band counts.
  const phenotypeA11y =
    phenotypeState === 'rows'
      ? `Vomiting timing: ${model.phenotype.bandRows
          .map((r) => `${timingBandLabel(r.band, model.config)}, ${r.count}`)
          .join('; ')}. ${trialPhenotypeSampleLine(model.phenotype)}${untimed ? `. ${untimed}` : ''}`
      : phenotypeState === 'none_timeable'
        ? trialNoneTimeableLine(model.phenotype)
        : '';
  const a11yLabel = [
    `${trialPanelTitle()}: ${trialContextLine(model)}`,
    phenotypeA11y,
    `Treats ${trialTreatShareValue(model.structure)}. Meals ${trialMealsPerDayValue(model.structure)}`,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens the trial-so-far detail"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <ThemedText style={styles.title}>{trialPanelTitle()}</ThemedText>
        <ChevronRight size={18} color={theme.colorTextDisabled} />
      </View>
      <ThemedText style={styles.context}>{trialContextLine(model)}</ThemedText>

      {/* Phenotype — vomit timing during the trial (context counts, no verdict). The
          section is DROPPED when no vomiting was logged in-window (`empty`), never a
          wall of "— 0" rows that reads as an all-clear; an episodes-but-untimeable
          record gets an honest disclosure line instead of zero rows. */}
      {phenotypeState !== 'empty' && (
        <>
          <ThemedText style={styles.sectionLabel}>Vomiting timing</ThemedText>
          {phenotypeState === 'rows' ? (
            <>
              <View style={styles.rows}>
                {model.phenotype.bandRows.map((row) => (
                  <View key={row.band} style={styles.row}>
                    <ThemedText style={styles.rowLabel}>{timingBandLabel(row.band, model.config)}</ThemedText>
                    <ThemedText style={styles.rowValue}>{row.count}</ThemedText>
                  </View>
                ))}
              </View>
              <ThemedText style={styles.sample}>{trialPhenotypeSampleLine(model.phenotype)}</ThemedText>
              {untimed != null && <ThemedText style={styles.sample}>{untimed}</ThemedText>}
            </>
          ) : (
            <ThemedText style={styles.noneTimeable}>{trialNoneTimeableLine(model.phenotype)}</ThemedText>
          )}
        </>
      )}

      {/* Diet-structure rows — the observable half of the confound (treat share, meals/day). */}
      <ThemedText style={styles.sectionLabel}>Diet during the trial</ThemedText>
      <View style={styles.rows}>
        <View style={styles.row}>
          <ThemedText style={styles.rowLabel}>Treats</ThemedText>
          <ThemedText style={styles.rowValueText}>{trialTreatShareValue(model.structure)}</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.rowLabel}>Meals</ThemedText>
          <ThemedText style={styles.rowValueText}>{trialMealsPerDayValue(model.structure)}</ThemedText>
        </View>
      </View>

      <ThemedText style={styles.honesty}>{trialHonestyLine()}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    minHeight: 44,
    gap: theme.space1,
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
  context: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  sectionLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
    marginTop: theme.space1,
  },
  rows: {
    gap: theme.space0_5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    flexShrink: 1,
  },
  rowValue: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    fontVariant: ['tabular-nums'],
  },
  rowValueText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  // The denominator + disclosure lines carry safety weight (they are why a count can't
  // be misread), so they are legible body text — not fine-print tertiary (the
  // pm-feature-review's hierarchy note).
  sample: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  noneTimeable: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
  },
  honesty: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightXS,
    marginTop: theme.space1,
  },
});
