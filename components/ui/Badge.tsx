import { View, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

type Variant = 'symptom' | 'accent' | 'muted';

interface Props {
  label: string;
  variant?: Variant;
}

export function Badge({ label, variant = 'muted' }: Props) {
  return (
    <View style={[styles.badge, styles[variant]]}>
      <ThemedText style={[styles.label, styles[`${variant}Text` as `${Variant}Text`]]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: theme.radiusXS + 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  symptom: {
    backgroundColor: theme.colorEventSymptomLight,
  },
  accent: {
    backgroundColor: theme.colorAccentLight,
  },
  muted: {
    backgroundColor: theme.colorNeutralLight,
  },
  label: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
  },
  symptomText: {
    color: theme.colorEventSymptom,
  },
  accentText: {
    color: theme.colorAccent,
  },
  mutedText: {
    color: theme.colorTextSecondary,
  },
});
