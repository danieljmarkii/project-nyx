// The pet a trial list screen is about — CUL-1297 (trial-screen spec §2 S1, §7).
//
// `/trial-foods` and `/trial-exposures` take a `?pet=` param so a door can name the
// pet whose trial it opens (the trial screen, a recap, the widget), whichever pet is
// selected. Every door that exists today sends no param, so an absent param falls
// back to the active pet and those doors land exactly where they always did.
//
// The fallback is ONLY for an absent param. A param naming a pet the account does
// not hold (a stale link, an archived pet) never falls back to the active pet: that
// would draw one pet's trial under a link for another (C-9). It resolves to that id
// with `known: false`, and the screen says the pet is gone.
import { useLocalSearchParams } from 'expo-router';
import { resolveRecordPetName, usePetStore } from '../store/petStore';

/** The route's pet id: the param when one was sent, else the active pet's. A
 *  repeated param (`?pet=a&pet=b`) takes the first, the way expo-router's own
 *  string params read. A blank param is no param. */
export function trialRoutePetId(
  param: string | string[] | undefined,
  activePetId: string | null,
): string | null {
  const raw = Array.isArray(param) ? param[0] : param;
  const named = raw?.trim();
  return named ? named : activePetId;
}

export function useTrialRoutePet(): {
  petId: string | null;
  petName: string;
  /** The account holds this pet (non-archived). False for a stale link, and for no pet at all. */
  known: boolean;
} {
  const { pet } = useLocalSearchParams<{ pet?: string | string[] }>();
  const activePetId = usePetStore((s) => s.activePet?.id ?? null);
  const pets = usePetStore((s) => s.pets);
  const petId = trialRoutePetId(pet, activePetId);
  return {
    petId,
    petName: resolveRecordPetName(pets, petId),
    known: petId !== null && pets.some((p) => p.id === petId),
  };
}
