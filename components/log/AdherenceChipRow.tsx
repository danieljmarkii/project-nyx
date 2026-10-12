import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

// The dose-adherence scale (migration 020 `dose_adherence` enum) — the medication
// analog of meals.intake_rating (B-014). Deliberately splits pet-driven states
// (`refused`, `partial`) from the owner-driven `missed`: a pet too nauseated or
// painful to take a pill is a DISEASE signal, never softened to "fussy" — the
// intake-is-not-preference invariant, for drugs (spec §6.2).
export type DoseAdherence = 'given' | 'partial' | 'missed' | 'refused';

// Order runs from the affirmative default (`given`) leftward-first, then the
// three "less than fully given" states. `given` is the only on-track state; the
// rest are clinically worth noting (see CONCERN below). Exported so a read-only
// surface names a dose's adherence in this row's own words (the shared day row,
// History v2 HV-6): one vocabulary, never a second spelling of a chip.
export const ADHERENCE_OPTIONS: { value: DoseAdherence; label: string }[] = [
  { value: 'given',   label: 'Given' },
  { value: 'partial', label: 'Partial' },
  { value: 'missed',  label: 'Missed' },
  { value: 'refused', label: 'Refused' },
];

// The recolor (vs IntakeChipRow's single accent): `given` is the on-track state
// and lights in the brand teal; every "less than fully given" state lights in
// the symptom rose — a calm, honest flag that the dose matters clinically, NOT an
// alarm (Principle 4). This is the colour reflex of "refusal is a signal" (§6.2):
// downgrading off `given` visibly shifts teal → rose so a missed/refused dose is
// never coloured as if it were fine.
const CONCERN: ReadonlySet<DoseAdherence> = new Set(['partial', 'missed', 'refused']);

// ── THE CHIP'S TOUCH TARGET (CUL-579, extending CUL-391) ────────────────────
// A chip is ~32pt tall (13pt label + 6pt padding either side), and on the
// medication completion card these chips are the SOLE surface for resolving a
// dose the record is unsure about — so a missed tap is a dose left in doubt.
// The floor is reached with vertical-only slop rather than a taller pill,
// because the pill's height is the card's design: FilterChip on this same
// card already documents and applies exactly this fix (identical geometry —
// 12/6 padding, 1pt border, a 13pt medium label).
//
// The 32 is PINNED as a minHeight rather than inherited from the font's line
// box, so `32 + 6 + 6 = 44` is true by construction and can be asserted. Left
// implicit, the floor would rest on a metric nothing checks: a weight or
// dynamic-type change that shrank the line box would drop these chips back
// under 44 silently, and the Geist sweeps (CUL-364) have just been through
// here. It is a floor, so larger type still grows the pill past it; today the
// chips already measure ~32 and it changes nothing on screen.
//
// Vertical-ONLY is load-bearing. Horizontal slop would reach into the 6pt
// COLUMN gap from both sides, so `Missed` and `Refused` would share ~6pt and a
// tap near the boundary would resolve by z-order (CUL-612) — turning a
// pet-driven refusal into an owner-driven miss, which is the one distinction
// this row exists to keep (§6.2).
//
// The ROW gap has to pay for the slop it now has to clear: the row WRAPS
// (four chips, 13pt, a narrow card or large type), and 6 + 6 of vertical reach
// into a 6pt row gap would make the two wrapped LINES share hit area — the same
// z-order defect, rotated 90°. So the gaps are split: the column gap stays at
// the design's 6, and the row gap is widened to clear both neighbours' reach.
// Exported so the arithmetic is asserted rather than eyeballed on a device.
export const CHIP_HITSLOP = { top: 6, bottom: 6 } as const;
export const CHIP_MIN_HEIGHT = 32;
export const CHIP_COLUMN_GAP = 6;
export const CHIP_ROW_GAP = CHIP_HITSLOP.top + CHIP_HITSLOP.bottom;

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
}

export function AdherenceChipRow({
  value,
  onChange,
  label = 'Did they take it?',
  size = 'default',
}: Props) {
  const readOnly = onChange === undefined;

  // Read-only NULL: render nothing (keeps history rows quiet for unrated doses).
  if (readOnly && value === null) return null;

  // Read-only with a value: a single static chip. pointerEvents none lets taps
  // fall through to the parent row's own gesture (mirrors IntakeChipRow).
  if (readOnly) {
    const opt = ADHERENCE_OPTIONS.find((o) => o.value === value)!;
    const concern = CONCERN.has(value!);
    return (
      <View style={styles.readOnlyWrap} pointerEvents="none">
        <Chip label={opt.label} active concern={concern} onPress={() => {}} />
      </View>
    );
  }

  const showLabel = label !== null && label !== '';
  return (
    <View style={size === 'compact' ? styles.compactWrap : styles.wrap}>
      {showLabel && (
        <ThemedText style={size === 'compact' ? styles.labelCompact : styles.label}>
          {label}
        </ThemedText>
      )}
      <View style={styles.row}>
        {ADHERENCE_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            active={value === opt.value}
            concern={CONCERN.has(opt.value)}
            onPress={() => onChange(opt.value)}
          />
        ))}
      </View>
    </View>
  );
}

// One adherence chip. Built standalone rather than via FilterChip so the active
// fill can be teal (given) OR rose (concern states) — a per-state colour
// FilterChip's fixed variants don't express.
//
// The fill is the INK of each family, for every caller (CUL-1691 PR 1, spec §1): the
// white label on the bright colorAccent / colorEventSymptom was 2.26:1 / 3.67:1 on any
// ground, under the 4.5:1 text floor. On the inks it is 5.17:1 / 8.02:1 (pinned in
// theme.contrast.test.ts). Shared on purpose, never behind a card-only prop: the dose
// record and edit-event repaint with the card.
export function adherenceActiveFill(concern: boolean): string {
  return concern ? theme.colorEventSymptomInk : theme.colorAccentInk;
}

function Chip({
  label, active, concern, onPress,
}: {
  label: string;
  active: boolean;
  concern: boolean;
  onPress: () => void;
}) {
  const activeFill = adherenceActiveFill(concern);
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        styles.chipLight,
        active && { backgroundColor: activeFill, borderColor: activeFill },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={CHIP_HITSLOP}
    >
      <ThemedText
        style={[
          styles.chipLabel,
          styles.chipLabelLight,
          active && styles.chipLabelActive,
        ]}
      >
        {label}
      </ThemedText>
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Split, not a single `gap` — see CHIP_HITSLOP above. The column gap is the
    // design's; the row gap clears two wrapped lines' vertical slop.
    columnGap: CHIP_COLUMN_GAP,
    rowGap: CHIP_ROW_GAP,
  },
  readOnlyWrap: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    // See CHIP_HITSLOP — pinned so the tap target's arithmetic is checkable.
    minHeight: CHIP_MIN_HEIGHT,
    justifyContent: 'center',
  },
  chipLight: {
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  chipLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
  },
  chipLabelLight: {
    color: theme.colorTextSecondary,
  },
  chipLabelActive: {
    color: theme.colorTextOnDark,
  },
});
