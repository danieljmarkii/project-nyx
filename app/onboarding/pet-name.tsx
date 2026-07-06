import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { usePetStore } from '../../store/petStore';
import { theme } from '../../constants/theme';
import { TextField } from '../../components/ui/TextField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { OnboardingHeader } from '../../components/onboarding/OnboardingHeader';

// Pet name — the second REQUIRED pet-setup step (B-251 PR 7, spec §3, mockup 07).
// Type + name are the only two walls in onboarding; this screen writes the pet
// row ({user_id, name, species}), which the later skippable steps (breed/gender/
// age, PR 8–9) update. Continue is gated on a non-empty name.
export default function PetNameScreen() {
  const { user } = useAuthStore();
  const { addPet, setOnboarded } = usePetStore();

  // The chosen species arrives from the type step. Guard the value rather than
  // trusting the param blindly — the insert must never write a garbage species.
  const params = useLocalSearchParams<{ species?: string }>();
  const species = params.species === 'cat' || params.species === 'dog' ? params.species : null;

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = name.trim().length > 0 && species !== null;

  async function handleContinue() {
    if (!canSubmit || loading || !user || !species) return;
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

      addPet(data, { select: true });
      // Mark the session onboarded so the tabs gate (usePet) doesn't bounce back
      // to onboarding on the way to Home. The durable onboarding_completed_at flag
      // is written at the "All set" step (PR 10); until it lands, a created pet is
      // treated complete by the §6 legacy rule on the next cold start.
      setOnboarded(true);
      // Breed/gender/age (PR 8–9) slot in between here and Home as they land; for
      // now the required pair is enough to reach the (designed-empty) home.
      router.replace('/(tabs)');
    } catch {
      Alert.alert('Something went wrong', 'Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader step={2} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <Text style={styles.title}>What's your pet's name?</Text>
          <Text style={styles.subtitle}>The one you actually call them.</Text>

          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Luna"
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleContinue}
            testID="pet-name-input"
          />

          <View style={styles.grow} />

          <PrimaryButton
            label="Continue"
            onPress={handleContinue}
            disabled={!canSubmit}
            loading={loading}
            testID="pet-name-continue"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
    paddingHorizontal: theme.space3,
  },
  flex: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    letterSpacing: theme.trackingTight,
    marginTop: theme.space3,
    marginBottom: theme.space1,
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space4,
  },
  grow: {
    flex: 1,
    minHeight: theme.space4,
  },
});
