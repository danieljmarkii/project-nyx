import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { FilterChip } from '../ui/FilterChip';

// WSAVA Diet History Form 5-point ordinal — the validated clinical
// instrument per Dr. Chen. Do not substitute a custom emoji scale.
// See: docs/research/2026-05-feeding-windows-and-partial-eating.md
//      docs/backlog.md B-014
export type IntakeRating = 'refused' | 'picked' | 'some' | 'most' | 'all';

// Exported so the read-only IntakeBadge (B-035) draws its display label from the SAME
// source — the badge and this editable row can't drift to two spellings of one rating.
export const INTAKE_OPTIONS: { value: IntakeRating; label: string }[] = [
  { value: 'refused', label: 'Refused' },
  { value: 'picked',  label: 'Picked' },
  { value: 'some',    label: 'Some' },
  { value: 'most',    label: 'Most' },
  { value: 'all',     label: 'All' },
];

interface Props {
  value: IntakeRating | null;
  // This row is the EDITABLE intake surface only. Read-only display (History) is the
  // dedicated IntakeBadge (B-035) — the old `onChange`-omitted read-only branch that reused
  // FilterChip lived here and is gone, so a handler is now required.
  onChange: (next: IntakeRating | null) => void;
  // Optional header label. Pass null/'' to suppress (e.g. inside a toast
  // where vertical budget is tight). Defaults to the locked "later is fine"
  // framing for the inline log surface.
  label?: string | null;
  size?: 'default' | 'compact';
  // Flip to true when rendering on a dark parent surface (Toast card).
  // Switches the chip variant + label colours.
  onDark?: boolean;
}

export function IntakeChipRow({
  value,
  onChange,
  label = 'Already finished? (optional)',
  size = 'default',
  onDark = false,
}: Props) {
  // Editable: 5-chip row. Tap an active chip to clear back to null.
  const showLabel = label !== null && label !== '';
  return (
    <View style={size === 'compact' ? styles.compactWrap : styles.wrap}>
      {showLabel && (
        <Text style={[
          size === 'compact' ? styles.labelCompact : styles.label,
          onDark && styles.labelOnDark,
        ]}>
          {label}
        </Text>
      )}
      <View style={styles.row}>
        {INTAKE_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <View key={opt.value} style={styles.chipWrap}>
              <FilterChip
                label={opt.label}
                active={active}
                onPress={() => onChange(active ? null : opt.value)}
                variant={onDark ? 'onDark' : 'filled'}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: theme.space1,
  },
  compactWrap: {
    gap: 6,
  },
  label: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  labelCompact: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
  },
  labelOnDark: {
    color: theme.colorTextOnDarkSubtle,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipWrap: {
    // FilterChip has 8pt tap inset; this wrapper exists so the row can
    // re-flow cleanly without the gap collapsing.
  },
});
