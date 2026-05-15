import { useEffect } from 'react';
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
      .then(({ data }) => {
        if (data) {
          setActivePet(data);
          setOnboarded(true);
        }
      });
  }, [user]);

  return { activePet, isOnboarded };
}
