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
//
// B-351 PR 3 / D9 — the typed escape NORMALIZES ON COMMIT. An owner typing
// "Buffalo" used to store `buffalo` while an AI read of the same label stored
// `bison`: one animal, two keys, exposure split across them and each under the
// effective-n floor (B-412). The escape is a WRITE path, so it now runs through
// normalizeExtractedProtein — but on blur/submit, never per keystroke, and never
// silently: the matching chip becomes selected (the change is visible IN the
// control) and a quiet persistent note names what was typed and what was saved.
import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { ChipGroup, ChipGroupOption } from '../ui/ChipGroup';
import {
  COMMON_PROTEINS,
  canonicalizeProtein,
  normalizeExtractedProtein,
} from '../../lib/protein';
import { NormalizedProteinNote, proteinNoteFor, type ProteinRewrite } from './proteinNote';

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

  // The D9 rewrite disclosure, if the owner's last committed "Other" value was
  // normalized. Held as state but READ through a derived guard: the note only
  // renders while the value it explains is still the one in the field, so it
  // self-clears on any later tap or keystroke with no effect and no staleness.
  const [rewrite, setRewrite] = useState<ProteinRewrite | null>(null);
  const activeRewrite = rewrite && canon === rewrite.saved ? rewrite : null;

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

  // D9 — resolve the typed escape on COMMIT (blur / submit), never per
  // keystroke: normalizing mid-word would thrash the field while someone is
  // still typing "bison".
  function handleOtherCommit() {
    const typed = (value ?? '').trim();
    if (!typed) return;
    const normalized = normalizeExtractedProtein(typed);
    // Nothing usable ("fresh", "meal") — leave the owner's text exactly as typed
    // rather than wiping it. Storing a vaguer key is the safe direction; silently
    // emptying a field someone just filled is not, and it is not what D9 asked
    // for (its scope is aliased/stripped terms).
    if (normalized == null) return;
    setRewrite(proteinNoteFor(typed, normalized));
    if (normalized !== value) onChange(normalized);
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
          // Raw per keystroke so nothing an owner types is ever lost; the
          // canonical value resolves in handleOtherCommit below.
          onChangeText={(t) => onChange(t.trim().length ? t : null)}
          onBlur={handleOtherCommit}
          onSubmitEditing={handleOtherCommit}
          placeholder="Name the protein"
          placeholderTextColor={theme.colorTextTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Other protein"
        />
      )}
      {/* Renders whether or not the field is still open — a commit that lands a
          COMMON protein ("chicken liver" → Chicken) selects the chip and closes
          the field, and that is exactly the rewrite most in need of explaining. */}
      {activeRewrite && <NormalizedProteinNote rewrite={activeRewrite} />}
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
