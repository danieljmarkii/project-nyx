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
    const userId = user.id;
    let cancelled = false;

    // Load the active pet, distinguishing a genuinely petless account (→ onboard)
    // from a flaky cold-start read. The previous version used .single() and
    // ignored `error`, so ANY empty result — a failed request, or RLS returning
    // zero rows before the restored auth token was attached — looked identical to
    // "no pet" and bounced an existing owner into onboarding (risking a duplicate
    // pet). We now: never onboard on an error, and retry once to absorb the
    // token-attach race before trusting an empty-but-successful result.
    async function loadPet(attempt: number): Promise<void> {
      const { data, error } = await supabase
        .from('pets')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;

      if (data) {
        setActivePet(data);
        setOnboarded(true);
        return;
      }

      // No row this attempt. Retry once before trusting it — covers a transient
      // fetch error and the cold-start race where the auth token isn't attached
      // yet (RLS then returns empty with no error).
      if (attempt === 0) {
        if (error) console.warn('[usePet] pet fetch failed, retrying:', error.message);
        setTimeout(() => {
          if (!cancelled) loadPet(1);
        }, 600);
        return;
      }

      // Still no row on the retry.
      if (error) {
        // Don't assume "no pet" on an error — leave state as-is so a later auth
        // refresh / screen focus re-fetch recovers, rather than false-onboarding.
        console.warn('[usePet] pet fetch failed after retry:', error.message);
        return;
      }

      // Query succeeded twice with zero rows — genuinely a new/petless account.
      setOnboarded(false);
      router.replace('/onboarding/pet');
    }

    loadPet(0);
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { activePet, isOnboarded };
}
