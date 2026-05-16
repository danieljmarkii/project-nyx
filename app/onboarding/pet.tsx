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
import { FilterChip } from '../../components/ui/FilterChip';
import { SectionLabel } from '../../components/ui/SectionLabel';

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
    try {
      const { data, error } = await supabase
        .from('pets')
        .insert({ user_id: user.id, name: name.trim(), species })
        .select()
        .single();

      if (error || !data) {
        Alert.alert('Something went wrong', error?.message ?? 'Please try again.');
        return;
      }

      setActivePet(data);
      setOnboarded(true);
      router.push('/onboarding/food');
    } catch {
      Alert.alert('Something went wrong', 'Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
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
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue || loading}
          activeOpacity={0.85}
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
