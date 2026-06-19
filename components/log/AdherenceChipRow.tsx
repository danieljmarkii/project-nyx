import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';

// The dose-adherence scale (migration 020 `dose_adherence` enum) — the medication
// analog of meals.intake_rating (B-014). Deliberately splits pet-driven states
// (`refused`, `partial`) from the owner-driven `missed`: a pet too nauseated or
// painful to take a pill is a DISEASE signal, never softened to "fussy" — the
// intake-is-not-preference invariant, for drugs (spec §6.2).
export type DoseAdherence = 'given' | 'partial' | 'missed' | 'refused';

// Order runs from the affirmative default (`given`) leftward-first, then the
// three "less than fully given" states. `given` is the only on-track state; the
// rest are clinically worth noting (see CONCERN below).
const OPTIONS: { value: DoseAdherence; label: string }[] = [
  { value: 'given',   label: 'Given' },
  { value: 'partial', label: 'Partial' },
  { value: 'missed',  label: 'Missed' },
  { value: 'refused', label: 'Refused' },
];

// The recolor (vs IntakeChipRow's single accent): `given` is the on-track state
// and lights in the brand accent; every "less than fully given" state lights in
// the symptom rose — a calm, honest flag that the dose matters clinically, NOT an
// alarm (Principle 4). This is the colour reflex of "refusal is a signal" (§6.2):
// downgrading off `given` visibly shifts teal → rose so a missed/refused dose is
// never coloured as if it were fine.
const CONCERN: ReadonlySet<DoseAdherence> = new Set(['partial', 'missed', 'refused']);

interface Props {
  value: DoseAdherence | null;
  // Omit to render read-only (a single badge of the current value; NULL renders
  // nothing). With a handler the row is editable. Editable adherence is
  // SINGLE-SELECT with NO clear-to-null — unlike intake (where null = "didn't
  // say"), a logged dose always has a state, so tapping the active chip is a
  // no-op rather than erasing it back to unrated.
  onChange?: (next: DoseAdherence) => void;
  // Optional header label. Pass null/'' to suppress (e.g. inside the completion
  // card where the card's own line introduces the row). No "(optional)" suffix:
  // unlike intake (where null = "didn't say"), a logged dose always has a state,
  // so the owner can't leave it unrated by skipping the row.
  label?: string | null;
  size?: 'default' | 'compact';
  // Flip to true on a dark parent surface (the completion card).
  onDark?: boolean;
}

export function AdherenceChipRow({
  value,
  onChange,
  label = 'Did they take it?',
  size = 'default',
  onDark = false,
}: Props) {
  const readOnly = onChange === undefined;

  // Read-only NULL: render nothing (keeps history rows quiet for unrated doses).
  if (readOnly && value === null) return null;

  // Read-only with a value: a single static chip. pointerEvents none lets taps
  // fall through to the parent row's own gesture (mirrors IntakeChipRow).
  if (readOnly) {
    const opt = OPTIONS.find((o) => o.value === value)!;
    const concern = CONCERN.has(value!);
    return (
      <View style={styles.readOnlyWrap} pointerEvents="none">
        <Chip label={opt.label} active concern={concern} onDark={onDark} onPress={() => {}} />
      </View>
    );
  }

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
        {OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            active={value === opt.value}
            concern={CONCERN.has(opt.value)}
            onDark={onDark}
            onPress={() => onChange(opt.value)}
          />
        ))}
      </View>
    </View>
  );
}

// One adherence chip. Built standalone rather than via FilterChip so the active
// fill can be accent (given) OR rose (concern states) — a per-state colour
// FilterChip's three fixed variants don't express.
function Chip({
  label, active, concern, onDark, onPress,
}: {
  label: string;
  active: boolean;
  concern: boolean;
  onDark: boolean;
  onPress: () => void;
}) {
  const activeFill = concern ? theme.colorEventSymptom : theme.colorAccent;
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        onDark ? styles.chipOnDark : styles.chipLight,
        active && { backgroundColor: activeFill, borderColor: activeFill },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.chipLabel,
          onDark ? styles.chipLabelOnDark : styles.chipLabelLight,
          active && styles.chipLabelActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
  readOnlyWrap: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
  },
  chipLight: {
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  chipOnDark: {
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
  },
  chipLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
  },
  chipLabelLight: {
    color: theme.colorTextSecondary,
  },
  chipLabelOnDark: {
    color: 'rgba(255,255,255,0.85)',
  },
  chipLabelActive: {
    color: '#fff',
  },
});
