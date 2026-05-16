import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
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

const DOG_BREEDS = [
  'Mixed breed',
  'Labrador Retriever',
  'French Bulldog',
  'Golden Retriever',
  'German Shepherd',
  'Bulldog',
  'Poodle',
  'Beagle',
  'Rottweiler',
  'Dachshund',
  'Pembroke Welsh Corgi',
  'Australian Shepherd',
  'Yorkshire Terrier',
  'Boxer',
  'Cavalier King Charles Spaniel',
  'Doberman Pinscher',
  'Great Dane',
  'Miniature Schnauzer',
  'Siberian Husky',
  'Boston Terrier',
  'Bernese Mountain Dog',
  'Shih Tzu',
  'Havanese',
  'Border Collie',
  'Pit Bull Terrier',
];

const CAT_BREEDS = [
  'Domestic Shorthair',
  'Maine Coon',
  'Ragdoll',
  'Bengal',
  'British Shorthair',
  'Persian',
  'Siamese',
  'Abyssinian',
  'Scottish Fold',
  'Sphynx',
  'Russian Blue',
  'Norwegian Forest Cat',
  'American Shorthair',
  'Birman',
  'Burmese',
];

function breedsForSpecies(s: Species): string[] {
  if (s === 'dog') return DOG_BREEDS;
  if (s === 'cat') return CAT_BREEDS;
  return [];
}

function kgToLbs(kg: number): string {
  return String(Math.round(kg * 2.20462 * 10) / 10);
}

function lbsToKg(lbs: number): number {
  return Math.round((lbs / 2.20462) * 100) / 100;
}

