import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import {
  trialPanelTitle,
  trialContextLine,
  trialPhenotypeSampleLine,
  trialPhenotypeUntimedLine,
  trialTreatShareValue,
  trialMealsPerDayValue,
  trialHonestyLine,
  timingBandLabel,
  type TrialSoFarModel,
} from '../../lib/patternsTrial';

// TrialSoFarCard — the Patterns dashboard's "The trial so far" panel face (Signals v2 /
// B-755 PR 9, CUL-11; spec §4.5): the per-phenotype vomit-timing rows + the
// diet-structure rows (treat share, meals/day) + the "shows what, not why" line. All
// counts through lib/mealTiming (G9), windowed to the trial's evidence bound. Count-
// anchored, never verdicted — a doorway to the metric-detail view.
//
// Dark behind `signals_v2` — the parent renders it only when the flag is on.

interface Props {
  model: TrialSoFarModel;
  onPress: () => void;
}

export function TrialSoFarCard({ model, onPress }: Props) {
  const untimed = trialPhenotypeUntimedLine(model.phenotype);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${trialPanelTitle()}: ${trialContextLine(model)}`}
      accessibilityHint="Opens the trial-so-far detail"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{trialPanelTitle()}</Text>
        <ChevronRight size={18} color={theme.colorTextDisabled} />
      </View>
      <Text style={styles.context}>{trialContextLine(model)}</Text>

      {/* Phenotype rows — vomit timing during the trial (context counts, no verdict). */}
      <Text style={styles.sectionLabel}>Vomiting timing</Text>
      <View style={styles.rows}>
        {model.phenotype.bandRows.map((row) => (
          <View key={row.band} style={styles.row}>
            <Text style={styles.rowLabel}>{timingBandLabel(row.band, model.config)}</Text>
            <Text style={styles.rowValue}>{row.count}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.sample}>{trialPhenotypeSampleLine(model.phenotype)}</Text>
      {untimed != null && <Text style={styles.sample}>{untimed}</Text>}

      {/* Diet-structure rows — the observable half of the confound (treat share, meals/day). */}
      <Text style={styles.sectionLabel}>Diet during the trial</Text>
      <View style={styles.rows}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Treats</Text>
          <Text style={styles.rowValueText}>{trialTreatShareValue(model.structure)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Meals</Text>
          <Text style={styles.rowValueText}>{trialMealsPerDayValue(model.structure)}</Text>
        </View>
      </View>

      <Text style={styles.honesty}>{trialHonestyLine()}</Text>
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
  sample: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightXS,
  },
  honesty: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightXS,
    marginTop: theme.space1,
  },
});
