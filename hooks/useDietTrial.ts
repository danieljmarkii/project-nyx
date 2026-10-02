// One loader behind both diet-trial surfaces (B-417 PR 4).
//
// The Pet-tab card and the Home strip render the SAME facts at two densities, so
// they read through one hook rather than two loaders that can disagree — which is
// exactly the failure B-421 had to clean up, where the profile card, the Home
// trend zone and the widget each grew their own day arithmetic and ended up two
// days apart on a single screen unlock.
//
// CUL-1297 — the hook reads the pet it is HANDED, never `activePet` (C-9): the trial
// screen opened from a link or the widget shows the trial of the pet it was opened
// for, whichever pet is selected. Home and the Pet tab pass the active pet's id, so
// they read exactly what they always did. Still one loader, keyed by pet (B-421) —
// never a second loader keyed by trial.
import { useCallback, useEffect, useState } from 'react';
import { loadDietTrialFacts } from '../lib/dietTrialFacts';
import type { TrialCardInput } from '../lib/dietTrialCard';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

/**
 * What the hook knows about the named pet's trial read (C-12 — a read that hasn't
 * answered is never an empty record):
 *
 * - `loading`    — nothing has answered for THIS pet yet (a cold start, or a switch
 *                  to a pet whose read is still in flight). `input` may still hold the
 *                  previous pet's facts; `inputIsForPet` is false.
 * - `unreadable` — the trial read threw and there is no earlier answer for this pet.
 *                  Never "no trial": that is a fact, and this is the absence of one.
 *                  A failed RE-read of a pet that already answered keeps the last good
 *                  input and stays `loaded` (the strip never flashes empty).
 * - `loaded`     — `input` is this pet's answer. `input.trial === null` is the fact
 *                  "no trial".
 * - `no_pet`     — no id, or an id the account does not hold (a stale link, an
 *                  archived pet). Nothing is read.
 */
export type DietTrialStatus = 'loading' | 'unreadable' | 'loaded' | 'no_pet';

export function useDietTrial(petId: string | null): {
  input: TrialCardInput | null;
  status: DietTrialStatus;
  isLoading: boolean;
  reload: () => void;
  inputIsForPet: boolean;
  /** TS-5 (CUL-1301) — the pet `input` was last loaded FOR (null before the first load). Home's
   *  strip opens THIS pet's trial screen: during a switch the strip still shows the previous
   *  pet's trial, and a tap must open the trial it shows (spec §5.1). */
  loadedPetId: string | null;
} {
  const pets = usePetStore((s) => s.pets);
  // Recompute after a sync cycle hydrates new events, the same trigger the Trend
  // zone uses — a meal logged on another device changes the coverage line here.
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const [input, setInput] = useState<TrialCardInput | null>(null);
  // B-789 — the petId `input` was last loaded FOR. `input` is deliberately retained across a
  // pet switch and a failed reload (so the strip never flashes empty), so a non-null `input` is
  // not proof it belongs to the named pet; this is. Set only when a load resolves (batched with
  // `setInput`, so the two never disagree), null before the first load and after a no-pet clear.
  const [loadedPetId, setLoadedPetId] = useState<string | null>(null);
  // CUL-1297 — the petId whose read threw before it ever answered. Cleared by the next answer.
  const [failedPetId, setFailedPetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  // `pets` holds only NON-archived pets (the store's invariant), so an archived pet's id
  // resolves to nothing here and reads as `no_pet`.
  const pet = petId ? pets.find((p) => p.id === petId) : undefined;
  const resolvedId = pet?.id;
  const petName = pet?.name;
  const species = pet?.species;
  const sex = pet?.sex;
  // §5.6 gates the CLAIM on household pet count alone: `feeding_arrangements
  // .is_shared` ships INERT, so a shared bowl is not knowable and no copy may
  // imply it is.
  const otherNames = pets.filter((p) => p.id !== resolvedId).map((p) => p.name);
  const otherKey = otherNames.join('|');

  useEffect(() => {
    if (!resolvedId || !petName || !species) {
      setInput(null);
      setLoadedPetId(null);
      setFailedPetId(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    loadDietTrialFacts({
      pet: { id: resolvedId, name: petName, species, sex },
      otherPetNames: otherKey === '' ? [] : otherKey.split('|'),
      // Signals v2 GA'd (CUL-548): the client no longer gates the standing vomit-count
      // line, so the loader always computes it for a RUNNING trial (`loadDietTrialFacts`
      // still gates the extra read on `isTrialRunning`; passing `true` only retires the
      // beta flag, not that staleness gate).
      signalsV2: true,
      // CUL-1297 — without this the loader answers a failed trial read with the
      // trial-less input, and `unreadable` could not be told from "no trial".
      rethrowUnreadable: true,
    })
      .then((next) => {
        if (cancelled) return;
        setInput(next);
        setLoadedPetId(resolvedId);
        setFailedPetId(null);
      })
      .catch((e) => {
        // A total read failure leaves the previous input in place rather than
        // flashing an empty state — never a claim, in either direction. `loadedPetId`
        // is likewise left as-is, so `inputIsForPet` reflects what `input` still
        // holds: on a cold-load error it stays null or another pet (⇒ a fail-closed
        // consumer suppresses, and the status reads `unreadable`), and on a same-pet
        // reload error it stays this pet (⇒ the last-good input is treated as current,
        // matching the retained value above, and the status stays `loaded`).
        console.error('[DietTrial] load failed:', e);
        if (!cancelled) setFailedPetId(resolvedId);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [resolvedId, petName, species, sex, otherKey, hydrationTick, tick]);

  // Derived during render, never mirrored into state: the instant the named pet
  // changes, the status is about the NEW pet, before any effect has run.
  const inputIsForPet = resolvedId !== undefined && loadedPetId === resolvedId;
  const status: DietTrialStatus = !resolvedId || !petName || !species
    ? 'no_pet'
    : inputIsForPet
      ? 'loaded'
      : failedPetId === resolvedId
        ? 'unreadable'
        : 'loading';

  return {
    input,
    status,
    isLoading,
    reload,
    // B-789 — is `input` loaded for the pet the caller NAMED? False during the cold load, the
    // whole pet-switch window (this hook holds the previous pet's `input` until the new load
    // resolves, while `useSignal` resets its findings synchronously), and after a cold-load
    // error — exactly the windows where a fail-closed consumer must not trust `input`. A same-pet
    // hydration reload keeps `loadedPetId === petId`, so it stays true across a routine sync.
    // (Named `inputIsForActivePet` until CUL-1297, when the caller began naming the pet; Home
    // names the active pet, so its semantics are unchanged.)
    inputIsForPet,
    loadedPetId,
  };
}
