import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { filterBreeds } from '../../constants/breeds';

// How many rows we render before asking the owner to keep typing. The dog list
// runs to ~290 entries; rendering them all inline inside the profile ScrollView
// is heavy and unscannable. The search box is the real navigation — this cap
// keeps the initial open cheap, and the "keep typing" footer is the visible
// "there's more" cue our picker convention (CLAUDE.md, B-146) requires instead
// of a silently truncated list. Cats (~71) never hit the cap, so their list
// always shows in full.
const MAX_VISIBLE = 80;

interface BreedPickerProps {
  breeds: readonly string[];
  /** Currently selected breed, or '' when none is chosen. */
  value: string;
  onSelect: (breed: string) => void;
  /**
   * Owner picked "Other / not listed" — parent switches to a free-text field.
   * Receives the current search text so a typed-but-unmatched breed carries over
   * instead of making the owner retype it.
   */
  onSelectOther: (seed: string) => void;
}

export function BreedPicker({ breeds, value, onSelect, onSelectOther }: BreedPickerProps) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => filterBreeds(breeds, query), [breeds, query]);
  const visible = matches.slice(0, MAX_VISIBLE);
  const overflow = matches.length - visible.length;

  return (
    <View>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder={`Search ${breeds.length} breeds`}
        placeholderTextColor={theme.colorTextSecondary}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Search breeds"
      />

      <View style={styles.list} accessibilityRole="radiogroup">
        {/* Escape hatch pinned to the TOP so a rescue/mixed-breed owner reaches
            free text without scrolling past a long (up to ~290-entry) list —
            B-261/CUL-137. Always reachable, even with zero search matches: no
            owner is ever blocked by a breed we didn't list. The muted "type it
            in" hint (restored from onboarding mockup 08) frames it as the
            self-describe option, so it reads as an escape hatch rather than a
            first breed — and the pinned catch-alls ("Mixed breed" /
            "Domestic Shorthair") sit on the very next rows, still no scroll. */}
        <TouchableOpacity
          style={styles.item}
          onPress={() => onSelectOther(query.trim())}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Other / not listed, type it in"
        >
          <Text style={styles.otherText}>Other / not listed</Text>
          <Text style={styles.otherHint}>type it in</Text>
        </TouchableOpacity>

        {visible.map((b) => {
          const selected = value === b;
          return (
            <TouchableOpacity
              key={b}
              style={[styles.item, selected && styles.itemSelected]}
              onPress={() => onSelect(b)}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityLabel={b}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.itemText, selected && styles.itemTextSelected]}>{b}</Text>
              {selected && <Text style={styles.itemCheck}>✓</Text>}
            </TouchableOpacity>
          );
        })}

        {matches.length === 0 && (
          <View style={styles.item}>
            <Text style={styles.emptyText}>
              No breeds match “{query.trim()}”. Tap “Other / not listed” above to type it in.
            </Text>
          </View>
        )}

        {overflow > 0 && (
          <View style={styles.hintRow}>
            <Text style={styles.hintText}>Keep typing to see {overflow} more…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 12pt vertical padding matches the sibling name/weight inputs in EditPetModal
  // so the search box sits flush with the rest of the form.
  search: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    backgroundColor: theme.colorNeutralLight,
    marginTop: 4,
  },
  list: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    overflow: 'hidden',
    marginTop: theme.space1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: theme.space2,
    // Guarantee the 44pt tap-target floor (docs/personas.md) at the row itself —
    // for a contiguous list, sizing the row is cleaner than hitSlop, which would
    // overlap adjacent rows' touch areas.
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  itemSelected: {
    backgroundColor: theme.colorNeutralDark,
  },
  itemText: {
    flex: 1,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  // The "Other" label deliberately drops the flex:1 the breed rows use — it must
  // sit hard-left so its "type it in" hint follows inline (mockup 08), not get
  // pushed to the far edge like the breed rows' selected ✓.
  otherText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  otherHint: {
    marginLeft: theme.space1,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  itemTextSelected: {
    color: theme.colorTextOnDark,
    fontWeight: theme.fontWeightMedium,
  },
  itemCheck: {
    fontSize: theme.textMD,
    color: theme.colorTextOnDark,
  },
  emptyText: {
    flex: 1,
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  hintRow: {
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    backgroundColor: theme.colorSurfaceSubtle,
  },
  hintText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
});
