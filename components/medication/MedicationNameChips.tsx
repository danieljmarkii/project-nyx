// B-160 — tap-to-FILL drug-NAME suggestions for the medication-details free-text
// field (app/medication-capture.tsx step='edit'/'confirm' + the regimen modal).
//
// Deliberately NOT ChipGroup. ChipGroup is a single-select radio group — its chips
// hold a persistent selection. A name chip is the opposite: it FILLS the text field
// and the whole row then vanishes (the screen only mounts this while the name is
// empty), so it is a shortcut, not a selection. That makes a horizontal, scrollable
// row of plain FilterChips the right shape, never a radio group. It's an OPEN-ended
// suggestion set (the field still accepts any free text), so horizontal scroll is
// correct here — but it carries the B-146 "never hide options with no peek" cue: a
// right-edge fade signalling "there's more →" (the same idiom as history.tsx's lens
// row). NAMES ONLY — strength never gets value chips (lib/medications §3 / B-160 §3).
//
// Tapping a chip calls onPick(name) and nothing else. The caller routes that through
// the SAME change handler the keyboard uses (setGenericName / onChangeDrugName), so
// every existing invariant holds — the §6.5 strength gate is untouched (it keys on
// strength, not name) and the modal's unlink-on-edit still clears a stale
// medication_item_id. It creates no medication_items row and links nothing; the
// library stays organically built.
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FilterChip } from '../ui/FilterChip';
import { theme } from '../../constants/theme';
import { commonMedicationsForSpecies } from '../../lib/medications';

interface Props {
  // The active pet's species — drives ordering so the species-relevant drugs lead
  // the visible peek. 'other'/null/undefined still render every drug (a union).
  species: 'dog' | 'cat' | 'other' | null | undefined;
  onPick: (name: string) => void;
}

export function MedicationNameChips({ species, onPick }: Props) {
  const options = commonMedicationsForSpecies(species);
  return (
    <View>
      <Text style={styles.helper}>Tap a common one below, or type the name from the label.</Text>
      <View style={styles.row}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          // The field above is focused, so the keyboard is up — without this a first
          // tap would only dismiss the keyboard instead of filling the name.
          keyboardShouldPersistTaps="handled"
        >
          {options.map((m) => (
            <FilterChip
              key={m.name}
              label={m.name}
              active={false} // a fill shortcut, never a persistent selection
              variant="default"
              onPress={() => onPick(m.name)}
            />
          ))}
        </ScrollView>
        {/* Right-edge "there's more →" cue. The 0-alpha stop is white's zero-alpha
            form, NOT 'transparent' (RN fades 'transparent' through black and dirties
            the edge). Fades to colorSurface — both host surfaces (capture screen +
            regimen modal containers) are colorSurface. pointerEvents none so taps
            reach the chips beneath. */}
        <LinearGradient
          colors={['rgba(255,255,255,0)', theme.colorSurface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fade}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  helper: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
    marginBottom: theme.space1,
  },
  row: {
    position: 'relative',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    // Clear the 28px fade so the last chip scrolls fully into the open.
    paddingRight: theme.space3,
    // Vertical breathing room; FilterChip's own hitSlop clears the 44pt floor.
    paddingVertical: theme.spaceMicro,
  },
  fade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
  },
});
