import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { FilterChip } from './FilterChip';
import { ChipGroupOption } from './ChipGroup';
import { theme } from '../../constants/theme';

interface Props {
  options: ChipGroupOption[];
  /** The currently-selected option values. Order is the caller's business. */
  values: readonly string[];
  /** Fired with the tapped option's value; the caller toggles it in/out. */
  onToggle: (value: string) => void;
  variant?: 'default' | 'filled' | 'onDark';
  // Announced as the group's label (e.g. "Also contains"); pairs with the
  // on-screen SectionLabel above it.
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Multi-select sibling of ChipGroup — same wrapping layout and the same house
 * rule behind it (B-146: every option stays on screen, never a hidden-overflow
 * h-scroll row). Built for the B-351 "Also contains" protein line, where the set
 * is a closed list of ~11 short labels an owner picks several of.
 *
 * Rendered as checkboxes rather than a radio group, which is the actual
 * semantics: each chip is independently on or off, and a screen reader should
 * say so.
 */
export function MultiChipGroup({
  options,
  values,
  onToggle,
  variant = 'filled',
  accessibilityLabel,
  style,
}: Props) {
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="list"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((o) => (
        <FilterChip
          key={o.value}
          label={o.label}
          active={values.includes(o.value)}
          variant={variant}
          accessibilityRole="checkbox"
          onPress={() => onToggle(o.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Matches ChipGroup: the larger rowGap keeps vertically adjacent chips' 44pt
    // hitSlop zones from overlapping into one ambiguous band.
    columnGap: theme.space1,
    rowGap: theme.space2,
  },
});
