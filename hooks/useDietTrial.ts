// One loader behind both diet-trial surfaces (B-417 PR 4).
//
// The Pet-tab card and the Home strip render the SAME facts at two densities, so
// they read through one hook rather than two loaders that can disagree — which is
// exactly the failure B-421 had to clean up, where the profile card, the Home
// trend zone and the widget each grew their own day arithmetic and ended up two
// days apart on a single screen unlock.
import { useCallback, useEffect, useState } from 'react';
import { loadDietTrialFacts } from '../lib/dietTrialFacts';
import type { TrialCardInput } from '../lib/dietTrialCard';
import { useBetaOptIn } from '../lib/betaFeatures';
import { useAllowlistFlag } from './useAppConfig';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

export function useDietTrial(): {
  input: TrialCardInput | null;
  isLoading: boolean;
  reload: () => void;
  inputIsForActivePet: boolean;
} {
  const { activePet, pets } = usePetStore();
  // Recompute after a sync cycle hydrates new events, the same trigger the Trend
  // zone uses — a meal logged on another device changes the coverage line here.
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  // Signals v2 (CUL-13) — the standing vomit-count line rides `signals_v2` (its own flag, D6), the
  // two-gate beta shape (eligible && optedIn — never conflated), exactly as SignalZone resolves it.
  // Both hooks are called UNCONDITIONALLY as separate statements, then combined — never
  // `useAllowlistFlag(...) && useBetaOptIn(...)`, which short-circuits the second hook on a cold mount
  // (the allowlist starts false until config resolves) and then calls it for the first time on a later
  // render → a Rules-of-Hooks count change / crash. Off, the loader skips the extra read and the strip
  // is byte-identical. A change flips the effect below (it's a dep).
  const signalsV2Eligible = useAllowlistFlag('signals_v2');
  const signalsV2OptedIn = useBetaOptIn('signals_v2');
  const signalsV2 = signalsV2Eligible && signalsV2OptedIn;
  const [input, setInput] = useState<TrialCardInput | null>(null);
  // B-789 — the petId `input` was last loaded FOR. `input` is deliberately retained across a
  // pet switch and a failed reload (so the strip never flashes empty), so a non-null `input` is
  // not proof it belongs to the active pet; this is. Set only when a load resolves (batched with
  // `setInput`, so the two never disagree), null before the first load and after a no-pet clear.
  const [loadedPetId, setLoadedPetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const petId = activePet?.id;
  const petName = activePet?.name;
  const species = activePet?.species;
  const sex = activePet?.sex;
  // §5.6 gates the CLAIM on household pet count alone: `feeding_arrangements
  // .is_shared` ships INERT, so a shared bowl is not knowable and no copy may
  // imply it is. `pets` holds only NON-archived pets (the store's invariant).
  const otherNames = pets.filter((p) => p.id !== petId).map((p) => p.name);
  const otherKey = otherNames.join('|');

  useEffect(() => {
    if (!petId || !petName || !species) {
      setInput(null);
      setLoadedPetId(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    loadDietTrialFacts({
      pet: { id: petId, name: petName, species, sex },
      otherPetNames: otherKey === '' ? [] : otherKey.split('|'),
      signalsV2,
    })
      .then((next) => { if (!cancelled) { setInput(next); setLoadedPetId(petId); } })
      .catch((e) => {
        // A total read failure leaves the previous input in place rather than
        // flashing an empty state — never a claim, in either direction. `loadedPetId`
        // is likewise left as-is, so `inputIsForActivePet` reflects what `input` still
        // holds: on a cold-load error it stays null (⇒ a fail-closed consumer suppresses),
        // and on a same-pet reload error it stays this pet (⇒ the last-good input is
        // treated as current, matching the retained value above).
        console.error('[DietTrial] load failed:', e);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [petId, petName, species, sex, otherKey, hydrationTick, tick, signalsV2]);

  return {
    input,
    isLoading,
    reload,
    // B-789 — is `input` loaded for the CURRENTLY active pet? False during the cold load, the
    // whole pet-switch window (this hook holds the previous pet's `input` until the new load
    // resolves, while `useSignal` resets its findings synchronously), and after a cold-load
    // error — exactly the windows where a fail-closed consumer must not trust `input`. A same-pet
    // hydration reload keeps `loadedPetId === petId`, so it stays true across a routine sync.
    inputIsForActivePet: loadedPetId !== null && loadedPetId === petId,
  };
}
