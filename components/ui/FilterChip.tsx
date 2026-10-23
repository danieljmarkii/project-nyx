import { TouchableOpacity, StyleSheet, AccessibilityRole } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from './ThemedText';
import { TAP_TARGET_FLOOR, verticalSlopTo } from '../../lib/tapTarget';

type Variant =
  | 'default'   // active: teal outline + tinted background (date presets)
  | 'filled';   // active: near-black pill, white label (type filters, the completion cards' intake chips)

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
      // See FILTER_CHIP_HITSLOP: the pinned box plus vertical-only slop reaches the
      // 44pt floor, and adjacent chips in a row never share a tap zone.
      hitSlop={FILTER_CHIP_HITSLOP}
    >
      <ThemedText style={[set.label, active && set.activeLabel]}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

// ── THE CHIP'S TOUCH TARGET (CUL-658) ───────────────────────────────────────
// A chip is ~32pt tall (a 13pt medium label, 6pt padding either side, a 1pt
// border). The 32 is PINNED as a minHeight rather than left to the font's line
// box, so the reach is computed from a box the code holds (lib/tapTarget): a floor
// resting on a metric no test can compute is a floor nobody is holding (CUL-579).
// A floor, so larger type still grows the pill past it.
//
// Computed here from THIS chip's box, never shared with AdherenceChipRow's: the
// two agree today only because their geometry matches. Restyle one and the two
// should diverge; a shared constant would keep them equal, and one of them wrong.
export const FILTER_CHIP_MIN_HEIGHT = 32;
export const FILTER_CHIP_HITSLOP = verticalSlopTo(TAP_TARGET_FLOOR, FILTER_CHIP_MIN_HEIGHT);

const baseChip = {
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: theme.radiusFull,
  borderWidth: 1,
  minHeight: FILTER_CHIP_MIN_HEIGHT,
  justifyContent: 'center',
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
    color: theme.colorAccentInk,
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

const STYLE_BY_VARIANT = {
  default: defaultVariant,
  filled: filledVariant,
};

// Variant-agnostic dim for the temporarily-inert state — layered over whichever
// variant's container/label so the busy look is one rule, not one per variant.
const styles = StyleSheet.create({
  disabled: {
    opacity: theme.opacityDisabled,
  },
});
