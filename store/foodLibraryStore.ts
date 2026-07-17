import { create } from 'zustand';

// A tiny change-signal for the food library (B-005 PR 2). The Foods tab and the
// food picker read the library from SQLite on focus, so a mutation made while
// they're mounted-but-unfocused — or an Undo fired from the root snackbar while
// the Foods tab IS focused (no re-focus event to trigger a reload) — would leave
// their list stale. Screens that display the library subscribe to `version` and
// reload when it changes; any write that adds/hides/restores a food calls
// notifyChanged().
//
// It carries no data — just a monotonically increasing counter — so it can't
// drift from the real source of truth (the cache); it only says "re-read".
interface FoodLibraryState {
  version: number;
  notifyChanged: () => void;
}

export const useFoodLibraryStore = create<FoodLibraryState>((set) => ({
  version: 0,
  notifyChanged: () => set((s) => ({ version: s.version + 1 })),
}));
