import { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { breedsForSpecies, resolveBreedFieldState } from '../../constants/breeds';
import { ChipGroup } from '../ui/ChipGroup';
import { FieldLabel } from '../ui/FieldLabel';
import { Header } from '../ui/Header';
import { HeaderAction } from '../ui/HeaderAction';
import { PickerRow } from '../ui/PickerRow';
import { TextField } from '../ui/TextField';
import { TextLink } from '../ui/TextLink';
import { ThemedText } from '../ui/ThemedText';
import { BreedPicker } from '../pet/BreedPicker';
import { supabase } from '../../lib/supabase';
import { kgToLbs, resolveWeightFieldSave } from '../../lib/weightUnits';
import { dateToYmd, formatBirthdayField, resolveDobPrecisionOnSave, DobPrecision } from '../../lib/age';
import { usePetStore, Pet } from '../../store/petStore';

type Species = 'dog' | 'cat' | 'other';
type Sex = 'male' | 'female' | 'unknown';

const SPECIES_OPTIONS: { value: Species; label: string }[] = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'other', label: 'Other' },
];

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unknown', label: 'Unknown' },
];

// kg<->lbs conversion lives in lib/weight.ts now (B-186) so the log step and this
// edit form share one rounding rule and can't drift. The breed field-state seed
// (in-list vs free-text) lives in resolveBreedFieldState (constants/breeds.ts),
// shared with the onboarding breed step (B-251 PR 8) so the rule has one home.

