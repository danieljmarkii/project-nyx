import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { usePetStore } from '../../store/petStore';

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

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function EditPetModal({ visible, onClose }: Props) {
  const { activePet, updatePet } = usePetStore();

  const [name, setName] = useState('');
  const [species, setSpecies] = useState<Species>('dog');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState<Sex>('unknown');
  const [weightStr, setWeightStr] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && activePet) {
      setName(activePet.name);
      setSpecies(activePet.species);
      setBreed(activePet.breed ?? '');
      setSex(activePet.sex);
      setWeightStr(activePet.weight_kg != null ? String(activePet.weight_kg) : '');
      setDob(activePet.date_of_birth ? new Date(activePet.date_of_birth) : null);
      setShowDatePicker(false);
    }
  }, [visible]);

  async function handleSave() {
    if (!activePet || !name.trim()) return;
    setSaving(true);
    try {
      const weight = weightStr.trim() ? parseFloat(weightStr) : null;
      const updates = {
        name: name.trim(),
        species,
        breed: breed.trim() || null,
        sex,
        weight_kg: weight != null && !isNaN(weight) ? weight : null,
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

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
              placeholderTextColor={theme.colorTextSecondary}
            />

            <Text style={styles.label}>Species</Text>
            <View style={styles.chipRow}>
              {SPECIES_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, species === opt.value && styles.chipActive]}
                  onPress={() => setSpecies(opt.value)}
                >
                  <Text style={[styles.chipText, species === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Breed</Text>
            <TextInput
              style={styles.input}
              value={breed}
              onChangeText={setBreed}
              placeholder="e.g. Labrador mix"
              placeholderTextColor={theme.colorTextSecondary}
              autoCapitalize="words"
              returnKeyType="done"
            />

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
                value={dob ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(_e: unknown, date?: Date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (date) setDob(date);
                }}
              />
            )}

            <Text style={styles.label}>Weight (kg)</Text>
            <TextInput
              style={styles.input}
              value={weightStr}
              onChangeText={setWeightStr}
              placeholder="e.g. 12.5"
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
