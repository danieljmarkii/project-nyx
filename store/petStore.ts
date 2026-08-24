import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Pet {
  id: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed: string | null;
  date_of_birth: string | null;
  // Whether `date_of_birth` is a witnessed birthday the owner entered on a
  // calendar ('exact') or a date COMPUTED from an approximate age ('approximate',
  // e.g. onboarding's "~2 years" → today − duration). Non-null (migration 028
  // defaults 'exact'); only meaningful when `date_of_birth` is set. Honesty
  // contract: never render an 'approximate' DOB as an exact birthday — surfaces
  // show it as an estimate ("~2 years old"). See docs/nyx-onboarding-requirements.md
  // §4/§6 (S2) — the clinical-honesty reason this field exists.
  date_of_birth_precision: 'exact' | 'approximate';
  sex: 'male' | 'female' | 'unknown';
  weight_kg: number | null;
  photo_path: string | null;
}

// Device-local active-pet selection (multi-pet spec §2): persisted on-device,
// never synced — a synced selection would silently flip the pet under another
// caregiver's feet. Cleared on sign-out (FR-9 wipe parity).
const ACTIVE_PET_KEY = 'nyx.activePetId';

export async function loadPersistedActivePetId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_PET_KEY);
  } catch (e) {
    console.warn('[petStore] failed to read persisted active pet:', e);
    return null;
  }
}

export async function clearPersistedActivePetId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVE_PET_KEY);
  } catch (e) {
    console.warn('[petStore] failed to clear persisted active pet:', e);
  }
}

function persistActivePetId(petId: string): void {
  AsyncStorage.setItem(ACTIVE_PET_KEY, petId).catch((e) => {
    console.warn('[petStore] failed to persist active pet:', e);
  });
}

// Pure selection-restore rule: the persisted pet if it's still in the active
// list, else the oldest active pet (list is loaded oldest-first), else none.
export function resolveActivePet(pets: Pet[], preferredId: string | null): Pet | null {
  if (pets.length === 0) return null;
  return pets.find((p) => p.id === preferredId) ?? pets[0];
}

// The one anonymous form, so a caller can't drift to "the pet" / "them" / "".
// Matches what `vomitCapCopy` / `stoolCapCopy` already collapse a nameless read to,
// so routing through this helper changes those two strings by not one byte.
export const ANONYMOUS_PET_NAME = 'your pet';

// The name to display for a RECORD — an event, a dose, a document, a queued
// completion payload — resolved from the id the record itself carries, never from
// whichever pet happens to be active. A screen reached by id (`/event/[id]`, the
// multi-pet day-summary spine) or a card that outlived a pet switch is showing one
// pet's record while the store points at another, and captioning it with the active
// pet's name is a clinical mis-attribution: Sam taps Juniper's vomit and reads an AI
// cap line about Pixel.
//
// NO `activePet` RUNG — deliberately, and this is the whole point of the helper.
// `pets` holds only non-archived pets, so archiving pet A while its record is on the
// stack makes this `find` miss; an `?? activePet?.name` fallback then names whichever
// pet is CURRENTLY active, which is the exact mis-attribution the lookup exists to
// prevent. A miss falls straight through to the anonymous form — an unnamed sentence
// is recoverable, a confidently wrong name is not. (The rule was written down at
// length on `app/vet-document/[id].tsx` by the rls-privacy-reviewer in VF-6; this is
// that rule as one predicate instead of six hand-rolled finds with three different
// fallback ladders.)
//
// A BLANK name counts as a miss. Callers interpolate this straight into a sentence
// ("How much did {name} eat?"), and an empty string renders that sentence with a hole
// in it — worse than the anonymous form and harder to spot in review than a wrong
// name. The cap-copy helpers already made this call (`petName?.trim() || 'your pet'`);
// making it here means no caller has to.
export function resolveRecordPetName(
  pets: Pet[],
  petId: string | null | undefined,
): string {
  if (!petId) return ANONYMOUS_PET_NAME;
  return pets.find((p) => p.id === petId)?.name?.trim() || ANONYMOUS_PET_NAME;
}

