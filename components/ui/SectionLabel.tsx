import { Text, TextStyle, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

interface Props {
  label: string;
  style?: TextStyle;
}

export function SectionLabel({ label, style }: Props) {
  return <Text style={[styles.label, style]}>{label}</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
  },
});
