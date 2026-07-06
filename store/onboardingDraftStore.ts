import { create } from 'zustand';

// A transient, in-memory draft of the two REQUIRED pet-setup entries (type +
// name) — the single source of truth across the type → name steps (B-251 PR 7).
// It exists so both values survive back-THEN-forward navigation: backing up from
// the name step to change the type re-mounts a fresh name screen, which would
// otherwise drop the typed name (code-review, PR 7). Holding the draft here keeps
// the "back preserves entered values" AC true in both directions.
//
// Deliberately NOT persisted (no AsyncStorage): a fresh app launch or a brand-new
// onboarding starts blank. Reset on sign-out via wipeLocalSession (FR-9 parity)
// so a name typed under one account can't carry into a different account's
// onboarding within the same session. It is not reset at pet creation — once the
// pet exists the owner is onboarded and never re-enters these screens, so the
// lingering draft is unread until the next sign-out clears it.
export type OnboardingSpecies = 'cat' | 'dog';

interface OnboardingDraftState {
  species: OnboardingSpecies | null;
  name: string;
  setSpecies: (species: OnboardingSpecies) => void;
  setName: (name: string) => void;
  reset: () => void;
}

export const useOnboardingDraftStore = create<OnboardingDraftState>((set) => ({
  species: null,
  name: '',
  setSpecies: (species) => set({ species }),
  setName: (name) => set({ name }),
  reset: () => set({ species: null, name: '' }),
}));