// Display ordering for per-pet surfaces (multi-pet spec §3.4): the active pet
// leads, the rest keep store (oldest-first) order. Generic so view shapes that
// only carry {id} can use it too.
export function orderPetsActiveFirst<T extends { id: string }>(
  pets: T[],
  activePetId: string | null,
): T[] {
  if (!activePetId) return pets;
  const active = pets.find((p) => p.id === activePetId);
  if (!active) return pets;
  return [active, ...pets.filter((p) => p.id !== activePetId)];
}

interface PetState {
  pets: Pet[];
  activePet: Pet | null;
  isOnboarded: boolean;
  /** Replace the active-pet list (oldest-first) and resolve the selection against it. */
  setPets: (pets: Pet[], preferredId?: string | null) => void;
  /** Switch the active pet by id; persists the device-local selection. */
  selectPet: (petId: string) => void;
  /** Add a newly created pet to the list, optionally making it active. */
  addPet: (pet: Pet, options?: { select?: boolean }) => void;
  /** Patch the active pet (and its row in the list). */
  updatePet: (updates: Partial<Pet>) => void;
  /** Drop a pet from the active list (archive); falls back the selection if it was active. */
  removePet: (petId: string) => void;
  setOnboarded: (onboarded: boolean) => void;
  /** Wipe all pet state. Sign-out only — pairs with clearPersistedActivePetId(). */
  reset: () => void;
}

export const usePetStore = create<PetState>((set, get) => ({
  pets: [],
  activePet: null,
  isOnboarded: false,
  // INVARIANT: `pets` holds only NON-archived pets. Every loader filters
  // `is_active = true` (usePet) and archiving calls removePet, so an archived pet
  // never enters the list. The cross-pet safety banner (multi-pet §4) relies on
  // this — it treats every pet in the list as banner-eligible, so an archived pet
  // leaking in here would wrongly raise a banner. Keep archived pets out of `pets`.
  setPets: (pets, preferredId = null) =>
    set((state) => ({
      pets,
      activePet: resolveActivePet(pets, preferredId ?? state.activePet?.id ?? null),
    })),
  selectPet: (petId) => {
    const pet = get().pets.find((p) => p.id === petId);
    if (!pet) return;
    persistActivePetId(pet.id);
    set({ activePet: pet });
  },
  addPet: (pet, options) => {
    if (options?.select) persistActivePetId(pet.id);
    set((state) => ({
      pets: [...state.pets.filter((p) => p.id !== pet.id), pet],
      // On an empty store the first pet becomes active even without `select`,
      // deliberately un-persisted: the launch fallback (oldest active pet)
      // reproduces the same selection, so nothing is lost on restart.
      activePet: options?.select ? pet : state.activePet ?? pet,
    }));
  },
  updatePet: (updates) =>
    set((state) => {
      if (!state.activePet) return state;
      const activePet = { ...state.activePet, ...updates };
      return {
        activePet,
        pets: state.pets.map((p) => (p.id === activePet.id ? activePet : p)),
      };
    }),
  removePet: (petId) =>
    set((state) => {
      const pets = state.pets.filter((p) => p.id !== petId);
      // If the archived pet was active, fall back to the oldest remaining
      // active pet (spec §3.5) — the same rule the launch restore applies.
      // The persisted selection is deliberately NOT rewritten: a stale
      // persisted id resolves to the identical oldest-active fallback on the
      // next launch, and the next explicit switch overwrites it anyway.
      return {
        pets,
        activePet: resolveActivePet(pets, state.activePet?.id ?? null),
      };
    }),
  setOnboarded: (isOnboarded) => set({ isOnboarded }),
  reset: () => set({ pets: [], activePet: null, isOnboarded: false }),
}));
