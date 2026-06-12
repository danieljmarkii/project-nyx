import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';
import { PetForm, PetFormSpecies } from '../components/pet/PetForm';

// Add-a-pet route (multi-pet spec §3.2): the bare shared PetForm, no
// onboarding coupling. Returns to home with the new pet selected, so the
// owner lands on its (designed-empty) per-pet home.
export default function AddPetScreen() {
  const { user } = useAuthStore();
  const { addPet } = usePetStore();

  const [loading, setLoading] = useState(false);

  async function handleSubmit(name: string, species: PetFormSpecies) {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pets')
        .insert({ user_id: user.id, name, species })
        .select()
        .single();

      if (error || !data) {
        Alert.alert('Something went wrong', error?.message ?? 'Please try again.');
        return;
      }

      addPet(data, { select: true });
      router.back();
    } catch {
      Alert.alert('Something went wrong', 'Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PetForm
      title="Add a pet."
      subtitle="Just a name and species to start. Everything else can be added later."
      submitLabel="Add pet"
      loading={loading}
      onSubmit={handleSubmit}
    />
  );
}
