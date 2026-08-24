// The Daily Recap count chips (B-762 / CUL-23, §2.3 — C2).
//
// The day's inventory as small per-category pills, digit-anchored and NEVER totalled
// into a score (Principle 3 — this is not a firehose or a grade). A symptom chip
// carries the night symptom rose; everything else the neutral card tone. The models
// are the pure `DayCountChip[]` from `buildCountChips`; this only paints them.
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import type { DayCountChip } from '../../lib/daySummary';
import { ThemedText } from '../ui/ThemedText';

function CountChipsImpl({ chips }: { chips: DayCountChip[] }) {
  if (chips.length === 0) return null;
  return (
    <View style={styles.row}>
      {chips.map((chip) => (
        <Chip key={chip.key} chip={chip} />
      ))}
    </View>
  );
}

export const CountChips = memo(CountChipsImpl);

function Chip({ chip }: { chip: DayCountChip }) {
  const isSymptom = chip.tone === 'symptom';
  // Bold the leading count, mute the noun (the mock's `<b>3</b> meals`).
  const spaceAt = chip.label.indexOf(' ');
  const head = spaceAt === -1 ? chip.label : chip.label.slice(0, spaceAt);
  const tail = spaceAt === -1 ? '' : chip.label.slice(spaceAt);
  return (
    <View style={[styles.chip, isSymptom && styles.chipSymptom]}>
      <ThemedText style={styles.label}>
        <ThemedText style={[styles.count, isSymptom && styles.countSymptom]}>{head}</ThemedText>
        {/* geist-ok: nested span — differs from its parent only in colour, so it must stay a
            raw <Text> and inherit the parent's resolved Geist face. A ThemedText here injects its
            own family and breaks RN's native text cascade, shipping a face change mid-sentence
            (CUL-607). */}
        <Text style={isSymptom && styles.labelSymptom}>{tail}</Text>
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space0_5 + theme.spaceMicro, // 6
  },
  chip: {
    backgroundColor: theme.colorBrandNightElevated,
    borderWidth: 1,
    borderColor: theme.colorBorderOnNight,
    borderRadius: 999,
    paddingVertical: theme.space0_5,
    paddingHorizontal: theme.space1 + 1,
  },
  chipSymptom: {
    borderColor: theme.colorEventSymptomOnNight,
  },
  label: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextOnNightMuted,
  },
  labelSymptom: { color: theme.colorEventSymptomOnNight },
  count: {
    fontWeight: theme.weightSemibold,
    color: theme.colorTextOnNight,
  },
  countSymptom: { color: theme.colorEventSymptomOnNight },
});
