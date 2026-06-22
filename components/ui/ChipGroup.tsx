import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { FilterChip } from './FilterChip';
import { theme } from '../../constants/theme';

export interface ChipGroupOption {
  value: string;
  label: string;
}

interface Props {
  options: ChipGroupOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  // A second tap on the active chip clears the selection (value → null). True for
  // optional fields — medication form/route, where "unset" is a legitimate state;
  // false for required fields — food format, where one option is always chosen.
  allowDeselect?: boolean;
  variant?: 'default' | 'filled' | 'onDark';
  // Announced as the radio group's label (e.g. "Form", "Route", "Format"); pairs
  // with the on-screen SectionLabel above the group.
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Single-select chip group that WRAPS instead of scrolling horizontally. Every
 * option stays on screen — which is the whole point. The hidden-overflow
 * horizontal scroll it replaces silently pushed 5–6 of these option chips past
 * the edge with no scrollbar, arrow, or peek, so owners picked from only the
 * handful they could see — a discoverability AND correctness problem on closed
 * single-select sets like medication Form (10) / Route (8) and food Format (10)
 * (B-146). The app already wraps this exact list in AddMedicationModal; this
 * makes capture + the detail screens consistent with it.
 *
 * Rendered as an accessible radio group so a screen reader announces each option
 * and its selected state — the row of bare TouchableOpacities it replaces
 * announced neither.
 */
export function ChipGroup({
  options,
  value,
  onChange,
  allowDeselect = true,
  variant = 'filled',
  accessibilityLabel,
  style,
}: Props) {
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((o) => (
        <FilterChip
          key={o.value}
          label={o.label}
          active={value === o.value}
          variant={variant}
          accessibilityRole="radio"
          onPress={() => onChange(allowDeselect && value === o.value ? null : o.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // columnGap is the visual chip spacing. rowGap is deliberately larger because
    // FilterChip extends its tap zone 6px above/below (hitSlop, to clear the 44pt
    // floor) — at an 8px rowGap the touch areas of vertically adjacent chips would
    // overlap into a shared, ambiguous band. space2 keeps the rows' tap zones apart.
    columnGap: theme.space1,
    rowGap: theme.space2,
  },
});
