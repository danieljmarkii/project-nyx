import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

type Variant =
  | 'default'   // active: teal outline + tinted background (date presets)
  | 'filled'    // active: dark filled (type filters)
  | 'onDark';   // active: accent fill on a dark parent surface (intake chips in Toast)

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
  variant?: Variant;
}

export function FilterChip({ label, active, onPress, variant = 'default' }: Props) {
  const set = STYLE_BY_VARIANT[variant];
  return (
    <TouchableOpacity
      style={[set.base, active && set.activeContainer]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[set.label, active && set.activeLabel]}>{label}</Text>
    </TouchableOpacity>
  );
}

const baseChip = {
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: theme.radiusFull,
  borderWidth: 1,
} as const;

const baseLabel = {
  fontSize: theme.textSM,
  fontWeight: theme.weightMedium,
} as const;

const defaultVariant = StyleSheet.create({
  base: {
    ...baseChip,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  activeContainer: {
    borderColor: theme.colorAccent,
    backgroundColor: theme.colorAccentLight,
  },
  label: {
    ...baseLabel,
    color: theme.colorTextSecondary,
  },
  activeLabel: {
    color: theme.colorAccent,
  },
});

const filledVariant = StyleSheet.create({
  base: {
    ...baseChip,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  activeContainer: {
    backgroundColor: theme.colorNeutralDark,
    borderColor: theme.colorNeutralDark,
  },
  label: {
    ...baseLabel,
    color: theme.colorTextSecondary,
  },
  activeLabel: {
    color: '#fff',
  },
});

// Use inside a dark-surface container (e.g. the post-log Toast card).
// Inactive: translucent white border + soft white label, transparent fill so
// the parent card colour shows through. Active: accent fill, white label —
// reads cleanly against the dark card without competing with the card's
// own affordances.
const onDarkVariant = StyleSheet.create({
  base: {
    ...baseChip,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
  },
  activeContainer: {
    backgroundColor: theme.colorAccent,
    borderColor: theme.colorAccent,
  },
  label: {
    ...baseLabel,
    color: 'rgba(255,255,255,0.85)',
  },
  activeLabel: {
    color: '#fff',
  },
});

const STYLE_BY_VARIANT = {
  default: defaultVariant,
  filled: filledVariant,
  onDark: onDarkVariant,
};
