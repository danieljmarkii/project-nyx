import { StyleProp, StyleSheet, TextStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';

/**
 * A form field's label (CUL-1911): the one label a field wears, whether the field is a
 * `TextField`, a `PickerRow` or a `ChipGroup`. Lifted out of `TextField` so a chip group
 * and a picker row in the same form stop choosing their own (the profile forms had an
 * uppercase 12pt label beside a SectionLabel beside TextField's caption).
 */
export function FieldLabel({ label, style }: { label: string; style?: StyleProp<TextStyle> }) {
  return <ThemedText style={[styles.label, style]}>{label}</ThemedText>;
}

const styles = StyleSheet.create({
  label: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    marginBottom: theme.space1,
  },
});
