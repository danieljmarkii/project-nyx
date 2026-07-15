// "Primary protein" picker (B-332 / spec §9 T3-A). A wrapping single-select
// ChipGroup of the common canonical proteins (never an h-scroll chip row —
// house rule B-146) plus an "Other" typed escape. The offered set lives in
// lib/protein.ts (COMMON_PROTEINS), so the picker and the ranking/correlation
// core share one source of truth.
//
// Correlation parity is the load-bearing property: an owner-picked value and an
// AI-extracted value both key through the SAME canonicalizeProtein() on read
// (lib/analytics.ts, generate-signal/detection.ts) — a chip stores the canonical
// value directly, and an "Other" value is stored raw and canonicalized on read,
// exactly like an AI label. No new correlation edge case is introduced.
//
// The component is deliberately CONTROLLED and side-effect-free: it never writes
// a value the owner didn't choose. It reseeds cleanly from `value` (so an AI
// completion landing via realtime shows the right chip), and it only calls
// onChange in response to a tap or keystroke — which is what lets both host
// screens treat "onChange fired" as the owner having touched the field, and so
// avoid null-clobbering an AI-hydrated protein.
import { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { ChipGroup, ChipGroupOption } from '../ui/ChipGroup';
import { COMMON_PROTEINS, canonicalizeProtein } from '../../lib/protein';

// Sentinel chip value for the typed escape. Not a real protein, never stored.
const OTHER = '__other__';

const OPTIONS: ChipGroupOption[] = [
  ...COMMON_PROTEINS.map((p) => ({
    value: p,
    label: p.charAt(0).toUpperCase() + p.slice(1),
  })),
  { value: OTHER, label: 'Other' },
];

interface Props {
  // The raw stored protein string (as it sits in food_items.primary_protein), or
  // null when unset. The picker highlights a chip by canonicalizing this value —
  // it never rewrites it, so a value that already matches a chip stays byte-equal
  // until the owner actually taps.
  value: string | null;
  onChange: (next: string | null) => void;
  accessibilityLabel?: string;
}

export function ProteinPicker({ value, onChange, accessibilityLabel }: Props) {
  // Does the current value map to one of the offered chips?
  const canon = canonicalizeProtein(value);
  const matchedCommon =
    canon && COMMON_PROTEINS.includes(canon) ? canon : null;
  // A stored value that ISN'T one of the common chips is a custom protein — the
  // "Other" field should show it. (`canon === null` means junk/placeholder like
  // "null" — treat as unset, not custom.) Derived fresh from `value` every render
  // so a reseed (e.g. a re-run extraction landing a common protein) is reflected
  // immediately — never cached in state that could go stale.
  const hasCustomValue = canon !== null && matchedCommon === null;

  // Transient flag for the one window `value` alone can't express: the owner
  // tapped "Other" and hasn't typed yet (value is still null). Initialised false
  // — the custom-value display is driven purely by the derived `hasCustomValue`,
  // NOT by this flag, so it can never seed a stale-open field. It is reset the
  // moment a common chip is chosen, and it is IGNORED whenever a common chip
  // matches (below), so an external reseed to a common protein can never leave a
  // stray "Other" field mounted alongside the correct chip.
  const [otherTapped, setOtherTapped] = useState(false);

  // The "Other" field shows only when no common chip matches AND (the owner is
  // mid-entry OR there's a custom value). Gating on `matchedCommon === null`
  // makes it self-correcting: a common value winning always hides the field.
  const otherActive = matchedCommon === null && (otherTapped || hasCustomValue);
  const selected: string | null = matchedCommon ?? (otherActive ? OTHER : null);

  function handleChipChange(next: string | null) {
    if (next === OTHER) {
      setOtherTapped(true);
      // Preserve custom text if some already exists; otherwise emit null until
      // the owner types (so an opened-but-empty "Other" is a real "unset").
      onChange(hasCustomValue ? value : null);
    } else {
      // A common canonical value, or null on a deselect tap.
      setOtherTapped(false);
      onChange(next);
    }
  }

  return (
    <View style={styles.group}>
      <ChipGroup
        options={OPTIONS}
        value={selected}
        onChange={handleChipChange}
        // Protein is optional (many treats/legacy rows have none) — a second tap
        // clears it, unlike the required food Format picker.
        allowDeselect
        accessibilityLabel={accessibilityLabel ?? 'Primary protein'}
      />
      {otherActive && (
        <TextInput
          style={styles.otherInput}
          value={value ?? ''}
          onChangeText={(t) => onChange(t.trim().length ? t : null)}
          placeholder="Name the protein"
          placeholderTextColor={theme.colorTextTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Other protein"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: theme.space2,
  },
  otherInput: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    height: 48,
  },
});
