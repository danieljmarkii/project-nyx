import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { FilterChip } from '../ui/FilterChip';

// WSAVA Diet History Form 5-point ordinal — the validated clinical
// instrument per Dr. Chen. Do not substitute a custom emoji scale.
// See: docs/research/2026-05-feeding-windows-and-partial-eating.md
//      docs/backlog.md B-014
export type IntakeRating = 'refused' | 'picked' | 'some' | 'most' | 'all';

const OPTIONS: { value: IntakeRating; label: string }[] = [
  { value: 'refused', label: 'Refused' },
  { value: 'picked',  label: 'Picked' },
  { value: 'some',    label: 'Some' },
  { value: 'most',    label: 'Most' },
  { value: 'all',     label: 'All' },
];

interface Props {
  value: IntakeRating | null;
  // Omit to render in read-only mode. In read-only mode, a NULL value
  // renders nothing (history rows for unrated meals stay clean).
  onChange?: (next: IntakeRating | null) => void;
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
  const readOnly = onChange === undefined;

  // Read-only NULL: render nothing. Keeps history rows visually quiet for
  // legacy/unrated meals.
  if (readOnly && value === null) return null;

  // Read-only with a rating: single compact chip showing the rating only.
  if (readOnly) {
    const opt = OPTIONS.find((o) => o.value === value)!;
    return (
      <View style={styles.readOnlyWrap}>
        <FilterChip
          label={opt.label}
          active
          onPress={() => {}}
          variant={onDark ? 'onDark' : 'default'}
        />
      </View>
    );
  }

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
        {OPTIONS.map((opt) => {
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
    color: 'rgba(255,255,255,0.7)',
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
  readOnlyWrap: {
    flexDirection: 'row',
  },
});
