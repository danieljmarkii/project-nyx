import { useEffect } from 'react';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';

export function usePet() {
  const { user } = useAuthStore();
  const { activePet, isOnboarded, setActivePet, setOnboarded } = usePetStore();

  useEffect(() => {
    if (!user) return;

    supabase
      .from('pets')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (data) {
          setActivePet(data);
          setOnboarded(true);
        } else {
          // No pet found — send to onboarding (covers new signups and
          // the case where the only pet was deactivated).
          setOnboarded(false);
          router.replace('/onboarding/pet');
        }
      });
  }, [user]);

  return { activePet, isOnboarded };
}