// Parse a stored 'YYYY-MM-DD' into a LOCAL Date (midnight local), so the picker's
// components and the dateToYmd round-trip on save match the stored day exactly —
// `new Date('YYYY-MM-DD')` parses as UTC and can render/save a day off in some
// timezones. Null/malformed → null.
function parseDobLocal(dob: string | null): Date | null {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Round P9: the profile weight is not a weigh-in. */
export function profileWeightNote(petName: string): string {
  return `This is ${petName}’s profile weight. To track a change over time, log a weigh-in.`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function EditPetModal({ visible, onClose }: Props) {
  const { activePet, updatePet } = usePetStore();

  const [name, setName] = useState('');
  // The name the form was seeded with: the pet the note under the weight names, so a
  // rename being typed, or a pet flip under the open form, never changes whose it says.
  const [seededName, setSeededName] = useState('');
  const [species, setSpecies] = useState<Species>('dog');
  const [breed, setBreed] = useState('');
  const [isOtherBreed, setIsOtherBreed] = useState(false);
  const [showBreedPicker, setShowBreedPicker] = useState(false);
  const [sex, setSex] = useState<Sex>('unknown');
  const [weightStr, setWeightStr] = useState('');
  // The stored weight the field was seeded from. The field shows it rounded to 0.1 lb,
  // so saving the field back would move it (CUL-1283); an untouched field saves nothing.
  const [seededWeightKg, setSeededWeightKg] = useState<number | null>(null);
  const [dob, setDob] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Precision the DOB was loaded with, and whether the owner has since picked a
  // concrete date on the calendar (B-251 PR 9). A DOB entered as an age at
  // onboarding is 'approximate' — an anchored stand-in, not a witnessed birthday —
  // so it must never render as a precise date here. The moment the owner touches
  // the picker they ARE asserting a real calendar date, which flips it to 'exact'.
  const [dobPrecision, setDobPrecision] = useState<DobPrecision>('exact');
  const [dobTouched, setDobTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  // The pet this form was seeded FOR. Unlike the log paths (which stamp the
  // pet active at write time, spec §6), an edit must land on the pet whose
  // values fill the form — if the active pet flips while the modal is open
  // (possible once the switcher ships), saving Pixel's fields onto Juniper's
  // row would be a cross-pet overwrite. The save guard below refuses instead.
  const [editingPetId, setEditingPetId] = useState<string | null>(null);

  useEffect(() => {
    if (visible && activePet) {
      setEditingPetId(activePet.id);
      setName(activePet.name);
      setSeededName(activePet.name);
      setSpecies(activePet.species);
      const { breed: b, isOther } = resolveBreedFieldState(activePet.breed, activePet.species);
      setBreed(b);
      setIsOtherBreed(isOther);
      setShowBreedPicker(false);
      setSex(activePet.sex);
      setWeightStr(activePet.weight_kg != null ? kgToLbs(activePet.weight_kg) : '');
      setSeededWeightKg(activePet.weight_kg);
      // Parse the stored 'YYYY-MM-DD' to a LOCAL date so its components (and the
      // dateToYmd round-trip on save) match the stored day exactly, timezone-agnostic.
      setDob(parseDobLocal(activePet.date_of_birth));
      setDobPrecision(activePet.date_of_birth_precision);
      setDobTouched(false);
      setShowDatePicker(false);
    }
  }, [visible]);

  function handleSpeciesChange(next: Species) {
    setSpecies(next);
    setBreed('');
    setIsOtherBreed(false);
    setShowBreedPicker(false);
  }

  function handleBreedSelect(selected: string) {
    setBreed(selected);
    setIsOtherBreed(false);
    setShowBreedPicker(false);
  }

  function handleBreedOther(seed: string) {
    // Carry a typed-but-unmatched search term into the free-text field so the
    // owner doesn't retype it (BreedPicker passes its current query).
    setBreed(seed);
    setIsOtherBreed(true);
    setShowBreedPicker(false);
  }

  async function handleSave() {
    if (!activePet || !name.trim()) return;
    if (activePet.id !== editingPetId) {
      // Active pet changed under an open form — never save across the flip
      // (updatePet patches the ACTIVE pet, and the row update would target it
      // too). Unreachable until the switcher ships; defensive for PR 3.
      console.warn('[EditPetModal] active pet changed mid-edit; discarding save');
      onClose();
      return;
    }
    setSaving(true);
    try {
      // An untouched weight field omits weight_kg entirely (resolveWeightFieldSave):
      // the stored value stays exact, and the store patch below leaves it alone too.
      const weight = resolveWeightFieldSave(weightStr, seededWeightKg);
      const updates: Partial<Pet> = {
        name: name.trim(),
        species,
        breed: breed.trim() || null,
        sex,
        ...(weight.write ? { weight_kg: weight.weightKg } : {}),
        // dateToYmd (local components) round-trips the picked day exactly — unlike
        // toISOString(), which shifts a local-midnight date across the UTC boundary.
        date_of_birth: dob ? dateToYmd(dob) : null,
        // Honesty write (resolveDobPrecisionOnSave): a freshly picked date is
        // 'exact'; an untouched approximate DOB stays approximate (editing weight
        // must not silently promote it to a witnessed birthday); a null DOB
        // preserves the loaded value rather than asserting anything.
        date_of_birth_precision: savePrecision,
      };

      const { error } = await supabase
        .from('pets')
        .update(updates)
        .eq('id', activePet.id);

      if (error) throw error;

      updatePet(updates);
      onClose();
    } catch (e) {
      console.error('[EditPetModal] save failed:', e);
      Alert.alert('Could not save', 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const breeds = breedsForSpecies(species);
  const hasBreedList = breeds.length > 0;
  const breedDisplayValue = breed.trim() || null;
  const canSave = name.trim().length > 0;
  // The precision this save would persist (pure, unit-tested): a witnessed pick →
  // 'exact', else the loaded precision preserved. The field label reflects it too:
  // 'exact' → the full date, 'approximate' → "About {Month YYYY}" (no fabricated
  // day) — the honesty contract (lib/age).
  const savePrecision: DobPrecision = resolveDobPrecisionOnSave(dob != null, dobTouched, dobPrecision);
  const dobLabel = formatBirthdayField(dob ? dateToYmd(dob) : null, savePrecision);
  const dobIsEstimated = dob != null && savePrecision === 'approximate';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <Header
          title="Edit profile"
          left={<HeaderAction label="Cancel" tone="quiet" onPress={onClose} />}
          right={
            <HeaderAction
              label="Save"
              onPress={handleSave}
              disabled={!canSave}
              disabledReason="add a name first"
              working={saving}
              testID="edit-pet-save"
            />
          }
        />

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
            />

            <View>
              <FieldLabel label="Species" />
              <ChipGroup
                options={SPECIES_OPTIONS}
                value={species}
                onChange={(next) => { if (next) handleSpeciesChange(next as Species); }}
                allowDeselect={false}
                variant="default"
                accessibilityLabel="Species"
              />
            </View>

            {hasBreedList && !isOtherBreed ? (
              <View>
                <PickerRow
                  label="Breed"
                  value={breedDisplayValue}
                  placeholder="Select breed"
                  actionLabel={showBreedPicker ? 'Done' : 'Change'}
                  onPress={() => setShowBreedPicker(!showBreedPicker)}
                />
                {showBreedPicker && (
                  <BreedPicker
                    breeds={breeds}
                    value={breed}
                    onSelect={handleBreedSelect}
                    onSelectOther={handleBreedOther}
                  />
                )}
              </View>
            ) : (
              /* other species or "Other" selected from list — text input */
              <View>
                <TextField
                  label="Breed"
                  value={breed}
                  onChangeText={setBreed}
                  placeholder={hasBreedList ? 'Type breed name' : 'e.g. Rabbit, Guinea pig'}
                  autoCapitalize="words"
                  returnKeyType="done"
                  autoFocus={isOtherBreed}
                />
                {hasBreedList && (
                  <TextLink
                    label="Back to breed list"
                    tone="quiet"
                    variant="caption"
                    onPress={() => { setIsOtherBreed(false); setBreed(''); }}
                  />
                )}
              </View>
            )}

            <View>
              <FieldLabel label="Sex" />
              <ChipGroup
                options={SEX_OPTIONS}
                value={sex}
                onChange={(next) => { if (next) setSex(next as Sex); }}
                allowDeselect={false}
                variant="default"
                accessibilityLabel="Sex"
              />
            </View>

            <View>
              <PickerRow
                label="Date of birth"
                value={dobLabel}
                placeholder="Not set"
                actionLabel={showDatePicker ? 'Done' : 'Change'}
                onPress={() => setShowDatePicker(!showDatePicker)}
              />
              {dobIsEstimated && !showDatePicker && (
                // Explain why an approximate DOB shows as a month/year, not a day —
                // and that picking a date makes it a real birthday (honesty, PR 9).
                <ThemedText variant="caption" style={styles.note}>Estimated from age — pick a date to set an exact birthday.</ThemedText>
              )}
              {dob && !showDatePicker && (
                <TextLink label="Clear date" tone="quiet" variant="caption" onPress={() => setDob(null)} />
              )}
              {showDatePicker && (
                <DateTimePicker
                  value={dob ?? new Date(2020, 0, 1)}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={(_e: unknown, date?: Date) => {
                    if (Platform.OS === 'android') setShowDatePicker(false);
                    // A concrete calendar pick is a witnessed birthday → 'exact'.
                    if (date) { setDob(date); setDobTouched(true); }
                  }}
                />
              )}
            </View>

            <View>
              <TextField
                label="Weight (lbs)"
                value={weightStr}
                onChangeText={setWeightStr}
                placeholder="e.g. 28"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
              {/* Round P9 — editing this number writes no weigh-in, so the Weight card's
                  trend never sees it; an owner correcting it here should not believe
                  they logged one. Named for the pet the form was seeded for. */}
              <ThemedText variant="caption" style={styles.note}>{profileWeightNote(seededName)}</ThemedText>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  flex: {
    flex: 1,
  },
  form: {
    padding: theme.space3,
    paddingBottom: theme.space6,
    gap: theme.space2,
  },
  note: {
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
});
