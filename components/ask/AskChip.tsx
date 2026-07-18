import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

// A tappable Ask chip (mock §2). Unlike ChipGroup/FilterChip (single-SELECT radio
// options), an Ask chip is an ACTION — a suggested question to send, a follow-up to
// continue with, or (when capped/offline) a navigation shortcut. So it's a plain
// button, never a radio, and has no "active" state. Two looks: `default` (a quiet
// bordered pill) and `accent` (the teal-outlined call-to-action, e.g. the rundown or a
// navigation shortcut). `block` stretches it full-width for the stacked fresh-state list.
interface Props {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'accent';
  block?: boolean;
}

export function AskChip({ label, onPress, variant = 'default', block = false }: Props) {
  const accent = variant === 'accent';
  return (
    <TouchableOpacity
      style={[styles.base, block && styles.block, accent && styles.accent]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      // ~32pt tall chip — expand vertically to the 44pt floor (Designer anti-pattern).
      hitSlop={{ top: 6, bottom: 6 }}
    >
      <Text style={[styles.label, block && styles.blockLabel, accent && styles.accentLabel]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    backgroundColor: theme.colorSurface,
    alignSelf: 'flex-start',
  },
  block: {
    alignSelf: 'stretch',
  },
  accent: {
    borderColor: theme.colorAccent,
  },
  label: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  blockLabel: {
    // A stacked full-width suggested chip reads as a menu row — left-aligned.
    textAlign: 'left',
  },
  accentLabel: {
    color: theme.colorAccent,
    fontWeight: theme.weightSemibold,
  },
});
