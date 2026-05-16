import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';

const EXAMPLE_INSIGHTS = [
  "Vomiting dropped 60% in the two weeks after switching proteins — the diet trial appears to be working.",
  "Itching tends to peak 3–6 hours after meals containing chicken. No reaction to salmon-based foods.",
];

export function SignalZone() {
  const { activePet } = usePetStore();
  const petName = activePet?.name ?? 'your pet';

  return (
    <View style={styles.zone}>
      <View style={styles.header}>
        <Text style={styles.label}>AI Insights</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Coming soon</Text>
        </View>
      </View>

      <Text style={styles.intro}>
        Once {petName} has a few weeks of logs, insights like these will appear here.
      </Text>

      <View style={styles.examples}>
        {EXAMPLE_INSIGHTS.map((text, i) => (
          <View key={i} style={styles.exampleRow}>
            <Text style={styles.exampleLabel}>Example</Text>
            <Text style={styles.exampleText}>{text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space2,
  },
  label: {
    fontSize: 11,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pill: {
    backgroundColor: theme.colorNeutralLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 11,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
  },
  intro: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    lineHeight: 19,
    marginBottom: theme.space2,
  },
  examples: {
    gap: theme.space2,
  },
  exampleRow: {
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
    gap: 4,
  },
  exampleLabel: {
    fontSize: 10,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.7,
  },
  exampleText: {
    fontSize: 14,
    color: theme.colorTextPrimary,
    lineHeight: 20,
    opacity: 0.45,
  },
});
