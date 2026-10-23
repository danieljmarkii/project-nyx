import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { colorRoles, theme } from '../../constants/theme';
import { FieldLabel } from './FieldLabel';
import { ThemedText } from './ThemedText';

interface Props {
  label: string;
  /** What is chosen, or null to show the placeholder. */
  value: string | null;
  placeholder: string;
  /** The trailing verb ("Change", "Set date", "Done" while the picker is open). */
  actionLabel: string;
  onPress: () => void;
  testID?: string;
}

/**
 * A field whose value is picked, not typed (CUL-1911, the profile round's F3 gate): the
 * value or its placeholder, and a trailing verb that opens the picker below it. It wears
 * `TextField`'s box and label so a form reads as one set of fields. The picker itself
 * (a calendar, the breed list) is the caller's, rendered under the row.
 */
export function PickerRow({ label, value, placeholder, actionLabel, onPress, testID }: Props) {
  return (
    <View>
      <FieldLabel label={label} />
      <TouchableOpacity
        style={styles.field}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        // One stop: the field, what it holds, and what the tap does.
        accessibilityLabel={`${label}, ${value ?? placeholder}. ${actionLabel}`}
        testID={testID}
      >
        <ThemedText variant="body" style={value ? styles.value : styles.placeholder} numberOfLines={1}>
          {value ?? placeholder}
        </ThemedText>
        <ThemedText variant="caption" style={styles.action}>{actionLabel}</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space1,
    // TextField's box: the same floor, edge and radius.
    minHeight: theme.space5,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    backgroundColor: theme.colorSurface,
  },
  value: {
    flexShrink: 1,
    color: theme.colorTextPrimary,
  },
  placeholder: {
    flexShrink: 1,
    color: theme.colorTextTertiary,
  },
  action: {
    fontWeight: theme.weightMedium,
    color: colorRoles.action.onLight,
  },
});
