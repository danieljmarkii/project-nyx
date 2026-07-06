import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { usePetStore } from '../../store/petStore';
import { breedsForSpecies, resolveBreedFieldState } from '../../constants/breeds';
import { theme } from '../../constants/theme';
import { BreedPicker } from '../../components/pet/BreedPicker';
import { TextField } from '../../components/ui/TextField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { OnboardingHeader } from '../../components/onboarding/OnboardingHeader';

// Breed — the first SKIPPABLE pet-setup step (B-251 PR 8, spec §3.4, mockup 08).
// The pet row already exists (pet-name inserted {user_id, name, species}); this
// step UPDATEs its breed, or leaves it null on Skip. Breed carries breed-specific
// disease risk (constants/breeds.ts), so an accurate value has clinical value on
// the vet report — but it's optional, backfillable in-app, and never a wall.

export default function PetBreedScreen() {
  const { activePet, updatePet } = usePetStore();

  // Escape hatch: this screen is only reachable after pet-name creates the pet.
  // If it's somehow entered without one — a deep link straight here — restart pet
  // setup rather than trap the owner on a screen with no pet to update.
  useEffect(() => {
    if (!activePet) router.replace('/onboarding/pet-type');
  }, [activePet]);

  // Seed from the created pet so a value written on a prior pass (backing here
  // from gender) is restored, and a free-text breed reopens in the text field.
  // On the first pass the pet's breed is null (pet-name inserts only
  // name+species), so this yields the empty picker state.
  const [breed, setBreed] = useState(() => resolveBreedFieldState(activePet?.breed ?? null, activePet?.species ?? 'cat').breed);
  const [isOther, setIsOther] = useState(() => resolveBreedFieldState(activePet?.breed ?? null, activePet?.species ?? 'cat').isOther);
  const [saving, setSaving] = useState(false);

  if (!activePet) return null;

  const breeds = breedsForSpecies(activePet.species);
  const trimmed = breed.trim();
  const canContinue = trimmed.length > 0;

  function goNext() {
    // Push (not replace) so back from gender returns here with its state intact.
    router.push('/onboarding/pet-gender');
  }

  function handleSelect(selected: string) {
    setBreed(selected);
    setIsOther(false);
  }

  function handleSelectOther(seed: string) {
    // Carry a typed-but-unmatched search term into the free-text field so the
    // owner doesn't retype it (BreedPicker passes its current query).
    setBreed(seed);
    setIsOther(true);
  }

  async function handleContinue() {
    if (!activePet || saving || !canContinue) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pets')
        .update({ breed: trimmed })
        .eq('id', activePet.id);
      if (error) {
        // Log the raw cause for debugging; the owner sees calm, in-voice copy
        // (nyx-voice Pattern 8 — never surface a raw DB/RLS error string).
        console.warn('[pet-breed] breed update failed:', error.message);
        Alert.alert('Something went wrong', 'Please try again.');
        return;
      }
      updatePet({ breed: trimmed });
      goNext();
    } catch {
      Alert.alert('Something went wrong', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    // Guard against a Skip tap racing an in-flight Continue save into a double
    // navigation (code-review, PR 8) — the header also disables Skip while saving.
    if (saving) return;
    // No write: leaves breed as-is — null on the first pass (its insert default),
    // or a value kept if one was already saved on a prior pass (we don't destroy
    // data the owner gave us). The owner can add/change it anytime from the profile.
    goNext();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader step={3} onSkip={handleSkip} skipDisabled={saving} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <Text style={styles.title}>{`What's ${activePet.name}'s breed?`}</Text>
          <Text style={styles.subtitle}>Optional — it helps tailor what we watch for.</Text>

          {isOther ? (
            <View style={styles.flex}>
              <TextField
                label="Breed"
                value={breed}
                onChangeText={setBreed}
                placeholder="Type the breed"
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleContinue}
                testID="pet-breed-other-input"
              />
              <TouchableOpacity
                onPress={() => { setIsOther(false); setBreed(''); }}
                style={styles.listLink}
                accessibilityRole="button"
              >
                <Text style={styles.listLinkText}>Choose from the list instead</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.flex}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <BreedPicker
                breeds={breeds}
                value={breed}
                onSelect={handleSelect}
                onSelectOther={handleSelectOther}
              />
            </ScrollView>
          )}

          <PrimaryButton
            label="Continue"
            onPress={handleContinue}
            disabled={!canContinue}
            loading={saving}
            style={styles.cta}
            testID="pet-breed-continue"
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
    marginBottom: theme.space3,
  },
  listLink: {
    alignSelf: 'flex-start',
    marginTop: theme.space1,
    // 44pt touch row around the short link — clears the tap-target floor without
    // relying on hitSlop (docs/personas.md).
    minHeight: 44,
    justifyContent: 'center',
  },
  listLinkText: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
  cta: {
    marginTop: theme.space2,
  },
});
