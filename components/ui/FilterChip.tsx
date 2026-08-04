import { TouchableOpacity, Text, StyleSheet, AccessibilityRole } from 'react-native';
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
  // When this chip is one option in a single-select group (ChipGroup), the group
  // passes 'radio' so the active state is announced as a radio selection; a
  // multi-select group (MultiChipGroup) passes 'checkbox'. Left undefined for
  // filter/toggle usages, which keep TouchableOpacity's button role.
  accessibilityRole?: AccessibilityRole;
  // Temporarily inert — blocks the press, dims the chip, and announces the
  // disabled state. Used while a chip-tap's write is in flight (B-555), so a
  // second tap can't queue a duplicate write before the first re-renders.
  disabled?: boolean;
}

export function FilterChip({
  label, active, onPress, variant = 'default', accessibilityRole, disabled = false,
}: Props) {
  const set = STYLE_BY_VARIANT[variant];
  return (
    <TouchableOpacity
      style={[set.base, active && set.activeContainer, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole={accessibilityRole}
      // The active state is announced for EVERY chip, not just the ones a group
      // gives a role to (B-168). It used to be gated on `accessibilityRole`, so a
      // standalone FilterChip — the Rx/OTC pair on the medication detail screen,
      // the food Type rows — rendered its selection visually and announced nothing,
      // leaving a screen-reader user unable to tell which one was chosen.
      // A checkbox announces `checked`, not `selected` — TalkBack reads a
      // checkbox with no checked state as "not checked" regardless of selection.
      accessibilityState={
        accessibilityRole === 'checkbox'
          ? { checked: active, disabled }
          : { selected: active, disabled }
      }
      // Chips are ~32pt tall; expand the tap zone vertically to the 44pt floor
      // (Designer anti-pattern: sub-44pt targets need hitSlop). Vertical-only so
      // adjacent chips in a horizontal row never share a tap zone.
      hitSlop={{ top: 6, bottom: 6 }}
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
    color: theme.colorTextOnDark,
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
    // Deliberately a translucent white rather than a token: the inactive label sits
    // on a transparent chip over an unknown dark card colour, so it has to blend
    // with whatever shows through. The ACTIVE label sits on a solid accent fill and
    // is the token (B-168).
    color: 'rgba(255,255,255,0.85)',
  },
  activeLabel: {
    color: theme.colorTextOnDark,
  },
});

const STYLE_BY_VARIANT = {
  default: defaultVariant,
  filled: filledVariant,
  onDark: onDarkVariant,
};

// Variant-agnostic dim for the temporarily-inert state — layered over whichever
// variant's container/label so the busy look is one rule, not three.
const styles = StyleSheet.create({
  disabled: {
    opacity: theme.opacityDisabled,
  },
});
