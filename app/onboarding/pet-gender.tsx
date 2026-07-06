import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { usePetStore } from '../../store/petStore';
import { theme } from '../../constants/theme';
import { ChipGroup, type ChipGroupOption } from '../../components/ui/ChipGroup';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { OnboardingHeader } from '../../components/onboarding/OnboardingHeader';

// Gender — the second SKIPPABLE pet-setup step (B-251 PR 8, spec §3.5, mockup 09).
// UPDATEs the created pet's sex, or leaves it 'unknown' (the insert default) on
// Skip. No neuter/spay status here — that's a clinical field for the in-app
// profile, not onboarding.
type Gender = 'male' | 'female';

// Closed-set single-select → ChipGroup, not a hand-rolled chip row (CLAUDE.md
// convention, B-146). Order matches spec §3.5 (Male · Female).
const GENDER_OPTIONS: ChipGroupOption[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export default function PetGenderScreen() {
  const { activePet, updatePet } = usePetStore();

  // Escape hatch: only reachable after the pet exists; restart pet setup if not.
  useEffect(() => {
    if (!activePet) router.replace('/onboarding/pet-type');
  }, [activePet]);

  // Seed from the created pet: 'male'/'female' preselects the chip, 'unknown'
  // (the insert default) leaves both chips unselected.
  const [sex, setSex] = useState<Gender | null>(() =>
    activePet?.sex === 'male' || activePet?.sex === 'female' ? activePet.sex : null,
  );
  const [saving, setSaving] = useState(false);

  if (!activePet) return null;

  function finish() {
    // Interim terminus: gender is the last built pet-setup step today. PR 9 (age)
    // slots between here and Home; until it lands, a created pet with the required
    // pair + optional breed/gender reaches the designed-empty Home. Replace so the
    // owner can't swipe back into onboarding from Home.
    router.replace('/(tabs)');
  }

  async function handleContinue() {
    if (!activePet || saving || !sex) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pets')
        .update({ sex })
        .eq('id', activePet.id);
      if (error) {
        // Log the raw cause for debugging; the owner sees calm, in-voice copy
        // (nyx-voice Pattern 8 — never surface a raw DB/RLS error string).
        console.warn('[pet-gender] sex update failed:', error.message);
        Alert.alert('Something went wrong', 'Please try again.');
        return;
      }
      updatePet({ sex });
      finish();
    } catch {
      Alert.alert('Something went wrong', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    // Guard against a Skip tap racing an in-flight Continue save (code-review,
    // PR 8) — the header also disables Skip while saving.
    if (saving) return;
    // No write: leaves sex as-is — 'unknown' on the first pass (its insert
    // default), or a value kept if one was already saved on a prior pass.
    finish();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader step={4} onSkip={handleSkip} skipDisabled={saving} />

      <View style={styles.body}>
        <Text style={styles.title}>{`What's ${activePet.name}'s gender?`}</Text>
        <Text style={styles.subtitle}>Optional — helps us read the data in context.</Text>

        <ChipGroup
          options={GENDER_OPTIONS}
          value={sex}
          onChange={(next) => setSex(next as Gender | null)}
          variant="filled"
          accessibilityLabel="Gender"
        />

        <View style={styles.grow} />

        <PrimaryButton
          label="Continue"
          onPress={handleContinue}
          disabled={!sex}
          loading={saving}
          testID="pet-gender-continue"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
    paddingHorizontal: theme.space3,
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
