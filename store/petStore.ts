import { create } from 'zustand';

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

interface PetState {
  activePet: Pet | null;
  isOnboarded: boolean;
  setActivePet: (pet: Pet | null) => void;
  setOnboarded: (onboarded: boolean) => void;
}

export const usePetStore = create<PetState>((set) => ({
  activePet: null,
  isOnboarded: false,
  setActivePet: (activePet) => set({ activePet }),
  setOnboarded: (isOnboarded) => set({ isOnboarded }),
}));
