import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { usePetStore } from '../../store/petStore';
import { theme } from '../../constants/theme';

type Species = 'dog' | 'cat' | 'other';

const SPECIES_OPTIONS: { value: Species; label: string }[] = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'other', label: 'Other' },
];

export default function OnboardingPetScreen() {
  const { user } = useAuthStore();
  const { setActivePet, setOnboarded } = usePetStore();

  const [name, setName] = useState('');
  const [species, setSpecies] = useState<Species | null>(null);
  const [loading, setLoading] = useState(false);

  const canContinue = name.trim().length > 0 && species !== null;

  async function handleContinue() {
    if (!canContinue || !user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('pets')
      .insert({
        user_id: user.id,
        name: name.trim(),
        species,
      })
      .select()
      .single();

    setLoading(false);

    if (error || !data) {
      Alert.alert('Something went wrong', error?.message ?? 'Please try again.');
      return;
    }

    setActivePet(data);
    setOnboarded(true);
    router.push('/onboarding/food');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Tell us about your pet.</Text>
        <Text style={styles.subtitle}>
          This is all we need to get started. Everything else can be added later.
        </Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Luna"
          placeholderTextColor={theme.colorTextSecondary}
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
        />

        <Text style={styles.label}>Species</Text>
        <View style={styles.speciesRow}>
          {SPECIES_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.speciesBtn, species === opt.value && styles.speciesBtnActive]}
              onPress={() => setSpecies(opt.value)}
            >
              <Text style={[styles.speciesBtnText, species === opt.value && styles.speciesBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Continue</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: theme.space3 },
  title: {
    fontSize: 28, fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark, marginBottom: theme.space1,
  },
  subtitle: {
    fontSize: 15, color: theme.colorTextSecondary,
    lineHeight: 22, marginBottom: theme.space4,
  },
  label: {
    fontSize: 13, fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: theme.space1,
  },
  input: {
    borderWidth: 1, borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall, padding: theme.space2,
    fontSize: 16, color: theme.colorTextPrimary,
    backgroundColor: theme.colorSurface, marginBottom: theme.space3,
  },
  speciesRow: { flexDirection: 'row', gap: theme.space1, marginBottom: theme.space4 },
  speciesBtn: {
    flex: 1, paddingVertical: theme.space2,
    borderRadius: theme.radiusSmall, borderWidth: 1,
    borderColor: theme.colorBorder, backgroundColor: theme.colorSurface,
    alignItems: 'center',
  },
  speciesBtnActive: {
    backgroundColor: theme.colorNeutralDark, borderColor: theme.colorNeutralDark,
  },
  speciesBtnText: { fontSize: 15, color: theme.colorTextSecondary },
  speciesBtnTextActive: { color: '#fff', fontWeight: theme.fontWeightMedium },
  button: {
    backgroundColor: theme.colorNeutralDark, borderRadius: theme.radiusSmall,
    padding: theme.space2, alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: theme.fontWeightMedium },
});
