import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

type Variant =
  | 'default'   // active: teal outline + tinted background (date presets)
  | 'filled';   // active: dark filled (type filters)

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
  variant?: Variant;
}

export function FilterChip({ label, active, onPress, variant = 'default' }: Props) {
  const isFilled = variant === 'filled';
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        active && (isFilled ? styles.chipActiveFilled : styles.chipActiveOutline),
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.label,
          active && (isFilled ? styles.labelActiveFilled : styles.labelActiveOutline),
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  chipActiveOutline: {
    borderColor: theme.colorAccent,
    backgroundColor: theme.colorAccentLight,
  },
  chipActiveFilled: {
    backgroundColor: theme.colorNeutralDark,
    borderColor: theme.colorNeutralDark,
  },
  label: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  labelActiveOutline: {
    color: theme.colorAccent,
  },
  labelActiveFilled: {
    color: '#fff',
  },
});
