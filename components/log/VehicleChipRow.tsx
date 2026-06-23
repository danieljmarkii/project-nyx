import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { FilterChip } from '../ui/FilterChip';
import { MEDICATION_VEHICLE_OPTIONS, type DoseVehicle } from '../../lib/medications';

// B-156 Slice B (PR A3) — the dose vehicle ("How was it given?") chip row. The
// medication-dose twin of IntakeChipRow, deliberately built on the OPTIONAL,
// clearable intake-chip pattern (not the always-has-a-state AdherenceChipRow): the
// vehicle is a descriptive add-on with no default, so tapping the active chip clears
// it back to NULL ("not recorded"), exactly like intake. It carries no adherence /
// safety meaning on its own — never softened to "fussy", never an alarm; it simply
// records HOW the dose was given when the owner says so (the clinical "with food"
// fact), and is silent otherwise. The values come from the single MEDICATION_VEHICLE_
// OPTIONS source so they can't drift from the server dose_route_vehicle enum.

interface Props {
  value: DoseVehicle | null;
  // Omit to render read-only (a single chip of the current value; NULL renders
  // nothing, so History rows stay quiet for doses with no recorded vehicle).
  onChange?: (next: DoseVehicle | null) => void;
  // Optional header label. Pass null/'' to suppress (e.g. inside the completion
  // card, where the card renders its own "How was it given?" line). Defaults to the
  // skippable framing for an inline surface.
  label?: string | null;
  size?: 'default' | 'compact';
  // Flip to true on a dark parent surface (the completion card).
  onDark?: boolean;
}

export function VehicleChipRow({
  value,
  onChange,
  label = 'How was it given? (optional)',
  size = 'default',
  onDark = false,
}: Props) {
  const readOnly = onChange === undefined;

  // Read-only NULL: render nothing (keeps history rows quiet for unrecorded doses).
  if (readOnly && value === null) return null;

  // Read-only with a value: a single static chip. pointerEvents none lets taps fall
  // through to the parent row's own gesture (mirrors IntakeChipRow / AdherenceChipRow).
  if (readOnly) {
    const opt = MEDICATION_VEHICLE_OPTIONS.find((o) => o.value === value);
    if (!opt) return null; // unrecognized value renders clean, never a raw token
    return (
      <View style={styles.readOnlyWrap} pointerEvents="none">
        <FilterChip
          label={opt.label}
          active
          onPress={() => {}}
          variant={onDark ? 'onDark' : 'default'}
        />
      </View>
    );
  }

  // Editable: the option chips. Tap an active chip to clear back to null (optional —
  // a dose never requires a vehicle, so skipping the row leaves how_given NULL).
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
        {MEDICATION_VEHICLE_OPTIONS.map((opt) => {
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
    // FilterChip carries its own tap inset; this wrapper keeps the row's gap from
    // collapsing as the chips re-flow (mirrors IntakeChipRow).
  },
  readOnlyWrap: {
    flexDirection: 'row',
  },
});
