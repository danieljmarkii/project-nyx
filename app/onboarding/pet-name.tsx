import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { usePetStore } from '../../store/petStore';
import { useOnboardingDraftStore } from '../../store/onboardingDraftStore';
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
  const { addPet, setOnboarded, updatePet } = usePetStore();
  // Type + name both live in the shared onboarding draft so re-advancing after a
  // back doesn't drop them (code-review, PR 7). The species is chosen on the type
  // step; the name is edited in place here.
  const { species, name, setName } = useOnboardingDraftStore();

  const [loading, setLoading] = useState(false);

  // Escape hatch: this screen is only reachable from the type step, which sets the
  // species. If it's somehow entered without one — a deep link straight to
  // /onboarding/pet-name — route back to pick a type rather than trap the owner
  // behind a Continue that can never enable (code-review NIT).
  useEffect(() => {
    if (species === null) router.replace('/onboarding/pet-type');
  }, [species]);

  const canSubmit = name.trim().length > 0 && species !== null;

  async function handleContinue() {
    if (!canSubmit || loading || !user || !species) return;
    setLoading(true);
    try {
      // Insert-or-update. The optional steps (breed/gender, PR 8) are PUSHED after
      // this one, so back-navigation can return the owner here; onboarding begins
      // with zero pets, so an active pet on this screen can only be the one this
      // flow just created — never a pre-existing pet. When it exists, UPDATE that
      // row (the name/species may have changed on the way back) instead of
      // inserting a second pet. This is what makes the pushed back-navigation
      // single-pet-safe.
      const existing = usePetStore.getState().activePet;
      if (existing) {
        const { error } = await supabase
          .from('pets')
          .update({ name: name.trim(), species })
          .eq('id', existing.id);
        if (error) {
          // Log the raw cause; owner sees calm copy (nyx-voice Pattern 8).
          console.warn('[pet-name] pet update failed:', error.message);
          Alert.alert('Something went wrong', 'Please try again.');
          return;
        }
        updatePet({ name: name.trim(), species });
      } else {
        const { data, error } = await supabase
          .from('pets')
          .insert({ user_id: user.id, name: name.trim(), species })
          .select()
          .single();

        if (error || !data) {
          // Log the raw cause; owner sees calm copy (nyx-voice Pattern 8).
          if (error) console.warn('[pet-name] pet insert failed:', error.message);
          Alert.alert('Something went wrong', 'Please try again.');
          return;
        }

        addPet(data, { select: true });
        // Mark the session onboarded so the tabs gate (usePet) doesn't bounce back
        // to onboarding once the flow reaches Home. The durable
        // onboarding_completed_at flag is written at the "All set" step (PR 10);
        // until it lands, a created pet is treated complete by the §6 legacy rule.
        setOnboarded(true);
      }
      // Breed → gender → age (PR 8–9) UPDATE this same row before Home; push so
      // back-navigation returns through them step-by-step. PR 8 wires breed +
      // gender; age (PR 9) + the paywall/done terminus (PR 10) slot in later.
      router.push('/onboarding/pet-breed');
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
