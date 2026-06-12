import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Pet {
  id: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed: string | null;
  date_of_birth: string | null;
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
