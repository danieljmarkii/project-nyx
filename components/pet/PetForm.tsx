import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { theme } from '../../constants/theme';
import { FilterChip } from '../ui/FilterChip';
import { SectionLabel } from '../ui/SectionLabel';

export type PetFormSpecies = 'dog' | 'cat' | 'other';

const SPECIES_OPTIONS: { value: PetFormSpecies; label: string }[] = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'other', label: 'Other' },
];

interface PetFormProps {
  title: string;
  subtitle: string;
  submitLabel: string;
  loading: boolean;
  onSubmit: (name: string, species: PetFormSpecies) => void;
}

// Shared name + species capture used by onboarding (account-coupled wrapper in
// app/onboarding/pet.tsx) and the add-pet route (multi-pet v1, spec §3.2). The
// form owns field state and validity; the wrapper owns the insert + routing.
export function PetForm({ title, subtitle, submitLabel, loading, onSubmit }: PetFormProps) {
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<PetFormSpecies | null>(null);

  const canSubmit = name.trim().length > 0 && species !== null;

  function handleSubmit() {
    if (!canSubmit || species === null || loading) return;
    onSubmit(name.trim(), species);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <SectionLabel label="Name" style={styles.fieldLabel} />
        <TextInput
          style={styles.input}
          placeholder="e.g. Luna"
          placeholderTextColor={theme.colorTextSecondary}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="done"
        />

        <SectionLabel label="Species" style={styles.fieldLabel} />
        <View style={styles.chipRow}>
          {SPECIES_OPTIONS.map((opt) => (
            <View key={opt.value} style={styles.chipWrap}>
              <FilterChip
                label={opt.label}
                active={species === opt.value}
                onPress={() => setSpecies(opt.value)}
                variant="filled"
              />
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>{submitLabel}</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.space3,
  },
  title: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    marginBottom: theme.space1,
    letterSpacing: theme.trackingTight,
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: 22,
    marginBottom: theme.space4,
  },
  fieldLabel: {
    marginBottom: theme.space1,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: 13,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    backgroundColor: theme.colorSurface,
    marginBottom: theme.space3,
  },
  chipRow: {
    flexDirection: 'row',
    gap: theme.space1,
    marginBottom: theme.space4,
  },
  chipWrap: {
    flex: 1,
  },
  button: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#fff',
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
  },
});
