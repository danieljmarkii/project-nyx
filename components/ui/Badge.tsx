import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

type Variant = 'symptom' | 'accent' | 'muted';

interface Props {
  label: string;
  variant?: Variant;
}

export function Badge({ label, variant = 'muted' }: Props) {
  return (
    <View style={[styles.badge, styles[variant]]}>
      <Text style={[styles.label, styles[`${variant}Text` as `${Variant}Text`]]}>
        {label}
      </Text>
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
