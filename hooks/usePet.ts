import { useEffect } from 'react';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { usePetStore, loadPersistedActivePetId } from '../store/petStore';
import { useAuthStore } from '../store/authStore';

export function usePet() {
  const { user } = useAuthStore();
  const { pets, activePet, isOnboarded, setPets, setOnboarded } = usePetStore();

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;

    // Load ALL active pets (multi-pet spec §2) and restore the device-local
    // selection, distinguishing a genuinely petless account (→ onboard) from a
    // flaky cold-start read. The single-pet version of this hook used
    // `.limit(1)` ("oldest pet wins"); the list query keeps the same
    // oldest-first order so the selection fallback is unchanged for existing
    // accounts. The retry/onboarding guard applies to the LIST being empty:
    // never onboard on an error, and retry once to absorb the token-attach
    // race before trusting an empty-but-successful result (a false onboarding
    // bounce risks a duplicate pet).
    async function loadPets(attempt: number): Promise<void> {
      const persistedId = await loadPersistedActivePetId();
      const { data, error } = await supabase
        .from('pets')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (cancelled) return;

      if (data && data.length > 0) {
        setPets(data, persistedId);
        setOnboarded(true);
        return;
      }

      // No rows this attempt. Retry once before trusting it — covers a
      // transient fetch error and the cold-start race where the auth token
      // isn't attached yet (RLS then returns empty with no error).
      if (attempt === 0) {
        if (error) console.warn('[usePet] pets fetch failed, retrying:', error.message);
        setTimeout(() => {
          if (!cancelled) loadPets(1);
        }, 600);
        return;
      }

      // Still no rows on the retry.
      if (error) {
        // Don't assume "no pets" on an error — leave state as-is so a later
        // auth refresh / screen focus re-fetch recovers, rather than
        // false-onboarding.
        console.warn('[usePet] pets fetch failed after retry:', error.message);
        return;
      }

      // Query succeeded twice with zero rows — genuinely a new/petless account.
      setOnboarded(false);
      router.replace('/onboarding/pet');
    }

    loadPets(0);
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { pets, activePet, isOnboarded };
}
