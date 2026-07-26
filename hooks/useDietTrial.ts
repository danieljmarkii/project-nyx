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
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

export function useDietTrial(): {
  input: TrialCardInput | null;
  isLoading: boolean;
  reload: () => void;
} {
  const { activePet, pets } = usePetStore();
  // Recompute after a sync cycle hydrates new events, the same trigger the Trend
  // zone uses — a meal logged on another device changes the coverage line here.
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const [input, setInput] = useState<TrialCardInput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const petId = activePet?.id;
  const petName = activePet?.name;
  const species = activePet?.species;
  // §5.6 gates the CLAIM on household pet count alone: `feeding_arrangements
  // .is_shared` ships INERT, so a shared bowl is not knowable and no copy may
  // imply it is. `pets` holds only NON-archived pets (the store's invariant).
  const otherNames = pets.filter((p) => p.id !== petId).map((p) => p.name);
  const otherKey = otherNames.join('|');

  useEffect(() => {
    if (!petId || !petName || !species) {
      setInput(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    loadDietTrialFacts({
      pet: { id: petId, name: petName, species },
      otherPetNames: otherKey === '' ? [] : otherKey.split('|'),
    })
      .then((next) => { if (!cancelled) setInput(next); })
      .catch((e) => {
        // A total read failure leaves the previous input in place rather than
        // flashing an empty state — never a claim, in either direction.
        console.error('[DietTrial] load failed:', e);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [petId, petName, species, otherKey, hydrationTick, tick]);

  return { input, isLoading, reload };
}