function initBreedState(pet: Pet): { breed: string; isOtherBreed: boolean } {
  if (!pet.breed) return { breed: '', isOtherBreed: false };
  if (pet.species === 'other') return { breed: pet.breed, isOtherBreed: true };
  const list = breedsForSpecies(pet.species);
  if (list.includes(pet.breed)) return { breed: pet.breed, isOtherBreed: false };
  return { breed: pet.breed, isOtherBreed: true };
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function EditPetModal({ visible, onClose }: Props) {
  const { activePet, updatePet } = usePetStore();

  const [name, setName] = useState('');
  const [species, setSpecies] = useState<Species>('dog');
  const [breed, setBreed] = useState('');
  const [isOtherBreed, setIsOtherBreed] = useState(false);
  const [showBreedPicker, setShowBreedPicker] = useState(false);
  const [sex, setSex] = useState<Sex>('unknown');
  const [weightStr, setWeightStr] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && activePet) {
      setName(activePet.name);
      setSpecies(activePet.species);
      const { breed: b, isOtherBreed: isOther } = initBreedState(activePet);
      setBreed(b);
      setIsOtherBreed(isOther);
      setShowBreedPicker(false);
      setSex(activePet.sex);
      setWeightStr(activePet.weight_kg != null ? kgToLbs(activePet.weight_kg) : '');
      setDob(activePet.date_of_birth ? new Date(activePet.date_of_birth) : null);
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

  function handleBreedOther() {
    setBreed('');
    setIsOtherBreed(true);
    setShowBreedPicker(false);
  }

  async function handleSave() {
    if (!activePet || !name.trim()) return;
    setSaving(true);
    try {
      const lbs = weightStr.trim() ? parseFloat(weightStr) : null;
      const updates = {
        name: name.trim(),
        species,
        breed: breed.trim() || null,
        sex,
        weight_kg: lbs != null && !isNaN(lbs) ? lbsToKg(lbs) : null,
        date_of_birth: dob ? dob.toISOString().split('T')[0] : null,
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving || !canSave} hitSlop={8}>
            {saving
              ? <ActivityIndicator size="small" color={theme.colorAccent} />
              : <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

            {/* Name */}
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
              placeholderTextColor={theme.colorTextSecondary}
            />

            {/* Species */}
            <Text style={styles.label}>Species</Text>
            <View style={styles.chipRow}>
              {SPECIES_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, species === opt.value && styles.chipActive]}
                  onPress={() => handleSpeciesChange(opt.value)}
                >
                  <Text style={[styles.chipText, species === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Breed */}
            <Text style={styles.label}>Breed</Text>
            {hasBreedList && !isOtherBreed ? (
              <>
                <TouchableOpacity
                  style={styles.fieldBtn}
                  onPress={() => setShowBreedPicker(!showBreedPicker)}
                  activeOpacity={0.7}
                >
                  <Text style={breedDisplayValue ? styles.fieldBtnText : styles.fieldBtnPlaceholder}>
                    {breedDisplayValue ?? 'Select breed'}
                  </Text>
                  <Text style={styles.changeLabel}>{showBreedPicker ? 'Done' : 'Change'}</Text>
                </TouchableOpacity>
                {showBreedPicker && (
                  <View style={styles.breedList}>
                    {breeds.map((b) => (
                      <TouchableOpacity
                        key={b}
                        style={[styles.breedItem, breed === b && styles.breedItemSelected]}
                        onPress={() => handleBreedSelect(b)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.breedItemText, breed === b && styles.breedItemTextSelected]}>
                          {b}
                        </Text>
                        {breed === b && <Text style={styles.breedItemCheck}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.breedItem}
                      onPress={handleBreedOther}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.breedItemText}>Other / not listed</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              /* other species or "Other" selected from list — text input */
              <>
                <TextInput
                  style={styles.input}
                  value={breed}
                  onChangeText={setBreed}
                  placeholder={hasBreedList ? 'Type breed name' : 'e.g. Rabbit, Guinea pig'}
                  placeholderTextColor={theme.colorTextSecondary}
                  autoCapitalize="words"
                  returnKeyType="done"
                  autoFocus={isOtherBreed}
                />
                {hasBreedList && (
                  <TouchableOpacity
                    onPress={() => { setIsOtherBreed(false); setBreed(''); }}
                    style={styles.clearBtn}
                    hitSlop={8}
                  >
                    <Text style={styles.clearBtnText}>Back to breed list</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Sex */}
            <Text style={styles.label}>Sex</Text>
            <View style={styles.chipRow}>
              {SEX_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, sex === opt.value && styles.chipActive]}
                  onPress={() => setSex(opt.value)}
                >
                  <Text style={[styles.chipText, sex === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Date of birth */}
            <Text style={styles.label}>Date of birth</Text>
            <TouchableOpacity
              style={styles.fieldBtn}
              onPress={() => setShowDatePicker(!showDatePicker)}
              activeOpacity={0.7}
            >
              <Text style={dob ? styles.fieldBtnText : styles.fieldBtnPlaceholder}>
                {dob
                  ? dob.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
                  : 'Not set'}
              </Text>
              <Text style={styles.changeLabel}>{showDatePicker ? 'Done' : 'Change'}</Text>
            </TouchableOpacity>
            {dob && !showDatePicker && (
              <TouchableOpacity onPress={() => setDob(null)} style={styles.clearBtn} hitSlop={8}>
                <Text style={styles.clearBtnText}>Clear date</Text>
              </TouchableOpacity>
            )}
            {showDatePicker && (
              <DateTimePicker
                value={dob ?? new Date(2020, 0, 1)}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_e: unknown, date?: Date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (date) setDob(date);
                }}
              />
            )}

            {/* Weight */}
            <Text style={styles.label}>Weight (lbs)</Text>
            <TextInput
              style={styles.input}
              value={weightStr}
              onChangeText={setWeightStr}
              placeholder="e.g. 28"
              placeholderTextColor={theme.colorTextSecondary}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  cancelText: {
    fontSize: 16,
    color: theme.colorTextSecondary,
  },
  saveText: {
    fontSize: 16,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorAccent,
  },
  saveTextDisabled: {
    opacity: 0.4,
  },
  form: {
    padding: theme.space3,
    paddingBottom: theme.space6,
    gap: theme.space1,
  },
  label: {
    fontSize: 12,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: theme.space2,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colorTextPrimary,
    backgroundColor: theme.colorNeutralLight,
  },
  chipRow: {
    flexDirection: 'row',
    gap: theme.space1,
  },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorNeutralLight,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: theme.colorNeutralDark,
    borderColor: theme.colorNeutralDark,
  },
  chipText: {
    fontSize: 14,
    color: theme.colorTextSecondary,
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: theme.fontWeightMedium,
  },
  fieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    backgroundColor: theme.colorNeutralLight,
  },
  fieldBtnText: {
    fontSize: 16,
    color: theme.colorTextPrimary,
  },
  fieldBtnPlaceholder: {
    fontSize: 16,
    color: theme.colorTextSecondary,
  },
  changeLabel: {
    fontSize: 14,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  breedList: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    overflow: 'hidden',
    marginTop: 4,
  },
  breedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  breedItemSelected: {
    backgroundColor: theme.colorNeutralDark,
  },
  breedItemText: {
    flex: 1,
    fontSize: 15,
    color: theme.colorTextPrimary,
  },
  breedItemTextSelected: {
    color: '#fff',
    fontWeight: theme.fontWeightMedium,
  },
  breedItemCheck: {
    fontSize: 15,
    color: '#fff',
  },
  clearBtn: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  clearBtnText: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    textDecorationLine: 'underline',
  },
});
