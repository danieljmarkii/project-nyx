import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import { SectionLabel } from '../ui/SectionLabel';
import { usePetStore } from '../../store/petStore';

const PREVIEW_INSIGHTS = [
  "Vomiting dropped 60% in the two weeks after switching proteins — the diet trial appears to be working.",
  "Itching tends to peak 3–6 hours after meals containing chicken. No reaction to salmon-based foods.",
];

export function SignalZone() {
  const { activePet } = usePetStore();
  const petName = activePet?.name ?? 'your pet';

  return (
    // Signal is the dominant zone — elevated card differentiates it visually from Today + Trend.
    <Card elevated>
      <SectionLabel label="Signal" style={styles.label} />

      <Text style={styles.intro}>
        Keep logging and {petName}'s first pattern will surface in about a week.
      </Text>

      <View style={styles.previews}>
        <Text style={styles.previewsHeader}>What the signal looks like:</Text>
        {PREVIEW_INSIGHTS.map((text, i) => (
          <View key={i} style={styles.previewRow}>
            <View style={styles.previewAccentBar} />
            <Text style={styles.previewText}>{text}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: theme.space2,
  },
  intro: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
    marginBottom: theme.space2,
  },
  previews: {
    gap: theme.space1,
  },
  previewsHeader: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
  },
  previewAccentBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: theme.colorAccent,
    opacity: 0.5,
  },
  previewText: {
    flex: 1,
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: 20,
    opacity: 0.65,
  },
});
