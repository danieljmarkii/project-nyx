import { useEffect } from 'react';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { usePetStore, loadPersistedActivePetId } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { decideOnboarding } from '../lib/onboarding';

export function usePet() {
  const { user } = useAuthStore();
  const { pets, activePet, isOnboarded, setPets, setOnboarded } = usePetStore();

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;

    // Decide onboarding from the DURABLE flag (user_profiles.onboarding_completed_at,
    // migration 027) instead of inferring it from "has >=1 pet" (B-251 PR 4 / §6,
    // D12). The old inference silently treated a mid-flow quit as complete; the
    // flag distinguishes a genuinely-new account from one that finished the flow.
    // The §6 decision itself lives in the pure, unit-tested decideOnboarding seam
    // (lib/onboarding.test.ts); this hook owns only the reads and the cold-start
    // retry/error plumbing around it.
    //
    // Both reads run together. Active pets are still loaded (multi-pet spec §2) and
    // the device-local selection restored; the flag + active-pet count drive the
    // gate, with the §6 legacy rule folded into decideOnboarding (null flag + a
    // pet = a pre-flag account, treated complete — never re-onboarded).
    //
    // The retry/onboarding guard mirrors the previous hook: never onboard on a read
    // error, and retry once to absorb the cold-start token-attach race (RLS returns
    // empty-with-no-error before the token is attached) before trusting an
    // empty-and-uncompleted result — a false onboarding bounce risks a duplicate pet.
    async function loadState(attempt: number): Promise<void> {
      const persistedId = await loadPersistedActivePetId();

      // A genuine THROW (not a resolved {data, error}) — e.g. a network-layer
      // failure on a zero-connectivity cold start — would otherwise reject
      // loadState unhandled and skip the retry/never-bounce machinery below.
      // Catch it here and fold it into the same blocking-error path: retry once,
      // else leave state as-is. Never onboard on a throw (a false bounce risks a
      // duplicate pet) — the no-silent-failure rule for API calls.
      const reads = await Promise.all([
        supabase
          .from('user_profiles')
          .select('onboarding_completed_at')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('pets')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
      ]).catch((e: unknown) => {
        console.warn('[usePet] state fetch threw:', e);
        return null;
      });
      if (cancelled) return;

      if (!reads) {
        if (attempt === 0) {
          setTimeout(() => {
            if (!cancelled) loadState(1);
          }, 600);
        }
        return;
      }

      const [profileRes, petsRes] = reads;
      const { data: profile, error: profileError } = profileRes;
      const { data: petData, error: petsError } = petsRes;

      // Hydrate the store with whatever active pets we read (multi-pet §2),
      // independent of the gate decision, so per-pet surfaces populate as soon as
      // the rows are visible.
      if (petData && petData.length > 0) {
        setPets(petData, persistedId);
      }

      const petCount = petData?.length ?? 0;

      // The durable flag only decides the gate when there are ZERO pets — with a
      // pet, petCount > 0 makes the account onboarded regardless of the flag (§6
      // legacy/completed rule). So a profile-read error only BLOCKS the decision in
      // the petless case; a pets-read error always blocks it (we can't trust an
      // empty list we failed to read). Never decide the gate from a blocking read
      // error — retry once, then leave state as-is so a later auth refresh / screen
      // focus re-fetch recovers, rather than false-onboarding (which risks a
      // duplicate pet).
      const blockingError = petsError || (petCount === 0 && profileError);
      if (blockingError) {
        if (attempt === 0) {
          if (petsError) console.warn('[usePet] pets fetch failed, retrying:', petsError.message);
          if (profileError) console.warn('[usePet] profile fetch failed, retrying:', profileError.message);
          setTimeout(() => {
            if (!cancelled) loadState(1);
          }, 600);
          return;
        }
        if (petsError) console.warn('[usePet] pets fetch failed after retry:', petsError.message);
        if (profileError) console.warn('[usePet] profile fetch failed after retry:', profileError.message);
        return;
      }

      // Reads sufficient to decide. The durable flag + active-pet count drive §6.
      const decision = decideOnboarding({
        onboardingCompletedAt: profile?.onboarding_completed_at ?? null,
        petCount,
      });

      if (decision.onboarded) {
        setOnboarded(true);
        return;
      }

      // Not onboarded (no pet, no completion flag). Absorb the cold-start
      // token-attach race — a first read can succeed with zero rows before the
      // token is attached — by retrying once before trusting the empty result.
      if (attempt === 0) {
        setTimeout(() => {
          if (!cancelled) loadState(1);
        }, 600);
        return;
      }

      // Second clean pass still says "not onboarded". If the store already holds a
      // pet — onboarding/add-pet created one while this retry was in flight and the
      // row isn't visible to this read yet — trust the store and don't bounce:
      // re-onboarding an owner who just created a pet risks a duplicate pet.
      // (Adversarial-review find, multi-pet PR 2.)
      if (usePetStore.getState().pets.length > 0) return;

      // Genuinely a new, petless account that never completed onboarding. Enter
      // at the disclaimer acknowledgment (B-270), not pet-type: a mid-flow quit
      // that never acknowledged must pass the acceptance point on resume. An
      // account that already acknowledged just re-taps — the write maps a PK
      // conflict to already-recorded, and the first acceptance stands.
      setOnboarded(false);
      router.replace('/onboarding/disclaimer');
    }

    loadState(0);
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { pets, activePet, isOnboarded };
}
