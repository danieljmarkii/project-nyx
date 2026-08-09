import { Text, TextStyle, StyleProp, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

interface Props {
  label: string;
  // StyleProp so callers can pass a conditional [base, override] array (the component
  // already flattens it into its own [styles.label, style] array at render time).
  style?: StyleProp<TextStyle>;
  /**
   * Announce as a VoiceOver heading (B-637). Opt-in, because this component
   * serves two jobs with different semantics: a label over a list/zone SECTION
   * ("Recent", "On the trial list", the Home zones) is a heading the rotor
   * should jump to — pass `header`. A label over a single FORM FIELD ("Name",
   * "Species", "Strength") is not: marking every field label as a heading
   * turns the rotor's Headings list into the form itself. Field labels stay
   * plain text.
   */
  header?: boolean;
}

export function SectionLabel({ label, style, header = false }: Props) {
  return (
    <Text accessibilityRole={header ? 'header' : undefined} style={[styles.label, style]}>
      {label}
    </Text>
  );
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
